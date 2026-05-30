// Airlock admin dashboard — vanilla JS + Chart.js, same-origin backend.

const API = '';
const TOKEN_KEY = 'airlock_admin_token';
const COST_PER_1K_TOKENS = 0.01;

let mode = 'login';
let statsTimer = null;
let latestStats = null;
let selectedEmployee = null;

// palette
const C = {
    blue: 'hsl(217,91%,60%)', cyan: 'hsl(190,90%,55%)', green: 'hsl(142,71%,45%)',
    amber: 'hsl(38,92%,55%)', red: 'hsl(0,72%,58%)', purple: 'hsl(265,80%,66%)',
    muted: '#9aa7bd', grid: 'rgba(255,255,255,0.06)'
};

const $ = (id) => document.getElementById(id);
const getToken = () => localStorage.getItem(TOKEN_KEY);
const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
const clearToken = () => localStorage.removeItem(TOKEN_KEY);

async function api(path, opts = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    const token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch(API + path, Object.assign({}, opts, { headers }));
    let body = null; try { body = await res.json(); } catch {}
    if (!res.ok) throw new Error((body && body.error) || ('Request failed (' + res.status + ')'));
    return body;
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function fmt(n) { return Number(n || 0).toLocaleString(); }

// ---------- auth ----------
function setMode(m) {
    mode = m;
    $('tab-login').classList.toggle('active', m === 'login');
    $('tab-signup').classList.toggle('active', m === 'signup');
    $('field-orgname').style.display = m === 'signup' ? 'flex' : 'none';
    $('orgName').required = m === 'signup';
    $('auth-submit').textContent = m === 'signup' ? 'Create account' : 'Log in';
    $('auth-error').textContent = '';
    $('password').setAttribute('autocomplete', m === 'signup' ? 'new-password' : 'current-password');
}
$('tab-login').onclick = () => setMode('login');
$('tab-signup').onclick = () => setMode('signup');

$('auth-form').onsubmit = async (e) => {
    e.preventDefault();
    $('auth-error').textContent = ''; $('auth-submit').disabled = true;
    const email = $('email').value.trim(), password = $('password').value;
    try {
        if (mode === 'signup') {
            const r = await api('/api/auth/signup', { method: 'POST', body: JSON.stringify({ orgName: $('orgName').value.trim(), email, password }) });
            setToken(r.token);
            $('auth-form').style.display = 'none';
            $('orgcode-value').textContent = r.orgCode;
            $('orgcode-callout').style.display = 'block';
        } else {
            const r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
            setToken(r.token); enterDashboard();
        }
    } catch (err) { $('auth-error').textContent = err.message; }
    finally { $('auth-submit').disabled = false; }
};
$('orgcode-continue').onclick = () => { $('auth-form').style.display = 'flex'; $('orgcode-callout').style.display = 'none'; enterDashboard(); };
$('logout-btn').onclick = () => { clearToken(); if (statsTimer) clearInterval(statsTimer); $('dashboard-screen').style.display = 'none'; $('auth-screen').style.display = 'flex'; };

// ---------- nav ----------
function showView(name) {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.dataset.viewPanel === name));
    // Charts need a resize nudge when their panel becomes visible.
    setTimeout(() => Object.values(charts).forEach(c => c && c.resize()), 30);
}
document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.view)));

// ---------- dashboard ----------
async function enterDashboard() {
    let me; try { me = await api('/api/auth/me'); } catch (e) { clearToken(); return; }
    $('sb-org').textContent = me.orgName; $('sb-orgcode').textContent = me.orgCode;
    $('set-org').textContent = me.orgName; $('set-email').textContent = me.email; $('set-orgcode').textContent = me.orgCode;
    $('auth-screen').style.display = 'none';
    $('dashboard-screen').style.display = 'flex';
    showView('dashboard');
    await loadSettings();
    await refreshStats();
    if (statsTimer) clearInterval(statsTimer);
    statsTimer = setInterval(refreshStats, 10000);
}

// ---------- charts ----------
if (window.Chart) {
    Chart.defaults.color = C.muted;
    Chart.defaults.borderColor = C.grid;
    Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
}
const charts = { activity: null, decisions: null, categories: null, employees: null };

