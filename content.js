console.log('Content script loaded');

// Note-taking functionality

async function saveNotes(notes) {
    const videoId = getCurrentVideoId();
    await chrome.storage.local.set({
        [`notes_${videoId}`]: notes
    });
    console.log('Saved notes for video:', videoId);
}

async function retrieveNotes() {
    const videoId = getCurrentVideoId();
    const data = await chrome.storage.local.get(`notes_${videoId}`);
    return data[`notes_${videoId}`] || '';
}

function setupNotesFeature() {
    const notesArea = document.getElementById('notes-area');
    const saveNotesButton = document.getElementById('save-notes-button');
    const addTimestampButton = document.getElementById('add-timestamp-button');
    const exportNotesButton = document.getElementById('export-notes-button');

    if (!notesArea || !saveNotesButton || !addTimestampButton || !exportNotesButton) {
        console.error('One or more notes elements not found');
        return;
    }

    // Load saved notes
    retrieveNotes().then(notes => {
        if (notes) {
            notesArea.value = notes;
        }
    });

    // Auto-save notes when typing stops
    let saveTimeout;
    notesArea.addEventListener('input', () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            saveNotes(notesArea.value);
        }, 1000); // Save 1 second after typing stops
    });

    // Save notes button
    saveNotesButton.addEventListener('click', () => {
        saveNotes(notesArea.value);
        showToast('Notes saved successfully!');
    });

    // Add timestamp button
    addTimestampButton.addEventListener('click', () => {
        const video = document.querySelector('video');
        if (video) {
            const currentTime = video.currentTime;
            const formattedTime = formatTime(currentTime);
            const timestampText = `[${formattedTime}] `;

            // Insert at cursor position or at the end
            const cursorPos = notesArea.selectionStart;
            const textBefore = notesArea.value.substring(0, cursorPos);
            const textAfter = notesArea.value.substring(cursorPos);

            notesArea.value = textBefore + timestampText + textAfter;
            notesArea.focus();
            notesArea.selectionStart = cursorPos + timestampText.length;
            notesArea.selectionEnd = cursorPos + timestampText.length;

            // Trigger save
            saveNotes(notesArea.value);
        }
    });

    // Export notes button
    exportNotesButton.addEventListener('click', () => {
        const videoTitle = document.querySelector('h1.title.style-scope.ytd-video-primary-info-renderer')?.textContent || 'YouTube Video';
        const cleanTitle = videoTitle.trim().replace(/[^\w\s-]/g, '');
        const filename = `${cleanTitle} - Notes.txt`;

        const blob = new Blob([notesArea.value], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();

        URL.revokeObjectURL(url);
        showToast('Notes exported successfully!');
    });
}

function formatTime(seconds) {
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
}

function showToast(message) {
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

    // Force a reflow to ensure the animation plays
    toast.offsetHeight;

    // Show toast with animation
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';

    // Hide toast after 4 seconds with animation
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(100%)';
    }, 1000);
}

// Video chapters generation functionality
async function generateChapters(transcript) {
    const prompt = `
        You are an expert at creating YouTube video chapters. Based on the following transcript,
        create 5-10 logical chapters for this video. Each chapter should have a timestamp and a
        descriptive title. Format your response as a JSON array of objects, each with "time" (in seconds)
        and "title" properties. Example: [{"time": 0, "title": "Introduction"}, {"time": 120, "title": "Main Topic"}]

        Important: Respond ONLY with the JSON array, no additional text or explanation.

        Transcript:
        ${transcript}
    `;

    try {
        console.log('Generating chapters...');
        const response = await getLLMResponse(prompt);
        console.log('Chapters response:', response);

        // Clean up the response to ensure it's valid JSON
        let cleanedResponse = response
            .replace(/\n/g, ' ')
            .replace(/\r/g, '')
            .replace(/\t/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        // Try to find JSON array in the response
        const jsonMatch = cleanedResponse.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            cleanedResponse = jsonMatch[0];
        }

        // Parse the JSON response
        let chapters;
        try {
            chapters = JSON.parse(cleanedResponse);

            // Validate the structure
            if (!Array.isArray(chapters)) {
                throw new Error('Response is not an array');
            }

            // Validate each chapter object
            chapters = chapters.filter(chapter => {
                return typeof chapter === 'object' &&
                    typeof chapter.time === 'number' &&
                    typeof chapter.title === 'string' &&
                    chapter.time >= 0;
            });

            if (chapters.length === 0) {
                throw new Error('No valid chapters found');
            }

            return chapters;
        } catch (parseError) {
            console.error('Error parsing chapters JSON:', parseError);
            return [];
        }
    } catch (error) {
        console.error('Error generating chapters:', error);
        return [];
    }
}

function displayChapters(chapters) {
    const chaptersList = document.getElementById('chapters-list');
    if (!chapters || chapters.length === 0) {
        chaptersList.innerHTML = '<p class="info-text">No chapters could be generated for this video.</p>';
        return;
    }

    let chaptersHTML = '';
    chapters.forEach(chapter => {
        chaptersHTML += `
            <div class="chapter-item" data-time="${chapter.time}">
                <span class="chapter-timestamp">${formatTime(chapter.time)}</span>
                <span class="chapter-title">${chapter.title}</span>
            </div>
        `;
    });

    chaptersList.innerHTML = chaptersHTML;

    // Add click event to jump to timestamp
    const chapterItems = chaptersList.querySelectorAll('.chapter-item');
    chapterItems.forEach(item => {
        item.addEventListener('click', () => {
            const time = parseFloat(item.dataset.time);
            const video = document.querySelector('video');
            if (video) {
                video.currentTime = time;
                video.play();
            }
        });
    });
}

async function storeChapters(chapters) {
    const videoId = getCurrentVideoId();
    await chrome.storage.local.set({
        [`chapters_${videoId}`]: chapters
    });
    console.log('Stored chapters for video:', videoId);
}

