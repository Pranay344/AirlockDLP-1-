// Airlock detection + redaction engine (pure logic, no chrome.* dependencies).
// Extracted so it can be unit-tested in Node without a browser.

import { DLP_PATTERNS, CONTEXT_PATTERNS, SENSITIVE_KEYWORDS } from './rules.js';

export const NER_PERSON_BLACKLIST = [
    // Common words / pronouns
    'my', 'i', 'a', 'an', 'the', 'is', 'in', 'it', 'to', 'and', 'you', 'he', 'she',
    'they', 'we', 'me', 'him', 'her', 'us', 'them', 'was', 'are', 'be', 'has', 'had',
    'do', 'does', 'did', 'for', 'of', 'at', 'by', 'on', 'with', 'from', 'as', 'this', 'that',
    // Field/label words that BERT incorrectly absorbs into adjacent person names
    'aadhaar', 'pan', 'holder', 'admin', 'contact', 'support', 'backup',
    'key', 'id', 'policy', 'region', 'environment', 'gateway', 'timestamp',
    'primary', 'secondary', 'internal', 'external', 'access', 'secret'
];

export const NER_ORG_BLACKLIST = [
    'aadhaar', 'pan', 'gemini', 'chatgpt', 'claude',
    'iam', 'aws', 'api', 'sdk', 'gcp', 'azure', 'dpdp', 'kyc', 'stripe', 'ach'
];

export function analyzeTextLocally(text) {
    const findings = [];
    const textLower = text.toLowerCase();

    for (const [type, pattern] of Object.entries(DLP_PATTERNS)) {
        const globalPattern = new RegExp(pattern.source, 'gi');
        for (const match of text.matchAll(globalPattern)) {
            findings.push({ type, finding: `Detected ${type.replace(/_/g, ' ')}`, matchedText: match[0] });
        }
    }

    // Context-based patterns: only check when a relevant keyword appears nearby
    for (const [type, { pattern, keywords }] of Object.entries(CONTEXT_PATTERNS)) {
        if (keywords.some(kw => textLower.includes(kw))) {
            const globalPattern = new RegExp(pattern.source, 'gi');
            for (const match of text.matchAll(globalPattern)) {
                findings.push({ type, finding: `Detected ${type.replace(/_/g, ' ')}`, matchedText: match[0] });
            }
        }
    }

    // Sensitive keyword scan: flag prompts that contain assignment-style secrets (password: xxx)
    for (const keyword of SENSITIVE_KEYWORDS) {
        const kwPattern = new RegExp(`\\b${keyword}\\s*[:=]`, 'i');
        if (kwPattern.test(text)) {
            findings.push({ type: 'sensitive_keyword', finding: `Contains sensitive keyword: "${keyword}"`, matchedText: keyword, redact: false });
        }
    }

    return findings;
}

