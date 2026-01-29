export const DLP_PATTERNS = {
    // --- PII ---
    credit_card: /\b(?:\d[ -]*?){13,16}\b/g,
    ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
    phone_number: /(?<!\w)(?:(?:\+?1[ -]?)?\(?\d{3}\)?[ -]?\d{3}[ -]?\d{4}|(?:\+?91[ -]?|\(91\)[ -]?)?\d{5}[ -]?\d{5})(?!\w)/g,
    email_address: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    // Indian-specific
    aadhaar_number: /\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/g,
    pan_card: /\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/g,

    // --- Health (FIXED: Tightened rules to reduce false positives) ---
    icd10_code: /\b(?!B2B\b|B2C\b)[A-Z][0-9][0-9A-Z](?:\.[0-9A-Z]{1,4})?\b/g,
    icd9_code: /\b(?:\d{3}(?:\.\d{1,2})?(?![a-zA-Z%])|V\d{2}(?:\.\d{1,2})?|E\d{3}(?:\.\d)?)\b/g,

    // --- Financial ---
    iban: /\b[A-Z]{2}[0-9]{2}[A-Za-z0-9]{4}[0-9]{7}([A-Za-z0-9]?){0,16}\b/g,
    us_bank_account: /\b\d{8,12}\b/g,
    us_routing_number: /\b\d{9}\b/g,

    // --- Cloud & Developer Secrets (Robust & Corrected) ---
    aws_access_key: /\b(AKIA|A3T|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{12,16}\b/g,
    gcp_service_account: /"type":\s*"service_account"/g,
    azure_storage_key: /[a-zA-Z0-9+/]{86}==/g,
    github_token: /ghp_[a-zA-Z0-9]{36}/g,
    slack_token: /xox[pborsa]-[0-9]{10,12}-[0-9]{10,12}-[0-9]{10,12}-[a-z0-9]{32}/g,
    jwt: /\beyJ[a-zA-Z0-9-_]+\.[a-zA-Z0-9-_]+\.[a-zA-Z0-9-_.+/=]*\b/g
};

export const SENSITIVE_KEYWORDS = [
    "password",
    "secret",
    "confidential",
    "apikey",
    "api_key",
    "token"
];
