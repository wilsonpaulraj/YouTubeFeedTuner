async function autoScrollAndScrape() {
    let lastHeight = document.body.scrollHeight;
    let retries = 3;  // Allow extra retries to ensure full history is loaded

    while (retries > 0) {
        window.scrollBy(0, 1000);
        await new Promise(resolve => setTimeout(resolve, 1500));

        let newHeight = document.body.scrollHeight;
        if (newHeight === lastHeight) {
            retries--;  // Decrease retry count if no new content loads
        } else {
            retries = 3;  // Reset retries if content loads
        }
        lastHeight = newHeight;
    }

    console.log("✅ Fully loaded YouTube history page.");

    let videos = [];
    document.querySelectorAll("#contents ytd-video-renderer").forEach(video => {
        let titleElement = video.querySelector("#video-title");
        let urlElement = video.querySelector("#video-title-link");

        if (titleElement && urlElement) {
            videos.push({
                title: titleElement.innerText,
                url: urlElement.href
            });
        }
    });

    console.log(`📜 Scraped ${videos.length} YouTube videos.`);
    chrome.runtime.sendMessage({ action: "storeHistory", videos });
}

// Run script on YouTube history page
autoScrollAndScrape();
