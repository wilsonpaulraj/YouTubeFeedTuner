// Doubt Feature Functions
window.YTEnhancer = window.YTEnhancer || {};
window.YTEnhancer.Doubt = {};

// Store question and answer in browser storage
window.YTEnhancer.Doubt.storeQuestion = async function (questionData, answer, timestamp) {
    try {
        console.log('Storing question:', typeof questionData === 'object' ? questionData.question : questionData);
        const videoId = window.YTEnhancer.Utils.getCurrentVideoId();
        if (!videoId) {
            throw new Error('No video ID available');
        }

        // Get video title
        const videoTitle = document.querySelector('h1.ytd-watch-metadata')?.textContent?.trim() || 'Unknown Video';

        // Create question object
        let questionObj;

        if (typeof questionData === 'object' && questionData.question) {
            // New format from the chatbot interface
            questionObj = {
                id: Date.now().toString(),
                videoId,
                videoTitle,
                question: questionData.question,
                answer: questionData.answer || answer || '',
                timestamp: questionData.timestamp || timestamp || 'No timestamp',
                timestampSeconds: questionData.timestamp ? window.YTEnhancer.Doubt.parseTimestamp(questionData.timestamp) :
                    timestamp ? window.YTEnhancer.Doubt.parseTimestamp(timestamp) : 0,
                date: questionData.created || new Date().toISOString()
            };
        } else {
            // Original format
            questionObj = {
                id: Date.now().toString(),
                videoId,
                videoTitle,
                question: questionData,
                answer: answer || '',
                timestamp: timestamp || 'No timestamp',
                timestampSeconds: timestamp ? window.YTEnhancer.Doubt.parseTimestamp(timestamp) : 0,
                date: new Date().toISOString()
            };
        }

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
        console.log('Successfully stored question in "doubts" array, total count:', questions.length);

        // Get questions for the current video to update the UI
        const videoQuestions = questions.filter(q => q.videoId === videoId);
        console.log(`This video now has ${videoQuestions.length} stored questions`);

        // IMPORTANT: We don't call displayChatMessages here anymore since the question & answer are already
        // displayed in the chat UI by the submit handler. Doing it again would cause duplicates.
        // The UI will be properly refreshed on next load by loadStoredQuestions.

        // Only update the traditional UI if it exists (for backward compatibility)
        try {
            const emptyAnswerState = document.getElementById('empty-answer-state');
            if (emptyAnswerState) {
                emptyAnswerState.style.display = 'none';
            }

            const currentAnswerContainer = document.getElementById('current-answer-container');
            if (currentAnswerContainer) {
                currentAnswerContainer.classList.remove('hidden');
            }
        } catch (uiError) {
            console.error('Error updating UI after storing question:', uiError);
        }

        console.log('Question stored successfully:', questionObj.id);
        return questionObj;
    } catch (error) {
        console.error('Error storing question:', error);
        window.YTEnhancer.Utils.showToast('Failed to store your question. Please try again.');
        throw error;
    }
};

