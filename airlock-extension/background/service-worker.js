import { DLP_PATTERNS, SENSITIVE_KEYWORDS } from '../shared/rules.js';

console.log("🛡️ Airlock Service Worker: Initialized for one-time messaging.");

// --- State Management for Queueing ---
let isAnalysisRunning = false;
const analysisQueue = [];

// --- Analysis Logic (FINAL, ROBUST FIX) ---

function analyzeTextLocally(text) {
    let findings = [];

    // 1. Regex-based DLP patterns
    for (const [type, pattern] of Object.entries(DLP_PATTERNS)) {
        const globalPattern = new RegExp(pattern.source, 'gi');
        for (const match of text.matchAll(globalPattern)) {
            findings.push({
                type,
                finding: `Detected a potential ${type.replace(/_/g, ' ')}`,
                matchedText: match[0]
            });
        }
    }

    // 2. Contextual Keyword Analysis (SIMPLIFIED & MORE ROBUST)
    const keywordRegex = new RegExp(`\\b(${SENSITIVE_KEYWORDS.join('|')})\\b`, 'gi');
    const secretLikeRegex = /[\w\/\-\+\$]{20,}/; // A secret is likely a long string of characters, now including `$`

    // Process the text as a single block, not line-by-line
    for (const keywordMatch of text.matchAll(keywordRegex)) {
        const keyword = keywordMatch[0];
        const startIndex = keywordMatch.index + keyword.length;
        
        // Search the text immediately following the keyword
        const searchArea = text.substring(startIndex, startIndex + 150); // Look within a reasonable distance

        const secretMatch = searchArea.match(secretLikeRegex);
        
        if (secretMatch) {
            // Ensure we don't re-add a finding that a DLP pattern already caught
            const isAlreadyFound = findings.some(f => f.matchedText === secretMatch[0]);
            if (!isAlreadyFound) {
                 findings.push({
                    type: `keyword_${keyword}`,
                    finding: `Detected value associated with keyword: "${keyword}"`,
                    matchedText: secretMatch[0]
                });
            }
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

    for (const finding of findings) {
        if (finding.matchedText && !redactionMap.has(finding.matchedText)) {
            redactionMap.set(finding.matchedText, finding.type);
        }
    }

    for (const [matched, type] of redactionMap.entries()) {
        const escapedText = matched.replace(/[.*+?^${}()|[\]\/]/g, '\\$&');
        const regex = new RegExp(escapedText, 'g');
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
        const [localFindings, nerFindings] = await Promise.all([
            analyzeTextLocally(request.promptText),
            performNerAnalysis(request.promptText).catch(e => { 
                console.warn("NER analysis failed, proceeding without it.", e);
                return []; // Return empty array on NER failure
            })
        ]);

        const allFindings = [...localFindings, ...nerFindings].filter(Boolean);
        let response;

        if (allFindings.length === 0) {
            response = { decision: "allow" };
        } else {
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
