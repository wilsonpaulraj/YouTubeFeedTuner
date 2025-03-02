console.log('Content script loaded');

async function waitForTranscriptButton(timeout = 10000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        const buttons = Array.from(document.querySelectorAll('button'));
        const transcriptButton = buttons.find(btn => btn.textContent.includes('Show transcript'));
        if (transcriptButton) {
            console.log('Transcript button found!');
            return transcriptButton;
        }
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw new Error('Timeout: Transcript button not found');
}

async function getTranscript() {
    try {
        console.log('Attempting to get transcript');
        console.log('Waiting for transcript button...');
        const transcriptButton = await waitForTranscriptButton();

        if (!transcriptButton) {
            console.log('Transcript button not found');
            return 'NO_TRANSCRIPT';
        }

        transcriptButton.click();
        console.log('Clicked transcript button');

        await new Promise(resolve => setTimeout(resolve, 2000));
        console.log('Waiting for 2 seconds');

        const transcriptContainer = document.querySelectorAll('ytd-transcript-segment-renderer');
        if (!transcriptContainer || transcriptContainer.length === 0) {
            console.log('Transcript container not found');
            return 'NO_TRANSCRIPT';
        }
        let transcript = "";
        for (let i = 0; i < transcriptContainer.length; i++) {
            transcript += transcriptContainer[i].innerText.split('\n').slice(1).join('\n') + ' ';
        }
        console.log('Last Transcript:', transcriptContainer[transcriptContainer.length - 12]?.innerText || 'No transcript segments found');
        return transcript.trim() ? transcript : 'NO_TRANSCRIPT';
    } catch (error) {
        console.error('Error fetching transcript:', error);
        return 'NO_TRANSCRIPT';
    }
}

async function getLLMResponse(prompt) {
    const API_KEY = 'AIzaSyB8Ha0uHwNqFfVoD9iAjCQbH4Yb9rbGSO8';
    const RATE_LIMIT_DELAY = 1000;
    let lastRequestTime = 0;

    const MAX_RETRIES = 3;
    let retries = 0;

    while (retries < MAX_RETRIES) {
        try {
            console.log(`Attempt ${retries + 1} of ${MAX_RETRIES}`);

            if (retries > 0) {
                const backoffDelay = RATE_LIMIT_DELAY * Math.pow(2, retries);
                console.log(`Retry backoff: waiting ${backoffDelay}ms`);
                await new Promise(resolve => setTimeout(resolve, backoffDelay));
            }

            const now = Date.now();
            const timeSinceLastRequest = now - lastRequestTime;
            if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
                const waitTime = RATE_LIMIT_DELAY - timeSinceLastRequest;
                console.log(`Rate limit: waiting ${waitTime}ms`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
            lastRequestTime = Date.now();

            console.log('Making API request...', {
                timestamp: new Date().toISOString(),
                prompt: prompt.substring(0, 50) + '...'
            });

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${API_KEY}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }]
                })
            });

            if (!response.ok) {
                throw new Error(`API request failed with status ${response.status}`);
            }

            const data = await response.json();
            console.log('API response received:', data);

            const generatedCode = data.candidates[0].content.parts[0].text;
            console.log("Generated Code:\n", generatedCode);
            return generatedCode;

        } catch (error) {
            console.error('Error in API request:', {
                error: error.message,
                retry: retries + 1,
                maxRetries: MAX_RETRIES
            });

            retries++;
            if (retries === MAX_RETRIES || !error.message.includes('429')) {
                throw error;
            }
        }
    }
}

function parseMarkdown(markdown) {
    return markdown
        .replace(/(?:\r\n|\r|\n)/g, '<br>') // Line breaks
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold: **text**
        .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italics: *text*
        .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>'); // Links: [text](url)
}

async function getSummary(transcript) {
    const prompt = `
        You are an expert summarizer of YouTube transcripts.  Provide a concise and informative summary of the *content* of the following transcript. Focus on the key information, arguments, and topics discussed.  Avoid phrases like "This video explains..." or "The speaker discusses...".  Instead, directly present the information as if you were explaining it to someone.

        Transcript:
        ${transcript}
        `;

    try {
        console.log('Attempting to get summary');
        const response = await getLLMResponse(prompt);
        console.log('Summary fetched:', response);
        return response;
    } catch (error) {
        console.error('Error fetching summary:', error);
        return 'Error fetching summary';
    }
}


