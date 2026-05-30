# Airlock DLP — Session Handoff

## Project Overview

**Airlock DLP** is a Chrome MV3 extension that intercepts prompts on AI chat platforms (ChatGPT, Claude.ai, Gemini) and detects / redacts sensitive data (PII, secrets, financial data) before it leaves the browser.

- **Version:** 1.0.1
- **Context:** Selected for Boeing/IISc Build 2026 competition. Target: ₹10 lakh funding. Pitching as a universal enterprise DLP layer with DPDP Act 2023 compliance.
- **Owner email:** pranaysaxena344@gmail.com

---

## Architecture

```
User types prompt
      ↓
content-scripts/main.js        ← injected into AI chat pages
  intercepts keydown/click
      ↓
background/service-worker.js   ← Chrome MV3 service worker
  parallel analysis:
    ├── analyzeTextLocally()   ← regex DLP_PATTERNS + CONTEXT_PATTERNS + SENSITIVE_KEYWORDS
    └── performNerAnalysis()   ← sends to offscreen doc
              ↓
    offscreen/offscreen.js     ← offscreen document (hosts the Web Worker for WASM)
              ↓
    workers/ner-worker.js      ← BERT NER via Transformers.js (Xenova/bert-base-multilingual-cased-ner-hrl)
              ↑
  findings merged, deduped, blacklist-filtered
  redactText() replaces matched spans with [REDACTED_TYPE]
      ↓
  sendResponse({ decision, reasons, redactedText })
      ↓
content-scripts/main.js
  shows modal → user confirms → programmaticSubmit()
```

**Why offscreen document?** Chrome MV3 service workers cannot run WASM directly. The offscreen document acts as a WASM host, keeping the worker alive and managing the Web Worker lifecycle.

---

## File Map

| File | Role |
|---|---|
| `manifest.json` | MV3 manifest, permissions, CSP |
| `shared/rules.js` | All DLP pattern definitions (single source of truth) |
| `background/service-worker.js` | Orchestrator: queues requests, runs parallel analysis, merges/dedupes/redacts findings |
| `content-scripts/main.js` | Page injection: intercepts submit, shows modal, does programmatic submit |
| `content-scripts/modal.css` | Modal styles |
| `offscreen/offscreen.html` | Minimal HTML shell to host the offscreen document |
| `offscreen/offscreen.js` | Receives analysis requests, routes to NER worker, handles timeouts |
| `workers/ner-worker.js` | BERT NER pipeline, BIO tag reconstruction, echoes requestId |
| `vendor/transformers.min.js` | Bundled Transformers.js (Xenova) |

---

## What Was Built / Fixed This Session

### 1. IIFE guard on content script (`content-scripts/main.js`)
**Problem:** Chrome injects `main.js` at `document_start` AND the service worker re-injects it on SPA navigation (via `chrome.scripting.executeScript`). Second injection caused `SyntaxError: Identifier 'siteConfigs' has already been declared` and broke interception.

**Fix:** Wrapped entire file in:
```js
(function () {
    if (window.__airlockInitialized) return;
    window.__airlockInitialized = true;
    // ... all code
})();
```

### 2. claude.ai support added (`content-scripts/main.js`)
```js
"claude.ai": {
    textarea: 'div[contenteditable="true"].ProseMirror',
    sendButton: 'button[aria-label="Send message"]'
}
```

### 3. XSS fix in modal (`content-scripts/main.js`)
Modal previously used `innerHTML` to render user-supplied reason strings. Rewrote modal construction to use `createElement` + `textContent` only.

### 4. CVV false positive from ICD9 pattern
**Problem:** ICD9 pattern `/\b\d{3}...\b/g` matched any 3-digit number — CVV `000`, port `443`, year `2024` all triggered it.

**Fix:** Moved ICD codes to `CONTEXT_PATTERNS` gated on medical keywords (`['icd', 'diagnosis', 'dx', 'clinical', 'disease']`). Bare numbers no longer match.

