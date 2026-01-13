import { DLP_PATTERNS, SENSITIVE_KEYWORDS } from '../shared/rules.js';

console.log("🛡️ Airlock Service Worker: Initialized");

// --- Offscreen Document Management ---
const OFFSCREEN_DOCUMENT_PATH = 'offscreen/offscreen.html';
let creating;

async function setupOffscreenDocument() {
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT']
    });
    if (existingContexts.length > 0) return;
    if (creating) {
        await creating;
    } else {
        console.log("Airlock: Creating Offscreen Document for NER analysis.");
        creating = chrome.offscreen.createDocument({
            url: OFFSCREEN_DOCUMENT_PATH,
            reasons: ['WORKERS'],
            justification: 'Required for running the Transformers.js NER model in a separate worker.',
        });
        await creating;
        creating = null;
    }
}

// --- Analysis Logic ---

// Tier 1: Local Regex and Keyword Scan
function analyzeTextLocally(text) {
    let findings = [];
    for (const [type, pattern] of Object.entries(DLP_PATTERNS)) {
        pattern.lastIndex = 0; // Reset regex state
        if (pattern.test(text)) {
            console.log(`PII Detected via Tier 1: Matched ${type}`);
            findings.push({ type, finding: `Detected a potential ${type.replace(/_/g, ' ')}` });
        }
    }
    for (const keyword of SENSITIVE_KEYWORDS) {
        if (text.toLowerCase().includes(keyword)) {
            console.log(`PII Detected via Tier 1: Matched keyword '${keyword}'`);
            findings.push({ type: "keyword", finding: `Detected sensitive keyword: ${keyword}` });
        }
    }
    return findings;
}

// Tier 2: Perform NER analysis via Offscreen Document
function performNerAnalysis(text) {
    return new Promise(async (resolve) => {
        await setupOffscreenDocument();

        const listener = (message) => {
            if (message.type === 'NER_RESULT') {
                console.log("Airlock: Received NER result from Offscreen Document.");
                chrome.runtime.onMessage.removeListener(listener);
                resolve(message.findings);
            }
        };
        chrome.runtime.onMessage.addListener(listener);

        console.log("Airlock: Relaying text to Offscreen Document for NER analysis.");
        chrome.runtime.sendMessage({ target: 'offscreen', data: text });
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


// --- Main Message Handler ---

async function handleAnalysisRequest(request, sendResponse) {
    // Run both local and NER analysis concurrently
    const [localFindings, nerFindings] = await Promise.all([
        analyzeTextLocally(request.promptText),
        performNerAnalysis(request.promptText)
    ]);

    const allFindings = [...localFindings, ...nerFindings];
    console.log("Airlock: Total findings:", allFindings);

    if (allFindings.length === 0) {
        sendResponse({ decision: "allow" });
    } else {
        const reasons = allFindings.map(f => f.finding);
        const redactedPrompt = redactText(request.promptText, localFindings); // Only redact based on precise Tier 1 patterns
        sendResponse({ decision: "redact", reasons, redactedText: redactedPrompt });
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'HANDSHAKE' && request.status === 'READY') {
        console.log("Airlock: Received handshake from content script.");
        sendResponse({ type: "ACKNOWLEDGE", version: chrome.runtime.getManifest().version });
        return;
    }

    if (request.type === 'AIRLOCK_ANALYZE') {
        handleAnalysisRequest(request, sendResponse);
        return true; // Keep message channel open for async response
    }
});
