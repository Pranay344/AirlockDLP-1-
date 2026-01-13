export const DLP_PATTERNS = {
    credit_card: /\b(?:\d[ -]*?){13,16}\b/g,
    ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
    phone_number: /\b(?:\+?1[ -]?)?\(?\d{3}\)?[ -]?\d{3}[ -]?\d{4}\b/g,
    email_address: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    aws_access_key: /\b(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}\b/g,
};

export const SENSITIVE_KEYWORDS = [
    "password",
    "secret",
    "private key",
    "confidential",
    "internal use only"
];
