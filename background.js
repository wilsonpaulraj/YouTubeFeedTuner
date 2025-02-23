chrome.action.onClicked.addListener((tab) => {
    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
    });
});

// background.js
// chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
//     if (tab.url && tab.url.includes("youtube.com/watch")) {
//         // Only inject if we're on a YouTube video page
//         if (changeInfo.status === 'complete') {
//             chrome.scripting.executeScript({
//                 target: { tabId: tabId },
//                 files: ['content.js']
//             });
//         }
//     }
// });
