// Run with: node test/engine.test.mjs
// Proves the core engine logic works end-to-end without a browser.

import { compressPrompt } from '../shared/compressor.js';
import { analyzeTextLocally, redactText, processNerFindings, applyCustomRules } from '../shared/engine.js';

let passed = 0, failed = 0;
function check(name, cond, detail) {
    if (cond) { passed++; console.log(`  PASS  ${name}`); }
    else { failed++; console.log(`  FAIL  ${name}${detail ? '\n        ' + detail : ''}`); }
}

// Simulates the content-script reinjection: replace placeholders in LLM output with originals.
function reinject(text, redactionMap) {
    let out = text;
    for (const [ph, val] of Object.entries(redactionMap)) out = out.split(ph).join(val);
    return out;
}

// Simulates the full service-worker pipeline (minus the real BERT call).
function runPipeline(prompt, fakeNer = []) {
    const { compressed, tokensSaved, charsRemoved } = compressPrompt(prompt);
    const textToAnalyze = charsRemoved > 0 ? compressed : prompt;
    const localFindings = analyzeTextLocally(textToAnalyze);
    const nerFindings = processNerFindings(fakeNer);
    const allFindings = [...nerFindings, ...localFindings];

    let decision, redactedText = null, redactionMap = {};
    if (allFindings.length === 0 && tokensSaved >= 3) {
        decision = 'token_optimized'; redactedText = compressed;
    } else if (allFindings.length === 0) {
        decision = 'allow';
    } else {
        const findingsToRedact = allFindings.filter(f => f.redact !== false);
        ({ redactedText, redactionMap } = redactText(textToAnalyze, findingsToRedact));
        decision = 'redact';
    }
    return { decision, redactedText, redactionMap, tokensSaved, charsRemoved, textToAnalyze, findingsCount: allFindings.length };
}

console.log('\n=== COMPRESSOR (token optimizer) ===');
{
    const r = compressPrompt('Hi Claude! Can you write a Python function to reverse a string? Thanks in advance!');
    check('strips greeting + signoff', !r.compressed.includes('Hi Claude') && !r.compressed.toLowerCase().includes('thanks in advance'), JSON.stringify(r));
    check('keeps the real request', r.compressed.includes('reverse a string'), r.compressed);
    check('reports tokens saved (>=3)', r.tokensSaved >= 3, `tokensSaved=${r.tokensSaved}`);
}
{
    const r = compressPrompt('How do I configure CORS in Express?');
    check('single sentence untouched', r.charsRemoved === 0 && r.tokensSaved === 0, JSON.stringify(r));
}
{
    const r = compressPrompt('Hey, I need help debugging a user issue. The server returns 500.');
    check('inline greeting on content sentence is KEPT (safety)', r.compressed.includes('I need help debugging'), r.compressed);
}

console.log('\n=== REDACTION (numbered placeholders + map) ===');
{
    const text = 'My email is john@company.com and backup is admin@company.com. Contact john@company.com again.';
    const findings = analyzeTextLocally(text);
    const { redactedText, redactionMap } = redactText(text, findings.filter(f => f.redact !== false));
    check('two distinct emails get distinct placeholders',
        Object.keys(redactionMap).length === 2, JSON.stringify(redactionMap));
    check('same email reuses same placeholder',
        (redactedText.match(/\[REDACTED_EMAIL_ADDRESS_1\]/g) || []).length === 2, redactedText);
    check('original emails fully removed from redacted text',
        !redactedText.includes('john@company.com') && !redactedText.includes('admin@company.com'), redactedText);
}
{
    const text = 'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY and key AKIAIOSFODNN7EXAMPLE';
    const findings = analyzeTextLocally(text);
    const { redactedText, redactionMap } = redactText(text, findings.filter(f => f.redact !== false));
    check('aws access key redacted', redactedText.includes('[REDACTED_AWS_ACCESS_KEY_1]'), redactedText);
    check('aws secret key redacted', redactedText.includes('[REDACTED_AWS_SECRET_KEY_1]'), redactedText);
    check('secret value not leaked', !redactedText.includes('wJalrXUtnFEMI'), redactedText);
}

