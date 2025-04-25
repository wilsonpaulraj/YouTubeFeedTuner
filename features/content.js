// Import notes functions
const {
    setupNotesFeature,
    loadStoredNotes,
    resetNotesView
} = window.YTEnhancer.Notes;

// Import chapters functions
const {
    setupChaptersFeature,
    generateChapters,
    resetChaptersView,
    displayChapters,
    storeChapters,
    retrieveChapters,
    loadStoredChapters,
} = window.YTEnhancer.Chapters;

// Import sponsors functions
const {
    detectSponsors,
    displaySponsors,
    storeSponsors,
    retrieveSponsors,
    setupAutoSkipSponsors,
} = window.YTEnhancer.Sponsors;

// Import summary functions
const {
    parseMarkdown,
    getSummary,
    storeSummary,
    retrieveSummary,
    clearSummary,
    calculateReadingTime,
    updateTags,
    getLoadingState,
    setupGenerateSummaryButton,
    setupCopySummaryButton,
    resetSummaryView,
    fetchAndDisplaySummary,
} = window.YTEnhancer.Summary;

// Import doubt functions
const {
    setupDoubtFeature,
    resetDoubtView,
    loadStoredQuestions
} = window.YTEnhancer.Doubt;

// Import utils functions
const {
    getCurrentVideoId,
    isWatchingVideo,
    showTranscriptError,
    showToast,
    formatTime,
} = window.YTEnhancer.Utils;

// Import transcript functions
const {
    getTranscript,
    storeTranscript,
    retrieveTranscript,
    fetchTranscript,
    getVideoTranscript,
    loadTranscript,
    clearCache
} = window.YTEnhancer.Transcript;

// Import LLM function
const { getLLMResponse } = window.YTEnhancer.LLM;

(function () {
    if (window.sidebarScriptInjected) {
        console.warn("Sidebar script already injected. Skipping.");
        return;
    }
    window.sidebarScriptInjected = true;

    function addSidebarToggleButtonToNavbar() {
        const buttonsContainer = document.querySelector('#buttons.style-scope.ytd-masthead');
        const existingButton = document.getElementById('sidebar-toggle-icon');

        if (!buttonsContainer || existingButton) {
            return;
        }

        const sidebarToggleButton = document.createElement('div');
        sidebarToggleButton.id = 'sidebar-toggle-icon';

        // Creating SVG manually (CSP-safe)
        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("width", "24");
        svg.setAttribute("height", "24");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("fill", "none");

        const path1 = document.createElementNS(svgNS, "path");
        path1.setAttribute("d", "M4 5h16M4 12h10M4 19h7");
        path1.setAttribute("stroke", "currentColor");
        path1.setAttribute("stroke-width", "2");
        path1.setAttribute("stroke-linecap", "round");

        const path2 = document.createElementNS(svgNS, "path");
        path2.setAttribute("d", "M19 15l-4 4l-2-2");
        path2.setAttribute("stroke", "currentColor");
        path2.setAttribute("stroke-width", "2");
        path2.setAttribute("stroke-linecap", "round");
        path2.setAttribute("stroke-linejoin", "round");

        svg.appendChild(path1);
        svg.appendChild(path2);
        sidebarToggleButton.appendChild(svg);

        Object.assign(sidebarToggleButton.style, {
            width: "24px",
            height: "24px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#FF0000",
            transition: "filter 0.3s ease",
            filter: "drop-shadow(0 0 5px #FF0000) drop-shadow(0 0 10px #FF0000)"
        });

        sidebarToggleButton.addEventListener('mouseenter', () => {
            sidebarToggleButton.style.filter = 'drop-shadow(0 0 8px #FF4500) drop-shadow(0 0 15px #FF4500)';
            sidebarToggleButton.style.color = '#FF4500';
        });

        sidebarToggleButton.addEventListener('mouseleave', () => {
            sidebarToggleButton.style.filter = 'drop-shadow(0 0 5px #FF0000) drop-shadow(0 0 10px #FF0000)';
            sidebarToggleButton.style.color = '#FF0000';
        });

        sidebarToggleButton.addEventListener('click', () => {
            if (typeof fetchAndInjectSidebar === 'function') {
                fetchAndInjectSidebar();
            } else {
                console.warn("⚠️ fetchAndInjectSidebar function not found!");
            }

            if (typeof adjustSidebarWidth === 'function') {
                adjustSidebarWidth();
            } else {
                console.warn("⚠️ adjustSidebarWidth function not found!");
            }
        });

        buttonsContainer.appendChild(sidebarToggleButton);
        console.log('✅ Sidebar button added');
    }

    function debounce(func, delay) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), delay);
        };
    }

    function observeDOMChanges() {
        if (window.observerInitialized) return;

        const observer = new MutationObserver(debounce(() => {
            if (!document.getElementById('sidebar-toggle-icon')) {
                addSidebarToggleButtonToNavbar();
            }
        }, 300));

        const targetNode = document.querySelector('ytd-app') || document.body;
        if (targetNode) {
            observer.observe(targetNode, { childList: true, subtree: true });
            window.observerInitialized = true;
            console.log('✅ Observer initialized');
        }
    }

    function initSidebarButton() {
        setTimeout(() => {
            addSidebarToggleButtonToNavbar();
            observeDOMChanges();
        }, 1000);
    }

    document.addEventListener('yt-navigate-finish', debounce(() => {
        console.log('🔄 Page navigation detected');
        addSidebarToggleButtonToNavbar();
    }, 300));

    initSidebarButton();
})();

