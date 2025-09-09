
chrome.runtime.onConnect.addListener(function (port) {
  console.log('connected to: ', port.name);
  _port = port;

  _port.onMessage.addListener(processMessages);
  p_portrt.postMessage({
    msg: 'hello from popup'
  });
});

// Note: Timeline creation logic is handled by index_frame.js
// The popup will use the pre-computed timeline from storage

document.addEventListener('DOMContentLoaded', function() {

  // The main popup elements
  const demographicForm = document.getElementById("demographicForm");
  // const conditions = document.getElementById("conditions");
  const localSavedConversations = document.getElementById("saved-conversations");
  const unsupportedMessage = document.getElementById("unsupported-message");
  const faqSection = document.getElementById("faq-items-wrapper");
  const hereWeGo = document.getElementById("here-we-go");

  // Ask the content script whether the gradio app was found. if it was, show the demographic form and saved conversations

  // addDemographicForm();

  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    chrome.tabs.sendMessage(tabs[0].id, { type: 'gradio?' }, function(response) {
      if (chrome.runtime.lastError) {
        // console.log("error sending gradio? message to content script");
      }
      if (response && response.gradio) {
        getUserStateAndShow();
      } else {
        unsupportedMessage.classList.remove("hidden");
      }
    });
  });

  addCopyButton();
  handleFAQClick();
  buildConversationsTable();
  addSharedCounter();
  addDownloadButton();

  function handleFAQClick() {
    // Get all FAQ items
    const faqItems = document.querySelectorAll(".faq-item");

    // Attach click event listener to each FAQ item
    faqItems.forEach(function (item) {
      const question = item.querySelector(".faq-question");
      const answer = item.querySelector(".faq-answer");

      // Toggle answer visibility when question is clicked
      question.addEventListener("click", function () {
        if (answer.style.display === "none" || answer.style.display === "") {
          answer.style.display = "block";
        } else {
          answer.style.display = "none";
        }
      });
    });

    // Toggle more FAQs visibility when the button is clicked
    const toggleFaqButton = document.getElementById("toggle-faq-button");
    console.log("toggleFaqButton", toggleFaqButton);
    const hiddenFaqItems = document.querySelectorAll(".faq-item.hidden");

    let isFaqVisible = false;

    toggleFaqButton.addEventListener("click", () => {
      toggleFaqButton.classList.toggle('clicked');
      console.log("toggleFaqButton clicked");
      hiddenFaqItems.forEach((item) => {
        item.classList.toggle("hidden", isFaqVisible);
        console.log("toggle faq item", item);
      });
      isFaqVisible = !isFaqVisible;
    });
  }

  function getUserStateAndShow() {
    // Check if the user has verified their age
    getFromStorage("age_verified").then(age_verified => {
      if (age_verified) {
        hereWeGo.classList.remove("hidden");
        console.log("verification received from content.js:", age_verified);

        // Check if the user already saved some metadata
        getFromStorage("user_metadata").then(user_metadata => {
          if (user_metadata) {
            console.log("got user metadata", user_metadata);
          } else {
            console.log("user metadata not found in storage");
            demographicForm.classList.remove("hidden");
            addDemographicForm();
          }
        });
      } else {
        addTermsOfUseButton();
      }
    });
  }

  function addDemographicForm() {
    const genderDropdown = document.getElementById("gender");
    const customGenderWrapper = document.getElementById("customGenderWrapper");

    genderDropdown.addEventListener("change", function () {
      if (genderDropdown.value === "Specify your own") {
        customGenderWrapper.style.display = "block";
      } else {
        customGenderWrapper.style.display = "none";
      }
    });

    demographicForm.addEventListener('submit', function (event) {
      event.preventDefault();

      let age = document.getElementById('age');
      if (age) {
        age = age.value;
      } else {
        age = 0;
      }
      let gender = document.getElementById("gender");
      if (gender) {
        if (gender.value === "Specify your own") {
          gender = document.getElementById("customGender").value;
        } else {
          gender = gender.value;
        }
      } else {
        gender = "";
      }
      let location = document.getElementById('location');
      if (location) {
        location = location.value;
      } else {
        location = "";
      }
      const user_metadata = {"age": age, "gender": gender, "location": location};
      chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {type: 'userDataUpdate', user_metadata: user_metadata}, function (response) {
          if (chrome.runtime.lastError) {
            // console.log("error sending userDataUpdate message to content script");
          }
        });
      });
      console.log("user metadata updated", user_metadata);
      demographicForm.classList.add("hidden"); // Hide the form
    });

    // Get references to the form and the toggle button
    const formFields = document.getElementById("formFieldsWrapper");
    const toggleFormButton = document.getElementById("toggleFormButton");

    // Set an initial state (hidden)
    let isFormVisible = false;
    formFields.style.display = "none";

    // Add a click event listener to the button
    toggleFormButton.addEventListener("click", () => {
      toggleFormButton.classList.toggle('clicked');
      if (isFormVisible) {
        formFields.style.display = "none";
        isFormVisible = false;
      } else {
        formFields.style.display = "block";
        isFormVisible = true;
      }
    });
  }

  function addTermsOfUseButton() {
    conditions.classList.remove("hidden");
    const termsOfUseButton = document.getElementById("terms-of-use-button");
    termsOfUseButton.addEventListener("click", function () {
      chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {type: 'termsOfUse'}, function (response) {
          if (chrome.runtime.lastError) {
            // console.log("error sending termsOfUse message to content script");
          }
        });
      });
    });
  }

  function buildConversationsTable() {
    let local_db_ids = [];
    getFromStorage("local_db_ids").then((local_db_from_storage) => {
      console.log("local_db_from_storage:", local_db_from_storage);
      local_db_ids = local_db_from_storage ?? [];

      // Get the table body element
      const tableBody = document.querySelector("#saved-conversations-table tbody");

      // Generate table rows for saved conversations
      local_db_ids.forEach((conversation_id, index) => {

        console.log("conversation_id", conversation_id);
        getFromStorage(conversation_id).then(
            (conversation_from_storage) => {
              if (conversation_from_storage !== null) {
                console.log("conversation found in storage", conversation_from_storage);
                let conversation = "";
                
                // Use the pre-computed timeline if available, otherwise fall back to legacy format
                const timeline = conversation_from_storage.conversation_timeline;
                
                if (timeline && Array.isArray(timeline)) {
                  // Use the unified timeline
                  timeline.forEach(item => {
                    if (item.type === 'user') {
                      conversation += "😄: " + item.content + "\n";
                    } else if (item.type === 'bot') {
                      conversation += "🤖: " + item.content + "\n";
                    } else if (item.type === 'canvas') {
                      const canvas = item.content;
                      const title = canvas.title || 'Canvas';
                      
                      conversation += `📄: ${title}\n`;
                      
                      // Add the actual canvas content directly (first 100 characters for preview)
                      const fullText = canvas.textContent || '';
                      const preview = fullText.substring(0, 100);
                      if (preview) {
                        conversation += `${preview}${fullText.length > 100 ? '...' : ''}\n`;
                      }
                    }
                  });
                } else {
                  // Legacy fallback - create timeline from individual components
                  console.log("No timeline found, using legacy format");
                  const canvas_snapshots = conversation_from_storage.canvas_snapshots || [];
                  
                  // Create a simplified timeline for display
                  const legacyTimeline = [];
                  
                  // Add user and bot messages
                  for (let i = 0; i < conversation_from_storage.bot_msgs.length; i++) {
                    if (conversation_from_storage.user_msgs[i]) {
                      legacyTimeline.push({
                        type: 'user',
                        content: conversation_from_storage.user_msgs[i],
                        position: i
                      });
                    }
                    legacyTimeline.push({
                      type: 'bot', 
                      content: conversation_from_storage.bot_msgs[i],
                      position: i
                    });
                  }
                  
                  // Add canvas snapshots
                  canvas_snapshots.forEach(snapshot => {
                    legacyTimeline.push({
                      type: 'canvas',
                      content: {
                        title: snapshot.data?.displayTitle || 'Canvas',
                        contentType: snapshot.data?.contentType || 'text',
                        textContent: snapshot.data?.textContent || ''
                      },
                      position: snapshot.conversation_position || 0
                    });
                  });
                  
                  // Sort and display
                  legacyTimeline.sort((a, b) => {
                    if (a.position === b.position) {
                      const order = { user: 0, bot: 1, canvas: 2 };
                      return order[a.type] - order[b.type];
                    }
                    return a.position - b.position;
                  });
                  
                  legacyTimeline.forEach(item => {
                    if (item.type === 'user') {
                      conversation += "😄: " + item.content + "\n";
                    } else if (item.type === 'bot') {
                      conversation += "🤖: " + item.content + "\n";
                    } else if (item.type === 'canvas') {
                      const canvas = item.content;
                      const title = canvas.title || 'Canvas';
                      
                      conversation += `📄: ${title}\n`;
                      
                      // Add the actual canvas content directly
                      const fullText = canvas.textContent || '';
                      const preview = fullText.substring(0, 100);
                      if (preview) {
                        conversation += `${preview}${fullText.length > 100 ? '...' : ''}\n`;
                      }
                    }
                  });
                }

                // Manually break to lines if no spaces are found.
                let result = '';
                let lineLength = 0;

                for (let i = 0; i < conversation.length; i++) {
                  result += conversation[i];
                  if (conversation[i] === ' ') {
                    lineLength = 0;
                  } else {
                    lineLength += 1;
                  }

                  if (lineLength >= 25) { // Adjust based on font-size
                    result += '\n';
                    lineLength = 0;
                  }
                }
                conversation = result;

                // Display only the first 50 characters of the conversation initially.
                let truncatedText = conversation.length > 50 ? conversation.slice(0, 50) + "..." : conversation;

                // Create a div to hold the truncated text and "Read More" link
                const contentDiv = document.createElement("div");
                contentDiv.textContent = truncatedText;

                // If the conversation is long, add a "Read More" link to expand it
                if (conversation.length > 50) {
                  const readMoreLink = document.createElement("a");
                  readMoreLink.textContent = "Read More";
                  readMoreLink.href = "#";
                  readMoreLink.classList.add("read-more-link");

                  readMoreLink.addEventListener("click", () => {
                    if (contentDiv.classList.contains("expanded")) {
                      contentDiv.textContent = truncatedText;
                      contentDiv.classList.remove("expanded");
                      readMoreLink.textContent = "Read More";
                      if (!contentDiv.contains(readMoreLink)) {
                        contentDiv.appendChild(readMoreLink);
                      }
                    } else {
                      console.log("read less!");
                      contentDiv.textContent = conversation;
                      contentDiv.classList.add("expanded");
                      readMoreLink.textContent = "Read Less";
                      if (!contentDiv.contains(readMoreLink)) {
                        contentDiv.appendChild(readMoreLink);
                      }
                    }
                  });
                  contentDiv.appendChild(readMoreLink);
                }

                const row = tableBody.insertRow();
                const cell = row.insertCell(0);

                // Create thumbup and thumbdown buttons
                const thumbupButton = document.createElement("button");
                thumbupButton.textContent = "👍";
                thumbupButton.style.display = "block"; // Make it a block-level element
                thumbupButton.style.margin = "0 auto"; // Center horizontally
                thumbupButton.style.border = "none"; // Remove the border
                thumbupButton.style.background = "none"; // Remove the background color
                thumbupButton.style.outline = "none"; // Remove the outline
                thumbupButton.style.cursor = "pointer"; // Set a pointer cursor
                thumbupButton.style.color = "green"; // Change the color to indicate interactivity
                thumbupButton.addEventListener("click", () => {
                  console.log("thumbup clicked");
                  if (thumbupButton.style.background === "green") {
                    thumbupButton.style.background = "none";
                    chrome.storage.local.remove(["rate_" + conversation_id], () => {
                      if (chrome.runtime.lastError) {
                        console.error("Error removing rate_conversation from storage", chrome.runtime.lastError);
                      } else {
                        console.log("rate_conversation removed from storage");
                      }
                    });
                  } else {
                    thumbupButton.style.background = "green";
                    thumbdownButton.style.background = "none";
                    saveToStorage("rate_" + conversation_id, "thumbup");
                  }
                });

                const thumbdownButton = document.createElement("button");
                thumbdownButton.textContent = "👎";
                thumbdownButton.style.display = "block"; // Make it a block-level element
                thumbdownButton.style.margin = "0 auto"; // Center horizontally
                thumbdownButton.style.border = "none"; // Remove the border
                thumbdownButton.style.background = "none"; // Remove the background color
                thumbdownButton.style.outline = "none"; // Remove the outline
                thumbdownButton.style.cursor = "pointer"; // Set a pointer cursor
                thumbdownButton.style.color = "red"; // Change the color to indicate interactivity
                thumbdownButton.addEventListener("click", () => {
                  console.log("thumbdown clicked");
                  if (thumbdownButton.style.background === "red") {
                    thumbdownButton.style.background = "none";
                    chrome.storage.local.remove(["rate_" + conversation_id], () => {
                      if (chrome.runtime.lastError) {
                        console.error("Error removing conversation from storage", chrome.runtime.lastError);
                      } else {
                        console.log("conversation removed from storage");
                      }
                    });
                  } else {
                    thumbdownButton.style.background = "red";
                    thumbupButton.style.background = "none";
                    saveToStorage("rate_" + conversation_id, "thumbdown");
                  }
                });

                getFromStorage("rate_" + conversation_id).then(
                    (rate) => {
                      if (rate === null) {
                        console.log("rate not found in storage");
                      } else if (rate === "thumbup") {
                        thumbupButton.style.background = "green";
                      } else if (rate === "thumbdown") {
                        thumbdownButton.style.background = "red";
                      }
                    });

                const thumbsCell = row.insertCell(1);
                thumbsCell.appendChild(thumbupButton);
                thumbsCell.appendChild(thumbdownButton);

                // Create a table cell for the "X" button
                const removeButtonCell = row.insertCell(2);
                const removeButton = document.createElement("button");
                removeButton.textContent = "❌";
                removeButton.style.display = "block"; // Make it a block-level element
                removeButton.style.margin = "0 auto"; // Center horizontally
                removeButton.style.border = "none"; // Remove the border
                removeButton.style.background = "none"; // Remove the background color
                removeButton.style.outline = "none"; // Remove the outline
                removeButton.style.cursor = "pointer"; // Set a pointer cursor
                removeButton.style.color = "red"; // Change the color to indicate interactivity


                // Add a click event listener to the "X" button to remove the conversation
                removeButton.addEventListener("click", () => {
                  // Remove the corresponding row when the "X" button is clicked
                  tableBody.removeChild(row);
                  // Remove the conversation from local storage
                  chrome.storage.local.remove([conversation_id], () => {
                    if (chrome.runtime.lastError) {
                      console.error("Error removing conversation from storage", chrome.runtime.lastError);
                    } else {
                      console.log("conversation removed from storage");
                    }
                  });
                });
                // Append the "X" button to the cell
                removeButtonCell.appendChild(removeButton);

                cell.appendChild(contentDiv);
              } else {
                console.log("conversation not found in storage");
              }
            }
        )
      });
    });
    // });
    addPublishButton();
  }

  function addPublishButton() {
    const publishButton = document.getElementById("publishButton");
    console.log("publishButton", publishButton);
    publishButton.addEventListener("click", function () {
      const tableBody = document.querySelector("#saved-conversations-table tbody");
      if (!tableBody.firstChild) {
        // Show toast for empty case
        const toast = document.createElement("div");
        toast.textContent = "Nothing to publish";
        toast.style.position = "fixed";
        toast.style.bottom = "20px";
        toast.style.left = "50%";
        toast.style.transform = "translateX(-50%)";
        toast.style.backgroundColor = "#333";
        toast.style.color = "#fff";
        toast.style.padding = "10px 20px";
        toast.style.borderRadius = "5px";
        toast.style.zIndex = "1000";
        document.body.appendChild(toast);
        setTimeout(() => document.body.removeChild(toast), 3000);
        return; // Exit early
      }

      console.log("publishing...");
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        chrome.runtime.sendMessage({ type: 'publish' }, function (response) {
          if (chrome.runtime.lastError) {
            // console.log("error sending publish message to content script");
          }
        });
      });

      while (tableBody.firstChild) {
        tableBody.removeChild(tableBody.firstChild);
      }

      const toast = document.createElement("div");
      toast.textContent = "Published!🎉";
      toast.style.position = "fixed";
      toast.style.bottom = "20px";
      toast.style.left = "50%";
      toast.style.transform = "translateX(-50%)";
      toast.style.backgroundColor = "#333";
      toast.style.color = "#fff";
      toast.style.padding = "10px 20px";
      toast.style.borderRadius = "5px";
      toast.style.zIndex = "1000";
      document.body.appendChild(toast);
      setTimeout(() => document.body.removeChild(toast), 3000);
    });
  }

  function addDownloadButton() {
    // Download button to allow the user to download the locally saved conversations in as a csv file
    const downloadButton = document.getElementById("downloadButton");

    // Add a click event listener to the button
    downloadButton.addEventListener("click", () => {
        // Get the locally saved conversations from storage
      console.log("downloading...");
        getFromStorage("local_db_ids").then((local_db_ids) => {
            if (local_db_ids) {
              console.log("local_db_ids:", local_db_ids);
              let csv = "Conversation ID,User Message,Bot Response\n";
              for (let i = 0; i < local_db_ids.length; i++) {
                let conversation_id = local_db_ids[i];
                getFromStorage(conversation_id).then((conversation) => {
                  if (conversation) {
                    console.log("conversation:", conversation);
                    for (let i = 0; i < conversation.bot_msgs.length; i++) {
                      let line = conversation_id + "," + "\"" + conversation.user_msgs[i].replace(/"/g, '""') + "\"" + ","
                          + "\"" + conversation.bot_msgs[i].replace(/"/g, '""') + "\"" + "\n";
                      csv +=  line;
                    }
                  }
                  if (i === local_db_ids.length - 1) {
                    // Create a temporary anchor element to download the csv file
                    const tempAnchor = document.createElement("a");
                    tempAnchor.href = 'data:text/csv;charset=utf-8,' + encodeURI(csv);
                    tempAnchor.target = '_blank';
                    tempAnchor.download = 'conversations.csv';
                    tempAnchor.click();
                  }
                });
              }
            }
        });
    });
  }

  function addCopyButton() {
    // Get the button element by its ID
    const copyButton = document.getElementById("copyButton");

    // Add a click event listener to the button
    copyButton.addEventListener("click", () => {
      // Get the value you want to copy (replace with your value)

      getFromStorage("user_id").then(
          (user_id) => {
            if (user_id !== null) {
              console.log("user_id found in storage", user_id);
              // Create a temporary input element to use the clipboard API
              const tempInput = document.createElement("input");
              tempInput.value = user_id;

              // Append the input element to the DOM (it doesn't need to be visible)
              document.body.appendChild(tempInput);

              // Select the text inside the input element
              tempInput.select();

              // Copy the selected text to the clipboard
              document.execCommand("copy");

              // Remove the temporary input element from the DOM
              document.body.removeChild(tempInput);

              // Provide feedback to the user (optional)
              alert("user-id copied to clipboard: " + user_id);
            } else {
              console.log("user_id not found in storage");
            }
          }
      )
    });
  }

  function addSharedCounter() {
    getFromStorage("messages_counter_from_storage").then((counter_from_storage) => {
      if (counter_from_storage) {
        console.log("counter_from_storage:", counter_from_storage);
        const messagesCounter = document.getElementById("already-shared-counter");
        messagesCounter.innerHTML = `You have shared <br><span id="counter-number">${counter_from_storage}</span><br> chat responses! 💪🤩`;
        // messagesCounter.textContent = "You have shared\n" + counter_from_storage + " chat responses! 💪🤩";
      }
    });
  }


});


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

function saveToStorage(field, value) {
  const data = {};
  data[field] = value; // Construct the object with the dynamic key.

  chrome.storage.local.set(data, function () {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError);
    } else {
      console.log(field, " saved");
    }
  });
}
