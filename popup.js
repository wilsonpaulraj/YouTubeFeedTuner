document.addEventListener("DOMContentLoaded", function () {
    console.log("📂 Popup Loaded. Fetching stored YouTube history...");

    chrome.storage.local.get("youtubeWatchHistory", function (data) {
        if (chrome.runtime.lastError) {
            console.error("❌ Storage Retrieval Error:", chrome.runtime.lastError);
            return;
        }

        let history = data.youtubeWatchHistory || [];

        console.log("📋 Retrieved Data from Storage:", history);
        console.log(`✅ Loaded ${history.length} videos from storage.`);

        if (history.length > 0) {
            let categorizedCount = countCategories(history);
            displayChart(categorizedCount);
            displayHistoryList(history);
        } else {
            document.getElementById("history-list").innerHTML = "<p>No history available.</p>";
        }
    });
});


function countCategories(history) {
    let categoryCounts = { "Education": 0, "Entertainment": 0, "Health & Fitness": 0, "News & Tech": 0, "Sports & Gaming": 0, "Others": 0 };

    history.forEach(video => {
        if (categoryCounts.hasOwnProperty(video.category)) {
            categoryCounts[video.category]++;
        }
    });

    return categoryCounts;
}

function displayHistoryList(history) {
    let list = document.getElementById("history-list");
    list.innerHTML = "";

    history.forEach(video => {
        let li = document.createElement("li");
        li.innerHTML = `<a href="${video.url}" target="_blank">${video.title} - ${video.category}</a>`;
        list.appendChild(li);
    });
}

// Display Chart
function displayChart(categoryCounts) {
    const ctx = document.getElementById("historyChart").getContext("2d");

    new Chart(ctx, {
        type: "pie",
        data: {
            labels: Object.keys(categoryCounts),
            datasets: [{
                data: Object.values(categoryCounts),
                backgroundColor: ["#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0", "#9966FF"]
            }]
        }
    });
}
