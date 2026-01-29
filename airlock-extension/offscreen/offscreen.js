console.log("Offscreen document created.");

// --- Service Worker Keep-Alive ---
// This is the core of the keep-alive mechanism. It sends a simple "ping"
// to the service worker every 20 seconds. This is enough activity to
// prevent Chrome from putting the service worker to sleep.
setInterval(() => {
    chrome.runtime.sendMessage({ type: '_ping' });
}, 20000);


const nerWorker = new Worker('../workers/ner-worker.js', { type: 'module' });

// Persistent listener for status updates from the NER worker (e.g., model ready)
nerWorker.addEventListener('message', (event) => {
    if (event.data.status === 'ready') {
        console.log("Offscreen: NER Worker is ready. Relaying warmup completion to Service Worker.");
        chrome.runtime.sendMessage({ type: 'NER_WARMUP_COMPLETE' });
    }
});

// Listener for specific analysis requests from the Service Worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Ignore the pings we are sending ourselves
    if (message.type === '_ping') {
        return false;
    }

    if (message.target !== 'offscreen-document') {
        return false; // Message is not for us.
    }

    switch (message.action) {
        case 'warmup':
            console.log("Offscreen: Received warmup command. Forwarding to NER worker.");
            nerWorker.postMessage({ action: 'warmup' });
            // This is a fire-and-forget message. We don't need to keep the channel open,
            // so we return false or undefined implicitly.
            return false;

        case 'analyze':
            console.log("Offscreen: Received analysis request. Forwarding to NER worker.");
            
            const oneShotListener = (event) => {
                // Ensure we only handle the completion of our specific analysis task
                if (event.data.status === 'complete') {
                    console.log("Offscreen: Received analysis result. Sending back to SW.", event.data);
                    try {
                        sendResponse(event.data);
                    } catch (e) {
                        console.warn("Offscreen: Could not send response to a closed channel.", e);
                    }
                    // Clean up the listener to prevent memory leaks and duplicate responses
                    nerWorker.removeEventListener('message', oneShotListener);
                }
            };
            
            nerWorker.addEventListener('message', oneShotListener);
            nerWorker.postMessage({ action: 'analyze', text: message.data });
            
            // CRITICAL: Return true *only* for this case to indicate an asynchronous response.
            return true; 

        default:
            console.warn("Offscreen: Received unknown action:", message.action);
            // Close the channel for any unknown actions.
            return false;
    }
});
