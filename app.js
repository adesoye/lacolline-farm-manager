/* =============================================
   LACOLINE PIG FARM MANAGER — APPLICATION JS
   ============================================= */

// ===================== DATA LAYER =====================
const DB_KEY  = 'lacoline_farm_v1';
const SES_KEY = 'lacoline_session';

function loadDB() {
  try { return JSON.parse(localStorage.getItem(DB_KEY)) || defaultDB(); }
  catch { return defaultDB(); }
}
function defaultDB() {
  return {
    pigs: [], events: [], feedLogs: [], purchases: [],
    weights: [], transactions: [], feedReorderLevels: {}, monthlyInputs: [],
    users: [
      {
        id: 'usr_admin', username: 'admin', password: 'admin123',
        fullName: 'Administrator', role: 'admin',
        createdAt: '2026-01-01', lastLogin: null, active: true
      }
    ]
  };
}
function saveDB() { localStorage.setItem(DB_KEY, JSON.stringify(db)); }

let db = loadDB();

function uid()      { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function today()    { return new Date().toISOString().slice(0, 10); }
function fmt(n, d=0){ return Number(n||0).toLocaleString('en-NG', {minimumFractionDigits:d, maximumFractionDigits:d}); }
function fmtMoney(n){ return '₦' + fmt(n, 2); }
function esc(s)     { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ===================== AUTH =====================
let currentUser = null;
const SES_TOKEN_KEY = 'lacoline_session_token';

function getApiBase() {
  try { if (typeof API_BASE !== 'undefined' && API_BASE) return API_BASE; } catch {}
  return '/api';
}

function shouldUseAuthApi() {
  return location.protocol === 'http:' || location.protocol === 'https:';
}

function getAuthToken() {
  return sessionStorage.getItem(SES_TOKEN_KEY);
}

async function authApiRequest(path, options = {}) {
  const token = getAuthToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(getApiBase() + path, { ...options, headers });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const err = await res.json();
      if (err?.error) msg = err.error;
    } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

function setSession(user, token) {
  currentUser = { id: user.id, username: user.username, fullName: user.fullName, role: user.role };
  sessionStorage.setItem(SES_KEY, JSON.stringify(currentUser));
  if (token) sessionStorage.setItem(SES_TOKEN_KEY, token);
}

async function doLogin(e) {
  e.preventDefault();
  const username = document.getElementById('login-username').value.trim().toLowerCase();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');

  if (shouldUseAuthApi()) {
    try {
      const resp = await authApiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      errEl.classList.remove('show');
      setSession(resp.user, resp.token);
      showApp();
      return;
    } catch {
      errEl.classList.add('show');
      document.getElementById('login-password').value = '';
      return;
    }
  }

  if (!db.users) db.users = [];
  const user = db.users.find(u => u.username.toLowerCase() === username && u.password === password && u.active !== false);

  if (!user) {
    errEl.classList.add('show');
    document.getElementById('login-password').value = '';
    return;
  }
  errEl.classList.remove('show');

  // Record last login
  user.lastLogin = today();
  saveDB();

  // Store session
  setSession(user);

  showApp();
}

function doLogout() {
  if (!confirm('Sign out of Lacoline Farm?')) return;
  currentUser = null;
  sessionStorage.removeItem(SES_KEY);
  sessionStorage.removeItem(SES_TOKEN_KEY);
  document.getElementById('login-username').value = '';
  document.getElementById('login-password').value = '';
  document.getElementById('app').classList.remove('visible');
  document.getElementById('login-screen').classList.remove('hidden');
  document.body.classList.remove('is-admin','is-manager','is-user');
}

function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  const app = document.getElementById('app');
  app.classList.add('visible');

  // Apply role class to body for CSS-driven visibility
  document.body.classList.remove('is-admin','is-manager','is-user');
  document.body.classList.add('is-' + currentUser.role);

  // Populate sidebar user info
  const initials = currentUser.fullName.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  document.getElementById('sidebar-avatar').textContent = initials;
  document.getElementById('sidebar-uname').textContent  = currentUser.fullName;
  document.getElementById('sidebar-urole').textContent  =
    currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1);

  renderDashboard();
  showPage('dashboard');
}

async function checkSession() {
  try {
    const saved = sessionStorage.getItem(SES_KEY);
    const token = sessionStorage.getItem(SES_TOKEN_KEY);

    if (shouldUseAuthApi() && token) {
      const me = await authApiRequest('/auth/me', { method: 'GET' });
      setSession(me.user, token);
      showApp();
      return;
    }

    if (saved) {
      currentUser = JSON.parse(saved);
      showApp();
    }
  } catch { /* no session */ }
}

function isAdmin()   { return currentUser?.role === 'admin'; }
function isManager() { return currentUser?.role === 'admin' || currentUser?.role === 'manager'; }

function requireAdmin(action) {
  if (!isAdmin()) { alert('This action requires Admin access.'); return false; }
  return true;
}

function togglePw(inputId, btn) {
  const el = document.getElementById(inputId);
  if (el.type === 'password') { el.type = 'text';     btn.textContent = '🙈'; }
  else                        { el.type = 'password'; btn.textContent = '👁'; }
}

// ===================== USER MANAGEMENT =====================
async function addUser() {
  if (!requireAdmin()) return;
  const fullName = document.getElementById('usr-fullname').value.trim();
  const username = document.getElementById('usr-username').value.trim().toLowerCase();
  const role     = document.getElementById('usr-role').value;
  const pw       = document.getElementById('usr-pw').value;
  const pw2      = document.getElementById('usr-pw2').value;

  if (!fullName || !username || !pw) return alert('Full name, username, and password are required.');
  if (pw !== pw2) return alert('Passwords do not match.');
  if (pw.length < 6) return alert('Password must be at least 6 characters.');

  if (shouldUseAuthApi()) {
    try {
      const created = await authApiRequest('/users', {
        method: 'POST',
        body: JSON.stringify({ fullName, username, role, password: pw })
      });
      db.users = db.users || [];
      db.users.unshift(created);
      saveDB();
    } catch (error) {
      return alert(error.message || 'Failed to create user.');
    }
  } else {
    if (db.users.find(u => u.username.toLowerCase() === username)) return alert('Username already exists.');
    db.users.push({
      id: uid(), username, password: pw, fullName, role,
      createdAt: today(), lastLogin: null, active: true
    });
    saveDB();
  }

  ['usr-fullname','usr-username','usr-pw','usr-pw2'].forEach(id => document.getElementById(id).value = '');
  showToast(`User "${fullName}" created!`);
  renderUserList(); populateUserSelects();
}

async function deleteUser(id) {
  if (!requireAdmin()) return;
  if (id === currentUser.id) return alert('You cannot delete your own account.');
  const u = db.users.find(u => u.id === id);
  if (!confirm(`Delete user "${u?.fullName}"? This cannot be undone.`)) return;

  if (shouldUseAuthApi()) {
    try {
      await authApiRequest(`/users/${id}`, { method: 'DELETE' });
    } catch (error) {
      return alert(error.message || 'Failed to delete user.');
    }
  }

  db.users = db.users.filter(u => u.id !== id);
  saveDB(); renderUserList(); populateUserSelects(); showToast('User deleted.');
}