async function retrieveChapters() {
    const videoId = getCurrentVideoId();
    const data = await chrome.storage.local.get(`chapters_${videoId}`);
    return data[`chapters_${videoId}`] || null;
}

// Sponsor detection and blocking functionality
async function detectSponsors(transcript) {
    try {
        if (!transcript || transcript === "Transcript not available" || transcript === "Transcript not loaded" || transcript.trim() === "") {
            return null;
        }

        // Get video duration
        const video = document.querySelector('video');
        if (!video) {
            console.error('Video element not found');
            return null;
        }
        const videoDuration = video.duration;

        const prompt = `
        You are an expert at detecting sponsor segments in YouTube videos. Your task is to identify segments where the creator discusses sponsors, advertisements, or promotional content.

        Look for these specific indicators:
        1. Direct sponsor mentions: "this video is sponsored by", "thanks to our sponsor", "sponsored by"
        2. Product promotions: "check out", "try out", "use code", "discount code"
        3. Service promotions: "sign up for", "get started with", "try for free"
        4. Ad breaks: "before we continue", "let's take a break", "quick break"
        5. Promotional intros: "today's video is brought to you by", "special thanks to"
        6. Brand mentions: "visit [brand]", "go to [brand]", "check out [brand]"

        For each sponsor segment you find, estimate the start and end times. Format your response as a JSON array
        of objects, each with "start" (in seconds), "end" (in seconds), and "category" (e.g., "sponsor", "promo", "intro") properties.
        Example: [{"start": 120, "end": 180, "category": "sponsor"}]

        Important rules:
        1. Start time must be less than end time
        2. End time must not exceed video duration (${videoDuration} seconds)
        3. Start time must be 0 or greater
        4. Each segment should be at least 10 seconds long
        5. Maximum segment length should be 5 minutes
        6. Look for clear sponsor indicators in the text
        7. Don't include regular video content as sponsor segments
        8. Include the entire sponsor segment, from the start of the promotion to when they return to the main content
        9. If there are multiple sponsor mentions close together, combine them into one segment
        10. Be conservative - only mark segments that are clearly promotional

        Common patterns to look for:
        - "Before we continue, let's talk about..."
        - "This video is brought to you by..."
        - "Thanks to our sponsor..."
        - "Check out [product/service]..."
        - "Use code [code] for [discount]..."
        - "Link in description..."
        - "Sign up for [service]..."
        - "Try [product] for free..."

        If you don't find any sponsor segments, return an empty array: []

        Transcript:
        ${transcript}
    `;

        const response = await getLLMResponse(prompt);

        // Parse the JSON response
        let sponsors;
        try {
            // Find JSON in the response (in case there's explanatory text)
            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                sponsors = JSON.parse(jsonMatch[0]);
            } else {
                sponsors = JSON.parse(response);
            }
        } catch (parseError) {
            console.error('Error parsing sponsors JSON:', parseError);
            return null;
        }

        // Validate and clean up sponsor segments
        if (Array.isArray(sponsors)) {
            sponsors = sponsors.filter(sponsor => {
                // Basic validation
                if (!sponsor || typeof sponsor !== 'object') return false;
                if (!Number.isFinite(sponsor.start) || !Number.isFinite(sponsor.end)) return false;
                if (typeof sponsor.category !== 'string') return false;

                // Time validation
                const start = Math.max(0, Math.floor(sponsor.start));
                const end = Math.min(videoDuration, Math.floor(sponsor.end));

                // Segment length validation
                if (end - start < 10) return false; // Minimum 10 seconds
                if (end - start > 300) return false; // Maximum 5 minutes

                // Update with validated times
                sponsor.start = start;
                sponsor.end = end;
                return true;
            });

            // Sort segments by start time
            sponsors.sort((a, b) => a.start - b.start);

            // Merge overlapping segments
            const mergedSponsors = [];
            for (let i = 0; i < sponsors.length; i++) {
                if (mergedSponsors.length === 0 || mergedSponsors[mergedSponsors.length - 1].end < sponsors[i].start) {
                    mergedSponsors.push(sponsors[i]);
                } else {
                    // Merge with previous segment
                    const prev = mergedSponsors[mergedSponsors.length - 1];
                    prev.end = Math.max(prev.end, sponsors[i].end);
                    prev.category = `${prev.category}, ${sponsors[i].category}`;
                }
            }

            // Final validation to ensure segments make sense
            return mergedSponsors.filter(sponsor => {
                // Ensure segment doesn't start too early (usually sponsors start after intro)
                if (sponsor.start < 30) return false;

                // Ensure segment doesn't end too close to video end
                if (videoDuration - sponsor.end < 10) return false;

                // Ensure reasonable segment length
                const length = sponsor.end - sponsor.start;
                if (length < 15 || length > 300) return false;

                return true;
            });
        }

        return null;
    } catch (error) {
        console.error('Error detecting sponsors:', error);
        return null;
    }
}

function displaySponsors(sponsors) {
    const sponsorsList = document.getElementById('sponsors-list');
    if (!sponsors || sponsors.length === 0) {
        sponsorsList.innerHTML = '<p class="info-text">No sponsor segments detected in this video.</p>';
        return;
    }

    let sponsorsHTML = '';
    sponsors.forEach(sponsor => {
        sponsorsHTML += `
            <div class="sponsor-item" data-start="${sponsor.start}" data-end="${sponsor.end}">
                <div class="sponsor-time">
                    <span>${formatTime(sponsor.start)}</span>
                    <span>→</span>
                    <span>${formatTime(sponsor.end)}</span>
                </div>
                <div class="sponsor-category">${sponsor.category}</div>
                <button class="skip-sponsor-button">Skip</button>
            </div>
        `;
    });

    sponsorsList.innerHTML = sponsorsHTML;

    // Add click event to skip sponsor segments
    const skipButtons = sponsorsList.querySelectorAll('.skip-sponsor-button');
    skipButtons.forEach(button => {
        button.addEventListener('click', () => {
            const sponsorItem = button.closest('.sponsor-item');
            const endTime = parseFloat(sponsorItem.dataset.end);
            const video = document.querySelector('video');
            if (video) {
                video.currentTime = endTime;
                video.play();
            }
        });
    });
}

