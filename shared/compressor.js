// Airlock prompt compressor.
// Sentence-level semantic scoring: identify boundary sentences (first 2 / last 2) that carry
// zero domain/semantic content and strip them. Middle sentences are NEVER touched.
// Goal: save tokens without altering meaning or grammatical structure.

const STRUCTURAL_WORDS = new Set([
    // Action / task verbs
    'build', 'create', 'write', 'generate', 'fix', 'debug', 'analyze', 'explain',
    'implement', 'design', 'optimize', 'review', 'test', 'refactor', 'convert',
    'translate', 'help', 'show', 'find', 'compare', 'summarize', 'extract',
    'parse', 'validate', 'compile', 'deploy', 'configure', 'install', 'update',
    'add', 'remove', 'delete', 'modify', 'rename', 'merge', 'split', 'check',
    'investigate', 'identify', 'describe', 'list', 'enumerate', 'rank', 'sort',
    'filter', 'transform', 'render', 'compute', 'calculate', 'evaluate', 'estimate',
    'predict', 'recommend', 'suggest', 'propose', 'plan', 'draft', 'edit', 'rewrite',
    'understand', 'learn', 'teach', 'demonstrate', 'prove', 'verify', 'confirm',
    'read', 'inspect', 'audit', 'measure', 'profile', 'benchmark', 'troubleshoot',
    // Domain nouns
    'code', 'function', 'method', 'class', 'object', 'variable', 'array', 'string',
    'integer', 'boolean', 'json', 'xml', 'html', 'css', 'sql', 'query', 'database',
    'table', 'schema', 'index', 'api', 'endpoint', 'request', 'response', 'server',
    'client', 'browser', 'extension', 'plugin', 'module', 'package', 'library',
    'framework', 'component', 'service', 'controller', 'model', 'view', 'router',
    'file', 'folder', 'directory', 'path', 'url', 'uri', 'domain', 'host',
    'port', 'protocol', 'http', 'https', 'tcp', 'udp', 'websocket', 'rest', 'graphql',
    'error', 'bug', 'issue', 'exception', 'warning', 'log', 'trace', 'stack',
    'feature', 'task', 'ticket', 'project', 'sprint', 'epic', 'story', 'milestone',
    'data', 'dataset', 'record', 'row', 'column', 'field', 'document', 'entity',
    'algorithm', 'pattern', 'structure', 'system', 'architecture', 'workflow',
    'pipeline', 'process', 'thread', 'job', 'queue', 'cache', 'memory',
    // Subject-matter nouns commonly seen in business prompts
    'report', 'invoice', 'contract', 'policy', 'budget', 'forecast', 'revenue',
    'customer', 'employee', 'candidate', 'interview', 'meeting', 'email',
    'presentation', 'spreadsheet', 'slide', 'paragraph', 'sentence',
    'essay', 'article', 'blog', 'post', 'message', 'reply', 'thread', 'comment',
    // Question structure words (high signal in questions)
    'what', 'how', 'why', 'when', 'which', 'where', 'who', 'whom', 'whose'
]);

const FILLER_WORDS = new Set([
    // Greetings
    'hi', 'hey', 'hello', 'dear', 'good', 'morning', 'afternoon', 'evening', 'greetings',
    // AI/assistant names
    'claude', 'chatgpt', 'gemini', 'ai', 'assistant', 'bot', 'gpt',
    // Politeness markers
    'please', 'kindly', 'appreciate', 'grateful', 'thankful', 'thanks', 'thank',
    'sorry', 'apologize', 'apologise', 'bother', 'bothering', 'interrupt',
    // Optimism / hope phrasings
    'hope', 'hopefully', 'wonderful', 'amazing', 'fantastic', 'brilliant', 'awesome',
    'great', 'super', 'lovely', 'nice',
    // Curiosity / softeners
    'curious', 'wondering', 'wondered', 'wonder',
    // Sign-offs
    'regards', 'sincerely', 'cheers', 'best', 'advance', 'ahead', 'forward',
    // Generic empty fillers
    'just', 'really', 'truly', 'quite', 'somewhat', 'rather', 'maybe', 'perhaps',
    'actually', 'basically', 'essentially', 'literally', 'well', 'okay', 'ok'
]);

// Words to skip when scoring (pronouns, articles, common auxiliaries) — they carry no domain weight.
const STOP_WORDS = new Set([
    'a', 'an', 'the', 'i', 'you', 'me', 'we', 'us', 'they', 'them', 'he', 'she', 'it',
    'my', 'your', 'our', 'their', 'his', 'her', 'its',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am',
    'do', 'does', 'did', 'done', 'doing',
    'have', 'has', 'had', 'having',
    'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must',
    'to', 'of', 'in', 'on', 'at', 'by', 'for', 'with', 'from', 'as', 'into', 'onto',
    'and', 'or', 'but', 'if', 'so', 'than', 'then', 'that', 'this', 'these', 'those',
    'not', 'no', 'yes',
    'some', 'any', 'all', 'every', 'each', 'few', 'many', 'much', 'most',
    're', 'm', 's', 't', 'd', 'll', 've', "i'm", "you're", "we're", "they're"
]);

