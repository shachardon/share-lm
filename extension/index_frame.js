

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
  let cur_ratings = [];


  let gradio_app;
  let chat_ui_app;
  let openai_app;
  let claude_ai_app;
  let gemini_app;
  let poe_app;
  let app;
  let init_already = false;

  // Add this to see if something is removing your element
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList' && mutation.removedNodes.length > 0) {
        console.log('Element removed:', mutation.removedNodes);
        console.log('Removed by:', mutation.target);
        console.trace();
      }
    });
  });


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

  // Let's find the openai-app element
    waitForElm("body > div.flex.h-full.w-full.flex-col").then((openai_app_from_storage) => {
      openai_app = openai_app_from_storage;

      if (!openai_app) {
          console.log("Couldn't find openai-app.")
      } else {
          shouldShare = true;
          app = openai_app;
          console.log("openai-app found!", openai_app);
      }

      if (!init_already || openai_app) {
          init_already = true;
          getUserInfoFromStorage();
          handleDataUpdatesFromPopup();
      }

      if (openai_app) {
          if (!age_verified) {
              console.log("age not verified - adding need verification badge");
              addNeedVerificationBadge();
          } else {
              addBadge();
          }
          setInterval(queryAndUpdateConversationsOpenAI, 7000);
          setInterval(addBadge, 50000);
      }
    });

    // Let's find the claude-ai element
    waitForElm("body > div.flex.min-h-screen.w-full").then((claude_ai_app_from_storage) => {
    // waitForElm("[class=\"from-bg-200 to-bg-100 text-text-100 font-styrene min-h-screen bg-gradient-to-b bg-fixed tracking-tight\"]").then((claude_ai_app_from_storage) => {
    // waitForElm("[data-theme=\"claude\"]").then((claude_ai_app_from_storage) => {

    claude_ai_app = claude_ai_app_from_storage;

      if (!claude_ai_app) {
        console.log("Couldn't find claude-ai-app.");
      } else {
        shouldShare = true;
        app = claude_ai_app;
        console.log("claude-ai-app found!", claude_ai_app);
      }

      if (!init_already || claude_ai_app) {
         init_already = true;
         getUserInfoFromStorage();
         handleDataUpdatesFromPopup();
      }

      if (claude_ai_app) {
        if (!age_verified) {
          console.log("age not verified - adding need verification badge");
          addNeedVerificationBadge();
        } else {
          addBadge();
        }
        setInterval(queryAndUpdateConversationsClaudeAI, 7000);
      }

    });

    if (window.location.href.includes("gemini.google.com")) {
      const style = document.createElement('style');
      style.innerHTML = 'body { padding-top: 50px !important; }';
      document.head.appendChild(style);
      console.log("Gemini website detected");
      gemini_app = document.body;
      app = gemini_app;
      shouldShare = true;

      if (!init_already) {
        init_already = true;
        getUserInfoFromStorage();
        handleDataUpdatesFromPopup();
      }

      getFromStorage("age_verified").then((age_verified_from_storage) => {
        age_verified = age_verified_from_storage ?? false;
        if (!age_verified) {
          console.log("age not verified - adding need verification badge");
          addNeedVerificationBadge();
        } else {
          addBadge();
        }
        setInterval(queryAndUpdateConversationsGemini, 7000);
        setInterval(addBadge, 5000);
      });
    }

    if (window.location.href.includes("poe.com")) {
      console.log("Poe website detected");
      poe_app = document.body;
      app = poe_app;
      shouldShare = true;

      if (!init_already) {
        init_already = true;
        getUserInfoFromStorage();
        handleDataUpdatesFromPopup();
      }

      getFromStorage("age_verified").then((age_verified_from_storage) => {
        age_verified = age_verified_from_storage ?? false;
        if (!age_verified) {
          console.log("age not verified - adding need verification badge");
          addNeedVerificationBadge();
        } else {
          addBadge();
        }
        setInterval(queryAndUpdateConversationsPoe, 7000);
        setInterval(addBadge, 5000);
      });
    }


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
        max-height: 80vh; /* Adjusts to a maximum height of 80% of the viewport height */
        overflow-y: auto;
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
        const verificationBadge = document.getElementById("shareLM-needs-verification-badge");
        if (verificationBadge) {
          verificationBadge.remove();
        }
        if (app.contains(floatingBadge)) {
          app.removeChild(floatingBadge);
        }
        addBadge();
      } else {
        addNeedVerificationBadge();
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
    container.style.position = "fixed";
    container.style.top = "0";
    container.style.left = "0";
    container.style.zIndex = "9999";
    container.style.fontFamily = "Source Sans Pro,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI," +
        "Apple Color Emoji,Segoe UI Emoji,Segoe UI Symbol,Noto Color Emoji"; // Fallback fonts included
    container.style.color = "black";
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

    // Add the need-verification badge to the top of the page
    document.body.insertBefore(container, document.body.firstChild);
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
      console.log("badge already exists");
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
      container.style.color = "black";
      container.style.background = "linear-gradient(to right, white,  #Bde8b7, white)";
      container.style.width = "100%";
      container.style.textAlign = "center";
      container.style.position = "fixed";
      container.style.top = "0";
      container.style.left = "0";
      container.style.zIndex = "9999";
      container.style.fontFamily = "Source Sans Pro,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI," +
          "Apple Color Emoji,Segoe UI Emoji,Segoe UI Symbol,Noto Color Emoji"; // Fallback fonts included
      container.textContent = 'Your conversation is shared with the community! 💬';
      let button = document.createElement("button");
      button.id = "disable-sharing-button";
      button.textContent = 'Click here to stop sharing';
      button.classList.add('disable-sharing-button');
      button.style.fontFamily = "Source Sans Pro,ui-ssans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI," +
          "Apple Color Emoji,Segoe UI Emoji,Segoe UI Symbol,Noto Color Emoji"; // Fallback fonts included
      button.style.margin = "7px";
      button.style.marginLeft = "20px";
      button.style.background = "transparent"; 
      button.style.border = "1px solid black";

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
      if (!document.getElementById("shareLM-badge")) {
        if (!app.insertAdjacentElement("beforebegin", container)) {
          console.log("badge failed to add");
          if (!app.parentNode) {
            console.log("app has no parent node - insertAdjacentElement won't work");
            // look again for the app element
            if (openai_app) {
              app = document.querySelector("body > div.flex.h-full.w-full.flex-col");
            } else if (claude_ai_app) {
              app = document.querySelector("body > div.flex.min-h-screen.w-full");
            }
            if (app) {
              console.log("app found again");
              if (!document.getElementById("shareLM-badge")) {
                if (!app.insertAdjacentElement("beforebegin", container)) {
                  console.log("badge failed to add again");
                }
              }
            }
          }
        }
      }
    });
  }

  // Function to check if the conversation has changed
  function checkConversationStatus(new_bot_msgs, new_user_msgs, new_ratings) {
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

    // Check if the ratings have changed
    if (cur_ratings.length !== new_ratings.length) {
      need_update = true;
    } else {
      for (let i = 0; i < cur_ratings.length; i++) {
        if (cur_ratings[i] !== new_ratings[i]) {
          need_update = true;
          break;
        }
      }
    }

    return [new_conversation, need_update];
  }

  // Function to handle the newly received messages
  function checkInConversation(new_bot_msgs, new_user_msgs, new_ratings) {
    let [new_conversation, need_update] = checkConversationStatus(new_bot_msgs, new_user_msgs, new_ratings);

    if (new_conversation) {
      // Do not use old conversation id
      cur_conversation_id = 0;
    }
    if (need_update) {
      // Update messages
      cur_bot_msgs = new_bot_msgs;
      cur_user_msgs = new_user_msgs;
      cur_ratings = new_ratings;
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
      ratings: cur_ratings,
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
          "[class=\"prose max-w-none dark:prose-invert max-sm:prose-sm prose-headings:font-semibold prose-h1:text-lg prose-h2:text-base prose-h3:text-base prose-pre:bg-gray-800 dark:prose-pre:bg-gray-900\"]");
      } else {
        queryAndUpdateConversations(org_chat_ui_user_selector,
            "[class=\"prose max-w-none dark:prose-invert max-sm:prose-sm prose-headings:font-semibold prose-h1:text-lg prose-h2:text-base prose-h3:text-base prose-pre:bg-gray-800 dark:prose-pre:bg-gray-900\"]");
      }
    });
  }

  function queryAndUpdateConversationsOpenAI() {
    queryAndUpdateConversations(
        "[data-message-author-role=\"user\"]",
        "[data-message-author-role=\"assistant\"]");//,
  }

  function queryAndUpdateConversationsClaudeAI() {
    queryAndUpdateConversations("[data-testid=\"user-message\"]",
        ".font-claude-message");//,
  }

  function queryAndUpdateConversationsGemini() {
    queryAndUpdateConversations(
        "div.query-text",
        "div.markdown-main-panel"
    );
  }

  function queryAndUpdateConversationsPoe() {
    if (!shouldShare || !age_verified) {
      console.log("Sharing is disabled, not updating conversation");
      return;
    }

    // 1. Get Poe-Formkey
    fetch("https://poe.com")
      .then(response => response.text())
      .then(html => {
        const scriptUrl = html.match(/src="([^"]*poe-main-[^"]*)"/)[1];
        return fetch(`https://poe.com${scriptUrl}`);
      })
      .then(response => response.text())
      .then(js => {
        const formKey = js.match(/name:"chatOfCode",id:"([^"]*)"/)[1];

        // 2. Get cookies
        chrome.runtime.sendMessage({type: "get_cookies", domain: "poe.com"}, (cookies) => {
          const pbCookie = cookies.find(c => c.name === 'p-b');
          const platCookie = cookies.find(c => c.name === 'p-lat');

          if (!pbCookie || !platCookie) {
            console.error("Poe cookies not found");
            return;
          }

          // 3. Construct GraphQL payload
          const queryName = "ChatHistoryListPaginationQuery";
          const variables = { count: 50, cursor: null };
          const payload = {
            queryName: queryName,
            variables: variables,
            extensions: {
              hash: "6ce01455b0201e625489da90c65f87a2809d212ea41ab6e39412b6913990e81f"
            }
          };
          const payloadString = JSON.stringify(payload);

          // 4. Calculate poe-tag-id
          const salt = "4LxgHM6KpFqokX0Ox";
          const poeTagId = md5(payloadString + formKey + salt);

          // 5. Make fetch request
          fetch("https://poe.com/api/gql_POST", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Poe-Formkey": formKey,
              "Poe-Tag-Id": poeTagId,
              "Cookie": `p-b=${pbCookie.value}; p-lat=${platCookie.value}`
            },
            body: payloadString
          })
          .then(response => response.json())
          .then(data => {
            // 6. Process the response
            const new_user_msgs = [];
            const new_bot_msgs = [];
            const chats = data.data.chats.edges;

            for (const chat of chats) {
              const messages = chat.node.messages.edges.reverse();
              for (const message of messages) {
                if (message.node.author === 'human') {
                  new_user_msgs.push(message.node.text);
                } else {
                  new_bot_msgs.push(message.node.text);
                }
              }
            }

            // 7. Call checkInConversation
            checkInConversation(new_bot_msgs, new_user_msgs, []);
          });
        });
      });
  }


    function queryAndUpdateConversations(user_selector, bot_selector, sub_user_selector, sub_bot_selector) {
    if (!shouldShare || !age_verified) {
      console.log("Sharing is disabled, not updating conversation");
      return;
    }

    // Get the messages using CSS selectors
    waitForElms(user_selector).then((user) => {
      const new_user_msgs = [];
      for (let i = 0; i < user.length; i++) {
        if (sub_user_selector) {
            const sub_user = user[i].querySelector(sub_user_selector);
            if (sub_user) {
              new_user_msgs.push(sub_user.textContent);
            }
        } else {
          new_user_msgs.push(user[i].textContent);
        }
      }
      waitForElms(bot_selector).then((bot) => {
        console.log("bot messages found");
        console.log(bot);
        const new_bot_msgs = [];
        for (let i = 0; i < bot.length; i++) {
          if (sub_bot_selector) {
            const sub_bot = bot[i].querySelectorAll(sub_bot_selector);
            if (sub_bot) {
                let sub_bot_concat = "";
                for (let j = 0; j < sub_bot.length; j++) {
                    sub_bot_concat += sub_bot[j].textContent;
                }
              new_bot_msgs.push(sub_bot.textContent);
            }
          } else {
            new_bot_msgs.push(bot[i].textContent);
          }
        }

        // Get the ratings from ChatUI
        queryAndUpdateRating(new_bot_msgs.length).then((new_ratings) => {
          // Check if the conversation has changed, if so, send it to the server
          checkInConversation(new_bot_msgs, new_user_msgs, new_ratings);
        });
      });

    });
  }
}