### 5. CONTEXT_PATTERNS architecture (`shared/rules.js`)
Added a new export `CONTEXT_PATTERNS` — patterns only evaluated when a relevant keyword appears in the text. Prevents false positives on ambiguous number formats.

Current context-gated patterns:
- `us_bank_account` — 8–12 digit numbers, gated on `account/acct/savings/checking`
- `us_routing_number` — 9-digit numbers, gated on `routing/aba/ach`
- `icd9_code` — medical billing codes, gated on `icd/diagnosis/clinical`
- `icd10_code` — ICD-10 codes (`A00.0` format), gated on `icd/diagnosis/clinical`
- `aws_secret_key` — 40-char base64 after `=`, gated on `aws_secret_access_key` etc.
- `cvv` — 3–4 digit numbers, gated on `cvv/cvc/cvc2/security code` ← **added last**

### 6. AWS Secret Key redaction fix (`shared/rules.js`)
**Problem:** Pattern `/[A-Za-z0-9/+=]{40}/g` matched starting at the `=` sign, so `matchedText = "=wJalrX..."`. Then `redactText`'s lookbehind `(?<![a-zA-Z0-9_])` saw `Y` (last char of `_KEY`) before `=` → boundary check failed → no redaction.

**Fix:** `(?<==)` lookbehind — zero-width assertion anchors after `=` without including it in the match. Match now starts at `w`, char before match is `=` (not alphanumeric) → boundary passes.
```js
aws_secret_key: {
    pattern: /(?<==)[A-Za-z0-9/+=]{40}/g,
    keywords: ['aws_secret_access_key', 'secret_access_key', 'secretaccesskey', 'aws secret']
}
```

### 7. NER blacklists extended (`background/service-worker.js`)
**PERSON blacklist** — added label words that BERT absorbs into adjacent names:
```
'aadhaar', 'pan', 'holder', 'admin', 'contact', 'support', 'backup',
'key', 'id', 'policy', 'region', 'environment', 'gateway', 'timestamp',
'primary', 'secondary', 'internal', 'external', 'access', 'secret'
```

**ORG blacklist** — added tech acronyms NER incorrectly flags as organizations:
```
'iam', 'aws', 'api', 'sdk', 'gcp', 'azure', 'dpdp', 'kyc', 'stripe', 'ach'
```

### 8. NER 3-word entity augmentation fix (`background/service-worker.js`)
**Problem:** "Pranay Saxena Aadhaar" was detected as a PER entity by BERT. Augmentation split it into `["Pranay", "Saxena", "Aadhaar"]` and all three were redacted — including "Aadhaar" as PERSON everywhere in the text.

**Fix:** Augmentation (splitting full names into first/last) only runs on **exactly 2-word** entities. 3+ word entities are kept as-is and filtered if any individual word is in the blacklist.
```js
if (parts.length === 2) {
    // split into first + last
}
// 3+ word: kept as full entity, filtered below by per-word blacklist check
```

### 9. Set deduplication of findings objects (`background/service-worker.js`)
**Problem:** `new Set(objects)` uses reference equality — never actually deduplicates object findings.

