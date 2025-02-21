function markUnwantedVideos() {
    const blockedKeywords = ["anime", "clash of clans", "coc", "genshin impact", "one piece", "naruto", "dragon ball", "attack on titan"];

    document.querySelectorAll("ytd-rich-item-renderer").forEach((video) => {
        const titleElement = video.querySelector("#video-title");
        if (!titleElement) return;

        const title = titleElement.innerText.toLowerCase();
        if (blockedKeywords.some(keyword => title.includes(keyword))) {
            const menuButton = video.querySelector("#button[aria-label='Action menu']");
            if (menuButton) {
                menuButton.click();
                setTimeout(() => {
                    const notInterestedButton = document.querySelector("yt-formatted-string[aria-label='Not interested']");
                    if (notInterestedButton) notInterestedButton.click().then(() => console.log(title, "Marked video as not interested"));


                    // **Also block the whole channel**
                    setTimeout(() => {
                        const blockChannelButton = document.querySelector("yt-formatted-string[aria-label^='Don’t recommend channel']");
                        if (blockChannelButton) blockChannelButton.click();
                    }, 1000);
                }, 1000);
            }
        }
    });
}

// Run every 15 seconds
setInterval(markUnwantedVideos, 15000);
