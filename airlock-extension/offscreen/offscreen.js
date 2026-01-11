console.log("🎬 Offscreen Document: Initializing.");

// This script is designed to handle one-off connections for a single analysis.

chrome.runtime.onConnect.addListener((port) => {
    console.assert(port.name === "service-worker-offscreen-connect");
    console.log("🎬 Offscreen: Service Worker connected for a single job.");

    const nerWorker = new Worker('../workers/ner-worker.js');

    // 1. Listen for messages from the NER worker
    nerWorker.onmessage = (event) => {
        // Got the result, send it back and close the connection.
        console.log("🎬 Offscreen: NER worker finished. Relaying result and disconnecting.");
        port.postMessage(event.data);
        port.disconnect(); 
    };

    nerWorker.onerror = (error) => {
        console.error("🎬 Offscreen: NER Worker Error!", error);
        // If the worker fails, we should still disconnect to signal failure.
        port.disconnect();
    };

    // 2. Listen for the single message from the service worker
    port.onMessage.addListener((message) => {
        if (message.target === 'offscreen') {
            console.log("🎬 Offscreen: Received text from Service Worker, starting NER worker.");
            nerWorker.postMessage(message.data);
        } else {
             console.warn("🎬 Offscreen: Received unexpected message target:", message.target);
        }
    });

    // 3. Clean up when the connection is closed by either party
    port.onDisconnect.addListener(() => {
        console.log("🎬 Offscreen: Port disconnected. Terminating NER worker.");
        nerWorker.terminate();
        // The service worker will call `closeDocument`, so we don't need to do it here.
    });
});
