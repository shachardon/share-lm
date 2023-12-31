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