import { DLP_PATTERNS, SENSITIVE_KEYWORDS } from '../shared/rules.js';

console.log("🛡️ Airlock Service Worker: Initialized for one-time messaging.");

// --- State Management for Queueing ---
let isAnalysisRunning = false;
const analysisQueue = [];

// --- Analysis Logic (REFACTORED FOR MULTIPLE FINDINGS) ---

function analyzeTextLocally(text) {
    let findings = [];

    // For DLP patterns (Regex) - find ALL matches
    for (const [type, pattern] of Object.entries(DLP_PATTERNS)) {
        // Create a new global version of the pattern to find all matches
        const globalPattern = new RegExp(pattern.source, 'gi');
        for (const match of text.matchAll(globalPattern)) {
            findings.push({
                type,
                // The finding description for the modal
                finding: `Detected a potential ${type.replace(/_/g, ' ')}`,
                // The exact text that was matched, for precise redaction
                matchedText: match[0]
            });
        }
    }

    // For sensitive keywords (simple string search)
    for (const keyword of SENSITIVE_KEYWORDS) {
        if (text.toLowerCase().includes(keyword)) {
            // This is a simplification but better than nothing.
            // A full implementation would find all occurrences of keywords too.
            findings.push({ type: 'keyword', finding: `Detected sensitive keyword: ${keyword}`, matchedText: keyword });
        }
    }
    return findings;
}


function performNerAnalysis(text) {
    return new Promise(async (resolve, reject) => {
        const OFFSCREEN_DOCUMENT_PATH = 'offscreen/offscreen.html';
        let settled = false;

        try {
            await chrome.offscreen.closeDocument().catch(() => {});

            await chrome.offscreen.createDocument({
                url: OFFSCREEN_DOCUMENT_PATH,
                reasons: ['WORKERS'],
                justification: 'For performing a single, isolated NER analysis.',
            });

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

        } catch (error) {
             reject(new Error(`Failed to create or communicate with offscreen document: ${error.message}`));
        }
    });
}

function redactText(text, findings) {
    let redactedText = text;
    const redactionMap = new Map();

    // Create a map from the matched text to its finding type.
    // This ensures we only process each unique piece of sensitive text once.
    for (const finding of findings) {
        if (finding.matchedText && !redactionMap.has(finding.matchedText)) {
            redactionMap.set(finding.matchedText, finding.type);
        }
    }

    // Iterate over the unique findings and replace them in the text.
    for (const [matched, type] of redactionMap.entries()) {
        // Escape any special regex characters in the matched string to prevent errors.
        const escapedText = matched.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escapedText, 'g');
        // Use the finding 'type' to create a more descriptive redaction.
        redactedText = redactedText.replace(regex, `[REDACTED_${type.toUpperCase()}]`);
    }

    return redactedText;
}


// --- Queue and Task Processing ---

async function processQueue() {
    if (isAnalysisRunning || analysisQueue.length === 0) {
        return;
    }
    isAnalysisRunning = true;
    const { request, sendResponse } = analysisQueue.shift();

    try {
        console.log("Airlock: Processing next item from queue.");
        // We still use the dummy NER worker for now
        const [localFindings, nerFindings] = await Promise.all([
            analyzeTextLocally(request.promptText),
            performNerAnalysis(request.promptText)
        ]);

        const allFindings = [...localFindings, ...nerFindings].filter(Boolean);
        let response;

        if (allFindings.length === 0) {
            response = { decision: "allow" };
        } else {
            // Get unique reasons for the modal display
            const reasons = [...new Set(allFindings.map(f => f.finding))];
            const redactedPrompt = redactText(request.promptText, allFindings);
            response = { decision: "redact", reasons, redactedText: redactedPrompt };
        }
        
        response.type = "ANALYSIS_RESULT";
        if (sendResponse) sendResponse(response);

    } catch (error) {
        console.error("Airlock: Error during analysis task.", error);
        if (sendResponse) sendResponse({ type: "ANALYSIS_RESULT", decision: null, error: error.message });
    } finally {
        isAnalysisRunning = false;
        setTimeout(processQueue, 0);
    }
}

// --- Main Message Handler ---

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'AIRLOCK_ANALYZE') {
      console.log("Airlock: Received analysis request from content script.");
      analysisQueue.push({ request, sendResponse });
      processQueue();
      
      return true; // We will send a response asynchronously
  }
  return false;
});