// Retrieve questions from chrome storage
window.YTEnhancer.Doubt.retrieveQuestions = async function () {
    try {
        const videoId = window.YTEnhancer.Utils.getCurrentVideoId();
        if (!videoId) {
            console.error('No video ID available, cannot retrieve questions');
            return [];
        }

        // First try the new format (direct array of questions)
        const data = await chrome.storage.local.get('doubts');
        const allQuestions = data.doubts || [];

        // Filter questions for the current video ID
        const videoQuestions = allQuestions.filter(q => q.videoId === videoId);

        // Sort by date (newest first based on the date field)
        videoQuestions.sort((a, b) => new Date(b.date) - new Date(a.date));

        console.log(`Retrieved ${videoQuestions.length} questions for video ${videoId}`);
        return videoQuestions;
    } catch (error) {
        console.error('Error retrieving questions:', error);
        return [];
    }
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
    console.log('Setting up doubt feature');

    // Setup chat elements
    const doubtInput = document.getElementById('doubt-input');
    const submitButton = document.getElementById('submit-doubt');
    const chatMessages = document.getElementById('chat-messages');
    const timestampButton = document.getElementById('add-doubt-timestamp');

    if (!doubtInput || !submitButton || !chatMessages) {
        console.error('Required doubt elements not found');
        return;
    }

    // Ensure chat starts at the top when first initialized
    if (chatMessages) {
        chatMessages.scrollTop = 0;
    }

    // Setup tag click handlers
    const doubtTags = chatMessages.querySelectorAll('.doubt-tag');
    doubtTags.forEach(tag => {
        tag.addEventListener('click', () => {
            const fullPrompt = tag.getAttribute('data-prompt');
            if (fullPrompt) {
                // Store the full prompt as a data attribute on the input
                doubtInput.setAttribute('data-full-prompt', fullPrompt);

                // Store the tag name as another data attribute
                const tagText = tag.textContent.trim();
                doubtInput.setAttribute('data-selected-tag', tagText);

                // Add a visual indicator that the tag is selected
                doubtTags.forEach(t => t.classList.remove('selected'));
                tag.classList.add('selected');

                // Focus the input but don't add any text
                doubtInput.focus();
            }
        });
    });

    // Setup auto-grow for textarea
    window.YTEnhancer.Doubt.setupAutoGrowTextarea();

    // Load stored questions immediately
    window.YTEnhancer.Doubt.loadStoredQuestions().then(questions => {
        console.log(`Loaded ${questions.length} questions on initialization`);
    });

    // Handle Enter key to submit
    doubtInput.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            if (!submitButton.disabled) {
                submitButton.click();
            }
        }
    });

    // Timestamp button functionality
    if (timestampButton) {
        timestampButton.addEventListener('click', () => {
            const video = document.querySelector('video');
            if (!video) return;

            // Get current timestamp
            const currentTime = video.currentTime;
            const formattedTime = window.YTEnhancer.Utils.formatTime(currentTime);

            // Store timestamp for submission
            timestampButton.dataset.timestamp = formattedTime;

            // Append to input or add to existing text
            if (doubtInput.value) {
                // Add at the end if there's already text
                doubtInput.value += ` (${formattedTime})`;
            } else {
                // Just add the timestamp if there's no text
                doubtInput.value = `At ${formattedTime}, `;
            }

            // Focus input after adding timestamp
            doubtInput.focus();
        });
    }

    // Submit question
    submitButton.addEventListener('click', async () => {
        const userInput = doubtInput.value.trim();
        if (!userInput) {
            doubtInput.focus();
            return;
        }

        // Check if we have a full prompt and selected tag stored
        const fullPrompt = doubtInput.getAttribute('data-full-prompt');
        const selectedTag = doubtInput.getAttribute('data-selected-tag');

        // What the user sees in the chat
        let displayQuestion = userInput;

        // What gets sent to the LLM
        let llmQuestion = userInput;

        // If a tag was selected, include it in the display question and use the full prompt
        if (selectedTag && fullPrompt) {
            // Format display question to show the user selected a tag
            displayQuestion = `${selectedTag}: ${userInput}`;

            // Combine the background prompt with the user's input for the LLM
            llmQuestion = `${fullPrompt} ${userInput}`;
        }

        // Get timestamp if available
        const timestamp = timestampButton && timestampButton.dataset.timestamp;

        try {
            console.log('Processing question:', displayQuestion);
            console.log('Using LLM question:', llmQuestion);

            // Disable the submit button and show loading
            submitButton.disabled = true;
            submitButton.innerHTML = `
            <div class="spinner-small"></div>
            `;

            // Clear input and reset stored data
            doubtInput.value = '';
            doubtInput.removeAttribute('data-full-prompt');
            doubtInput.removeAttribute('data-selected-tag');
            doubtInput.style.height = 'auto';

            // Remove selection from all tags
            const allTags = chatMessages.querySelectorAll('.doubt-tag');
            allTags.forEach(tag => tag.classList.remove('selected'));

            // Add the question to chat immediately (without the answer yet)
            // User message
            const userMessage = document.createElement('div');
            userMessage.className = 'message user-message';

            // Create message content
            const userMessageContent = document.createElement('div');
            userMessageContent.className = 'message-content';
            userMessageContent.innerText = displayQuestion;

            // Add timestamp badge if available
            if (timestamp) {
                const timestampBadge = document.createElement('div');
                timestampBadge.className = 'timestamp-badge';
                timestampBadge.innerText = timestamp;
                timestampBadge.onclick = (e) => {
                    e.stopPropagation();
                    window.YTEnhancer.Doubt.jumpToVideoTimestamp(timestamp);
                };
                userMessageContent.appendChild(timestampBadge);
            }

            userMessage.appendChild(userMessageContent);
            chatMessages.appendChild(userMessage);

            // Show typing indicator
            window.YTEnhancer.Doubt.showTypingIndicator();

            // Scroll to bottom
            window.YTEnhancer.Doubt.scrollToBottom();

            // Reset timestamp button data
            if (timestampButton) {
                timestampButton.dataset.timestamp = '';
            }

            // Get transcript
            let transcript = await window.YTEnhancer.Transcript.retrieveTranscript();

            // If not found, try to fetch it
            if (!transcript) {
                const videoId = window.YTEnhancer.Utils.getCurrentVideoId();
                transcript = await window.YTEnhancer.Transcript.getTranscript(videoId);

                if (!transcript || transcript === "Transcript not available" || transcript === "Transcript not loaded") {
                    window.YTEnhancer.Utils.showToast('Could not find a transcript for this video');

                    // Remove typing indicator
                    window.YTEnhancer.Doubt.removeTypingIndicator();

                    // Show transcript not available message in chat
                    const errorMessage = document.createElement('div');
                    errorMessage.className = 'message assistant-message error-message';

                    // Create assistant avatar
                    const assistantAvatar = window.YTEnhancer.Doubt.createAssistantAvatar();

                    // Create error content
                    const errorContent = document.createElement('div');
                    errorContent.className = 'message-content';
                    errorContent.innerHTML = `
                        <p>I couldn't find a transcript for this video. YouTube automatic captions are needed to answer questions about the content.</p>
                        <p>Try playing the video for a bit - sometimes this helps load the captions.</p>
                    `;

                    // Add avatar first, then content
                    errorMessage.appendChild(assistantAvatar);
                    errorMessage.appendChild(errorContent);
                    chatMessages.appendChild(errorMessage);

                    // Scroll to bottom
                    window.YTEnhancer.Doubt.scrollToBottom();

                    // Re-enable submit button
                    submitButton.disabled = false;
                    submitButton.innerHTML = `
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13"></line>
                            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                        </svg>
                    `;

                    return;
                }
            }

            // Generate answer
            try {
                const answer = await window.YTEnhancer.Doubt.getAnswer(llmQuestion, timestamp, transcript);

                // Remove typing indicator
                window.YTEnhancer.Doubt.removeTypingIndicator();

                // Store complete Q&A data
                const questionData = {
                    question: displayQuestion,
                    llmQuestion: llmQuestion,
                    answer,
                    timestamp: timestamp || null,
                    created: new Date().toISOString()
                };

                // Assistant message
                const assistantMessage = document.createElement('div');
                assistantMessage.className = 'message assistant-message';

                // Create assistant avatar
                const assistantAvatar = window.YTEnhancer.Doubt.createAssistantAvatar();

                // Create message content
                const assistantMessageContent = document.createElement('div');
                assistantMessageContent.className = 'message-content';
                assistantMessageContent.innerHTML = window.YTEnhancer.Doubt.formatAnswerText(answer);

                // Add avatar first, then content
                assistantMessage.appendChild(assistantAvatar);
                assistantMessage.appendChild(assistantMessageContent);
                chatMessages.appendChild(assistantMessage);

                // Scroll to bottom
                window.YTEnhancer.Doubt.scrollToBottom();

                // Store the Q&A in the database *after* we've displayed it in the UI
                await window.YTEnhancer.Doubt.storeQuestion(questionData);
            } catch (error) {
                console.error('Error getting answer:', error);

                // Remove typing indicator
                window.YTEnhancer.Doubt.removeTypingIndicator();

                // Show error message in chat
                const errorMessage = document.createElement('div');
                errorMessage.className = 'message assistant-message error-message';

                // Create assistant avatar
                const assistantAvatar = window.YTEnhancer.Doubt.createAssistantAvatar();

                // Create error content
                const errorContent = document.createElement('div');
                errorContent.className = 'message-content';
                errorContent.innerHTML = `
                    <p>Sorry, I couldn't generate an answer. Please try asking again or rephrase your question.</p>
                `;

                // Add avatar first, then content
                errorMessage.appendChild(assistantAvatar);
                errorMessage.appendChild(errorContent);
                chatMessages.appendChild(errorMessage);

                // Scroll to bottom
                window.YTEnhancer.Doubt.scrollToBottom();

                window.YTEnhancer.Utils.showToast('Failed to answer your question. Please try again.');
            }
        } catch (error) {
            console.error('Error processing question:', error);
            window.YTEnhancer.Utils.showToast('An error occurred. Please try again.');

            // Remove typing indicator
            window.YTEnhancer.Doubt.removeTypingIndicator();
        } finally {
            // Always re-enable the submit button
            submitButton.disabled = false;
            submitButton.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
            `;
        }
    });
};

// Format answer text with markdown-like syntax
window.YTEnhancer.Doubt.formatAnswerText = function (text) {
    if (!text) return '';

    return text
        // Line breaks to paragraphs
        .replace(/\n\s*\n/g, '</p><p>')
        // Single line breaks to <br>
        .replace(/\n(?!\n)/g, '<br>')
        // Bold
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        // Italic
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        // Code blocks
        .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
        // Inline code
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        // Unordered lists
        .replace(/^\s*-\s+(.*)/gm, '<li>$1</li>')
        // Ordered lists
        .replace(/^\s*(\d+)\.\s+(.*)/gm, '<li>$2</li>')
        // Wrap with paragraph tags if not already done
        .replace(/^(?!<)(.+)$/gm, '<p>$1</p>')
        // Links
        .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank">$1</a>');
};

// Display chat messages
window.YTEnhancer.Doubt.displayChatMessages = function (questions, preserveScroll = false) {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) {
        console.error('Chat messages container not found');
        return;
    }

    // Save the welcome elements
    const welcomeTitle = chatMessages.querySelector('.doubt-welcome-title');
    const welcomeText = chatMessages.querySelector('.doubt-welcome-text');
    const doubtTags = chatMessages.querySelector('.doubt-tags');

    // Clear existing messages
    chatMessages.innerHTML = '';

    // Re-add the welcome elements
    if (welcomeTitle && welcomeText && doubtTags) {
        chatMessages.appendChild(welcomeTitle);
        chatMessages.appendChild(welcomeText);
        chatMessages.appendChild(doubtTags);

        // Re-attach click handlers to tags
        const newDoubtTags = chatMessages.querySelectorAll('.doubt-tag');
        const doubtInput = document.getElementById('doubt-input');
        if (doubtInput) {
            newDoubtTags.forEach(tag => {
                tag.addEventListener('click', () => {
                    const fullPrompt = tag.getAttribute('data-prompt');
                    if (fullPrompt) {
                        // Store the full prompt as a data attribute on the input
                        doubtInput.setAttribute('data-full-prompt', fullPrompt);

                        // Store the tag name as another data attribute
                        const tagText = tag.textContent.trim();
                        doubtInput.setAttribute('data-selected-tag', tagText);

                        // Add a visual indicator that the tag is selected
                        doubtTags.forEach(t => t.classList.remove('selected'));
                        tag.classList.add('selected');

                        // Focus the input but don't add any text
                        doubtInput.focus();
                    }
                });
            });
        }
    }

    if (!questions || questions.length === 0) {
        // No messages to display
        return;
    }

    console.log(`Displaying ${questions.length} chat messages`);

    // Display each question-answer pair as a chat message
    questions.forEach((item, index) => {
        if (!item.question) return; // Skip invalid entries

        // User message
        const userMessage = document.createElement('div');
        userMessage.className = 'message user-message';
        userMessage.dataset.index = index;

        // Create message content (without avatar)
        const userMessageContent = document.createElement('div');
        userMessageContent.className = 'message-content';
        userMessageContent.innerText = item.question;

        // Add timestamp badge if available
        if (item.timestamp && item.timestamp !== 'No timestamp') {
            const timestampBadge = document.createElement('div');
            timestampBadge.className = 'timestamp-badge';
            timestampBadge.innerText = item.timestamp;
            timestampBadge.onclick = (e) => {
                e.stopPropagation();
                window.YTEnhancer.Doubt.jumpToVideoTimestamp(item.timestamp);
            };
            userMessageContent.appendChild(timestampBadge);
        }

        userMessage.appendChild(userMessageContent);
        chatMessages.appendChild(userMessage);

        // Only add assistant message if there's an answer
        if (item.answer) {
            // Assistant message
            const assistantMessage = document.createElement('div');
            assistantMessage.className = 'message assistant-message';

            // Create assistant avatar
            const assistantAvatar = document.createElement('div');
            assistantAvatar.className = 'assistant-avatar';
            assistantAvatar.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <circle cx="12" cy="10" r="3"></circle>
                    <path d="M7 21v-2a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2"></path>
                    <line x1="8" y1="9" x2="16" y2="9"></line>
                    <line x1="12" y1="5" x2="12" y2="9"></line>
                </svg>
            `;

            // Create message content
            const assistantMessageContent = document.createElement('div');
            assistantMessageContent.className = 'message-content';
            assistantMessageContent.innerHTML = window.YTEnhancer.Doubt.formatAnswerText(item.answer);

            // Add avatar first, then content
            assistantMessage.appendChild(assistantAvatar);
            assistantMessage.appendChild(assistantMessageContent);
            chatMessages.appendChild(assistantMessage);
        }
    });

    // Only scroll to the latest message if we're not preserving scroll position
    if (!preserveScroll) {
        window.YTEnhancer.Doubt.scrollToBottom();
    }
};

