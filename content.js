console.log('Content script loaded');

// Note-taking functionality
let videoNotes = {};

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
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background-color: #3a86ff;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            z-index: 10001;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            opacity: 0;
            transition: opacity 0.3s ease;
        `;
        document.body.appendChild(toast);
    }
    
    // Set message and show toast
    toast.textContent = message;
    toast.style.opacity = '1';
    
    // Hide toast after 3 seconds
    setTimeout(() => {
        toast.style.opacity = '0';
    }, 3000);
}

// Video chapters generation functionality
async function generateChapters(transcript) {
    const prompt = `
        You are an expert at creating YouTube video chapters. Based on the following transcript, 
        create 5-10 logical chapters for this video. Each chapter should have a timestamp and a 
        descriptive title. Format your response as a JSON array of objects, each with "time" (in seconds) 
        and "title" properties. Example: [{"time": 0, "title": "Introduction"}, {"time": 120, "title": "Main Topic"}]
        
        Transcript:
        ${transcript}
    `;
    
    try {
        console.log('Generating chapters...');
        const response = await getLLMResponse(prompt);
        console.log('Chapters response:', response);
        
        // Parse the JSON response
        let chapters;
        try {
            // Find JSON in the response (in case there's explanatory text)
            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                chapters = JSON.parse(jsonMatch[0]);
            } else {
                chapters = JSON.parse(response);
            }
        } catch (parseError) {
            console.error('Error parsing chapters JSON:', parseError);
            return [];
        }
        
        return chapters;
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
async function detectSponsors() {
    // This is a simplified version. In a real implementation, you might:
    // 1. Use a database of known sponsor segments
    // 2. Use machine learning to detect sponsor segments
    // 3. Use community-contributed data (like SponsorBlock API)
    
    // For this demo, we'll use a simple approach with the LLM
    const transcript = await getTranscript();
    if (!transcript || transcript === "Transcript not available" || transcript === "Transcript not loaded") {
        return [];
    }
    
    const prompt = `
        You are an expert at detecting sponsor segments in YouTube videos. Based on the following transcript, 
        identify any sponsor segments or advertisements. Look for phrases like "this video is sponsored by", 
        "thanks to our sponsor", product promotions, etc.
        
        For each sponsor segment you find, estimate the start and end times. Format your response as a JSON array 
        of objects, each with "start" (in seconds), "end" (in seconds), and "category" (e.g., "sponsor", "promo", "intro") properties.
        Example: [{"start": 120, "end": 180, "category": "sponsor"}]
        
        If you don't find any sponsor segments, return an empty array: []
        
        Transcript:
        ${transcript}
    `;
    
    try {
        console.log('Detecting sponsors...');
        const response = await getLLMResponse(prompt);
        console.log('Sponsors response:', response);
        
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
            return [];
        }
        
        return sponsors;
    } catch (error) {
        console.error('Error detecting sponsors:', error);
        return [];
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
        for (const sponsor of sponsors) {
            // If we're at the start of a sponsor segment, skip to the end
            if (currentTime >= sponsor.start && currentTime < sponsor.end) {
                video.currentTime = sponsor.end;
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

async function getTranscript() {
    try {
        console.log('Attempting to get transcript');
        console.log('Waiting for transcript button...');
        const transcriptButton = await waitForTranscriptButton();

        if (!transcriptButton) {
            console.log('Transcript button not found');
            return 'Transcript not available';
        }

        transcriptButton.click();
        console.log('Clicked transcript button');

        await new Promise(resolve => setTimeout(resolve, 2000));
        console.log('Waiting for 2 seconds');

        const transcriptContainer = document.querySelectorAll('ytd-transcript-segment-renderer');
        if (!transcriptContainer) {
            console.log('Transcript container not found');
            return 'Transcript not loaded';
        }
        let transcript = "";
        for (let i = 0; i < transcriptContainer.length; i++) {
            transcript += transcriptContainer[i].innerText.split('\n').slice(1).join('\n') + ' ';
        }
        console.log('Last Transcript:', transcriptContainer[transcriptContainer.length - 12].innerText);
        return transcript;
    } catch (error) {
        console.error('Error fetching transcript:', error);
        return 'Error fetching transcript';
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

// Ensure it works with dynamic content loading
if (!window.observerInitialized) {
    const observer = new MutationObserver(debounce(() => {
        addSidebarToggleButtonToNavbar();
    }, 200));

    observer.observe(document.body, { childList: true, subtree: true });
    window.observerInitialized = true;
    console.log('Observer initialized');
}

async function fetchAndInjectSidebar() {
    try {
        const response = await fetch(chrome.runtime.getURL('ui/sidebar.html'));
        if (!response.ok) {
            throw new Error(`Failed to fetch sidebar.html: ${response.status}`);
        }
        const sidebarHTML = await response.text();

        let sidebar = document.getElementById('sidebar-container');
        if (sidebar) {
            sidebar.remove();
        }

        sidebar = document.createElement('div');
        sidebar.id = 'sidebar-container';
        sidebar.innerHTML = sidebarHTML;
        document.body.appendChild(sidebar);

        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = chrome.runtime.getURL('ui/sidebar.css');
        document.head.appendChild(link);

        document.getElementById('close-sidebar').addEventListener('click', () => {
            sidebar.remove();
        });

        document.getElementById('refresh-button').addEventListener('click', () => {
            resetSummaryView();
            clearSummary();
        });

        setupGenerateSummaryButton();
        setupTabNavigation();
        setupNotesFeature();
        setupChaptersFeature();
        setupSponsorsFeature();

        // Load stored summary for the current video
        const existingSummary = await retrieveSummary();
        if (existingSummary) {
            document.getElementById('summary').innerHTML = parseMarkdown(existingSummary.text);
            updateTags(existingSummary.readingTime);
            console.log('Loaded stored summary for current video');
        } else {
            resetSummaryView();
        }

    } catch (error) {
        console.error('Failed to load sidebar:', error);
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

function resetSummaryView() {
    document.getElementById('summary').innerHTML = `
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

