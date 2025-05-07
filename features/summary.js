// Summary Feature Functions
window.YTEnhancer = window.YTEnhancer || {};
window.YTEnhancer.Summary = {};

window.YTEnhancer.Summary.parseMarkdown = function (markdown) {
    return markdown
        .replace(/(?:\r\n|\r|\n)/g, '<br>') // Line breaks
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold: **text**
        .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italics: *text*
        .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>'); // Links: [text](url)
};

window.YTEnhancer.Summary.getSummary = async function (transcript) {
    if (!transcript || transcript === 'Transcript not available' || transcript === 'Transcript not loaded') {
        console.error('Invalid transcript provided to getSummary');
        return 'Error: No valid transcript available';
    }

    const prompt = `
        You are an expert summarizer of YouTube transcripts. Provide a concise and informative summary of the *content* of the following transcript. Focus on the key information, arguments, and topics discussed. Avoid phrases like "This video explains..." or "The speaker discusses...". Instead, directly present the information as if you were explaining it to someone.
        If this video appears to be an educational video, provide a summary of the main points and arguments made by the speaker. If it appears to be a vlog or entertainment video, summarize the main events and highlights.
        In case of educational, programming, or technical content, provide a summary of the main concepts, code snippets, or techniques discussed.

        Transcript:
        ${transcript}
        `;

    try {
        const response = await window.YTEnhancer.LLM.getLLMResponse(prompt);
        return response;
    } catch (error) {
        return 'Error fetching summary';
    }
};

window.YTEnhancer.Summary.storeSummary = async function (summary, readingTime) {
    const videoId = window.YTEnhancer.Utils.getCurrentVideoId();
    if (!videoId) {
        return;
    }
    try {
        const storageKey = `summary_${videoId}`;
        await chrome.storage.local.set({
            [storageKey]: {
                text: summary,
                readingTime,
                timestamp: Date.now()
            }
        });
    } catch (error) {
        // Handle error if needed
    }
};

window.YTEnhancer.Summary.retrieveSummary = async function () {
    const videoId = window.YTEnhancer.Utils.getCurrentVideoId();
    if (!videoId) {
        return null;
    }
    try {
        const storageKey = `summary_${videoId}`;
        const data = await chrome.storage.local.get(storageKey);
        return data[storageKey] || null;
    } catch (error) {
        return null;
    }
};

window.YTEnhancer.Summary.clearSummary = async function () {
    const videoId = window.YTEnhancer.Utils.getCurrentVideoId();
    if (!videoId) {
        return;
    }
    try {
        const storageKey = `summary_${videoId}`;
        await chrome.storage.local.remove(storageKey);
        window.YTEnhancer.Transcript.clearCache(videoId);
    } catch (error) {
        // Handle error if needed
    }
};

window.YTEnhancer.Summary.calculateReadingTime = function (text) {
    const words = text.split(/\s+/).length;
    const readingTime = Math.ceil(words / 200); // 200 words per minute
    return readingTime;
};

window.YTEnhancer.Summary.updateTags = function (readingTime) {
    const tagContainer = document.querySelector('.tag2');
    if (!tagContainer) return;
    tagContainer.innerText = readingTime + " min";
    tagContainer.classList.add('tag');
};

window.YTEnhancer.Summary.getLoadingState = function () {
    return `
            <div class="loading-state">
                <div class="spinner"></div>
                <p>AI is analyzing the video...</p>
                <div class="progress-bar">
                    <div class="progress" style="width: 60%;"></div>
                </div>
            </div>
        `;
};

window.YTEnhancer.Summary.setupGenerateSummaryButton = function () {
    const generateButton = document.getElementById('generate-summary-button');
    if (generateButton) {
        generateButton.addEventListener('click', () => {
            const summaryElement = document.getElementById('summary');
            if (summaryElement) {
                summaryElement.innerHTML = window.YTEnhancer.Summary.getLoadingState();
                window.YTEnhancer.Summary.fetchAndDisplaySummary();
            }
        });
    }
};

