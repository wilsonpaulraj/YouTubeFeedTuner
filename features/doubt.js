// Doubt Feature Functions
window.YTEnhancer = window.YTEnhancer || {};
window.YTEnhancer.Doubt = {};

// Store questions in chrome storage
window.YTEnhancer.Doubt.storeQuestion = async function (question) {
    const videoId = window.YTEnhancer.Utils.getCurrentVideoId();
    // Get existing questions for this video
    const data = await chrome.storage.local.get(`doubt_${videoId}`);
    const existingQuestions = data[`doubt_${videoId}`] || [];

    // Add the new question to the array
    existingQuestions.push(question);

    // Store the updated array
    await chrome.storage.local.set({
        [`doubt_${videoId}`]: existingQuestions
    });
};

// Retrieve questions from chrome storage
window.YTEnhancer.Doubt.retrieveQuestions = async function () {
    const videoId = window.YTEnhancer.Utils.getCurrentVideoId();
    const data = await chrome.storage.local.get(`doubt_${videoId}`);
    return data[`doubt_${videoId}`] || [];
};

// Generate answer to a question using LLM
window.YTEnhancer.Doubt.getAnswer = async function (question, timestamp, transcript) {
    // Convert timestamp to seconds if provided
    const timeInSeconds = timestamp ? window.YTEnhancer.Doubt.parseTimestamp(timestamp) : 0;

    // Limit transcript length if it's too long
    let trimmedTranscript = transcript;
    if (transcript.length > 15000) {
        console.log("Transcript is too long, trimming to 15000 characters");
        trimmedTranscript = transcript.substring(0, 15000) + "... [transcript truncated due to length]";
    }

    // Create appropriate context based on timestamp availability
    let contextText = timestamp
        ? `The question is about content around the ${timestamp} mark in the video.`
        : `The question is about the video's content.`;

    const prompt = `
        You are an AI assistant helping someone understand the content of a video.

        Their question: "${question}"

        ${contextText}

        Here is the transcript of the video:
        "${trimmedTranscript}"

        Instructions:
        1. Provide a direct, clear answer to the question.
        2. Focus on explaining concepts in simple terms, not just describing what the video shows.
        3. If the question is about a problem being solved, explain the problem conceptually.
        4. Don't preface your answer with phrases like "In the video..." or "At this timestamp..."
        5. Respond as if you're directly answering their question, not summarizing the video.
        6. Keep your answer concise and to the point.
    `;

    // Maximum number of retries
    const MAX_RETRIES = 2;
    let retries = 0;
    let lastError = null;

    while (retries <= MAX_RETRIES) {
        try {
            console.log(`Sending question to LLM (attempt ${retries + 1}/${MAX_RETRIES + 1}):`,
                question, timestamp ? `at timestamp: ${timestamp}` : "(no timestamp)");
            const response = await window.YTEnhancer.LLM.getLLMResponse(prompt);
            console.log("Received response from LLM");

            // Validate response
            if (!response || response.trim() === "" ||
                response.includes("I'm sorry, I couldn't generate an answer")) {
                throw new Error("Empty or error response from LLM");
            }

            return response;
        } catch (error) {
            lastError = error;
            console.error(`Error getting answer from LLM (attempt ${retries + 1}/${MAX_RETRIES + 1}):`, error);
            retries++;

            // Wait before retrying
            if (retries <= MAX_RETRIES) {
                await new Promise(resolve => setTimeout(resolve, 1000 * retries));
            }
        }
    }

    // If we've exhausted retries, generate a helpful response based on the transcript
    console.error("Failed to get answer after multiple attempts, generating fallback response");

    try {
        // Extract key words from the question for simple matching
        const questionWords = question.toLowerCase().split(/\s+/)
            .filter(word => word.length > 3 && !['what', 'when', 'where', 'which', 'about', 'explain', 'tell'].includes(word));

        // Find relevant parts of the transcript that might contain the answer
        const lines = trimmedTranscript.split(/[.!?]\s+/);
        const relevantLines = lines.filter(line =>
            questionWords.some(word => line.toLowerCase().includes(word.toLowerCase())));

        // If we found some relevant content, return it
        if (relevantLines.length > 0) {
            const excerpt = relevantLines.slice(0, 3).join(". ") + ".";
            return `Based on the transcript, this might help answer your question: "${excerpt}"

I apologize, but I encountered a technical issue when generating a more detailed answer. The above is an excerpt from the transcript that seems most relevant to your question.`;
        }
    } catch (fallbackError) {
        console.error("Error in fallback response generation:", fallbackError);
    }

    // Ultimate fallback message
    return "I apologize, but I couldn't generate a specific answer for your question at this time. Please try rephrasing your question or asking something else about the video content.";
};

// Extract relevant part of transcript around a timestamp
window.YTEnhancer.Doubt.extractRelevantTranscript = function (transcript, timestampSeconds, windowSeconds) {
    // This is a simplified approach - a more sophisticated implementation would parse
    // the actual transcript structure with proper timestamps

    // For now, we'll just take a rough section of the text
    const words = transcript.split(/\s+/);
    const averageWordsPerMinute = 150;
    const wordsPerSecond = averageWordsPerMinute / 60;

    // Estimate position in transcript based on timestamp
    const estimatedWordPosition = Math.floor(timestampSeconds * wordsPerSecond);

    // Calculate window size in words
    const windowSizeInWords = Math.floor(windowSeconds * wordsPerSecond);

    // Get start and end positions
    const startPos = Math.max(0, estimatedWordPosition - windowSizeInWords);
    const endPos = Math.min(words.length, estimatedWordPosition + windowSizeInWords);

    // Extract the relevant words
    return words.slice(startPos, endPos).join(' ');
};

