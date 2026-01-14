import { DLP_PATTERNS, SENSITIVE_KEYWORDS } from '../shared/rules.js';

console.log("🛡️ Airlock Service Worker: Initialized.");

// --- State Management for Queueing ---
let isAnalysisRunning = false;
const analysisQueue = [];
const OFFSCREEN_DOCUMENT_PATH = 'offscreen/offscreen.html';

// --- Analysis Logic ---

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

    // 2. Contextual Keyword Analysis
    const keywordRegex = new RegExp(`\\b(${SENSITIVE_KEYWORDS.join('|')})\\b`, 'gi');
    const secretLikeRegex = /[\w\/\-\+\$]{20,}/; 

    for (const keywordMatch of text.matchAll(keywordRegex)) {
        const keyword = keywordMatch[0];
        const startIndex = keywordMatch.index + keyword.length;
        const searchArea = text.substring(startIndex, startIndex + 150); 

        const secretMatch = searchArea.match(secretLikeRegex);
        
        if (secretMatch) {
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

async function hasOffscreenDocument(path) {
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [chrome.runtime.getURL(path)]
    });
    return existingContexts.length > 0;
}

async function performNerAnalysis(text) {
    if (!(await hasOffscreenDocument(OFFSCREEN_DOCUMENT_PATH))) {
        await chrome.offscreen.createDocument({
            url: OFFSCREEN_DOCUMENT_PATH,
            reasons: ['WORKERS'],
            justification: 'To perform NER analysis on user input.',
        });
    }

    const result = await chrome.runtime.sendMessage({
        target: 'offscreen-document',
        data: text
    });

    if (!result) {
        console.error("Airlock: NER analysis returned no result. This may be due to a listener conflict.");
        return [];
    }

    if (result.type === 'NER_ERROR') {
        throw new Error(result.error);
    }

    return result.findings;
}

// CORRECTED REDACTION LOGIC
function redactText(text, findings) {
    if (!findings || findings.length === 0) {
        return text;
    }

    // 1. Convert findings to a flat list of non-overlapping intervals
    const intervals = [];
    for (const finding of findings) {
        const escapedText = finding.matchedText.replace(/[.*+?^${}()|[\]\/]/g, '\\$&');
        const regex = new RegExp(escapedText, 'g');
        let match;
        while ((match = regex.exec(text)) !== null) {
            intervals.push({ 
                start: match.index, 
                end: match.index + match[0].length, 
                type: finding.type 
            });
        }
    }

    if (intervals.length === 0) return text;

    // 2. Sort intervals by start index and merge overlapping intervals
    intervals.sort((a, b) => a.start - b.start);

    const mergedIntervals = [];
    let currentInterval = intervals[0];

    for (let i = 1; i < intervals.length; i++) {
        const nextInterval = intervals[i];
        if (nextInterval.start < currentInterval.end) {
            // Overlap detected, merge by taking the larger interval
            currentInterval.end = Math.max(currentInterval.end, nextInterval.end);
            // Optionally, combine types if needed, here we just keep the first one
        } else {
            mergedIntervals.push(currentInterval);
            currentInterval = nextInterval;
        }
    }
    mergedIntervals.push(currentInterval);

    // 3. Rebuild the string from the intervals
    let redactedText = '';
    let lastIndex = 0;
    for (const interval of mergedIntervals) {
        redactedText += text.substring(lastIndex, interval.start);
        redactedText += `[REDACTED_${(interval.type || 'ENTITY').toUpperCase()}]`;
        lastIndex = interval.end;
    }
    redactedText += text.substring(lastIndex);

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
        console.log("Airlock: Analysis complete, sending final decision:", response);
        sendResponse(response);

    } catch (error) {
        console.error("Airlock: Error during analysis task.", error);
        sendResponse({ type: "ANALYSIS_RESULT", decision: null, error: error.message });
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
      if (!isAnalysisRunning) {
          processQueue();
      }
      return true; // Keep the message channel open for the asynchronous sendResponse.
  }
  // By omitting a return statement here, we leave the channel open for other listeners
  // (like the one in offscreen.js) to send a response. Returning `false` would close it.
});