window.YTEnhancer.Summary.setupCopySummaryButton = function () {
    const copyButton = document.getElementById('copy-summary-button');
    if (copyButton) {
        copyButton.addEventListener('click', () => {
            const summaryElement = document.getElementById('summary');
            if (!summaryElement) return;

            const summaryText = summaryElement.innerText
                .replace('Generate Summary', '')
                .replace('Click the button above to analyze the video and generate an AI summary.', '')
                .trim();

            navigator.clipboard.writeText(summaryText).then(() => {
                window.YTEnhancer.Utils.showToast('Summary copied to clipboard!');
            }).catch(() => {
                window.YTEnhancer.Utils.showToast('Failed to copy summary. Please try again.');
            });
        });
    }
};

window.YTEnhancer.Summary.resetSummaryView = function () {
    const summaryElement = document.getElementById('summary');
    if (!summaryElement) return;

    if (!window.YTEnhancer.Utils.isWatchingVideo()) {
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

        window.YTEnhancer.Summary.setupGenerateSummaryButton();
        window.YTEnhancer.Summary.setupCopySummaryButton();
    }
};

window.YTEnhancer.Summary.fetchAndDisplaySummary = async function () {
    try {
        if (!window.YTEnhancer.Utils.isWatchingVideo()) {
            const summaryElement = document.getElementById('summary');
            if (summaryElement) {
                summaryElement.innerHTML = `
                    <div class="no-video-message">
                        <p>Please navigate to a YouTube video to generate a summary.</p>
                    </div>
                `;
            }
            return;
        }

        const videoId = window.YTEnhancer.Utils.getCurrentVideoId();
        if (!videoId) {
            return;
        }

        const summaryElement = document.getElementById('summary');
        if (summaryElement) {
            summaryElement.innerHTML = window.YTEnhancer.Summary.getLoadingState();
        }

        const existingSummary = await window.YTEnhancer.Summary.retrieveSummary();
        if (existingSummary) {
            if (summaryElement) {
                summaryElement.innerHTML = window.YTEnhancer.Summary.parseMarkdown(existingSummary.text);
                window.YTEnhancer.Summary.updateTags(existingSummary.readingTime);
                window.YTEnhancer.Summary.setupCopySummaryButton();
            }
            return;
        }

        const transcript = await window.YTEnhancer.Transcript.getTranscript(videoId);
        if (transcript && transcript !== 'Transcript not available' && transcript !== 'Transcript not loaded') {
            const summary = await window.YTEnhancer.Summary.getSummary(transcript);
            const readingTime = window.YTEnhancer.Summary.calculateReadingTime(summary);

            await window.YTEnhancer.Summary.storeSummary(summary, readingTime);
            if (summaryElement) {
                summaryElement.innerHTML = window.YTEnhancer.Summary.parseMarkdown(summary);
                window.YTEnhancer.Summary.updateTags(readingTime);
                window.YTEnhancer.Summary.setupCopySummaryButton();
            }
        } else {
            window.YTEnhancer.Utils.showTranscriptError('summary');
        }
    } catch (error) {
        window.YTEnhancer.Utils.showTranscriptError('summary');
    }
};

// Export function for loading stored summary
window.YTEnhancer.Summary.loadStoredSummary = async function () {
    try {
        const videoId = window.YTEnhancer.Utils.getCurrentVideoId();
        if (!videoId) {
            return;
        }

        const existingSummary = await window.YTEnhancer.Summary.retrieveSummary();
        if (existingSummary) {
            const summaryElement = document.getElementById('summary');
            if (summaryElement) {
                summaryElement.innerHTML = window.YTEnhancer.Summary.parseMarkdown(existingSummary.text);
                window.YTEnhancer.Summary.updateTags(existingSummary.readingTime);
                window.YTEnhancer.Summary.setupCopySummaryButton();
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
                window.YTEnhancer.Summary.setupGenerateSummaryButton();
            }
        }
    } catch (error) {
        console.error('Failed to load saved summary:', error);
        window.YTEnhancer.Utils.showToast('Failed to load saved summary.');
    }
};
