// Import notes functions
const {
    setupNotesFeature,
    loadStoredNotes,
    resetNotesView
} = window.YTEnhancer.Notes;

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
    fetchAndDisplaySummary
} = window.YTEnhancer.Summary;

// Import doubt functions
const {
    setupDoubtFeature,
    resetDoubtView,
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
                        resetDoubtView();

                        // If we navigated to a valid video, load stored data
                        if (newVideoId) {
                            await Promise.all([
                                loadStoredSummary(),
                                loadStoredNotes(),
                                window.YTEnhancer.Doubt.loadStoredQuestions()
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
    // Call the Summary module's function instead
    return window.YTEnhancer.Summary.loadStoredSummary();
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
            setupDoubtFeature();
            setupTabNavigation();

            // Set initial tab underline position if it wasn't set by the setupTabNavigation function
            const tabNavigation = document.querySelector('.tab-navigation');
            const activeTab = document.querySelector('.tab-button.active');
            if (tabNavigation && activeTab && !tabNavigation.hasAttribute('data-active')) {
                tabNavigation.setAttribute('data-active', activeTab.dataset.tab);
            }
        } catch (error) {
            showToast('Failed to set up sidebar controls. Please reload the page.');
        }

        // Initialize views with error handling
        try {
            // Only reset views if we're not watching a video
            if (!isWatchingVideo()) {
                resetSummaryView();
                resetNotesView();
                resetDoubtView();
            } else {
                // If we are watching a video, load the stored state
                await Promise.all([
                    loadStoredSummary(),
                    loadStoredNotes(),
                    window.YTEnhancer.Doubt.loadStoredQuestions()
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

// Set up tab navigation
function setupTabNavigation() {
    try {
        // Use the improved sidebar events setup function
        window.YTEnhancer.setupSidebarEvents();

        // Restore active tab from storage if available
        chrome.storage.local.get('activeTab', data => {
            if (data.activeTab) {
                const tabToActivate = document.querySelector(`.tab-button[data-tab="${data.activeTab}"]`);
                if (tabToActivate && !tabToActivate.classList.contains('active')) {
                    tabToActivate.click(); // This will trigger the click event which updates data-active
                } else if (tabToActivate) {
                    // If the tab is already active but the underline might not be set
                    const tabNavigation = document.querySelector('.tab-navigation');
                    if (tabNavigation) {
                        tabNavigation.setAttribute('data-active', data.activeTab);
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error setting up tab navigation:', error);
    }
}

// Function to initialize UI event handlers
window.YTEnhancer.setupSidebarEvents = function () {
    console.log('Setting up sidebar events');

    // Tab navigation
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    const tabNavigation = document.querySelector('.tab-navigation');

    tabButtons.forEach(button => {
        button.addEventListener('click', function () {
            const tab = this.dataset.tab;

            // Update active tab button
            tabButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');

            // Update active tab content
            tabContents.forEach(content => content.classList.remove('active'));
            document.getElementById(`${tab}-tab`).classList.add('active');

            // Update the data-active attribute on the tab navigation for the underline
            if (tabNavigation) {
                tabNavigation.setAttribute('data-active', tab);
            }

            // Load content specific to this tab
            switch (tab) {
                case 'summary':
                    window.YTEnhancer.Summary.loadStoredSummary();
                    break;
                case 'doubt':
                    // Initialize the doubt feature if not already done
                    if (window.YTEnhancer.Doubt) {
                        // First, make sure we have the chat UI setup
                        window.YTEnhancer.Doubt.setupDoubtFeature();
                        // Then explicitly load stored questions to show chat history
                        // Pass false for preserveScroll to maintain the natural scroll position
                        window.YTEnhancer.Doubt.loadStoredQuestions(true);
                    } else {
                        console.error('Doubt feature not available');
                    }
                    break;
                case 'notes':
                    window.YTEnhancer.Notes.loadStoredNotes();
                    break;
                default:
                    break;
            }
        });
    });
}