console.log('\n=== REINJECTION (round-trip) ===');
{
    const text = 'My email is john@company.com and phone is +91 98765 43210.';
    const findings = analyzeTextLocally(text);
    const { redactedText, redactionMap } = redactText(text, findings.filter(f => f.redact !== false));
    // Simulate an LLM that echoes the placeholders back in its answer:
    const llmReply = `I see your email ${Object.keys(redactionMap).find(k => k.includes('EMAIL'))} and phone are noted.`;
    const restored = reinject(llmReply, redactionMap);
    check('placeholder maps back to original email', restored.includes('john@company.com'), restored);
    check('redacted prompt had no raw email', !redactedText.includes('john@company.com'), redactedText);
}

console.log('\n=== NER post-processing ===');
{
    const ner = [{ type: 'ner_PER', matchedText: 'Pranay Saxena', finding: 'Detected a potential PER: Pranay Saxena' }];
    const out = processNerFindings(ner);
    check('2-word name split into parts', out.some(f => f.matchedText === 'Pranay') && out.some(f => f.matchedText === 'Saxena'), JSON.stringify(out.map(o => o.matchedText)));
}
{
    const ner = [{ type: 'ner_ORG', matchedText: 'AWS', finding: 'x' }, { type: 'ner_PER', matchedText: 'Aadhaar', finding: 'x' }];
    const out = processNerFindings(ner);
    check('blacklisted ORG/PER removed', out.length === 0, JSON.stringify(out));
}

console.log('\n=== CUSTOM RULES ===');
{
    const out = applyCustomRules('The Project Atlas budget is confidential.', [
        { name: 'Codename', type: 'keyword', pattern: 'Atlas', action: 'block', department: 'all' }
    ]);
    check('keyword rule matches', out.length === 1 && out[0].matchedText === 'Atlas', JSON.stringify(out));
    check('block action carried', out[0] && out[0].action === 'block', JSON.stringify(out));
    check('finding type is custom', out[0] && out[0].type === 'custom', JSON.stringify(out));
}
{
    const out = applyCustomRules('Ticket ID PRJ-12345 and PRJ-99', [
        { name: 'Ticket', type: 'regex', pattern: 'PRJ-\\d+', action: 'redact', department: 'all' }
    ]);
    check('regex rule matches all occurrences', out.length === 2, JSON.stringify(out.map(o => o.matchedText)));
}
{
    const out = applyCustomRules('anything', [
        { name: 'Bad', type: 'regex', pattern: '(', action: 'block', department: 'all' }
    ]);
    check('invalid regex is skipped (no throw)', Array.isArray(out) && out.length === 0, JSON.stringify(out));
}
{
    // keyword should be whole-word: "cat" must not match inside "category"
    const out = applyCustomRules('category management', [
        { name: 'Animal', type: 'keyword', pattern: 'cat', action: 'redact', department: 'all' }
    ]);
    check('keyword is whole-word only', out.length === 0, JSON.stringify(out));
}
{
    // custom finding redacts with a CUSTOM placeholder
    const text = 'Codename Atlas is secret';
    const findings = applyCustomRules(text, [{ name: 'CN', type: 'keyword', pattern: 'Atlas', action: 'redact', department: 'all' }]);
    const { redactedText, redactionMap } = redactText(text, findings);
    check('custom rule redacts to [REDACTED_CUSTOM_1]', redactedText.includes('[REDACTED_CUSTOM_1]') && redactionMap['[REDACTED_CUSTOM_1]'] === 'Atlas', redactedText + ' ' + JSON.stringify(redactionMap));
}

console.log('\n=== FULL PIPELINE (compress + redact + token) ===');
{
    const prompt = 'Hi Claude! My email is john@company.com and SSN is 123-45-6789. Thanks so much in advance!';
    const r = runPipeline(prompt);
    check('decision = redact', r.decision === 'redact', JSON.stringify(r));
    check('filler stripped before redaction (no "Hi Claude")', !r.redactedText.includes('Hi Claude'), r.redactedText);
    check('filler stripped (no "Thanks so much")', !r.redactedText.toLowerCase().includes('thanks so much'), r.redactedText);
    check('email + ssn redacted', r.redactedText.includes('[REDACTED_EMAIL_ADDRESS_1]') && r.redactedText.includes('[REDACTED_SSN_1]'), r.redactedText);
    check('token savings reported with PII present', r.tokensSaved >= 1, `tokensSaved=${r.tokensSaved}`);
}
{
    const prompt = 'Hi Claude! Can you explain how promises work in JavaScript? Thanks in advance!';
    const r = runPipeline(prompt);
    check('no-PII filler prompt = token_optimized', r.decision === 'token_optimized', JSON.stringify(r));
}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed === 0 ? 0 : 1);
