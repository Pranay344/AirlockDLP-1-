import { DLP_PATTERNS, SENSITIVE_KEYWORDS } from '../shared/rules.js';

console.log("🛡️ Airlock Service Worker: Initialized");

// --- State Management for Queueing ---
let isAnalysisRunning = false;
const analysisQueue = [];

// --- Analysis Logic ---

function analyzeTextLocally(text) {
    let findings = [];
    for (const [type, pattern] of Object.entries(DLP_PATTERNS)) {
        pattern.lastIndex = 0;
        if (pattern.test(text)) {
            findings.push({ type, finding: `Detected a potential ${type.replace(/_/g, ' ')}` });
        }
    }
    for (const keyword of SENSITIVE_KEYWORDS) {
        if (text.toLowerCase().includes(keyword)) {
            findings.push({ type: "keyword", finding: `Detected sensitive keyword: ${keyword}` });
        }
    }
    return findings;
}

function performNerAnalysis(text) {
    return new Promise(async (resolve, reject) => {
        const OFFSCREEN_DOCUMENT_PATH = 'offscreen/offscreen.html';
        let settled = false;

        await chrome.offscreen.closeDocument().catch(() => {});

        try {
            await chrome.offscreen.createDocument({
                url: OFFSCREEN_DOCUMENT_PATH,
                reasons: ['WORKERS'],
                justification: 'For performing a single, isolated NER analysis.',
            });
        } catch (error) {
            return reject(new Error(`Failed to create offscreen document: ${error.message}`));
        }

        const port = chrome.runtime.connect({ name: "service-worker-offscreen-connect" });

        const timeout = setTimeout(() => {
            if (settled) return;
            settled = true;
            port.disconnect();
            reject(new Error("NER analysis timed out."));
        }, 7000);

        port.onMessage.addListener(message => {
            if (settled) return;
            if (message.type === 'NER_RESULT') {
                settled = true;
                clearTimeout(timeout);
                port.disconnect();
                resolve(message.findings);
            }
        });

        port.onDisconnect.addListener(() => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            reject(new Error("Offscreen document disconnected unexpectedly."));
        });
        
        port.postMessage({ target: 'offscreen', data: text });
    });
}

function redactText(text, findings) {
    let redactedText = text;
    for (const finding of findings) {
        if (finding.type === "keyword" || !DLP_PATTERNS[finding.type]) continue;
        const pattern = DLP_PATTERNS[finding.type];
        pattern.lastIndex = 0;
        redactedText = redactedText.replace(pattern, `[REDACTED_${finding.type.toUpperCase()}]`);
    }
    return redactedText;
}

async function processQueue() {
    if (isAnalysisRunning || analysisQueue.length === 0) {
        return;
    }
    isAnalysisRunning = true;
    const { request, port } = analysisQueue.shift();

    try {
        console.log("Airlock: Processing next item from queue.");
        const [localFindings, nerFindings] = await Promise.all([
            analyzeTextLocally(request.promptText),
            performNerAnalysis(request.promptText)
        ]);

        const allFindings = [...localFindings, ...nerFindings].filter(Boolean);
        let response;

        if (allFindings.length === 0) {
            response = { decision: "allow" };
        } else {
            const reasons = allFindings.map(f => f.finding);
            const redactedPrompt = redactText(request.promptText, allFindings);
            response = { decision: "redact", reasons, redactedText: redactedPrompt };
        }
        
        response.type = "ANALYSIS_RESULT";
        if (port) port.postMessage(response);

    } catch (error) {
        console.error("Airlock: Error during analysis task.", error);
        if (port) port.postMessage({ type: "ANALYSIS_RESULT", decision: null, error: error.message });
    } finally {
        isAnalysisRunning = false;
        setTimeout(processQueue, 0); // Process the next item
    }
}

// --- Main Connection Handler ---
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "airlock-content-script") return;
  
  console.log("Airlock: Content script connected.");

  port.onMessage.addListener((request) => {
    if (request.type === 'AIRLOCK_ANALYZE') {
        console.log("Airlock: Queuing analysis request.");
        analysisQueue.push({ request, port });
        processQueue(); // Kick off the queue processor if it's not running
    }
  });

  port.onDisconnect.addListener(() => {
    console.log("Airlock: Content script port disconnected.");
    // Remove pending tasks for this disconnected port
    for (let i = analysisQueue.length - 1; i >= 0; i--) {
        if (analysisQueue[i].port === port) {
            analysisQueue.splice(i, 1);
        }
    }
  });
});
