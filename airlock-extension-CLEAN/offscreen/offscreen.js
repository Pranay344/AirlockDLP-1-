// The "Foreman" script for the offscreen document.
console.log("🎬 Offscreen Document: Initialized.");

let nerWorker;

// 1. Create the actual worker
function getNerWorker() {
    if (!nerWorker) {
        console.log("🎬 Offscreen: Hiring a new NER worker (classic mode)...");
        // REVERTED: The worker now uses importScripts, so it's a classic worker, not a module.
        nerWorker = new Worker('../workers/ner-worker.js');

        nerWorker.onmessage = (event) => {
            // Message from the NER worker: Pass it back to the service worker
            console.log("🎬 Offscreen: Received message from NER worker, relaying to Service Worker.");
            chrome.runtime.sendMessage(event.data);
        };

        nerWorker.onerror = (error) => {
            console.error("🎬 Offscreen: NER Worker Error!", error);
            nerWorker = undefined; // Allow recreation
        };
    }
    return nerWorker;
}

// 2. Listen for messages from the Service Worker
chrome.runtime.onMessage.addListener((message) => {
    if (message.target !== 'offscreen') {
        return;
    }
    console.log("🎬 Offscreen: Received text from Service Worker, posting to NER worker.");
    getNerWorker().postMessage(message.data);
});
