// Transcript Feature Functions
window.YTEnhancer = window.YTEnhancer || {};
window.YTEnhancer.Transcript = {};

// Wait for transcript button to appear on the YouTube interface
async function waitForTranscriptButton(timeout = 5000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        const buttons = Array.from(document.querySelectorAll('button'));
        const transcriptButton = buttons.find(btn => btn.textContent.includes('Show transcript'));
        if (transcriptButton) {
            // console.log('Transcript button found!');
            return transcriptButton;
        }
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw new Error('Timeout: Transcript button not found');
}

// Initialize transcript cache
window.YTEnhancer.Transcript.transcriptCache = new Map();
window.YTEnhancer.Transcript.loadingPromise = null;

// Main function to get transcript
window.YTEnhancer.Transcript.getTranscript = async function (videoId, forceRefresh = false) {
    // If we have a cached transcript and don't need to refresh, return it
    if (!forceRefresh && window.YTEnhancer.Transcript.transcriptCache.has(videoId)) {
        return window.YTEnhancer.Transcript.transcriptCache.get(videoId);
    }

    // If there's already a loading operation in progress, return that promise
    if (window.YTEnhancer.Transcript.loadingPromise) {
        return window.YTEnhancer.Transcript.loadingPromise;
    }

    // Start new loading operation
    window.YTEnhancer.Transcript.loadingPromise = window.YTEnhancer.Transcript.loadTranscript(videoId);

    try {
        const transcript = await window.YTEnhancer.Transcript.loadingPromise;
        window.YTEnhancer.Transcript.transcriptCache.set(videoId, transcript);
        return transcript;
    } finally {
        window.YTEnhancer.Transcript.loadingPromise = null;
    }
};

// Load transcript either from storage or by fetching new
window.YTEnhancer.Transcript.loadTranscript = async function (videoId) {
    // First try to get from storage
    const storedTranscript = await window.YTEnhancer.Transcript.retrieveTranscript(videoId);
    if (storedTranscript) {
        return storedTranscript;
    }

    // If not in storage, fetch new transcript
    const transcript = await window.YTEnhancer.Transcript.fetchTranscript();
    if (transcript) {
        await window.YTEnhancer.Transcript.storeTranscript(videoId, transcript);
    }
    return transcript;
};

// Store transcript in Chrome local storage
window.YTEnhancer.Transcript.storeTranscript = async function (videoId, transcript) {
    if (!videoId) {
        // console.error('No video ID available to store transcript');
        return;
    }
    try {
        await chrome.storage.local.set({
            [`transcript_${videoId}`]: transcript
        });
        // console.log('Successfully stored transcript for video:', videoId);
    } catch (error) {
        // console.error('Error storing transcript:', error);
    }
};

// Retrieve transcript from Chrome local storage
window.YTEnhancer.Transcript.retrieveTranscript = async function (videoId) {
    if (!videoId) {
        // console.error('No video ID available to retrieve transcript');
        return null;
    }
    try {
        const data = await chrome.storage.local.get(`transcript_${videoId}`);
        const transcript = data[`transcript_${videoId}`];
        // console.log('Retrieved transcript for video:', videoId, transcript ? 'found' : 'not found');
        return transcript || null;
    } catch (error) {
        // console.error('Error retrieving transcript:', error);
        return null;
    }
};

// Fetch transcript from YouTube page
window.YTEnhancer.Transcript.fetchTranscript = async function () {
    try {
        const transcriptButton = await waitForTranscriptButton();
        if (!transcriptButton) {
            return null;
        }

        transcriptButton.click();
        await new Promise(resolve => setTimeout(resolve, 2000));

        const transcriptContainer = document.querySelectorAll('ytd-transcript-segment-renderer');
        if (!transcriptContainer.length) {
            const closeButton = document.querySelector('button[aria-label="Close transcript"]');
            if (closeButton) {
                closeButton.click();
            }
            return null;
        }

        let transcript = "";
        transcriptContainer.forEach(segment => {
            transcript += segment.innerText.split('\n').slice(1).join(' ') + ' ';
        });

        const closeButton = document.querySelector('button[aria-label="Close transcript"]');
        if (closeButton) {
            closeButton.click();
        }

        return transcript.trim();
    } catch (error) {
        // console.error('Error fetching transcript:', error);
        return null;
    }
};

// Clear transcript cache
window.YTEnhancer.Transcript.clearCache = function (videoId) {
    if (videoId) {
        window.YTEnhancer.Transcript.transcriptCache.delete(videoId);
    } else {
        window.YTEnhancer.Transcript.transcriptCache.clear();
    }
};

// Public wrapper function for use by other modules
window.YTEnhancer.Transcript.getVideoTranscript = async function (showToastOnError = true) {
    const videoId = window.YTEnhancer.Utils.getCurrentVideoId();
    if (!videoId) {
        console.error('No video ID available for transcript');
        return 'Transcript not available';
    }

    try {
        // First try to get from storage
        const storedTranscript = await window.YTEnhancer.Transcript.retrieveTranscript(videoId);
        if (storedTranscript) {
            console.log('Retrieved transcript from storage for video:', videoId, 'length:', storedTranscript.length);
            return storedTranscript;
        }

        // If not in storage, try to fetch new transcript
        console.log('No stored transcript found, fetching from YouTube...');
        const transcript = await window.YTEnhancer.Transcript.fetchTranscript();

        if (!transcript) {
            console.error('Failed to fetch transcript for video:', videoId);
            if (showToastOnError) {
                window.YTEnhancer.Utils.showToast('Failed to load transcript. This video may not have captions available.');
            }
            return 'Transcript not available';
        }

        // Store the fetched transcript
        await window.YTEnhancer.Transcript.storeTranscript(videoId, transcript);
        console.log('Successfully fetched and stored transcript for video:', videoId, 'length:', transcript.length);
        return transcript;
    } catch (error) {
        console.error('Error getting transcript:', error);
        if (showToastOnError) {
            window.YTEnhancer.Utils.showToast('Error loading transcript. Please refresh the page.');
        }
        return 'Transcript not available';
    }
};
