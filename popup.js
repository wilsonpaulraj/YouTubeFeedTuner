document.getElementById("startAttack").addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "startAttack" });
});

document.getElementById("stopAttack").addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "stopAttack" });
});
