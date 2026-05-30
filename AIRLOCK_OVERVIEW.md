# Airlock — What It Is Right Now

_Current-state overview · last updated 2026-05-29_

## One-liner

**Airlock is an on-device AI compliance & DLP layer.** It sits between employees and AI chat tools (ChatGPT, Claude, Gemini), detects and redacts sensitive data **before it leaves the browser**, optionally hard-blocks the highest-risk data, trims wasteful tokens, and gives admins an audit dashboard + compliance reports — all while the actual sensitive values never leave the user's machine.

**Positioning:** "AI compliance that doesn't slow your team down." Built for the Boeing/IISc Build 2026 program (DPDP/GDPR/EU-AI-Act angle).

---

## How it works (end-to-end flow)

```
Employee types a prompt in ChatGPT / Claude / Gemini
      ↓  (content script intercepts on Send)
Service worker analyzes the prompt LOCALLY:
   • Token optimizer strips boundary filler
   • Regex DLP (PII, secrets, financial, medical)
   • BERT NER (persons / orgs / locations) via offscreen WASM
   • Admin custom rules (keyword/regex, dept-scoped)
      ↓
Decision: allow | token_optimized | redact | block
   • redact  → placeholders [REDACTED_TYPE_N], modal asks to confirm
   • block   → smart-block modal: reason + guidance + "Send Safe Version"
      ↓  (user confirms → safe/redacted text submitted to the LLM)
LLM only ever sees placeholders, never the real data
      ↓
Reinjection: when the answer finishes, placeholders are swapped
back to real values in the reply (except secrets) for readability
      ↓
Metadata-only event (counts, categories, tokens, dept) → backend
      ↓
Admin dashboard: live stats, per-employee/department, compliance reports
```

---

## The three components

### 1. Browser extension (Chrome MV3) — the "stop engine"
Runs entirely on-device. Intercepts prompts, runs the full detection/redaction engine, shows the modals, handles reinjection. Works standalone with zero install beyond the extension.

- `content-scripts/main.js` — page injection, prompt interception, modals (redact / smart-block / optimized), reinjection watcher, extension-context guard.
- `background/service-worker.js` — orchestrator: compress → analyze (regex + NER + custom rules) → decide → redact → report telemetry; keepalive; settings fetch.
- `offscreen/offscreen.js` + `workers/ner-worker.js` — host the BERT NER model (Transformers.js WASM) outside the service worker.
- `popup/` — employee config: work email + org code + department + connection status.
- `shared/` — pure, unit-tested engine: `rules.js` (patterns), `engine.js` (detect/redact/NER post-processing/custom rules), `compressor.js` (token optimizer), `categories.js` (type→category map).

### 2. Backend (Node + Express + SQLite) — `/server`
Local, self-contained (`npm install && npm start` on `http://localhost:4000`). No external accounts.

- Real auth: signup/login with **bcrypt** password hashing + **JWT**; each org gets a shareable 8-char **org code**.
- Telemetry ingest (`POST /api/events`) — **metadata only**.
- Aggregation: totals, 14-day timeseries, by-category, by-department, per-employee, recent feed.
- Settings store: feature toggles, block categories, departments, custom rules.
- Compliance report endpoint (date-ranged).
- Serves the dashboard.

### 3. Admin dashboard (vanilla JS + Chart.js) — `/dashboard`
Multi-page SPA served at `http://localhost:4000`:
- **Dashboard** — stat cards, activity area chart, decision donut, category donut, activity-by-department, live recent feed (auto-refresh 10s).
- **People** — per-employee table (click for detail), top-employees bar chart.
- **Reports** — compliance report (regulatory mapping, summary, per-dept/employee), **Export PDF** (print-to-PDF) + **Download CSV**.
- **Rules** — manage departments + build custom keyword/regex rules scoped to all/a department.
- **Settings** — feature toggles, smart-block categories, org info + code.
- **Contact** — contact form (mailto) + support emails.

---

## Feature inventory

