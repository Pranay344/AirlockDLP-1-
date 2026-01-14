# Airlock DLP: On-Device Data Loss Prevention for Generative AI

Airlock DLP is a sophisticated Chrome extension designed to prevent sensitive data from being sent to large language models (LLMs) like ChatGPT, Google Gemini, and Anthropic Claude. It operates entirely on the client-side, using a powerful dual-engine system of a local AI model and regular expressions to detect and redact sensitive information in real-time—before it ever leaves your browser.

This on-device approach ensures maximum privacy and security, as no user data is ever sent to an external server for analysis.

## How It Works: A Dual-Engine Approach

Airlock DLP is built on a robust, dual-engine architecture to provide comprehensive data protection.

### 1. The AI Brain (Named Entity Recognition)

- **Technology:** Utilizes the `transformers.js` library to run a state-of-the-art Named Entity Recognition (NER) model (`Xenova/bert-base-multilingual-cased-ner-hrl`) directly in the browser.
- **Function:** This AI model is responsible for identifying contextual and unstructured sensitive data, such as:
    - `PER`: Person Names (e.g., "Arjun Sharma")
    - `LOC`: Locations (e.g., "New York")
    - `ORG`: Organizations (e.g., "Cybersun Inc.")
- **Performance:** The model runs inside a dedicated Web Worker (`ner-worker.js`), ensuring that the analysis does not block the main browser thread or slow down the user's experience. The model is loaded only once and reused for all subsequent analyses.

### 2. The Regex Brain (Pattern Matching)

- **Technology:** A curated set of highly-optimized regular expressions located in `shared/rules.js`.
- **Function:** This engine is designed to find structured and pattern-based sensitive data with surgical precision, including:
    - PAN Cards
    - Aadhaar Numbers
    - API Keys and Secrets
    - Credit Card Numbers (and other financial data)

### 3. The Central Nervous System (Orchestration & Redaction)

- **Technology:** The `background/service-worker.js` acts as the central coordinator for the entire extension.
- **Function:**
    1.  **Gathers Findings:** It receives analysis requests from the user's prompt and sends the text to both the AI brain and the Regex brain simultaneously.
    2.  **Intelligent Conflict Resolution:** It collects the findings from both engines and merges them into a single, de-duplicated list. The redaction logic is built to handle overlaps by calculating the start and end indices of all findings and merging any that intersect. This prevents the "nested redaction" errors seen in earlier versions.
    3.  **Builds from Scratch:** Instead of performing risky search-and-replace operations on the original text, it builds a brand new, clean string from scratch, inserting the `[REDACTED]` tags at the correct positions.

## Key Features

- **Completely On-Device:** All analysis happens locally. No user data is ever sent to a third-party server.
- **AI-Powered Detection:** Catches unstructured data like names and organizations that regex-only systems would miss.
- **Precision Regex Matching:** Accurately identifies well-defined patterns like government IDs and financial information.
- **Intelligent Conflict Resolution:** Smartly merges findings from both engines to ensure clean, accurate redactions without errors.
- **Privacy First:** Designed from the ground up to protect user privacy and prevent data leakage.
- **Real-time & High-Performance:** Analysis is nearly instantaneous and does not impact browser performance.

## Technology Stack

- **AI/ML:** Hugging Face `transformers.js`
- **AI Model:** `Xenova/bert-base-multilingual-cased-ner-hrl`
- **Extension Framework:** Manifest V3
- **Core Logic:** JavaScript (ESM)
- **Asynchronous Operations:** Web Workers, `async/await`, `Promise.all()`
