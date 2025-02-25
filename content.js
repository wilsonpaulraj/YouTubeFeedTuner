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
        You are an expert at summarizes the youtube transcript.
        a detailed summarize down to the main content of the video.

        Summarize the following transcript:
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

function addFloatingIconToNavbar() {
    const buttonsContainer = document.querySelector('#buttons.style-scope.ytd-masthead');
    console.log('Buttons Container:', buttonsContainer);
    if (!buttonsContainer) {
        console.error("YouTube buttons container not found!");
        return;
    }

    const floatingIcon = document.createElement('div');
    floatingIcon.id = 'floating-icon';
    floatingIcon.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 5h16M4 12h10M4 19h7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M19 15l-4 4l-2-2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
    `;

    floatingIcon.style.cssText = `
        width: 40px;
        height: 40px;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: transparent;
        margin-left: 8px;
        color: #AAAAAA;
        transition: color 0.2s ease, background-color 0.2s ease;
    `;

    const style = document.createElement('style');
    style.textContent = `
        #floating-icon:hover {
            color: #FFFFFF;
            background-color: rgba(255, 255, 255, 0.1);
        }
        #floating-icon:active {
            transform: scale(0.95);
        }
        @media (prefers-color-scheme: light) {
            #floating-icon {
                color: #606060;
            }
            #floating-icon:hover {
                color: #0F0F0F;
                background-color: rgba(0, 0, 0, 0.05);
            }
        }
    `;
    document.head.appendChild(style);

    buttonsContainer.appendChild(floatingIcon);

    floatingIcon.addEventListener('click', () => {
        fetchAndInjectSidebar();
    });

    console.log('Summary sidebar toggler added to YouTube navbar');
}

addFloatingIconToNavbar();


floatingIcon.addEventListener('click', () => {
    fetchAndInjectSidebar();
});

async function fetchAndInjectSidebar() {
    try {
        const response = await fetch(chrome.runtime.getURL('ui/sidebar.html'));
        console.log(response);
        if (!response.ok) {
            throw new Error(`Failed to fetch sidebar.html: ${response.status}`);
        }
        const sidebarHTML = await response.text();

        const sidebar = document.createElement('div');
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
            document.getElementById('summary').innerHTML = getLoadingState();
            fetchAndDisplaySummary();
        });

        fetchAndDisplaySummary();

    } catch (error) {
        console.error('Failed to load sidebar:', error);
    }
}


async function fetchAndDisplaySummary() {
    try {
        const transcript = await getTranscript();
        if (transcript && transcript !== "Transcript not available" && transcript !== "Transcript not loaded") {
            const summary = await getSummary(transcript);
            const readingTime = calculateReadingTime(summary);
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
