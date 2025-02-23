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


if (!document.getElementById('yt-summary-sidebar')) {
    const sidebar = document.createElement('div');
    sidebar.id = 'yt-summary-sideba2r';

    sidebar.innerHTML = `
<div id="yt-summary-sidebar" class="dark-theme">
  <div class="sidebar-header">
    <div class="header-left">
      <div class="pulse-dot"></div>
      <h2>AI Summary</h2>
    </div>
    <button id="refresh-button" class="action-button" aria-label="Refresh">
      Refresh
    </button>
    <button id="close-sidebar" class="icon-button" aria-label="Close">
      <svg viewBox="0 0 24 24" width="18" height="18">
        <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
      </svg>
    </button>
  </div>

  <div class="content">
    <div class="summary-container">
      <div class="summary-header">
        <div class="tags">
          <span class="tag">AI Generated</span>
          <span class="tag">Live</span>
        </div>
        <button class="action-button" aria-label="Copy summary">
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
          </svg>
          Copy
        </button>
      </div>

      <div id="summary" class="summary-content">
        <div class="loading-state">
          <div class="spinner"></div>
          <p>AI is analyzing the video...</p>
          <div class="progress-bar">
            <div class="progress" style="width: 60%"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
:root {
  --bg-primary: #0f0f0f;
  --bg-secondary: #1a1a1a;
  --bg-accent: #2a2a2a;
  --text-primary: #ffffff;
  --text-secondary: #a0a0a0;
  --accent-color: #3a86ff;
  --accent-secondary: #2563eb;
  --success-color: #22c55e;
  --border-color: #333333;
  --shadow-color: rgba(0, 0, 0, 0.4);
}

#yt-summary-sidebar {
  position: fixed;
  top: 0;
  right: 0;
  height: 100vh;
  width: 400px;
  background-color: var(--bg-primary);
  color: var(--text-primary);
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  display: flex;
  flex-direction: column;
  box-shadow: -10px 0 30px var(--shadow-color);
  z-index: 10000;
}

.sidebar-header {
  padding: 20px 24px;
  background-color: var(--bg-secondary);
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border-color);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-left h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.pulse-dot {
  width: 8px;
  height: 8px;
  background-color: var(--success-color);
  border-radius: 50%;
  position: relative;
}

.pulse-dot::after {
  content: '';
  position: absolute;
  top: -4px;
  left: -4px;
  width: 16px;
  height: 16px;
  background-color: var(--success-color);
  border-radius: 50%;
  opacity: 0.2;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% { transform: scale(0.8); opacity: 0.5; }
  70% { transform: scale(1.2); opacity: 0; }
  100% { transform: scale(0.8); opacity: 0; }
}

.content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.summary-container {
  background: var(--bg-secondary);
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
}

.summary-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.tags {
  display: flex;
  gap: 8px;
}

.tag {
  background: var(--bg-accent);
  color: var(--text-primary);
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.02em;
}

.tag:first-child {
  background: linear-gradient(45deg, var(--accent-color), var(--accent-secondary));
}

.action-button {
  background: var(--bg-accent);
  border: none;
  color: var(--text-primary);
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s ease;
}

.action-button:hover {
  background: var(--border-color);
  transform: translateY(-1px);
}

.summary-content {
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.6;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 40px 0;
  color: var(--text-secondary);
  text-align: center;
}

.spinner {
  width: 30px;
  height: 30px;
  border: 2px solid var(--bg-accent);
  border-top: 2px solid var(--accent-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.progress-bar {
  width: 100%;
  height: 4px;
  background: var(--bg-accent);
  border-radius: 2px;
  overflow: hidden;
  margin-top: 8px;
}

.progress {
  height: 100%;
  background: linear-gradient(90deg, var(--accent-color), var(--accent-secondary));
  border-radius: 2px;
  transition: width 0.3s ease;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.icon-button {
  background: none;
  border: none;
  padding: 8px;
  cursor: pointer;
  color: var(--text-secondary);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.icon-button:hover {
  background: var(--bg-accent);
  color: var(--text-primary);
}

/* Scrollbar */
.content::-webkit-scrollbar {
  width: 5px;
}

.content::-webkit-scrollbar-track {
  background: var(--bg-primary);
}

.content::-webkit-scrollbar-thumb {
  background: var(--bg-accent);
  border-radius: 20px;
}

.content::-webkit-scrollbar-thumb:hover {
  background: var(--border-color);
}

/* Responsive */
@media (max-width: 768px) {
  #yt-summary-sidebar {
    width: 100%;
  }

  .content {
    padding: 16px;
  }
}
</style>
    `;

    document.body.appendChild(sidebar);

    document.getElementById('close-sidebar').addEventListener('click', () => {
        console.log('Closing sidebar');
        sidebar.remove();
    });

    getTranscript().then(transcript => {
        if (transcript != "") {
            getSummary(transcript).then(summary => {
                document.getElementById('summary').innerHTML = parseMarkdown(summary);
            });
        }
    });

}