async function storeSponsors(sponsors) {
    const videoId = getCurrentVideoId();
    await chrome.storage.local.set({
        [`sponsors_${videoId}`]: sponsors
    });
    console.log('Stored sponsors for video:', videoId);
}

async function retrieveSponsors() {
    const videoId = getCurrentVideoId();
    const data = await chrome.storage.local.get(`sponsors_${videoId}`);
    return data[`sponsors_${videoId}`] || null;
}

function setupAutoSkipSponsors(sponsors) {
    const video = document.querySelector('video');
    if (!video || !sponsors || sponsors.length === 0) return;

    const sponsorBlockerToggle = document.getElementById('sponsor-blocker-toggle');
    let autoSkipEnabled = false;
    let lastSkippedTime = 0;

    // Check if auto-skip is enabled in storage
    chrome.storage.local.get('autoSkipSponsors', (data) => {
        autoSkipEnabled = data.autoSkipSponsors || false;
        sponsorBlockerToggle.checked = autoSkipEnabled;
    });

    // Toggle auto-skip
    sponsorBlockerToggle.addEventListener('change', () => {
        autoSkipEnabled = sponsorBlockerToggle.checked;
        chrome.storage.local.set({ autoSkipSponsors: autoSkipEnabled });
    });

    // Monitor video time and skip sponsors if enabled
    video.addEventListener('timeupdate', () => {
        if (!autoSkipEnabled) return;

        const currentTime = video.currentTime;

        // Prevent rapid skipping
        if (currentTime - lastSkippedTime < 1) return;

        for (const sponsor of sponsors) {
            // If we're at the start of a sponsor segment, skip to the end
            if (currentTime >= sponsor.start && currentTime < sponsor.end) {
                video.currentTime = sponsor.end;
                lastSkippedTime = sponsor.end;
                showToast(`Skipped ${sponsor.category} segment`);
                break;
            }
        }
    });
}

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

// Transcript handling module
const transcriptModule = (() => {
    const transcriptCache = new Map();
    let loadingPromise = null;

    async function getTranscript(videoId, forceRefresh = false) {
        // If we have a cached transcript and don't need to refresh, return it
        if (!forceRefresh && transcriptCache.has(videoId)) {
            return transcriptCache.get(videoId);
        }

        // If there's already a loading operation in progress, return that promise
        if (loadingPromise) {
            return loadingPromise;
        }

        // Start new loading operation
        loadingPromise = loadTranscript(videoId);

        try {
            const transcript = await loadingPromise;
            transcriptCache.set(videoId, transcript);
            return transcript;
        } finally {
            loadingPromise = null;
        }
    }

    async function loadTranscript(videoId) {
        // First try to get from storage
        const storedTranscript = await getStoredTranscript(videoId);
        if (storedTranscript) {
            return storedTranscript;
        }

        // If not in storage, fetch new transcript
        const transcript = await fetchTranscript();
        if (transcript) {
            await storeTranscript(videoId, transcript);
        }
        return transcript;
    }

    async function getStoredTranscript(videoId) {
        try {
            const data = await chrome.storage.local.get(`transcript_${videoId}`);
            return data[`transcript_${videoId}`] || null;
        } catch (error) {
            console.error('Error retrieving stored transcript:', error);
            return null;
        }
    }

    async function storeTranscript(videoId, transcript) {
        try {
            await chrome.storage.local.set({
                [`transcript_${videoId}`]: transcript
            });
        } catch (error) {
            console.error('Error storing transcript:', error);
        }
    }

    async function fetchTranscript() {
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
            console.error('Error fetching transcript:', error);
            return null;
        }
    }

    function clearCache(videoId) {
        if (videoId) {
            transcriptCache.delete(videoId);
        } else {
            transcriptCache.clear();
        }
    }

    return {
        getTranscript,
        clearCache
    };
})();