// Auto-grow textarea
window.YTEnhancer.Doubt.setupAutoGrowTextarea = function () {
    const textarea = document.getElementById('doubt-input');
    if (!textarea) return;

    const adjustHeight = () => {
        // Reset height to auto first to get the correct scrollHeight
        textarea.style.height = '38px';

        // Calculate new height (capped at max-height which is handled by CSS)
        const newHeight = Math.min(120, Math.max(38, textarea.scrollHeight));
        textarea.style.height = `${newHeight}px`;
    };

    // Call on input events
    textarea.addEventListener('input', adjustHeight);

    // Also adjust on focus and keyup to handle all cases
    textarea.addEventListener('focus', adjustHeight);
    textarea.addEventListener('keyup', adjustHeight);

    // Initial adjustment
    setTimeout(adjustHeight, 100);
};

// Jump to timestamp in the video
window.YTEnhancer.Doubt.jumpToVideoTimestamp = function (timestamp) {
    if (!timestamp) return;

    const video = document.querySelector('video');
    if (!video) return;

    const seconds = window.YTEnhancer.Doubt.parseTimestamp(timestamp);
    video.currentTime = seconds;

    // Play the video if it's paused
    if (video.paused) {
        video.play().catch(() => console.error('Failed to play video'));
    }
};

