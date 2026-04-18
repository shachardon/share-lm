const API_URL = "https://share-lm-4e25a5769ac0.herokuapp.com/api/endpoint";

const DEFAULT_PRIVACY_SETTINGS = {
  require_manual_review: true,
  enable_redaction: true,
  unlink_shared_ids: true,
  regex_rules_text: [
    String.raw`\b(?:\d{1,3}\.){3}\d{1,3}\b => [REDACTED_IP]`,
    String.raw`[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,} => [REDACTED_EMAIL]`,
    String.raw`\b(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}\b => [REDACTED_MAC]`,
    String.raw`\b[0-9A-Fa-f]{8}-(?:[0-9A-Fa-f]{4}-){3}[0-9A-Fa-f]{12}\b => [REDACTED_UUID]`,
    String.raw`(?:(?:[A-Za-z]:)?(?:\\|/)[^\s"']+) => [REDACTED_PATH]`,
  ].join('\n'),
};

const requestQueue = [];
let isProcessing = false;

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete') {
    handleIconStatus(tabId);
    updateSharingStatus(tabId);
  }
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  handleIconStatus(activeInfo.tabId);
  updateSharingStatus(activeInfo.tabId);
});

const MinInMillis = 60 * 1000;
setInterval(() => {
  removeInvalidAndPostToDb(true).catch((error) => {
    console.error('Scheduled publish failed', error);
  });
}, 5 * MinInMillis);

handleRuntimeMessages();

function enqueueStorageUpdate(updateFunction) {
  return new Promise((resolve, reject) => {
    requestQueue.push({ updateFunction, resolve, reject });
    processQueue();
  });
}

function processQueue() {
  if (isProcessing || requestQueue.length === 0) {
    return;
  }

  isProcessing = true;
  const { updateFunction, resolve, reject } = requestQueue.shift();

  Promise.resolve()
    .then(updateFunction)
    .then((result) => {
      resolve(result);
      isProcessing = false;
      processQueue();
    })
    .catch((error) => {
      reject(error);
      isProcessing = false;
      processQueue();
    });
}

function handleRuntimeMessages() {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'update_local_db_ids') {
      enqueueStorageUpdate(async () => {
        if (!request.id_to_add || !request.conversation) {
          return { ok: false, error: 'missing conversation payload' };
        }

        let localDbIds = (await getFromStorage('local_db_ids')) || [];
        const existingConversation = await getFromStorage(request.id_to_add);
        const storedConversation = await buildStoredConversation(
          request.id_to_add,
          request.conversation,
          existingConversation
        );

        if (!localDbIds.includes(request.id_to_add)) {
          localDbIds = [...localDbIds, request.id_to_add];
          await saveToStorage('local_db_ids', localDbIds);
        }

        await saveToStorage(request.id_to_add, storedConversation);

        return {
          ok: true,
          request_type: 'add',
          conversation_id: request.id_to_add,
          conversation: storedConversation,
        };
      })
        .then(sendResponse)
        .catch((error) => {
          console.error('Failed to update local archive', error);
          sendResponse({ ok: false, error: String(error) });
        });
      return true;
    }

    if (request.type === 'publish') {
      removeInvalidAndPostToDb(false)
        .then(sendResponse)
        .catch((error) => {
          console.error('Manual publish failed', error);
          sendResponse({ ok: false, error: String(error) });
        });
      return true;
    }

    if (request.type === 'update_conversation_privacy') {
      enqueueStorageUpdate(async () => {
        const conversation = await getFromStorage(request.conversation_id);
        if (!conversation) {
          return { ok: false, error: 'conversation not found' };
        }

        if (conversation.published_at) {
          conversation.publish_state = 'shared';
        } else if (request.publish_state) {
          conversation.publish_state = request.publish_state;
        }

        conversation.updated_at = new Date().toISOString();
        await saveToStorage(request.conversation_id, conversation);

        return { ok: true, conversation };
      })
        .then(sendResponse)
        .catch((error) => {
          console.error('Failed to update conversation privacy', error);
          sendResponse({ ok: false, error: String(error) });
        });
      return true;
    }

    if (request.type === 'get_privacy_settings') {
      getPrivacySettings()
        .then((privacySettings) => sendResponse({ ok: true, privacy_settings: privacySettings }))
        .catch((error) => sendResponse({ ok: false, error: String(error) }));
      return true;
    }

    if (request.type === 'save_privacy_settings') {
      const normalized = normalizePrivacySettings(request.privacy_settings || {});
      saveToStorage('privacy_settings', normalized)
        .then(() => sendResponse({ ok: true, privacy_settings: normalized }))
        .catch((error) => sendResponse({ ok: false, error: String(error) }));
      return true;
    }

    return false;
  });
}

