(function () {
    if (window.__airlockInitialized) return;
    window.__airlockInitialized = true;

    console.log("🛡️ Airlock Content Script: Initialized for one-time messaging.");
    console.log("[Airlock] If a prompt isn't being intercepted, look for '[Airlock] context invalidated' warnings — you'll need to refresh this tab.");

    const siteConfigs = {
        "chat.openai.com": { textarea: "#prompt-textarea", sendButton: 'button[data-testid="send-button"]' },
        "chatgpt.com": { textarea: "#prompt-textarea", sendButton: 'button[data-testid="send-button"]' },
        "gemini.google.com": { textarea: "div.ql-editor", sendButton: ".send-button-container button" },
        "claude.ai": { textarea: 'div[contenteditable="true"].ProseMirror', sendButton: 'button[aria-label="Send message"]' }
    };

    const boundElements = new WeakSet();
    let modalContainer = null;

    // Set to false once we detect the extension was reloaded/uninstalled. After that we stop
    // intercepting so the user can keep using the page; they need to refresh to re-enable.
    let extensionContextValid = true;

    function isContextInvalidatedError(err) {
        return err && typeof err.message === 'string' && err.message.includes('Extension context invalidated');
    }

    function markContextInvalidated() {
        if (!extensionContextValid) return;
        extensionContextValid = false;
        console.warn("[Airlock] context invalidated — extension was reloaded. REFRESH THIS TAB to re-enable Airlock. Prompts are passing through unprotected until you do.");
    }

    // Category-specific remediation guidance shown in the smart-block modal.
    const BLOCK_GUIDANCE = {
        secrets: "Never paste live credentials into AI tools. Remove the key (and rotate it if it's real), then describe your setup without the secret.",
        financial: "Avoid sharing real financial identifiers. Use placeholder values or describe the scenario in general terms.",
        pii: "Replace personal identifiers with placeholders such as [name] or [email].",
        medical: "Avoid real patient identifiers — describe the case without protected health information.",
        custom: "This matches a custom data-protection rule set by your organization. Remove or rephrase the flagged content before sending."
    };

    // --- MODAL LOGIC ---
    function showModal(decision, reasons, callback, extras) {
        if (modalContainer) return;
        extras = extras || {};

        modalContainer = document.createElement("div");
        modalContainer.id = "airlock-modal-container";

        const isBlock = decision === "block";
        const isInfo = decision === "token_optimized";
        const primaryButtonText = isInfo ? "Send Optimized" : isBlock ? "Send Safe Version" : "Send Redacted";

        const modalEl = document.createElement("div");
        modalEl.className = "airlock-modal";

        const titleEl = document.createElement("div");
        let titleClass = "airlock-modal-title";
        titleClass += isBlock ? " block" : isInfo ? " info" : " redact";
        titleEl.className = titleClass;
        titleEl.textContent = isBlock
            ? "Airlock Blocked This Prompt"
            : isInfo ? "Airlock Optimized" : "Airlock Detected Data";

        const contentEl = document.createElement("div");
        contentEl.className = "airlock-modal-content";

        const pEl = document.createElement("p");
        pEl.textContent = isBlock
            ? "Your organization's policy blocks sending this data to AI tools. Detected:"
            : isInfo
                ? `Removed ~${extras.tokensSaved ? extras.tokensSaved : 0} tokens of filler from your prompt before sending.`
                : "Airlock recommends redacting the following sensitive data before sending:";

        contentEl.appendChild(pEl);

        if (!isInfo) {
            const ulEl = document.createElement("ul");
            for (const r of reasons) {
                const li = document.createElement("li");
                li.textContent = r;
                ulEl.appendChild(li);
            }
            contentEl.appendChild(ulEl);
        }

        // Smart-block remediation guidance (one tip per blocked category).
        if (isBlock && Array.isArray(extras.blockedCategories)) {
            for (const cat of extras.blockedCategories) {
                if (!BLOCK_GUIDANCE[cat]) continue;
                const tip = document.createElement("p");
                tip.className = "airlock-modal-guidance";
                tip.textContent = "💡 " + BLOCK_GUIDANCE[cat];
                contentEl.appendChild(tip);
            }
            const safeNote = document.createElement("p");
            safeNote.className = "airlock-modal-safenote";
            safeNote.textContent = "“Send Safe Version” will submit your prompt with the blocked data redacted.";
            contentEl.appendChild(safeNote);
        }

        if (!isInfo && !isBlock && extras.tokensSaved >= 1) {
            const tokenEl = document.createElement("p");
            tokenEl.className = "airlock-modal-tokens";
            const t = extras.tokensSaved;
            tokenEl.textContent = `Also removed ~${t} token${t !== 1 ? 's' : ''} of filler.`;
            contentEl.appendChild(tokenEl);
        }

        const buttonsEl = document.createElement("div");
        buttonsEl.className = "airlock-modal-buttons";

        const confirmBtn = document.createElement("button");
        confirmBtn.className = "airlock-modal-button airlock-button-primary";
        confirmBtn.textContent = primaryButtonText;

        // Every mode now has a Cancel (block included — the user can edit it themselves).
        const cancelBtn = document.createElement("button");
        cancelBtn.className = "airlock-modal-button airlock-button-secondary";
        cancelBtn.textContent = "Cancel";
        buttonsEl.appendChild(cancelBtn);
        cancelBtn.addEventListener("click", () => closeModal(false));

        buttonsEl.appendChild(confirmBtn);
        modalEl.appendChild(titleEl);
        modalEl.appendChild(contentEl);
        modalEl.appendChild(buttonsEl);
        modalContainer.appendChild(modalEl);
        document.body.appendChild(modalContainer);

        const closeModal = (result) => {
            modalContainer.remove();
            modalContainer = null;
            callback(result);
        };

        confirmBtn.addEventListener("click", () => closeModal(true));
    }

    function injectCSS() {
        const cssUrl = chrome.runtime.getURL("content-scripts/modal.css");
        if (document.querySelector(`link[href="${cssUrl}"]`)) return;
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.type = "text/css";
        link.href = cssUrl;
        document.head.appendChild(link);
        console.log("Airlock: Modal CSS injected.");
    }

    // --- INTERCEPTION AND MESSAGING LOGIC ---
    function handleIntercept(event, config, source) {
        if (window.__airlockBypassOnce) {
            window.__airlockBypassOnce = false;
            return;
        }
        // If the extension was reloaded, stop intercepting — let the page submit normally.
        if (!extensionContextValid) return;
        if (event.type === "keydown" && (event.key !== "Enter" || event.shiftKey)) return;

        event.preventDefault();
        event.stopImmediatePropagation();
        event.stopPropagation();

        const textarea = document.querySelector(config.textarea);
        const sendButton = document.querySelector(config.sendButton);

        if (!textarea) return;

        const promptText = (textarea.value !== undefined ? textarea.value : textarea.innerText || "").trim();

        if (!promptText) {
            return;
        }

        console.log("Airlock: Intercepted prompt. Disabling UI and sending for analysis.");
        textarea.disabled = true;
        if (sendButton) sendButton.disabled = true;

        const request = {
            type: "AIRLOCK_ANALYZE",
            url: window.location.href,
            host: window.location.hostname,
            promptText,
            source
        };

        let responded = false;
        const swTimeout = setTimeout(() => {
            if (responded) return;
            responded = true;
            console.error("Airlock: Service worker did not respond within 30s — re-enabling UI.");
            textarea.disabled = false;
            if (sendButton) sendButton.disabled = false;
        }, 30000);

        try {
            chrome.runtime.sendMessage(request, (response) => {
                if (responded) return;
                responded = true;
                clearTimeout(swTimeout);

                if (chrome.runtime.lastError) {
                    const msg = chrome.runtime.lastError.message || '';
                    if (msg.includes('Extension context invalidated') || msg.includes('Receiving end does not exist')) {
                        markContextInvalidated();
                        // Let the user's prompt through — they pressed Send, honor that.
                        programmaticSubmit(textarea, sendButton);
                        return;
                    }
                    console.error("Airlock: Message failed:", msg);
                    textarea.disabled = false;
                    if (sendButton) sendButton.disabled = false;
                    return;
                }

                if (response && response.type === "ANALYSIS_RESULT") {
                    handleDecision(response, textarea, sendButton);
                } else {
                    console.error("Airlock: Received invalid response from service worker.", response);
                    textarea.disabled = false;
                    if (sendButton) sendButton.disabled = false;
                }
            });
        } catch (err) {
            responded = true;
            clearTimeout(swTimeout);
            if (isContextInvalidatedError(err)) {
                markContextInvalidated();
                // Honor the user's Send action — submit the prompt as typed.
                programmaticSubmit(textarea, sendButton);
                return;
            }
            console.error("Airlock: Unexpected error sending to SW:", err);
            textarea.disabled = false;
            if (sendButton) sendButton.disabled = false;
        }
    }

    function handleDecision(response, textarea, sendButton) {
        const { decision, reasons, redactedText, redactionMap, tokensSaved, blockedCategories } = response;
        const placeholderCount = redactionMap ? Object.keys(redactionMap).length : 0;
        console.log(`[Airlock] decision received: ${decision} | tokensSaved=${tokensSaved || 0} | placeholders=${placeholderCount}`);

        const enableUI = () => {
            textarea.disabled = false;
            if (sendButton) sendButton.disabled = false;
        };

        const writeText = (newText) => {
            if (textarea.value !== undefined) {
                textarea.value = newText;
            } else {
                textarea.innerText = newText;
            }
        };

        if (decision === "block" || decision === "redact" || decision === "token_optimized") {
            showModal(decision, reasons || [], (ok) => {
                if (!ok) {
                    // Cancel (or "edit myself") — restore the UI, send nothing.
                    enableUI();
                    return;
                }

                // All three proceed by sending the safe/redacted/optimized text.
                // For "block", this is the one-click "Send Safe Version" path.
                if (redactedText) writeText(redactedText);

                programmaticSubmit(textarea, sendButton);

                if (redactionMap && Object.keys(redactionMap).length > 0) {
                    registerRedactionMap(redactionMap);
                }
            }, { tokensSaved, blockedCategories });
        } else {
            programmaticSubmit(textarea, sendButton);
        }
    }

    function programmaticSubmit(textarea, sendButton) {
        window.__airlockBypassOnce = true;
        textarea.disabled = false;
        if (sendButton) sendButton.disabled = false;

        if (sendButton) {
            setTimeout(() => {
                sendButton.click();
            }, 50);
        } else {
            const enterEvent = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
            textarea.dispatchEvent(enterEvent);
        }
    }

    // --- REINSERTION (REDACT-AND-REVEAL) ---
    // Shared accumulating map of all placeholder → original value pairs for THIS conversation.
    // The watcher reads it by reference, so newly redacted prompts are picked up live.
    let activeRedactionMap = {};
    let watcherActive = false;
    let badgeShown = false;

    // Reinjection happens in two phases:
    //  'awaiting'    — placeholders stay visible while the LLM streams; we wait until the answer
    //                  is genuinely complete (stop button gone, or DOM quiet), then reinject ONCE.
    //  'maintaining' — after that first pass, replace instantly on any change so React re-renders
    //                  that revert our text are corrected before paint (no flicker).
    let reinjectPhase = 'awaiting';
    let reinjectObserver = null;
    let lastMutationTime = 0;
    let completionTimer = null;

    const POLL_MS = 300;             // how often we poll for "LLM done"
    const BUTTON_GRACE_MS = 800;     // stop button gone for this long ⇒ answer done
    const QUIET_FALLBACK_MS = 3000;  // no DOM changes this long ⇒ answer done (if button undetected)
    const REFRESH_SETTLE_MS = 1500;  // after a page refresh, wait this long for content to render
    const MAX_WAIT_MS = 5 * 60 * 1000;

    // The LLM is producing output iff a "stop generating" control is present.
    const STOP_SELECTORS = [
        'button[data-testid="stop-button"]',      // ChatGPT
        'button[aria-label*="Stop" i]',           // Claude ("Stop response"), generic
        'button[mattooltip*="Stop" i]',           // Gemini (Angular Material tooltip)
        '[role="button"][aria-label*="Stop" i]'   // generic fallback
    ];
    function isLlmGenerating() {
        return STOP_SELECTORS.some(sel => {
            try { return !!document.querySelector(sel); } catch (e) { return false; }
        });
    }

    function mergeRedactionMap(newMap) {
        if (!newMap) return false;
        let changed = false;
        for (const [k, v] of Object.entries(newMap)) {
            if (activeRedactionMap[k] !== v) {
                activeRedactionMap[k] = v;
                changed = true;
            }
        }
        return changed;
    }

    // Key persistence by conversation (origin + pathname). Survives refresh within the
    // browser session; chrome.storage.session is in-memory and cleared when the browser closes,
    // so sensitive values are never written to disk.
    function conversationKey() {
        return 'airlock_map_' + window.location.origin + window.location.pathname;
    }

    function persistRedactionMap() {
        try {
            chrome.storage.session.set({ [conversationKey()]: activeRedactionMap });
        } catch (e) {
            if (isContextInvalidatedError(e)) markContextInvalidated();
        }
    }

    function loadPersistedMap() {
        try {
            const key = conversationKey();
            chrome.storage.session.get(key, (data) => {
                if (chrome.runtime.lastError) return;
                const stored = data && data[key];
                if (stored && Object.keys(stored).length > 0) {
                    mergeRedactionMap(stored);
                    console.log(`[Airlock] loaded ${Object.keys(stored).length} persisted placeholders for this conversation`);
                    // Reloaded conversation is static (no generation): let it render, then reinject once.
                    reinjectPhase = 'awaiting';
                    ensureReinsertionWatcher();
                    setTimeout(() => reinjectNow('page-refresh'), REFRESH_SETTLE_MS);
                }
            });
        } catch (e) {
            if (isContextInvalidatedError(e)) markContextInvalidated();
        }
    }

    function collectTextNodes(node, out) {
        if (node.nodeType === Node.TEXT_NODE) {
            out.push(node);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
            let n;
            while ((n = walker.nextNode())) out.push(n);
        }
    }

    function replaceInTextNode(textNode) {
        const original = textNode.nodeValue;
        if (!original || original.indexOf('[REDACTED_') === -1) return 0;
        let newText = original;
        let count = 0;
        for (const [placeholder, value] of Object.entries(activeRedactionMap)) {
            if (newText.includes(placeholder)) {
                newText = newText.split(placeholder).join(value);
                count++;
            }
        }
        if (newText !== original) {
            textNode.nodeValue = newText;
            return count;
        }
        return 0;
    }

    // Replace placeholders in the given text nodes without observing our own writes.
    function writeNodes(nodes) {
        if (!nodes.length) return 0;
        if (reinjectObserver) reinjectObserver.disconnect();
        let total = 0;
        for (const tn of nodes) total += replaceInTextNode(tn);
        if (reinjectObserver) reinjectObserver.observe(document.body, { subtree: true, childList: true, characterData: true });
        return total;
    }

    // One-pass reinjection over the whole page, then switch to silent maintenance.
    function reinjectNow(reason) {
        const all = [];
        collectTextNodes(document.body, all);
        const total = writeNodes(all);
        if (total > 0) {
            console.log(`[Airlock] LLM answer complete (via ${reason}) — reinjected ${total} placeholder(s).`);
            if (!badgeShown) {
                badgeShown = true;
                showReinsertionBadge(total);
            }
        }
        // After the first pass, React re-renders that revert our text are fixed instantly (no flicker).
        reinjectPhase = 'maintaining';
    }

    // Single persistent observer for the page. See reinjectPhase comment above for the two phases.
    function ensureReinsertionWatcher() {
        if (watcherActive) return;
        if (Object.keys(activeRedactionMap).length === 0) return;
        watcherActive = true;
        console.log(`[Airlock] reinsertion watcher active — ${Object.keys(activeRedactionMap).length} placeholders`);

        reinjectObserver = new MutationObserver((mutations) => {
            lastMutationTime = Date.now();
            // 'awaiting': leave placeholders visible while the LLM streams — do NOT replace yet.
            if (reinjectPhase !== 'maintaining') return;
            // 'maintaining': replace immediately on changed nodes only.
            const nodes = [];
            for (const m of mutations) {
                if (m.type === 'characterData') {
                    nodes.push(m.target);
                } else {
                    for (const added of m.addedNodes) collectTextNodes(added, nodes);
                }
            }
            writeNodes(nodes);
        });

        reinjectObserver.observe(document.body, { subtree: true, childList: true, characterData: true });

        // Safety disconnect after 30 minutes.
        setTimeout(() => {
            if (reinjectObserver) reinjectObserver.disconnect();
            watcherActive = false;
        }, 30 * 60 * 1000);
    }

    // Poll until the LLM has finished generating, then reinject once.
    // Primary signal: the "stop" button appeared (generation started) then disappeared.
    // Fallback: the DOM has been quiet long enough after some activity (stop button undetected).
    function startCompletionWatch() {
        clearInterval(completionTimer);
        let sawGenerating = false;
        let notGeneratingFor = 0;
        let elapsed = 0;
        let announced = false;
        lastMutationTime = Date.now();

        completionTimer = setInterval(() => {
            if (reinjectPhase === 'maintaining') { clearInterval(completionTimer); return; }
            elapsed += POLL_MS;

            const generating = isLlmGenerating();
            if (generating) {
                if (!announced) { announced = true; console.log('[Airlock] generation detected — waiting for completion…'); }
                sawGenerating = true;
                notGeneratingFor = 0;
            } else {
                notGeneratingFor += POLL_MS;
            }

            const quietFor = Date.now() - lastMutationTime;

            // Primary: we saw the stop button, and it's been gone (with the answer settled) a moment.
            if (sawGenerating && !generating && notGeneratingFor >= BUTTON_GRACE_MS) {
                clearInterval(completionTimer);
                reinjectNow('stop-button');
                return;
            }
            // Fallback: stop button never detected, but the answer streamed then went quiet.
            if (!sawGenerating && elapsed >= 2000 && quietFor >= QUIET_FALLBACK_MS) {
                clearInterval(completionTimer);
                reinjectNow('quiet-fallback');
                return;
            }
            // Hard safety.
            if (elapsed >= MAX_WAIT_MS) {
                clearInterval(completionTimer);
                reinjectNow('timeout');
            }
        }, POLL_MS);
    }

    function registerRedactionMap(redactionMap) {
        const changed = mergeRedactionMap(redactionMap);
        if (changed) persistRedactionMap();
        // Each new prompt's answer should wait for completion, then reinject in one pass.
        reinjectPhase = 'awaiting';
        badgeShown = false;
        ensureReinsertionWatcher();
        startCompletionWatch();
    }

    function showReinsertionBadge(count) {
        const existing = document.getElementById('airlock-reinsertion-badge');
        if (existing) existing.remove();

        const badge = document.createElement('div');
        badge.id = 'airlock-reinsertion-badge';
        badge.textContent = `Airlock restored ${count} item${count > 1 ? 's' : ''}`;
        document.body.appendChild(badge);

        // Force reflow so the fade-in transition triggers
        void badge.offsetWidth;
        badge.classList.add('airlock-badge-visible');

        setTimeout(() => {
            badge.classList.remove('airlock-badge-visible');
            setTimeout(() => badge.remove(), 600);
        }, 3000);
    }

    // --- INITIALIZATION LOGIC ---
    function initializeAirlockForSite() {
        const host = window.location.hostname;
        const config = siteConfigs[host];
        if (!config) return;

        injectCSS();

        // Re-apply reinjection for any placeholders persisted from before a page refresh.
        loadPersistedMap();

        console.log(`Airlock: Initializing poller for ${host}`);
        let attempts = 0;

        const intervalId = setInterval(() => {
            attempts++;
            const textarea = document.querySelector(config.textarea);
            const sendButton = document.querySelector(config.sendButton);

            if (textarea && !boundElements.has(textarea)) {
                console.log("Airlock: Attaching listener to textarea.");
                textarea.addEventListener("keydown", (e) => handleIntercept(e, config, "enter"), { capture: true });
                boundElements.add(textarea);
            }

            if (sendButton && !boundElements.has(sendButton)) {
                console.log("Airlock: Attaching listener to send button.");
                sendButton.addEventListener("click", (e) => handleIntercept(e, config, "click"), { capture: true });
                boundElements.add(sendButton);
            }

            if ((textarea && sendButton) || attempts > 20) {
                if (attempts > 20) console.warn("Airlock: Polling timed out. Some elements may not be hooked.");
                clearInterval(intervalId);
            }
        }, 500);
    }

    if (document.readyState === "interactive" || document.readyState === "complete") {
        initializeAirlockForSite();
    } else {
        window.addEventListener("DOMContentLoaded", initializeAirlockForSite, { once: true });
    }

})();
