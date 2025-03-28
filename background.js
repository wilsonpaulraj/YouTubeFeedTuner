chrome.runtime.onInstalled.addListener(() => {
    console.log('YouTube Enhancer extension installed!');

    // Initialize default settings
    chrome.storage.local.get('autoSkipSponsors', (data) => {
        if (data.autoSkipSponsors === undefined) {
            chrome.storage.local.set({ autoSkipSponsors: false });
        }
    });
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