function addSidebarToggleButtonToNavbar() {
    const buttonsContainer = document.querySelector('#buttons.style-scope.ytd-masthead');
    const existingButton = document.getElementById('sidebar-toggle-icon');

    // Ensure the container exists and the button is not already there
    if (!buttonsContainer || existingButton) {
        return; // Exit early if the container doesn't exist or button already exists
    }

    const sidebarToggleButton = document.createElement('div');
    sidebarToggleButton.id = 'sidebar-toggle-icon';
    sidebarToggleButton.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 5h16M4 12h10M4 19h7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M19 15l-4 4l-2-2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
    `;
    sidebarToggleButton.style.cssText = `
    width: 24px;
    height: 24px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #FF0000; /* Bright red */
    transition: filter 0.3s ease; /* Use filter for icon glow */
    filter: drop-shadow(0 0 5px #FF0000) drop-shadow(0 0 10px #FF0000); /* Initial glow */
`;

    sidebarToggleButton.addEventListener('mouseenter', () => {
        sidebarToggleButton.style.filter = 'drop-shadow(0 0 8px #FF4500) drop-shadow(0 0 15px #FF4500)'; // Stronger glow on hover
        sidebarToggleButton.style.color = '#FF4500'; // Slightly lighter red on hover
    });

    sidebarToggleButton.addEventListener('mouseleave', () => {
        sidebarToggleButton.style.filter = 'drop-shadow(0 0 5px #FF0000) drop-shadow(0 0 10px #FF0000)'; // Original glow
        sidebarToggleButton.style.color = '#FF0000';
    });

    sidebarToggleButton.addEventListener('click', () => {
        fetchAndInjectSidebar();
    });

    buttonsContainer.appendChild(sidebarToggleButton);
    console.log('Floating icon added');
}

// Debounce function to avoid multiple rapid calls
function debounce(func, delay) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), delay);
    };
}

// Initial injection with a small delay
setTimeout(() => {
    addSidebarToggleButtonToNavbar();
}, 1000);

// Re-add icon after soft navigations, but only if it doesn't exist
document.addEventListener('yt-navigate-finish', debounce(() => {
    console.log('Page navigation detected');
    if (!document.getElementById('sidebar-toggle-icon')) {
        console.log('Adding sidebar toggle icon after navigation');
        addSidebarToggleButtonToNavbar();
    } else {
        console.log('Sidebar toggle icon already exists, skipping');
    }
}, 300));


function setupVideoNavigationWatcher() {
    // Store the current video ID to detect changes
    let currentVideoId = getCurrentVideoId();

    // Function to check if video has changed
    const checkVideoChange = () => {
        const newVideoId = getCurrentVideoId();

        // If video ID changed (including from null to a value)
        if (newVideoId !== currentVideoId) {
            console.log('Video changed from', currentVideoId, 'to', newVideoId);
            currentVideoId = newVideoId;

            // Update sidebar if it exists
            const sidebar = document.getElementById('sidebar-container');
            if (sidebar) {
                resetSummaryView();

                // If we navigated to a valid video, also check for stored summary
                if (newVideoId) {
                    retrieveSummary().then(existingSummary => {
                        if (existingSummary) {
                            const summaryElement = document.getElementById('summary');
                            if (summaryElement) {
                                summaryElement.innerHTML = parseMarkdown(existingSummary.text);
                                updateTags(existingSummary.readingTime);
                                console.log('Loaded stored summary for new video');
                            }
                        }
                    });
                }
            }
        }
    };

    // Check on YouTube navigation events
    document.addEventListener('yt-navigate-finish', () => {
        setTimeout(checkVideoChange, 500); // Slight delay to ensure URL is updated
    });

    // Also set up a regular polling as a fallback (some navigations might not trigger events)
    setInterval(checkVideoChange, 2000);
}

// Add a hover trigger zone to the right side of the screen
function addHoverTriggerZone() {
    // Remove any existing trigger zone
    const existingTrigger = document.getElementById('sidebar-hover-trigger');
    if (existingTrigger) {
        existingTrigger.remove();
    }

    // Create a new trigger zone
    const triggerZone = document.createElement('div');
    triggerZone.id = 'sidebar-hover-trigger';
    triggerZone.style.cssText = `
        position: fixed;
        top: 0;
        right: 0;
        width: 20px;
        height: 100%;
        z-index: 9000;
        opacity: 0;
    `;

    // Add hover event listeners
    triggerZone.addEventListener('mouseenter', () => {
        console.log('Hover detected on trigger zone');
        fetchAndInjectSidebarWithAnimation();
    });

    document.body.appendChild(triggerZone);
    console.log('Hover trigger zone added');
}

// Modified sidebar injection with animation
async function fetchAndInjectSidebarWithAnimation() {
    try {
        // Check if sidebar already exists
        let sidebar = document.getElementById('sidebar-container');
        if (sidebar) {
            return;
        }

        // Ensure the extension context is still valid
        if (!chrome.runtime?.getURL) {
            throw new Error('Extension context invalidated.');
        }

        // Fetch sidebar HTML
        const response = await fetch(chrome.runtime.getURL('ui/sidebar.html'));
        if (!response.ok) {
            throw new Error(`Failed to fetch sidebar.html: ${response.status}`);
        }
        const sidebarHTML = await response.text();

        // Inject new sidebar
        sidebar = document.createElement('div');
        sidebar.id = 'sidebar-container';
        sidebar.innerHTML = sidebarHTML;
        document.body.appendChild(sidebar);
        sidebar.style.cssText = `z-index: 4999;`;

        // Add sidebar stylesheet
        if (!document.getElementById('sidebar-styles')) {
            const link = document.createElement('link');
            link.id = 'sidebar-styles';
            link.rel = 'stylesheet';
            link.href = chrome.runtime.getURL('ui/sidebar.css');
            document.head.appendChild(link);
        }

        // Event listeners
        const closeButton = document.getElementById('close-sidebar');
        if (closeButton) {
            closeButton.addEventListener('click', () => {
                closeSidebarWithAnimation();
            });
        }

        const refreshButton = document.getElementById('refresh-button');
        if (refreshButton) {
            refreshButton.addEventListener('click', () => {
                resetSummaryView();
                clearSummary();
            });
        }

        // Create a close trigger zone outside the sidebar
        const closeTrigger = document.createElement('div');
        closeTrigger.id = 'sidebar-close-trigger';
        closeTrigger.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: calc(100% - 350px);
            height: 100%;
            z-index: 8999;
            opacity: 0;
        `;
        closeTrigger.addEventListener('click', () => {
            closeSidebarWithAnimation();
        });
        document.body.appendChild(closeTrigger);

        // Load stored summary for the current video
        const existingSummary = await retrieveSummary();
        if (existingSummary) {
            const summaryElement = document.getElementById('summary');
            if (summaryElement) {
                summaryElement.innerHTML = parseMarkdown(existingSummary.text);
            }
            updateTags(existingSummary.readingTime);
            console.log('Loaded stored summary for current video');
        } else {
            resetSummaryView();
        }

        // Set up the video navigation watcher to auto-update the sidebar
        setupVideoNavigationWatcher();

    } catch (error) {
        console.error('Failed to load sidebar:', error);
    }
}

