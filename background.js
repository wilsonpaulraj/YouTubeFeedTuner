chrome.runtime.onInstalled.addListener(() => {
    // No initialization needed now that we've removed sponsors feature
});

// Ensure content script is injected only when YouTube loads completely
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!tab || !tab.url || typeof tab.url !== 'string') return;

    // Ignore Chrome internal pages
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('about:')) return;

    // Inject only when a YouTube page finishes loading
    if (changeInfo.status === 'complete' && tab.url.includes('youtube.com')) {
        chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
                // Ensure script is injected only once per page
                if (!window.scriptInjected) {
                    window.scriptInjected = true;
                    const script = document.createElement('script');
                    script.src = chrome.runtime.getURL('content.js');
                    document.documentElement.appendChild(script);
                }
            }
        }).catch((error) => {
            console.warn("Content script injection failed:", error);
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
