console.log("Offscreen document created.");

// --- Service Worker Keep-Alive ---
setInterval(() => {
    chrome.runtime.sendMessage({ type: '_ping' });
}, 20000);


const nerWorker = new Worker('../workers/ner-worker.js', { type: 'module' });

let analyzeRequestCounter = 0;
let isWorkerReady = false; // becomes true once the model has loaded (warmup complete)

// Persistent listener for warmup status from the NER worker
nerWorker.addEventListener('message', (event) => {
    if (event.data.status === 'ready') {
        isWorkerReady = true;
        console.log("Offscreen: NER Worker is ready. Relaying warmup completion to Service Worker.");
        chrome.runtime.sendMessage({ type: 'NER_WARMUP_COMPLETE' });
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === '_ping') {
        return false;
    }

    if (message.target !== 'offscreen-document') {
        return false;
    }

    switch (message.action) {
        case 'warmup':
            console.log("Offscreen: Received warmup command. Forwarding to NER worker.");
            nerWorker.postMessage({ action: 'warmup' });
            return false;

        case 'analyze': {
            const requestId = ++analyzeRequestCounter;

            // Cold start: if the model hasn't finished loading, don't hang waiting for it.
            // Return empty immediately (regex DLP still protects the prompt) and make sure
            // the model keeps warming up so the NEXT prompt gets full NER.
            if (!isWorkerReady) {
                console.log("Offscreen: NER model still warming up — returning empty findings now (regex DLP active). NER will be ready for subsequent prompts.");
                nerWorker.postMessage({ action: 'warmup' });
                try {
                    sendResponse({ status: 'complete', type: 'NER_RESULT', findings: [], requestId });
                } catch (e) {
                    console.warn("Offscreen: Could not send not-ready response.", e);
                }
                return false;
            }

            console.log("Offscreen: Received analysis request. Forwarding to NER worker.");
            let timeoutId;

            const oneShotListener = (event) => {
                if (event.data.status === 'complete' && event.data.requestId === requestId) {
                    clearTimeout(timeoutId);
                    nerWorker.removeEventListener('message', oneShotListener);
                    try {
                        sendResponse(event.data);
                    } catch (e) {
                        console.warn("Offscreen: Could not send response to a closed channel.", e);
                    }
                }
            };

            // Model is loaded, so inference should be fast. 20s is a generous safety net.
            timeoutId = setTimeout(() => {
                nerWorker.removeEventListener('message', oneShotListener);
                console.warn("Offscreen: NER analysis timed out after 20s. Returning empty findings.");
                try {
                    sendResponse({ status: 'complete', type: 'NER_RESULT', findings: [], requestId });
                } catch (e) {
                    console.warn("Offscreen: Could not send timeout response.", e);
                }
            }, 20000);

            nerWorker.addEventListener('message', oneShotListener);
            nerWorker.postMessage({ action: 'analyze', text: message.data, requestId });

            return true;
        }

        default:
            console.warn("Offscreen: Received unknown action:", message.action);
            return false;
    }
});
