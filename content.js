setTimeout(() => {
    let videoLinks = document.querySelectorAll("a#video-title");

    if (videoLinks.length > 0) {
        let randomVideo = videoLinks[Math.floor(Math.random() * videoLinks.length)];
        let videoUrl = "https://www.youtube.com" + randomVideo.getAttribute("href");

        chrome.runtime.sendMessage({ action: "openVideo", url: videoUrl });
    }
}, 3000);
