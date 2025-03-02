chrome.runtime.onInstalled.addListener(() => {
    console.log('YouTube Enhancer extension installed!');
    
    // Initialize default settings
    chrome.storage.local.get('autoSkipSponsors', (data) => {
        if (data.autoSkipSponsors === undefined) {
            chrome.storage.local.set({ autoSkipSponsors: false });
        }
    });
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

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'download_notes') {
        chrome.downloads.download({
            url: request.url,
            filename: request.filename,
            saveAs: true
        });
        return true;
    }
});
