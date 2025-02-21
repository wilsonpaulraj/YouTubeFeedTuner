document.getElementById("startSearch").addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "startSearchAttack" });
});

document.getElementById("stopSearch").addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "stopSearchAttack" });
});

document.getElementById("clearHistory").addEventListener("click", () => {
    chrome.history.deleteAll(() => alert("Cleared YouTube history!"));
});