// Parse timestamp string to seconds
window.YTEnhancer.Doubt.parseTimestamp = function (timestamp) {
    if (!timestamp) return 0;

    try {
        // Handle formats like "1:23" or "1:23:45"
        const parts = timestamp.split(':').map(Number);

        if (parts.length === 3) {
            // Format: hours:minutes:seconds
            return parts[0] * 3600 + parts[1] * 60 + parts[2];
        } else if (parts.length === 2) {
            // Format: minutes:seconds
            return parts[0] * 60 + parts[1];
        } else if (parts.length === 1 && !isNaN(parts[0])) {
            // Format: seconds only
            return parts[0];
        }

        return 0;
    } catch (error) {
        console.error('Error parsing timestamp:', error);
        return 0;
    }
};

// Display questions history
window.YTEnhancer.Doubt.displayQuestions = function (questions) {
    const doubtHistory = document.getElementById('doubt-history');
    const currentAnswerSection = document.getElementById('current-answer-section');
    const currentAnswerContainer = document.getElementById('current-answer-container');
    const emptyAnswerState = document.getElementById('empty-answer-state');
    const currentQuestionElement = document.getElementById('current-question');
    const currentAnswerElement = document.getElementById('current-answer');

    if (!doubtHistory) return;

    if (!questions || questions.length === 0) {
        doubtHistory.innerHTML = '<p class="info-text">Your questions will appear here.</p>';

        // For empty state: make sure empty answer state is visible
        if (currentAnswerSection) {
            currentAnswerSection.classList.remove('hidden');
        }
        if (currentAnswerContainer) {
            currentAnswerContainer.classList.add('hidden');
        }
        if (emptyAnswerState) {
            emptyAnswerState.style.display = 'flex';
        }

        console.log("Empty state should be displayed now");
        return;
    }

    let questionsHTML = '';

    // Display questions in reverse chronological order (newest first)
    questions.slice().reverse().forEach((item, index) => {
        const actualIndex = questions.length - 1 - index;

        questionsHTML += `
            <div class="doubt-history-item" data-index="${actualIndex}">
                <div class="history-item-content">
                    <div class="history-timestamp">${item.timestamp}</div>
                    <div class="history-question">${item.question}</div>
                    </div>
                <div class="history-actions">
                    <button class="history-delete-btn" data-index="${actualIndex}" aria-label="Delete question">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
            </div>
        `;
    });

    doubtHistory.innerHTML = questionsHTML;

    // Set the most recent question as the current question by default
    if (questions.length > 0 && currentQuestionElement && currentAnswerElement) {
        const latestQuestion = questions[questions.length - 1];
        currentQuestionElement.textContent = latestQuestion.question;
        currentAnswerElement.textContent = latestQuestion.answer;

        // Show answer section and container
        if (currentAnswerSection) {
            currentAnswerSection.classList.remove('hidden');
        }
        if (currentAnswerContainer) {
            currentAnswerContainer.classList.remove('hidden');
        }
        if (emptyAnswerState) {
            emptyAnswerState.style.display = 'none';
        }

        // Highlight the first history item
        const firstHistoryItem = doubtHistory.querySelector('.doubt-history-item');
        if (firstHistoryItem) {
            firstHistoryItem.classList.add('active');
        }
    }

    // Add event listeners to history items
    const historyItems = doubtHistory.querySelectorAll('.doubt-history-item');
    historyItems.forEach(item => {
        item.addEventListener('click', async (e) => {
            // Make sure we didn't click on the delete button
            if (!e.target.closest('.history-delete-btn')) {
                const index = parseInt(item.dataset.index);
                const question = questions[index];

                // Update current answer display
                const currentAnswerContainer = document.getElementById('current-answer-container');
                const currentQuestionDisplay = document.getElementById('current-question');
                const currentAnswerDisplay = document.getElementById('current-answer');

                if (currentAnswerContainer && currentQuestionDisplay && currentAnswerDisplay) {
                    currentQuestionDisplay.textContent = question.question;
                    // Format the answer text with markdown
                    currentAnswerDisplay.innerHTML = window.YTEnhancer.Doubt.formatAnswer(question.answer);

                    // Reset the answer UI state - properly hide empty state and show answer
                    window.YTEnhancer.Doubt.resetAnswerState();

                    // Update active state
                    historyItems.forEach(i => i.classList.remove('active'));
                    item.classList.add('active');

                    // Wait a tiny bit for the UI update to complete
                    await new Promise(resolve => setTimeout(resolve, 10));

                    // Also seek video to that timestamp if available
                    const video = document.querySelector('video');
                    if (video && question.timestampSeconds) {
                        video.currentTime = question.timestampSeconds;
                    }
                }
            }
        });
    });

    // Add event listeners to delete buttons
    const deleteButtons = doubtHistory.querySelectorAll('.history-delete-btn');
    deleteButtons.forEach(button => {
        button.addEventListener('click', async (e) => {
            e.stopPropagation(); // Prevent triggering the parent click
            const index = parseInt(button.dataset.index);
            await window.YTEnhancer.Doubt.deleteQuestion(index);

            // If this was the last question, hide the answer section
            const updatedQuestions = await window.YTEnhancer.Doubt.retrieveQuestions();
            if (updatedQuestions.length === 0) {
                if (currentAnswerContainer) {
                    currentAnswerContainer.classList.add('hidden');
                }
                if (emptyAnswerState) {
                    emptyAnswerState.style.display = 'flex';
                }
            }
        });
    });
};

