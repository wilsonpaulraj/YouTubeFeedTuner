chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed. updatereffejv  !!!');
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab && tab.url && tab.url.startsWith('chrome://extensions')) {
        return;
    }
    else if (!tab || !tab.url || typeof tab.url !== 'string') {
        return;
    }
    else if (changeInfo.status === 'complete' && tab.url.indexOf('youtube.com') !== -1) {
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content.js']
        });
    }
});
