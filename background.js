chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed');
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url.includes('youtube.com')) {
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content.js']
        });
    }
});