// Delete a question by index
window.YTEnhancer.Doubt.deleteQuestion = async function (index) {
    try {
        console.log('Deleting question at index:', index);

        const videoId = window.YTEnhancer.Utils.getCurrentVideoId();
        if (!videoId) {
            console.error('No video ID available, cannot delete question');
            return;
        }

        // First, get the full list of all questions
        const storedData = await chrome.storage.local.get('doubts');
        const allQuestions = storedData.doubts || [];

        // Then get current video questions to reference the index
        const videoQuestions = allQuestions.filter(q => q.videoId === videoId);

        if (index < 0 || index >= videoQuestions.length) {
            console.error('Invalid question index:', index);
            return;
        }

        // Get the question to delete based on its unique properties
        const questionToDelete = videoQuestions[index];

        // Find its index in the global questions array
        const globalIndex = allQuestions.findIndex(q =>
            q.videoId === questionToDelete.videoId &&
            q.question === questionToDelete.question &&
            q.date === questionToDelete.date
        );

        if (globalIndex !== -1) {
            // Remove from global array
            allQuestions.splice(globalIndex, 1);

            // Update storage
            await chrome.storage.local.set({ 'doubts': allQuestions });

            console.log('Question deleted successfully');

            // Update the UI with filtered questions for current video
            const updatedVideoQuestions = allQuestions.filter(q => q.videoId === videoId);

            // Before updating display, check if the current displayed question was deleted
            const currentQuestionElement = document.getElementById('current-question');
            const wasCurrentQuestionDeleted = currentQuestionElement &&
                currentQuestionElement.textContent === questionToDelete.question;

            // Update question history display
            window.YTEnhancer.Doubt.updateQuestionHistoryDisplay(updatedVideoQuestions);

            // If no questions left or the current displayed question was deleted,
            // reset the current answer display
            if (updatedVideoQuestions.length === 0 || wasCurrentQuestionDeleted) {
                const currentQuestion = document.getElementById('current-question');
                const currentAnswer = document.getElementById('current-answer');

                if (currentQuestion) currentQuestion.textContent = '';
                if (currentAnswer) currentAnswer.textContent = '';

                // Use the reset function to update the UI to the empty state
                window.YTEnhancer.Doubt.resetAnswerState();

                console.log('Reset answer state after question deletion');
            }
        } else {
            console.error('Question not found in global array');
        }
    } catch (error) {
        console.error('Error deleting question:', error);
    }
};

// Set current timestamp in the timestamp display
window.YTEnhancer.Doubt.setCurrentTimestamp = function (seconds = null) {
    const timestampDisplay = document.getElementById('current-timestamp');
    const jumpButton = document.getElementById('jump-to-timestamp');

    if (!timestampDisplay) return;

    if (seconds === null) {
        const video = document.querySelector('video');
        if (video) {
            seconds = video.currentTime;
            const formattedTime = window.YTEnhancer.Utils.formatTime(seconds);
            timestampDisplay.textContent = `Timestamp: ${formattedTime}`;
            timestampDisplay.dataset.seconds = seconds;

            // Enable jump button if we have a valid timestamp
            if (jumpButton) {
                jumpButton.disabled = seconds <= 0;
            }
        } else {
            // If no video, don't set any timestamp
            timestampDisplay.textContent = 'Timestamp: Not selected';
            timestampDisplay.dataset.seconds = '';

            if (jumpButton) {
                jumpButton.disabled = true;
            }
        }
    } else if (seconds > 0) {
        // Only set timestamp if seconds is greater than 0
        const formattedTime = window.YTEnhancer.Utils.formatTime(seconds);
        timestampDisplay.textContent = `Timestamp: ${formattedTime}`;
        timestampDisplay.dataset.seconds = seconds;

        // Enable jump button
        if (jumpButton) {
            jumpButton.disabled = false;
        }
    } else {
        // For zero or negative seconds, show "Not selected"
        timestampDisplay.textContent = 'Timestamp: Not selected';
        timestampDisplay.dataset.seconds = '';

        if (jumpButton) {
            jumpButton.disabled = true;
        }
    }
};

// Function to ensure empty state is shown initially
window.YTEnhancer.Doubt.initializeEmptyState = function () {
    try {
        console.log('Initializing empty state');
        const currentAnswerSection = document.getElementById('current-answer-section');
        const currentAnswerContainer = document.getElementById('current-answer-container');
        const emptyAnswerState = document.getElementById('empty-answer-state');
        const doubtHistory = document.getElementById('doubt-history');
        const currentQuestion = document.getElementById('current-question');

        // Make sure answer section is visible
        if (currentAnswerSection) {
            currentAnswerSection.classList.remove('hidden');
        }

        // Check for questions or an active question
        const hasQuestions = doubtHistory && doubtHistory.querySelectorAll('.doubt-history-item').length > 0;
        const hasActiveQuestion = currentQuestion && currentQuestion.textContent.trim() !== '';

        console.log('Has questions:', hasQuestions, 'Has active question:', hasActiveQuestion);

        if (!hasQuestions || !hasActiveQuestion) {
            // No questions or no active question, show empty state
            if (emptyAnswerState) {
                emptyAnswerState.style.display = 'flex';
                console.log('Empty state displayed in initialize');
            }
            if (currentAnswerContainer) {
                currentAnswerContainer.classList.add('hidden');
                console.log('Answer container hidden in initialize');
            }
        } else {
            // Has questions and active question, show answer
            if (emptyAnswerState) {
                emptyAnswerState.style.display = 'none';
                console.log('Empty state hidden in initialize');
            }
            if (currentAnswerContainer) {
                currentAnswerContainer.classList.remove('hidden');
                console.log('Answer container shown in initialize');
            }
        }
    } catch (error) {
        console.error('Error in initializing empty state:', error);
    }
};

