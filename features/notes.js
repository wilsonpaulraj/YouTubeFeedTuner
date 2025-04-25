// Notes Feature Functions
window.YTEnhancer = window.YTEnhancer || {};
window.YTEnhancer.Notes = {};



// Save notes to chrome storage
window.YTEnhancer.Notes.saveNotes = async function (notes) {
    const videoId = window.YTEnhancer.Utils.getCurrentVideoId();
    await chrome.storage.local.set({
        [`notes_${videoId}`]: notes
    });
    /* console.log('Saved notes for video:', videoId); */
};

// Retrieve notes from chrome storage
window.YTEnhancer.Notes.retrieveNotes = async function () {
    const videoId = window.YTEnhancer.Utils.getCurrentVideoId();
    const data = await chrome.storage.local.get(`notes_${videoId}`);
    return data[`notes_${videoId}`] || '';
};

// Set up the notes feature
window.YTEnhancer.Notes.setupNotesFeature = function () {
    const notesArea = document.getElementById('notes-area');
    const saveNotesButton = document.getElementById('save-notes-button');
    const addTimestampButton = document.getElementById('add-timestamp-button');
    const exportNotesButton = document.getElementById('export-notes-button');

    if (!notesArea || !saveNotesButton || !addTimestampButton || !exportNotesButton) {
        /* console.error('One or more notes elements not found'); */
        return;
    }

    // Load saved notes
    window.YTEnhancer.Notes.retrieveNotes().then(notes => {
        if (notes) {
            notesArea.value = notes;
        }
    });

    // Auto-save notes when typing stops
    let saveTimeout;
    notesArea.addEventListener('input', () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            window.YTEnhancer.Notes.saveNotes(notesArea.value);
        }, 1000); // Save 1 second after typing stops
    });

    // Save notes button
    saveNotesButton.addEventListener('click', () => {
        window.YTEnhancer.Notes.saveNotes(notesArea.value);
        window.YTEnhancer.Utils.showToast('Notes saved successfully!');
    });

    // Add timestamp button
    addTimestampButton.addEventListener('click', () => {
        const video = document.querySelector('video');
        if (video) {
            const currentTime = video.currentTime;
            const formattedTime = window.YTEnhancer.Utils.formatTime(currentTime);
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
            window.YTEnhancer.Notes.saveNotes(notesArea.value);
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
        window.YTEnhancer.Utils.showToast('Notes exported successfully!');
    });
};

// Export function for loading stored notes
window.YTEnhancer.Notes.loadStoredNotes = async function () {
    try {
        const notes = await window.YTEnhancer.Notes.retrieveNotes();
        if (notes) {
            const notesArea = document.getElementById('notes-area');
            if (notesArea) {
                notesArea.value = notes;
            }
        }
    } catch (error) {
        window.YTEnhancer.Utils.showToast('Failed to load saved notes.');
    }
};

// Export function for resetting notes view
window.YTEnhancer.Notes.resetNotesView = function () {
    const notesArea = document.getElementById('notes-area');
    const notesContainer = document.getElementById('notes-tab');
    if (!notesArea || !notesContainer) return;

    if (!window.YTEnhancer.Utils.isWatchingVideo()) {
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
            window.YTEnhancer.Notes.retrieveNotes().then(notes => {
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
                    window.YTEnhancer.Notes.saveNotes(newNotesArea.value);
                }, 1000); // Save 1 second after typing stops
            });

            // Save notes button
            saveNotesButton.addEventListener('click', () => {
                window.YTEnhancer.Notes.saveNotes(newNotesArea.value);
                window.YTEnhancer.Utils.showToast('Notes saved successfully!');
            });

            // Add timestamp button
            addTimestampButton.addEventListener('click', () => {
                const video = document.querySelector('video');
                if (video) {
                    const currentTime = video.currentTime;
                    const formattedTime = window.YTEnhancer.Utils.formatTime(currentTime);
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
                    window.YTEnhancer.Notes.saveNotes(newNotesArea.value);
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
                window.YTEnhancer.Utils.showToast('Notes exported successfully!');
            });
        }
    }
};
