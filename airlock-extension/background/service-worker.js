import { DLP_PATTERNS, SENSITIVE_KEYWORDS } from '../shared/rules.js';

console.log("🛡️ Airlock Service Worker: Initializing & starting model warmup.");

// --- Constants ---
const NER_PERSON_BLACKLIST = [
    'my', 'i', 'a', 'an', 'the', 'is', 'in', 'it', 'to', 'and', 'you', 'he', 'she',
    'they', 'we', 'me', 'him', 'her', 'us', 'them', 'was', 'are', 'be', 'has', 'had',
    'do', 'does', 'did', 'for', 'of', 'at', 'by', 'on', 'with', 'from', 'as', 'this', 'that'
];
const NER_ORG_BLACKLIST = ['aadhaar', 'pan'];

const OFFSCREEN_DOCUMENT_PATH = 'offscreen/offscreen.html';

// --- State Management ---
let isAnalysisRunning = false;
const analysisQueue = [];
let isNerModelWarmedUp = false;
let isCreatingOffscreenDocument = false; // FIX: Lock to prevent race conditions

// --- Core Functions ---

async function hasOffscreenDocument(path) {
    const existingContexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [chrome.runtime.getURL(path)] });
    return existingContexts.length > 0;
}

async function warmupNerModel() {
    if (isCreatingOffscreenDocument) {
        console.log("Airlock: Offscreen document creation is already in progress. Aborting duplicate call.");
        return;
    }

    if (await hasOffscreenDocument(OFFSCREEN_DOCUMENT_PATH)) {
        if (!isNerModelWarmedUp) {
            console.log("Airlock: Sending warmup message to existing offscreen document.");
            await chrome.runtime.sendMessage({ target: 'offscreen-document', action: 'warmup' });
        }
        return;
    }

    if (isNerModelWarmedUp) return;

    try {
        isCreatingOffscreenDocument = true; // Set the lock

        console.log("Airlock: Creating offscreen document for NER model warmup...");
        await chrome.offscreen.createDocument({
            url: OFFSCREEN_DOCUMENT_PATH,
            reasons: ['WORKERS'],
            justification: 'To proactively cache the NER model for faster analysis.'
        });

        await chrome.runtime.sendMessage({ target: 'offscreen-document', action: 'warmup' });

    } catch (error) {
        if (error.message.includes("Only a single offscreen document may be created")) {
            console.warn("Airlock: Race condition averted. Offscreen document was created by another process.");
        } else {
            console.error("Airlock: Error creating offscreen document.", error);
        }
    } finally {
        isCreatingOffscreenDocument = false; // Always release the lock
    }
}

function analyzeTextLocally(text) {
    let findings = [];
    for (const [type, pattern] of Object.entries(DLP_PATTERNS)) {
        const globalPattern = new RegExp(pattern.source, 'gi');
        for (const match of text.matchAll(globalPattern)) {
            findings.push({ type, finding: `Detected ${type.replace(/_/g, ' ')}`, matchedText: match[0] });
        }
    }
    return findings;
}

async function performNerAnalysis(text) {
    const result = await chrome.runtime.sendMessage({ target: 'offscreen-document', action: 'analyze', data: text });
    if (!result || result.type === 'NER_ERROR') {
        console.error("Airlock: NER analysis failed.", result ? result.error : 'No result');
        return [];
    }
    return result.findings;
}

function redactText(text, findings) {
    if (!findings || findings.length === 0) return text;
    const intervals = [];
    for (const finding of findings) {
        const escapedText = finding.matchedText.replace(/[.*+?^${}()|[\]\/]/g, '\\$&');
        try {
            const regex = new RegExp(escapedText, 'g');
            let match;
            while ((match = regex.exec(text)) !== null) {
                intervals.push({ start: match.index, end: match.index + match[0].length, type: finding.type });
            }
        } catch(e) {
            console.error(`Airlock: Failed to create Regex for finding: ${escapedText}`, e);
        }
    }
    if (intervals.length === 0) return text;
    intervals.sort((a, b) => a.start - b.start);
    const merged = [intervals[0]];
    for (let i = 1; i < intervals.length; i++) {
        const last = merged[merged.length - 1];
        if (intervals[i].start < last.end) { last.end = Math.max(last.end, intervals[i].end); } 
        else { merged.push(intervals[i]); }
    }
    let redacted = '';
    let lastIndex = 0;
    for (const interval of merged) {
        let label = (interval.type || 'ENTITY').toUpperCase();
        if (label.startsWith('NER_')) {
            label = label.substring(4);
        }
        if (label === 'PER') label = 'PERSON';
        redacted += text.substring(lastIndex, interval.start) + `[REDACTED_${label}]`;
        lastIndex = interval.end;
    }
    redacted += text.substring(lastIndex);
    return redacted;
}

// --- Main Task Processing ---
async function processQueue() {
    if (isAnalysisRunning || analysisQueue.length === 0) return;
    isAnalysisRunning = true;
    const { request, sendResponse } = analysisQueue.shift();

    try {
        console.log("Airlock: Processing with parallel analysis...");
        
        const [localFindings, nerFindings] = await Promise.all([
            analyzeTextLocally(request.promptText),
            performNerAnalysis(request.promptText)
        ]);

        const filteredNerFindings = nerFindings.filter(finding => {
            const matchedTextLower = finding.matchedText.toLowerCase().trim();
            if (finding.type === 'ner_PER') {
                if (NER_PERSON_BLACKLIST.includes(matchedTextLower)) return false;
            }
            if (finding.type === 'ner_ORG') {
                if (NER_ORG_BLACKLIST.includes(matchedTextLower)) return false;
            }
            return true;
        });

        const allFindings = [...localFindings, ...filteredNerFindings];
        let response;
        
        if (allFindings.length === 0) {
            response = { decision: "allow" };
        } else {
            const reasons = [...new Set(allFindings.map(f => f.finding))];
            const redactedPrompt = redactText(request.promptText, allFindings);
            response = { decision: "redact", reasons, redactedText: redactedPrompt };
        }
        
        response.type = "ANALYSIS_RESULT";
        sendResponse(response);

    } catch (error) {
        console.error("Airlock: Critical error in parallel analysis.", error);
        sendResponse({ type: "ANALYSIS_RESULT", decision: null, error: error.message });
    } finally {
        isAnalysisRunning = false;
        setTimeout(processQueue, 0);
    }
}

// --- Event Listeners ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === '_ping') {
    // This is the keep-alive message from the offscreen document.
    // We don't need to do anything with it, just receiving it is enough.
    return false;
  }

  if (request.type === 'AIRLOCK_ANALYZE') {
      analysisQueue.push({ request, sendResponse });
      if (!isAnalysisRunning) { processQueue(); }
      return true; // Keep message channel open for async response
  }
  if (request.type === 'NER_WARMUP_COMPLETE') {
      console.log("Airlock: Confirmed NER Model is warmed up and ready.");
      isNerModelWarmedUp = true;
  }
  return false; // No other messages need an async response
});

chrome.runtime.onStartup.addListener(warmupNerModel);
warmupNerModel();
