import { compressPrompt } from '../shared/compressor.js';
import { analyzeTextLocally, redactText, processNerFindings, applyCustomRules } from '../shared/engine.js';
import { categoryOf } from '../shared/categories.js';

console.log("🛡️ Airlock Service Worker: Initializing & starting model warmup.");

const OFFSCREEN_DOCUMENT_PATH = 'offscreen/offscreen.html';

// Allow content scripts to read/write chrome.storage.session (default is trusted-only).
// Used to persist the redaction map across page refreshes so reinsertion survives reloads.
// session storage is in-memory (never written to disk) and cleared when the browser closes.
try {
    Promise.resolve(
        chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })
    ).catch(e => console.warn("Airlock: Could not set session storage access level:", e));
} catch (e) {
    console.warn("Airlock: setAccessLevel threw synchronously:", e);
}

// --- State Management ---
let isAnalysisRunning = false;
const analysisQueue = [];
let isNerModelWarmedUp = false;
let isCreatingOffscreenDocument = false; // FIX: Lock to prevent race conditions

// --- Dashboard integration (telemetry + admin feature toggles) ---
// When the extension is unconfigured, everything stays ON (defaults) so it works standalone.
const DEFAULT_SETTINGS = {
    tokenOptimizer: true,
    nerDetection: true,
    reinjection: true,
    categories: { pii: true, secrets: true, financial: true, medical: true },
    // Categories that trigger a hard "smart block" (vs soft redact). Default: credentials + financial.
    blockCategories: { pii: false, secrets: true, financial: true, medical: false },
    departments: [],
    customRules: []
};

function getConfig() {
    return new Promise(resolve => {
        chrome.storage.local.get('airlockConfig', d => resolve(d.airlockConfig || null));
    });
}

function getCachedSettings() {
    return new Promise(resolve => {
        chrome.storage.local.get('airlockSettings', d => resolve(d.airlockSettings || DEFAULT_SETTINGS));
    });
}

async function refreshSettings() {
    const config = await getConfig();
    if (!config || !config.orgCode) { console.log('[Airlock] refreshSettings: SKIPPED (popup not configured — no orgCode in airlockConfig)'); return; }
    const base = (config.backendUrl || 'http://localhost:4000').replace(/\/+$/, '');
    const url = `${base}/api/public-settings?orgCode=${encodeURIComponent(config.orgCode)}`;
    try {
        const res = await fetch(url);
        if (!res.ok) { console.warn(`[Airlock] refreshSettings: HTTP ${res.status} for orgCode=${config.orgCode} — wrong org code or backend?`); return; }
        const body = await res.json();
        if (body && body.data) {
            chrome.storage.local.set({ airlockSettings: body.data });
            const ruleCount = (body.data.customRules || []).length;
            const deptCount = (body.data.departments || []).length;
            console.log(`[Airlock] refreshSettings: OK — orgCode=${config.orgCode}, fetched ${ruleCount} rule(s), ${deptCount} department(s)`);
        }
    } catch (e) {
        console.warn(`[Airlock] refreshSettings: FETCH FAILED — ${e.message} (URL: ${url})`);
    }
}

