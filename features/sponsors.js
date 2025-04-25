// Sponsors Feature Functions
window.YTEnhancer = window.YTEnhancer || {};
window.YTEnhancer.Sponsors = {};

// Sponsor detection and blocking functionality
window.YTEnhancer.Sponsors.detectSponsors = async function (transcript) {
    try {
        if (!transcript || transcript === "Transcript not available" || transcript === "Transcript not loaded" || transcript.trim() === "") {
            return null;
        }

        // Get video duration
        const video = document.querySelector('video');
        if (!video) {
            return null;
        }
        const videoDuration = video.duration;

        const prompt = `
        You are an expert at detecting sponsor segments in YouTube videos. Your task is to identify segments where the creator discusses sponsors, advertisements, or promotional content.

        Look for these specific indicators:
        1. Direct sponsor mentions: "this video is sponsored by", "thanks to our sponsor", "sponsored by"
        2. Product promotions: "check out", "try out", "use code", "discount code"
        3. Service promotions: "sign up for", "get started with", "try for free"
        4. Ad breaks: "before we continue", "let's take a break", "quick break"
        5. Promotional intros: "today's video is brought to you by", "special thanks to"
        6. Brand mentions: "visit [brand]", "go to [brand]", "check out [brand]"

        For each sponsor segment you find, estimate the start and end times. Format your response as a JSON array
        of objects, each with "start" (in seconds), "end" (in seconds), and "category" (e.g., "sponsor", "promo", "intro") properties.
        Example: [{"start": 120, "end": 180, "category": "sponsor"}]

        Important rules:
        1. Start time must be less than end time
        2. End time must not exceed video duration (${videoDuration} seconds)
        3. Start time must be 0 or greater
        4. Each segment should be at least 10 seconds long
        5. Maximum segment length should be 5 minutes
        6. Look for clear sponsor indicators in the text
        7. Don't include regular video content as sponsor segments
        8. Include the entire sponsor segment, from the start of the promotion to when they return to the main content
        9. If there are multiple sponsor mentions close together, combine them into one segment
        10. Be conservative - only mark segments that are clearly promotional

        Common patterns to look for:
        - "Before we continue, let's talk about..."
        - "This video is brought to you by..."
        - "Thanks to our sponsor..."
        - "Check out [product/service]..."
        - "Use code [code] for [discount]..."
        - "Link in description..."
        - "Sign up for [service]..."
        - "Try [product] for free..."

        If you don't find any sponsor segments, return an empty array: []

        Transcript:
        ${transcript}
    `;

        const response = await window.YTEnhancer.LLM.getLLMResponse(prompt);

        // Parse the JSON response
        let sponsors;
        try {
            // Find JSON in the response (in case there's explanatory text)
            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                sponsors = JSON.parse(jsonMatch[0]);
            } else {
                sponsors = JSON.parse(response);
            }
        } catch (parseError) {
            console.error('Error parsing sponsors JSON:', parseError);
            return null;
        }

        // Validate and clean up sponsor segments
        if (Array.isArray(sponsors)) {
            sponsors = sponsors.filter(sponsor => {
                // Basic validation
                if (!sponsor || typeof sponsor !== 'object') return false;
                if (!Number.isFinite(sponsor.start) || !Number.isFinite(sponsor.end)) return false;
                if (typeof sponsor.category !== 'string') return false;

                // Time validation
                const start = Math.max(0, Math.floor(sponsor.start));
                const end = Math.min(videoDuration, Math.floor(sponsor.end));

                // Segment length validation
                if (end - start < 10) return false; // Minimum 10 seconds
                if (end - start > 300) return false; // Maximum 5 minutes

                // Update with validated times
                sponsor.start = start;
                sponsor.end = end;
                return true;
            });

            // Sort segments by start time
            sponsors.sort((a, b) => a.start - b.start);

            // Merge overlapping segments
            const mergedSponsors = [];
            for (let i = 0; i < sponsors.length; i++) {
                if (mergedSponsors.length === 0 || mergedSponsors[mergedSponsors.length - 1].end < sponsors[i].start) {
                    mergedSponsors.push(sponsors[i]);
                } else {
                    // Merge with previous segment
                    const prev = mergedSponsors[mergedSponsors.length - 1];
                    prev.end = Math.max(prev.end, sponsors[i].end);
                    prev.category = `${prev.category}, ${sponsors[i].category}`;
                }
            }

            // Final validation to ensure segments make sense
            return mergedSponsors.filter(sponsor => {
                // Ensure segment doesn't start too early (usually sponsors start after intro)
                if (sponsor.start < 30) return false;

                // Ensure segment doesn't end too close to video end
                if (videoDuration - sponsor.end < 10) return false;

                // Ensure reasonable segment length
                const length = sponsor.end - sponsor.start;
                if (length < 15 || length > 300) return false;

                return true;
            });
        }

        return null;
    } catch (error) {
        return null;
    }
};

