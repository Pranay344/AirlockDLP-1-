# Firebase Studio

This is a NextJS starter in Firebase Studio.

To get started, take a look at src/app/page.tsx.

---

## Connecting a Browser Extension

The Airlock DLP console is designed to display data logged by a companion browser extension. To create the extension and connect it to this dashboard, follow these steps.

### 1. Get Your Firebase Configuration

Your extension will need to connect to the same Firebase project as this web application. In your extension's JavaScript files (likely the background script), use the following configuration object to initialize Firebase:

```javascript
// This is your project's public Firebase configuration.
// It is safe to use in client-side code like a browser extension.
const firebaseConfig = {
  "projectId": "studio-695576100-a1a18",
  "appId": "1:393902641360:web:3524e08ea2a4670da28ed5",
  "apiKey": "AIzaSyCLu1ELr4bjJMS1n1TBl8LVuStJKNF8RkI",
  "authDomain": "studio-695576100-a1a18.firebaseapp.com",
  "measurementId": "",
  "messagingSenderId": "393902641360"
};

// Initialize Firebase in your extension's background script
// Make sure to include the Firebase SDKs for app and firestore.
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc } from "firebase/firestore";

const firebaseApp = initializeApp(firebaseConfig);
const firestore = getFirestore(firebaseApp);
```

### 2. How to Log an Incident

From your extension's background script, you can write new incident logs to the `event_logs` collection. The dashboard will automatically pick up and display these new events.

Here is an example of how your extension would log an event after detecting a leak:

```javascript
// Example function in your extension's background script
async function logIncident(incidentData) {
  try {
    const eventLogsCollection = collection(firestore, "event_logs");
    await addDoc(eventLogsCollection, incidentData);
    console.log("Incident logged successfully!");
  } catch (error) {
    console.error("Error logging incident:", error);
  }
}

// ---

// When your content script detects a leak on a webpage,
// it sends a message to the background script.
// The background script then calls the logging function.

// Example incident object. The structure MUST match this.
const newIncident = {
  timestamp: new Date().toISOString(),
  domain: "chat.openai.com",
  userIdHash: "some_anonymous_user_hash", // Generate a unique, anonymous ID for the user
  types: ["PII", "Source Code"],
  action: "Blocked", // Can be "Blocked", "Warned", or "Allowed"
  riskScore: 95,
};

logIncident(newIncident);
```

By following these instructions, any data your extension logs will appear in the dashboard in real-time.