// Report ONLY metadata — never prompt text or redacted values (DLP privacy invariant).
async function reportEvent(evt) {
    const config = await getConfig();
    if (!config || !config.orgCode || !config.email) return; // unconfigured → no telemetry
    const base = (config.backendUrl || 'http://localhost:4000').replace(/\/+$/, '');
    try {
        await fetch(`${base}/api/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                orgCode: config.orgCode,
                email: config.email,
                decision: evt.decision,
                findingsCount: evt.findingsCount,
                tokensSaved: evt.tokensSaved,
                categories: evt.categories,
                host: evt.host,
                department: evt.department || config.department || 'Unassigned'
            })
        });
    } catch (e) {
        // Backend down — extension keeps working locally; event is simply not recorded.
    }
}

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

async function ensureOffscreenAlive() {
    const alive = await hasOffscreenDocument(OFFSCREEN_DOCUMENT_PATH);
    if (!alive) {
        console.log("Airlock: Keepalive — offscreen document missing, recreating.");
        isNerModelWarmedUp = false;
        await warmupNerModel();
    } else if (!isNerModelWarmedUp) {
        console.log("Airlock: Keepalive — offscreen alive but NER not warmed up, sending warmup.");
        await warmupNerModel();
    }
}

async function performNerAnalysis(text) {
    try {
        const result = await chrome.runtime.sendMessage({ target: 'offscreen-document', action: 'analyze', data: text });
        if (!result || result.type === 'NER_ERROR') {
            console.error("Airlock: NER analysis failed.", result ? result.error : 'No result');
            return [];
        }
        return result.findings;
    } catch (error) {
        console.error("Airlock: Offscreen document unreachable, resetting state:", error.message);
        isNerModelWarmedUp = false;
        warmupNerModel().catch(e => console.error("Airlock: Offscreen recreation failed:", e));
        return [];
    }
}

// --- Main Task Processing ---
async function processQueue() {
    if (isAnalysisRunning || analysisQueue.length === 0) return;
    isAnalysisRunning = true;
    const { request, sendResponse } = analysisQueue.shift();

    try {
        console.log("Airlock: Processing with parallel analysis...");

        // Admin feature toggles (cached from the dashboard; defaults all-on if unconfigured).
        const settings = await getCachedSettings();
        const config = await getConfig();
        const dept = (config && config.department) || 'Unassigned';
        const cats = settings.categories || {};

        // Step 1 — compress filler (greetings/sign-offs), unless the admin disabled it.
        let compressed = request.promptText, tokensSaved = 0, charsRemoved = 0;
        if (settings.tokenOptimizer !== false) {
            ({ compressed, tokensSaved, charsRemoved } = compressPrompt(request.promptText));
        }
        const textToAnalyze = charsRemoved > 0 ? compressed : request.promptText;
        console.log(`[Airlock] compressor: removed=${charsRemoved}ch ≈ ${tokensSaved} tokens | enabled=${settings.tokenOptimizer !== false}`);

        const nerTimeout = new Promise(resolve =>
            setTimeout(() => {
                console.warn("Airlock: NER timed out after 25s — falling back to local analysis only.");
                resolve([]);
            }, 25000)
        );

        // NER only if the admin enabled it.
        const nerPromise = settings.nerDetection !== false
            ? Promise.race([performNerAnalysis(textToAnalyze), nerTimeout])
            : Promise.resolve([]);

        const [localFindings, nerFindings] = await Promise.all([
            analyzeTextLocally(textToAnalyze),
            nerPromise
        ]);

        const dedupedNer = processNerFindings(nerFindings);
        let allFindings = [...dedupedNer, ...localFindings];

        // Drop findings whose category group the admin turned off (pii/secrets/financial/medical).
        // NER is gated above; keyword warnings are always allowed (they don't redact).
        allFindings = allFindings.filter(f => {
            const cat = categoryOf(f.type);
            if (cat === 'pii' || cat === 'secrets' || cat === 'financial' || cat === 'medical') {
                return cats[cat] !== false;
            }
            return true;
        });

        // Apply admin custom rules scoped to this employee's department (or org-wide).
        const applicableRules = (settings.customRules || []).filter(r => r.department === 'all' || r.department === dept);
        const customFindings = applyCustomRules(textToAnalyze, applicableRules);
        allFindings = allFindings.concat(customFindings);
        console.log(`[Airlock] custom rules: ${(settings.customRules || []).length} total, ${applicableRules.length} applicable (dept=${dept}), ${customFindings.length} matched`);

        // Category groups for the dashboard event (metadata only — never raw values).
        const eventCategories = [...new Set(allFindings.map(f => categoryOf(f.type)))];

        // Smart block: hard-block if a custom rule says so (action=block) OR the category is flagged.
        const blockCats = settings.blockCategories || { secrets: true, financial: true };
        const isBlockHit = (f) => f.redact !== false && (f.action === 'block' || blockCats[categoryOf(f.type)] === true);
        const blockHits = allFindings.filter(isBlockHit);

        let response;

        if (allFindings.length === 0 && tokensSaved >= 3) {
            // No PII, but filler was stripped — show the optimizer-only modal.
            response = { decision: "token_optimized", tokensSaved, redactedText: compressed, redactionMap: {} };
        } else if (allFindings.length === 0) {
            response = { decision: "allow", tokensSaved };
        } else {
            const reasons = [...new Set(allFindings.map(f => f.finding))];
            const findingsToRedact = allFindings.filter(f => f.redact !== false);
            const { redactedText: redactedPrompt, redactionMap } = redactText(textToAnalyze, findingsToRedact);

            // Reinjection map: never reveal secrets or anything hard-blocked — those stay [REDACTED]
            // in the reply. (The text is still fully redacted; we just withhold the reveal mapping.)
            const noReveal = new Set();
            for (const f of allFindings) {
                if (f.redact === false) continue;
                if (categoryOf(f.type) === 'secrets' || isBlockHit(f)) noReveal.add(f.matchedText);
            }
            let finalMap = {};
            if (settings.reinjection !== false) {
                for (const [ph, val] of Object.entries(redactionMap)) {
                    if (!noReveal.has(val)) finalMap[ph] = val;
                }
            }

            if (blockHits.length > 0) {
                // High-risk data present → smart block. We still provide the redacted "safe version"
                // so the user can one-click send a compliant version instead of being stonewalled.
                const blockedCategories = [...new Set(blockHits.map(f => categoryOf(f.type)))];
                response = { decision: "block", reasons, redactedText: redactedPrompt, redactionMap: finalMap, tokensSaved, blockedCategories };
            } else {
                response = { decision: "redact", reasons, redactedText: redactedPrompt, redactionMap: finalMap, tokensSaved };
            }
        }

        response.type = "ANALYSIS_RESULT";
        console.log(`[Airlock] decision=${response.decision} | findings=${allFindings.length} | tokensSaved=${response.tokensSaved || 0} | placeholders=${response.redactionMap ? Object.keys(response.redactionMap).length : 0}`);
        sendResponse(response);

        // Fire-and-forget telemetry to the dashboard (metadata only).
        reportEvent({
            decision: response.decision,
            findingsCount: allFindings.length,
            tokensSaved: response.tokensSaved || 0,
            categories: eventCategories,
            host: request.host,
            department: dept
        });

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
  if (request.type === 'AIRLOCK_ANALYZE') {
      analysisQueue.push({ request, sendResponse });
      if (!isAnalysisRunning) { processQueue(); }
      return true;
  }
  if (request.type === 'NER_WARMUP_COMPLETE') {
      console.log("Airlock: Confirmed NER Model is warmed up and ready.");
      isNerModelWarmedUp = true;
  }
  if (request.type === 'AIRLOCK_CONFIG_UPDATED') {
      // Popup saved new org config — pull the latest toggles immediately.
      refreshSettings().catch(e => console.error("Airlock: settings refresh failed:", e));
  }
  return false;
});


chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
    const targetUrls = [
        "https://gemini.google.com/",
        "https://chat.openai.com/",
        "https://chatgpt.com/",
        "https://claude.ai/"
    ];

    if (targetUrls.some(url => details.url.startsWith(url))) {
        console.log(`Airlock: SPA navigation to ${details.url}. Injecting content script.`);
        chrome.scripting.executeScript({
            target: { tabId: details.tabId },
            files: ["content-scripts/main.js"]
        }).catch(err => console.error("Airlock: Failed to inject script on SPA navigation:", err));
    }
});

chrome.runtime.onStartup.addListener(() => {
    warmupNerModel();
    refreshSettings();
    chrome.alarms.create('airlock-keepalive', { periodInMinutes: 0.4 });
});

// When the extension is installed/updated/reloaded, auto-refresh AI chat tabs so the
// fresh content script takes over (otherwise old tabs keep running stale code with
// 'Extension context invalidated' errors and stop intercepting).
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'chrome_update') return;
    const urls = [
        'https://chat.openai.com/*',
        'https://chatgpt.com/*',
        'https://claude.ai/*',
        'https://gemini.google.com/*'
    ];
    try {
        chrome.tabs.query({ url: urls }, (tabs) => {
            if (!tabs) return;
            for (const t of tabs) {
                try { chrome.tabs.reload(t.id); } catch (e) {}
            }
            if (tabs.length) console.log(`Airlock: auto-refreshed ${tabs.length} AI chat tab(s) after extension ${details.reason}.`);
        });
    } catch (e) { /* tabs API guard */ }
    warmupNerModel();
    refreshSettings();
    chrome.alarms.create('airlock-keepalive', { periodInMinutes: 0.4 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'airlock-keepalive') {
        ensureOffscreenAlive().catch(e => console.error("Airlock: Keepalive check failed:", e));
        refreshSettings().catch(e => console.error("Airlock: settings refresh failed:", e));
    }
});

warmupNerModel();
refreshSettings();
chrome.alarms.create('airlock-keepalive', { periodInMinutes: 0.4 });