async function buildStoredConversation(conversationId, incomingConversation, existingConversation) {
  const privacySettings = await getPrivacySettings();
  const shouldShareState = await getFromStorage('shouldShare');
  const shouldShare = shouldShareState === null ? true : Boolean(shouldShareState.shouldShare);
  const now = new Date().toISOString();

  let publishState;
  if (existingConversation && existingConversation.published_at) {
    publishState = 'shared';
  } else if (existingConversation && existingConversation.publish_state) {
    publishState = existingConversation.publish_state;
  } else if (!shouldShare) {
    publishState = 'blocked';
  } else {
    publishState = privacySettings.require_manual_review ? 'needs_review' : 'approved';
  }

  return {
    ...incomingConversation,
    created_at: existingConversation?.created_at || incomingConversation.timestamp || now,
    updated_at: now,
    publish_state: publishState,
    published_at: existingConversation?.published_at || null,
    shared_user_id: existingConversation?.shared_user_id || null,
  };
}

async function removeInvalidAndPostToDb(checkInterval = true) {
  const currentTime = new Date();
  const localDbIds = (await getFromStorage('local_db_ids')) || [];
  let publishedCount = 0;
  let skippedCount = 0;

  for (const conversationId of [...localDbIds]) {
    const conversation = await getFromStorage(conversationId);

    if (!conversation) {
      const nextIds = localDbIds.filter((item) => item !== conversationId);
      await saveToStorage('local_db_ids', nextIds);
      continue;
    }

    if (conversation.published_at) {
      skippedCount += 1;
      continue;
    }

    const publishState = conversation.publish_state || 'approved';
    if (publishState !== 'approved') {
      skippedCount += 1;
      continue;
    }

    if (checkInterval && !isTimestampOlderThanXHours(conversation.timestamp, currentTime, 24)) {
      skippedCount += 1;
      continue;
    }

    const success = await sendConversation(conversationId, conversation);
    if (success) {
      conversation.published_at = new Date().toISOString();
      conversation.publish_state = 'shared';
      conversation.updated_at = conversation.published_at;
      await saveToStorage(conversationId, conversation);
      publishedCount += 1;
    }
  }

  return {
    ok: true,
    published_count: publishedCount,
    skipped_count: skippedCount,
    total_local_conversations: localDbIds.length,
  };
}