// Fullscreen functionality for answer section
window.YTEnhancer.Doubt.toggleFullscreen = function () {
    const overlay = document.getElementById('fullscreen-answer-overlay');
    const currentQuestion = document.getElementById('current-question');
    const currentAnswer = document.getElementById('current-answer');
    const fullscreenQuestion = document.getElementById('fullscreen-question');
    const fullscreenAnswer = document.getElementById('fullscreen-answer');

    if (!overlay || !currentQuestion || !currentAnswer || !fullscreenQuestion || !fullscreenAnswer) {
        console.error('Missing elements for fullscreen toggle');
        return;
    }

    // Copy content to fullscreen - preserve the HTML formatting
    fullscreenQuestion.textContent = currentQuestion.textContent;
    fullscreenAnswer.innerHTML = currentAnswer.innerHTML;

    // Show overlay (add a small delay to allow DOM updates)
    requestAnimationFrame(() => {
        // Since overlay is now contained in the doubt tab, we don't need to modify body overflow
        // Just add a class to the doubt container to indicate fullscreen mode
        const doubtContainer = document.querySelector('.doubt-container');
        if (doubtContainer) {
            doubtContainer.classList.add('fullscreen-active');
        }

        // Force a reflow before adding the active class for better animation
        overlay.offsetHeight;

        // Add active class to trigger animations
        overlay.classList.add('active');
    });

    // Add event listener for escape key (will be removed when closed)
    document.addEventListener('keydown', window.YTEnhancer.Doubt.handleFullscreenEscape);
};

// Handle escape key to close fullscreen
window.YTEnhancer.Doubt.handleFullscreenEscape = function (e) {
    if (e.key === 'Escape') {
        window.YTEnhancer.Doubt.closeFullscreen();
    }
};

// Close fullscreen overlay
window.YTEnhancer.Doubt.closeFullscreen = function () {
    const overlay = document.getElementById('fullscreen-answer-overlay');
    if (overlay) {
        // Remove active class to trigger closing animation
        overlay.classList.remove('active');

        // Remove the fullscreen active class from the doubt container
        const doubtContainer = document.querySelector('.doubt-container');
        if (doubtContainer) {
            doubtContainer.classList.remove('fullscreen-active');
        }
    }

    // Remove escape key listener
    document.removeEventListener('keydown', window.YTEnhancer.Doubt.handleFullscreenEscape);
};

