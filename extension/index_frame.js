

// Init function
function init() {

  // Init properties to store the user status
  let user_id = 0
  let user_metadata = {}
  let age_verified = false;
  let shouldShare = false;
  let local_db_ids = []; // local database to store conversations

  // Init properties to store the current conversation status
  let cur_conversation_id = 0;
  let cur_bot_msgs = [];
  let cur_user_msgs = [];


  let gradio_app;
  let chat_ui_app;
  let app;
  let init_already = false;

  // Let's find the gradio-app element
  waitForElm("body > gradio-app").then((gradio_app_from_storage) => {
    gradio_app = gradio_app_from_storage;

    // const gradio_app = document.querySelector("body > gradio-app");
    if (!gradio_app) {
      console.log("Couldn't find gradio-app.")
    } else {
      console.log("gradio-app found!", gradio_app);
      shouldShare = true;
      app = gradio_app;
    }

    if (!init_already || gradio_app) {
      init_already = true;
      getUserInfoFromStorage();
      handleDataUpdatesFromPopup();
    }

    if (gradio_app) {
      if (!age_verified) {
        console.log("age not verified - adding need verification badge");
        addNeedVerificationBadge();
      } else {
        addBadge();
      }
      setInterval(queryAndUpdateConversationsGradio, 7000);
    }

  });

  // Let's find the chat-ui-app element
  waitForElm("[class=\"contents h-full\"]").then((chat_ui_app_from_storage) => {
    chat_ui_app = chat_ui_app_from_storage;

    if (!chat_ui_app) {
      console.log("Couldn't find chat-ui-app.")
    } else {
      shouldShare = true;
      app = chat_ui_app;
      console.log("chat-ui-app found!", chat_ui_app);
    }

    if (!init_already || chat_ui_app) {
      init_already = true;
      getUserInfoFromStorage();
      handleDataUpdatesFromPopup();
    }

    if (chat_ui_app) {
      if (!age_verified) {
        console.log("age not verified - adding need verification badge");
        addNeedVerificationBadge();
      } else {
        addBadge();
      }
      setInterval(queryAndUpdateConversationsChatUI, 7000);
    }

  });


  // *********************************************** Functions ***********************************************

  // Get user info from storage or init
  function getUserInfoFromStorage() {
    console.log("getting user info from storage...");

    getFromStorage("user_id").then((user_id_from_storage) => {
      console.log("user_id_from_storage:", user_id_from_storage);
      if (user_id_from_storage === null) {
        user_id_from_storage = uuidv4();
        saveToStorage("user_id", user_id_from_storage);
      }
      user_id = user_id_from_storage;
    });
    getFromStorage("user_metadata").then((user_metadata_from_storage) => {
      console.log("user_metadata_from_storage:", user_metadata_from_storage);
      user_metadata = user_metadata_from_storage ?? {};
    });
    getFromStorage("age_verified").then((age_verified_from_storage) => {
      console.log("age_verified_from_storage:", age_verified_from_storage);
      age_verified = age_verified_from_storage ?? false;
      if (app) {
        if (age_verified) {
          addBadge();
        } else {
          addNeedVerificationBadge();
        }
      }
    });
    getFromStorage("shouldShare").then((shouldShare_from_storage) => {
      console.log("shouldShare_from_storage:", shouldShare_from_storage);
      if (shouldShare_from_storage === null) {
        shouldShare = true;
      } else {
        shouldShare = shouldShare_from_storage["shouldShare"];
      }
    });
    getFromStorage("local_db_ids").then((local_db_from_storage) => {
      console.log("local_db_from_storage:", local_db_from_storage);
      local_db_ids = local_db_from_storage ?? [];
      const lastConversationId = local_db_ids[local_db_ids.length - 1];
      if (lastConversationId) {
        getFromStorage(lastConversationId).then((conversation) => {
          if (conversation) {
            cur_conversation_id = lastConversationId;
            cur_bot_msgs = conversation.bot_msgs;
            cur_user_msgs = conversation.user_msgs;
          }
        });
      } else {
        console.log("no conversations in local storage");
      }
      // removeInvalidAndPostToDb();
    });
  }

  // Update user data from popup - Listen for messages from popup.js
  function handleDataUpdatesFromPopup() {
    chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
      if (request.type === 'userDataUpdate') {
        user_metadata = request.user_metadata;
        saveToStorage("user_metadata", user_metadata);
        console.log('UserData has been saved from popup.js');
      } else if (request.type === 'verify?') {
        sendResponse({age_verified: age_verified});
      } else if (request.type === "user_metadata?") {
        console.log("got metadata request. sending", user_metadata);
        sendResponse({user_metadata: user_metadata});
      } else if (request.type === "conversation?") {
        getFromStorage(request.conversation_id).then((conversation) => {
          sendResponse({conversation: conversation});
        });
      } else if (request.type === "termsOfUse" && app) {
        console.log("terms of use clicked");
        const floatingBadge = addTermsOfUse();
        if (app.contains(floatingBadge)) {
          console.log("floating badge already exists");
        } else {
          app.appendChild(floatingBadge);
          console.log("added floating badge");
        }
      // } else if (request.type === "publish") {
      //   console.log("publish clicked");
      //   chrome.runtime.sendMessage({type: "publish"}, function (response) {
      //       console.log("response from publish request", response);
      //   });
      //   sendResponse({msg: "got publish request"});
      } else if (request.type === "gradio?") {
        console.log("gradio? request");
        if (app) {
          console.log("app found");
          sendResponse({gradio: true});
        } else {
          sendResponse({gradio: false});
        }
      } else if (request.type === "update?") {
        getFromStorage("age_verified").then((age_verified_from_storage) => {
          if (age_verified_from_storage && app) {
            addBadge();
          }
        });
      }
    });
  }

  function addTermsOfUse() {
    let floatingBadge = document.getElementById("floating-badge");
    if (floatingBadge) {
      console.log("badge already exists");
      return floatingBadge;
    }
    floatingBadge = document.createElement("div");
    floatingBadge.innerHTML = `
    <style>
    #floating-badge {
        margin: 0;
        box-sizing: border-box;
    }
    #badge-content p:first-child {
      margin-top: 0 !important;
      padding-top: 0 !important;
    }
    #badge-content p {
        line-height: 1.5;
    }   
    body, html {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
    }
    h1 {
        margin: 0;
    }
    .age-info {
        margin-top: 20px;
        margin-bottom: 20px;
    }
    .buttons {
        justify-content: center;
        display: flex;
    }
    </style>
    <div id="floating-badge">
        <div id="badge-content">
            <h2>Consent Form</h2>
             <p>Inspired by the release of the ChatGPT, the open-source community recently began to develop
                open access models with increased transparency about their development. The next challenge
                for democratizing large language models is data.</p>
                
             <p>This extension collects the conversations you are having with open large language models
                (“chat-bots”). By using this extension, you are giving your permission to contribute your
                conversations’ content (both your side of the conversation, and the model’s) for creating an
                open-license chat-bot conversations dataset, a valuable resource for the open-source
                community. The conversations will be released with the most permissive license that is allowed
                by the specific model. This dataset will be a valuable resource for both model developers and
                researchers. Specifically, we plan to use this dataset to study and improve the nature of human-
                model interaction.</p>
             
             
             <p>The extension supports a couple of chat-bots demos, mostly within Huggingface Spaces
                (https://huggingface.co/spaces). You will see a banner on the top of the demo page indicating
                it. You can choose not to share a particular conversation by clicking the ‘do not share’ button.
                As an additional precaution, the conversations are not posted to the database immediately. You
                can see the conversations from the last 24 hours in the extension popup window and remove
                them. To stop sharing your conversations permanently, please disable or remove the extension.
                Note that removing the extension does not delete the conversations you have already made.</p>
             
             
             <p>Along with the conversation’s content, we are collecting the URL (to identify the model), GMT
                time and an anonymous user-id. Optionally, you can fill some demographic data (age, location,
                gender) and rate your satisfaction. We are not collecting any identifying metadata (such as IP
                address, local time, browser type, etc.). However, it is possible that you will be identified by the
                content of your conversations. Therefore, please avoid sharing conversations with
                Identifying/sensitive content (names, e-mail addresses, etc.), as the content of your
                conversations will be publicly released. If you accidentally shared the content of a conversation
                you prefer to keep private, please fill the contact form so we will remove it (available in the
                extension popup). You can ask to remove all your conversations at any time, but please note
                that after the dataset was already released it is very likely that someone has already
                downloaded and saved an old version of it. You are encouraged to use this form also for
                reporting conversations that are copyrighted, defamatory, threatening to others, violating of
                others&#39; privacy, or that you view as harmful if released.</p>
                
                
             <p>Please be advised that this extension is independently developed by us, and while we have put
                our best efforts into ensuring a smooth experience, it&#39;s important to note that there might be
                bugs or unforeseen issues. Your feedback is valuable to us, so please feel free to report any
                issues you may encounter.</p>
                
                
            <p>The research is conducted by Shachar Don-Yehiya, Leshem Choshen and Omri Abend at the
                Hebrew University. For more questions, please contact us at shareLM.project@gmail.com.</p>
                
                
            <p>Participation is from age 18 and over only.</p>
            
            
            <p>Participation is voluntary. Thank you for your contribution!</p>

            <div class="age-info">
                <label>
                    <input type="checkbox" id="ageVerification" name="ageVerification"> I confirm the terms. I am at least 18 years old
                </label>
            </div>
            <div class="buttons">
                <button id="submit-button" class="disable-sharing-button">Submit</button>          <button id="close-badge-button" class="disable-sharing-button">Close</button>
            </div>
            
        </div>
    </div>
    `;

    // floatingBadge.style.whiteSpace = "pre-line";
    floatingBadge.style.position = "fixed"; // Todo
    floatingBadge.style.top = "0"; // Todo
    floatingBadge.style.zIndex = "1000"; // Todo
    floatingBadge.style.background = "linear-gradient(to bottom, #Bde8b7, #d3dad5)";
    floatingBadge.style.width = "80%";
    floatingBadge.style.alignSelf = "center";
    floatingBadge.style.padding = "20px";
    // floatingBadge.style.paddingTop = "10px";
    floatingBadge.style.fontFamily = "Source Sans Pro,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI," +
        "Apple Color Emoji,Segoe UI Emoji,Segoe UI Symbol,Noto Color Emoji";
    floatingBadge.style.boxShadow = "0 2px 4px rgba(0, 0, 0, 0.1)";
    floatingBadge.style.borderRadius = "4px";
    floatingBadge.style.fontSize = "14px";
    floatingBadge.style.lineHeight = "1.5";
    const badgeContent = floatingBadge.querySelector("#badge-content > p");
    badgeContent.textContent = badgeContent.textContent.trim();
    badgeContent.style.marginTop = "0";
    badgeContent.style.paddingTop = "0";

    const submitTermsButton = floatingBadge.querySelector("#submit-button");
    const ageVerificationCheckbox = floatingBadge.querySelector("#ageVerification");

    // Submit the terms when the submit button is clicked
    submitTermsButton.disabled = !ageVerificationCheckbox.checked;
    submitTermsButton.addEventListener("click", function () {
      age_verified = ageVerificationCheckbox.checked;
      saveToStorage("age_verified", age_verified);
      if (age_verified) {
        addBadge();
      } else {
        addNeedVerificationBadge();
      }
      if (app.contains(floatingBadge)) {
        app.removeChild(floatingBadge);
      }
    });

    // Enable the submit button if the checkbox is checked, otherwise disable it
    ageVerificationCheckbox.addEventListener('change', function () {
      submitTermsButton.disabled = !ageVerificationCheckbox.checked;
    });

    // Close the floating badge when the close button is clicked
    const closeBadgeButton = floatingBadge.querySelector("#close-badge-button");
    closeBadgeButton.addEventListener("click", function () {
      app.removeChild(floatingBadge);
    });

    return floatingBadge;
  }

  function addNeedVerificationBadge() {
    const needVerificationBadge = document.getElementById("shareLM-needs-verification-badge");
    if (needVerificationBadge) {
      return;
    }
    // Remove the regular badge if it exists
    const badgeContainer = document.getElementById("shareLM-badge");
    if (badgeContainer) {
      app.parentElement.removeChild(badgeContainer);
    }
    // Create and add the need verification badge
    const container = document.createElement("div");
    container.id = "shareLM-needs-verification-badge";
    container.style.background = "linear-gradient(to right, white, #E88F8F, white)";
    container.style.width = "100%";
    container.style.textAlign = "center";
    container.style.fontFamily = "Source Sans Pro,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI," +
        "Apple Color Emoji,Segoe UI Emoji,Segoe UI Symbol,Noto Color Emoji"; // Fallback fonts included
    container.textContent = 'To activate the ShareLM plugin, please verify the terms of use.';

    // Create the floating badge
    const floatingBadge = addTermsOfUse();

    // Add the terms of use button
    const showBadgeButton = document.createElement("button");
    showBadgeButton.id = "terms-of-use-button";
    showBadgeButton.textContent = 'Terms of Use';
    showBadgeButton.classList.add('disable-sharing-button');
    showBadgeButton.style.margin = "7px";
    showBadgeButton.style.marginLeft = "20px";
    showBadgeButton.addEventListener("click", function () {
      console.log("clicked terms of use button");
      if (app.contains(floatingBadge)) {
        console.log("floating badge already exists");
      } else {
        app.appendChild(floatingBadge);
        console.log("added floating badge");
      }
    });

    container.appendChild(showBadgeButton);

    // Add the need-verification badge to the top of the iframe
    app.insertAdjacentElement("beforebegin", container);
  }


  // Add badge to the top of the iframe, to indicate we are sharing the conversation
  function addBadge() {
    console.log("adding regular badge...")
    // Remove the need verification badge if it exists
    const badgeNeedVerificationContainer = document.getElementById("shareLM-needs-verification-badge");
    if (badgeNeedVerificationContainer) {
      app.parentElement.removeChild(badgeNeedVerificationContainer);
    }

    const badgeContainer = document.getElementById("shareLM-badge");
    if (badgeContainer) {
      return;
    }

    // Create and add the badge
    const container = document.createElement("div");
    // We want to make sure we didn't miss any updates regarding the sharing status
    getFromStorage("shouldShare").then((shouldShare_from_storage) => {
      console.log("shouldShare_from_storage:", shouldShare_from_storage);
      if (shouldShare_from_storage === null) {
        shouldShare = true;
      } else {
        shouldShare = shouldShare_from_storage["shouldShare"];
      }
      container.id = "shareLM-badge";
      container.style.background = "linear-gradient(to right, white,  #Bde8b7, white)";
      container.style.width = "100%";
      container.style.textAlign = "center";
      container.style.fontFamily = "Source Sans Pro,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI," +
          "Apple Color Emoji,Segoe UI Emoji,Segoe UI Symbol,Noto Color Emoji"; // Fallback fonts included
      container.textContent = 'Your conversation is shared with the community!  💬';
      let button = document.createElement("button");
      button.id = "disable-sharing-button";
      button.textContent = 'Click here to stop sharing';
      button.classList.add('disable-sharing-button');
      button.style.fontFamily = "Source Sans Pro,ui-ssans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI," +
          "Apple Color Emoji,Segoe UI Emoji,Segoe UI Symbol,Noto Color Emoji"; // Fallback fonts included
      button.style.margin = "7px";
      button.style.marginLeft = "20px";

      if (!shouldShare) {
        container.textContent = 'Your conversation is not shared with the community ☹️';
        container.style.background = "linear-gradient(to right, white, #ECEEEB, white)";
        button.textContent = 'Click here to start sharing';
      }

      button.addEventListener("click", (event) => {
        shouldShare = !shouldShare;
        if (shouldShare) {
          container.textContent = 'Your conversation is shared with the community! 💬';
          container.style.background = "linear-gradient(to right, white,  #Bde8b7, white)";
          button.textContent = 'Click here to stop sharing';

        } else {
          container.textContent = 'Your conversation is not shared with the community ☹️';
          container.style.background = "linear-gradient(to right, white, #ECEEEB, white)";
          // container.style.background = "linear-gradient(to right, #8e928e, #ECEEEB)";
          button.textContent = 'Click here to start sharing';
        }
        container.appendChild(button);
        console.log("clicked button. shouldShare=", shouldShare);
        saveToStorage("shouldShare", {"shouldShare": shouldShare});
      });

      chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
        if (request.type === "update?") {
          console.log("update? request");
          getFromStorage("shouldShare").then((shouldShare_from_storage) => {
            if (shouldShare_from_storage !== null) {
              shouldShare = shouldShare_from_storage["shouldShare"];
            }
            if (shouldShare) {
              container.textContent = 'Your conversation is shared with the community! 💬';
              container.style.background = "linear-gradient(to right, white,  #Bde8b7, white)";
              button.textContent = 'Click here to stop sharing';

            } else {
              container.textContent = 'Your conversation is not shared with the community ☹️';
              container.style.background = "linear-gradient(to right, white, #ECEEEB, white)";
              button.textContent = 'Click here to start sharing';
            }
            container.appendChild(button);
          });
          sendResponse({shouldShare: shouldShare});
        }
      });

      container.appendChild(button);
      app.insertAdjacentElement("beforebegin", container);
      console.log("inserted badge");
    });
  }