function makeGradient(ctx, color) {
    const g = ctx.createLinearGradient(0, 0, 0, 220);
    g.addColorStop(0, color.replace(')', ',0.35)').replace('hsl', 'hsla'));
    g.addColorStop(1, color.replace(')', ',0.01)').replace('hsl', 'hsla'));
    return g;
}

function renderActivity(ts) {
    const labels = ts.map(d => { const [y, m, day] = d.day.split('-'); return `${m}/${day}`; });
    const prompts = ts.map(d => d.prompts);
    const tokens = ts.map(d => d.tokensSaved);
    const ctx = $('chart-activity').getContext('2d');
    if (!charts.activity) {
        charts.activity = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets: [
                { label: 'Prompts', data: prompts, borderColor: C.blue, backgroundColor: makeGradient(ctx, C.blue), fill: true, tension: 0.35, pointRadius: 2, borderWidth: 2, yAxisID: 'y' },
                { label: 'Tokens saved', data: tokens, borderColor: C.green, backgroundColor: 'transparent', fill: false, tension: 0.35, pointRadius: 2, borderWidth: 2, borderDash: [4,3], yAxisID: 'y1' }
            ]},
            options: {
                responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
                plugins: { legend: { labels: { boxWidth: 12, usePointStyle: true } } },
                scales: {
                    x: { grid: { display: false } },
                    y: { beginAtZero: true, position: 'left', ticks: { precision: 0 }, title: { display: true, text: 'Prompts' } },
                    y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Tokens' } }
                }
            }
        });
    } else {
        charts.activity.data.labels = labels;
        charts.activity.data.datasets[0].data = prompts;
        charts.activity.data.datasets[1].data = tokens;
        charts.activity.update();
    }
}

function renderDecisions(t) {
    const allow = Math.max(0, (t.prompts || 0) - (t.redactions || 0) - (t.blocks || 0) - (t.optimized || 0));
    const data = [t.redactions || 0, t.blocks || 0, t.optimized || 0, allow];
    const ctx = $('chart-decisions').getContext('2d');
    const cfg = {
        labels: ['Redacted', 'Blocked', 'Optimized', 'Allowed'],
        datasets: [{ data, backgroundColor: [C.amber, C.red, C.blue, C.green], borderColor: 'transparent', hoverOffset: 6 }]
    };
    if (!charts.decisions) {
        charts.decisions = new Chart(ctx, { type: 'doughnut', data: cfg, options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, usePointStyle: true, padding: 14 } } } } });
    } else { charts.decisions.data = cfg; charts.decisions.update(); }
}

function renderCategories(byCategory) {
    const ctx = $('chart-categories').getContext('2d');
    const labels = byCategory.map(c => c.category.toUpperCase());
    const data = byCategory.map(c => c.count);
    const colors = [C.blue, C.amber, C.green, C.purple, C.cyan, C.red];
    const cfg = { labels, datasets: [{ data, backgroundColor: labels.map((_, i) => colors[i % colors.length]), borderColor: 'transparent', hoverOffset: 6 }] };
    if (!charts.categories) {
        charts.categories = new Chart(ctx, { type: 'doughnut', data: cfg, options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, usePointStyle: true, padding: 14 } } } } });
    } else { charts.categories.data = cfg; charts.categories.update(); }
}

function renderEmployeesChart(perEmployee) {
    const top = perEmployee.slice(0, 8);
    const labels = top.map(e => e.email);
    const data = top.map(e => e.prompts);
    const ctx = $('chart-employees').getContext('2d');
    const cfg = { labels, datasets: [{ label: 'Prompts', data, backgroundColor: C.blue, borderRadius: 6, maxBarThickness: 26 }] };
    if (!charts.employees) {
        charts.employees = new Chart(ctx, { type: 'bar', data: cfg, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } }, y: { grid: { display: false } } } } });
    } else { charts.employees.data = cfg; charts.employees.update(); }
}

