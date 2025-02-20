const searchQueries = [
    "best AI projects 2025",
    "machine learning tutorial",
    "deep learning basics",
    "how to learn neural networks",
    "latest AI research papers",
    "AI trends 2025"
];

function performSearch() {
    const query = searchQueries[Math.floor(Math.random() * searchQueries.length)];
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;

    fetch(searchUrl)
        .then(response => response.text())
        .then(html => {
            const videoIds = extractVideoIds(html);
            if (videoIds.length > 0) {
                const randomVideoId = videoIds[Math.floor(Math.random() * videoIds.length)];
                watchVideoInBackground(randomVideoId);
            }
        })
        .catch(error => console.error("Search request failed:", error));
}

function extractVideoIds(html) {
    const videoIdRegex = /\"videoId\":\"([^\"]+)\"/g;
    let videoIds = [];
    let match;

    while ((match = videoIdRegex.exec(html)) !== null) {
        videoIds.push(match[1]);
    }

    return videoIds.slice(0, 5);  // Take top 5 relevant videos
}

function watchVideoInBackground(videoId) {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // Use chrome.cookies API to get cookies
    chrome.cookies.getAll({ domain: "youtube.com" }, (cookies) => {
        const cookieString = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join("; ");

        fetch(watchUrl, {
            method: "GET",
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.104 Safari/537.36",
                "Referer": "https://www.youtube.com/",
                "Cookie": cookieString  // Use cookies retrieved here
            }
        })
            .then(response => response.text())
            .then(html => {
                console.log(`Watching video in background: ${watchUrl}`);

                // Simulate watching time (30-60 sec delay)
                setTimeout(() => {
                    likeVideo(videoId);
                }, 10000); // Like after 10 sec

                setTimeout(() => {
                    console.log(`Finished watching: ${watchUrl}`);
                }, Math.floor(Math.random() * (60000 - 30000) + 30000)); // Watch for 30-60 sec
            })
            .catch(error => console.error("Failed to watch video:", error));
    });
}

function likeVideo(videoId) {
    const likeUrl = `https://www.youtube.com/service_ajax?name=likeEndpoint&video_id=${videoId}`;

    fetch(likeUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-YouTube-Client-Name": "1",
            "X-YouTube-Client-Version": "2.20240101.00.00"
        },
        body: JSON.stringify({ "videoId": videoId })
    })
        .then(() => console.log(`Liked video: ${videoId}`))
        .catch(error => console.error("Failed to like video:", error));
}

// Run search attack every 1 minute
setInterval(performSearch, 60 * 1000);

// Start immediately
performSearch();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "openVideo") {
        chrome.tabs.create({ url: message.url, active: false }, (tab) => {
            setTimeout(() => {
                chrome.tabs.remove(tab.id); // Close the tab after 60-120s
            }, Math.floor(Math.random() * (120 - 60) + 60) * 1000);
        });
    }

    if (message.action === "startAttack") {
        attackInterval = setInterval(performSearch, 10 * 60 * 1000);
        performSearch();
    }

    if (message.action === "stopAttack") {
        clearInterval(attackInterval);
    }
});