// Function to check if the conversation has changed
  function checkConversationStatus(new_bot_msgs, new_user_msgs) {
    console.log("checking conversation...");
    let new_conversation = false;
    let need_update = false;
    if (cur_bot_msgs.length < new_bot_msgs.length) {
      need_update = true;
      // Verify if the new conversation is a continuation of the previous one
      for (let i = 0; i < cur_bot_msgs.length; i++) {
        if (cur_bot_msgs[i] !== new_bot_msgs[i]) {
          new_conversation = true;
          break;
        }
      }

    } else if (cur_bot_msgs.length > new_bot_msgs.length) {
      new_conversation = true;
      need_update = true;
    } else {
      // Same length
      for (let i = 0; i < cur_bot_msgs.length; i++) {
        if (cur_bot_msgs[i] !== new_bot_msgs[i]) {
          need_update = true;
          if (i < cur_bot_msgs.length - 1 || cur_user_msgs[i] !== new_user_msgs[i]) { // if this is only the last message that changed, it's not a new conversation
            new_conversation = true;
          }
          break;
        }
      }
    }

    return [new_conversation, need_update];
  }

  // Function to handle the newly received messages
  function checkInConversation(new_bot_msgs, new_user_msgs) {
    let [new_conversation, need_update] = checkConversationStatus(new_bot_msgs, new_user_msgs);

    if (new_conversation) {
      // Do not use old conversation id
      cur_conversation_id = 0;
    }
    if (need_update) {
      // Update messages
      cur_bot_msgs = new_bot_msgs;
      cur_user_msgs = new_user_msgs;
      if (new_user_msgs.length > 0) {
        saveCurConversationToLocalStorage();
        // sendConversation();
      }
    }
  }

  // Function to save the conversation to local storage
  function saveCurConversationToLocalStorage() {
    console.log("saving conversation to local storage...");
    if (cur_conversation_id === 0) {
      cur_conversation_id = uuidv4();
    }
    const data_short = {
      bot_msgs: cur_bot_msgs,
      user_msgs: cur_user_msgs,
      page_url: window.location.href,
      timestamp: new Date().toJSON(),
    };
    console.log("data_short:", data_short);

    // ask background to add the conversation
    console.log("Asking background to add conversation");
    chrome.runtime.sendMessage({
      type: "update_local_db_ids",
      id_to_add: cur_conversation_id,
      conversation: data_short
    }, function (response) {
      console.log(response);
    });
  }


  // Function to update the conversation
  function queryAndUpdateConversationsGradio() {
    queryAndUpdateConversations("[data-testid=\"user\"]", "[data-testid=\"bot\"]");
  }

  function queryAndUpdateConversationsChatUI() {
    const org_chat_ui_user_selector = "[class=\"max-w-full whitespace-break-spaces break-words rounded-2xl px-5 py-3.5 text-gray-500 dark:text-gray-400\"]";
    waitForElms(org_chat_ui_user_selector).then((elements_found) => {
      if (!elements_found || elements_found.length === 0) {
        console.log("Couldn't find the user messages. Trying the new selector")
        // try the new selector
        // queryAndUpdateConversations('.scrollbar-custom.mr-1.h-full.overflow-y-auto .text-gray-500',
        //     '.scrollbar-custom.mr-1.h-full.overflow-y-auto .text-gray-600');
      queryAndUpdateConversations("[class=\"disabled w-full appearance-none whitespace-break-spaces text-wrap break-words bg-inherit px-5 py-3.5 text-gray-500 dark:text-gray-400\"]",
          "[class=\"prose max-w-none max-sm:prose-sm dark:prose-invert prose-headings:font-semibold prose-h1:text-lg prose-h2:text-base prose-h3:text-base prose-pre:bg-gray-800 dark:prose-pre:bg-gray-900\"]");
      } else {
        queryAndUpdateConversations(org_chat_ui_user_selector,
            "[class=\"prose max-w-none dark:prose-invert max-sm:prose-sm prose-headings:font-semibold prose-h1:text-lg prose-h2:text-base prose-h3:text-base prose-pre:bg-gray-800 dark:prose-pre:bg-gray-900\"]");
      }
    });
  }

  function queryAndUpdateConversations(user_selector, bot_selector) {
    if (!shouldShare || !age_verified) {
      console.log("Sharing is disables, not updating conversation");
      return;
    }
    // Get the messages
    waitForElms(user_selector).then((user) => {
      const new_user_msgs = [];
      for (let i = 0; i < user.length; i++) {
        new_user_msgs.push(user[i].textContent);
      }

      waitForElms(bot_selector).then((bot) => {
        const new_bot_msgs = [];
        for (let i = 0; i < bot.length; i++) {
          new_bot_msgs.push(bot[i].textContent);
        }

        // Check if the conversation has changed, if so, send it to the server
        checkInConversation(new_bot_msgs, new_user_msgs);
      });

    });
  }
}