async function refreshStats() {
    let s; try { s = await api('/api/stats'); } catch (e) { return; }
    latestStats = s;
    const t = s.totals;

    $('stat-prompts').textContent = fmt(t.prompts);
    $('stat-redactions').textContent = fmt(t.redactions);
    $('stat-blocks').textContent = fmt(t.blocks);
    $('stat-tokens').textContent = fmt(t.tokensSaved);
    const dollars = (t.tokensSaved / 1000) * COST_PER_1K_TOKENS;
    $('stat-cost').textContent = (dollars > 0 && dollars < 0.01) ? '≈ <$0.01 saved' : '≈ $' + dollars.toFixed(2) + ' saved';

    const totalPrompts = s.timeseries.reduce((a, d) => a + d.prompts, 0);
    $('activity-hint').textContent = totalPrompts + ' prompts in range';

    renderActivity(s.timeseries);
    renderDecisions(t);
    renderCategories(s.byCategory);
    renderEmployeesChart(s.perEmployee);

    $('activity-feed').innerHTML = renderFeed(s.recent);

    const tbody = $('employee-tbody');
    if (!s.perEmployee.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty">No activity yet.</td></tr>';
    } else {
        tbody.innerHTML = s.perEmployee.map(e => `
            <tr class="clickable ${e.email === selectedEmployee ? 'selected' : ''}" data-email="${esc(e.email)}">
                <td>${esc(e.email)}</td><td>${fmt(e.prompts)}</td><td>${fmt(e.redactions)}</td><td>${fmt(e.tokensSaved)}</td>
            </tr>`).join('');
        tbody.querySelectorAll('tr.clickable').forEach(tr => tr.addEventListener('click', () => selectEmployee(tr.dataset.email)));
    }
    if (selectedEmployee) renderPersonDetail();

    // By-department table (Dashboard)
    const dtb = $('dept-tbody');
    if (dtb) {
        if (!s.byDepartment || !s.byDepartment.length) {
            dtb.innerHTML = '<tr><td colspan="5" class="empty">No activity yet.</td></tr>';
        } else {
            dtb.innerHTML = s.byDepartment.map(d =>
                `<tr><td>${esc(d.department)}</td><td>${fmt(d.prompts)}</td><td>${fmt(d.redactions)}</td><td>${fmt(d.blocks)}</td><td>${fmt(d.tokensSaved)}</td></tr>`
            ).join('');
        }
    }
}

function renderFeed(events) {
    if (!events || !events.length) return '<div class="empty">No activity yet.</div>';
    return events.map(r => {
        const cats = (r.categories || []).length ? ' · ' + [...new Set(r.categories)].join(', ') : '';
        return `<div class="feed-item">
            <span class="feed-badge badge-${esc(r.decision)}">${esc(String(r.decision).replace('_', ' '))}</span>
            <span class="feed-email">${esc(r.email)}</span>
            <span class="feed-meta">${esc(r.host || '')}${cats}<br>${esc(r.createdAt)}</span>
        </div>`;
    }).join('');
}

function selectEmployee(email) {
    selectedEmployee = email;
    document.querySelectorAll('#employee-tbody tr').forEach(tr => tr.classList.toggle('selected', tr.dataset.email === email));
    renderPersonDetail();
}
function renderPersonDetail() {
    $('person-detail-title').textContent = 'Activity for ' + selectedEmployee;
    const events = (latestStats && latestStats.recent || []).filter(e => e.email === selectedEmployee);
    $('person-detail').innerHTML = events.length ? renderFeed(events) : '<div class="empty">No recent events for this employee in the last 50 events.</div>';
}

// ---------- settings ----------
let currentSettings = null;
const $q = (sel) => document.querySelector('#toggles ' + sel);
const DEFAULT_BLOCK = { pii: false, secrets: true, financial: true, medical: false };
async function loadSettings() {
    const r = await api('/api/settings');
    currentSettings = r.data;
    const block = currentSettings.blockCategories || DEFAULT_BLOCK;
    document.querySelectorAll('#toggles input[data-key]').forEach(inp => { inp.checked = !!currentSettings[inp.dataset.key]; });
    document.querySelectorAll('#toggles input[data-cat]').forEach(inp => { inp.checked = !!(currentSettings.categories && currentSettings.categories[inp.dataset.cat]); });
    document.querySelectorAll('#toggles input[data-block]').forEach(inp => { inp.checked = !!block[inp.dataset.block]; });
    renderRules();
}

