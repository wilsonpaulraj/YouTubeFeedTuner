// Chapters Feature Functions
window.YTEnhancer = window.YTEnhancer || {};
window.YTEnhancer.Chapters = {};

// Generate chapters based on transcript
window.YTEnhancer.Chapters.generateChapters = async function (transcript) {
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
        /* console.log('Generating chapters...'); */
        const response = await getLLMResponse(prompt);
        /* console.log('Chapters response:', response); */

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
            /* console.error('Error parsing chapters JSON:', parseError); */
            return [];
        }
    } catch (error) {
        /* console.error('Error generating chapters:', error); */
        return [];
    }
};

// Display chapters in the UI
window.YTEnhancer.Chapters.displayChapters = function (chapters) {
    const chaptersList = document.getElementById('chapters-list');
    if (!chapters || chapters.length === 0) {
        chaptersList.innerHTML = '<p class="info-text">No chapters could be generated for this video.</p>';
        return;
    }

    let chaptersHTML = '';
    chapters.forEach(chapter => {
        chaptersHTML += `
            <div class="chapter-item" data-time="${chapter.time}">
                <span class="chapter-timestamp">${window.YTEnhancer.Utils.formatTime(chapter.time)}</span>
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
};

// Store chapters in chrome storage
window.YTEnhancer.Chapters.storeChapters = async function (chapters) {
    const videoId = window.YTEnhancer.Utils.getCurrentVideoId();
    await chrome.storage.local.set({
        [`chapters_${videoId}`]: chapters
    });
    /* console.log('Stored chapters for video:', videoId); */
};

// Retrieve chapters from chrome storage
window.YTEnhancer.Chapters.retrieveChapters = async function () {
    const videoId = window.YTEnhancer.Utils.getCurrentVideoId();
    const data = await chrome.storage.local.get(`chapters_${videoId}`);
    return data[`chapters_${videoId}`] || null;
};

// Setup chapters feature functionality
window.YTEnhancer.Chapters.setupChaptersFeature = function () {
    const generateChaptersButton = document.getElementById('generate-chapters-button');
    const chaptersList = document.getElementById('chapters-list');

    if (!generateChaptersButton || !chaptersList) {
        // console.error('Chapters elements not found');
        return;
    }

    generateChaptersButton.addEventListener('click', async () => {
        chaptersList.innerHTML = `
            <div class="loading-state">
                <div class="spinner"></div>
                <p>Generating chapters...</p>
            </div>
        `;

        const existingChapters = await window.YTEnhancer.Chapters.retrieveChapters();
        if (existingChapters) {
            window.YTEnhancer.Chapters.displayChapters(existingChapters);
            return;
        }

        try {
            const videoId = window.YTEnhancer.Utils.getCurrentVideoId();
            if (!videoId) {
                throw new Error('No video ID available');
            }

            const transcript = await window.YTEnhancer.Transcript.getVideoTranscript();
            if (transcript && transcript !== "Transcript not available" && transcript !== "Transcript not loaded") {
                const chapters = await window.YTEnhancer.Chapters.generateChapters(transcript);
                if (chapters && chapters.length > 0) {
                    window.YTEnhancer.Chapters.storeChapters(chapters);
                    window.YTEnhancer.Chapters.displayChapters(chapters);
                } else {
                    window.YTEnhancer.Utils.showTranscriptError('chapters');
                }
            } else {
                window.YTEnhancer.Utils.showTranscriptError('chapters');
            }
        } catch (error) {
            window.YTEnhancer.Utils.showTranscriptError('chapters');
        }
    });
};

// Reset the chapters view based on video state
window.YTEnhancer.Chapters.resetChaptersView = function () {
    const chaptersList = document.getElementById('chapters-list');
    const chaptersContainer = document.getElementById('chapters-tab');
    if (!chaptersList || !chaptersContainer) return;

    if (!window.YTEnhancer.Utils.isWatchingVideo()) {
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
        window.YTEnhancer.Chapters.setupChaptersFeature();
    }
};

window.YTEnhancer.Chapters.loadStoredChapters = async function () {
    try {
        const chapters = await window.YTEnhancer.Chapters.retrieveChapters();
        if (chapters) {
            winsdow.YTEnhancer.Chapters.displayChapters(chapters);
        }
    } catch (error) {
        window.YTEnhancer.Utils.showToast('Failed to load saved chapters.');
    }
}