function waitForElm(selector) {
  return new Promise(resolve => {
    if (document.querySelector(selector)) {
      return resolve(document.querySelector(selector));
    }

    const observer = new MutationObserver(mutations => {
      if (document.querySelector(selector)) {
        resolve(document.querySelector(selector));
        observer.disconnect();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  });
}

function waitForElms(selector) {
  return new Promise(resolve => {
    if (document.querySelectorAll(selector)) {
      return resolve(document.querySelectorAll(selector));
    }

    const observer = new MutationObserver(mutations => {
      if (document.querySelectorAll(selector)) {
        resolve(document.querySelectorAll(selector));
        observer.disconnect();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  });
}

const toPromise = (callback) => {
  const promise = new Promise((resolve, reject) => {
    try {
      callback(resolve, reject);
    }
    catch (err) {
      reject(err);
    }
  });
  return promise;
}

function uuidv4() {
  return '00-0-4-1-000'.replace(/[^-]/g,
      s => ((Math.random() + ~~s) * 0x10000 >> s).toString(16).padStart(4, '0')
  );
}

function saveToStorage(field, value) {
  const dataToSave = {};
  dataToSave[field] = value; // Construct the object with the dynamic key.

  chrome.storage.local.set(dataToSave, function () {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError);
    } else {
      console.log(field, " saved");
    }
  });
}


function getFromStorage(field) {
  const promise = toPromise((resolve, reject) => {
    chrome.storage.local.get([field], (result) => {
      if (chrome.runtime.lastError)
        reject(chrome.runtime.lastError);

      if (result[field]) {
        resolve(result[field]);
        console.log("got ", field, " from storage")
      } else {
        resolve(null);
      }
    });
  });
  return promise;
}


init();


