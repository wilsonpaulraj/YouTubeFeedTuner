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

async function fetchAndInjectSidebar() {
    try {
        // Fetch sidebar HTML
        const response = await fetch(chrome.runtime.getURL('sidebar.html'));
        const sidebarHTML = await response.text();

        let ytdApp = document.querySelector('ytd-app');
        if (ytdApp) {
            ytdApp.style.width = "70%";
        }
        let ynav = document.getElementById('masthead-container');
        if (ynav) {
            ynav.style.width = "70%";
        }
        // Create and insert sidebar
        const sidebar = document.createElement('div');
        sidebar.innerHTML = sidebarHTML;
        document.body.appendChild(sidebar);

        // Add sidebar CSS
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = chrome.runtime.getURL('sidebar.css');
        document.head.appendChild(link);

        // Event listeners
        document.getElementById('close-sidebar').addEventListener('click', () => {
            sidebar.remove();
        });

        document.getElementById('refresh-button').addEventListener('click', () => {
            document.getElementById('summary').innerHTML = getLoadingState();
            fetchAndDisplaySummary();
        });

        // Initial fetch
        fetchAndDisplaySummary();
    } catch (error) {
        console.error('Failed to load sidebar:', error);
    }
}

async function fetchAndDisplaySummary() {
    try {
        const transcript = await getTranscript();
        if (transcript) {
            const summary = await getSummary(transcript);
            const readingTime = calculateReadingTime(summary);
            document.getElementById('summary').innerHTML = parseMarkdown(summary);
            updateTags(readingTime);
        } else {
            document.getElementById('summary').innerHTML = '<p>No transcript found.</p>';
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

fetchAndInjectSidebar();