// Remove typing indicator
window.YTEnhancer.Doubt.removeTypingIndicator = function () {
    const typingIndicator = document.getElementById('typing-indicator');
    if (typingIndicator) {
        typingIndicator.remove();
    }
};

// Smooth scroll to the bottom of the chat
window.YTEnhancer.Doubt.scrollToBottom = function () {
    const chatMessages = document.getElementById('chat-messages');
    if (chatMessages) {
        // Use smooth scrolling behavior
        const scrollOptions = {
            top: chatMessages.scrollHeight,
            behavior: 'smooth'
        };

        try {
            chatMessages.scrollTo(scrollOptions);
        } catch (e) {
            // Fallback for browsers that don't support smooth scrolling
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }
};

// Show typing indicator while waiting for a response
window.YTEnhancer.Doubt.showTypingIndicator = function () {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;

    // Remove any existing typing indicator
    const existingIndicator = document.getElementById('typing-indicator');
    if (existingIndicator) {
        existingIndicator.remove();
    }

    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'message assistant-message typing-message';
    typingIndicator.id = 'typing-indicator';

    // Create AI avatar using the helper function
    const assistantAvatar = window.YTEnhancer.Doubt.createAssistantAvatar();

    const typingContent = document.createElement('div');
    typingContent.className = 'message-content typing-indicator';
    typingContent.innerHTML = `
        <div class="typing-dots-container">
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        </div>
    `;

    typingIndicator.appendChild(assistantAvatar);
    typingIndicator.appendChild(typingContent);

    // Add the typing indicator to the chat messages
    chatMessages.appendChild(typingIndicator);

    window.YTEnhancer.Doubt.scrollToBottom();
};

// Reset the doubt view
window.YTEnhancer.Doubt.resetDoubtView = function () {
    console.log('Resetting doubt view');

    // Reset error state - remove any error styling from previous sessions
    const typingIndicator = document.getElementById('typing-indicator');
    if (typingIndicator) {
        typingIndicator.remove();
    }

    // Reset any error toast that might be showing
    const toast = document.getElementById('yt-enhancer-toast');
    if (toast) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(100%)';
    }

    // Clear all messages but keep welcome section
    const chatMessages = document.getElementById('chat-messages');
    if (chatMessages) {
        // Save the welcome elements
        const welcomeTitle = chatMessages.querySelector('.doubt-welcome-title');
        const welcomeText = chatMessages.querySelector('.doubt-welcome-text');
        const doubtTags = chatMessages.querySelector('.doubt-tags');

        // Clear all messages
        chatMessages.innerHTML = '';

        // Re-add the welcome elements
        if (welcomeTitle && welcomeText && doubtTags) {
            chatMessages.appendChild(welcomeTitle);
            chatMessages.appendChild(welcomeText);
            chatMessages.appendChild(doubtTags);

            // Re-attach click handlers to tags
            const newDoubtTags = chatMessages.querySelectorAll('.doubt-tag');
            const doubtInput = document.getElementById('doubt-input');
            if (doubtInput) {
                newDoubtTags.forEach(tag => {
                    tag.addEventListener('click', () => {
                        const fullPrompt = tag.getAttribute('data-prompt');
                        if (fullPrompt) {
                            // Store the full prompt as a data attribute on the input
                            doubtInput.setAttribute('data-full-prompt', fullPrompt);

                            // Store the tag name as another data attribute
                            const tagText = tag.textContent.trim();
                            doubtInput.setAttribute('data-selected-tag', tagText);

                            // Add a visual indicator that the tag is selected
                            doubtTags.forEach(t => t.classList.remove('selected'));
                            tag.classList.add('selected');

                            // Focus the input but don't add any text
                            doubtInput.focus();
                        }
                    });
                });
            }
        }

        // Reset scroll position to top
        chatMessages.scrollTop = 0;
    }

    // Clear input
    const doubtInput = document.getElementById('doubt-input');
    if (doubtInput) {
        doubtInput.value = '';
        doubtInput.removeAttribute('data-full-prompt');
        doubtInput.removeAttribute('data-selected-tag');
        doubtInput.style.height = '38px';
    }

    // Remove selection from all tags
    const allTags = chatMessages.querySelectorAll('.doubt-tag');
    allTags.forEach(tag => tag.classList.remove('selected'));

    // Reset submit button
    const submitButton = document.getElementById('submit-doubt');
    if (submitButton) {
        submitButton.disabled = false;
        submitButton.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
        `;
    }
}

// Load stored questions from chrome storage
window.YTEnhancer.Doubt.loadStoredQuestions = async function (preserveScroll = true) {
    try {
        console.log('Loading stored questions');
        // Retrieve questions for current video
        const questions = await window.YTEnhancer.Doubt.retrieveQuestions();

        console.log(`Retrieved ${questions.length} questions for this video`);

        // Update the chat interface - pass the preserveScroll parameter
        window.YTEnhancer.Doubt.displayChatMessages(questions, preserveScroll);

        // Update the traditional UI if it exists (for backwards compatibility)
        if (document.getElementById('doubt-history')) {
            window.YTEnhancer.Doubt.displayQuestions(questions);
        }

        return questions;
    } catch (error) {
        console.error('Error loading stored questions:', error);
        return [];
    }
};

// Create assistant avatar element
window.YTEnhancer.Doubt.createAssistantAvatar = function () {
    const assistantAvatar = document.createElement('div');
    assistantAvatar.className = 'assistant-avatar';
    assistantAvatar.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <circle cx="12" cy="10" r="3"></circle>
            <path d="M7 21v-2a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2"></path>
            <line x1="8" y1="9" x2="16" y2="9"></line>
            <line x1="12" y1="5" x2="12" y2="9"></line>
        </svg>
    `;
    return assistantAvatar;
};

// Smooth scroll to the top of the chat
window.YTEnhancer.Doubt.scrollToTop = function () {
    const chatMessages = document.getElementById('chat-messages');
    if (chatMessages) {
        // Use smooth scrolling behavior
        const scrollOptions = {
            top: 0,
            behavior: 'smooth'
        };

        try {
            chatMessages.scrollTo(scrollOptions);
        } catch (e) {
            // Fallback for browsers that don't support smooth scrolling
            chatMessages.scrollTop = 0;
        }
    }
};
