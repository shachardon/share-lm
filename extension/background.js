// background.js
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
    ].join("\n"),
};

const requestQueue = [];
let isProcessing = false;

function enqueueStorageUpdate(updateFunction) {
    return new Promise((resolve, reject) => {
        requestQueue.push({ updateFunction, resolve, reject });
        processQueue();
    });
}

function processQueue() {
    if (isProcessing || requestQueue.length === 0) return;

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

function handleRuntimeMessages() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === "update_local_db_ids") {
            enqueueStorageUpdate(async () => {
                if (!request.id_to_add || !request.conversation) {
                    return { ok: false, error: "missing conversation payload" };
                }

                let local_db_ids = (await getFromStorage("local_db_ids")) || [];
                const existingConversation = await getFromStorage(request.id_to_add);
                const storedConversation = await buildStoredConversation(
                    request.id_to_add,
                    request.conversation,
                    existingConversation
                );

                if (!local_db_ids.includes(request.id_to_add)) {
                    local_db_ids = [...local_db_ids, request.id_to_add];
                    await saveToStorage("local_db_ids", local_db_ids);
                }

                await saveToStorage(request.id_to_add, storedConversation);
                return { ok: true, conversation_id: request.id_to_add, conversation: storedConversation };
            }).then(sendResponse).catch((error) => {
                console.error("Failed to update local archive", error);
                sendResponse({ ok: false, error: String(error) });
            });
            return true;
        } else if (request.type === "publish") {
            removeInvalidAndPostToDb(false).then(sendResponse).catch((error) => {
                console.error("Manual publish failed", error);
                sendResponse({ ok: false, error: String(error) });
            });
            return true;
        } else if (request.type === "update_conversation_privacy") {
            enqueueStorageUpdate(async () => {
                const conversation = await getFromStorage(request.conversation_id);
                if (!conversation) {
                    return { ok: false, error: "conversation not found" };
                }
                if (conversation.published_at) {
                    conversation.publish_state = "shared";
                } else if (request.publish_state) {
                    conversation.publish_state = request.publish_state;
                }
                conversation.updated_at = new Date().toISOString();
                await saveToStorage(request.conversation_id, conversation);
                return { ok: true, conversation };
            }).then(sendResponse).catch((error) => {
                sendResponse({ ok: false, error: String(error) });
            });
            return true;
        } else if (request.type === "get_privacy_settings") {
            getPrivacySettings().then((privacy_settings) => sendResponse({ ok: true, privacy_settings })).catch((error) => {
                sendResponse({ ok: false, error: String(error) });
            });
            return true;
        } else if (request.type === "save_privacy_settings") {
            const normalized = normalizePrivacySettings(request.privacy_settings || {});
            saveToStorage("privacy_settings", normalized).then(() => {
                sendResponse({ ok: true, privacy_settings: normalized });
            }).catch((error) => {
                sendResponse({ ok: false, error: String(error) });
            });
            return true;
        }
        return false;
    });
}

async function buildStoredConversation(conversation_id, incomingConversation, existingConversation) {
    const privacySettings = await getPrivacySettings();
    const now = new Date().toISOString();
    let publish_state;

    if (existingConversation && existingConversation.published_at) {
        publish_state = "shared";
    } else if (existingConversation && existingConversation.publish_state) {
        publish_state = existingConversation.publish_state;
    } else {
        publish_state = privacySettings.require_manual_review ? "needs_review" : "approved";
    }

    return {
        ...incomingConversation,
        created_at: (existingConversation && existingConversation.created_at) || incomingConversation.timestamp || now,
        updated_at: now,
        publish_state,
        published_at: (existingConversation && existingConversation.published_at) || null,
        shared_user_id: (existingConversation && existingConversation.shared_user_id) || null,
    };
}

async function sendConversation(conversation_id, conversation) {
    try {
        const data = await buildPublishPayload(conversation_id, conversation);
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });
        if (!response.ok) {
            throw new Error("Network response was not ok");
        }
        await response.json();
        await safeIncrementMessagesCounter((data.user_msgs || []).length);
        return true;
    } catch (error) {
        console.error("Error:", error);
        return false;
    }
}