| Feature | Status | What it does |
|---|---|---|
| **PII redaction** | ✅ | Email, phone (US + Indian), SSN, Aadhaar, PAN, credit card → numbered placeholders |
| **Secret detection** | ✅ | AWS access/secret keys, GitHub/Slack/Stripe tokens, GCP/Azure keys, JWT |
| **Financial / medical** | ✅ | IBAN, bank account, routing, CVV (context-gated); ICD-9/ICD-10 |
| **NER** | ✅ | BERT multilingual — persons, orgs, locations (with blacklist noise filtering) |
| **Numbered placeholders** | ✅ | Same value → same placeholder; different values → distinct numbers |
| **Reinjection (redact-and-reveal)** | ✅ | Real values restored in the LLM reply after it finishes; waits for completion (stop-button + quiet fallback); survives page refresh (session storage); **never reveals secrets** |
| **Smart block** | ✅ | Hard-stop for configured categories; modal shows reason + remediation tip + one-click "Send Safe Version" |
| **Token optimizer** | ✅ | Sentence-level boundary filler stripping (greetings/sign-offs); meaning-preserving, never rewrites content |
| **Custom rules engine** | ✅ | Admin keyword/regex rules, action redact/block |
| **Department policies** | ✅ | Rules scoped to a department; employee self-selects department; per-department analytics |
| **Admin dashboard** | ✅ | Auth, live stats, charts, per-employee/department |
| **Compliance reports** | ✅ | Date-ranged, DPDP/GDPR/EU-AI-Act control mapping, PDF + CSV export |
| **Feature toggles** | ✅ | Admin turns NER / token-opt / reinjection / per-category redaction / per-category block on/off org-wide |
| **Reliability** | ✅ | Keepalive alarm, offscreen warmup, cold-start graceful degrade, context-invalidated guard |

---

## Detection coverage (built-in)

- **PII:** credit_card, ssn, phone_number, email_address, aadhaar_number, pan_card
- **Secrets:** aws_access_key, aws_secret_key (context-gated), stripe_key, gcp_service_account, azure_storage_key, github_token, slack_token, jwt
- **Financial:** iban, us_bank_account, us_routing_number, cvv (context-gated)
- **Medical:** icd9_code, icd10_code (context-gated)
- **NER:** persons, organizations, locations
- **Keyword warnings:** password, secret, confidential, apikey, api_key (flag, not redacted)
- **Custom:** any admin-defined keyword/regex rule

---

## Privacy model (the differentiator)

- **All detection, redaction, and reinjection happen on-device** (in the browser). The real sensitive values never reach the backend or the LLM.
- The backend/audit log stores **only metadata**: decision type, finding counts, category groups, tokens saved, host, department, timestamp — **never** prompt text or the sensitive values.
- Reinjection mapping (real values) lives only in `chrome.storage.session` (in-memory, cleared when the browser closes; never written to disk).
- This "nothing sensitive leaves the device" stance is a genuine advantage over cloud DLP.

---

## Tech stack

- **Extension:** Chrome Manifest V3, vanilla JS, Transformers.js (`Xenova/bert-base-multilingual-cased-ner-hrl`) running as WASM in an offscreen document.
- **Backend:** Node + Express + better-sqlite3, bcryptjs, jsonwebtoken.
- **Dashboard:** vanilla JS + Chart.js (bundled locally, no CDN).
- **Tests:** `test/engine.test.mjs` (28 passing) covering the pure engine — compression, redaction, reinjection round-trip, NER post-processing, custom rules.

---

## Architecture decisions

- **Extension-only for now.** A desktop app (heavy lifting in a persistent native process) is the planned production evolution but is **deferred until after the Build 2026 demo** — the demo's zero-install story is more valuable. The engine is pure JS, so the pivot stays easy.
- **Rejected:** local TLS-intercepting proxy (requires installing a root CA — invasive, cert-pinning issues) and "encrypt-then-send-to-LLM" (the model can't read encrypted data — Airlock **redacts/masks** instead).

---

## How to run

```bash
# 1. Backend + dashboard
cd server
npm install
npm start              # → http://localhost:4000

# 2. Dashboard: open http://localhost:4000 → Sign up → note the org code
# 3. Extension: chrome://extensions → Load unpacked → select the repo root
# 4. Extension popup → enter work email + org code + department → Save & Connect
# 5. Use ChatGPT / Claude / Gemini → Airlock intercepts; dashboard fills with activity
```

---

## Known limitations / not yet done

- **NER cold start:** the MV3 service worker can be killed when idle; the first prompt after idle may reload the BERT model (mitigated by keepalive + warmup, not eliminated). The desktop-app pivot would remove this.
- **No employee login** — employees self-declare email + department in the popup (no password/SSO yet).
- **No real-time alert push** — block events are logged + shown in the dashboard, but there's no Slack/email webhook yet.
- **No token-cost governance** — we measure tokens *saved*, not tokens *used* / $ spend / budgets (planned).
- **Department "topic" enforcement** is deliberately keyword/regex only — no AI topic-classification (avoids false positives).
- **Browser coverage** — ChatGPT, Claude.ai, Gemini (the configured sites).

---

## Likely next steps

1. Real **alerts** (Slack/email webhook) on block events.
2. **Token cost governance** — measure tokens used, $ spend per employee/department, budgets + overspend alerts, large-paste nudge.
3. **Desktop app** pivot (post-demo) — native persistent NER, no cold start.
4. Employee **SSO/identity** for stronger attribution.
