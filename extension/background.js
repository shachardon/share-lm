// background.js

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Ensure the tab has finished loading
    console.log("changeInfo", changeInfo);
    if (changeInfo.status === 'complete') {
        handleIconStatus(tabId);
        updateSharingStatus(tabId);
    }
});

chrome.tabs.onActivated.addListener((activeInfo) => {
    console.log("activeInfo", activeInfo);
    handleIconStatus(activeInfo.tabId);
    updateSharingStatus(activeInfo.tabId);
});


// Define a function to change the extension icon
function changeIcon(activate) {
    console.log("changeIcon");
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
        console.log(tab.url);
        if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError);
            return;
        }

        // Send a message to the content script
        console.log("sending message to content script", tab.id);
        chrome.tabs.sendMessage(tab.id, { type: "gradio?" }, function(response) {
            if (chrome.runtime.lastError) {
                console.log("probably should wait", chrome.runtime.lastError);
            }
            console.log("response", response);
            if (response && response.gradio) {
                changeIcon(true);
            } else {
                changeIcon(false);
            }
        });
    });
}

function updateSharingStatus(tabId) {
    chrome.tabs.get(tabId, (tab) => {
        console.log(tab.url);
        if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError);
            return;
        }

        // Send a message to the content script
        console.log("sending message to content script", tab.id);
        chrome.tabs.sendMessage(tab.id, { type: "update?" }, function(response) {
            if (chrome.runtime.lastError) {
                console.log("probably should wait", chrome.runtime.lastError);
            }
            console.log("response", response);
        });
    });}

function handleLocalDbIds() {
    console.log("handleLocalDbIds");
    // load local_db_ids from storage
    let local_db_ids = [];
    getFromStorage("local_db_ids").then((local_db_ids_from_storage) => {
        if (local_db_ids !== null) {
            local_db_ids = local_db_ids_from_storage;
        }
    });
    // handle local_db_ids updates requests
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === "update_local_db_ids") {
            console.log("update_local_db_ids");
            if (request.id_to_add) {
                local_db_ids.push(request.id_to_add);
                saveToStorage("local_db_ids", local_db_ids);
                sendResponse({ local_db_ids: local_db_ids });
            }
            if (request.id_to_remove) {
                const index = local_db_ids.indexOf(request.id_to_remove);
                if (index > -1) { // only splice array when item is found
                    local_db_ids.splice(index, 1); // 2nd parameter means remove one item only
                }
                saveToStorage("local_db_ids", local_db_ids);
                sendResponse({ local_db_ids: local_db_ids });
            }
        }
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
