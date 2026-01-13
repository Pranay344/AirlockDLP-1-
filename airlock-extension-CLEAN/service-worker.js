import { DLP_PATTERNS, SENSITIVE_KEYWORDS } from './shared/rules.js';

const VERSION = "1.2.0";
const OFFSCREEN_DOCUMENT_PATH = '/offscreen/offscreen.html';

let creatingOffscreenDocument;

// --- ANALYZER FUNCTIONS ---

function localDlpScan(prompt) {
    let findings = [];
    // 1. Regex-based scan
    for (const type in DLP_PATTERNS) {
        const pattern = DLP_PATTERNS[type];
        const matches = [...prompt.matchAll(pattern)];
        if (matches.length > 0) {
            findings.push({ type: 'dlp', finding: `Detected potential ${type.replace('_', ' ')}: ${matches[0][0]}` });
        }
    }
    // 2. Keyword-based scan
    for (const keyword of SENSITIVE_KEYWORDS) {
        if (prompt.toLowerCase().includes(keyword)) {
            findings.push({ type: 'keyword', finding: `Detected sensitive keyword: "${keyword}"` });
        }
    }
    return findings;
}

async function nerAnalysis(prompt) {
    if (!prompt) return [];
    
    // Ensure the offscreen document is ready
    await setupOffscreenDocument(OFFSCREEN_DOCUMENT_PATH);

    // Send the prompt to the offscreen document to be processed by the worker
    chrome.runtime.sendMessage({ 
        target: 'offscreen', 
        data: prompt 
    });
}

async function analyzePrompt(prompt) {
    const localFindings = localDlpScan(prompt);
    
    try {
        // This will message the offscreen document, which will message the worker,
        // which will message back to this service worker.
        await nerAnalysis(prompt);
        // We will now wait for the NER_RESULT message from the worker
        // The promise will be resolved in the onMessage listener.
        
    } catch (error) {
        console.error("🛡️ Service Worker: NER analysis initiation failed!", error);
        // If the NER analysis fails to even start, return only local findings.
        return { decision: 'allow', reasons: [], redactedText: prompt, allFindings: localFindings };
    }

    // We need to return a promise that will be resolved when the NER results come back.
    return new Promise((resolve) => {
        const nerTimeout = setTimeout(() => {
            console.warn("🛡️ Service Worker: NER analysis timed out. Proceeding with local results only.");
            const combinedFindings = [...localFindings];
            const decision = localFindings.length > 0 ? 'redact' : 'allow';
            resolve({ decision, reasons: localFindings.map(f => f.finding), redactedText: prompt, allFindings: combinedFindings });
        }, 5000); // 5-second timeout

        const nerListener = (message, sender, sendResponse) => {
            if (message.type === 'NER_RESULT') {
                clearTimeout(nerTimeout);
                chrome.runtime.onMessage.removeListener(nerListener);

                const nerFindings = message.findings || [];
                console.log("🛡️ Service Worker: Received NER results.", nerFindings);

                const allFindings = [...localFindings, ...nerFindings];
                const reasons = allFindings.map(f => f.finding);
                const decision = allFindings.length > 0 ? 'redact' : 'allow';

                // Redact text based on all findings
                let redactedText = prompt;
                allFindings.forEach(finding => {
                    // Simple redaction: replace the finding's text with [REDACTED]
                    // This is a simplification; a real implementation would be more precise.
                    if (finding.finding.includes(":")) {
                        const textToRedact = finding.finding.split(":")[1].trim().replace(/'/g, "");
                        redactedText = redactedText.replace(new RegExp(textToRedact, 'gi'), '[REDACTED]');
                    }
                });

                resolve({ decision, reasons, redactedText, allFindings });
            }
        };

        chrome.runtime.onMessage.addListener(nerListener);
    });
}

// --- OFFSCREEN DOCUMENT HANDLING ---

async function hasOffscreenDocument(path) {
    const offscreenUrl = chrome.runtime.getURL(path);
    const clients = await self.clients.matchAll();
    return clients.some(client => client.url === offscreenUrl && client.type === 'offscreen');
}

async function setupOffscreenDocument(path) {
    if (await hasOffscreenDocument(path)) {
        return;
    }
    if (creatingOffscreenDocument) {
        await creatingOffscreenDocument;
    } else {
        creatingOffscreenDocument = chrome.offscreen.createDocument({
            url: path,
            reasons: ['WORKERS'],
            justification: 'Enable Natural Language Processing for DLP',
        });
        await creatingOffscreenDocument;
        creatingOffscreenDocument = null;
    }
}

// --- CHROME API LISTENERS ---

chrome.runtime.onInstalled.addListener(() => {
    console.log(`🛡️ Airlock DLP: Version ${VERSION} Installed`);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'AIRLOCK_ANALYZE') {
        console.log("🛡️ Service Worker: Received analysis request.", { text: message.promptText });
        analyzePrompt(message.promptText).then(sendResponse);
        return true; // Indicates that the response is asynchronous.
    
    } else if (message.type === 'HANDSHAKE' && message.status === 'READY') {
        console.log(`🛡️ Service Worker: Handshake from tab ${sender.tab.id}. Acknowledging.`);
        sendResponse({ type: 'ACKNOWLEDGE', version: VERSION });
    }
});

console.log(`🛡️ Airlock DLP: Service Worker Version ${VERSION} loaded.`);