// Setup the doubt feature
window.YTEnhancer.Doubt.setupDoubtFeature = function () {
    const submitButton = document.getElementById('submit-doubt');
    const doubtInput = document.getElementById('doubt-input');
    const currentTimestampElement = document.getElementById('current-timestamp');
    const setTimestampButton = document.getElementById('add-doubt-timestamp');
    const jumpToTimestampButton = document.getElementById('jump-to-timestamp');
    const currentAnswerContainer = document.getElementById('current-answer-container');
    const emptyAnswerState = document.getElementById('empty-answer-state');
    const fullscreenButton = document.getElementById('fullscreen-button');
    const fullscreenCloseButton = document.getElementById('fullscreen-close');

    // Move fullscreen overlay inside the doubt container for proper positioning
    const moveFullscreenOverlay = () => {
        const fullscreenOverlay = document.getElementById('fullscreen-answer-overlay');
        const doubtContainer = document.querySelector('.doubt-container');

        if (fullscreenOverlay && doubtContainer) {
            // Check if it's already in the right container
            if (!doubtContainer.contains(fullscreenOverlay)) {
                // Remove from current location and add to doubt container
                fullscreenOverlay.remove();
                doubtContainer.appendChild(fullscreenOverlay);

                // Re-attach event listener to close button
                const newCloseButton = document.getElementById('fullscreen-close');
                if (newCloseButton) {
                    newCloseButton.addEventListener('click', () => {
                        window.YTEnhancer.Doubt.closeFullscreen();
                    });
                }

                console.log('Moved fullscreen overlay to doubt container');
            }
        }
    };

    // Call immediately and also after a small delay to ensure DOM is ready
    moveFullscreenOverlay();
    setTimeout(moveFullscreenOverlay, 100);

    let currentTimestamp = '';
    let isSubmitting = false;

    // Initialize with correct empty state - use our dedicated function
    window.YTEnhancer.Doubt.initializeEmptyState();

    console.log("Initial setup completed in setupDoubtFeature");

    // Load stored questions for this video
    window.YTEnhancer.Doubt.loadStoredQuestions();

    // Set up fullscreen button
    if (fullscreenButton) {
        fullscreenButton.addEventListener('click', () => {
            window.YTEnhancer.Doubt.toggleFullscreen();
        });
    }

    // Set up fullscreen close button
    if (fullscreenCloseButton) {
        fullscreenCloseButton.addEventListener('click', () => {
            window.YTEnhancer.Doubt.closeFullscreen();
        });
    }

    // Set up timestamp button
    setTimestampButton?.addEventListener('click', () => {
        try {
            const video = document.querySelector('video');
            if (!video) return;

            const time = video.currentTime;
            currentTimestamp = window.YTEnhancer.Utils.formatTime(time);

            if (currentTimestampElement) {
                currentTimestampElement.textContent = `Timestamp: ${currentTimestamp}`;
                currentTimestampElement.style.color = 'var(--accent-color)';

                // Apply a pulse animation to indicate success
                currentTimestampElement.classList.add('timestamp-pulse');
                setTimeout(() => {
                    currentTimestampElement.classList.remove('timestamp-pulse');
                }, 1000);
            }

            // Enable jump to timestamp button
            if (jumpToTimestampButton) {
                jumpToTimestampButton.disabled = false;
            }
        } catch (error) {
            console.error('Error setting timestamp:', error);
        }
    });

    // Jump to timestamp
    jumpToTimestampButton?.addEventListener('click', () => {
        try {
            if (!currentTimestamp) return;

            const video = document.querySelector('video');
            if (!video) return;

            const timeInSeconds = window.YTEnhancer.Doubt.parseTimestamp(currentTimestamp);
            video.currentTime = timeInSeconds;
        } catch (error) {
            console.error('Error jumping to timestamp:', error);
        }
    });

    // Submit doubt event
    submitButton?.addEventListener('click', async () => {
        if (isSubmitting) return; // Prevent multiple submissions

        const question = doubtInput?.value?.trim();
        if (!question) {
            window.YTEnhancer.Utils.showToast('Please enter a question');
            return;
        }

        // Set submitting state
        isSubmitting = true;
        const originalButtonText = submitButton.textContent;
        submitButton.innerHTML = `
            <div class="spinner-small"></div>
            Processing...
        `;
        submitButton.disabled = true;
        submitButton.classList.add('processing');
        doubtInput.disabled = true;

        try {
            // Get current video transcript
            const videoId = window.YTEnhancer.Utils.getCurrentVideoId();
            if (!videoId) {
                throw new Error('No video ID available');
            }

            // Show the current answer section and container with loading state
            const currentAnswerSection = document.getElementById('current-answer-section');
            const currentAnswerContainer = document.getElementById('current-answer-container');
            const currentQuestionDisplay = document.getElementById('current-question');
            const currentAnswerDisplay = document.getElementById('current-answer');
            const emptyAnswerState = document.getElementById('empty-answer-state');

            if (currentAnswerSection && currentAnswerContainer && currentQuestionDisplay && currentAnswerDisplay) {
                // Reset the answer UI state
                window.YTEnhancer.Doubt.resetAnswerState();

                currentQuestionDisplay.textContent = question;

                // Add an enhanced loading animation
                currentAnswerDisplay.innerHTML = `
                    <div class="loading-inline">
                        <div class="spinner-small"></div>
                        <div class="loading-words">
                            <p>Analyzing video content and generating answer</p>
                            <div class="loading-dots">
                                <div class="loading-dot"></div>
                                <div class="loading-dot"></div>
                                <div class="loading-dot"></div>
                            </div>
                        </div>
                    </div>
                `;
            }

            let transcript = await window.YTEnhancer.Transcript.getTranscript(videoId);

            if (!transcript || transcript === "Transcript not available" || transcript === "Transcript not loaded") {
                throw new Error('Transcript not available');
            }

            // Get answer from LLM
            const answer = await window.YTEnhancer.Doubt.getAnswer(question, currentTimestamp, transcript);

            // Format and display the answer
            if (currentAnswerDisplay) {
                // Simulate word-by-word typing effect
                let words = answer.split(' ');
                currentAnswerDisplay.innerHTML = '';

                // Add words with a small delay to simulate typing
                const wordDelay = Math.min(20, 1000 / words.length); // Ensures it doesn't take too long for long answers

                let typedContent = '';
                for (let i = 0; i < words.length; i++) {
                    await new Promise(resolve => setTimeout(resolve, wordDelay));
                    typedContent += (i > 0 ? ' ' : '') + words[i];
                    // Apply markdown formatting
                    currentAnswerDisplay.innerHTML = window.YTEnhancer.Doubt.formatAnswer(typedContent);
                }
            }

            // Store the question and answer
            await window.YTEnhancer.Doubt.storeQuestion(question, answer, currentTimestamp);

            // Update the history display
            await window.YTEnhancer.Doubt.loadStoredQuestions();

            // Reset input
            if (doubtInput) {
                doubtInput.value = '';
            }
        } catch (error) {
            console.error('Error processing question:', error);

            // Show error in answer display
            const currentAnswerSection = document.getElementById('current-answer-section');
            const currentAnswerContainer = document.getElementById('current-answer-container');
            const currentAnswerDisplay = document.getElementById('current-answer');

            if (currentAnswerSection && currentAnswerContainer && currentAnswerDisplay) {
                currentAnswerSection.classList.remove('hidden');
                currentAnswerContainer.classList.remove('hidden');
                currentAnswerDisplay.innerHTML = `
                    <div class="error-message">
                        <p>Sorry, I couldn't process your question: ${error.message || 'Unknown error'}</p>
                        <p>Please try again or ask a different question.</p>
                    </div>
                `;
            }

            window.YTEnhancer.Utils.showToast('Error processing your question. Please try again.');
        } finally {
            // Reset UI state
            isSubmitting = false;
            if (submitButton) {
                submitButton.innerHTML = originalButtonText;
                submitButton.disabled = false;
                submitButton.classList.remove('processing');
            }
            if (doubtInput) {
                doubtInput.disabled = false;
                doubtInput.focus();
            }
        }
    });

    // Add keyboard shortcut (Enter key) for submitting questions
    doubtInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !isSubmitting) {
            e.preventDefault();
            submitButton?.click();
        }
    });
};

