
chrome.runtime.onConnect.addListener(function (port) {
  console.log('connected to: ', port.name);
  _port = port;

  _port.onMessage.addListener(processMessages);
  p_portrt.postMessage({
    msg: 'hello from popup'
  });
});

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
        chrome.tabs.sendMessage(tabs[0].id, {type: 'userDataUpdate', user_metadata: user_metadata});
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
        chrome.tabs.sendMessage(tabs[0].id, {type: 'termsOfUse'});
      });
    });
  }

  function buildConversationsTable() {
    let local_db_ids = [];
    // chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
    //   chrome.tabs.sendMessage(tabs[0].id, {type: "local_db?"}, function (response) {
    //     console.log("asking for local_db");
    //     if (response && response.local_db_ids) {
    //       local_db_ids = response.local_db_ids;
    //       console.log("local_db received from content.js:", response.local_db_ids);
    //     }
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
                for (let i = 0; i < conversation_from_storage.bot_msgs.length; i++) {
                  conversation += "😄: " + conversation_from_storage.user_msgs[i] + "\n";
                  conversation += "🤖: " + conversation_from_storage.bot_msgs[i] + "\n";
                }
                // Display only the first 50 characters of the conversation initially
                const truncatedText = conversation.length > 50 ? conversation.slice(0, 50) + "..." : conversation;

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
                          console.error("Error removing conversation from storage", chrome.runtime.lastError);
                        } else {
                          console.log("conversation removed from storage");
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
      console.log("publishing...");
      chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {type: 'publish'});
      });
      const tableBody = document.querySelector("#saved-conversations-table tbody");
      while (tableBody.firstChild) {
        tableBody.removeChild(tableBody.firstChild);
      }
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

// function changeIcon(activate) {
//   let iconPath;
//   if (activate) {
//     iconPath = {
//       "16": "assets/icons/icon16.png",
//       "32": "assets/icons/icon32.png",
//       "48": "assets/icons/icon48.png",
//       "128": "assets/icons/icon128.png"
//     };
//   } else {
//     iconPath = {
//       "16": "assets/icons/icon16_non_active.png",
//       "32": "assets/icons/icon32_non_active.png",
//       "48": "assets/icons/icon48.png",
//       "128": "assets/icons/icon128.png"
//     };
//   }
//
//   chrome.action.setIcon({ path: iconPath });
// }
