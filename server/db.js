const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.AIRLOCK_DB || path.join(__dirname, 'airlock.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS orgs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    org_code TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER NOT NULL REFERENCES orgs(id),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER NOT NULL REFERENCES orgs(id),
    employee_email TEXT NOT NULL,
    decision TEXT NOT NULL,
    findings_count INTEGER NOT NULL DEFAULT 0,
    tokens_saved INTEGER NOT NULL DEFAULT 0,
    categories TEXT NOT NULL DEFAULT '[]',
    host TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_org ON events(org_id);
CREATE TABLE IF NOT EXISTS settings (
    org_id INTEGER PRIMARY KEY REFERENCES orgs(id),
    data TEXT NOT NULL
);
`);

// Migration: add events.department for per-department analytics (no-op if it already exists).
try { db.exec(`ALTER TABLE events ADD COLUMN department TEXT DEFAULT 'Unassigned'`); } catch (e) { /* column exists */ }

const DEFAULT_SETTINGS = {
    tokenOptimizer: true,
    nerDetection: true,
    reinjection: true,
    categories: { pii: true, secrets: true, financial: true, medical: true },
    // Categories that trigger a hard "smart block" (vs soft redact). Default: credentials + financial.
    blockCategories: { pii: false, secrets: true, financial: true, medical: false },
    // Admin-defined departments and custom rules.
    departments: [],
    customRules: []
};

// --- Orgs & admins ---
function createOrgWithAdmin(orgName, orgCode, email, passwordHash) {
    const tx = db.transaction(() => {
        const org = db.prepare('INSERT INTO orgs (name, org_code) VALUES (?, ?)').run(orgName, orgCode);
        const orgId = org.lastInsertRowid;
        db.prepare('INSERT INTO admins (org_id, email, password_hash) VALUES (?, ?, ?)').run(orgId, email, passwordHash);
        db.prepare('INSERT INTO settings (org_id, data) VALUES (?, ?)').run(orgId, JSON.stringify(DEFAULT_SETTINGS));
        return orgId;
    });
    return tx();
}

function getAdminByEmail(email) {
    return db.prepare(`
        SELECT a.*, o.org_code AS org_code, o.name AS org_name
        FROM admins a JOIN orgs o ON o.id = a.org_id
        WHERE a.email = ?
    `).get(email);
}

function getAdminById(id) {
    return db.prepare(`
        SELECT a.id, a.email, a.org_id, o.org_code AS org_code, o.name AS org_name
        FROM admins a JOIN orgs o ON o.id = a.org_id
        WHERE a.id = ?
    `).get(id);
}

function getOrgByCode(orgCode) {
    return db.prepare('SELECT * FROM orgs WHERE org_code = ?').get(orgCode);
}

function orgCodeExists(orgCode) {
    return !!db.prepare('SELECT 1 FROM orgs WHERE org_code = ?').get(orgCode);
}

// --- Events ---
function insertEvent(orgId, e) {
    return db.prepare(`
        INSERT INTO events (org_id, employee_email, decision, findings_count, tokens_saved, categories, host, department)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        orgId,
        String(e.email || 'unknown'),
        String(e.decision || 'allow'),
        Number(e.findingsCount) || 0,
        Number(e.tokensSaved) || 0,
        JSON.stringify(Array.isArray(e.categories) ? e.categories : []),
        e.host ? String(e.host) : null,
        e.department ? String(e.department) : 'Unassigned'
    );
}

function getStats(orgId) {
    const totals = db.prepare(`
        SELECT
            COUNT(*) AS prompts,
            SUM(CASE WHEN decision = 'redact' THEN 1 ELSE 0 END) AS redactions,
            SUM(CASE WHEN decision = 'block' THEN 1 ELSE 0 END) AS blocks,
            SUM(CASE WHEN decision = 'token_optimized' THEN 1 ELSE 0 END) AS optimized,
            COALESCE(SUM(tokens_saved), 0) AS tokensSaved
        FROM events WHERE org_id = ?
    `).get(orgId);

    const perEmployee = db.prepare(`
        SELECT employee_email AS email,
               COUNT(*) AS prompts,
               SUM(CASE WHEN decision = 'redact' THEN 1 ELSE 0 END) AS redactions,
               COALESCE(SUM(tokens_saved), 0) AS tokensSaved
        FROM events WHERE org_id = ?
        GROUP BY employee_email
        ORDER BY prompts DESC
    `).all(orgId);

    // Category breakdown — expand the JSON arrays in JS (SQLite has no easy unnest here).
    const rows = db.prepare('SELECT categories FROM events WHERE org_id = ?').all(orgId);
    const catCounts = {};
    for (const r of rows) {
        let cats = [];
        try { cats = JSON.parse(r.categories); } catch {}
        for (const c of cats) catCounts[c] = (catCounts[c] || 0) + 1;
    }
    const byCategory = Object.entries(catCounts)
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count);

    const recent = db.prepare(`
        SELECT employee_email AS email, decision, findings_count AS findingsCount,
               tokens_saved AS tokensSaved, categories, host, created_at AS createdAt
        FROM events WHERE org_id = ?
        ORDER BY id DESC LIMIT 50
    `).all(orgId).map(r => ({ ...r, categories: safeParse(r.categories) }));

    const byDepartment = db.prepare(`
        SELECT COALESCE(department, 'Unassigned') AS department,
               COUNT(*) AS prompts,
               SUM(CASE WHEN decision = 'redact' THEN 1 ELSE 0 END) AS redactions,
               SUM(CASE WHEN decision = 'block' THEN 1 ELSE 0 END) AS blocks,
               COALESCE(SUM(tokens_saved), 0) AS tokensSaved
        FROM events WHERE org_id = ?
        GROUP BY COALESCE(department, 'Unassigned')
        ORDER BY prompts DESC
    `).all(orgId);

    return {
        totals: {
            prompts: totals.prompts || 0,
            redactions: totals.redactions || 0,
            blocks: totals.blocks || 0,
            optimized: totals.optimized || 0,
            tokensSaved: totals.tokensSaved || 0
        },
        perEmployee,
        byCategory,
        byDepartment,
        recent,
        timeseries: getTimeseries(orgId, 14)
    };
}