function setupVideoNavigationWatcher() {
    let currentVideoId = getCurrentVideoId();
    let watcherInterval;

    const checkVideoChange = async () => {
        try {
            const newVideoId = getCurrentVideoId();

            if (newVideoId !== currentVideoId) {
                currentVideoId = newVideoId;
                const sidebar = document.getElementById('sidebar-container');

                if (sidebar) {
                    try {
                        // Reset all views
                        resetSummaryView();
                        resetNotesView();
                        resetChaptersView();
                        resetSponsorsView();
                        resetDoubtView();

                        // If we navigated to a valid video, load stored data
                        if (newVideoId) {
                            await Promise.all([
                                loadStoredSummary(),
                                loadStoredNotes(),
                                loadStoredChapters(),
                                loadStoredSponsors(),
                                loadStoredQuestions()
                            ]);
                        }
                    } catch (error) {
                        showToast('Failed to update sidebar content. Please refresh the page.');
                    }
                }
            }
        } catch (error) {
            showToast('Error checking video changes. Please refresh the page.');
        }
    };

    // Check on YouTube navigation events
    document.addEventListener('yt-navigate-finish', () => {
        setTimeout(checkVideoChange, 500);
    });

    // Set up polling with error handling
    watcherInterval = setInterval(checkVideoChange, 2000);

    // Clean up interval when the page is unloaded
    window.addEventListener('unload', () => {
        if (watcherInterval) {
            clearInterval(watcherInterval);
        }
    });
}

// Helper function to load stored summary
async function loadStoredSummary() {
    try {
        const videoId = getCurrentVideoId();
        if (!videoId) {
            return;
        }

        const existingSummary = await retrieveSummary();
        if (existingSummary) {
            const summaryElement = document.getElementById('summary');
            if (summaryElement) {
                summaryElement.innerHTML = parseMarkdown(existingSummary.text);
                updateTags(existingSummary.readingTime);
                setupCopySummaryButton();
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
                setupGenerateSummaryButton();
            }
        }
    } catch (error) {
        showToast('Failed to load saved summary.');
    }
}

// Helper function to load stored sponsors
async function loadStoredSponsors() {
    try {
        const sponsors = await retrieveSponsors();
        if (sponsors) {
            displaySponsors(sponsors);
            setupAutoSkipSponsors(sponsors);
        }
    } catch (error) {
        showToast('Failed to load saved sponsor segments.');
    }
}