async function buildPublishPayload(conversation_id, conversation) {
    const privacySettings = await getPrivacySettings();
    let conversation_metadata = {};
    if ("ratings" in conversation) {
        conversation_metadata["message_ratings"] = conversation.ratings;
    }
    const rate = await getFromStorage("rate_" + conversation_id);
    if (rate !== null) {
        conversation_metadata["rate"] = rate;
    }

    let user_id = await getFromStorage("user_id");
    if (user_id === null) {
        user_id = uuidv4();
        await saveToStorage("user_id", user_id);
    }
    let user_metadata = (await getFromStorage("user_metadata")) ?? {};

    const sanitizedConversation = privacySettings.enable_redaction
        ? applyRedactionsToConversation(conversation, privacySettings.regex_rules_text)
        : { conversation: deepClone(conversation), summary: { total_matches: 0, matches_by_rule: [] } };

    if (privacySettings.enable_redaction) {
        conversation_metadata["redaction_summary"] = sanitizedConversation.summary;
    }

    let shared_user_id = user_id;
    if (privacySettings.unlink_shared_ids) {
        shared_user_id = conversation.shared_user_id || uuidv4();
        if (shared_user_id !== conversation.shared_user_id) {
            conversation.shared_user_id = shared_user_id;
            await saveToStorage(conversation_id, conversation);
        }
        conversation_metadata["shared_user_id_mode"] = "per_conversation";
    } else {
        conversation_metadata["shared_user_id_mode"] = "stable";
    }

    return {
        conversation_id,
        bot_msgs: sanitizedConversation.conversation.bot_msgs || [],
        user_msgs: sanitizedConversation.conversation.user_msgs || [],
        page_url: sanitizePageUrl(sanitizedConversation.conversation.page_url),
        user_id: shared_user_id,
        user_metadata: {
            ...user_metadata,
            sharelm_privacy_mode: describePrivacyMode(privacySettings),
        },
        timestamp: sanitizedConversation.conversation.timestamp,
        conversation_metadata,
    };
}

function describePrivacyMode(privacySettings) {
    return (privacySettings.require_manual_review || privacySettings.enable_redaction || privacySettings.unlink_shared_ids)
        ? "advanced"
        : "standard";
}

async function removeInvalidAndPostToDb(checkInterval = true) {
    console.log("removeInvalidAndPostToDb()");
    const currentTime = new Date();
    const local_db_ids = (await getFromStorage("local_db_ids")) || [];
    let published_count = 0;
    let skipped_count = 0;

    for (const conversationId of [...local_db_ids]) {
        const conversation = await getFromStorage(conversationId);
        if (conversation === null) {
            const nextIds = local_db_ids.filter((item) => item !== conversationId);
            await saveToStorage("local_db_ids", nextIds);
            continue;
        }
        if (conversation.published_at) {
            skipped_count += 1;
            continue;
        }
        const publish_state = conversation.publish_state || "approved";
        if (publish_state !== "approved") {
            skipped_count += 1;
            continue;
        }
        if (checkInterval && !isTimestampOlderThanXHours(conversation.timestamp, currentTime, 24)) {
            skipped_count += 1;
            continue;
        }
        const success = await sendConversation(conversationId, conversation);
        if (success) {
            conversation.published_at = new Date().toISOString();
            conversation.publish_state = "shared";
            conversation.updated_at = conversation.published_at;
            await saveToStorage(conversationId, conversation);
            published_count += 1;
        }
    }

    return { ok: true, published_count, skipped_count, total_local_conversations: local_db_ids.length };
}