async function toggleUserActive(id) {
  if (!requireAdmin()) return;
  if (id === currentUser.id) return alert('You cannot deactivate your own account.');
  const u = db.users.find(u => u.id === id);
  if (!u) return;

  if (shouldUseAuthApi()) {
    try {
      const updated = await authApiRequest(`/users/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !u.active })
      });
      u.active = updated.active;
    } catch (error) {
      return alert(error.message || 'Failed to update user status.');
    }
  } else {
    u.active = !u.active;
  }

  saveDB(); renderUserList(); showToast(`User ${u.active ? 'activated' : 'deactivated'}.`);
}

async function changePassword() {
  const targetId = document.getElementById('usr-pw-target').value;
  const newPw    = document.getElementById('usr-new-pw').value;
  const newPw2   = document.getElementById('usr-new-pw2').value;

  // Non-admins can only change their own password
  if (!isAdmin() && targetId !== currentUser.id) return alert('You can only change your own password.');
  if (!newPw) return alert('New password is required.');
  if (newPw.length < 6) return alert('Password must be at least 6 characters.');
  if (newPw !== newPw2) return alert('Passwords do not match.');

  if (shouldUseAuthApi()) {
    try {
      await authApiRequest(`/users/${targetId}/password`, {
        method: 'PATCH',
        body: JSON.stringify({ newPassword: newPw })
      });
      ['usr-new-pw','usr-new-pw2'].forEach(id => document.getElementById(id).value = '');
      showToast('Password updated.');
      return;
    } catch (error) {
      return alert(error.message || 'Failed to update password.');
    }
  }

  const u = db.users.find(u => u.id === targetId);
  if (!u) return alert('User not found.');
  u.password = newPw;
  saveDB();
  ['usr-new-pw','usr-new-pw2'].forEach(id => document.getElementById(id).value = '');
  showToast(`Password updated for ${u.fullName}.`);
}

async function renderUserList() {
  const tbody = document.getElementById('usr-list-tbody');
  if (!tbody) return;

  if (shouldUseAuthApi()) {
    try {
      const users = await authApiRequest('/users', { method: 'GET' });
      db.users = Array.isArray(users) ? users : [];
      saveDB();
    } catch (error) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty">${esc(error.message || 'Failed to load users.')}</div></td></tr>`;
      return;
    }
  }

  if (!db.users?.length) { tbody.innerHTML = `<tr><td colspan="7"><div class="empty">No users found.</div></td></tr>`; return; }
  const ROLE_COLORS = { admin:'role-admin', manager:'role-manager', user:'role-user' };
  tbody.innerHTML = db.users.map(u => `
    <tr style="opacity:${u.active===false?0.5:1}">
      <td>
        <span class="user-avatar-sm">${u.fullName.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}</span>
        <strong>${esc(u.fullName)}</strong>
        ${u.id === currentUser?.id ? '<span class="chip" style="margin-left:4px">You</span>' : ''}
      </td>
      <td>${esc(u.username)}</td>
      <td><span class="role-badge ${ROLE_COLORS[u.role]||'role-user'}">${u.role}</span></td>
      <td>${u.createdAt||'-'}</td>
      <td>${u.lastLogin||'Never'}</td>
      <td>${u.active===false
        ? '<span class="badge badge-dead">Inactive</span>'
        : '<span class="badge badge-active">Active</span>'}</td>
      <td style="display:flex;gap:6px;flex-wrap:wrap">
        ${u.id !== currentUser?.id ? `
          <button class="btn btn-outline btn-sm" onclick="toggleUserActive('${u.id}')" title="${u.active===false?'Activate':'Deactivate'}">
            ${u.active===false?'✅':'🚫'}
          </button>
          <button class="btn btn-danger btn-sm" onclick="deleteUser('${u.id}')" title="Delete">🗑</button>
        ` : '<span class="text-muted" style="font-size:0.75rem">—</span>'}
      </td>
    </tr>`).join('');
}

function populateUserSelects() {
  const sel = document.getElementById('usr-pw-target');
  if (!sel) return;
  const users = isAdmin() ? db.users : db.users.filter(u => u.id === currentUser?.id);
  sel.innerHTML = users.map(u => `<option value="${u.id}">${esc(u.fullName)} (${u.role})</option>`).join('');
}

// ===================== NAVIGATION =====================
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#nav a').forEach(a => a.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelector(`[data-page="${page}"]`).classList.add('active');

  if (page === 'dashboard')  renderDashboard();
  if (page === 'pigs')       { renderPigTable(); renderEventTable(); populatePigSelects(); }
  if (page === 'feed-log')   { populatePigSelects(); renderFeedHistory(); renderFeedSummary(); }
  if (page === 'feed-stock') { renderStockLevels(); renderPurchaseHistory(); }
  if (page === 'weights')    { populatePigSelects(); renderWeightHistory(); renderGrowthAnalysis(); }
  if (page === 'finance')    { updateFinCategories(); renderLedger(); renderFinSummary(); }
  if (page === 'monthly')    { populatePigSelects(); renderMonthlyHistory(); renderMonthlySummary(); }
  if (page === 'reports')    renderReport();
  if (page === 'users')      { if (!isAdmin()) { showPage('dashboard'); return; } renderUserList(); populateUserSelects(); }

  document.getElementById('sidebar').classList.remove('open');
}

function switchTab(ns, tab) {
  const pageId = { pigs:'pigs', feed:'feed-log', stock:'feed-stock', wt:'weights', fin:'finance', mon:'monthly', usr:'users' }[ns];
  document.querySelectorAll(`#page-${pageId} .tab`).forEach(t => t.classList.remove('active'));
  document.querySelectorAll(`#page-${pageId} .tab-panel`).forEach(p => p.classList.remove('active'));
  event.target.classList.add('active');

  const panelMap = {
    pigs:  { list:'pigs-tab-list',   add:'pigs-tab-add',        event:'pigs-tab-event' },
    feed:  { log:'feed-tab-log',     history:'feed-tab-history', summary:'feed-tab-summary' },
    stock: { levels:'stock-tab-levels', purchase:'stock-tab-purchase', history:'stock-tab-history' },
    wt:    { add:'wt-tab-add',       history:'wt-tab-history',   growth:'wt-tab-growth' },
    fin:   { add:'fin-tab-add',      ledger:'fin-tab-ledger',    summary:'fin-tab-summary' },
    mon:   { add:'mon-tab-add',      history:'mon-tab-history',  summary:'mon-tab-summary' },
    usr:   { list:'usr-tab-list',    add:'usr-tab-add',          pw:'usr-tab-pw' },
  };
  document.getElementById(panelMap[ns][tab]).classList.add('active');

  if (ns==='pigs'  && tab==='event')   populatePigSelects();
  if (ns==='feed'  && tab==='history') renderFeedHistory();
  if (ns==='feed'  && tab==='summary') renderFeedSummary();
  if (ns==='stock' && tab==='levels')  renderStockLevels();
  if (ns==='stock' && tab==='history') renderPurchaseHistory();
  if (ns==='wt'    && tab==='history') renderWeightHistory();
  if (ns==='wt'    && tab==='growth')  renderGrowthAnalysis();
  if (ns==='fin'   && tab==='ledger')  renderLedger();
  if (ns==='fin'   && tab==='summary') renderFinSummary();
  if (ns==='mon'   && tab==='history') renderMonthlyHistory();
  if (ns==='mon'   && tab==='summary') renderMonthlySummary();
  if (ns==='usr'   && tab==='list')    renderUserList();
  if (ns==='usr'   && tab==='add')     { /* form, no render needed */ }
  if (ns==='usr'   && tab==='pw')      populateUserSelects();
}

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }

// ===================== DASHBOARD =====================
function renderDashboard() {
  document.getElementById('dash-date').textContent =
    new Date().toLocaleDateString('en-NG', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

  const activePigs   = db.pigs.filter(p => p.status === 'active').length;
  const totalFeedToday = db.feedLogs.filter(l => l.date === today()).reduce((s,l) => s + l.amount, 0);
  const income       = db.transactions.filter(t => t.type === 'income').reduce((s,t) => s + t.amount, 0);
  const expense      = db.transactions.filter(t => t.type === 'expense').reduce((s,t) => s + t.amount, 0);
  const thisMonth    = new Date().toISOString().slice(0,7);
  const monthExpense = db.transactions.filter(t => t.type==='expense' && t.date.startsWith(thisMonth)).reduce((s,t) => s + t.amount, 0);

  document.getElementById('dash-stats').innerHTML = `
    <div class="stat-card"><div class="val">${activePigs}</div><div class="lbl">Active Pigs</div></div>
    <div class="stat-card accent"><div class="val">${fmt(totalFeedToday,1)} kg</div><div class="lbl">Feed Today</div></div>
    <div class="stat-card green"><div class="val">${fmtMoney(income)}</div><div class="lbl">Total Income</div></div>
    <div class="stat-card red"><div class="val">${fmtMoney(expense)}</div><div class="lbl">Total Expenses</div></div>
    <div class="stat-card ${income-expense>=0?'green':'red'}"><div class="val">${fmtMoney(Math.abs(income-expense))}</div><div class="lbl">${income-expense>=0?'Net Profit':'Net Loss'}</div></div>
    <div class="stat-card"><div class="val">${fmtMoney(monthExpense)}</div><div class="lbl">This Month Spend</div></div>`;

  // Recent feed
  const recentFeed = [...db.feedLogs].sort((a,b) => b.date.localeCompare(a.date)).slice(0,5);
  document.getElementById('dash-feed-recent').innerHTML = recentFeed.length
    ? recentFeed.map(l => {
        const pig = db.pigs.find(p => p.id === l.pigId);
        return `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:0.83rem">
          <span>${l.date} · ${pig ? pig.tag : '?'}</span><strong>${l.amount}kg ${l.feedType}</strong></div>`;
      }).join('')
    : `<div class="empty">No feed records yet.</div>`;

  // Stock + medication alerts
  const stockAlerts = FEED_TYPES.map(ft => {
    const bal = getStockBalance(ft);
    const rl  = db.feedReorderLevels[ft] || 0;
    return rl > 0 && bal <= rl ? { ft, bal, rl } : null;
  }).filter(Boolean);

  const due30 = new Date(); due30.setDate(due30.getDate() + 30);
  const dueSoon = (db.monthlyInputs || [])
    .filter(r => r.nextDue && new Date(r.nextDue) <= due30 && new Date(r.nextDue) >= new Date(today()))
    .sort((a,b) => a.nextDue.localeCompare(b.nextDue));

  let alertsHTML = stockAlerts.map(a =>
    `<div class="alert alert-warning">⚠ <strong>${a.ft}</strong>: ${fmt(a.bal,1)}kg remaining (reorder at ${fmt(a.rl,1)}kg)</div>`
  ).join('');
  alertsHTML += dueSoon.map(r =>
    `<div class="alert alert-warning">⏰ <strong>${esc(r.product)}</strong> (${r.category}) due ${r.nextDue}</div>`
  ).join('');
  document.getElementById('dash-stock-alerts').innerHTML = alertsHTML || `<div class="empty">✅ All stock levels OK.</div>`;

  // Recent transactions
  const recentTxns = [...db.transactions].sort((a,b) => b.date.localeCompare(a.date)).slice(0,5);
  document.getElementById('dash-finance-recent').innerHTML = recentTxns.length
    ? recentTxns.map(t => `
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:0.83rem">
          <span>${t.date} · ${esc(t.description).slice(0,30)}</span>
          <strong class="${t.type==='income'?'text-success':'text-danger'}">${fmtMoney(t.amount)}</strong>
        </div>`).join('')
    : `<div class="empty">No transactions yet.</div>`;

  // Recent weights
  const recentWts = [...db.weights].sort((a,b) => b.date.localeCompare(a.date)).slice(0,5);
  document.getElementById('dash-weights-recent').innerHTML = recentWts.length
    ? recentWts.map(w => {
        const pig = db.pigs.find(p => p.id === w.pigId);
        return `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:0.83rem">
          <span>${w.date} · ${pig ? pig.tag : '?'}</span><strong>${fmt(w.weight,1)} kg</strong></div>`;
      }).join('')
    : `<div class="empty">No weight records yet.</div>`;
}

// ===================== PIG INVENTORY =====================
function addPig() {
  const tag = document.getElementById('pig-tag').value.trim();
  if (!tag) return alert('Tag/ID is required.');
  if (db.pigs.find(p => p.tag === tag)) return alert('A pig with this tag already exists.');
  const dob = document.getElementById('pig-dob').value;
  if (!dob) return alert('Date is required.');

  const initWeight = parseFloat(document.getElementById('pig-init-weight').value) || null;
  const pig = {
    id: uid(), tag,
    name:          document.getElementById('pig-name').value.trim(),
    type:          document.getElementById('pig-type').value,
    breed:         document.getElementById('pig-breed').value.trim(),
    dob,
    source:        document.getElementById('pig-source').value,
    purchasePrice: parseFloat(document.getElementById('pig-price').value) || 0,
    notes:         document.getElementById('pig-notes').value.trim(),
    status: 'active', createdAt: today()
  };
  db.pigs.push(pig);
  if (initWeight) {
    db.weights.push({ id: uid(), pigId: pig.id, date: dob, weight: initWeight, bcs: '', notes: 'Initial weight', createdAt: today() });
  }
  saveDB();
  ['pig-tag','pig-name','pig-breed','pig-price','pig-init-weight','pig-notes'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('pig-dob').value = '';
  showToast(`Pig ${tag} registered!`);
  renderPigTable();
}

function renderPigTable() {
  const search  = (document.getElementById('pig-search')?.value || '').toLowerCase();
  const statusF = document.getElementById('pig-filter-status')?.value || '';
  const typeF   = document.getElementById('pig-filter-type')?.value || '';
  const tbody   = document.getElementById('pig-tbody');

  let pigs = db.pigs.filter(p => {
    if (search  && !p.tag.toLowerCase().includes(search) && !(p.name||'').toLowerCase().includes(search)) return false;
    if (statusF && p.status !== statusF) return false;
    if (typeF   && p.type   !== typeF)   return false;
    return true;
  });

  if (!pigs.length) { tbody.innerHTML = `<tr><td colspan="7"><div class="empty">No pigs found.</div></td></tr>`; return; }
  tbody.innerHTML = pigs.map(p => `
    <tr>
      <td><strong>${esc(p.tag)}</strong></td>
      <td>${esc(p.name||'-')}</td>
      <td><span class="badge badge-${p.type}">${p.type}</span></td>
      <td>${p.dob}</td>
      <td><span class="badge badge-${p.status}">${p.status}</span></td>
      <td class="text-muted" style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.notes||'-')}</td>
      <td><button class="btn btn-danger btn-sm" onclick="deletePig('${p.id}')">🗑</button></td>
    </tr>`).join('');
}

function deletePig(id) {
  if (!confirm('Delete this pig? This will also remove all its records.')) return;
  db.pigs     = db.pigs.filter(p => p.id !== id);
  db.feedLogs = db.feedLogs.filter(f => f.pigId !== id);
  db.weights  = db.weights.filter(w => w.pigId !== id);
  db.events   = db.events.filter(e => e.pigId !== id);
  saveDB(); renderPigTable(); showToast('Pig deleted.');
}

function populatePigSelects() {
  const active = db.pigs.filter(p => p.status === 'active');
  const all    = db.pigs;
  const opts   = arr => arr.map(pig => `<option value="${pig.id}">${esc(pig.tag)}${pig.name ? ' - ' + pig.name : ''}</option>`).join('');

  ['event-pig-id','fl-pig','wt-pig','wt-hist-pig','wt-growth-pig','fl-hist-pig','mon-specific-pig'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const prev   = el.value;
    const hasAll = ['wt-hist-pig','wt-growth-pig','fl-hist-pig'].includes(id);
    el.innerHTML = (hasAll ? '<option value="">All Pigs</option>' : '') + opts(hasAll ? all : active);
    if (prev) el.value = prev;
  });
}

function recordEvent() {
  const pigId = document.getElementById('event-pig-id').value;
  if (!pigId) return alert('Select a pig.');
  const type = document.getElementById('event-type').value;
  const date = document.getElementById('event-date').value;
  if (!date) return alert('Date is required.');

  const pig = db.pigs.find(p => p.id === pigId);
  const ev  = { id: uid(), pigId, date, type, notes: document.getElementById('event-notes').value.trim(), createdAt: today() };

  if (type === 'sold') {
    ev.salePrice  = parseFloat(document.getElementById('event-sale-price').value)  || 0;
    ev.saleWeight = parseFloat(document.getElementById('event-sale-weight').value) || 0;
    pig.status = 'sold';
    if (ev.salePrice > 0) {
      db.transactions.push({ id:uid(), date, type:'income', category:'pig-sales',
        description:`Sale of pig ${pig.tag}${pig.name ? ' ('+pig.name+')' : ''}`,
        amount: ev.salePrice, method:'cash', ref:'', createdAt:today() });
    }
  } else if (type === 'dead') {
    pig.status = 'dead';
  } else if (type === 'farrowed') {
    ev.litterSize = parseInt(document.getElementById('event-litter').value) || 0;
  }

  db.events.push(ev);
  saveDB();
  renderEventTable(); renderPigTable(); populatePigSelects();
  showToast('Event recorded.');
}

function renderEventTable() {
  const tbody = document.getElementById('event-tbody');
  if (!tbody) return;
  const evs = [...db.events].sort((a,b) => b.date.localeCompare(a.date)).slice(0, 50);
  if (!evs.length) { tbody.innerHTML = `<tr><td colspan="4"><div class="empty">No events yet.</div></td></tr>`; return; }
  tbody.innerHTML = evs.map(e => {
    const pig    = db.pigs.find(p => p.id === e.pigId);
    let   detail = e.notes || '';
    if (e.type === 'sold')     detail = `₦${fmt(e.salePrice,2)} · ${e.saleWeight||0}kg`;
    if (e.type === 'farrowed') detail = `Litter: ${e.litterSize}`;
    return `<tr>
      <td>${e.date}</td>
      <td>${pig ? esc(pig.tag)+' '+esc(pig.name||'') : 'Unknown'}</td>
      <td><span class="badge badge-${e.type==='sold'?'sold':e.type==='dead'?'dead':'active'}">${e.type}</span></td>
      <td>${esc(detail)}</td>
    </tr>`;
  }).join('');
}

function toggleEventFields() {
  const t = document.getElementById('event-type').value;
  document.getElementById('event-sale-price-grp').style.display  = t === 'sold'     ? '' : 'none';
  document.getElementById('event-sale-weight-grp').style.display = t === 'sold'     ? '' : 'none';
  document.getElementById('event-litter-grp').style.display      = t === 'farrowed' ? '' : 'none';
}

// ===================== DAILY FEED LOG =====================
function addFeedLog() {
  const date   = document.getElementById('fl-date').value;
  const pigId  = document.getElementById('fl-pig').value;
  const amount = parseFloat(document.getElementById('fl-amount').value);
  if (!date || !pigId || !amount) return alert('Date, Pig, and Amount are required.');

  const feedType  = document.getElementById('fl-feed-type').value;
  const costPerKg = parseFloat(document.getElementById('fl-cost-per-kg').value) || getStockCostPerKg(feedType);
  db.feedLogs.push({
    id: uid(), date, pigId, feedType, amount, costPerKg,
    totalCost: amount * costPerKg,
    time:  document.getElementById('fl-time').value,
    notes: document.getElementById('fl-notes').value.trim(),
    createdAt: today()
  });
  saveDB();
  ['fl-amount','fl-cost-per-kg','fl-notes'].forEach(id => document.getElementById(id).value = '');
  showToast('Feed logged!');
  renderFeedHistory(); renderFeedSummary();
}

function getStockCostPerKg(feedType) {
  const p = db.purchases.filter(p => p.feedType === feedType).sort((a,b) => b.date.localeCompare(a.date));
  return p.length ? p[0].costPerKg : 0;
}

function getStockBalance(feedType) {
  const purchased = db.purchases.filter(p => p.feedType === feedType).reduce((s,p) => s + p.qty, 0);
  const consumed  = db.feedLogs.filter(f => f.feedType === feedType).reduce((s,f) => s + f.amount, 0);
  return purchased - consumed;
}

function renderFeedHistory() {
  const tbody = document.getElementById('fl-hist-tbody');
  if (!tbody) return;
  let logs = [...db.feedLogs].sort((a,b) => b.date.localeCompare(a.date));
  const from = document.getElementById('fl-hist-from')?.value;
  const to   = document.getElementById('fl-hist-to')?.value;
  const pigF = document.getElementById('fl-hist-pig')?.value;
  if (from) logs = logs.filter(l => l.date >= from);
  if (to)   logs = logs.filter(l => l.date <= to);
  if (pigF) logs = logs.filter(l => l.pigId === pigF);
  if (!logs.length) { tbody.innerHTML = `<tr><td colspan="8"><div class="empty">No feed records found.</div></td></tr>`; return; }
  tbody.innerHTML = logs.map(l => {
    const pig = db.pigs.find(p => p.id === l.pigId);
    return `<tr>
      <td>${l.date}</td>
      <td>${pig ? esc(pig.tag)+' '+(pig.name||'') : 'Unknown'}</td>
      <td><span class="chip">${l.feedType}</span></td>
      <td>${l.time||'-'}</td>
      <td>${l.amount} kg</td>
      <td>${fmtMoney(l.totalCost||0)}</td>
      <td class="text-muted">${esc(l.notes||'-')}</td>
      <td><button class="btn btn-danger btn-sm" onclick="deleteFeedLog('${l.id}')">🗑</button></td>
    </tr>`;
  }).join('');
}

function deleteFeedLog(id) {
  if (!confirm('Delete this feed record?')) return;
  db.feedLogs = db.feedLogs.filter(f => f.id !== id);
  saveDB(); renderFeedHistory(); showToast('Deleted.');
}

function clearFeedFilter() {
  ['fl-hist-from','fl-hist-to'].forEach(id => { if (document.getElementById(id)) document.getElementById(id).value=''; });
  document.getElementById('fl-hist-pig').value = '';
  renderFeedHistory();
}

function renderFeedSummary() {
  const div  = document.getElementById('fl-summary-content');
  if (!div) return;
  const date = document.getElementById('fl-sum-date')?.value || today();
  const logs = db.feedLogs.filter(l => l.date === date);
  if (!logs.length) { div.innerHTML = `<div class="empty">No feed records for ${date}.</div>`; return; }

  const byPig    = {};
  logs.forEach(l => {
    if (!byPig[l.pigId]) byPig[l.pigId] = { total:0, cost:0, entries:[] };
    byPig[l.pigId].total += l.amount;
    byPig[l.pigId].cost  += l.totalCost || 0;
    byPig[l.pigId].entries.push(l);
  });
  const totalKg   = logs.reduce((s,l) => s + l.amount, 0);
  const totalCost = logs.reduce((s,l) => s + (l.totalCost||0), 0);

  div.innerHTML = `
    <div class="stats-grid" style="margin-bottom:16px">
      <div class="stat-card"><div class="val">${fmt(totalKg,1)}</div><div class="lbl">Total kg Fed</div></div>
      <div class="stat-card accent"><div class="val">${fmtMoney(totalCost)}</div><div class="lbl">Feed Cost</div></div>
      <div class="stat-card"><div class="val">${Object.keys(byPig).length}</div><div class="lbl">Pigs Fed</div></div>
    </div>
    <div class="card">
      <div class="card-title">Breakdown by Pig</div>
      <div class="table-wrap"><table>
        <thead><tr><th>Pig</th><th>Feed Type(s)</th><th>Total kg</th><th>Total Cost</th></tr></thead>
        <tbody>${Object.entries(byPig).map(([pigId, d]) => {
          const pig   = db.pigs.find(p => p.id === pigId);
          const types = [...new Set(d.entries.map(e => e.feedType))].join(', ');
          return `<tr><td>${pig ? esc(pig.tag)+' '+(pig.name||'') : '?'}</td><td>${types}</td><td>${fmt(d.total,2)} kg</td><td>${fmtMoney(d.cost)}</td></tr>`;
        }).join('')}</tbody>
      </table></div>
    </div>`;
}

// ===================== FEED STOCK =====================
const FEED_TYPES = ['starter','grower','finisher','sow-lactating','sow-gestation','boar','custom'];

function addPurchase() {
  const date      = document.getElementById('sp-date').value;
  const feedType  = document.getElementById('sp-type').value;
  const qty       = parseFloat(document.getElementById('sp-qty').value);
  const costPerKg = parseFloat(document.getElementById('sp-cost-per-kg').value);
  if (!date || !qty || !costPerKg) return alert('Date, Quantity, and Cost per kg are required.');

  const reorder = parseFloat(document.getElementById('sp-reorder').value) || 0;
  const p = {
    id: uid(), date, feedType, qty, costPerKg, totalCost: qty * costPerKg,
    supplier: document.getElementById('sp-supplier').value.trim(),
    notes:    document.getElementById('sp-notes').value.trim(),
    createdAt: today()
  };
  db.purchases.push(p);
  if (reorder > 0) db.feedReorderLevels[feedType] = reorder;
  db.transactions.push({ id:uid(), date, type:'expense', category:'feed',
    description:`Feed purchase: ${feedType} (${qty}kg from ${p.supplier||'supplier'})`,
    amount: p.totalCost, method:'cash', ref:'', createdAt:today() });
  saveDB();
  ['sp-qty','sp-cost-per-kg','sp-supplier','sp-notes','sp-reorder'].forEach(id => document.getElementById(id).value='');
  document.getElementById('sp-date').value = '';
  showToast('Purchase recorded!');
  renderStockLevels(); renderPurchaseHistory();
}

function renderStockLevels() {
  const div = document.getElementById('stock-levels-content');
  if (!div) return;
  const allTypes = [...new Set([...db.purchases.map(p=>p.feedType), ...FEED_TYPES])];
  const rows = allTypes.map(ft => {
    const balance = getStockBalance(ft);
    const reorder = db.feedReorderLevels[ft] || 0;
    const lastBuy = db.purchases.filter(p=>p.feedType===ft).sort((a,b)=>b.date.localeCompare(a.date))[0];
    return { ft, balance, reorder, lastBuy };
  }).filter(r => r.balance > 0 || r.lastBuy);

  if (!rows.length) { div.innerHTML = `<div class="empty">No stock data yet. Record a purchase first.</div>`; return; }
  div.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Feed Type</th><th>In Stock (kg)</th><th>Reorder Level</th><th>Status</th><th>Last Price/kg</th><th>Est. Value</th></tr></thead>
    <tbody>${rows.map(r => {
      const low = r.reorder > 0 && r.balance <= r.reorder;
      const val = r.balance * (r.lastBuy?.costPerKg || 0);
      return `<tr>
        <td><strong>${r.ft}</strong></td>
        <td>${fmt(r.balance, 1)} kg</td>
        <td>${r.reorder > 0 ? fmt(r.reorder,1)+' kg' : '-'}</td>
        <td>${low ? '<span class="badge" style="background:#fee2e2;color:#991b1b">⚠ Low Stock</span>' : '<span class="badge badge-active">OK</span>'}</td>
        <td>${r.lastBuy ? fmtMoney(r.lastBuy.costPerKg) : '-'}</td>
        <td>${fmtMoney(val)}</td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

function renderPurchaseHistory() {
  const tbody = document.getElementById('sp-hist-tbody');
  if (!tbody) return;
  const purchases = [...db.purchases].sort((a,b) => b.date.localeCompare(a.date));
  if (!purchases.length) { tbody.innerHTML = `<tr><td colspan="7"><div class="empty">No purchases yet.</div></td></tr>`; return; }
  tbody.innerHTML = purchases.map(p => `<tr>
    <td>${p.date}</td><td>${p.feedType}</td><td>${fmt(p.qty,1)}</td>
    <td>${fmtMoney(p.costPerKg)}</td><td>${fmtMoney(p.totalCost)}</td><td>${esc(p.supplier||'-')}</td>
    <td><button class="btn btn-danger btn-sm" onclick="deletePurchase('${p.id}')">🗑</button></td>
  </tr>`).join('');
}

function deletePurchase(id) {
  if (!confirm('Delete this purchase?')) return;
  db.purchases = db.purchases.filter(p => p.id !== id);
  saveDB(); renderStockLevels(); renderPurchaseHistory(); showToast('Deleted.');
}

// ===================== WEIGHT RECORDS =====================
function addWeight() {
  const date   = document.getElementById('wt-date').value;
  const pigId  = document.getElementById('wt-pig').value;
  const weight = parseFloat(document.getElementById('wt-weight').value);
  if (!date || !pigId || !weight) return alert('Date, Pig, and Weight are required.');

  db.weights.push({
    id: uid(), pigId, date, weight,
    bcs:   document.getElementById('wt-bcs').value,
    notes: document.getElementById('wt-notes').value.trim(),
    createdAt: today()
  });
  saveDB();
  ['wt-weight','wt-notes'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('wt-bcs').value = '';
  showToast('Weight recorded!');
  renderWeightHistory(); renderGrowthAnalysis();
}

function renderWeightHistory() {
  const tbody = document.getElementById('wt-hist-tbody');
  if (!tbody) return;
  const pigF = document.getElementById('wt-hist-pig')?.value;
  let recs = [...db.weights].sort((a,b) => b.date.localeCompare(a.date));
  if (pigF) recs = recs.filter(r => r.pigId === pigF);
  if (!recs.length) { tbody.innerHTML = `<tr><td colspan="7"><div class="empty">No weight records found.</div></td></tr>`; return; }
  tbody.innerHTML = recs.map((r, i, arr) => {
    const pig    = db.pigs.find(p => p.id === r.pigId);
    const prev   = arr.slice(i+1).find(x => x.pigId === r.pigId);
    const change = prev ? r.weight - prev.weight : null;
    const changeTxt = change !== null
      ? `<span class="${change>=0?'text-success':'text-danger'}">${change>=0?'+':''}${fmt(change,1)} kg</span>` : '-';
    return `<tr>
      <td>${r.date}</td>
      <td>${pig ? esc(pig.tag)+' '+(pig.name||'') : '?'}</td>
      <td><strong>${fmt(r.weight,1)} kg</strong></td>
      <td>${changeTxt}</td>
      <td>${r.bcs||'-'}</td>
      <td class="text-muted">${esc(r.notes||'-')}</td>
      <td><button class="btn btn-danger btn-sm" onclick="deleteWeight('${r.id}')">🗑</button></td>
    </tr>`;
  }).join('');
}

function deleteWeight(id) {
  if (!confirm('Delete this weight record?')) return;
  db.weights = db.weights.filter(w => w.id !== id);
  saveDB(); renderWeightHistory(); showToast('Deleted.');
}

function renderGrowthAnalysis() {
  const div  = document.getElementById('wt-growth-content');
  if (!div) return;
  const pigF = document.getElementById('wt-growth-pig')?.value;
  const pigs = pigF ? db.pigs.filter(p => p.id === pigF) : db.pigs.filter(p => p.status === 'active');
  if (!pigs.length) { div.innerHTML = `<div class="empty">No active pigs.</div>`; return; }

  div.innerHTML = pigs.map(pig => {
    const recs = db.weights.filter(w => w.pigId === pig.id).sort((a,b) => a.date.localeCompare(b.date));
    if (!recs.length) return `<div class="card"><strong>${esc(pig.tag)}</strong> — no weight records</div>`;
    const first = recs[0], last = recs[recs.length-1];
    const days  = (new Date(last.date) - new Date(first.date)) / 86400000 || 1;
    const gain  = last.weight - first.weight;
    const adg   = gain / days;
    const feed  = db.feedLogs.filter(f => f.pigId===pig.id && f.date>=first.date && f.date<=last.date).reduce((s,f)=>s+f.amount,0);
    const fcr   = feed > 0 && gain > 0 ? (feed / gain).toFixed(2) : 'N/A';
    return `<div class="card" style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <strong>${esc(pig.tag)}${pig.name ? ' — '+pig.name : ''}</strong>
        <span class="badge badge-${pig.type}">${pig.type}</span>
      </div>
      <div class="stats-grid">
        <div class="stat-card"><div class="val">${fmt(last.weight,1)}</div><div class="lbl">Current Weight (kg)</div></div>
        <div class="stat-card green"><div class="val">${fmt(gain,1)}</div><div class="lbl">Total Gain (kg)</div></div>
        <div class="stat-card accent"><div class="val">${fmt(adg*1000,0)}g</div><div class="lbl">Avg Daily Gain</div></div>
        <div class="stat-card"><div class="val">${fcr}</div><div class="lbl">Feed Conv. Ratio</div></div>
      </div>
      <div class="table-wrap mt"><table>
        <thead><tr><th>Date</th><th>Weight (kg)</th><th>Change</th></tr></thead>
        <tbody>${recs.map((r,i,a) => {
          const prev = a[i-1];
          const ch   = prev ? r.weight - prev.weight : null;
          return `<tr><td>${r.date}</td><td>${fmt(r.weight,1)} kg</td>
            <td>${ch!==null ? `<span class="${ch>=0?'text-success':'text-danger'}">${ch>=0?'+':''}${fmt(ch,1)}</span>` : '-'}</td></tr>`;
        }).join('')}</tbody>
      </table></div>
    </div>`;
  }).join('');
}

// ===================== FINANCES =====================
const expenseCategories = ['feed','veterinary','labour','utilities','equipment','medicine','transport','maintenance','other-expense'];
const incomeCategories  = ['pig-sales','piglet-sales','manure','other-income'];

function updateFinCategories() {
  const type = document.getElementById('fin-type').value;
  const cats = type === 'expense' ? expenseCategories : incomeCategories;
  document.getElementById('fin-category').innerHTML =
    cats.map(c => `<option value="${c}">${c.replace(/-/g,' ').replace(/\b\w/g, l=>l.toUpperCase())}</option>`).join('');
}

function addTransaction() {
  const date   = document.getElementById('fin-date').value;
  const amount = parseFloat(document.getElementById('fin-amount').value);
  const desc   = document.getElementById('fin-desc').value.trim();
  if (!date || !amount || !desc) return alert('Date, Amount, and Description are required.');
  db.transactions.push({
    id: uid(), date,
    type:        document.getElementById('fin-type').value,
    category:    document.getElementById('fin-category').value,
    description: desc, amount,
    method:      document.getElementById('fin-method').value,
    ref:         document.getElementById('fin-ref').value.trim(),
    createdAt: today()
  });
  saveDB();
  ['fin-amount','fin-desc','fin-ref'].forEach(id => document.getElementById(id).value = '');
  showToast('Transaction saved!');
  renderLedger(); renderFinSummary();
}

function renderLedger() {
  const tbody = document.getElementById('fin-ledger-tbody');
  if (!tbody) return;
  let txns = [...db.transactions].sort((a,b) => b.date.localeCompare(a.date));
  const from  = document.getElementById('fin-from')?.value;
  const to    = document.getElementById('fin-to')?.value;
  const typeF = document.getElementById('fin-filter-type')?.value;
  const catF  = document.getElementById('fin-filter-cat')?.value;
  if (from)  txns = txns.filter(t => t.date >= from);
  if (to)    txns = txns.filter(t => t.date <= to);
  if (typeF) txns = txns.filter(t => t.type === typeF);
  if (catF)  txns = txns.filter(t => t.category === catF);

  const catSel = document.getElementById('fin-filter-cat');
  if (catSel) {
    const prev    = catSel.value;
    const allCats = [...new Set(db.transactions.map(t => t.category))];
    catSel.innerHTML = `<option value="">All Categories</option>` + allCats.map(c=>`<option value="${c}">${c.replace(/-/g,' ')}</option>`).join('');
    if (prev) catSel.value = prev;
  }

  if (!txns.length) { tbody.innerHTML = `<tr><td colspan="8"><div class="empty">No transactions found.</div></td></tr>`; return; }
  tbody.innerHTML = txns.map(t => `<tr>
    <td>${t.date}</td>
    <td><span class="badge" style="background:${t.type==='income'?'#d1fadf':'#fee2e2'};color:${t.type==='income'?'#166534':'#991b1b'}">${t.type}</span></td>
    <td>${esc(t.category||'').replace(/-/g,' ')}</td>
    <td>${esc(t.description)}</td>
    <td>${esc(t.method||'-')}</td>
    <td>${esc(t.ref||'-')}</td>
    <td class="${t.type==='income'?'text-success':'text-danger'}"><strong>${fmtMoney(t.amount)}</strong></td>
    <td><button class="btn btn-danger btn-sm" onclick="deleteTxn('${t.id}')">🗑</button></td>
  </tr>`).join('');
}

function deleteTxn(id) {
  if (!confirm('Delete this transaction?')) return;
  db.transactions = db.transactions.filter(t => t.id !== id);
  saveDB(); renderLedger(); showToast('Deleted.');
}

function clearFinFilter() {
  ['fin-from','fin-to'].forEach(id => { if (document.getElementById(id)) document.getElementById(id).value=''; });
  document.getElementById('fin-filter-type').value = '';
  document.getElementById('fin-filter-cat').value  = '';
  renderLedger();
}

function renderFinSummary() {
  const div   = document.getElementById('fin-summary-content');
  if (!div) return;
  const month = document.getElementById('fin-sum-month')?.value;
  let txns = db.transactions;
  if (month) txns = txns.filter(t => t.date.startsWith(month));

  const income  = txns.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const expense = txns.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  const profit  = income - expense;
  const byCat   = {};
  txns.forEach(t => { if (!byCat[t.category]) byCat[t.category]={type:t.type,total:0}; byCat[t.category].total+=t.amount; });

  div.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card green"><div class="val">${fmtMoney(income)}</div><div class="lbl">Total Income</div></div>
      <div class="stat-card red"><div class="val">${fmtMoney(expense)}</div><div class="lbl">Total Expenses</div></div>
      <div class="stat-card ${profit>=0?'green':'red'}"><div class="val">${fmtMoney(Math.abs(profit))}</div><div class="lbl">${profit>=0?'Net Profit':'Net Loss'}</div></div>
    </div>
    <div class="row mt">
      <div class="card">
        <div class="card-title">Expenses by Category</div>
        ${Object.entries(byCat).filter(([,v])=>v.type==='expense').sort((a,b)=>b[1].total-a[1].total).map(([k,v])=>`
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:0.85rem">
            <span>${k.replace(/-/g,' ')}</span><strong class="text-danger">${fmtMoney(v.total)}</strong>
          </div>`).join('') || '<div class="empty">No expenses</div>'}
      </div>
      <div class="card">
        <div class="card-title">Income by Category</div>
        ${Object.entries(byCat).filter(([,v])=>v.type==='income').sort((a,b)=>b[1].total-a[1].total).map(([k,v])=>`
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:0.85rem">
            <span>${k.replace(/-/g,' ')}</span><strong class="text-success">${fmtMoney(v.total)}</strong>
          </div>`).join('') || '<div class="empty">No income</div>'}
      </div>
    </div>`;
}

// ===================== MONTHLY INPUTS =====================
const MON_CAT_COLORS = {
  medication:   { bg: '#fee2e2', color: '#991b1b' },
  vaccine:      { bg: '#dbeafe', color: '#1e40af' },
  dewormer:     { bg: '#d1fae5', color: '#065f46' },
  vitamin:      { bg: '#fef9c3', color: '#854d0e' },
  disinfectant: { bg: '#f3e8ff', color: '#6b21a8' },
  other:        { bg: '#f1f5f9', color: '#475569' },
};

function updateMonSubcategory() { /* reserved */ }

function updateMonScopeVisibility() {
  const scope = document.getElementById('mon-scope').value;
  document.getElementById('mon-specific-pig-grp').style.display = scope === 'specific' ? '' : 'none';
}

function addMonthlyInput() {
  const month   = document.getElementById('mon-month').value;
  if (!month) return alert('Month is required.');
  const product = document.getElementById('mon-product').value.trim();
  if (!product) return alert('Product name is required.');

  const totalCost = parseFloat(document.getElementById('mon-total-cost').value) || 0;
  const scope     = document.getElementById('mon-scope').value;
  let specificPigs = [];
  if (scope === 'specific') {
    specificPigs = Array.from(document.getElementById('mon-specific-pig').selectedOptions).map(o => o.value);
  }

  const entry = {
    id: uid(), month,
    category:       document.getElementById('mon-category').value,
    product, scope, specificPigs,
    qty:            document.getElementById('mon-qty').value.trim(),
    unitCost:       parseFloat(document.getElementById('mon-unit-cost').value) || 0,
    totalCost,
    administeredBy: document.getElementById('mon-by').value.trim(),
    nextDue:        document.getElementById('mon-next-due').value,
    supplier:       document.getElementById('mon-supplier').value.trim(),
    withdrawal:     parseInt(document.getElementById('mon-withdrawal').value) || 0,
    notes:          document.getElementById('mon-notes').value.trim(),
    createdAt: today()
  };

  db.monthlyInputs = db.monthlyInputs || [];
  db.monthlyInputs.push(entry);

  if (document.getElementById('mon-add-expense').checked && totalCost > 0) {
    db.transactions.push({ id:uid(), date: month+'-01', type:'expense', category:'medicine',
      description:`${entry.category}: ${product} (${month})`,
      amount: totalCost, method:'cash', ref:'', createdAt:today() });
  }
  saveDB();
  ['mon-product','mon-qty','mon-unit-cost','mon-total-cost','mon-by','mon-supplier','mon-withdrawal','mon-notes','mon-next-due']
    .forEach(id => document.getElementById(id).value = '');
  showToast('Monthly input saved!');
  renderMonthlyHistory(); renderMonthlySummary();
}

function renderMonthlyHistory() {
  const tbody = document.getElementById('mon-hist-tbody');
  if (!tbody) return;
  const mf = document.getElementById('mon-hist-month')?.value;
  const cf = document.getElementById('mon-hist-cat')?.value;
  let recs = [...(db.monthlyInputs||[])].sort((a,b) => b.month.localeCompare(a.month));
  if (mf) recs = recs.filter(r => r.month === mf);
  if (cf) recs = recs.filter(r => r.category === cf);
  if (!recs.length) { tbody.innerHTML = `<tr><td colspan="9"><div class="empty">No monthly input records found.</div></td></tr>`; return; }
  tbody.innerHTML = recs.map(r => {
    const c          = MON_CAT_COLORS[r.category] || MON_CAT_COLORS.other;
    const scopeLabel = r.scope === 'specific'
      ? r.specificPigs.map(id => { const p = db.pigs.find(x=>x.id===id); return p ? p.tag : '?'; }).join(', ')
      : r.scope.replace(/-/g,' ');
    return `<tr>
      <td>${r.month}</td>
      <td><span class="badge" style="background:${c.bg};color:${c.color}">${r.category}</span></td>
      <td><strong>${esc(r.product)}</strong>
        ${r.supplier ? `<br><span class="text-muted" style="font-size:0.75rem">${esc(r.supplier)}</span>` : ''}
        ${r.withdrawal ? `<br><span class="chip">⏱ ${r.withdrawal}d withdrawal</span>` : ''}
      </td>
      <td>${esc(scopeLabel)}</td>
      <td>${esc(r.qty||'-')}</td>
      <td>${r.totalCost > 0 ? fmtMoney(r.totalCost) : '-'}</td>
      <td>${esc(r.administeredBy||'-')}</td>
      <td>${r.nextDue ? `<span style="color:var(--accent);font-weight:600">${r.nextDue}</span>` : '-'}</td>
      <td><button class="btn btn-danger btn-sm" onclick="deleteMonthlyInput('${r.id}')">🗑</button></td>
    </tr>`;
  }).join('');
}

function deleteMonthlyInput(id) {
  if (!confirm('Delete this record?')) return;
  db.monthlyInputs = (db.monthlyInputs||[]).filter(r => r.id !== id);
  saveDB(); renderMonthlyHistory(); renderMonthlySummary(); showToast('Deleted.');
}

function clearMonFilter() {
  document.getElementById('mon-hist-month').value = '';
  document.getElementById('mon-hist-cat').value   = '';
  renderMonthlyHistory();
}

function formatMonth(ym) {
  const [y, m] = ym.split('-');
  return new Date(+y, +m-1, 1).toLocaleDateString('en-NG', { month:'long', year:'numeric' });
}

function renderMonthlySummary() {
  const div      = document.getElementById('mon-summary-content');
  if (!div) return;
  const selMonth = document.getElementById('mon-sum-month')?.value;
  let recs = db.monthlyInputs || [];
  if (selMonth) recs = recs.filter(r => r.month === selMonth);
  if (!recs.length) { div.innerHTML = `<div class="empty">No monthly input records${selMonth ? ' for '+selMonth : ''}.</div>`; return; }

  const byMonth = {};
  recs.forEach(r => { if (!byMonth[r.month]) byMonth[r.month]=[]; byMonth[r.month].push(r); });
  const months = Object.keys(byMonth).sort((a,b) => b.localeCompare(a));

  const due30    = new Date(); due30.setDate(due30.getDate() + 30);
  const upcoming = (db.monthlyInputs||[]).filter(r => r.nextDue && new Date(r.nextDue)<=due30 && new Date(r.nextDue)>=new Date(today()));

  div.innerHTML = months.map(month => {
    const items     = byMonth[month];
    const totalCost = items.reduce((s,r) => s + (r.totalCost||0), 0);
    const byCat     = {};
    items.forEach(r => { if (!byCat[r.category]) byCat[r.category]=[]; byCat[r.category].push(r); });

    return `<div class="card" style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px">
        <h3 style="font-size:1rem;color:var(--primary-dark)">${formatMonth(month)}</h3>
        <div style="display:flex;gap:12px;flex-wrap:wrap">
          <span class="chip">${items.length} input${items.length!==1?'s':''}</span>
          ${totalCost > 0 ? `<strong style="color:var(--danger)">${fmtMoney(totalCost)}</strong>` : ''}
        </div>
      </div>
      ${Object.entries(byCat).map(([cat, catItems]) => {
        const c        = MON_CAT_COLORS[cat] || MON_CAT_COLORS.other;
        const catTotal = catItems.reduce((s,r)=>s+(r.totalCost||0),0);
        return `<div style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <span class="badge" style="background:${c.bg};color:${c.color};font-size:0.78rem">${cat.toUpperCase()}</span>
            ${catTotal > 0 ? `<span style="font-size:0.8rem;color:var(--text-muted)">${fmtMoney(catTotal)}</span>` : ''}
          </div>
          ${catItems.map(r => `
            <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;padding:8px 10px;background:var(--bg);border-radius:6px;margin-bottom:4px;gap:6px">
              <div>
                <strong style="font-size:0.88rem">${esc(r.product)}</strong>
                ${r.supplier ? `<span class="text-muted" style="font-size:0.75rem"> · ${esc(r.supplier)}</span>` : ''}
                <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px">
                  ${r.scope === 'specific'
                    ? 'Pigs: ' + r.specificPigs.map(id=>{const p=db.pigs.find(x=>x.id===id);return p?p.tag:'?';}).join(', ')
                    : r.scope.replace(/-/g,' ')}
                  ${r.qty ? ' · '+esc(r.qty) : ''}
                  ${r.administeredBy ? ' · by '+esc(r.administeredBy) : ''}
                  ${r.withdrawal ? ` · <span style="color:var(--accent)">⏱ ${r.withdrawal}d withdrawal</span>` : ''}
                </div>
                ${r.notes ? `<div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;font-style:italic">${esc(r.notes)}</div>` : ''}
              </div>
              <div style="text-align:right;flex-shrink:0">
                ${r.totalCost > 0 ? `<div style="font-weight:700;color:var(--danger)">${fmtMoney(r.totalCost)}</div>` : ''}
                ${r.nextDue ? `<div style="font-size:0.75rem;color:var(--accent)">Next: ${r.nextDue}</div>` : ''}
              </div>
            </div>`).join('')}
        </div>`;
      }).join('')}
    </div>`;
  }).join('') + (upcoming.length && !selMonth ? `
    <div class="card" style="border:2px solid var(--accent)">
      <div class="card-title" style="color:var(--accent)">⏰ Due in the Next 30 Days</div>
      ${upcoming.map(r => `
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:0.85rem">
          <span><strong>${esc(r.product)}</strong> <span class="text-muted">(${r.category})</span></span>
          <strong style="color:var(--accent)">${r.nextDue}</strong>
        </div>`).join('')}
    </div>` : '');
}

// ===================== REPORTS =====================
function renderReport() {
  const div  = document.getElementById('report-content');
  if (!div) return;
  const from = document.getElementById('rep-from')?.value || '2000-01-01';
  const to   = document.getElementById('rep-to')?.value   || '2099-12-31';
  const txns = db.transactions.filter(t => t.date>=from && t.date<=to);
  const feeds = db.feedLogs.filter(f => f.date>=from && f.date<=to);
  const income   = txns.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const expense  = txns.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  const feedKg   = feeds.reduce((s,f)=>s+f.amount,0);
  const feedCost = feeds.reduce((s,f)=>s+(f.totalCost||0),0);

  div.innerHTML = `
    <div class="card">
      <div class="card-title">Farm Summary ${from!=='2000-01-01' ? `(${from} to ${to})` : '(All Time)'}</div>
      <div class="stats-grid">
        <div class="stat-card"><div class="val">${db.pigs.length}</div><div class="lbl">Total Pigs Registered</div></div>
        <div class="stat-card"><div class="val">${db.pigs.filter(p=>p.status==='active').length}</div><div class="lbl">Currently Active</div></div>
        <div class="stat-card green"><div class="val">${fmtMoney(income)}</div><div class="lbl">Income</div></div>
        <div class="stat-card red"><div class="val">${fmtMoney(expense)}</div><div class="lbl">Expenses</div></div>
        <div class="stat-card ${income-expense>=0?'green':'red'}"><div class="val">${fmtMoney(Math.abs(income-expense))}</div><div class="lbl">${income-expense>=0?'Profit':'Loss'}</div></div>
        <div class="stat-card accent"><div class="val">${fmt(feedKg,1)} kg</div><div class="lbl">Feed Consumed</div></div>
      </div>
    </div>
    <div class="row mt">
      <div class="card"><div class="card-title">Pig Inventory Summary</div>
        <p style="font-size:0.85rem">Active: <strong>${db.pigs.filter(p=>p.status==='active').length}</strong>
          · Sold: <strong>${db.pigs.filter(p=>p.status==='sold').length}</strong>
          · Deaths: <strong>${db.pigs.filter(p=>p.status==='dead').length}</strong></p>
        <p style="font-size:0.85rem;margin-top:8px">
          Boars: ${db.pigs.filter(p=>p.type==='boar').length} · Sows: ${db.pigs.filter(p=>p.type==='sow').length}
          · Piglets: ${db.pigs.filter(p=>p.type==='piglet').length} · Growers: ${db.pigs.filter(p=>p.type==='grower').length}
          · Finishers: ${db.pigs.filter(p=>p.type==='finisher').length}</p>
      </div>
      <div class="card"><div class="card-title">Feed Summary</div>
        <p style="font-size:0.85rem">Total Consumed: <strong>${fmt(feedKg,1)} kg</strong></p>
        <p style="font-size:0.85rem;margin-top:4px">Feed Cost: <strong>${fmtMoney(feedCost)}</strong></p>
        <p style="font-size:0.85rem;margin-top:4px">Feed % of Expenses: <strong>${expense>0 ? fmt((feedCost/expense)*100,1)+'%' : 'N/A'}</strong></p>
      </div>
    </div>`;
}

function exportCSV() {
  const rows = [['Date','Type','Category','Description','Amount']];
  db.transactions.sort((a,b)=>a.date.localeCompare(b.date)).forEach(t => rows.push([t.date,t.type,t.category,t.description,t.amount]));
  const csv = rows.map(r => r.map(c => `"${String(c||'').replace(/"/g,'""')}"`).join(',')).join('\n');
  download('lacoline-transactions.csv', csv, 'text/csv');
}

function exportData() {
  download('lacoline-backup-'+today()+'.json', JSON.stringify(db, null, 2), 'application/json');
}

function importData() { document.getElementById('import-file').click(); }
function doImport(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!data.pigs || !data.transactions) return alert('Invalid backup file.');
      if (!confirm('This will replace ALL current data. Continue?')) return;
      db = data; saveDB();
      showToast('Data restored!'); showPage('dashboard');
    } catch { alert('Failed to parse file.'); }
  };
  reader.readAsText(file);
}

