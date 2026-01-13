console.log("🛡️ Airlock Content Script: Initialized for one-time messaging.");

const siteConfigs = {
  "chat.openai.com": { textarea: "#prompt-textarea", sendButton: 'button[data-testid="send-button"]' },
  "chatgpt.com": { textarea: "#prompt-textarea", sendButton: 'button[data-testid="send-button"]' },
  "gemini.google.com": { textarea: "div.ql-editor", sendButton: ".send-button-container button" }
};

const boundElements = new WeakSet();
let modalContainer = null;

// --- MODAL LOGIC (UNCHANGED) START ---
function showModal(decision, reasons, callback) {
    if (modalContainer) return;

    modalContainer = document.createElement("div");
    modalContainer.id = "airlock-modal-container";

    const isBlock = decision === "block";
    const title = isBlock ? "Airlock Blocked Prompt" : "Airlock Detected Data";
    const titleClass = isBlock ? "" : "redact";
    const primaryButtonText = isBlock ? "Okay" : "Send Redacted";

    let modalHTML = `
    <div class="airlock-modal">
      <div class="airlock-modal-title ${titleClass}">${title}</div>
      <div class="airlock-modal-content">
        <p>${isBlock ? "This prompt was blocked for the following reasons:" : "Airlock recommends redacting the following sensitive data before sending:"}</p>
        <ul>
          ${reasons.map(r => `<li>${r}</li>`).join('')}
        </ul>
      </div>
      <div class="airlock-modal-buttons">
        ${!isBlock ? '<button class="airlock-modal-button airlock-button-secondary" id="airlock-cancel">Cancel</button>' : ''}
        <button class="airlock-modal-button airlock-button-primary" id="airlock-confirm">${primaryButtonText}</button>
      </div>
    </div>
  `;
    modalContainer.innerHTML = modalHTML;
    document.body.appendChild(modalContainer);

    const closeModal = (result) => {
        document.body.removeChild(modalContainer);
        modalContainer = null;
        callback(result);
    };

    document.getElementById("airlock-confirm").addEventListener("click", () => closeModal(true));
    if (!isBlock) {
        document.getElementById("airlock-cancel").addEventListener("click", () => closeModal(false));
    }
}

function injectCSS() {
    const cssUrl = chrome.runtime.getURL("content-scripts/modal.css");
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.type = "text/css";
    link.href = cssUrl;
    document.head.appendChild(link);
    console.log("Airlock: Modal CSS injected.");
}
// --- MODAL LOGIC (UNCHANGED) END ---

// --- INTERCEPTION AND MESSAGING LOGIC (REFACTORED) ---
function handleIntercept(event, config, source) {
    if (window.__airlockBypassOnce) {
        window.__airlockBypassOnce = false;
        return;
    }
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

    // Use one-time messaging
    chrome.runtime.sendMessage(request, (response) => {
        if (chrome.runtime.lastError) {
            console.error("Airlock: Message failed:", chrome.runtime.lastError.message);
            // Re-enable UI on failure
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
}

function handleDecision(response, textarea, sendButton) {
    const { decision, reasons, redactedText } = response;

    const enableUI = () => {
        textarea.disabled = false;
        if (sendButton) sendButton.disabled = false;
    };

    if (decision === "block" || decision === "redact") {
        showModal(decision, reasons, (ok) => {
            if (!ok) { // User clicked cancel
                enableUI();
                return;
            }

            if (decision === "redact") {
                const newText = redactedText || (textarea.value !== undefined ? textarea.value : textarea.innerText);
                if (textarea.value !== undefined) {
                    textarea.value = newText;
                } else {
                    textarea.innerText = newText;
                }
            }

            if (decision === "block") { // User clicked "Okay" on a block
                enableUI();
                return;
            }
            
            // If we are here, it means it was a redaction and user clicked "Send Redacted"
            programmaticSubmit(textarea, sendButton);
        });
    } else { // allow
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

// --- INITIALIZATION LOGIC (REFACTORED) ---
function initializeAirlockForSite() {
    const host = window.location.hostname;
    const config = siteConfigs[host];
    if (!config) return;

    injectCSS();

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
            if(attempts > 20) console.warn("Airlock: Polling timed out. Some elements may not be hooked.");
            clearInterval(intervalId);
        }
    }, 500);
}

// Start initialization when the DOM is ready.
if (document.readyState === "interactive" || document.readyState === "complete") {
    initializeAirlockForSite();
} else {
    window.addEventListener("DOMContentLoaded", initializeAirlockForSite, { once: true });
}