async function fetchAndDisplaySummary() {
    try {
        const videoId = getCurrentVideoId();

        const existingSummary = await retrieveSummary();
        if (existingSummary) {
            document.getElementById('summary').innerHTML = parseMarkdown(existingSummary.text);
            updateTags(existingSummary.readingTime);
            console.log('Retrieved summary from storage');
            return;
        }

        const transcript = await getTranscript();
        if (transcript && transcript !== "Transcript not available" && transcript !== "Transcript not loaded") {
            const summary = await getSummary(transcript);
            const readingTime = calculateReadingTime(summary);

            storeSummary(summary, readingTime); // Persist to local storage

            document.getElementById('summary').innerHTML = parseMarkdown(summary);
            updateTags(readingTime);
        } else {
            document.getElementById('summary').innerHTML = '<p>No transcript found or loaded.</p>';
        }
    } catch (error) {
        console.error('Failed to fetch summary:', error);
        document.getElementById('summary').innerHTML = '<p>Error fetching summary.</p>';
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
        toggleSidebar(false);
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
    await chrome.storage.local.set({
        [videoId]: { text: summary, readingTime }
    });
    console.log('Stored summary for video:', videoId);
}

// Retrieve summary
async function retrieveSummary() {
    const videoId = getCurrentVideoId();
    const data = await chrome.storage.local.get(videoId);
    return data[videoId] || null; // Return summary only if it matches current video
}

// Clear summary
async function clearSummary() {
    const videoId = getCurrentVideoId();
    await chrome.storage.local.remove(videoId);
    console.log('Cleared summary for video:', videoId);
}

function setupTabNavigation() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all buttons and contents
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            // Add active class to clicked button and corresponding content
            button.classList.add('active');
            const tabId = button.dataset.tab;
            document.getElementById(`${tabId}-tab`).classList.add('active');
        });
    });
}

function setupChaptersFeature() {
    const generateChaptersButton = document.getElementById('generate-chapters-button');
    
    generateChaptersButton.addEventListener('click', async () => {
        // Show loading state
        document.getElementById('chapters-list').innerHTML = `
            <div class="loading-state">
                <div class="spinner"></div>
                <p>Generating chapters...</p>
            </div>
        `;
        
        // Check for existing chapters
        const existingChapters = await retrieveChapters();
        if (existingChapters) {
            displayChapters(existingChapters);
            return;
        }
        
        // Get transcript and generate chapters
        const transcript = await getTranscript();
        if (transcript && transcript !== "Transcript not available" && transcript !== "Transcript not loaded") {
            const chapters = await generateChapters(transcript);
            if (chapters && chapters.length > 0) {
                storeChapters(chapters);
                displayChapters(chapters);
            } else {
                document.getElementById('chapters-list').innerHTML = '<p class="info-text">Could not generate chapters for this video.</p>';
            }
        } else {
            document.getElementById('chapters-list').innerHTML = '<p class="info-text">No transcript found or loaded.</p>';
        }
    });
}

function setupSponsorsFeature() {
    // Check for existing sponsors
    retrieveSponsors().then(sponsors => {
        if (sponsors) {
            displaySponsors(sponsors);
            setupAutoSkipSponsors(sponsors);
        } else {
            // Detect sponsors
            document.getElementById('sponsors-list').innerHTML = `
                <div class="loading-state">
                    <div class="spinner"></div>
                    <p>Detecting sponsor segments...</p>
                </div>
            `;
            
            detectSponsors().then(sponsors => {
                if (sponsors && sponsors.length > 0) {
                    storeSponsors(sponsors);
                    displaySponsors(sponsors);
                    setupAutoSkipSponsors(sponsors);
                } else {
                    document.getElementById('sponsors-list').innerHTML = '<p class="info-text">No sponsor segments detected in this video.</p>';
                }
            });
        }
    });
    
    // Set up auto-skip toggle
    const sponsorBlockerToggle = document.getElementById('sponsor-blocker-toggle');
    chrome.storage.local.get('autoSkipSponsors', (data) => {
        sponsorBlockerToggle.checked = data.autoSkipSponsors || false;
    });
    
    sponsorBlockerToggle.addEventListener('change', () => {
        chrome.storage.local.set({ autoSkipSponsors: sponsorBlockerToggle.checked });
    });
}