// Events + tokens-saved per day for the last `days` days, gap-filled with zeros.
function getTimeseries(orgId, days) {
    const rows = db.prepare(`
        SELECT date(created_at) AS day, COUNT(*) AS prompts, COALESCE(SUM(tokens_saved), 0) AS tokensSaved
        FROM events WHERE org_id = ? AND created_at >= date('now', ?)
        GROUP BY day
    `).all(orgId, `-${days - 1} days`);
    const map = {};
    for (const r of rows) map[r.day] = r;
    const out = [];
    const d = new Date();
    for (let i = days - 1; i >= 0; i--) {
        const dd = new Date(d);
        dd.setDate(d.getDate() - i);
        const key = dd.toISOString().slice(0, 10);
        const r = map[key];
        out.push({ day: key, prompts: r ? r.prompts : 0, tokensSaved: r ? r.tokensSaved : 0 });
    }
    return out;
}

function safeParse(s) { try { return JSON.parse(s); } catch { return []; } }

// --- Compliance report (date-bounded, inclusive YYYY-MM-DD) ---
function getReport(orgId, from, to) {
    const where = 'WHERE org_id = ? AND date(created_at) BETWEEN ? AND ?';
    const args = [orgId, from, to];

    const totalsRow = db.prepare(`
        SELECT
            COUNT(*) AS prompts,
            SUM(CASE WHEN decision = 'redact' THEN 1 ELSE 0 END) AS redactions,
            SUM(CASE WHEN decision = 'block' THEN 1 ELSE 0 END) AS blocks,
            SUM(CASE WHEN decision = 'token_optimized' THEN 1 ELSE 0 END) AS optimized,
            SUM(CASE WHEN decision = 'allow' THEN 1 ELSE 0 END) AS allowed,
            COALESCE(SUM(tokens_saved), 0) AS tokensSaved,
            COUNT(DISTINCT employee_email) AS uniqueEmployees
        FROM events ${where}
    `).get(...args);

    const totals = {
        prompts: totalsRow.prompts || 0,
        redactions: totalsRow.redactions || 0,
        blocks: totalsRow.blocks || 0,
        optimized: totalsRow.optimized || 0,
        allowed: totalsRow.allowed || 0,
        tokensSaved: totalsRow.tokensSaved || 0,
        uniqueEmployees: totalsRow.uniqueEmployees || 0,
        exposuresPrevented: (totalsRow.redactions || 0) + (totalsRow.blocks || 0)
    };

    const perEmployee = db.prepare(`
        SELECT employee_email AS email, COUNT(*) AS prompts,
               SUM(CASE WHEN decision = 'redact' THEN 1 ELSE 0 END) AS redactions,
               COALESCE(SUM(tokens_saved), 0) AS tokensSaved
        FROM events ${where}
        GROUP BY employee_email ORDER BY prompts DESC
    `).all(...args);

    const rows = db.prepare(`SELECT categories FROM events ${where}`).all(...args);
    const catCounts = {};
    for (const r of rows) { for (const c of safeParse(r.categories)) catCounts[c] = (catCounts[c] || 0) + 1; }
    const byCategory = Object.entries(catCounts).map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count);

    const events = db.prepare(`
        SELECT employee_email AS email, decision, findings_count AS findingsCount,
               tokens_saved AS tokensSaved, categories, host, created_at AS createdAt
        FROM events ${where}
        ORDER BY id DESC LIMIT 5000
    `).all(...args).map(r => ({ ...r, categories: safeParse(r.categories) }));

    return { range: { from, to }, totals, perEmployee, byCategory, events };
}

// --- Settings ---
function getSettings(orgId) {
    const row = db.prepare('SELECT data FROM settings WHERE org_id = ?').get(orgId);
    if (!row) return { ...DEFAULT_SETTINGS };
    try { return JSON.parse(row.data); } catch { return { ...DEFAULT_SETTINGS }; }
}

function setSettings(orgId, data) {
    db.prepare(`
        INSERT INTO settings (org_id, data) VALUES (?, ?)
        ON CONFLICT(org_id) DO UPDATE SET data = excluded.data
    `).run(orgId, JSON.stringify(data));
}

module.exports = {
    db, DEFAULT_SETTINGS,
    createOrgWithAdmin, getAdminByEmail, getAdminById, getOrgByCode, orgCodeExists,
    insertEvent, getStats, getReport, getSettings, setSettings
};
