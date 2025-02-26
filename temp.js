const API_KEY = 'AIzaSyCQmEAmuoee_UEsocg8z2gmjBOiVxYk0oQ';
const RATE_LIMIT_DELAY = 1000;

export async function getLLMResponse(prompt) {
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
        }

        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
    } catch (error) {
        console.error('API error:', error);
        throw error;
    }
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
        const transcriptButton = await waitForTranscriptButton();
        transcriptButton.click();
        await new Promise(resolve => setTimeout(resolve, 2000));

        const transcriptContainer = document.querySelectorAll('ytd-transcript-segment-renderer');
        if (!transcriptContainer.length) {
            return 'Transcript not loaded';
        }

        return Array.from(transcriptContainer)
            .map(segment => segment.innerText.split('\n').slice(1).join(' '))
            .join(' ');
    } catch (error) {
        console.error('Error fetching transcript:', error);
        return 'Error fetching transcript';
    }
}



async function getSummary(transcript) {
    const prompt = `
        Summarize the following YouTube transcript into key points:

        ${transcript}
    `;

    try {
        const response = await getLLMResponse(prompt);
        return response;
    } catch (error) {
        console.error('Error fetching summary:', error);
        return 'Error fetching summary';
    }
}



function addFloatingIconToNavbar() {
    const buttonsContainer = document.querySelector('#buttons.style-scope.ytd-masthead');
    if (!buttonsContainer) {
        console.error("YouTube buttons container not found!");
        return;
    }

    const floatingIcon = document.createElement('div');
    floatingIcon.id = 'floating-icon';
    floatingIcon.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 5h16M4 12h10M4 19h7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M19 15l-4 4l-2-2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;

    floatingIcon.style.cssText = `
        width: 40px;
        height: 40px;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white,
        background-color: transparent;
        margin-left: 8px;
    `;

    buttonsContainer.appendChild(floatingIcon);
    floatingIcon.addEventListener('click', fetchAndInjectSidebar);
}

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

        fetchAndDisplaySummary();

    } catch (error) {
        console.error('Failed to load sidebar:', error);
    }
}



async function fetchAndDisplaySummary() {
    try {
        const transcript = await getTranscript();
        const summaryElement = document.getElementById('summary');

        if (!summaryElement) {
            console.error('Summary element not found!');
            return;
        }

        if (transcript && transcript !== "Transcript not available" && transcript !== "Transcript not loaded") {
            const summary = await getSummary(transcript);
            const readingTime = calculateReadingTime(summary);
            summaryElement.innerHTML = parseMarkdown(summary);
            updateTags(readingTime);
        } else {
            summaryElement.innerHTML = '<p>No transcript found or loaded.</p>';
        }
    } catch (error) {
        console.error('Failed to fetch summary:', error);
        const summaryElement = document.getElementById('summary');
        if (summaryElement) {
            summaryElement.innerHTML = '<p>Error fetching summary.</p>';
        }
    }
}

addFloatingIconToNavbar();