// Build the FULL settings payload, preserving departments + customRules (so toggle saves never wipe them).
function buildSettingsPayload() {
    return {
        tokenOptimizer: $q('input[data-key="tokenOptimizer"]').checked,
        nerDetection: $q('input[data-key="nerDetection"]').checked,
        reinjection: $q('input[data-key="reinjection"]').checked,
        categories: {
            pii: $q('input[data-cat="pii"]').checked, secrets: $q('input[data-cat="secrets"]').checked,
            financial: $q('input[data-cat="financial"]').checked, medical: $q('input[data-cat="medical"]').checked
        },
        blockCategories: {
            pii: $q('input[data-block="pii"]').checked, secrets: $q('input[data-block="secrets"]').checked,
            financial: $q('input[data-block="financial"]').checked, medical: $q('input[data-block="medical"]').checked
        },
        departments: (currentSettings && currentSettings.departments) || [],
        customRules: (currentSettings && currentSettings.customRules) || []
    };
}

async function putSettings() {
    const data = buildSettingsPayload();
    await api('/api/settings', { method: 'PUT', body: JSON.stringify({ data }) });
    currentSettings = data;
}

async function saveSettings() {
    try {
        await putSettings();
        const el = $('toggle-saved'); el.textContent = '✓ Saved — employees pick this up within ~30s.';
        setTimeout(() => { el.textContent = ''; }, 2500);
    } catch (e) { $('toggle-saved').textContent = 'Error: ' + e.message; }
}
document.querySelectorAll('#toggles input').forEach(inp => inp.addEventListener('change', saveSettings));

// ---------- Rules & Departments page ----------
function renderRules() {
    if (!currentSettings) return;
    const depts = currentSettings.departments || [];
    const rules = currentSettings.customRules || [];

    const chips = $('dept-chips');
    chips.innerHTML = depts.length
        ? depts.map(d => `<span class="chip">${esc(d)}<button data-dept="${esc(d)}" title="Remove">×</button></span>`).join('')
        : '<span class="empty">No departments yet.</span>';
    chips.querySelectorAll('button[data-dept]').forEach(b => b.onclick = () => removeDept(b.dataset.dept));

    const sel = $('rule-dept');
    sel.innerHTML = '<option value="all">All departments</option>' + depts.map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join('');

    const tb = $('rules-tbody');
    tb.innerHTML = rules.length
        ? rules.map(r => `<tr><td>${esc(r.name)}</td><td>${esc(r.type)}</td><td><code>${esc(r.pattern)}</code></td><td>${esc(r.action)}</td><td>${esc(r.department)}</td><td><button class="link-del" data-id="${esc(r.id)}">Delete</button></td></tr>`).join('')
        : '<tr><td colspan="6" class="empty">No custom rules yet.</td></tr>';
    tb.querySelectorAll('button[data-id]').forEach(b => b.onclick = () => deleteRule(b.dataset.id));
}

function flashNote(id, msg, isErr) {
    const el = $(id); if (!el) return;
    el.textContent = msg; el.style.color = isErr ? 'var(--red)' : 'var(--green)';
    if (!isErr) setTimeout(() => { el.textContent = ''; }, 2000);
}
async function addDept() {
    const v = $('dept-input').value.trim();
    if (!v) return;
    currentSettings.departments = currentSettings.departments || [];
    if (!currentSettings.departments.includes(v)) currentSettings.departments.push(v);
    $('dept-input').value = '';
    try { await putSettings(); renderRules(); flashNote('dept-note', '✓ Saved.'); }
    catch (e) { flashNote('dept-note', 'Error: ' + e.message, true); }
}
async function removeDept(d) {
    currentSettings.departments = (currentSettings.departments || []).filter(x => x !== d);
    try { await putSettings(); renderRules(); } catch (e) { flashNote('dept-note', 'Error: ' + e.message, true); }
}
async function addRule() {
    const name = $('rule-name').value.trim(), type = $('rule-type').value,
          pattern = $('rule-pattern').value.trim(), action = $('rule-action').value, department = $('rule-dept').value;
    if (!name || !pattern) { flashNote('rule-note', 'Name and pattern are required.', true); return; }
    if (type === 'regex') { try { new RegExp(pattern); } catch (e) { flashNote('rule-note', 'Invalid regex pattern.', true); return; } }
    currentSettings.customRules = currentSettings.customRules || [];
    currentSettings.customRules.push({ id: 'r' + Date.now().toString(36), name, type, pattern, action, department });
    try {
        await putSettings(); renderRules();
        $('rule-name').value = ''; $('rule-pattern').value = '';
        flashNote('rule-note', '✓ Rule added — live for employees within ~30s.');
    } catch (e) { flashNote('rule-note', 'Error: ' + e.message, true); }
}
async function deleteRule(id) {
    currentSettings.customRules = (currentSettings.customRules || []).filter(r => r.id !== id);
    try { await putSettings(); renderRules(); } catch (e) { flashNote('rule-note', 'Error: ' + e.message, true); }
}
$('dept-add').onclick = addDept;
$('rule-add').onclick = addRule;