// Update the existing getTranscript function to use transcriptModule
async function getTranscript(showToastOnError = true) {
    const videoId = getCurrentVideoId();
    if (!videoId) {
        console.error('No video ID available');
        return 'Transcript not available';
    }

    try {
        const transcript = await transcriptModule.getTranscript(videoId);
        if (!transcript) {
            if (showToastOnError) {
                showToast('Failed to load transcript. Please try again.');
            }
            return 'Transcript not available';
        }
        return transcript;
    } catch (error) {
        console.error('Error getting transcript:', error);
        if (showToastOnError) {
            showToast('Error loading transcript. Please refresh the page.');
        }
        return 'Transcript not available';
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
            if (retries > 0) {
                const backoffDelay = RATE_LIMIT_DELAY * Math.pow(2, retries);
                await new Promise(resolve => setTimeout(resolve, backoffDelay));
            }

            const now = Date.now();
            const timeSinceLastRequest = now - lastRequestTime;
            if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
                const waitTime = RATE_LIMIT_DELAY - timeSinceLastRequest;
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
            lastRequestTime = Date.now();

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

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
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`API request failed with status ${response.status}`);
            }

            const data = await response.json();
            const generatedText = data.candidates[0].content.parts[0].text;

            // For summary requests, we don't need to validate JSON
            if (prompt.includes('summarizer')) {
                return generatedText;
            }

            // For other requests (chapters, sponsors), validate JSON
            try {
                // Try to find JSON in the response
                const jsonMatch = generatedText.match(/\[[\s\S]*\]/);
                if (jsonMatch) {
                    const jsonStr = jsonMatch[0];
                    // Clean up the JSON string
                    const cleanedJson = jsonStr
                        .replace(/\n/g, ' ')
                        .replace(/\r/g, '')
                        .replace(/\t/g, ' ')
                        .replace(/\s+/g, ' ')
                        .trim();

                    // Validate JSON
                    JSON.parse(cleanedJson);
                    return cleanedJson;
                } else {
                    // If no array found, try to parse the entire response
                    const cleanedJson = generatedText
                        .replace(/\n/g, ' ')
                        .replace(/\r/g, '')
                        .replace(/\t/g, ' ')
                        .replace(/\s+/g, ' ')
                        .trim();

                    JSON.parse(cleanedJson);
                    return cleanedJson;
                }
            } catch (parseError) {
                // If JSON parsing fails, try to extract just the array part
                const arrayMatch = generatedText.match(/\[[\s\S]*\]/);
                if (arrayMatch) {
                    try {
                        const cleanedJson = arrayMatch[0]
                            .replace(/\n/g, ' ')
                            .replace(/\r/g, '')
                            .replace(/\t/g, ' ')
                            .replace(/\s+/g, ' ')
                            .trim();

                        JSON.parse(cleanedJson);
                        return cleanedJson;
                    } catch (e) {
                        throw new Error('Invalid JSON response from API');
                    }
                }
                throw new Error('Invalid JSON response from API');
            }

        } catch (error) {
            if (error.name === 'AbortError') {
                showToast('Request timed out. Please try again.');
            } else if (error.message.includes('429')) {
                retries++;
                if (retries === MAX_RETRIES) {
                    showToast('Too many requests. Please try again later.');
                }
            } else if (error.message.includes('Invalid JSON')) {
                showToast('Received invalid response. Please try again.');
            } else {
                showToast('Failed to process request. Please try again.');
            }

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
    if (!transcript || transcript === 'Transcript not available' || transcript === 'Transcript not loaded') {
        console.error('Invalid transcript provided to getSummary');
        return 'Error: No valid transcript available';
    }

    const prompt = `
        You are an expert summarizer of YouTube transcripts. Provide a concise and informative summary of the *content* of the following transcript. Focus on the key information, arguments, and topics discussed. Avoid phrases like "This video explains..." or "The speaker discusses...". Instead, directly present the information as if you were explaining it to someone.

        Transcript:
        ${transcript}
        `;

    try {
        console.log('Attempting to get summary');
        const response = await getLLMResponse(prompt);
        console.log('Summary fetched successfully');
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
        return;
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
        adjustSidebarWidth();
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

// Initial injection
addSidebarToggleButtonToNavbar();

// Re-add icon after soft navigations
document.addEventListener('yt-navigate-finish', debounce(() => {
    console.log('Page navigation detected, adding sidebar toggle icon...');
    addSidebarToggleButtonToNavbar();
}, 200));

function setupVideoNavigationWatcher() {
    let currentVideoId = getCurrentVideoId();
    let watcherInterval;

    const checkVideoChange = async () => {
        try {
            const newVideoId = getCurrentVideoId();

            if (newVideoId !== currentVideoId) {
                currentVideoId = newVideoId;
                const sidebar = document.getElementById('sidebar-container');

                if (sidebar) {
                    try {
                        // Reset all views
                        resetSummaryView();
                        resetNotesView();
                        resetChaptersView();
                        resetSponsorsView();

                        // If we navigated to a valid video, load stored data
                        if (newVideoId) {
                            await Promise.all([
                                loadStoredSummary(),
                                loadStoredNotes(),
                                loadStoredChapters(),
                                loadStoredSponsors()
                            ]);
                        }
                    } catch (error) {
                        showToast('Failed to update sidebar content. Please refresh the page.');
                    }
                }
            }
        } catch (error) {
            showToast('Error checking video changes. Please refresh the page.');
        }
    };

    // Check on YouTube navigation events
    document.addEventListener('yt-navigate-finish', () => {
        setTimeout(checkVideoChange, 500);
    });

    // Set up polling with error handling
    watcherInterval = setInterval(checkVideoChange, 2000);

    // Clean up interval when the page is unloaded
    window.addEventListener('unload', () => {
        if (watcherInterval) {
            clearInterval(watcherInterval);
        }
    });
}

// Helper functions for loading stored data
async function loadStoredSummary() {
    try {
        const videoId = getCurrentVideoId();
        if (!videoId) {
            console.error('No video ID available to load summary');
            return;
        }

        const existingSummary = await retrieveSummary();
        if (existingSummary) {
            const summaryElement = document.getElementById('summary');
            if (summaryElement) {
                console.log('Loading stored summary for video:', videoId);
                summaryElement.innerHTML = parseMarkdown(existingSummary.text);
                updateTags(existingSummary.readingTime);
                setupCopySummaryButton();
            }
        } else {
            // If no stored summary, show the generate button
            const summaryElement = document.getElementById('summary');
            if (summaryElement) {
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
                setupGenerateSummaryButton();
            }
        }
    } catch (error) {
        console.error('Error loading stored summary:', error);
        showToast('Failed to load saved summary.');
    }
}

async function loadStoredNotes() {
    try {
        const notes = await retrieveNotes();
        if (notes) {
            const notesArea = document.getElementById('notes-area');
            if (notesArea) {
                notesArea.value = notes;
            }
        }
    } catch (error) {
        showToast('Failed to load saved notes.');
    }
}

async function loadStoredChapters() {
    try {
        const chapters = await retrieveChapters();
        if (chapters) {
            displayChapters(chapters);
        }
    } catch (error) {
        showToast('Failed to load saved chapters.');
    }
}

async function loadStoredSponsors() {
    try {
        const sponsors = await retrieveSponsors();
        if (sponsors) {
            displaySponsors(sponsors);
            setupAutoSkipSponsors(sponsors);
        }
    } catch (error) {
        showToast('Failed to load saved sponsor segments.');
    }
}

// Fetch and inject sidebar with animation
async function fetchAndInjectSidebarWithAnimation() {
    try {
        // Check if sidebar already exists
        let sidebar = document.getElementById('sidebar-container');
        if (sidebar) {
            return;
        }

        // Ensure the extension context is still valid
        if (!chrome.runtime?.getURL) {
            throw new Error('Extension context invalidated. Please reload the extension.');
        }

        // Fetch sidebar HTML with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

        const response = await fetch(chrome.runtime.getURL('ui/sidebar.html'), {
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Failed to fetch sidebar.html: ${response.status}`);
        }
        const sidebarHTML = await response.text();

        // Inject new sidebar
        sidebar = document.createElement('div');
        sidebar.id = 'sidebar-container';
        sidebar.innerHTML = sidebarHTML;
        document.body.appendChild(sidebar);
        adjustSidebarWidth();

        // Add sidebar stylesheet with error handling
        try {
            if (!document.getElementById('sidebar-styles')) {
                const link = document.createElement('link');
                link.id = 'sidebar-styles';
                link.rel = 'stylesheet';
                link.href = chrome.runtime.getURL('ui/sidebar.css');
                document.head.appendChild(link);
            }
        } catch (error) {
            showToast('Failed to load sidebar styles. Some features may not work correctly.');
        }

        // Event listeners with error handling
        try {
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
                    resetNotesView();
                    resetChaptersView();
                    resetSponsorsView();
                    clearSummary();
                });
            }

            // Set up all feature buttons
            setupNotesFeature();
            setupChaptersFeature();
            setupSponsorsFeature();
            setupTabNavigation();
        } catch (error) {
            showToast('Failed to set up sidebar controls. Please reload the page.');
        }

        // Initialize views with error handling
        try {
            // Only reset views if we're not watching a video
            if (!isWatchingVideo()) {
                resetSummaryView();
                resetNotesView();
                resetChaptersView();
                resetSponsorsView();
            } else {
                // If we are watching a video, load the stored state
                await Promise.all([
                    loadStoredSummary(),
                    loadStoredNotes(),
                    loadStoredChapters(),
                    loadStoredSponsors()
                ]);
            }
            setupVideoNavigationWatcher();
        } catch (error) {
            showToast('Failed to initialize sidebar features. Please reload the page.');
        }

    } catch (error) {
        if (error.name === 'AbortError') {
            showToast('Loading sidebar timed out. Please try again.');
        } else if (error.message.includes('Extension context invalidated')) {
            showToast('Extension needs to be reloaded. Please refresh the page.');
        } else {
            showToast('Failed to load sidebar. Please try again.');
        }
    }
}

// Function to close sidebar with animation
function closeSidebarWithAnimation() {
    const sidebar = document.getElementById('sidebar-container');
    if (!sidebar) return;

    // Store the current active tab before closing
    const activeButton = document.querySelector('.tab-button.active');
    if (activeButton) {
        const activeTab = activeButton.dataset.tab;
        chrome.storage.local.set({ activeTab: activeTab });
    }

    // Add the closing class to trigger the animation
    sidebar.classList.add('closing');

    // Wait for the animation to complete before removing the element
    sidebar.addEventListener('animationend', () => {
        sidebar.remove();
    }, { once: true }); // Ensures the event listener is removed after firing once
}

function adjustSidebarWidth() {
    console.log('Adjusting sidebar width...');

    const secondary = document.querySelector('#secondary.style-scope.ytd-watch-flexy');
    const sidebarContainer = document.getElementById('sidebar-container');
    if (!sidebarContainer) return;
    if (!isWatchingVideo) {
        sidebarContainer.style.width = '450px'; // Default width
        sidebarContainer.style.right = '0';
        return;
    }

    // Get the starting position of the secondary container (from the left)
    const secondaryRect = secondary.getBoundingClientRect();
    const sidebarStart = secondaryRect.left;

    if (sidebarStart <= 0) {
        sidebarContainer.style.width = '450px'; // Default width
        sidebarContainer.style.right = '0';
        return;
    }

    // Calculate the width from the secondary container to the right edge of the viewport
    const sidebarWidth = window.innerWidth - sidebarStart;

    console.log('Secondary container starts at:', sidebarStart);
    console.log('Calculated sidebar width:', sidebarWidth);

    // Set sidebar position and width
    sidebarContainer.style.top = '0';
    sidebarContainer.style.left = `${sidebarStart}px`;
    sidebarContainer.style.width = `${sidebarWidth}px`;
}

// Adjust sidebar width initially and on window resize
window.addEventListener('resize', adjustSidebarWidth);
window.addEventListener('load', adjustSidebarWidth);

// Update existing function to use the new animation version
function fetchAndInjectSidebar() {
    fetchAndInjectSidebarWithAnimation();
    adjustSidebarWidth();
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
    // addHoverTriggerZone();
}, 1000);

// Add the navigation event listener to also ensure hover trigger exists
document.addEventListener('yt-navigate-finish', debounce(() => {
    console.log('Page navigation detected');

    // Add sidebar button if needed
    if (!document.getElementById('sidebar-toggle-icon')) {
        console.log('Adding sidebar toggle icon after navigation');
        addSidebarToggleButtonToNavbar();
    }

}, 300));

function isWatchingVideo() {
    // Check if we're on a watch page with a video ID
    return window.location.pathname === '/watch' && new URLSearchParams(window.location.search).get('v');
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

function setupCopySummaryButton() {
    const copyButton = document.getElementById('copy-summary-button');
    if (copyButton) {
        copyButton.addEventListener('click', () => {
            const summaryElement = document.getElementById('summary');
            if (!summaryElement) return;

            // Get the text content without the generate button and info text
            const summaryText = summaryElement.innerText
                .replace('Generate Summary', '')
                .replace('Click the button above to analyze the video and generate an AI summary.', '')
                .trim();

            // Copy to clipboard
            navigator.clipboard.writeText(summaryText).then(() => {
                showToast('Summary copied to clipboard!');
            }).catch(err => {
                showToast('Failed to copy summary. Please try again.');
                console.error('Failed to copy text: ', err);
            });
        });
    }
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

        // Re-add the event listeners to the new button
        setupGenerateSummaryButton();
        setupCopySummaryButton();
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
        if (!videoId) {
            console.error('No video ID available');
            return;
        }

        // Show loading state
        document.getElementById('summary').innerHTML = getLoadingState();

        // First check for existing summary for this specific video
        const existingSummary = await retrieveSummary();
        if (existingSummary) {
            console.log('Displaying existing summary for video:', videoId);
            document.getElementById('summary').innerHTML = parseMarkdown(existingSummary.text);
            updateTags(existingSummary.readingTime);
            setupCopySummaryButton();
            return;
        }

        // If no existing summary, get transcript and generate new summary
        const transcript = await getTranscript();
        if (transcript && transcript !== 'Transcript not available' && transcript !== 'Transcript not loaded') {
            console.log('Generating new summary for video:', videoId);
            const summary = await getSummary(transcript);
            const readingTime = calculateReadingTime(summary);

            // Store and display the new summary
            await storeSummary(summary, readingTime);
            document.getElementById('summary').innerHTML = parseMarkdown(summary);
            updateTags(readingTime);
            setupCopySummaryButton();
        } else {
            showTranscriptError('summary');
        }
    } catch (error) {
        console.error('Error in fetchAndDisplaySummary:', error);
        showTranscriptError('summary');
    }
}

function calculateReadingTime(text) {
    const words = text.split(/\s+/).length;
    const readingTime = Math.ceil(words / 200); // 200 words per minute
    return readingTime;
}

function updateTags(readingTime) {
    const tagContainer = document.querySelector('.tag2');
    tagContainer.innerText = readingTime + " min";
    tagContainer.classList.add('tag');
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
    if (!videoId) {
        console.error('No video ID available to store summary');
        return;
    }
    try {
        const storageKey = `summary_${videoId}`;
        console.log('Storing summary for video:', videoId);
        await chrome.storage.local.set({
            [storageKey]: {
                text: summary,
                readingTime,
                timestamp: Date.now() // Add timestamp to track when summary was generated
            }
        });
        console.log('Successfully stored summary for video:', videoId);
    } catch (error) {
        console.error('Error storing summary:', error);
    }
}

// Retrieve summary
async function retrieveSummary() {
    const videoId = getCurrentVideoId();
    if (!videoId) {
        console.error('No video ID available to retrieve summary');
        return null;
    }
    try {
        const storageKey = `summary_${videoId}`;
        const data = await chrome.storage.local.get(storageKey);
        const summary = data[storageKey];

        if (summary) {
            console.log('Retrieved summary for video:', videoId);
            return summary;
        } else {
            console.log('No summary found for video:', videoId);
            return null;
        }
    } catch (error) {
        console.error('Error retrieving summary:', error);
        return null;
    }
}

// Clear summary
async function clearSummary() {
    const videoId = getCurrentVideoId();
    if (!videoId) {
        console.error('No video ID available to clear summary');
        return;
    }
    try {
        const storageKey = `summary_${videoId}`;
        await chrome.storage.local.remove(storageKey);
        // Clear transcript cache for this video
        transcriptModule.clearCache(videoId);
        console.log('Cleared summary and transcript cache for video:', videoId);
    } catch (error) {
        console.error('Error clearing summary:', error);
    }
}

function setupTabNavigation() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    // Restore active tab from storage
    chrome.storage.local.get('activeTab', (data) => {
        if (data.activeTab) {
            const activeButton = document.querySelector(`.tab-button[data-tab="${data.activeTab}"]`);
            const activeContent = document.getElementById(`${data.activeTab}-tab`);
            if (activeButton && activeContent) {
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabContents.forEach(content => content.classList.remove('active'));
                activeButton.classList.add('active');
                activeContent.classList.add('active');
            }
        }
    });

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all buttons and contents
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            // Add active class to clicked button and corresponding content
            button.classList.add('active');
            const tabId = button.dataset.tab;
            document.getElementById(`${tabId}-tab`).classList.add('active');

            // Store the active tab
            chrome.storage.local.set({ activeTab: tabId });
        });
    });
}

function setupChaptersFeature() {
    const generateChaptersButton = document.getElementById('generate-chapters-button');
    const chaptersList = document.getElementById('chapters-list');

    if (!generateChaptersButton || !chaptersList) {
        console.error('Chapters elements not found');
        return;
    }

    generateChaptersButton.addEventListener('click', async () => {
        chaptersList.innerHTML = `
            <div class="loading-state">
                <div class="spinner"></div>
                <p>Generating chapters...</p>
            </div>
        `;

        const existingChapters = await retrieveChapters();
        if (existingChapters) {
            displayChapters(existingChapters);
            return;
        }

        try {
            const videoId = getCurrentVideoId();
            if (!videoId) {
                throw new Error('No video ID available');
            }

            const transcript = await getTranscript(videoId);
            if (transcript && transcript !== "Transcript not available" && transcript !== "Transcript not loaded") {
                const chapters = await generateChapters(transcript);
                if (chapters && chapters.length > 0) {
                    storeChapters(chapters);
                    displayChapters(chapters);
                } else {
                    showTranscriptError('chapters');
                }
            } else {
                showTranscriptError('chapters');
            }
        } catch (error) {
            showTranscriptError('chapters');
        }
    });
}

function setupSponsorsFeature() {
    const sponsorsList = document.getElementById('sponsors-list');
    if (!sponsorsList) {
        console.error('Sponsors list element not found');
        return;
    }

    // Check for existing sponsors in storage
    retrieveSponsors().then(async sponsors => {
        if (sponsors) {
            displaySponsors(sponsors);
            setupAutoSkipSponsors(sponsors);
        } else {
            // Show loading state
            sponsorsList.innerHTML = `
                <div class="loading-state">
                    <div class="spinner"></div>
                    <p>Detecting sponsor segments...</p>
                </div>
            `;

            try {
                const videoId = getCurrentVideoId();
                if (!videoId) {
                    throw new Error('No video ID available');
                }

                // Use transcript manager to get transcript
                const transcript = await getTranscript(videoId);
                if (!transcript || transcript === "Transcript not available" || transcript === "Transcript not loaded") {
                    showTranscriptError('sponsors');
                    return;
                }

                const sponsors = await detectSponsors(transcript);
                handleSponsorsResult(sponsors);
            } catch (error) {
                showTranscriptError('sponsors');
            }
        }
    }).catch(error => {
        if (!sponsorsList) return;
        sponsorsList.innerHTML = '<p class="info-text">No sponsor segments detected in this video.</p>';
    });

    // Set up auto-skip toggle
    const sponsorBlockerToggle = document.getElementById('sponsor-blocker-toggle');
    if (sponsorBlockerToggle) {
        chrome.storage.local.get('autoSkipSponsors', (data) => {
            sponsorBlockerToggle.checked = data.autoSkipSponsors || false;
        });

        sponsorBlockerToggle.addEventListener('change', () => {
            chrome.storage.local.set({ autoSkipSponsors: sponsorBlockerToggle.checked });
        });
    }
}

function resetNotesView() {
    const notesArea = document.getElementById('notes-area');
    const notesContainer = document.getElementById('notes-tab');
    if (!notesArea || !notesContainer) return;

    if (!isWatchingVideo()) {
        // User is not watching a video - show disabled state
        notesContainer.innerHTML = `
            <div class="notes-container">
                <div class="notes-header">
                    <h3>Video Notes</h3>
                    <div class="notes-actions">
                        <button id="save-notes-button" class="action-button disabled" disabled>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                                <polyline points="7 3 7 8 15 8"></polyline>
                            </svg>
                            Save
                        </button>
                        <button id="export-notes-button" class="action-button disabled" disabled>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                            Export
                        </button>
                    </div>
                </div>
                <textarea id="notes-area" placeholder="You have to open a video to take notes" disabled></textarea>
                <div class="timestamp-actions">
                    <button id="add-timestamp-button" class="action-button disabled" disabled>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="8" x2="12" y2="16"></line>
                            <line x1="8" y1="12" x2="16" y2="12"></line>
                        </svg>
                        Add Timestamp
                    </button>
                </div>
            </div>
        `;
    } else {
        // User is watching a video - show active state
        notesContainer.innerHTML = `
            <div class="notes-container">
                <div class="notes-header">
                    <h3>Video Notes</h3>
                    <div class="notes-actions">
                        <button id="save-notes-button" class="action-button">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                                <polyline points="7 3 7 8 15 8"></polyline>
                            </svg>
                            Save
                        </button>
                        <button id="export-notes-button" class="action-button">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                            Export
                        </button>
                    </div>
                </div>
                <textarea id="notes-area" placeholder="Take notes about this video here..."></textarea>
                <div class="timestamp-actions">
                    <button id="add-timestamp-button" class="action-button">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="8" x2="12" y2="16"></line>
                            <line x1="8" y1="12" x2="16" y2="12"></line>
                        </svg>
                        Add Timestamp
                    </button>
                </div>
            </div>
        `;

        // Get the new notes area element
        const newNotesArea = document.getElementById('notes-area');
        if (newNotesArea) {
            // Load saved notes for the current video
            retrieveNotes().then(notes => {
                if (notes) {
                    newNotesArea.value = notes;
                }
            });

            // Set up event listeners for the new elements
            const saveNotesButton = document.getElementById('save-notes-button');
            const addTimestampButton = document.getElementById('add-timestamp-button');
            const exportNotesButton = document.getElementById('export-notes-button');

            // Auto-save notes when typing stops
            let saveTimeout;
            newNotesArea.addEventListener('input', () => {
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(() => {
                    saveNotes(newNotesArea.value);
                }, 1000); // Save 1 second after typing stops
            });

            // Save notes button
            saveNotesButton.addEventListener('click', () => {
                saveNotes(newNotesArea.value);
                showToast('Notes saved successfully!');
            });

            // Add timestamp button
            addTimestampButton.addEventListener('click', () => {
                const video = document.querySelector('video');
                if (video) {
                    const currentTime = video.currentTime;
                    const formattedTime = formatTime(currentTime);
                    const timestampText = `[${formattedTime}] `;

                    // Insert at cursor position or at the end
                    const cursorPos = newNotesArea.selectionStart;
                    const textBefore = newNotesArea.value.substring(0, cursorPos);
                    const textAfter = newNotesArea.value.substring(cursorPos);

                    newNotesArea.value = textBefore + timestampText + textAfter;
                    newNotesArea.focus();
                    newNotesArea.selectionStart = cursorPos + timestampText.length;
                    newNotesArea.selectionEnd = cursorPos + timestampText.length;

                    // Trigger save
                    saveNotes(newNotesArea.value);
                }
            });

            // Export notes button
            exportNotesButton.addEventListener('click', () => {
                const videoTitle = document.querySelector('h1.title.style-scope.ytd-video-primary-info-renderer')?.textContent || 'YouTube Video';
                const cleanTitle = videoTitle.trim().replace(/[^\w\s-]/g, '');
                const filename = `${cleanTitle} - Notes.txt`;

                const blob = new Blob([newNotesArea.value], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);

                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                a.click();

                URL.revokeObjectURL(url);
                showToast('Notes exported successfully!');
            });
        }
    }
}

function resetChaptersView() {
    const chaptersList = document.getElementById('chapters-list');
    const chaptersContainer = document.getElementById('chapters-tab');
    if (!chaptersList || !chaptersContainer) return;

    if (!isWatchingVideo()) {
        // User is not watching a video - show disabled state
        chaptersContainer.innerHTML = `
            <div class="chapters-container">
                <div class="chapters-header">
                    <h3>Video Chapters</h3>
                    <button id="generate-chapters-button" class="generate-button disabled" disabled>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                            <polyline points="22 4 12 14.01 9 11.01"></polyline>
                        </svg>
                        Generate Chapters
                    </button>
                </div>
                <div id="chapters-list" class="chapters-list">
                    <p class="info-text">You have to open a video to generate chapters</p>
                </div>
            </div>
        `;
    } else {
        // User is watching a video - show active state
        chaptersContainer.innerHTML = `
            <div class="chapters-container">
                <div class="chapters-header">
                    <h3>Video Chapters</h3>
                    <button id="generate-chapters-button" class="generate-button">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                            <polyline points="22 4 12 14.01 9 11.01"></polyline>
                        </svg>
                        Generate Chapters
                    </button>
                </div>
                <div id="chapters-list" class="chapters-list">
                    <p class="info-text">Click the button above to analyze the video and generate AI chapters.</p>
                </div>
            </div>
        `;

        // Re-add event listeners
        setupChaptersFeature();
    }
}

function resetSponsorsView() {
    const sponsorsList = document.getElementById('sponsors-list');
    const sponsorsContainer = document.getElementById('sponsors-tab');
    if (!sponsorsList || !sponsorsContainer) return;

    if (!isWatchingVideo()) {
        sponsorsContainer.innerHTML = `
            <div class="sponsors-container">
                <div class="sponsors-header">
                    <h3>Sponsor Segments</h3>
                    <div class="sponsor-toggle">
                        <label class="switch">
                            <input type="checkbox" id="sponsor-blocker-toggle" disabled>
                            <span class="slider round"></span>
                        </label>
                        <span>Auto-Skip Sponsors</span>
                    </div>
                </div>
                <div id="sponsors-list" class="sponsors-list">
                    <p class="info-text">You have to open a video to detect sponsor segments</p>
                </div>
            </div>
        `;
    } else {
        sponsorsContainer.innerHTML = `
            <div class="sponsors-container">
                <div class="sponsors-header">
                    <h3>Sponsor Segments</h3>
                    <div class="sponsor-toggle">
                        <label class="switch">
                            <input type="checkbox" id="sponsor-blocker-toggle">
                            <span class="slider round"></span>
                        </label>
                        <span>Auto-Skip Sponsors</span>
                    </div>
                </div>
                <div id="sponsors-list" class="sponsors-list">
                    <div class="loading-state">
                        <div class="spinner"></div>
                        <p>Detecting sponsor segments...</p>
                    </div>
                </div>
            </div>
        `;

        const sponsorBlockerToggle = document.getElementById('sponsor-blocker-toggle');
        if (sponsorBlockerToggle) {
            chrome.storage.local.get('autoSkipSponsors', (data) => {
                sponsorBlockerToggle.checked = data.autoSkipSponsors || false;
            });

            sponsorBlockerToggle.addEventListener('change', () => {
                chrome.storage.local.set({ autoSkipSponsors: sponsorBlockerToggle.checked });
            });
        }

        // First check if we have the transcript in storage
        retrieveTranscript().then(async storedTranscript => {
            if (storedTranscript) {
                // Use stored transcript
                const sponsors = await detectSponsors(storedTranscript);
                handleSponsorsResult(sponsors);
            } else {
                // Fetch new transcript
                const transcript = await getTranscript(false);
                if (transcript && transcript !== "Transcript not available" && transcript !== "Transcript not loaded") {
                    const sponsors = await detectSponsors(transcript);
                    handleSponsorsResult(sponsors);
                } else {
                    showTranscriptError('sponsors');
                }
            }
        });
    }
}

// Add helper function to handle sponsor results
function handleSponsorsResult(sponsors) {
    const sponsorsList = document.getElementById('sponsors-list');
    if (!sponsorsList) return;

    if (sponsors === null) {
        showTranscriptError('sponsors');
        return;
    }

    if (sponsors && sponsors.length > 0) {
        storeSponsors(sponsors);
        displaySponsors(sponsors);
        setupAutoSkipSponsors(sponsors);
    } else {
        sponsorsList.innerHTML = '<p class="info-text">No sponsor segments detected in this video.</p>';
    }
}

// Add helper function to show transcript error
function showTranscriptError(feature) {
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

// Add these functions after getCurrentVideoId()
async function storeTranscript(transcript) {
    const videoId = getCurrentVideoId();
    if (!videoId) {
        console.error('No video ID available to store transcript');
        return;
    }
    try {
        await chrome.storage.local.set({
            [`transcript_${videoId}`]: transcript
        });
        console.log('Successfully stored transcript for video:', videoId);
    } catch (error) {
        console.error('Error storing transcript:', error);
    }
}

async function retrieveTranscript() {
    const videoId = getCurrentVideoId();
    if (!videoId) {
        console.error('No video ID available to retrieve transcript');
        return null;
    }
    try {
        const data = await chrome.storage.local.get(`transcript_${videoId}`);
        const transcript = data[`transcript_${videoId}`];
        console.log('Retrieved transcript for video:', videoId, transcript ? 'found' : 'not found');
        return transcript || null;
    } catch (error) {
        console.error('Error retrieving transcript:', error);
        return null;
    }
}