// Reset the doubt view based on video state
window.YTEnhancer.Doubt.resetDoubtView = function () {
    const doubtContainer = document.getElementById('doubt-tab');
    if (!doubtContainer) return;

    if (!window.YTEnhancer.Utils.isWatchingVideo()) {
        // User is not watching a video - show disabled state
        doubtContainer.innerHTML = `
            <div class="doubt-container">
                <div class="doubt-header">
                    <h3>Questions</h3>
                </div>

                <div class="doubt-content">
                    <div class="doubt-input-section">
                        <div class="doubt-input-actions">
                            <div class="timestamp-row">
                    <div class="timestamp-display">
                        <span id="current-timestamp">Timestamp: Not selected</span>
                                </div>
                                <button id="add-doubt-timestamp" class="timestamp-button" disabled aria-label="Set timestamp">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
                                    </svg>
                                </button>
                                <button id="jump-to-timestamp" class="timestamp-button" disabled aria-label="Jump to timestamp">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                                <polygon points="5 3 19 12 5 21 5 3"></polygon>
                            </svg>
                        </button>
                    </div>
                        <button id="submit-doubt" class="submit-button" disabled>
                            Ask Question
                        </button>
                    </div>

                        <textarea id="doubt-input" placeholder="Open a video to ask questions" disabled></textarea>
                </div>

                    <div id="current-answer-section" class="doubt-answer-section">
                        <div id="current-answer-container" class="current-answer-container hidden">
                            <div class="current-question-display" id="current-question"></div>
                            <div class="current-answer-display" id="current-answer"></div>
                        </div>
                        <div id="empty-answer-state" class="empty-answer-state">
                            <div class="empty-answer-icon">
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <line x1="12" y1="16" x2="12" y2="12"></line>
                                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                                </svg>
                            </div>
                            <h4>Ask Your First Question</h4>
                            <p>Get AI answers based on the video transcript</p>
                            <ul class="question-tips">
                                <li>Add timestamp for specific context</li>
                                <li>Ask about video concepts</li>
                                <li>Be specific for better results</li>
                            </ul>
                        </div>
                    </div>

                    <div class="doubt-history-section">
                        <div class="history-section-header">Previous Questions</div>
                        <div id="doubt-history" class="doubt-history-list">
                        <p class="info-text">Open a video to view your question history.</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    } else {
        // User is watching a video - show active state
        doubtContainer.innerHTML = `
            <div class="doubt-container">
                <div class="doubt-header">
                    <h3>Questions</h3>
                </div>

                <div class="doubt-content">
                    <div class="doubt-input-section">
                        <textarea id="doubt-input" placeholder="Ask a question about this part of the video..."></textarea>

                        <div class="doubt-input-actions">
                            <div class="timestamp-row">
                    <div class="timestamp-display">
                        <span id="current-timestamp">Timestamp: Not selected</span>
                                </div>
                                <button id="add-doubt-timestamp" class="timestamp-button" aria-label="Set timestamp">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
                                    </svg>
                                </button>
                                <button id="jump-to-timestamp" class="timestamp-button" disabled aria-label="Jump to timestamp">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                                <polygon points="5 3 19 12 5 21 5 3"></polygon>
                            </svg>
                        </button>
                    </div>
                        <button id="submit-doubt" class="submit-button">
                            Ask Question
                        </button>
                    </div>
                </div>

                    <div id="current-answer-section" class="doubt-answer-section">
                        <div id="current-answer-container" class="current-answer-container hidden">
                            <div class="current-question-display" id="current-question"></div>
                            <div class="current-answer-display" id="current-answer"></div>
                    </div>
                        <div id="empty-answer-state" class="empty-answer-state">
                            <div class="empty-answer-icon">
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <line x1="12" y1="16" x2="12" y2="12"></line>
                                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                                </svg>
                            </div>
                            <h4>Ask Your First Question</h4>
                            <p>Get AI answers based on the video transcript</p>
                            <ul class="question-tips">
                                <li>Add timestamp for specific context</li>
                                <li>Ask about video concepts</li>
                                <li>Be specific for better results</li>
                            </ul>
                        </div>
                    </div>

                    <div class="doubt-history-section">
                        <div class="history-section-header">Previous Questions</div>
                        <div id="doubt-history" class="doubt-history-list">
                            <p class="info-text">Your questions will appear here.</p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Setup event listeners and load saved questions
        window.YTEnhancer.Doubt.setupDoubtFeature();
    }
};

// Load stored questions for the current video
window.YTEnhancer.Doubt.loadStoredQuestions = async function () {
    try {
        const questions = await window.YTEnhancer.Doubt.retrieveQuestions();
        window.YTEnhancer.Doubt.displayQuestions(questions);

        // Initialize empty state after loading questions
        setTimeout(() => {
            window.YTEnhancer.Doubt.initializeEmptyState();
        }, 100);
    } catch (error) {
        window.YTEnhancer.Utils.showToast('Failed to load saved questions.');
    }
};