// Function to close sidebar with animation
function closeSidebarWithAnimation() {
    const sidebar = document.getElementById('sidebar-container');
    if (!sidebar) return;

    // Add the closing class to trigger the animation
    sidebar.classList.add('closing');

    // Wait for the animation to complete before removing the element
    sidebar.addEventListener('animationend', () => {
        sidebar.remove();

        // Also remove the close trigger
        const closeTrigger = document.getElementById('sidebar-close-trigger');
        if (closeTrigger) closeTrigger.remove();
    }, { once: true }); // Ensures the event listener is removed after firing once
}


// Update existing function to use the new animation version
function fetchAndInjectSidebar() {
    fetchAndInjectSidebarWithAnimation();
}

// Handle escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeSidebarWithAnimation();
    }
});

// Modify the existing observer code to also add the hover trigger
if (!window.observerInitialized) {
    const observer = new MutationObserver(debounce(() => {
        // Add the sidebar button if it doesn't exist
        if (!document.getElementById('sidebar-toggle-icon')) {
            addSidebarToggleButtonToNavbar();
        }

        // Add the hover trigger if it doesn't exist
        if (!document.getElementById('sidebar-hover-trigger')) {
            addHoverTriggerZone();
        }
    }, 300));

    // Observe the necessary part of the DOM
    const targetNode = document.querySelector('ytd-app') || document.body;
    observer.observe(targetNode, {
        childList: true,
        subtree: true
    });

    window.observerInitialized = true;
    console.log('Observer initialized with improved targeting');
}

// Initial setup
setTimeout(() => {
    addSidebarToggleButtonToNavbar();
    addHoverTriggerZone();
}, 1000);

// Add the navigation event listener to also ensure hover trigger exists
document.addEventListener('yt-navigate-finish', debounce(() => {
    console.log('Page navigation detected');

    // Add sidebar button if needed
    if (!document.getElementById('sidebar-toggle-icon')) {
        console.log('Adding sidebar toggle icon after navigation');
        addSidebarToggleButtonToNavbar();
    }

    // Add hover trigger if needed
    if (!document.getElementById('sidebar-hover-trigger')) {
        console.log('Adding hover trigger after navigation');
        addHoverTriggerZone();
    }
}, 300));