// ---------- contact ----------
$('contact-form').onsubmit = (e) => {
    e.preventDefault();
    const name = $('c-name').value.trim(), email = $('c-email').value.trim(), message = $('c-message').value.trim();
    window.location.href = `mailto:support@airlock.com?subject=${encodeURIComponent('Airlock enquiry from ' + name)}&body=${encodeURIComponent(message + '\n\n— ' + name + ' (' + email + ')')}`;
    $('contact-note').textContent = 'Opening your email client…';
    setTimeout(() => { $('contact-note').textContent = ''; }, 3000);
};

// ---------- compliance reports ----------
let lastReport = null;
const todayStr = () => new Date().toISOString().slice(0, 10);
const daysAgoStr = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

function initReportDates() {
    if (!$('rep-from').value) $('rep-from').value = daysAgoStr(29);
    if (!$('rep-to').value) $('rep-to').value = todayStr();
}

async function generateReport() {
    const from = $('rep-from').value || daysAgoStr(29);
    const to = $('rep-to').value || todayStr();
    $('rep-note').textContent = 'Generating…';
    let r;
    try { r = await api(`/api/report?from=${from}&to=${to}`); }
    catch (e) { $('rep-note').textContent = 'Error: ' + e.message; return; }
    lastReport = r;
    renderReport(r);
    $('rep-pdf').disabled = false;
    $('rep-csv').disabled = false;
    $('rep-note').textContent = `Report ready — ${fmt(r.totals.prompts)} prompts in range.`;
}