// Store question and answer in browser storage
window.YTEnhancer.Doubt.storeQuestion = async function (question, answer, timestamp) {
    try {
        console.log('Storing question:', question);
        const videoId = window.YTEnhancer.Utils.getCurrentVideoId();
        if (!videoId) {
            throw new Error('No video ID available');
        }

        // Get video title
        const videoTitle = document.querySelector('h1.ytd-watch-metadata')?.textContent?.trim() || 'Unknown Video';

        // Create question object
        const questionObj = {
            id: Date.now().toString(),
            videoId,
            videoTitle,
            question,
            answer,
            timestamp: timestamp || 'No timestamp',
            timestampSeconds: timestamp ? window.YTEnhancer.Doubt.parseTimestamp(timestamp) : 0,
            date: new Date().toISOString()
        };

        // Get existing questions
        const storedData = await chrome.storage.local.get('doubts');
        let questions = storedData.doubts || [];

        // Add new question at the beginning
        questions.unshift(questionObj);

        // Limit to 50 questions to prevent storage issues
        if (questions.length > 50) {
            questions = questions.slice(0, 50);
        }

        // Store updated questions
        await chrome.storage.local.set({ 'doubts': questions });

        // Update UI to show we now have questions
        const emptyAnswerState = document.getElementById('empty-answer-state');
        if (emptyAnswerState) {
            emptyAnswerState.style.display = 'none';
        }

        const currentAnswerContainer = document.getElementById('current-answer-container');
        if (currentAnswerContainer) {
            currentAnswerContainer.classList.remove('hidden');
        }

        console.log('Question stored successfully:', questionObj.id);
        return questionObj;
    } catch (error) {
        console.error('Error storing question:', error);
        throw error;
    }
};

// Load stored questions
window.YTEnhancer.Doubt.loadStoredQuestions = async function () {
    try {
        // Get current video ID
        const currentVideoId = window.YTEnhancer.Utils.getCurrentVideoId();

        // Get all stored questions
        const storedData = await chrome.storage.local.get('doubts');
        const questions = storedData.doubts || [];

        // Filter questions for the current video
        const videoQuestions = currentVideoId
            ? questions.filter(q => q.videoId === currentVideoId)
            : [];

        // Update the history display
        window.YTEnhancer.Doubt.updateQuestionHistoryDisplay(videoQuestions);

        return videoQuestions;
    } catch (error) {
        console.error('Error loading stored questions:', error);
        return [];
    }
};

