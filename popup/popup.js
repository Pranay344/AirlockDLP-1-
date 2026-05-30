const DEFAULT_BACKEND = 'http://localhost:4000';
const $ = (id) => document.getElementById(id);

let savedDepartment = '';

function setStatus(state, text) {
    const dot = $('dot');
    dot.className = 'dot' + (state === 'ok' ? ' ok' : state === 'pending' ? ' pending' : '');
    $('status-text').textContent = text;
}

function populateDepartments(departments) {
    const sel = $('department');
    const current = sel.value || savedDepartment || '';
    sel.innerHTML = '<option value="">General</option>';
    if (Array.isArray(departments)) {
        for (const d of departments) {
            const opt = document.createElement('option');
            opt.value = d;
            opt.textContent = d;
            sel.appendChild(opt);
        }
    }
    // Restore the saved/selected department if it's still a valid option.
    sel.value = [...sel.options].some(o => o.value === current) ? current : '';
}

function renderToggles(settings) {
    if (!settings) { $('toggles-view').style.display = 'none'; return; }
    const rows = [
        ['Token Optimizer', settings.tokenOptimizer],
        ['NER Detection', settings.nerDetection],
        ['Reinjection', settings.reinjection],
        ['PII', settings.categories && settings.categories.pii],
        ['Secrets', settings.categories && settings.categories.secrets],
        ['Financial', settings.categories && settings.categories.financial],
        ['Medical', settings.categories && settings.categories.medical]
    ];
    $('toggles-list').innerHTML = rows.map(([label, on]) =>
        `<li><span>${label}</span><span class="${on ? 'tag-on' : 'tag-off'}">${on ? 'ON' : 'OFF'}</span></li>`
    ).join('');
    $('toggles-view').style.display = 'block';
}

async function checkConnection(backendUrl, orgCode) {
    if (!orgCode) { setStatus('off', 'Not connected'); renderToggles(null); return; }
    setStatus('pending', 'Checking…');
    try {
        const res = await fetch(`${backendUrl}/api/public-settings?orgCode=${encodeURIComponent(orgCode)}`);
        if (!res.ok) throw new Error('bad org code');
        const body = await res.json();
        setStatus('ok', 'Connected');
        populateDepartments(body.data && body.data.departments);
        renderToggles(body.data);
    } catch (e) {
        setStatus('off', 'Cannot reach backend / bad code');
        renderToggles(null);
    }
}

// Load saved config
chrome.storage.local.get('airlockConfig', (data) => {
    const cfg = data.airlockConfig || {};
    $('email').value = cfg.email || '';
    $('orgCode').value = cfg.orgCode || '';
    $('backendUrl').value = cfg.backendUrl || DEFAULT_BACKEND;
    savedDepartment = cfg.department || '';
    populateDepartments([]); // shows "General" until the fetch fills real departments
    checkConnection($('backendUrl').value, cfg.orgCode);
});

$('save').onclick = () => {
    const email = $('email').value.trim();
    const orgCode = $('orgCode').value.trim().toUpperCase();
    const backendUrl = ($('backendUrl').value.trim() || DEFAULT_BACKEND).replace(/\/+$/, '');
    const department = $('department').value || '';
    const msg = $('msg');

    if (!email || !orgCode) {
        msg.className = 'msg err';
        msg.textContent = 'Enter your work email and org code.';
        return;
    }

    savedDepartment = department;
    const config = { email, orgCode, backendUrl, department };
    chrome.storage.local.set({ airlockConfig: config }, () => {
        msg.className = 'msg ok';
        msg.textContent = 'Saved.';
        setTimeout(() => { msg.textContent = ''; }, 2000);
        try { chrome.runtime.sendMessage({ type: 'AIRLOCK_CONFIG_UPDATED' }); } catch (e) {}
        checkConnection(backendUrl, orgCode);
    });
};