function queryAndUpdateRating(n_messages) {
  const parent_selector = 'div.absolute.-bottom-4.right-0';
  const positive_selector = "[title=\"Remove +1\"]";
  const negative_selector = "[title=\"Remove -1\"]";
  const new_ratings = Array(n_messages).fill(0);

  // find all rating elements :+1: and :-1: and store the ratings
  return waitForElms(parent_selector).then((parents) => {
    if (!parents || parents.length === 0) {
        console.log("No ratings found"); // Note - we currently don't support ratings in Gradio UI
        return new_ratings;
    }
    for (let i = 0; i < parents.length; i++) {
      const positive_child = parents[i].querySelector(positive_selector);
      const negative_child = parents[i].querySelector(negative_selector);
      
      if (positive_child) {
        console.log("positive rating found");
        new_ratings[i] = 1;
      } else if (negative_child) {
        console.log("negative rating found");
        new_ratings[i] = -1;
      } else {
        new_ratings[i] = 0;
      }
    }
    return new_ratings;
  }).catch((err) => {
    console.error("Error in queryAndUpdateRating:", err);
    return new_ratings;
  });
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

function md5cycle(x, k) {
var a = x[0], b = x[1], c = x[2], d = x[3];

a = ff(a, b, c, d, k[0], 7, -680876936);
d = ff(d, a, b, c, k[1], 12, -389564586);
c = ff(c, d, a, b, k[2], 17,  606105819);
b = ff(b, c, d, a, k[3], 22, -1044525330);
a = ff(a, b, c, d, k[4], 7, -176418897);
d = ff(d, a, b, c, k[5], 12,  1200080426);
c = ff(c, d, a, b, k[6], 17, -1473231341);
b = ff(b, c, d, a, k[7], 22, -45705983);
a = ff(a, b, c, d, k[8], 7,  1770035416);
d = ff(d, a, b, c, k[9], 12, -1958414417);
c = ff(c, d, a, b, k[10], 17, -42063);
b = ff(b, c, d, a, k[11], 22, -1990404162);
a = ff(a, b, c, d, k[12], 7,  1804603682);
d = ff(d, a, b, c, k[13], 12, -40341101);
c = ff(c, d, a, b, k[14], 17, -1502002290);
b = ff(b, c, d, a, k[15], 22,  1236535329);

a = gg(a, b, c, d, k[1], 5, -165796510);
d = gg(d, a, b, c, k[6], 9, -1069501632);
c = gg(c, d, a, b, k[11], 14,  643717713);
b = gg(b, c, d, a, k[0], 20, -373897302);
a = gg(a, b, c, d, k[5], 5, -701558691);
d = gg(d, a, b, c, k[10], 9,  38016083);
c = gg(c, d, a, b, k[15], 14, -660478335);
b = ff(b, c, d, a, k[4], 20, -405537848);
a = gg(a, b, c, d, k[9], 5,  568446438);
d = gg(d, a, b, c, k[14], 9, -1019803690);
c = gg(c, d, a, b, k[3], 14, -187363961);
b = gg(b, c, d, a, k[8], 20,  1163531501);
a = gg(a, b, c, d, k[13], 5, -1444681467);
d = gg(d, a, b, c, k[2], 9, -51403784);
c = gg(c, d, a, b, k[7], 14,  1735328473);
b = gg(b, c, d, a, k[12], 20, -1926607734);

a = hh(a, b, c, d, k[5], 4, -378558);
d = hh(d, a, b, c, k[8], 11, -2022574463);
c = hh(c, d, a, b, k[11], 16,  1839030562);
b = hh(b, c, d, a, k[14], 23, -35309556);
a = hh(a, b, c, d, k[1], 4, -1530992060);
d = hh(d, a, b, c, k[4], 11,  1272893353);
c = hh(c, d, a, b, k[7], 16, -155497632);
b = hh(b, c, d, a, k[10], 23, -1094730640);
a = hh(a, b, c, d, k[13], 4,  681279174);
d = hh(d, a, b, c, k[0], 11, -358537222);
c = hh(c, d, a, b, k[3], 16, -722521979);
b = hh(b, c, d, a, k[6], 23,  76029189);
a = hh(a, b, c, d, k[9], 4, -640364487);
d = hh(d, a, b, c, k[12], 11, -421815835);
c = hh(c, d, a, b, k[15], 16,  530742520);
b = hh(b, c, d, a, k[2], 23, -995338651);

a = ii(a, b, c, d, k[0], 6, -198630844);
d = ii(d, a, b, c, k[7], 10,  1126891415);
c = ii(c, d, a, b, k[14], 15, -1416354905);
b = ii(b, c, d, a, k[5], 21, -57434055);
a = ii(a, b, c, d, k[12], 6,  1700485571);
d = ii(d, a, b, c, k[3], 10, -1894986606);
c = ii(c, d, a, b, k[10], 15, -1051523);
b = ii(b, c, d, a, k[1], 21, -2054922799);
a = ii(a, b, c, d, k[8], 6,  1873313359);
d = ii(d, a, b, c, k[15], 10, -30611744);
c = ii(c, d, a, b, k[6], 15, -1560198380);
b = ii(b, c, d, a, k[13], 21,  1309151649);
a = ii(a, b, c, d, k[4], 6, -145523070);
d = ii(d, a, b, c, k[11], 10, -1120210379);
c = ii(c, d, a, b, k[2], 15,  718787259);
b = ii(b, c, d, a, k[9], 21, -343485551);

x[0] = add32(a, x[0]);
x[1] = add32(b, x[1]);
x[2] = add32(c, x[2]);
x[3] = add32(d, x[3]);

}

function cmn(q, a, b, x, s, t) {
a = add32(add32(a, q), add32(x, t));
return add32((a << s) | (a >>> (32 - s)), b);
}

function ff(a, b, c, d, x, s, t) {
return cmn((b & c) | ((~b) & d), a, b, x, s, t);
}

function gg(a, b, c, d, x, s, t) {
return cmn((b & d) | (c & (~d)), a, b, x, s, t);
}

function hh(a, b, c, d, x, s, t) {
return cmn(b ^ c ^ d, a, b, x, s, t);
}

function ii(a, b, c, d, x, s, t) {
return cmn(c ^ (b | (~d)), a, b, x, s, t);
}

function md51(s) {
txt = '';
var n = s.length,
state = [1732584193, -271733879, -1732584194, 271733878], i;
for (i=64; i<=s.length; i+=64) {
md5cycle(state, md5blk(s.substring(i-64, i)));
}
s = s.substring(i-64);
var tail = [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0];
for (i=0; i<s.length; i++)
tail[i>>2] |= s.charCodeAt(i) << ((i%4) << 3);
tail[i>>2] |= 0x80 << ((i%4) << 3);
if (i > 55) {
md5cycle(state, tail);
for (i=0; i<16; i++) tail[i] = 0;
}
tail[14] = n*8;
md5cycle(state, tail);
return state;
}

function md5blk(s) { /* I figured global was faster.   */
var md5blks = [], i; /* Andy King said do it this way. */
for (i=0; i<64; i+=4) {
md5blks[i>>2] = s.charCodeAt(i)
+ (s.charCodeAt(i+1) << 8)
+ (s.charCodeAt(i+2) << 16)
+ (s.charCodeAt(i+3) << 24);
}
return md5blks;
}

var hex_chr = '0123456789abcdef'.split('');

function rhex(n)
{
var s='', j=0;
for(; j<4; j++)
s += hex_chr[(n >> (j * 8 + 4)) & 0x0F]
+ hex_chr[(n >> (j * 8)) & 0x0F];
return s;
}

function hex(x) {
for (var i=0; i<x.length; i++)
x[i] = rhex(x[i]);
return x.join('');
}

function md5(s) {
return hex(md51(s));
}

function add32(a, b) {
return (a + b) & 0xFFFFFFFF;
}

if (md5('hello') != '5d41402abc4b2a76b9719d911017c592') {
function add32(x, y) {
var lsw = (x & 0xFFFF) + (y & 0xFFFF),
msw = (x >> 16) + (y >> 16) + (lsw >> 16);
return (msw << 16) | (lsw & 0xFFFF);
}
}


init();