**Fix:** Key-based dedup using `type:matchedText` string key:
```js
const seen = new Set();
const dedupedNer = filteredNerFindings.filter(f => {
    const key = `${f.type}:${f.matchedText}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
});
```

### 10. Sensitive keyword warnings don't get redacted (`background/service-worker.js`)
Keywords like `password`, `secret`, `api_key` trigger a warning in the modal but should NOT be replaced with `[REDACTED_SENSITIVE_KEYWORD]` in the text — only the value after them is sensitive.

**Fix:** Keyword findings have `redact: false`. Redaction step filters them out:
```js
const findingsToRedact = allFindings.filter(f => f.redact !== false);
const redactedPrompt = redactText(request.promptText, findingsToRedact);
```

### 11. requestId-based routing in NER worker (`offscreen/offscreen.js`, `workers/ner-worker.js`)
Added `requestId` counter to prevent concurrent analysis requests from cross-matching responses. Worker echoes back `requestId`; offscreen one-shot listener only resolves on matching ID. 15-second timeout added.

### 12. CVV masking (`shared/rules.js`) ← last thing done
Added `cvv` to CONTEXT_PATTERNS:
```js
cvv: {
    pattern: /\b\d{3,4}\b/g,
    keywords: ['cvv', 'cvc', 'cvc2', 'cvv2', 'security code', 'card verification', 'card security']
}
```

---

## Current Detection Coverage

| Category | Patterns |
|---|---|
| PII | credit_card, ssn, phone_number (US + Indian), email_address, aadhaar_number, pan_card |
| Financial | iban, cvv (context-gated), us_bank_account (context-gated), us_routing_number (context-gated) |
| Medical | icd9_code (context-gated), icd10_code (context-gated) |
| Cloud secrets | aws_access_key, aws_secret_key (context-gated), stripe_key, gcp_service_account, azure_storage_key, github_token, slack_token, jwt |
| NER (BERT) | ner_PER (persons), ner_ORG (organizations), ner_LOC (locations) |
| Keyword warnings | password, secret, confidential, apikey, api_key |

---

## Demo Prompt (use this to verify everything works)

```
Hey, I need help with my AWS setup. Here are my credentials:
AWS_ACCESS_KEY_ID: AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
Is the IAM policy correct?

My name is Pranay Saxena and my email is pranay@example.com.
My Aadhaar is 1234 5678 9012 and PAN is ABCDE1234F.
Phone: +91 98765 43210

Credit card: 4111 1111 1111 1111, CVV: 782, expiry 12/26

GitHub token: ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890

password: mysecretpass123
```

**Expected output:**
- `AKIAIOSFODNN7EXAMPLE` → `[REDACTED_AWS_ACCESS_KEY]`
- `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` → `[REDACTED_AWS_SECRET_KEY]`
- `IAM` → NOT redacted (in ORG blacklist)
- `Pranay Saxena` → `[REDACTED_PERSON]`
- `pranay@example.com` → `[REDACTED_EMAIL_ADDRESS]`
- `1234 5678 9012` → `[REDACTED_AADHAAR_NUMBER]`
- `ABCDE1234F` → `[REDACTED_PAN_CARD]`
- `+91 98765 43210` → `[REDACTED_PHONE_NUMBER]`
- `4111 1111 1111 1111` → `[REDACTED_CREDIT_CARD]`
- `782` → `[REDACTED_CVV]`
- `ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890` → `[REDACTED_GITHUB_TOKEN]`
- `password:` → modal warning (NOT redacted in text)

---

## Known Limitations / Things Not Yet Done

1. **No backend / admin dashboard** — all analysis is 100% local in-browser. No audit logs, no policy management, no enterprise MDM config. This is the next major milestone for enterprise distribution.
2. **DPDP Act reporting** — DPDP compliance dashboard is planned but not started.
3. **NER quality** — BERT multilingual model is decent but not perfect. High-confidence entity detection would require a fine-tuned model or a fallback heuristic layer.
4. **Popup/options UI** — no extension popup yet. No way for users to toggle patterns on/off.
5. **`redactText` does not update contenteditable correctly** — for Gemini and Claude.ai which use `div[contenteditable]`, setting `textarea.innerText` works but loses formatting and may not trigger React/framework state updates. `programmaticSubmit` re-fires the click which works around this in practice, but it's fragile.
6. **No test suite** — all testing done manually with demo prompt in browser console. No unit tests for `analyzeTextLocally`, `redactText`, or the NER pipeline.

---

## Next Session Starting Point

The codebase is in a working, tested state. The immediate next steps in priority order:

1. **Fix contenteditable redaction for Gemini/Claude.ai** — use `InputEvent` dispatch instead of `innerText` assignment to properly trigger framework state.
2. **Add extension popup** — simple toggle + last-detection summary.
3. **Start backend API** — Node/Express + Postgres for audit logs, policy rules, multi-tenant org support (needed for enterprise pitch at Build 2026).
4. **Write unit tests** — at minimum for `analyzeTextLocally` and `redactText` in shared/rules.js.
