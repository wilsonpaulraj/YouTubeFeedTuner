// YTEnhancer Utils - Common utility functions used across features
window.YTEnhancer = window.YTEnhancer || {};
window.YTEnhancer.Utils = {};

/**
 * Get the current YouTube video ID from the URL
 * @returns {string|null} The video ID or null if not on a video page
 */
window.YTEnhancer.Utils.getCurrentVideoId = function () {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v');
};

/**
 * Check if the user is currently watching a YouTube video
 * @returns {boolean} True if watching a video, false otherwise
 */
window.YTEnhancer.Utils.isWatchingVideo = function () {
    return !!window.YTEnhancer.Utils.getCurrentVideoId();
};

/**
 * Show a toast notification
 * @param {string} message - The message to display
 */
window.YTEnhancer.Utils.showToast = function (message) {
    // Create toast element if it doesn't exist
    let toast = document.getElementById('yt-enhancer-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'yt-enhancer-toast';
        toast.style.cssText = `
            position: absolute;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%) translateY(100%);
            background-color: #3a86ff;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            z-index: 30001;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            opacity: 0;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            text-align: center;
            width: 90%;
            max-width: 300px;
            word-wrap: break-word;
            pointer-events: none;
        `;
    }

    // Find the sidebar container
    const sidebarContainer = document.getElementById('sidebar-container');
    if (!sidebarContainer) return;

    // Append toast to sidebar if it's not already there
    if (!toast.parentElement) {
        sidebarContainer.appendChild(toast);
    }

    // Set message and show toast
    toast.textContent = message;

    // Use requestAnimationFrame to batch DOM operations
    requestAnimationFrame(() => {
        // First make the toast invisible but present
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(100%)';

        // Then in the next frame, animate it in
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(-50%) translateY(0)';

            // Hide toast after 2 seconds with animation
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(-50%) translateY(100%)';
            }, 2000);
        });
    });
};


window.YTEnhancer.Utils.showTranscriptError = function (feature) {
    const element = document.getElementById(feature === 'summary' ? 'summary' : 'chapters-list');
    if (!element) return;

    element.innerHTML = `
        <div class="no-transcript-message" style="text-align: center; padding: 20px;">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto;">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <p style="font-size: 16px; margin: 10px 0;">This video doesn't have a transcript available.</p>
            <p class="secondary-text" style="font-size: 14px; color: #666;">Try videos with captions or subtitles enabled.</p>
        </div>
    `;
}

// Format seconds into a time string (HH:MM:SS or MM:SS)
window.YTEnhancer.Utils.formatTime = function (seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    let timeString = '';
    if (hrs > 0) {
        timeString += `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
        timeString += `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    return timeString;
};