window.YTEnhancer.Sponsors.displaySponsors = function (sponsors) {
    const sponsorsList = document.getElementById('sponsors-list');
    if (!sponsors || sponsors.length === 0) {
        sponsorsList.innerHTML = '<p class="info-text">No sponsor segments detected in this video.</p>';
        return;
    }

    let sponsorsHTML = '';
    sponsors.forEach(sponsor => {
        sponsorsHTML += `
            <div class="sponsor-item" data-start="${sponsor.start}" data-end="${sponsor.end}">
                <div class="sponsor-time">
                    <span>${window.YTEnhancer.Utils.formatTime(sponsor.start)}</span>
                    <span>→</span>
                    <span>${window.YTEnhancer.Utils.formatTime(sponsor.end)}</span>
                </div>
                <div class="sponsor-category">${sponsor.category}</div>
                <button class="skip-sponsor-button">Skip</button>
            </div>
        `;
    });

    sponsorsList.innerHTML = sponsorsHTML;

    // Add click event to skip sponsor segments
    const skipButtons = sponsorsList.querySelectorAll('.skip-sponsor-button');
    skipButtons.forEach(button => {
        button.addEventListener('click', () => {
            const sponsorItem = button.closest('.sponsor-item');
            const endTime = parseFloat(sponsorItem.dataset.end);
            const video = document.querySelector('video');
            if (video) {
                video.currentTime = endTime;
                video.play();
            }
        });
    });
};

window.YTEnhancer.Sponsors.storeSponsors = async function (sponsors) {
    const videoId = window.YTEnhancer.Utils.getCurrentVideoId();
    await chrome.storage.local.set({
        [`sponsors_${videoId}`]: sponsors
    });
};

window.YTEnhancer.Sponsors.retrieveSponsors = async function () {
    const videoId = window.YTEnhancer.Utils.getCurrentVideoId();
    const data = await chrome.storage.local.get(`sponsors_${videoId}`);
    return data[`sponsors_${videoId}`] || null;
};

window.YTEnhancer.Sponsors.setupAutoSkipSponsors = function (sponsors) {
    const video = document.querySelector('video');
    if (!video || !sponsors || sponsors.length === 0) return;

    const sponsorBlockerToggle = document.getElementById('sponsor-blocker-toggle');
    let autoSkipEnabled = false;
    let lastSkippedTime = 0;

    chrome.storage.local.get('autoSkipSponsors', (data) => {
        autoSkipEnabled = data.autoSkipSponsors || false;
        if (sponsorBlockerToggle) {
            sponsorBlockerToggle.checked = autoSkipEnabled;
        }
    });

    if (sponsorBlockerToggle) {
        sponsorBlockerToggle.addEventListener('change', () => {
            autoSkipEnabled = sponsorBlockerToggle.checked;
            chrome.storage.local.set({ autoSkipSponsors: autoSkipEnabled });
        });
    }

    video.addEventListener('timeupdate', () => {
        if (!autoSkipEnabled) return;

        const currentTime = video.currentTime;

        if (currentTime - lastSkippedTime < 1) return;

        for (const sponsor of sponsors) {
            if (currentTime >= sponsor.start && currentTime < sponsor.end) {
                video.currentTime = sponsor.end;
                lastSkippedTime = sponsor.end;
                window.YTEnhancer.Utils.showToast(`Skipped ${sponsor.category} segment`);
                break;
            }
        }
    }, { passive: true });
};
