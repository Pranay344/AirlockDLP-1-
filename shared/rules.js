export const DLP_PATTERNS = {
    // --- PII ---
    credit_card: /\b(?:\d{4}[-\s]){3}\d{3,4}\b/g,
    ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
    phone_number: /(?<!\w)(?:(?:\+?1[ -]?)?\(?\d{3}\)?[ -]?\d{3}[ -]?\d{4}|(?:\+?91[ -]?|\(91\)[ -]?)?\d{5}[ -]?\d{5})(?!\w)/g,
    email_address: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    // Indian-specific
    aadhaar_number: /\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/g,
    pan_card: /\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/g,

    // --- Financial ---
    iban: /\b[A-Z]{2}[0-9]{2}[A-Za-z0-9]{4}[0-9]{7}([A-Za-z0-9]?){0,16}\b/g,

    // --- Cloud & Developer Secrets ---
    aws_access_key: /\b(AKIA|A3T|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{12,16}\b/g,
    stripe_key: /\bsk_(?:live|test)_[a-zA-Z0-9]{24,}/g,
    gcp_service_account: /"type":\s*"service_account"/g,
    azure_storage_key: /[a-zA-Z0-9+/]{86}==/g,
    github_token: /ghp_[a-zA-Z0-9]{36}/g,
    slack_token: /xox[pborsa]-[0-9]{10,12}-[0-9]{10,12}-[0-9]{10,12}-[a-z0-9]{32}/g,
    jwt: /\beyJ[a-zA-Z0-9-_]+\.[a-zA-Z0-9-_]+\.[a-zA-Z0-9-_.+/=]*\b/g
};

// Patterns only checked when a nearby keyword is present (prevents false positives on bare numbers/strings).
export const CONTEXT_PATTERNS = {
    us_bank_account: {
        pattern: /\b\d{8,12}\b/g,
        keywords: ['account', 'acct', 'a/c', 'bank account', 'deposit', 'savings', 'checking']
    },
    us_routing_number: {
        pattern: /\b\d{9}\b/g,
        keywords: ['routing', 'aba', 'rtg', 'wire transfer', 'ach']
    },
    // ICD codes gated on medical context to prevent 3-digit numbers (e.g. CVV, port, year) being flagged
    icd9_code: {
        pattern: /\b(?:\d{3}(?:\.\d{1,2})?(?![a-zA-Z%])|V\d{2}(?:\.\d{1,2})?|E\d{3}(?:\.\d)?)\b/g,
        keywords: ['icd', 'icd-9', 'diagnosis', 'dx', 'medical code', 'clinical', 'disease']
    },
    icd10_code: {
        pattern: /\b(?!B2B\b|B2C\b)[A-Z][0-9][0-9A-Z](?:\.[0-9A-Z]{1,4})?\b/g,
        keywords: ['icd', 'icd-10', 'diagnosis', 'dx', 'medical code', 'clinical', 'disease']
    },
    // AWS secret key: match the 40-char value AFTER the = sign.
    // Lookbehind (?<==) anchors to = without including it, so redactText boundary checks pass.
    aws_secret_key: {
        pattern: /(?<==)[A-Za-z0-9/+=]{40}/g,
        keywords: ['aws_secret_access_key', 'secret_access_key', 'secretaccesskey', 'aws secret']
    },
    cvv: {
        pattern: /\b\d{3,4}\b/g,
        keywords: ['cvv', 'cvc', 'cvc2', 'cvv2', 'security code', 'card verification', 'card security']
    }
};

export const SENSITIVE_KEYWORDS = [
    "password",
    "secret",
    "confidential",
    "apikey",
    "api_key"
];