// Handle refresh button click
function handleRefreshButtonClick() {
    const refreshButton = document.getElementById('refresh-button');
    if (!refreshButton) return;

    // Add rotating class to trigger animation
    refreshButton.classList.add('rotating');

    // Remove the class after animation completes
    setTimeout(() => {
        refreshButton.classList.remove('rotating');
    }, 500); // Match this with the animation duration in CSS

    // Reset all views
    resetSummaryView();
    resetNotesView();
    resetChaptersView();
    resetSponsorsView();
    resetDoubtView();
    clearSummary();
}

// Fetch and inject sidebar with animation
async function fetchAndInjectSidebarWithAnimation() {
    try {
        // Check if sidebar already exists
        let sidebar = document.getElementById('sidebar-container');
        if (sidebar) {
            return;
        }

        // Ensure the extension context is still valid
        if (!chrome.runtime?.getURL) {
            throw new Error('Extension context invalidated. Please reload the extension.');
        }

        // Fetch sidebar HTML with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

        const response = await fetch(chrome.runtime.getURL('ui/sidebar.html'), {
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Failed to fetch sidebar.html: ${response.status}`);
        }
        const sidebarHTML = await response.text();

        // Inject new sidebar
        sidebar = document.createElement('div');
        sidebar.id = 'sidebar-container';
        sidebar.innerHTML = sidebarHTML;
        document.body.appendChild(sidebar);
        adjustSidebarWidth();

        // Add sidebar stylesheet with error handling
        try {
            if (!document.getElementById('sidebar-styles')) {
                const link = document.createElement('link');
                link.id = 'sidebar-styles';
                link.rel = 'stylesheet';
                link.href = chrome.runtime.getURL('ui/sidebar.css');
                document.head.appendChild(link);
            }
        } catch (error) {
            showToast('Failed to load sidebar styles. Some features may not work correctly.');
        }

        // Event listeners with error handling
        try {
            const closeButton = document.getElementById('close-sidebar');
            if (closeButton) {
                closeButton.addEventListener('click', () => {
                    closeSidebarWithAnimation();
                });
            }

            const refreshButton = document.getElementById('refresh-button');
            if (refreshButton) {
                refreshButton.addEventListener('click', handleRefreshButtonClick);
            }

            // Set up all feature buttons
            setupNotesFeature();
            setupChaptersFeature();
            setupSponsorsFeature();
            setupDoubtFeature();
            setupTabNavigation();
        } catch (error) {
            showToast('Failed to set up sidebar controls. Please reload the page.');
        }

        // Initialize views with error handling
        try {
            // Only reset views if we're not watching a video
            if (!isWatchingVideo()) {
                resetSummaryView();
                resetNotesView();
                resetChaptersView();
                resetSponsorsView();
                resetDoubtView();
            } else {
                // If we are watching a video, load the stored state
                await Promise.all([
                    loadStoredSummary(),
                    loadStoredNotes(),
                    loadStoredChapters(),
                    loadStoredSponsors(),
                    loadStoredQuestions()
                ]);
            }
            setupVideoNavigationWatcher();
        } catch (error) {
            showToast('Failed to initialize sidebar features. Please reload the page.');
        }

    } catch (error) {
        if (error.name === 'AbortError') {
            showToast('Loading sidebar timed out. Please try again.');
        } else if (error.message.includes('Extension context invalidated')) {
            showToast('Extension needs to be reloaded. Please refresh the page.');
        } else {
            showToast('Failed to load sidebar. Please try again.');
        }
    }
}

// Function to close sidebar with animation
function closeSidebarWithAnimation() {
    const sidebar = document.getElementById('sidebar-container');
    if (!sidebar) return;

    // Store the current active tab before closing
    const activeButton = document.querySelector('.tab-button.active');
    if (activeButton) {
        const activeTab = activeButton.dataset.tab;
        chrome.storage.local.set({ activeTab: activeTab });
    }

    // Add the closing class to trigger the animation
    sidebar.classList.add('closing');

    // Wait for the animation to complete before removing the element
    sidebar.addEventListener('animationend', () => {
        sidebar.remove();
    }, { once: true }); // Ensures the event listener is removed after firing once
}

// Adjust sidebar width
function adjustSidebarWidth() {
    const sidebarContainer = document.getElementById('sidebar-container');
    if (!sidebarContainer) return;

    // Early return with default values if not watching video
    if (!isWatchingVideo()) {
        requestAnimationFrame(() => {
            sidebarContainer.style.width = '450px'; // Default width
            sidebarContainer.style.right = '0';
        });
        return;
    }

    // Batch all DOM reads
    const secondary = document.querySelector('#secondary.style-scope.ytd-watch-flexy');
    if (!secondary) {
        requestAnimationFrame(() => {
            sidebarContainer.style.width = '450px'; // Default width
            sidebarContainer.style.right = '0';
        });
        return;
    }

    const secondaryRect = secondary.getBoundingClientRect();
    const sidebarStart = secondaryRect.left;
    const viewportWidth = window.innerWidth;

    // Then schedule all DOM writes in a single frame
    requestAnimationFrame(() => {
        if (sidebarStart <= 0) {
            sidebarContainer.style.width = '450px'; // Default width
            sidebarContainer.style.right = '0';
        } else {
            // Calculate the width from the secondary container to the right edge of the viewport
            const sidebarWidth = viewportWidth - sidebarStart;

            // Set sidebar position and width
            sidebarContainer.style.top = '0';
            sidebarContainer.style.left = `${sidebarStart}px`;
            sidebarContainer.style.width = `${sidebarWidth}px`;
        }
    });
}

// Adjust sidebar width initially and on window resize
window.addEventListener('resize', adjustSidebarWidth, { passive: true });
window.addEventListener('load', adjustSidebarWidth, { passive: true });

// Update existing function to use the new animation version
function fetchAndInjectSidebar() {
    fetchAndInjectSidebarWithAnimation();
    adjustSidebarWidth();
}

// Handle escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeSidebarWithAnimation();
    }
}, { passive: true });

// Setup tab navigation
function setupTabNavigation() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    const tabNavigation = document.querySelector('.tab-navigation');

    // Restore active tab from sessionStorage
    const savedTab = sessionStorage.getItem('activeTab');
    if (savedTab) {
        const activeButton = document.querySelector(`.tab-button[data-tab="${savedTab}"]`);
        const activeContent = document.getElementById(`${savedTab}-tab`);
        if (activeButton && activeContent) {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            activeButton.classList.add('active');
            activeContent.classList.add('active');
            tabNavigation.setAttribute('data-active', savedTab);
        }
    }

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.dataset.tab;

            // Collect all refs first
            const activeContent = document.getElementById(`${tabId}-tab`);
            if (!activeContent) return;

            // Use requestAnimationFrame to batch all DOM updates
            requestAnimationFrame(() => {
                // Remove active class from all buttons and contents
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabContents.forEach(content => content.classList.remove('active'));

                // Add active class to clicked button and corresponding content
                button.classList.add('active');
                activeContent.classList.add('active');

                // Update the underline position
                tabNavigation.setAttribute('data-active', tabId);

                // Store the active tab in sessionStorage
                sessionStorage.setItem('activeTab', tabId);
            });
        });
    });
}

// Setup sponsors feature
function setupSponsorsFeature() {
    const sponsorsList = document.getElementById('sponsors-list');
    if (!sponsorsList) {
        return;
    }

    // Check for existing sponsors in storage
    retrieveSponsors().then(async sponsors => {
        if (sponsors) {
            displaySponsors(sponsors);
            setupAutoSkipSponsors(sponsors);
        } else {
            // Show loading state
            sponsorsList.innerHTML = `
                <div class="loading-state">
                    <div class="spinner"></div>
                    <p>Detecting sponsor segments...</p>
                </div>
            `;

            try {
                const videoId = getCurrentVideoId();
                if (!videoId) {
                    throw new Error('No video ID available');
                }

                // Use transcript manager to get transcript
                const transcript = await getTranscript(videoId);
                if (!transcript || transcript === "Transcript not available" || transcript === "Transcript not loaded") {
                    showTranscriptError('sponsors');
                    return;
                }

                const sponsors = await detectSponsors(transcript);
                handleSponsorsResult(sponsors);
            } catch (error) {
                showTranscriptError('sponsors');
            }
        }
    }).catch(error => {
        if (!sponsorsList) return;
        sponsorsList.innerHTML = '<p class="info-text">No sponsor segments detected in this video.</p>';
    });

    // Set up auto-skip toggle
    const sponsorBlockerToggle = document.getElementById('sponsor-blocker-toggle');
    if (sponsorBlockerToggle) {
        chrome.storage.local.get('autoSkipSponsors', (data) => {
            sponsorBlockerToggle.checked = data.autoSkipSponsors || false;
        });

        sponsorBlockerToggle.addEventListener('change', () => {
            chrome.storage.local.set({ autoSkipSponsors: sponsorBlockerToggle.checked });
        });
    }
}

// Reset sponsors view
function resetSponsorsView() {
    const sponsorsList = document.getElementById('sponsors-list');
    const sponsorsContainer = document.getElementById('sponsors-tab');
    if (!sponsorsList || !sponsorsContainer) return;

    if (!isWatchingVideo()) {
        sponsorsContainer.innerHTML = `
            <div class="sponsors-container">
                <div class="sponsors-header">
                    <h3>Sponsor Segments</h3>
                    <div class="sponsor-toggle">
                        <label class="switch">
                            <input type="checkbox" id="sponsor-blocker-toggle" disabled>
                            <span class="slider round"></span>
                        </label>
                        <span>Auto-Skip Sponsors</span>
                    </div>
                </div>
                <div id="sponsors-list" class="sponsors-list">
                    <p class="info-text">You have to open a video to detect sponsor segments</p>
                </div>
            </div>
        `;
    } else {
        sponsorsContainer.innerHTML = `
            <div class="sponsors-container">
                <div class="sponsors-header">
                    <h3>Sponsor Segments</h3>
                    <div class="sponsor-toggle">
                        <label class="switch">
                            <input type="checkbox" id="sponsor-blocker-toggle">
                            <span class="slider round"></span>
                        </label>
                        <span>Auto-Skip Sponsors</span>
                    </div>
                </div>
                <div id="sponsors-list" class="sponsors-list">
                    <div class="loading-state">
                        <div class="spinner"></div>
                        <p>Detecting sponsor segments...</p>
                    </div>
                </div>
            </div>
        `;

        const sponsorBlockerToggle = document.getElementById('sponsor-blocker-toggle');
        if (sponsorBlockerToggle) {
            chrome.storage.local.get('autoSkipSponsors', (data) => {
                sponsorBlockerToggle.checked = data.autoSkipSponsors || false;
            });

            sponsorBlockerToggle.addEventListener('change', () => {
                chrome.storage.local.set({ autoSkipSponsors: sponsorBlockerToggle.checked });
            });
        }

        // First check if we have the transcript in storage
        retrieveTranscript().then(async storedTranscript => {
            if (storedTranscript) {
                // Use stored transcript
                const sponsors = await detectSponsors(storedTranscript);
                handleSponsorsResult(sponsors);
            } else {
                // Fetch new transcript
                const transcript = await getTranscript(false);
                if (transcript && transcript !== "Transcript not available" && transcript !== "Transcript not loaded") {
                    const sponsors = await detectSponsors(transcript);
                    handleSponsorsResult(sponsors);
                } else {
                    showTranscriptError('sponsors');
                }
            }
        });
    }
}

// Add helper function to handle sponsor results
function handleSponsorsResult(sponsors) {
    const sponsorsList = document.getElementById('sponsors-list');
    if (!sponsorsList) return;

    if (sponsors === null) {
        showTranscriptError('sponsors');
        return;
    }

    if (sponsors && sponsors.length > 0) {
        storeSponsors(sponsors);
        displaySponsors(sponsors);
        setupAutoSkipSponsors(sponsors);
    } else {
        sponsorsList.innerHTML = '<p class="info-text">No sponsor segments detected in this video.</p>';
    }
}