async function sendConversation(conversationId, conversation) {
  try {
    const payload = await buildPublishPayload(conversationId, conversation);
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Network response was not ok (${response.status})`);
    }

    await response.json();
    const messageCount = Array.isArray(payload.user_msgs) ? payload.user_msgs.length : 0;
    await safeIncrementMessagesCounter(messageCount);
    return true;
  } catch (error) {
    console.error('Error sending conversation:', error);
    return false;
  }
}

async function buildPublishPayload(conversationId, conversation) {
  const privacySettings = await getPrivacySettings();
  let userId = await getFromStorage('user_id');
  if (userId === null) {
    userId = uuidv4();
    await saveToStorage('user_id', userId);
  }

  const userMetadata = (await getFromStorage('user_metadata')) || {};
  const conversationMetadata = {};

  if ('ratings' in conversation) {
    conversationMetadata.message_ratings = conversation.ratings;
  }

  const rate = await getFromStorage(`rate_${conversationId}`);
  if (rate !== null) {
    conversationMetadata.rate = rate;
  }

  const sanitizedConversation = privacySettings.enable_redaction
    ? applyRedactionsToConversation(conversation, privacySettings.regex_rules_text)
    : { conversation: deepClone(conversation), summary: { total_matches: 0, matches_by_rule: [] } };

  if (privacySettings.enable_redaction) {
    conversationMetadata.redaction_summary = sanitizedConversation.summary;
  }

  let sharedUserId = userId;
  if (privacySettings.unlink_shared_ids) {
    sharedUserId = conversation.shared_user_id || uuidv4();
    if (sharedUserId !== conversation.shared_user_id) {
      conversation.shared_user_id = sharedUserId;
      await saveToStorage(conversationId, conversation);
    }
    conversationMetadata.shared_user_id_mode = 'per_conversation';
  } else {
    conversationMetadata.shared_user_id_mode = 'stable';
  }

  return {
    conversation_id: conversationId,
    bot_msgs: sanitizedConversation.conversation.bot_msgs || [],
    user_msgs: sanitizedConversation.conversation.user_msgs || [],
    page_url: sanitizePageUrl(sanitizedConversation.conversation.page_url),
    user_id: sharedUserId,
    user_metadata: {
      ...userMetadata,
      sharelm_privacy_mode: describePrivacyMode(privacySettings),
    },
    timestamp: sanitizedConversation.conversation.timestamp,
    conversation_metadata: conversationMetadata,
  };
}

function describePrivacyMode(privacySettings) {
  if (
    privacySettings.require_manual_review ||
    privacySettings.enable_redaction ||
    privacySettings.unlink_shared_ids
  ) {
    return 'advanced';
  }
  return 'standard';
}

function applyRedactionsToConversation(conversation, rulesText) {
  const clonedConversation = deepClone(conversation);
  const rules = parseRedactionRules(rulesText);
  const summary = {
    total_matches: 0,
    matches_by_rule: [],
  };

  const applyToValue = (value) => {
    if (typeof value !== 'string') {
      return value;
    }
    const result = redactString(value, rules);
    summary.total_matches += result.totalMatches;
    result.matchesByRule.forEach((item) => {
      const existing = summary.matches_by_rule.find((entry) => entry.name === item.name);
      if (existing) {
        existing.count += item.count;
      } else {
        summary.matches_by_rule.push({ name: item.name, count: item.count });
      }
    });
    return result.value;
  };

  clonedConversation.user_msgs = (clonedConversation.user_msgs || []).map(applyToValue);
  clonedConversation.bot_msgs = (clonedConversation.bot_msgs || []).map(applyToValue);
  clonedConversation.page_url = applyToValue(clonedConversation.page_url || '');

  if (Array.isArray(clonedConversation.canvas_snapshots)) {
    clonedConversation.canvas_snapshots = clonedConversation.canvas_snapshots.map((snapshot) => ({
      ...snapshot,
      data: snapshot.data
        ? {
            ...snapshot.data,
            textContent: applyToValue(snapshot.data.textContent || ''),
            htmlContent: applyToValue(snapshot.data.htmlContent || ''),
            displayTitle: applyToValue(snapshot.data.displayTitle || ''),
          }
        : snapshot.data,
    }));
  }

  if (Array.isArray(clonedConversation.conversation_timeline)) {
    clonedConversation.conversation_timeline = clonedConversation.conversation_timeline.map((item) => {
      if (typeof item.content === 'string') {
        return { ...item, content: applyToValue(item.content) };
      }

      if (item.content && typeof item.content === 'object') {
        return {
          ...item,
          content: {
            ...item.content,
            title: applyToValue(item.content.title || ''),
            textContent: applyToValue(item.content.textContent || ''),
            trigger: item.content.trigger,
          },
        };
      }

      return item;
    });
  }

  return { conversation: clonedConversation, summary };
}

function parseRedactionRules(rulesText) {
  const lines = (rulesText || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  return lines
    .map((line, index) => {
      const separatorIndex = line.indexOf('=>');
      if (separatorIndex === -1) {
        return null;
      }

      const patternText = line.slice(0, separatorIndex).trim();
      const replacement = line.slice(separatorIndex + 2).trim();

      try {
        return {
          name: `rule_${index + 1}`,
          regex: new RegExp(patternText, 'g'),
          replacement,
        };
      } catch (error) {
        console.warn('Skipping invalid redaction rule', line, error);
        return null;
      }
    })
    .filter(Boolean);
}

function redactString(value, rules) {
  let nextValue = value;
  let totalMatches = 0;
  const matchesByRule = [];

  for (const rule of rules) {
    const matches = nextValue.match(rule.regex);
    if (!matches || matches.length === 0) {
      continue;
    }

    totalMatches += matches.length;
    matchesByRule.push({ name: rule.name, count: matches.length });
    nextValue = nextValue.replace(rule.regex, rule.replacement);
  }

  return { value: nextValue, totalMatches, matchesByRule };
}

function sanitizePageUrl(pageUrl) {
  if (!pageUrl) {
    return pageUrl;
  }

  try {
    const url = new URL(pageUrl);
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch (error) {
    return pageUrl.split('?')[0].split('#')[0];
  }
}

function normalizePrivacySettings(privacySettings) {
  return {
    require_manual_review:
      privacySettings.require_manual_review ?? DEFAULT_PRIVACY_SETTINGS.require_manual_review,
    enable_redaction:
      privacySettings.enable_redaction ?? DEFAULT_PRIVACY_SETTINGS.enable_redaction,
    unlink_shared_ids:
      privacySettings.unlink_shared_ids ?? DEFAULT_PRIVACY_SETTINGS.unlink_shared_ids,
    regex_rules_text:
      privacySettings.regex_rules_text || DEFAULT_PRIVACY_SETTINGS.regex_rules_text,
  };
}

async function getPrivacySettings() {
  const stored = await getFromStorage('privacy_settings');
  return normalizePrivacySettings(stored || {});
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function changeIcon(activate) {
  let iconPath;
  if (activate) {
    iconPath = {
      '16': 'assets/icons/icon16.png',
      '32': 'assets/icons/icon32.png',
      '48': 'assets/icons/icon48.png',
      '128': 'assets/icons/icon128.png'
    };
  } else {
    iconPath = {
      '16': 'assets/icons/icon16_non_active.png',
      '32': 'assets/icons/icon32_non_active.png',
      '48': 'assets/icons/icon48.png',
      '128': 'assets/icons/icon128.png'
    };
  }

  chrome.action.setIcon({ path: iconPath });
}

function handleIconStatus(tabId) {
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError) {
      return;
    }

    chrome.tabs.sendMessage(tab.id, { type: 'gradio?' }, (response) => {
      if (chrome.runtime.lastError) {
        changeIcon(false);
      } else if (response && response.gradio) {
        changeIcon(true);
      } else {
        changeIcon(false);
      }
    });
  });
}

function updateSharingStatus(tabId) {
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError) {
      return;
    }

    chrome.tabs.sendMessage(tab.id, { type: 'update?' }, () => {
      if (chrome.runtime.lastError) {
        return;
      }
    });
  });
}

function isTimestampOlderThanXHours(timestamp, currentTimeToCheck, numHours) {
  if (!timestamp) {
    return false;
  }
  const HoursInMillis = 60 * 60 * 1000 * numHours;
  return (new Date(currentTimeToCheck) - new Date(timestamp)) > HoursInMillis;
}

function toPromise(callback) {
  return new Promise((resolve, reject) => {
    try {
      callback(resolve, reject);
    } catch (err) {
      reject(err);
    }
  });
}

function saveToStorage(field, value) {
  return toPromise((resolve, reject) => {
    const dataToSave = {};
    dataToSave[field] = value;

    chrome.storage.local.set(dataToSave, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(value);
      }
    });
  });
}

function getFromStorage(field) {
  return toPromise((resolve, reject) => {
    chrome.storage.local.get([field], (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }

      if (Object.prototype.hasOwnProperty.call(result, field)) {
        resolve(result[field]);
      } else {
        resolve(null);
      }
    });
  });
}

function uuidv4() {
  return '00-0-4-1-000'.replace(/[^-]/g,
      s => ((Math.random() + ~~s) * 0x10000 >> s).toString(16).padStart(4, '0')
  );
}

function safeIncrementMessagesCounter(messageCount) {
  return enqueueStorageUpdate(async () => {
    const messagesCounterFromStorage = await getFromStorage('messages_counter_from_storage');

    let updatedMessagesCounter = 0;
    if (messagesCounterFromStorage) {
      updatedMessagesCounter = messagesCounterFromStorage + messageCount;
    } else {
      updatedMessagesCounter = messageCount;
    }

    await saveToStorage('messages_counter_from_storage', updatedMessagesCounter);
    return updatedMessagesCounter;
  });
}