// Augment + blacklist-filter + dedup the raw NER findings from the BERT worker.
export function processNerFindings(nerFindings) {
    const augmented = [];
    for (const finding of nerFindings) {
        augmented.push(finding);
        if (finding.type === 'ner_PER' && finding.matchedText.includes(' ')) {
            const parts = finding.matchedText.split(' ');
            if (parts.length === 2) {
                for (const part of parts) {
                    if (part.length > 2) {
                        augmented.push({ ...finding, matchedText: part, finding: `Detected a potential PER: ${part}` });
                    }
                }
            }
        }
    }

    const filtered = augmented.filter(finding => {
        const lower = finding.matchedText.toLowerCase().trim();
        if (finding.type === 'ner_PER') {
            if (NER_PERSON_BLACKLIST.includes(lower)) return false;
            if (lower.includes(' ') && lower.split(' ').some(w => NER_PERSON_BLACKLIST.includes(w))) return false;
        }
        if (finding.type === 'ner_ORG') {
            if (NER_ORG_BLACKLIST.includes(lower)) return false;
        }
        return true;
    });

    const seen = new Set();
    return filtered.filter(f => {
        const key = `${f.type}:${f.matchedText}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// Apply admin-defined custom rules (already filtered to the applicable department by the caller).
// rule: { name, type: 'keyword'|'regex', pattern, action: 'redact'|'block', department }
// Returns finding objects compatible with redactText / the block pipeline.
export function applyCustomRules(text, rules) {
    if (!Array.isArray(rules) || rules.length === 0) return [];
    const findings = [];
    for (const rule of rules) {
        if (!rule || !rule.pattern || !rule.name) continue;
        const action = rule.action === 'block' ? 'block' : 'redact';
        let regex;
        try {
            if (rule.type === 'regex') {
                if (String(rule.pattern).length > 200) continue; // guard against pathological patterns
                regex = new RegExp(rule.pattern, 'gi');
            } else {
                // keyword: whole-word, case-insensitive, pattern escaped
                const escaped = String(rule.pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                regex = new RegExp(`(?<![a-zA-Z0-9_])${escaped}(?![a-zA-Z0-9_])`, 'gi');
            }
        } catch (e) {
            continue; // invalid regex → skip this rule rather than break analysis
        }
        let match, guard = 0;
        while ((match = regex.exec(text)) !== null) {
            if (match[0] === '') { regex.lastIndex++; continue; } // avoid zero-width infinite loop
            findings.push({
                type: 'custom',
                ruleName: rule.name,
                action,
                matchedText: match[0],
                finding: `Matched rule "${rule.name}"`,
                redact: true
            });
            if (++guard > 1000) break;
        }
    }
    return findings;
}

// Returns { redactedText, redactionMap } where redactionMap is { "[REDACTED_TYPE_N]": "original value" }.
// Same value across multiple occurrences gets the same placeholder so reinsertion is correct.
export function redactText(text, findings) {
    if (!findings || findings.length === 0) return { redactedText: text, redactionMap: {} };

    const intervals = [];
    for (const finding of findings) {
        const escapedText = finding.matchedText.replace(/[.*+?^${}()|[\]\/]/g, '\\$&');
        const regex = new RegExp(`(?<![a-zA-Z0-9_])${escapedText}(?![a-zA-Z0-9_])`, 'g');
        let match;
        while ((match = regex.exec(text)) !== null) {
            intervals.push({ start: match.index, end: match.index + match[0].length, type: finding.type });
        }
    }

    if (intervals.length === 0) return { redactedText: text, redactionMap: {} };

    intervals.sort((a, b) => a.start - b.start);

    const merged = [];
    merged.push(intervals[0]);
    for (let i = 1; i < intervals.length; i++) {
        const last = merged[merged.length - 1];
        if (intervals[i].start < last.end) {
            last.end = Math.max(last.end, intervals[i].end);
        } else {
            merged.push(intervals[i]);
        }
    }

    const redactionMap = {};
    const valueToPlaceholder = new Map();
    const typeCounters = {};

    let redactedText = '';
    let lastIndex = 0;
    for (const interval of merged) {
        let label = (interval.type || 'ENTITY').toUpperCase();
        if (label.startsWith('NER_')) label = label.substring(4);
        if (label === 'PER') label = 'PERSON';

        const originalValue = text.substring(interval.start, interval.end);

        let placeholder;
        if (valueToPlaceholder.has(originalValue)) {
            placeholder = valueToPlaceholder.get(originalValue);
        } else {
            typeCounters[label] = (typeCounters[label] || 0) + 1;
            placeholder = `[REDACTED_${label}_${typeCounters[label]}]`;
            valueToPlaceholder.set(originalValue, placeholder);
            redactionMap[placeholder] = originalValue;
        }

        redactedText += text.substring(lastIndex, interval.start);
        redactedText += placeholder;
        lastIndex = interval.end;
    }
    redactedText += text.substring(lastIndex);

    return { redactedText, redactionMap };
}
