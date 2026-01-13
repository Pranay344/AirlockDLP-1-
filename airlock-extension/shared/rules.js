/*
    Step 5: Tier 1 - The Regex Shield
    This file contains the regular expressions for our fast, Tier 1 scanning.
    These have been expanded to include more enterprise-grade patterns.
*/

export const DLP_PATTERNS = {
    // --- Original Patterns ---
    "email": /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    "credit_card": /\b(?:\d[ -]*?){13,16}\b/g,
    "ssh_private_key": /-----BEGIN ((OPENSSH|RSA|DSA|EC) )?PRIVATE KEY-----/,
    
    // --- Indian PII ---
    "aadhaar_number": /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    "pan_number": /\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/g,

    // --- International PII & Generic ---
    "us_ssn": /\b\d{3}-\d{2}-\d{4}\b/g,
    "phone_number": /(?:\+\d{1,3}[ -]?)?\(?\d{3}\)?[ -]?\d{3}[ -]?\d{4}/g,

    // --- Financial ---
    "iban": /\b[A-Z]{2}\d{2}[\d\w]{11,30}\b/g,

    // --- Cloud & Developer Secrets (IMPROVED) ---
    "aws_access_key": /\b(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{15,}\b/g,
    "gcp_service_account": /\"type\": \"service_account\"/g,
    "azure_storage_key": /[a-zA-Z0-9+/]{86}==/g,
    "github_token": /ghp_[a-zA-Z0-9]{36}/g,
    "slack_token": /xox[pborsa]-[0-9]{10,12}-[0-9]{10,12}-[0-9]{10,12}-[a-z0-9]{32}/g,
    "jwt": /\beyJ[a-zA-Z0-9-_]+\.[a-zA-Z0-9-_]+\.[a-zA-Z0-9-_.+/=]*\b/g
};

export const SENSITIVE_KEYWORDS = [
    "password",
    "secret",
    "confidential",
    "apikey",
    "api_key",
    "token"
];
