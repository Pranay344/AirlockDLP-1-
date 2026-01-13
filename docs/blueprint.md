# **App Name**: Airlock DLP

## Core Features:

- DOM Interception: Intercept user send intent (keydown, click, paste) in target LLM web UIs using capture-phase listeners and prevent data exfiltration.
- Local Scanner Engine: Scan composer text using regex tier (fast) and optional NER tier (Transformers.js in Web Worker) to identify and redact sensitive data based on a defined ruleset.
- Airlock Overlay UI: Display an inline overlay UI near the composer to inform the user about detected sensitive items, allowing them to redact & continue, review, or bypass (session-only).
- Local Event Logging: Keep a local ring buffer of the last 50 events (timestamp, domain, types[], action, mode, bypassUsed) in chrome.storage.local for auditing.
- Optional Firebase Metadata Logging: Log stateless metadata packets (timestamp, userIdHash, domain, leakTypes, action, riskScore) to Firebase for aggregate risk analysis.
- Popup + Options UI: Provide a popup UI for enabling/disabling the extension, toggling demo mode and strict vs. soft mode, and viewing recent events. Also, provide an options page for rule editing, domain allowlisting, and toggling NER and Firebase logging.
- Airlock Console Dashboard: Provide dashboard views on a web UI using Firestore aggregate event metadata for trends on total blocks/warns/bypass, trends by domain, trends by leak type, risk score (computed from types + action). The dashboard includes an Incident Viewer and a Policy Pack Viewer. Uses AI (Gemini, Genkit) only for demo explanations, summaries, and optional rewrite flows; never for content inspection or enforcement.

## Style Guidelines:

- Primary color: Deep teal (#008080), conveying security, trustworthiness, and sophistication, but without being cliche.
- Background color: Light grayish-teal (#E0F8F8), creating a clean and unobtrusive backdrop.
- Accent color: Soft gold (#D4AF37) for highlighting critical elements and calls to action, lending a sense of importance and credibility.
- Headline font: 'Space Grotesk', sans-serif. A modern font, which perfectly complements a functional tone.
- Body font: 'Inter', sans-serif. Readable for UIs and pairs well with the Headline font, it supports a friendly professional style. Note: currently only Google Fonts are supported.
- Code font: 'Source Code Pro' for displaying code snippets. Note: currently only Google Fonts are supported.
- Use clear and consistent icons from a minimalist set to represent different data types and actions (e.g., lock, warning, info, etc.).
- Maintain a clean and structured layout with clear visual hierarchy. Prioritize key information and actions. Use whitespace effectively.
- Employ subtle animations to provide feedback and guide the user, such as fade-in effects for overlays or progress indicators during scanning.