function applyRedactionsToConversation(conversation, rulesText) {
    const clonedConversation = deepClone(conversation);
    const rules = parseRedactionRules(rulesText);
    const summary = { total_matches: 0, matches_by_rule: [] };

    const applyToValue = (value) => {
        if (typeof value !== "string") {
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
    clonedConversation.page_url = applyToValue(clonedConversation.page_url || "");

    if (Array.isArray(clonedConversation.canvas_snapshots)) {
        clonedConversation.canvas_snapshots = clonedConversation.canvas_snapshots.map((snapshot) => ({
            ...snapshot,
            data: snapshot.data ? {
                ...snapshot.data,
                textContent: applyToValue(snapshot.data.textContent || ""),
                htmlContent: applyToValue(snapshot.data.htmlContent || ""),
                displayTitle: applyToValue(snapshot.data.displayTitle || ""),
            } : snapshot.data,
        }));
    }

    if (Array.isArray(clonedConversation.conversation_timeline)) {
        clonedConversation.conversation_timeline = clonedConversation.conversation_timeline.map((item) => {
            if (typeof item.content === "string") {
                return { ...item, content: applyToValue(item.content) };
            }
            if (item.content && typeof item.content === "object") {
                return {
                    ...item,
                    content: {
                        ...item.content,
                        title: applyToValue(item.content.title || ""),
                        textContent: applyToValue(item.content.textContent || ""),
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
    const lines = (rulesText || "").split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
    return lines.map((line, index) => {
        const separatorIndex = line.indexOf("=>");
        if (separatorIndex === -1) {
            return null;
        }
        const patternText = line.slice(0, separatorIndex).trim();
        const replacement = line.slice(separatorIndex + 2).trim();
        try {
            return { name: `rule_${index + 1}`, regex: new RegExp(patternText, "g"), replacement };
        } catch (error) {
            console.warn("Skipping invalid redaction rule", line, error);
            return null;
        }
    }).filter(Boolean);
}

function redactString(value, rules) {
    let nextValue = value;
    let totalMatches = 0;
    const matchesByRule = [];
    for (const rule of rules) {
        const matches = nextValue.match(rule.regex);
        if (!matches || matches.length === 0) continue;
        totalMatches += matches.length;
        matchesByRule.push({ name: rule.name, count: matches.length });
        nextValue = nextValue.replace(rule.regex, rule.replacement);
    }
    return { value: nextValue, totalMatches, matchesByRule };
}

function sanitizePageUrl(pageUrl) {
    if (!pageUrl) return pageUrl;
    try {
        const url = new URL(pageUrl);
        url.search = "";
        url.hash = "";
        return url.toString();
    } catch (error) {
        return pageUrl.split("?")[0].split("#")[0];
    }
}

function normalizePrivacySettings(privacySettings) {
    return {
        require_manual_review: privacySettings.require_manual_review ?? DEFAULT_PRIVACY_SETTINGS.require_manual_review,
        enable_redaction: privacySettings.enable_redaction ?? DEFAULT_PRIVACY_SETTINGS.enable_redaction,
        unlink_shared_ids: privacySettings.unlink_shared_ids ?? DEFAULT_PRIVACY_SETTINGS.unlink_shared_ids,
        regex_rules_text: privacySettings.regex_rules_text || DEFAULT_PRIVACY_SETTINGS.regex_rules_text,
    };
}

async function getPrivacySettings() {
    const stored = await getFromStorage("privacy_settings");
    return normalizePrivacySettings(stored || {});
}

function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}

function changeIcon(activate) {
    let iconPath;
    if (activate) {
        iconPath = {
            "16": "assets/icons/icon16.png",
            "32": "assets/icons/icon32.png",
            "48": "assets/icons/icon48.png",
            "128": "assets/icons/icon128.png"
        };
    } else {
        iconPath = {
            "16": "assets/icons/icon16_non_active.png",
            "32": "assets/icons/icon32_non_active.png",
            "48": "assets/icons/icon48.png",
            "128": "assets/icons/icon128.png"
        };
    }
    chrome.action.setIcon({ path: iconPath });
}

function handleIconStatus(tabId) {
    chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError) {
            return;
        }
        chrome.tabs.sendMessage(tab.id, { type: "gradio?" }, function(response) {
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
        chrome.tabs.sendMessage(tab.id, { type: "update?" }, function() {});
    });
}

function isTimestampOlderThanXHours(timestamp, currentTimeToCheck, numHours) {
    const HoursInMillis = 60 * 60 * 1000 * numHours;
    return (new Date(currentTimeToCheck) - new Date(timestamp)) > HoursInMillis;
}

const toPromise = (callback) => {
    return new Promise((resolve, reject) => {
        try {
            callback(resolve, reject);
        }
        catch (err) {
            reject(err);
        }
    });
}

function saveToStorage(field, value) {
    return toPromise((resolve, reject) => {
        const dataToSave = {};
        dataToSave[field] = value;
        chrome.storage.local.set(dataToSave, function () {
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
            if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
            else if (Object.prototype.hasOwnProperty.call(result, field)) resolve(result[field]);
            else resolve(null);
        });
    });
}

function safeIncrementMessagesCounter(messageCount) {
    return enqueueStorageUpdate(async () => {
        const messages_counter_from_storage = await getFromStorage("messages_counter_from_storage");
        let updated_messages_counter = messages_counter_from_storage ? messages_counter_from_storage + messageCount : messageCount;
        await saveToStorage("messages_counter_from_storage", updated_messages_counter);
        return updated_messages_counter;
    });
}

function uuidv4() {
    return '00-0-4-1-000'.replace(/[^-]/g,
        s => ((Math.random() + ~~s) * 0x10000 >> s).toString(16).padStart(4, '0')
    );
}
