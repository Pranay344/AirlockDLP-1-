# AirlockDLP: On-Device Data Loss Prevention Chrome Extension

AirlockDLP is a sophisticated Chrome extension designed to prevent sensitive data from being exfiltrated through web browsers. It operates entirely on the client-side, using a powerful combination of local AI models and regular expressions to detect and redact sensitive information in real-time before it can be sent to a web server. 

This approach ensures maximum privacy and performance, as no user data ever leaves the local machine for analysis.

## Core Features

- **On-Device AI Analysis:** Utilizes a state-of-the-art Named Entity Recognition (NER) model (`Xenova/bert-base-multilingual-cased-ner-hrl`) running directly in the browser to identify entities like People (`PER`), Organizations (`ORG`), and Locations (`LOC`).
- **Multi-Engine Redaction:** Combines the power of AI with traditional regex-based DLP patterns (`rules.js`) to detect a wide range of sensitive data, from names and companies to PAN cards and Aadhaar numbers.
- **Real-Time & Proactive:** Intercepts outgoing data from web forms and redacts it *before* the network request is made, offering proactive protection.
- **Privacy-First Architecture:** All analysis is performed locally. No sensitive user input is ever sent to an external server, ensuring complete user privacy.
- **High-Performance Background Processing:** Leverages Web Workers and Offscreen Documents to run the AI model in the background, preventing any impact on browser performance or UI responsiveness.
- **Intelligent Redaction Logic:** Implements a robust, index-based redaction algorithm that correctly handles overlapping and nested findings, preventing corrupted or incomplete redactions.

## How It Works

AirlockDLP is built on a modern, decoupled architecture designed for security and performance within the Chrome extension environment.

1.  **Content Script (`main.js`):** This script is injected into web pages and attaches listeners to input fields. When a user types, it captures the text.

2.  **Service Worker (`service-worker.js`):** This is the central orchestrator. It receives text from the content script and dispatches it for analysis. It manages a queue to process analysis requests sequentially.

3.  **The Analysis Engines:**
    *   **The AI Brain (`ner-worker.js`):** A dedicated Web Worker hosts the `transformers.js` library and the NER model. It receives text, performs AI-based analysis, and returns a list of found entities (persons, organizations, locations). Using a singleton pattern ensures the model is loaded only once.
    *   **The Regex Brain (`rules.js`):** A set of predefined regular expressions for detecting common sensitive data patterns (e.g., PAN cards, Aadhaar numbers, credit card numbers).

4.  **The Offscreen Bridge (`offscreen.js`):** Chrome Service Workers cannot directly create Web Workers. This offscreen document acts as a simple, efficient bridge, forwarding analysis requests from the service worker to the `ner-worker.js`.

5.  **The Redaction Engine (`service-worker.js`):** After receiving findings from both the AI and Regex brains, the service worker performs the final, critical step. It uses a robust, index-based algorithm to:
    a.  Calculate the start and end positions of all unique findings.
    b.  Merge any overlapping findings (e.g., choosing "Arjun Sharma" over just "Sharma").
    c.  Rebuild the original text from scratch, inserting `[REDACTED]` tags at the appropriate positions.

This ensures a clean, accurate, and non-destructive redaction process.

## Technology Stack

- **Manifest V3:** The latest standard for Chrome extensions, ensuring enhanced security and performance.
- **JavaScript (ES6+):** The core language for the extension's logic.
- **Hugging Face Transformers.js:** The library that enables running powerful AI models directly in the browser.
- **Web Workers:** Used for running the computationally intensive AI analysis in a background thread.
- **Offscreen Documents:** A Manifest V3 feature used to bridge communication between the service worker and the web worker.

## Getting Started

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/Pranay344/AirlockDLP-1-.git
    ```

2.  **Load the extension in Chrome:**
    *   Open Chrome and navigate to `chrome://extensions`.
    *   Enable "Developer mode" using the toggle in the top-right corner.
    *   Click the "Load unpacked" button.
    *   Select the `airlock-extension` directory from the cloned repository.

3.  **Test the extension:**
    *   Navigate to any web page with a text input field (e.g., a search engine, a notes app).
    *   Type or paste the following text:
        > "The application for Mr. Arjun Sharma is complete. Please verify his PAN ABCDE1234F and Aadhaar number 9876 5432 1098 before final submission."
    *   The extension will analyze the text and present a redaction confirmation. The final text should appear as:
        > "The application for Mr. [REDACTED_NER_PER] is complete. Please verify his PAN [REDACTED_PAN_CARD] and Aadhaar number [REDACTED_AADHAAR_NUMBER] before final submission."
