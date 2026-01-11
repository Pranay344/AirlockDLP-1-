/*
    Step 5: Tier 1 - The Regex Shield
    This file contains the regular expressions for our fast, Tier 1 scanning.
*/

export const DLP_PATTERNS = {
    "email": /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    "credit_card": /\b(?:\d[ -]*?){13,16}\b/g,
    "aws_access_key": /AKIA[0-9A-Z]{16}/g,
    "ssh_private_key": /-----BEGIN ((OPENSSH|RSA|DSA|EC) )?PRIVATE KEY-----/,
    "aadhaar_number": /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    "pan_number": /\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/g
};

export const SENSITIVE_KEYWORDS = [
    "password",
    "secret",
    "confidential"
];