function isWatchingVideo() {
    // Check if we're on a watch page with a video ID
    return window.location.pathname === '/watch' && new URLSearchParams(window.location.search).get('v');
}

function resetSummaryView() {
    const summaryElement = document.getElementById('summary');
    if (!summaryElement) return;

    if (!isWatchingVideo()) {
        // User is not watching a video - show disabled state
        summaryElement.innerHTML = `
            <div class="generate-summary-container">
                <button id="generate-summary-button" class="generate-button disabled" disabled>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                        <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                    Generate Summary
                </button>
                <p class="info-text">You have to open a video to get it's summary</p>
            </div>
        `;
    } else {
        // User is watching a video - show active state
        summaryElement.innerHTML = `
            <div class="generate-summary-container">
                <button id="generate-summary-button" class="generate-button">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                        <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                    Generate Summary
                </button>
                <p class="info-text">Click the button above to analyze the video and generate an AI summary.</p>
            </div>
        `;

        // Re-add the event listener to the new button
        setupGenerateSummaryButton();
    }
}

function setupGenerateSummaryButton() {
    const generateButton = document.getElementById('generate-summary-button');
    if (generateButton) {
        generateButton.addEventListener('click', () => {
            document.getElementById('summary').innerHTML = getLoadingState();
            fetchAndDisplaySummary();
        });
    }
}

async function fetchAndDisplaySummary() {
    try {
        if (!isWatchingVideo()) {
            document.getElementById('summary').innerHTML = `
                <div class="no-video-message">
                    <p>Please navigate to a YouTube video to generate a summary.</p>
                </div>
            `;
            return;
        }

        const videoId = getCurrentVideoId();

        const existingSummary = await retrieveSummary();
        if (existingSummary) {
            document.getElementById('summary').innerHTML = parseMarkdown(existingSummary.text);
            updateTags(existingSummary.readingTime);
            console.log('Retrieved summary from storage');
            return;
        }

        const transcript = await getTranscript();
        if (transcript && transcript !== "NO_TRANSCRIPT") {
            const summary = await getSummary(transcript);
            const readingTime = calculateReadingTime(summary);

            storeSummary(summary, readingTime); // Persist to local storage

            document.getElementById('summary').innerHTML = parseMarkdown(summary);
            updateTags(readingTime);
        } else {
            // Show user-friendly message when no transcript is found
            document.getElementById('summary').innerHTML = `
                <div class="no-transcript-message">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <p>Unable to generate summary because this video doesn't have a transcript.</p>
                    <p class="secondary-text">Try videos with captions or subtitles enabled.</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Failed to fetch summary:', error);
        document.getElementById('summary').innerHTML = `
            <div class="error-message">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d32f2f" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <p>Something went wrong while generating the summary.</p>
                <p class="secondary-text">Please try again later.</p>
            </div>
        `;
    }
}

function calculateReadingTime(text) {
    const words = text.split(/\s+/).length;
    const readingTime = Math.ceil(words / 200); // 200 words per minute
    return readingTime;
}

function updateTags(readingTime) {
    const tagContainer = document.querySelector('.tag2');
    if (tagContainer) {
        tagContainer.innerText = readingTime + " min";
        tagContainer.classList.add('tag');
    }
}

function getLoadingState() {
    return `
        <div class="loading-state">
            <div class="spinner"></div>
            <p>AI is analyzing the video...</p>
            <div class="progress-bar">
                <div class="progress" style="width: 60%;"></div>
            </div>
        </div>
    `;
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const sidebar = document.getElementById('sidebar-container');
        if (sidebar) {
            sidebar.remove();
        }
    }
});

// Get current video ID
function getCurrentVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v');
}

// Store summary
async function storeSummary(summary, readingTime) {
    const videoId = getCurrentVideoId();
    if (!videoId) return;

    await chrome.storage.local.set({
        [videoId]: { text: summary, readingTime }
    });
    console.log('Stored summary for video:', videoId);
}

// Retrieve summary
async function retrieveSummary() {
    const videoId = getCurrentVideoId();
    if (!videoId) return null;

    const data = await chrome.storage.local.get(videoId);
    return data[videoId] || null; // Return summary only if it matches current video
}

// Clear summary
async function clearSummary() {
    const videoId = getCurrentVideoId();
    if (!videoId) {
        console.error('No video ID found.');
        return;
    }
    await chrome.storage.local.remove([videoId]);
    console.log('Cleared summary for video:', videoId);
}