// Sentences with technical markers are treated as structural — never removed.
function hasTechnicalMarker(sentence) {
    if (sentence.includes('`')) return true;
    if (/https?:\/\//i.test(sentence)) return true;
    if (/[A-Za-z]:\\|\.\.?\/|\/\w+\//.test(sentence)) return true; // file paths
    if (/\b[a-z]+[A-Z]\w*/.test(sentence)) return true;            // camelCase
    if (/\b[A-Z_]{2,}\b/.test(sentence)) return true;              // SCREAMING_SNAKE
    if (/\b\d+\.\d+/.test(sentence)) return true;                  // version numbers
    if (/[(){}\[\]<>]/.test(sentence)) return true;                // brackets
    if (/[:;]\s*$/.test(sentence)) return true;                    // ends in : or ; (sets up content)
    return false;
}

function tokenize(sentence) {
    return sentence
        .toLowerCase()
        .replace(/['']/g, "'")
        .split(/[\s,!?;:()\[\]"]+/)
        .map(w => w.replace(/^[^a-z']+|[^a-z']+$/g, ''))
        .filter(w => w.length > 0);
}

function classifySentence(sentence) {
    if (hasTechnicalMarker(sentence)) {
        return { isPureFiller: false, structural: 1, filler: 0, meaningful: 0 };
    }
    const words = tokenize(sentence);
    let structural = 0;
    let filler = 0;
    let meaningful = 0;
    for (const w of words) {
        if (STOP_WORDS.has(w)) continue;
        meaningful++;
        if (STRUCTURAL_WORDS.has(w)) structural++;
        if (FILLER_WORDS.has(w)) filler++;
    }
    // Pure filler: no structural words at all AND at least one filler word AND
    // the non-filler "meaningful" word count is small enough that there is no hidden content.
    const isPureFiller = structural === 0 && filler > 0 && meaningful <= filler + 2;
    return { isPureFiller, structural, filler, meaningful };
}

// Split into sentences while keeping each piece's original raw text and offsets,
// so we can rebuild without losing whitespace/newlines.
function splitSentences(text) {
    const out = [];
    const re = /([^.!?\n]+[.!?\n]+|[^.!?\n]+$)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        const raw = m[0];
        const trimmed = raw.trim();
        if (trimmed.length === 0) continue;
        out.push({ raw, trimmed, start: m.index, end: m.index + raw.length });
    }
    return out;
}

export function compressPrompt(text) {
    const originalLength = text.length;
    const sentences = splitSentences(text);

    // Single-sentence prompts: too risky to touch.
    if (sentences.length <= 1) {
        return { compressed: text, tokensSaved: 0, charsRemoved: 0 };
    }

    const removable = new Set();
    const maxToRemove = 2;
    const minRemainingChars = 15;

    // Only inspect first 2 and last 2 sentences. Middle sentences are never removed.
    const candidates = new Set();
    candidates.add(0);
    if (sentences.length > 1) candidates.add(1);
    candidates.add(sentences.length - 1);
    if (sentences.length > 2) candidates.add(sentences.length - 2);

    for (const idx of [...candidates].sort((a, b) => a - b)) {
        if (removable.size >= maxToRemove) break;
        const c = classifySentence(sentences[idx].trimmed);
        if (c.isPureFiller) removable.add(idx);
    }

    if (removable.size === 0) {
        return { compressed: text, tokensSaved: 0, charsRemoved: 0 };
    }

    // Rebuild text from non-removable sentences, preserving original whitespace runs.
    let compressed = '';
    let cursor = 0;
    for (let i = 0; i < sentences.length; i++) {
        if (removable.has(i)) {
            cursor = sentences[i].end;
            continue;
        }
        if (cursor < sentences[i].start) {
            compressed += text.substring(cursor, sentences[i].start);
        }
        compressed += sentences[i].raw;
        cursor = sentences[i].end;
    }
    if (cursor < text.length) compressed += text.substring(cursor);

    compressed = compressed.replace(/^\s+/, '').replace(/\s+$/, '');

    if (compressed.length < minRemainingChars) {
        return { compressed: text, tokensSaved: 0, charsRemoved: 0 };
    }

    const charsRemoved = originalLength - compressed.length;
    if (charsRemoved <= 0) {
        return { compressed: text, tokensSaved: 0, charsRemoved: 0 };
    }

    const tokensSaved = Math.floor(charsRemoved / 4);
    return { compressed, tokensSaved, charsRemoved };
}