function download(name, content, mime) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = name; a.click();
}

// ===================== TOAST NOTIFICATION =====================
let toastTimer;
function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#2d6a4f;color:#fff;padding:10px 18px;border-radius:8px;font-size:0.88rem;font-weight:600;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.2);transition:opacity 0.3s';
    document.body.appendChild(t);
  }
  t.textContent = msg; t.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.style.opacity = '0'; }, 2500);
}

// ===================== INITIALISE =====================
document.addEventListener('DOMContentLoaded', () => {
  // Migrate existing DB — ensure users array exists
  if (!db.monthlyInputs) db.monthlyInputs = [];
  if (!db.users) {
    db.users = [{
      id: 'usr_admin', username: 'admin', password: 'admin123',
      fullName: 'Administrator', role: 'admin',
      createdAt: today(), lastLogin: null, active: true
    }];
    saveDB();
  }

  // Set default dates on form inputs (done after app is shown)
  function initFormDefaults() {
    document.querySelectorAll('input[type="date"]').forEach(el  => { if (!el.value) el.value = today(); });
    document.querySelectorAll('input[type="month"]').forEach(el => { if (!el.value) el.value = today().slice(0,7); });
    const fls = document.getElementById('fl-sum-date');
    if (fls) fls.value = today();
    updateFinCategories();
    populatePigSelects();
    toggleEventFields();
  }

  // Hook initFormDefaults to run when app becomes visible
  const origShowApp = showApp;
  window.showApp = function() {
    origShowApp();
    setTimeout(initFormDefaults, 50);
  };

  // Try to resume session
  checkSession();
});
