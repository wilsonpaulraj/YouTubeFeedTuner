function classifyVideo(title) {
    const categories = {
        "Education": ["tutorial", "lesson", "math", "science", "study", "lecture", "exam", "university", "learning", "programming", "coding", "python", "javascript"],
        "Entertainment": ["movie", "music", "trailer", "funny", "vlog", "reaction", "comedy", "memes", "prank", "dance"],
        "Health & Fitness": ["exercise", "fitness", "diet", "mental health", "yoga", "workout", "meditation", "nutrition"],
        "News & Tech": ["news", "update", "politics", "economy", "finance", "ai", "technology", "gadgets", "robotics"],
        "Sports & Gaming": ["football", "soccer", "basketball", "cricket", "esports", "gameplay", "tournament", "fifa", "nba"]
    };

    title = title.toLowerCase();

    for (let category in categories) {
        if (categories[category].some(keyword => title.includes(keyword))) {
            return category;
        }
    }

    return "Others";
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "storeHistory") {
        console.log("📩 Received history data:", request.videos);

        // Retrieve existing data first
        chrome.storage.local.get("youtubeWatchHistory", (data) => {
            let storedHistory = data.youtubeWatchHistory || [];

            // Merge new videos with existing ones, avoiding duplicates
            let newVideos = request.videos.filter(video =>
                !storedHistory.some(stored => stored.url === video.url)
            );

            let updatedHistory = [...storedHistory, ...newVideos];

            // Classify all videos
            let processedVideos = updatedHistory.map(video => ({
                ...video,
                category: classifyVideo(video.title)
            }));

            console.log(`✅ Updated YouTube history with ${newVideos.length} new videos. Total: ${processedVideos.length}`);

            chrome.storage.local.set({ youtubeWatchHistory: processedVideos }, () => {
                if (chrome.runtime.lastError) {
                    console.error("❌ Storage Error:", chrome.runtime.lastError);
                } else {
                    console.log("✅ Successfully stored videos in local storage.");
                }
            });

            sendResponse({ status: "History stored", newCount: newVideos.length });
        });

        return true; // Keeps the message channel open for async response
    }
});
