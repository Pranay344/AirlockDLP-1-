
console.log("Offscreen document created.");

// The NER worker is loaded relative to this offscreen document.
// We specify { type: 'module' } to allow the worker to use import statements.
const nerWorker = new Worker('../workers/ner-worker.js', { type: 'module' });

// --- Message forwarding from Service Worker to NER Worker ---
// This listener handles all messages from the service worker.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Only process messages intended for this offscreen document.
    if (message.target !== 'offscreen-document') {
        // Return false for messages not meant for this listener.
        return false;
    }

    console.log("Offscreen: Received message from SW, forwarding to NER worker:", message.data);

    // This is the core of the fix to prevent race conditions.
    // Create a temporary, one-time listener for the worker's response.
    const oneShotListener = (event) => {
        console.log("Offscreen: Received result from NER worker, sending back to SW:", event.data);
        
        // Fulfill the promise in the service worker that is waiting for this specific result.
        try {
            sendResponse(event.data);
        } catch (error) {
            // This can happen if the original message channel was closed for some reason.
            console.warn("Offscreen: Could not send response. The message channel might be closed.", error);
        }
        
        // IMPORTANT: Clean up the listener to prevent it from being called again for other messages.
        nerWorker.removeEventListener('message', oneShotListener);
    };

    // Add the dedicated listener for the upcoming response from the worker.
    nerWorker.addEventListener('message', oneShotListener);

    // Now, forward the data to the worker to start the analysis.
    nerWorker.postMessage({ text: message.data });

    // Return true to let the browser know that sendResponse will be called asynchronously.
    return true;
});
