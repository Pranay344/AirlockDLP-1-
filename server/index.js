const path = require('path');
const express = require('express');
const cors = require('cors');

const {
    createOrgWithAdmin, getAdminByEmail, getOrgByCode, orgCodeExists,
    insertEvent, getStats, getReport, getSettings, setSettings
} = require('./db');
const {
    hashPassword, verifyPassword, signToken, requireAuth, generateOrgCode
} = require('./auth');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors()); // permissive — local dev + chrome-extension origins
app.use(express.json({ limit: '64kb' }));

// --- Auth ---
app.post('/api/auth/signup', (req, res) => {
    const { orgName, email, password } = req.body || {};
    if (!orgName || !email || !password) return res.status(400).json({ error: 'orgName, email, password required' });
    if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (getAdminByEmail(email)) return res.status(409).json({ error: 'An account with that email already exists' });

    // Generate a unique org code.
    let orgCode;
    do { orgCode = generateOrgCode(); } while (orgCodeExists(orgCode));

    try {
        const orgId = createOrgWithAdmin(String(orgName).trim(), orgCode, String(email).trim().toLowerCase(), hashPassword(password));
        const admin = getAdminByEmail(email);
        const token = signToken(admin.id);
        res.json({ token, orgCode, orgName: orgName, email: admin.email });
    } catch (e) {
        res.status(500).json({ error: 'Could not create account' });
    }
});

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    const admin = getAdminByEmail(String(email).trim().toLowerCase());
    if (!admin || !verifyPassword(password, admin.password_hash)) {
        return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = signToken(admin.id);
    res.json({ token, orgCode: admin.org_code, orgName: admin.org_name, email: admin.email });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json({ email: req.admin.email, orgCode: req.admin.org_code, orgName: req.admin.org_name });
});

// --- Events (from the extension; validated by org_code, no admin JWT) ---
app.post('/api/events', (req, res) => {
    const { orgCode } = req.body || {};
    if (!orgCode) return res.status(400).json({ error: 'orgCode required' });
    const org = getOrgByCode(String(orgCode).trim().toUpperCase());
    if (!org) return res.status(404).json({ error: 'Unknown org code' });
    try {
        insertEvent(org.id, req.body);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: 'Could not record event' });
    }
});

// --- Public settings (extension fetches toggles by org_code) ---
app.get('/api/public-settings', (req, res) => {
    const orgCode = String(req.query.orgCode || '').trim().toUpperCase();
    const org = getOrgByCode(orgCode);
    if (!org) return res.status(404).json({ error: 'Unknown org code' });
    res.json({ data: getSettings(org.id) });
});

// --- Dashboard reads (admin JWT) ---
app.get('/api/stats', requireAuth, (req, res) => {
    res.json(getStats(req.admin.org_id));
});

app.get('/api/report', requireAuth, (req, res) => {
    const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
    let { from, to } = req.query;
    if (!isDate(to)) to = new Date().toISOString().slice(0, 10);
    if (!isDate(from)) {
        const d = new Date(); d.setDate(d.getDate() - 29);
        from = d.toISOString().slice(0, 10);
    }
    res.json(getReport(req.admin.org_id, from, to));
});

app.get('/api/settings', requireAuth, (req, res) => {
    res.json({ data: getSettings(req.admin.org_id) });
});

app.put('/api/settings', requireAuth, (req, res) => {
    const data = req.body && req.body.data;
    if (!data || typeof data !== 'object') return res.status(400).json({ error: 'data object required' });

    // Validate custom rules if present.
    if (data.customRules !== undefined) {
        if (!Array.isArray(data.customRules)) return res.status(400).json({ error: 'customRules must be an array' });
        if (data.customRules.length > 100) return res.status(400).json({ error: 'Too many rules (max 100)' });
        for (const r of data.customRules) {
            if (!r || typeof r.name !== 'string' || !r.name.trim()) return res.status(400).json({ error: 'Each rule needs a name' });
            if (r.type !== 'keyword' && r.type !== 'regex') return res.status(400).json({ error: `Rule "${r.name}": type must be keyword or regex` });
            if (typeof r.pattern !== 'string' || !r.pattern.trim()) return res.status(400).json({ error: `Rule "${r.name}": pattern required` });
            if (r.pattern.length > 200) return res.status(400).json({ error: `Rule "${r.name}": pattern too long (max 200)` });
            if (r.action !== 'redact' && r.action !== 'block') return res.status(400).json({ error: `Rule "${r.name}": action must be redact or block` });
            if (r.type === 'regex') { try { new RegExp(r.pattern); } catch (e) { return res.status(400).json({ error: `Rule "${r.name}": invalid regex` }); } }
        }
    }
    if (data.departments !== undefined && !Array.isArray(data.departments)) {
        return res.status(400).json({ error: 'departments must be an array' });
    }

    setSettings(req.admin.org_id, data);
    res.json({ ok: true, data });
});

// --- Static dashboard ---
app.use('/', express.static(path.join(__dirname, '..', 'dashboard')));

app.listen(PORT, () => {
    console.log(`\n🛡️  Airlock backend + dashboard running at http://localhost:${PORT}`);
    console.log(`    Open that URL in your browser to sign up / log in.\n`);
});