// Update question history display
window.YTEnhancer.Doubt.updateQuestionHistoryDisplay = function (questions) {
    try {
        console.log('Updating question history display with', questions ? questions.length : 0, 'questions');
        const historyContainer = document.getElementById('doubt-history');
        const currentAnswerContainer = document.getElementById('current-answer-container');
        const emptyAnswerState = document.getElementById('empty-answer-state');
        const currentAnswerSection = document.getElementById('current-answer-section');
        const currentQuestion = document.getElementById('current-question');
        const currentAnswer = document.getElementById('current-answer');

        if (!historyContainer) {
            console.error('History container not found');
            return;
        }

        // If questions not provided, try to load them
        if (!questions) {
            window.YTEnhancer.Doubt.loadStoredQuestions();
            return;
        }

        // Clear existing content
        historyContainer.innerHTML = '';

        if (questions.length === 0) {
            historyContainer.innerHTML = '<p class="info-text">No questions asked yet</p>';

            // Clear current question/answer if they exist
            if (currentQuestion) currentQuestion.textContent = '';
            if (currentAnswer) currentAnswer.textContent = '';

            // When no questions, always show empty state and hide answer container
            if (currentAnswerSection) {
                currentAnswerSection.classList.remove('hidden');
            }
            if (currentAnswerContainer) {
                currentAnswerContainer.classList.add('hidden');
            }
            if (emptyAnswerState) {
                emptyAnswerState.style.display = 'flex';
            }

            console.log('No questions, empty state shown');
            return;
        }

        // Create question elements
        questions.forEach(q => {
            const questionElement = document.createElement('div');
            questionElement.className = 'doubt-history-item';

            // Format date for display - just show time if today, otherwise show date too
            const date = new Date(q.date);
            const today = new Date();
            let formattedDate;

            if (date.toDateString() === today.toDateString()) {
                formattedDate = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            } else {
                formattedDate = date.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
                    ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }

            questionElement.innerHTML = `
                <div class="history-item-content">
                    ${q.timestamp !== 'No timestamp' ?
                    `<div class="history-timestamp" data-time="${q.timestampSeconds}">${q.timestamp}</div>` :
                    '<div class="history-timestamp">No timestamp</div>'
                }
                    <div class="history-question">${q.question}</div>
                </div>
                <div class="history-actions">
                    <button class="history-view-btn" aria-label="View full answer">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="16" x2="12" y2="12"></line>
                            <line x1="12" y1="8" x2="12.01" y2="8"></line>
                        </svg>
                    </button>
                    <button class="history-delete-btn" aria-label="Delete question">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            `;

            // Store the answer and other data as attributes on the element
            questionElement.dataset.question = q.question;
            questionElement.dataset.answer = q.answer;
            questionElement.dataset.timestamp = q.timestamp;
            questionElement.dataset.timestampSeconds = q.timestampSeconds;

            // Add event listener for clicking on the question to view it
            questionElement.addEventListener('click', (e) => {
                // Don't trigger if clicking delete button
                if (e.target.closest('.history-delete-btn')) return;

                // Update current answer display
                const currentAnswerContainer = document.getElementById('current-answer-container');
                const currentQuestionDisplay = document.getElementById('current-question');
                const currentAnswerDisplay = document.getElementById('current-answer');

                if (currentAnswerContainer && currentQuestionDisplay && currentAnswerDisplay) {
                    currentQuestionDisplay.textContent = q.question;
                    // Format the answer text with markdown
                    currentAnswerDisplay.innerHTML = window.YTEnhancer.Doubt.formatAnswer(q.answer);

                    // Reset the answer UI state - properly hide empty state and show answer
                    window.YTEnhancer.Doubt.resetAnswerState();

                    // Update active state
                    historyContainer.querySelectorAll('.doubt-history-item').forEach(item => {
                        item.classList.remove('active');
                    });
                    questionElement.classList.add('active');
                }
            });

            // Add event listener for delete button
            const deleteButton = questionElement.querySelector('.history-delete-btn');
            if (deleteButton) {
                deleteButton.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    console.log('Delete button clicked for question:', q.question);

                    try {
                        // Get updated questions list from storage
                        const storedData = await chrome.storage.local.get('doubts');
                        const allQuestions = storedData.doubts || [];

                        // Find the exact question to delete by matching multiple properties
                        const globalIndex = allQuestions.findIndex(item =>
                            item.id === q.id &&
                            item.question === q.question &&
                            item.date === q.date
                        );

                        console.log('Question index in global array:', globalIndex);

                        if (globalIndex !== -1) {
                            // Remove the question from the array
                            allQuestions.splice(globalIndex, 1);

                            // Update storage
                            await chrome.storage.local.set({ 'doubts': allQuestions });

                            // Get updated list of questions for current video
                            const videoId = window.YTEnhancer.Utils.getCurrentVideoId();
                            const updatedVideoQuestions = allQuestions.filter(item => item.videoId === videoId);

                            // Update the display with filtered questions
                            window.YTEnhancer.Doubt.updateQuestionHistoryDisplay(updatedVideoQuestions);

                            // Reset answer state based on remaining questions
                            if (updatedVideoQuestions.length === 0) {
                                window.YTEnhancer.Doubt.resetAnswerState();
                            }

                            console.log('Question deleted successfully, remaining questions:', updatedVideoQuestions.length);
                        } else {
                            console.error('Question not found in storage');
                        }
                    } catch (error) {
                        console.error('Error deleting question:', error);
                    }
                });
            }

            // Add event listener for timestamp clicks
            const timestampElement = questionElement.querySelector('.history-timestamp');
            if (timestampElement && q.timestamp !== 'No timestamp') {
                timestampElement.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const time = parseFloat(timestampElement.dataset.time);
                    const video = document.querySelector('video');
                    if (video && !isNaN(time)) {
                        video.currentTime = time;
                    }
                });
                timestampElement.style.cursor = 'pointer';
            }

            historyContainer.appendChild(questionElement);
        });
    } catch (error) {
        console.error('Error updating question history display:', error);
    }
};

// Add a function to reset the answer UI state
window.YTEnhancer.Doubt.resetAnswerState = function () {
    try {
        console.log('Resetting answer UI state');
        const currentAnswerSection = document.getElementById('current-answer-section');
        const currentAnswerContainer = document.getElementById('current-answer-container');
        const emptyAnswerState = document.getElementById('empty-answer-state');
        const doubtHistory = document.getElementById('doubt-history');
        const currentQuestion = document.getElementById('current-question');

        // Always ensure the answer section is visible
        if (currentAnswerSection) {
            currentAnswerSection.classList.remove('hidden');
        }

        // Check if there are any questions in the history
        const hasQuestions = doubtHistory && doubtHistory.querySelectorAll('.doubt-history-item').length > 0;
        console.log('Has questions in history:', hasQuestions);

        // Check if there's a current active question
        const hasActiveQuestion = currentQuestion && currentQuestion.textContent.trim() !== '';
        console.log('Has active question:', hasActiveQuestion);

        if (!hasQuestions || !hasActiveQuestion) {
            // If no questions or no active question, show empty state
            if (currentAnswerContainer) {
                currentAnswerContainer.classList.add('hidden');
                console.log('Answer container hidden');
            }

            if (emptyAnswerState) {
                emptyAnswerState.style.display = 'flex';
                console.log('Empty state displayed');
            }
        } else {
            // If there are questions and an active question, show answer container
            if (currentAnswerContainer) {
                currentAnswerContainer.classList.remove('hidden');
                console.log('Answer container shown');
            }

            if (emptyAnswerState) {
                emptyAnswerState.style.display = 'none';
                console.log('Empty state hidden');
            }
        }
    } catch (error) {
        console.error('Error in resetAnswerState:', error);
    }
};

// Helper function to format answer text
window.YTEnhancer.Doubt.formatAnswer = function (text) {
    // Use the parseMarkdown function from Summary module if available
    if (window.YTEnhancer.Summary && typeof window.YTEnhancer.Summary.parseMarkdown === 'function') {
        return window.YTEnhancer.Summary.parseMarkdown(text);
    }

    // Fallback simple markdown parser if Summary module is not available
    return text
        .replace(/(?:\r\n|\r|\n)/g, '<br>') // Line breaks
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold: **text**
        .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italics: *text*
        .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>'); // Links: [text](url)
};