function renderReport(r) {
    const org = $('set-org').textContent || $('sb-org').textContent || 'Organization';
    const admin = $('set-email').textContent || '';
    const t = r.totals;
    const reportId = 'AIR-' + r.range.from.replace(/-/g, '') + '-' + r.range.to.replace(/-/g, '');
    const generated = new Date().toLocaleString();

    // Grammatical helpers so single-value periods read correctly ("1 prompt", not "1 prompts").
    const P = (n, s, pl) => (Number(n) === 1 ? s : (pl || s + 's'));
    const wasWere = (n) => (Number(n) === 1 ? 'was' : 'were');
    const ep = t.exposuresPrevented, red = t.redactions, blk = t.blocks, pr = t.prompts, ue = t.uniqueEmployees;

    const regRows = [
        ['DPDP Act, 2023 (India) — §8(5): reasonable security safeguards to prevent personal data breach',
         `${fmt(ep)} ${P(ep, 'prompt')} containing sensitive data ${wasWere(ep)} redacted or blocked on-device before transmission to third-party AI processors.`],
        ['GDPR — Art. 5(1)(c) data minimisation; Art. 32 security of processing',
         `${fmt(red)} ${P(red, 'prompt')} redacted and ${fmt(blk)} blocked; ${pr === 1 ? '' : 'all '}${fmt(pr)} ${P(pr, 'interaction')} logged with category-level audit metadata (prompt content is never stored).`],
        ['EU AI Act — deployer obligations for oversight & record-keeping of AI use',
         `Employee use of third-party AI tools monitored across ${fmt(ue)} ${P(ue, 'user')}, with a tamper-evident, metadata-only audit trail.`]
    ];

    const byCat = r.byCategory.length
        ? r.byCategory.map(c => `<tr><td>${esc(c.category.toUpperCase())}</td><td>${fmt(c.count)}</td></tr>`).join('')
        : '<tr><td colspan="2" class="rep-empty">No detections in range.</td></tr>';

    const perEmp = r.perEmployee.length
        ? r.perEmployee.map(e => `<tr><td>${esc(e.email)}</td><td>${fmt(e.prompts)}</td><td>${fmt(e.redactions)}</td><td>${fmt(e.tokensSaved)}</td></tr>`).join('')
        : '<tr><td colspan="4" class="rep-empty">No employee activity in range.</td></tr>';

    $('report-doc').style.display = 'block';
    $('report-doc').innerHTML = `
        <div class="rep-letterhead">
            <div class="rep-brand">🛡️ Airlock</div>
            <div class="rep-id">Report ID: ${esc(reportId)}</div>
        </div>
        <h1 class="rep-title">AI Data-Handling Compliance Report</h1>
        <div class="rep-meta">
            <div><strong>Organization:</strong> ${esc(org)}</div>
            <div><strong>Prepared for:</strong> ${esc(admin)}</div>
            <div><strong>Period:</strong> ${esc(r.range.from)} to ${esc(r.range.to)}</div>
            <div><strong>Generated:</strong> ${esc(generated)}</div>
        </div>

        <div class="rep-cards">
            <div class="rep-card"><div class="rep-card-v">${fmt(t.prompts)}</div><div class="rep-card-l">Prompts Screened</div></div>
            <div class="rep-card"><div class="rep-card-v">${fmt(t.exposuresPrevented)}</div><div class="rep-card-l">Exposures Prevented</div></div>
            <div class="rep-card"><div class="rep-card-v">${fmt(t.uniqueEmployees)}</div><div class="rep-card-l">Employees Covered</div></div>
            <div class="rep-card"><div class="rep-card-v">${fmt(t.tokensSaved)}</div><div class="rep-card-l">Tokens Saved</div></div>
        </div>

        <h2 class="rep-h2">Regulatory Control Mapping</h2>
        <table class="rep-table"><thead><tr><th>Control</th><th>Evidence in this period</th></tr></thead>
            <tbody>${regRows.map(([c, e]) => `<tr><td>${esc(c)}</td><td>${esc(e)}</td></tr>`).join('')}</tbody>
        </table>

        <div class="rep-2col">
            <div>
                <h2 class="rep-h2">Detection by Category</h2>
                <table class="rep-table"><thead><tr><th>Category</th><th>Prompts</th></tr></thead><tbody>${byCat}</tbody></table>
                <div class="rep-cap">Number of prompts in which each sensitive-data category was detected. A single prompt may span multiple categories, so totals can exceed the prompt count.</div>
            </div>
            <div>
                <h2 class="rep-h2">Decision Breakdown</h2>
                <table class="rep-table"><tbody>
                    <tr><td>Redacted</td><td>${fmt(t.redactions)}</td></tr>
                    <tr><td>Blocked</td><td>${fmt(t.blocks)}</td></tr>
                    <tr><td>Optimized</td><td>${fmt(t.optimized)}</td></tr>
                    <tr><td>Allowed (clean)</td><td>${fmt(t.allowed)}</td></tr>
                    <tr class="rep-total"><td>Total prompts screened</td><td>${fmt(t.redactions + t.blocks + t.optimized + t.allowed)}</td></tr>
                </tbody></table>
            </div>
        </div>

        <h2 class="rep-h2">Activity by Employee</h2>
        <table class="rep-table"><thead><tr><th>Employee</th><th>Prompts</th><th>Redactions</th><th>Tokens Saved</th></tr></thead><tbody>${perEmp}</tbody></table>

        <div class="rep-attest">
            <strong>Privacy attestation.</strong> All detection and redaction is performed entirely on the employee's device before any data reaches a third-party AI service. This report and the underlying audit log contain only privacy-safe metadata — detection categories, counts, timestamps, and destination host — and never the sensitive values themselves.
        </div>
        <div class="rep-disclaimer">Airlock provides technical controls and audit evidence to support compliance programs. It is not a substitute for legal review or formal certification.</div>
    `;
}

function downloadCsv() {
    if (!lastReport) return;
    const header = ['Date', 'Employee', 'Decision', 'Findings', 'Tokens Saved', 'Categories', 'Host'];
    const escCsv = (v) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const lines = [header.join(',')];
    for (const e of lastReport.events) {
        lines.push([e.createdAt, e.email, e.decision, e.findingsCount, e.tokensSaved, (e.categories || []).join('|'), e.host || ''].map(escCsv).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `airlock-report-${lastReport.range.from}_${lastReport.range.to}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
}

$('rep-generate').onclick = generateReport;
$('rep-pdf').onclick = () => window.print();
$('rep-csv').onclick = downloadCsv;

// ---------- boot ----------
setMode('login');
initReportDates();
if (getToken()) enterDashboard();
