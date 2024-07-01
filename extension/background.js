// background.js
const API_URL = "https://share-lm-4e25a5769ac0.herokuapp.com/api/endpoint";

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Ensure the tab has finished loading
    if (changeInfo.status === 'complete') {
        handleIconStatus(tabId);
        updateSharingStatus(tabId);
    }
});

chrome.tabs.onActivated.addListener((activeInfo) => {
    handleIconStatus(activeInfo.tabId);
    updateSharingStatus(activeInfo.tabId);
});

// Set an interval to run the function once in 5 min (in milliseconds)
const MinInMillis = 60 * 1000;
setInterval(removeInvalidAndPostToDb, 5 * MinInMillis);


// Define a function to change the extension icon
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
            // console.error(chrome.runtime.lastError);
            return;
        }

        // Send a message to the content script
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
            // console.error(chrome.runtime.lastError);
            return;
        }

        // Send a message to the content script
        chrome.tabs.sendMessage(tab.id, { type: "update?" }, function(response) {
            if (chrome.runtime.lastError) {
                // console.log("error sending message update? to content script");
            }
        });
    });}

function handleLocalDbIds() {
    // load local_db_ids from storage

    // handle local_db_ids updates requests
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === "update_local_db_ids") {
            let local_db_ids = [];
            getFromStorage("local_db_ids").then((local_db_ids_from_storage) => {
                if (local_db_ids_from_storage !== null) {
                    local_db_ids = local_db_ids_from_storage;
                    console.log("local_db_ids loaded from storage", local_db_ids);
                }
                // add new conversation request
                if (request.id_to_add) {
                    console.log("add new conversation request");
                    const index = local_db_ids.indexOf(request.id_to_add);
                    if (index < 0) { // only add to array if not already there
                        local_db_ids.push(request.id_to_add);
                        saveToStorage("local_db_ids", local_db_ids);
                    }
                    if (request.conversation) {
                        saveToStorage(request.id_to_add, request.conversation);
                    }
                    sendResponse({ local_db_ids: local_db_ids, request_type: "add" , conversion_id: request.id_to_add});
                // }
                // // remove conversation request
                // else if (request.id_to_remove) {
                //     console.log("remove conversation request");
                //     // find the index of the conversation and remove it from the array
                //     const index = local_db_ids.indexOf(request.id_to_remove);
                //     if (index > -1) { // only splice array when item is found
                //         local_db_ids.splice(index, 1); // 2nd parameter means remove one item only
                //         saveToStorage("local_db_ids", local_db_ids);
                //     }
                //     // remove the conversation from the database
                //     chrome.storage.local.remove([request.id_to_remove], () => {
                //         if (chrome.runtime.lastError) {
                //             console.error("Error removing conversation from storage", chrome.runtime.lastError);
                //         } else {
                //             console.log("conversation removed from storage");
                //         }
                //     });
                //     sendResponse({ local_db_ids: local_db_ids , request_type: "remove", conversion_id: request.id_to_remove});
                } else {
                    console.log("error: update request with no id to add/remove", request);
                }
            });
        } else if (request.type === "publish") {
            removeInvalidAndPostToDb(false);
            console.log("got publish request");
        }
    });
}

// Function to send the conversation to the server
function sendConversation(conversation_id, data_short) {
    console.log("sending conversation to server...")

    let conversation_metadata = {}
    if ("ratings" in data_short) {
        conversation_metadata["message_ratings"] = data_short.ratings;
    }
    getFromStorage("rate_" + conversation_id).then((rate) => {
        if (rate !== null) {
            conversation_metadata["rate"] = rate;
        }

        getFromStorage("user_id").then((user_id_from_storage) => {
            console.log("user_id_from_storage:", user_id_from_storage);
            if (user_id_from_storage === null) {
                user_id_from_storage = uuidv4();
                saveToStorage("user_id", user_id_from_storage);
            }
            let user_id = user_id_from_storage;

            getFromStorage("user_metadata").then((user_metadata_from_storage) => {
                console.log("user_metadata_from_storage:", user_metadata_from_storage);
                let user_metadata = user_metadata_from_storage ?? {};

                const data = {
                    conversation_id: conversation_id,
                    bot_msgs: data_short.bot_msgs,
                    user_msgs: data_short.user_msgs,
                    page_url: data_short.page_url,
                    user_id: user_id,
                    user_metadata: user_metadata,
                    timestamp: data_short.timestamp,
                    conversation_metadata: conversation_metadata,
                };
                console.log("data:", data);
                fetch(API_URL, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(data),
                })
                    .then((response) => {
                        if (!response.ok) {
                            throw new Error("Network response was not ok");
                        }
                        console.log("response", response);
                        return response.json();
                    })
                    .then((data) => {
                        console.log("data", data);
                        // conversation_id = data.conversation_id;
                    })
                    .catch((error) => {
                        console.error("Error:", error);
                    });
            });
        });
    });
}

function removeInvalidAndPostToDb(checkInterval = true) {
    console.log("removeInvalidAndPostToDb()");
    const currentTime = new Date();

    // Iterate over conversation IDs. Get local_db_ids from storage
    getFromStorage("local_db_ids").then((local_db_from_storage) => {
        local_db_ids = local_db_from_storage ?? local_db_ids;
        console.log("iterating over local_db_ids", local_db_ids);
        local_db_ids.forEach(async (conversationId) => {
            // Retrieve the conversation object from storage
            getFromStorage(conversationId).then((conversation) => {
                if (conversation === null) {
                    console.log("conversation is null");
                    console.log("removing conversation from local_db_ids");
                    chrome.storage.local.remove([conversationId], () => {
                        if (chrome.runtime.lastError) {
                            console.error("Error removing conversation from storage", chrome.runtime.lastError);
                        } else {
                            console.log("conversation removed from storage");
                        }
                    });
                    const index = local_db_ids.indexOf(conversationId);
                    if (index > -1) { // only splice array when item is found
                        local_db_ids.splice(index, 1); // 2nd parameter means remove one item only
                        saveToStorage("local_db_ids", local_db_ids);
                    }
                } else {
                    console.log("conversation:", conversation);
                    if (!checkInterval || isTimestampOlderThanXHours(conversation.timestamp, currentTime, 24)) {
                        // ask the background script to remove the conversation
                        console.log("removing conversation");
                        // chrome.runtime.sendMessage({type: "update_local_db_ids", id_to_remove: conversationId}, function (response) {
                        //     console.log(response);
                        // });
                        chrome.storage.local.remove([conversationId], () => {
                            if (chrome.runtime.lastError) {
                                console.error("Error removing conversation from storage", chrome.runtime.lastError);
                            } else {
                                console.log("conversation removed from storage");
                            }
                        });
                        const index = local_db_ids.indexOf(conversationId);
                        if (index > -1) { // only splice array when item is found
                            local_db_ids.splice(index, 1); // 2nd parameter means remove one item only
                            saveToStorage("local_db_ids", local_db_ids);
                        }
                        // Post to the DB
                        console.log("posting conversation to DB");
                        sendConversation(conversationId, conversation);
                    }
                }
            });
        });
    });
}

// Function to check if a timestamp is older than one hour
function isTimestampOlderThanXHours(timestamp, currentTimeToCheck, numHours) {
    const HoursInMillis = 60 * 60 * 1000 * numHours;
    return (new Date(currentTimeToCheck) - new Date(timestamp)) > HoursInMillis;
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

handleLocalDbIds();
