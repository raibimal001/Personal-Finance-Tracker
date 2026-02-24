/* ============================================================
   FinFlow Pro — app.js
   Complete personal finance dashboard logic
   ============================================================ */

// ──────────────────────────────────────────────
// 1. STATE & STORAGE
// ──────────────────────────────────────────────
const DB = {
  load(key, def) { try { return JSON.parse(localStorage.getItem('ff_' + key)) || def; } catch { return def; } },
  save(key, val) { localStorage.setItem('ff_' + key, JSON.stringify(val)); }
};

let income = DB.load('income', []);
let expenses = DB.load('expenses', []);
let savings = DB.load('savings', []);
let goals = DB.load('goals', []);
let debts = DB.load('debts', []);
let budgets = DB.load('budgets', {});

// ──────────────────────────────────────────────
// 2. HELPERS
// ──────────────────────────────────────────────
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function fmt(n) { return 'रू ' + Math.abs(+n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function pct(n) { return ((+n || 0) * 100).toFixed(1) + '%'; }
function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function fmtDate(d) {
  const dt = new Date(d + 'T12:00:00');
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function todayISO() { return new Date().toISOString().split('T')[0]; }

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const CAT_EMOJI = {
  Housing: '🏠', Food: '🍔', Transport: '🚗', Utilities: '💡', Health: '💊',
  Entertainment: '🎬', Shopping: '🛍️', Education: '📚', Insurance: '🛡️',
  'Debt Payment': '💳', 'Personal Care': '🪥', Other: '📦'
};
const GOAL_EMOJI = {
  'Emergency Fund': '🆘', Retirement: '🏖️', Vacation: '✈️',
  House: '🏡', Car: '🚘', Education: '🎓', Other: '🏆'
};
const PALETTE = ['#7c6fe0', '#4e94f8', '#22d6a0', '#f25c7a', '#f9a03c',
  '#56cef7', '#b87ce8', '#e878a0', '#96e06e', '#f07850', '#60c4e0', '#f0e060'];

// ──────────────────────────────────────────────
// 3. PERIOD SELECTOR
// ──────────────────────────────────────────────
const selMonth = document.getElementById('period-month');
const selYear = document.getElementById('period-year');
const now = new Date();

(function initPeriod() {
  selMonth.value = now.getMonth();
  const yearSel = document.getElementById('period-year');
  const summYearSel = document.getElementById('summary-year-select');
  for (let y = now.getFullYear(); y <= now.getFullYear() + 10; y++) {
    [yearSel, summYearSel].forEach(s => {
      const o = document.createElement('option');
      o.value = y; o.textContent = y;
      s.appendChild(o);
    });
  }
  yearSel.value = now.getFullYear();
  summYearSel.value = now.getFullYear();
  document.getElementById('sidebar-date').textContent =
    now.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
})();

function getSelPeriod() {
  return { month: +selMonth.value, year: +selYear.value };
}
function filterByPeriod(arr, m, y) {
  return arr.filter(r => {
    const d = new Date(r.date + 'T12:00:00');
    return d.getMonth() === m && d.getFullYear() === y;
  });
}
function filterByYear(arr, y) {
  return arr.filter(r => new Date(r.date + 'T12:00:00').getFullYear() === y);
}

selMonth.addEventListener('change', refreshAll);
selYear.addEventListener('change', refreshAll);

// ──────────────────────────────────────────────
// 4. TAB NAVIGATION
// ──────────────────────────────────────────────
const TAB_META = {
  dashboard: { title: 'Dashboard', sub: 'Personal Finance Tracker' },
  income: { title: 'Income', sub: 'Track all your income sources' },
  expenses: { title: 'Expenses', sub: 'Track and categorise your spending' },
  savings: { title: 'Savings', sub: 'Record your savings deposits' },
  budget: { title: 'Budget Plan', sub: 'Compare your budget vs actual spending' },
  goals: { title: 'Goals', sub: 'Track your financial goals' },
  debt: { title: 'Debt Tracker', sub: 'Manage and plan your debt payoff' },
  summary: { title: 'Monthly Summary', sub: 'Auto-generated monthly financial report' },
};

document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const tab = link.dataset.tab;
    activateTab(tab);
  });
});

function activateTab(tab) {
  document.querySelectorAll('.nav-link').forEach(l => l.classList.toggle('active', l.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tab));
  document.getElementById('topbar-title').textContent = TAB_META[tab].title;
  document.getElementById('topbar-sub').textContent = TAB_META[tab].sub;
  // Redirect add button
  const addMap = {
    income: 'income-modal-backdrop', expenses: 'expense-modal-backdrop',
    savings: 'savings-modal-backdrop', goals: 'goal-modal-backdrop', debt: 'debt-modal-backdrop'
  };
  document.getElementById('global-add-btn').onclick = () => openModal(addMap[tab] || 'income-modal-backdrop');
  renderTab(tab);
}

function renderTab(tab) {
  if (tab === 'dashboard') renderDashboard();
  else if (tab === 'income') renderIncomeTable();
  else if (tab === 'expenses') renderExpenseTable();
  else if (tab === 'savings') renderSavingsTable();
  else if (tab === 'budget') renderBudget();
  else if (tab === 'goals') renderGoals();
  else if (tab === 'debt') renderDebt();
  else if (tab === 'summary') renderSummary();
}

// ──────────────────────────────────────────────
// 5. MODAL HELPERS
// ──────────────────────────────────────────────
function openModal(id) {
  // Set today
  const now = todayISO();
  const dateFields = document.querySelectorAll(`#${id} input[type=date]`);
  dateFields.forEach(f => { if (!f.value) f.value = now; });
  document.getElementById(id).classList.add('open');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});
document.querySelectorAll('.modal-backdrop').forEach(bd => {
  bd.addEventListener('click', e => { if (e.target === bd) closeModal(bd.id); });
});

// ──────────────────────────────────────────────
// 6. INCOME TAB
// ──────────────────────────────────────────────
document.getElementById('add-income-btn').addEventListener('click', () => openModal('income-modal-backdrop'));

document.getElementById('income-form').addEventListener('submit', e => {
  e.preventDefault();
  const rec = {
    id: uid(),
    date: document.getElementById('inc-date').value,
    source: document.getElementById('inc-source').value.trim(),
    category: document.getElementById('inc-category').value,
    amount: parseFloat(document.getElementById('inc-amount').value),
    payment: document.getElementById('inc-payment').value,
    notes: document.getElementById('inc-notes').value.trim(),
  };
  if (!rec.source || isNaN(rec.amount) || rec.amount <= 0) return;
  income.push(rec); DB.save('income', income);
  e.target.reset();
  closeModal('income-modal-backdrop');
  refreshAll();
});

function renderIncomeTable() {
  const { month, year } = getSelPeriod();
  const rows = filterByPeriod(income, month, year).sort((a, b) => b.date.localeCompare(a.date));
  const tbody = document.getElementById('income-tbody');
  const empty = document.getElementById('income-empty');
  tbody.innerHTML = '';
  const total = rows.reduce((s, r) => s + r.amount, 0);
  document.getElementById('income-mini-kpis').innerHTML =
    `<div class="kpi-mini" style="color:var(--income)">Total: ${fmt(total)}</div>
     <div class="kpi-mini">${rows.length} records</div>`;
  if (!rows.length) { empty.classList.add('show'); return; }
  empty.classList.remove('show');
  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${fmtDate(r.date)}</td>
      <td>${esc(r.source)}</td>
      <td><span class="badge badge-income">${esc(r.category)}</span></td>
      <td class="amount-income">${fmt(r.amount)}</td>
      <td>${esc(r.payment)}</td>
      <td style="color:var(--txt-3);font-size:12px">${esc(r.notes)}</td>
      <td><button class="btn btn-danger btn-sm" data-id="${r.id}" data-type="income">🗑 Delete</button></td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('[data-type="income"]').forEach(b =>
    b.addEventListener('click', () => deleteRecord('income', b.dataset.id)));
}

// ──────────────────────────────────────────────
// 7. EXPENSE TAB
// ──────────────────────────────────────────────
document.getElementById('add-expense-btn').addEventListener('click', () => openModal('expense-modal-backdrop'));

document.getElementById('expense-form').addEventListener('submit', e => {
  e.preventDefault();
  const rec = {
    id: uid(),
    date: document.getElementById('exp-date').value,
    category: document.getElementById('exp-category').value,
    sub: document.getElementById('exp-sub').value.trim(),
    amount: parseFloat(document.getElementById('exp-amount').value),
    payment: document.getElementById('exp-payment').value,
    fv: document.getElementById('exp-fv').value,
    notes: document.getElementById('exp-notes').value.trim(),
  };
  if (isNaN(rec.amount) || rec.amount <= 0) return;
  expenses.push(rec); DB.save('expenses', expenses);
  e.target.reset();
  closeModal('expense-modal-backdrop');
  refreshAll();
});

function renderExpenseTable() {
  const { month, year } = getSelPeriod();
  const rows = filterByPeriod(expenses, month, year).sort((a, b) => b.date.localeCompare(a.date));
  const tbody = document.getElementById('expense-tbody');
  const empty = document.getElementById('expense-empty');
  tbody.innerHTML = '';
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const fixed = rows.filter(r => r.fv === 'Fixed').reduce((s, r) => s + r.amount, 0);
  document.getElementById('expense-mini-kpis').innerHTML =
    `<div class="kpi-mini" style="color:var(--expense)">Total: ${fmt(total)}</div>
     <div class="kpi-mini">Fixed: ${fmt(fixed)}</div>
     <div class="kpi-mini">Variable: ${fmt(total - fixed)}</div>`;
  if (!rows.length) { empty.classList.add('show'); return; }
  empty.classList.remove('show');
  rows.forEach(r => {
    const emoji = CAT_EMOJI[r.category] || '📦';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${fmtDate(r.date)}</td>
      <td><span class="badge badge-expense">${emoji} ${esc(r.category)}</span></td>
      <td style="color:var(--txt-2);font-size:12px">${esc(r.sub)}</td>
      <td class="amount-expense">${fmt(r.amount)}</td>
      <td>${esc(r.payment)}</td>
      <td><span class="badge badge-${r.fv.toLowerCase()}">${r.fv}</span></td>
      <td style="color:var(--txt-3);font-size:12px">${esc(r.notes)}</td>
      <td><button class="btn btn-danger btn-sm" data-id="${r.id}" data-type="expenses">🗑 Delete</button></td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('[data-type="expenses"]').forEach(b =>
    b.addEventListener('click', () => deleteRecord('expenses', b.dataset.id)));
}

// ──────────────────────────────────────────────
// 8. SAVINGS TAB
// ──────────────────────────────────────────────
document.getElementById('add-savings-btn').addEventListener('click', () => openModal('savings-modal-backdrop'));

document.getElementById('savings-form').addEventListener('submit', e => {
  e.preventDefault();
  const rec = {
    id: uid(),
    date: document.getElementById('sav-date').value,
    type: document.getElementById('sav-type').value,
    amount: parseFloat(document.getElementById('sav-amount').value),
    account: document.getElementById('sav-account').value.trim(),
    notes: document.getElementById('sav-notes').value.trim(),
  };
  if (isNaN(rec.amount) || rec.amount <= 0) return;
  savings.push(rec); DB.save('savings', savings);
  e.target.reset();
  closeModal('savings-modal-backdrop');
  refreshAll();
});

function renderSavingsTable() {
  const { month, year } = getSelPeriod();
  const rows = filterByPeriod(savings, month, year).sort((a, b) => b.date.localeCompare(a.date));
  const tbody = document.getElementById('savings-tbody');
  const empty = document.getElementById('savings-empty');
  tbody.innerHTML = '';
  const total = rows.reduce((s, r) => s + r.amount, 0);
  document.getElementById('savings-mini-kpis').innerHTML =
    `<div class="kpi-mini" style="color:var(--savings)">Total: ${fmt(total)}</div>
     <div class="kpi-mini">${rows.length} deposits</div>`;
  if (!rows.length) { empty.classList.add('show'); return; }
  empty.classList.remove('show');
  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${fmtDate(r.date)}</td>
      <td><span class="badge badge-savings">${esc(r.type)}</span></td>
      <td class="amount-savings">${fmt(r.amount)}</td>
      <td style="color:var(--txt-2)">${esc(r.account)}</td>
      <td style="color:var(--txt-3);font-size:12px">${esc(r.notes)}</td>
      <td><button class="btn btn-danger btn-sm" data-id="${r.id}" data-type="savings">🗑 Delete</button></td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('[data-type="savings"]').forEach(b =>
    b.addEventListener('click', () => deleteRecord('savings', b.dataset.id)));
}

// ──────────────────────────────────────────────
// 9. DELETE RECORD
// ──────────────────────────────────────────────
function deleteRecord(type, id) {
  if (type === 'income') { income = income.filter(r => r.id !== id); DB.save('income', income); }
  if (type === 'expenses') { expenses = expenses.filter(r => r.id !== id); DB.save('expenses', expenses); }
  if (type === 'savings') { savings = savings.filter(r => r.id !== id); DB.save('savings', savings); }
  refreshAll();
}

// ──────────────────────────────────────────────
// 10. BUDGET TAB
// ──────────────────────────────────────────────
const BUDGET_CATS = ['Housing', 'Food', 'Transport', 'Utilities', 'Health',
  'Entertainment', 'Shopping', 'Education', 'Insurance', 'Debt Payment', 'Personal Care', 'Other'];

document.getElementById('save-budget-btn').addEventListener('click', () => {
  BUDGET_CATS.forEach(cat => {
    const el = document.getElementById('budget-input-' + cat);
    if (el) budgets[cat] = parseFloat(el.value) || 0;
  });
  DB.save('budgets', budgets);
  renderBudget();
});

function renderBudget() {
  const { month, year } = getSelPeriod();
  const tbody = document.getElementById('budget-tbody');
  tbody.innerHTML = '';
  let totalBudget = 0, totalActual = 0;
  BUDGET_CATS.forEach(cat => {
    const budget = budgets[cat] || 0;
    const actual = filterByPeriod(expenses, month, year)
      .filter(r => r.category === cat).reduce((s, r) => s + r.amount, 0);
    const variance = actual - budget;
    const pctUsed = budget > 0 ? actual / budget : (actual > 0 ? 1 : 0);
    const statusBadge = budget === 0 ? '<span class="badge" style="background:var(--surface-3);color:var(--txt-3)">No Budget</span>' :
      pctUsed > 1 ? '<span class="badge badge-over">⚠ Over</span>' :
        pctUsed > 0.85 ? '<span class="badge badge-warn">⚡ Warning</span>' :
          '<span class="badge badge-ok">✅ OK</span>';
    totalBudget += budget; totalActual += actual;
    const barColor = pctUsed > 1 ? '#f25c7a' : pctUsed > 0.85 ? '#f9a03c' : '#22d6a0';
    const barW = Math.min(100, pctUsed * 100).toFixed(1);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${CAT_EMOJI[cat] || '📦'} ${cat}</td>
      <td><input type="number" id="budget-input-${cat}" class="fi" style="width:120px;padding:5px 9px"
           value="${budget || ''}" placeholder="0.00" min="0" step="0.01"/></td>
      <td class="${actual > budget && budget > 0 ? 'amount-expense' : 'amount-neutral'}">${fmt(actual)}</td>
      <td class="${variance > 0 ? 'amount-expense' : variance < 0 ? 'amount-income' : 'amount-neutral'}">
        ${variance > 0 ? '+' : ''}${fmt(variance)}</td>
      <td>
        <div class="progress-wrap"><div class="progress-bar" style="width:${barW}%;background:${barColor}"></div></div>
        <span style="font-size:11px;color:var(--txt-3)">${(pctUsed * 100).toFixed(0)}%</span>
      </td>
      <td>${statusBadge}</td>`;
    tbody.appendChild(tr);
  });
  const totVar = totalActual - totalBudget;
  document.getElementById('budget-totals').innerHTML = `
    <div class="budget-total-item"><span class="budget-total-label">Total Budgeted</span><span class="budget-total-val" style="color:var(--neutral)">${fmt(totalBudget)}</span></div>
    <div class="budget-total-item"><span class="budget-total-label">Total Spent</span><span class="budget-total-val" style="color:var(--expense)">${fmt(totalActual)}</span></div>
    <div class="budget-total-item"><span class="budget-total-label">Variance</span><span class="budget-total-val" style="color:${totVar > 0 ? 'var(--expense)' : 'var(--income)'}">${totVar > 0 ? '+' : ''}${fmt(totVar)}</span></div>
    <div class="budget-total-item"><span class="budget-total-label">Remaining</span><span class="budget-total-val" style="color:var(--income)">${fmt(Math.max(0, totalBudget - totalActual))}</span></div>`;
}

// ──────────────────────────────────────────────
// 11. GOALS TAB
// ──────────────────────────────────────────────
document.getElementById('add-goal-btn').addEventListener('click', () => openModal('goal-modal-backdrop'));

document.getElementById('goal-form').addEventListener('submit', e => {
  e.preventDefault();
  const g = {
    id: uid(),
    name: document.getElementById('goal-name').value.trim(),
    target: parseFloat(document.getElementById('goal-target').value),
    saved: parseFloat(document.getElementById('goal-saved').value) || 0,
    date: document.getElementById('goal-date').value,
    category: document.getElementById('goal-category').value,
  };
  if (!g.name || isNaN(g.target) || g.target <= 0) return;
  goals.push(g); DB.save('goals', goals);
  e.target.reset();
  closeModal('goal-modal-backdrop');
  renderGoals();
});

function renderGoals() {
  const grid = document.getElementById('goals-grid');
  const empty = document.getElementById('goals-empty');
  grid.innerHTML = '';
  if (!goals.length) { empty.classList.add('show'); return; }
  empty.classList.remove('show');
  goals.forEach(g => {
    const pctDone = Math.min(1, g.saved / g.target);
    const barColor = pctDone >= 1 ? '#22d6a0' : pctDone >= 0.5 ? '#4e94f8' : '#7c6fe0';
    const monthsLeft = Math.max(0, Math.round((new Date(g.date) - new Date()) / 1000 / 60 / 60 / 24 / 30));
    const needed = monthsLeft > 0 ? (g.target - g.saved) / monthsLeft : 0;
    const emoji = GOAL_EMOJI[g.category] || '🏆';
    const card = document.createElement('div');
    card.className = 'goal-card';
    card.innerHTML = `
      <div class="goal-card-top">
        <div>
          <div style="font-size:26px">${emoji}</div>
          <div class="goal-name">${esc(g.name)}</div>
          <div class="goal-category">${esc(g.category)}</div>
        </div>
        <button class="goal-delete" data-id="${g.id}">🗑</button>
      </div>
      <div class="goal-amounts">
        <span>Saved: <span class="goal-saved">${fmt(g.saved)}</span></span>
        <span class="goal-target">Target: ${fmt(g.target)}</span>
      </div>
      <div class="goal-progress-bar">
        <div class="goal-progress-fill" style="width:${(pctDone * 100).toFixed(1)}%;background:${barColor}"></div>
      </div>
      <div class="goal-meta">
        <span class="goal-pct" style="color:${barColor}">${(pctDone * 100).toFixed(1)}% complete</span>
        <span>${monthsLeft} months left</span>
      </div>
      ${needed > 0 ? `<div style="margin-top:8px;font-size:11px;color:var(--savings);font-weight:600">💡 Save ${fmt(needed)}/mo to reach goal</div>` : ''}
      ${pctDone >= 1 ? `<div style="margin-top:8px;font-size:12px;color:var(--income);font-weight:700">🎉 Goal Achieved!</div>` : ''}`;
    grid.appendChild(card);
  });
  grid.querySelectorAll('.goal-delete').forEach(b =>
    b.addEventListener('click', () => { goals = goals.filter(g => g.id !== b.dataset.id); DB.save('goals', goals); renderGoals(); }));
}

// ──────────────────────────────────────────────
// 12. DEBT TAB
// ──────────────────────────────────────────────
document.getElementById('add-debt-btn').addEventListener('click', () => openModal('debt-modal-backdrop'));

document.getElementById('debt-form').addEventListener('submit', e => {
  e.preventDefault();
  const d = {
    id: uid(),
    name: document.getElementById('debt-name').value.trim(),
    lender: document.getElementById('debt-lender').value.trim(),
    balance: parseFloat(document.getElementById('debt-balance').value) || 0,
    rate: parseFloat(document.getElementById('debt-rate').value) || 0,
    minpay: parseFloat(document.getElementById('debt-minpay').value) || 0,
    extra: parseFloat(document.getElementById('debt-extra').value) || 0,
  };
  if (!d.name) return;
  debts.push(d); DB.save('debts', debts);
  e.target.reset();
  closeModal('debt-modal-backdrop');
  renderDebt();
});

function calcPayoff(balance, rate, payment) {
  if (payment <= 0) return Infinity;
  const monthly = rate / 100 / 12;
  if (monthly === 0) return Math.ceil(balance / payment);
  const n = -Math.log(1 - (monthly * balance / payment)) / Math.log(1 + monthly);
  return isFinite(n) && n > 0 ? Math.ceil(n) : Infinity;
}

function renderDebt() {
  const tbody = document.getElementById('debt-tbody');
  const empty = document.getElementById('debt-empty');
  const summary = document.getElementById('debt-summary');
  tbody.innerHTML = ''; summary.innerHTML = '';
  if (!debts.length) { empty.classList.add('show'); return; }
  empty.classList.remove('show');
  let totalBal = 0, totalInt = 0, totalPay = 0;
  // Sort by rate desc (Avalanche) for strategy
  const sorted = [...debts].sort((a, b) => b.rate - a.rate);
  debts.forEach(d => {
    const monthlyInt = d.balance * (d.rate / 100 / 12);
    const totalPmt = d.minpay + d.extra;
    const months = calcPayoff(d.balance, d.rate, totalPmt);
    const strategyPos = sorted.findIndex(s => s.id === d.id) + 1;
    totalBal += d.balance; totalInt += monthlyInt; totalPay += totalPmt;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${esc(d.name)}</strong></td>
      <td style="color:var(--txt-2)">${esc(d.lender)}</td>
      <td class="amount-expense">${fmt(d.balance)}</td>
      <td style="color:var(--savings)">${d.rate.toFixed(2)}%</td>
      <td>${fmt(d.minpay)}</td>
      <td style="color:var(--expense)">${fmt(monthlyInt)}/mo</td>
      <td>${isFinite(months) ? months + 'mo' : 'Never (increase payment)'}</td>
      <td><span class="badge" style="background:var(--purple-s);color:var(--purple)">Avalanche #${strategyPos}</span></td>
      <td><button class="btn btn-danger btn-sm" data-id="${d.id}">🗑</button></td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('[data-id]').forEach(b =>
    b.addEventListener('click', () => { debts = debts.filter(d => d.id !== b.dataset.id); DB.save('debts', debts); renderDebt(); }));

  summary.innerHTML = `
    <div class="debt-summary-card"><div class="debt-summary-label">Total Debt</div><div class="debt-summary-val" style="color:var(--expense)">${fmt(totalBal)}</div></div>
    <div class="debt-summary-card"><div class="debt-summary-label">Monthly Interest</div><div class="debt-summary-val" style="color:var(--savings)">${fmt(totalInt)}</div></div>
    <div class="debt-summary-card"><div class="debt-summary-label">Monthly Payments</div><div class="debt-summary-val">${fmt(totalPay)}</div></div>
    <div class="debt-summary-card"><div class="debt-summary-label">Strategy</div><div class="debt-summary-val" style="font-size:14px;color:var(--purple)">💡 Debt Avalanche</div></div>`;
}

// ──────────────────────────────────────────────
// 13. SUMMARY TAB
// ──────────────────────────────────────────────
document.getElementById('summary-year-select').addEventListener('change', function () {
  document.getElementById('summary-year-label').textContent = this.value;
  renderSummary();
});

function renderSummary() {
  const year = +document.getElementById('summary-year-select').value;
  const tbody = document.getElementById('summary-tbody');
  const tfoot = document.getElementById('summary-tfoot');
  tbody.innerHTML = ''; tfoot.innerHTML = '';
  let totals = { inc: 0, exp: 0, sav: 0, net: 0, fixed: 0, variable: 0 };
  MONTH_NAMES.forEach((name, m) => {
    const inc = filterByPeriod(income, m, year).reduce((s, r) => s + r.amount, 0);
    const exp = filterByPeriod(expenses, m, year).reduce((s, r) => s + r.amount, 0);
    const sav = filterByPeriod(savings, m, year).reduce((s, r) => s + r.amount, 0);
    const net = inc - exp;
    const savRate = inc > 0 ? net / inc : 0;
    const expRatio = inc > 0 ? exp / inc : 0;
    const fixed = filterByPeriod(expenses, m, year).filter(r => r.fv === 'Fixed').reduce((s, r) => s + r.amount, 0);
    const variable = exp - fixed;
    const hScore = calcHealthScore(inc, exp, sav, fixed);
    totals.inc += inc; totals.exp += exp; totals.sav += sav; totals.net += net; totals.fixed += fixed; totals.variable += variable;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${name}</strong></td>
      <td class="amount-income">${fmt(inc)}</td>
      <td class="amount-expense">${fmt(exp)}</td>
      <td class="amount-savings">${fmt(sav)}</td>
      <td class="${net >= 0 ? 'amount-income' : 'amount-expense'}">${net >= 0 ? '+' : ''}${fmt(net)}</td>
      <td style="color:${savRate >= 0.2 ? 'var(--income)' : savRate >= 0.1 ? 'var(--savings)' : 'var(--expense)'}">${(savRate * 100).toFixed(1)}%</td>
      <td style="color:${expRatio <= 0.6 ? 'var(--income)' : expRatio <= 0.8 ? 'var(--savings)' : 'var(--expense)'}">${(expRatio * 100).toFixed(1)}%</td>
      <td>${fmt(fixed)}</td>
      <td>${fmt(variable)}</td>
      <td><strong style="color:${hScore >= 70 ? 'var(--income)' : hScore >= 40 ? 'var(--savings)' : 'var(--expense)'}">${hScore || '–'}</strong></td>`;
    tbody.appendChild(tr);
  });
  tfoot.innerHTML = `<tr>
    <td>TOTAL / AVG</td>
    <td>${fmt(totals.inc)}</td>
    <td>${fmt(totals.exp)}</td>
    <td>${fmt(totals.sav)}</td>
    <td class="${totals.net >= 0 ? 'amount-income' : 'amount-expense'}">${totals.net >= 0 ? '+' : ''}${fmt(totals.net)}</td>
    <td>${totals.inc > 0 ? (totals.net / totals.inc * 100).toFixed(1) + '%' : '–'}</td>
    <td>${totals.inc > 0 ? (totals.exp / totals.inc * 100).toFixed(1) + '%' : '–'}</td>
    <td>${fmt(totals.fixed)}</td>
    <td>${fmt(totals.variable)}</td>
    <td>–</td>
  </tr>`;
  renderAnalysisCards(year);
}

function renderAnalysisCards(year) {
  const grid = document.getElementById('analysis-grid');
  grid.innerHTML = '';
  const months12 = Array.from({ length: 12 }, (_, m) => ({
    inc: filterByPeriod(income, m, year).reduce((s, r) => s + r.amount, 0),
    exp: filterByPeriod(expenses, m, year).reduce((s, r) => s + r.amount, 0),
  }));
  const avgInc = months12.reduce((s, m) => s + m.inc, 0) / 12;
  const avgExp = months12.reduce((s, m) => s + m.exp, 0) / 12;
  const peakExpMonth = months12.reduce((best, m, i) => m.exp > best.val ? { val: m.exp, i } : best, { val: 0, i: 0 });
  const peakIncMonth = months12.reduce((best, m, i) => m.inc > best.val ? { val: m.inc, i } : best, { val: 0, i: 0 });
  const totalExp = months12.reduce((s, m) => s + m.exp, 0);
  const totalInc = months12.reduce((s, m) => s + m.inc, 0);
  const expGrowthVals = months12.map(m => m.exp).filter(v => v > 0);
  let growthRate = 0;
  if (expGrowthVals.length >= 2) {
    growthRate = (expGrowthVals[expGrowthVals.length - 1] - expGrowthVals[0]) / expGrowthVals[0] * 100;
  }
  const burnRate = avgExp;
  const emergSav = savings.filter(r => r.type === 'Emergency Fund').reduce((s, r) => s + r.amount, 0);
  const coverage = burnRate > 0 ? emergSav / burnRate : 0;

  const cards = [
    { title: 'Avg Monthly Income', val: fmt(avgInc), desc: `Peak: ${SHORT_MONTHS[peakIncMonth.i]} (${fmt(peakIncMonth.val)})`, color: 'var(--income)' },
    { title: 'Avg Monthly Expenses', val: fmt(avgExp), desc: `Peak: ${SHORT_MONTHS[peakExpMonth.i]} (${fmt(peakExpMonth.val)})`, color: 'var(--expense)' },
    { title: 'Expense Growth Rate', val: growthRate.toFixed(1) + '%', desc: growthRate > 10 ? '⚠️ Growing fast — review spending' : growthRate > 0 ? '📈 Moderate growth' : '✅ Stable or declining', color: growthRate > 10 ? 'var(--expense)' : growthRate > 0 ? 'var(--savings)' : 'var(--income)' },
    { title: 'Monthly Burn Rate', val: fmt(burnRate), desc: 'Average fixed monthly expenditure', color: 'var(--neutral)' },
    { title: 'Emergency Fund Coverage', val: coverage.toFixed(1) + ' months', desc: coverage >= 6 ? '✅ Fully funded (≥6 months)' : coverage >= 3 ? '⚡ Partially funded' : emergSav === 0 ? '❌ No emergency fund' : '🔴 Under-funded (<3 months)', color: coverage >= 6 ? 'var(--income)' : coverage >= 3 ? 'var(--savings)' : 'var(--expense)' },
    { title: 'Annual Savings Rate', val: totalInc > 0 ? ((totalInc - totalExp) / totalInc * 100).toFixed(1) + '%' : '–', desc: 'Net savings ÷ total income × 100', color: 'var(--savings)' },
  ];
  cards.forEach(c => {
    const div = document.createElement('div');
    div.className = 'analysis-card';
    div.innerHTML = `<div class="analysis-card-title">${c.title}</div>
      <div class="analysis-card-value" style="color:${c.color}">${c.val}</div>
      <div class="analysis-card-desc">${c.desc}</div>`;
    grid.appendChild(div);
  });
}

// ──────────────────────────────────────────────
// 14. FINANCIAL HEALTH SCORE
// ──────────────────────────────────────────────
function calcHealthScore(inc, exp, sav, fixed) {
  if (!inc && !exp) return 0;
  const savRate = inc > 0 ? (inc - exp) / inc : 0;
  const expRatio = inc > 0 ? exp / inc : 1;
  const fixRatio = exp > 0 ? fixed / exp : 0;
  const emgBal = savings.filter(r => r.type === 'Emergency Fund').reduce((s, r) => s + r.amount, 0);
  const coverage = exp > 0 ? emgBal / exp : 0;
  let score = 0;
  score += savRate >= 0.3 ? 25 : savRate >= 0.2 ? 20 : savRate >= 0.1 ? 12 : savRate >= 0 ? 5 : 0;
  score += expRatio <= 0.5 ? 25 : expRatio <= 0.6 ? 20 : expRatio <= 0.75 ? 13 : expRatio <= 0.9 ? 7 : 0;
  score += coverage >= 6 ? 25 : coverage >= 4 ? 20 : coverage >= 2 ? 12 : coverage >= 1 ? 6 : 0;
  score += fixRatio <= 0.4 ? 25 : fixRatio <= 0.55 ? 20 : fixRatio <= 0.7 ? 12 : 8;
  return Math.round(score);
}

// ──────────────────────────────────────────────
// 15. DASHBOARD KPIs
// ──────────────────────────────────────────────
function renderKPIs() {
  const { month, year } = getSelPeriod();
  const mInc = filterByPeriod(income, month, year).reduce((s, r) => s + r.amount, 0);
  const mExp = filterByPeriod(expenses, month, year).reduce((s, r) => s + r.amount, 0);
  const mSav = filterByPeriod(savings, month, year).reduce((s, r) => s + r.amount, 0);
  const net = mInc - mExp;
  const rate = mInc > 0 ? net / mInc : 0;
  const fixed = filterByPeriod(expenses, month, year).filter(r => r.fv === 'Fixed').reduce((s, r) => s + r.amount, 0);
  const score = calcHealthScore(mInc, mExp, mSav, fixed);
  const totalBudget = Object.values(budgets).reduce((s, v) => s + (+v || 0), 0);
  const remaining = totalBudget - mExp;

  document.getElementById('kpi-income').textContent = fmt(mInc);
  document.getElementById('kpi-expense').textContent = fmt(mExp);
  const netEl = document.getElementById('kpi-netsavings');
  netEl.textContent = fmt(net);
  netEl.style.color = net > 0 ? 'var(--income)' : net < 0 ? 'var(--expense)' : 'var(--txt-1)';
  document.getElementById('kpi-rate').textContent = (rate * 100).toFixed(1) + '%';
  document.getElementById('kpi-remaining').textContent = fmt(Math.max(0, remaining));
  document.getElementById('kpi-health').textContent = score || '–';
  document.getElementById('kpi-income-sub').textContent = filterByPeriod(income, month, year).length + ' transactions';
  document.getElementById('kpi-expense-sub').textContent = filterByPeriod(expenses, month, year).length + ' transactions';
  document.getElementById('kpi-remaining-sub').textContent = totalBudget > 0 ? (remaining < 0 ? '⚠ Over budget' : 'of ' + fmt(totalBudget) + ' budget') : 'Set budgets in Budget tab';
  document.getElementById('kpi-health-sub').textContent = score >= 70 ? '✅ Excellent' : score >= 40 ? '⚡ Fair' : '🔴 Needs work';
  // Analysis banner
  renderAnalysisBanner(mInc, mExp, net, rate, score);
}

function renderAnalysisBanner(inc, exp, net, rate, score) {
  const banner = document.getElementById('analysis-banner');
  const chips = [];
  if (net >= 0) chips.push({ cls: 'chip-green', icon: '✅', text: `Net savings ${fmt(net)}` });
  else chips.push({ cls: 'chip-red', icon: '⚠️', text: `Overspending by ${fmt(-net)}` });
  if (rate >= 0.2) chips.push({ cls: 'chip-green', icon: '🎯', text: `Savings rate ${(rate * 100).toFixed(1)}% — on track` });
  else chips.push({ cls: 'chip-yellow', icon: '💡', text: `Savings rate ${(rate * 100).toFixed(1)}% — target ≥20%` });
  chips.push({ cls: score >= 70 ? 'chip-green' : score >= 40 ? 'chip-yellow' : 'chip-red', icon: '❤️', text: `Health score: ${score}/100` });
  const topCat = getTopExpenseCategory();
  if (topCat) chips.push({ cls: 'chip-blue', icon: '📊', text: `Top expense: ${topCat.cat} ${fmt(topCat.amt)}` });
  banner.innerHTML = chips.map(c => `<div class="alert-chip ${c.cls}">${c.icon} ${c.text}</div>`).join('');
}

function getTopExpenseCategory() {
  const { month, year } = getSelPeriod();
  const cats = {};
  filterByPeriod(expenses, month, year).forEach(r => { cats[r.category] = (cats[r.category] || 0) + r.amount; });
  if (!Object.keys(cats).length) return null;
  const top = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
  return { cat: top[0], amt: top[1] };
}

// ──────────────────────────────────────────────
// 16. CHARTS
// ──────────────────────────────────────────────
let charts = {};
function destroyChart(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

const chartDefaults = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
};

function renderCharts() {
  const { month, year } = getSelPeriod();

  // ── Trend Chart (12 months bar+line) ──
  destroyChart('trend');
  const trendData = SHORT_MONTHS.map((_, m) => ({
    inc: filterByPeriod(income, m, year).reduce((s, r) => s + r.amount, 0),
    exp: filterByPeriod(expenses, m, year).reduce((s, r) => s + r.amount, 0),
    sav: filterByPeriod(savings, m, year).reduce((s, r) => s + r.amount, 0),
  }));
  charts.trend = new Chart(document.getElementById('trendChart'), {
    type: 'bar',
    data: {
      labels: SHORT_MONTHS,
      datasets: [
        { label: 'Income', data: trendData.map(d => d.inc), backgroundColor: 'rgba(34,214,160,.6)', borderRadius: 5, borderSkipped: false },
        { label: 'Expense', data: trendData.map(d => d.exp), backgroundColor: 'rgba(242,92,122,.6)', borderRadius: 5, borderSkipped: false },
        {
          label: 'Savings', data: trendData.map(d => d.sav), type: 'line', borderColor: '#56cef7', borderWidth: 2,
          pointBackgroundColor: '#56cef7', pointRadius: 3, fill: false, tension: .4
        },
      ]
    },
    options: {
      ...chartDefaults, plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#8b93c4', font: { size: 10 } } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#8b93c4', font: { size: 10 }, callback: v => 'रू ' + v.toLocaleString() }, beginAtZero: true }
      }
    }
  });

  // ── Pie Chart (expense categories) ──
  destroyChart('pie');
  const cats = {};
  filterByPeriod(expenses, month, year).forEach(r => { cats[r.category] = (cats[r.category] || 0) + r.amount; });
  const catLabels = Object.keys(cats);
  const catVals = Object.values(cats);
  const catColors = catLabels.map((_, i) => PALETTE[i % PALETTE.length]);
  const pieEl = document.getElementById('pieChart');
  const pieLeg = document.getElementById('pie-legend');
  pieLeg.innerHTML = '';
  if (catLabels.length === 0) {
    charts.pie = new Chart(pieEl, {
      type: 'doughnut',
      data: { labels: ['No Data'], datasets: [{ data: [1], backgroundColor: ['#232647'], borderWidth: 0 }] },
      options: { ...chartDefaults, cutout: '70%', plugins: { tooltip: { enabled: false } } }
    });
  } else {
    charts.pie = new Chart(pieEl, {
      type: 'doughnut',
      data: { labels: catLabels, datasets: [{ data: catVals, backgroundColor: catColors, borderWidth: 2, borderColor: '#171a31' }] },
      options: { ...chartDefaults, cutout: '68%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.label}: रू ${ctx.parsed.toFixed(2)}` } } } }
    });
    catLabels.forEach((l, i) => {
      const el = document.createElement('div'); el.className = 'pie-legend-item';
      el.innerHTML = `<span class="pie-dot" style="background:${catColors[i]}"></span>${l}`;
      pieLeg.appendChild(el);
    });
  }

  // ── Monthly Savings Bar ──
  destroyChart('savingsBar');
  const savData = SHORT_MONTHS.map((_, m) => ({
    inc: filterByPeriod(income, m, year).reduce((s, r) => s + r.amount, 0),
    exp: filterByPeriod(expenses, m, year).reduce((s, r) => s + r.amount, 0),
  })).map(d => d.inc - d.exp);
  charts.savingsBar = new Chart(document.getElementById('savingsBar'), {
    type: 'bar',
    data: {
      labels: SHORT_MONTHS, datasets: [{
        data: savData,
        backgroundColor: savData.map(v => v >= 0 ? 'rgba(34,214,160,.7)' : 'rgba(242,92,122,.7)'),
        borderRadius: 5, borderSkipped: false
      }]
    },
    options: {
      ...chartDefaults, scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#8b93c4', font: { size: 9 } } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#8b93c4', font: { size: 9 }, callback: v => 'रू ' + v.toLocaleString() }, beginAtZero: true }
      }
    }
  });

  // ── Weekly Expense Trend ──
  destroyChart('weekly');
  const weekLabels = [], weekVals = [];
  for (let w = 7; w >= 0; w--) {
    const end = new Date(); end.setDate(end.getDate() - w * 7);
    const start = new Date(end); start.setDate(start.getDate() - 6);
    const label = 'W' + (8 - w);
    const total = expenses.filter(r => { const d = new Date(r.date + 'T12:00:00'); return d >= start && d <= end; }).reduce((s, r) => s + r.amount, 0);
    weekLabels.push(label); weekVals.push(total);
  }
  charts.weekly = new Chart(document.getElementById('weeklyChart'), {
    type: 'line',
    data: {
      labels: weekLabels, datasets: [{
        data: weekVals, borderColor: '#f25c7a', backgroundColor: 'rgba(242,92,122,.12)',
        borderWidth: 2, pointBackgroundColor: '#f25c7a', pointRadius: 3, fill: true, tension: .4
      }]
    },
    options: {
      ...chartDefaults, scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#8b93c4', font: { size: 10 } } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#8b93c4', font: { size: 10 }, callback: v => 'रू ' + v }, beginAtZero: true }
      }
    }
  });

  // ── Fixed vs Variable Doughnut ──
  destroyChart('fixedVar');
  const fixedAmt = filterByPeriod(expenses, month, year).filter(r => r.fv === 'Fixed').reduce((s, r) => s + r.amount, 0);
  const variableAmt = filterByPeriod(expenses, month, year).filter(r => r.fv === 'Variable').reduce((s, r) => s + r.amount, 0);
  charts.fixedVar = new Chart(document.getElementById('fixedVarChart'), {
    type: 'doughnut',
    data: {
      labels: ['Fixed', 'Variable'], datasets: [{
        data: [fixedAmt || 0, variableAmt || 0],
        backgroundColor: ['#7c6fe0', '#56cef7'],
        borderWidth: 2, borderColor: '#171a31'
      }]
    },
    options: {
      ...chartDefaults, cutout: '68%', plugins: {
        legend: {
          display: true, position: 'bottom',
          labels: { color: '#8b93c4', font: { size: 11 }, padding: 14 }
        }
      }
    }
  });
}

// ──────────────────────────────────────────────
// 17. YEARLY SUMMARY TABLE ON DASHBOARD
// ──────────────────────────────────────────────
function renderYearlySummary() {
  const year = getSelPeriod().year;
  const tbody = document.getElementById('yearly-tbody');
  tbody.innerHTML = '';
  SHORT_MONTHS.forEach((name, m) => {
    const inc = filterByPeriod(income, m, year).reduce((s, r) => s + r.amount, 0);
    const exp = filterByPeriod(expenses, m, year).reduce((s, r) => s + r.amount, 0);
    const net = inc - exp;
    const rate = inc > 0 ? net / inc : 0;
    const burn = exp;
    const status = net >= 0 ? '<span class="badge badge-ok">✅ Positive</span>' : '<span class="badge badge-over">🔴 Deficit</span>';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${name} ${year}</strong></td>
      <td class="amount-income">${fmt(inc)}</td>
      <td class="amount-expense">${fmt(exp)}</td>
      <td class="${net >= 0 ? 'amount-income' : 'amount-expense'}">${net >= 0 ? '+' : ''}${fmt(net)}</td>
      <td style="color:${rate >= 0.2 ? 'var(--income)' : rate >= 0.1 ? 'var(--savings)' : 'var(--expense)'}">${(rate * 100).toFixed(1)}%</td>
      <td>${fmt(burn)}</td>
      <td>${status}</td>`;
    tbody.appendChild(tr);
  });
}

// ──────────────────────────────────────────────
// 18. RENDER DASHBOARD
// ──────────────────────────────────────────────
function renderDashboard() {
  renderKPIs();
  renderCharts();
  renderYearlySummary();
}

// ──────────────────────────────────────────────
// 19. GLOBAL REFRESH
// ──────────────────────────────────────────────
function refreshAll() {
  const active = document.querySelector('.tab-panel.active');
  if (active) renderTab(active.id.replace('tab-', ''));
}

// ──────────────────────────────────────────────
// 20. SEED DEMO DATA (first visit only)
// ──────────────────────────────────────────────
function seedData() {
  if (income.length || expenses.length) return;
  const y = now.getFullYear();
  const m = (month) => String(month + 1).padStart(2, '0');

  // Seed income – last 3 months
  [1, 2, now.getMonth()].forEach(mo => {
    income.push({ id: uid(), date: `${y}-${m(mo)}-01`, source: 'Employer Corp', category: 'Salary', amount: 4500, payment: 'Bank Transfer', notes: 'Monthly salary' });
    income.push({ id: uid(), date: `${y}-${m(mo)}-10`, source: 'Freelance Client', category: 'Freelance', amount: 650, payment: 'PayPal', notes: 'Design project' });
    income.push({ id: uid(), date: `${y}-${m(mo)}-15`, source: 'Dividends', category: 'Investment', amount: 280, payment: 'Bank Transfer', notes: 'Q dividend' });
  });

  // Seed expenses – last 3 months
  const expSeed = [
    { category: 'Housing', sub: 'Rent', amount: 1200, fv: 'Fixed', payment: 'Bank Transfer' },
    { category: 'Food', sub: 'Groceries', amount: 200, fv: 'Variable', payment: 'Credit Card' },
    { category: 'Food', sub: 'Restaurant', amount: 80, fv: 'Variable', payment: 'Cash' },
    { category: 'Transport', sub: 'Fuel', amount: 70, fv: 'Variable', payment: 'Cash' },
    { category: 'Utilities', sub: 'Internet', amount: 55, fv: 'Fixed', payment: 'Bank Transfer' },
    { category: 'Utilities', sub: 'Electricity', amount: 85, fv: 'Fixed', payment: 'Bank Transfer' },
    { category: 'Health', sub: 'Gym', amount: 45, fv: 'Fixed', payment: 'Credit Card' },
    { category: 'Entertainment', sub: 'Streaming', amount: 28, fv: 'Fixed', payment: 'Credit Card' },
    { category: 'Shopping', sub: 'Clothing', amount: 150, fv: 'Variable', payment: 'Credit Card' },
    { category: 'Education', sub: 'Course', amount: 99, fv: 'Variable', payment: 'PayPal' },
  ];
  [1, 2, now.getMonth()].forEach((mo, i) => {
    expSeed.forEach((e, j) => {
      expenses.push({
        id: uid(), date: `${y}-${m(mo)}-${String(j * 2 + 2).padStart(2, '0')}`,
        ...e, notes: ''
      });
    });
  });

  // Seed savings
  [1, 2, now.getMonth()].forEach(mo => {
    savings.push({ id: uid(), date: `${y}-${m(mo)}-01`, type: 'Emergency Fund', amount: 500, account: 'HYSA', notes: 'Monthly auto-save' });
    savings.push({ id: uid(), date: `${y}-${m(mo)}-01`, type: 'Retirement', amount: 300, account: '401(k)', notes: 'Employer matched' });
    savings.push({ id: uid(), date: `${y}-${m(mo)}-05`, type: 'Investment', amount: 350, account: 'Brokerage', notes: 'Index fund' });
  });

  // Default budgets
  budgets = {
    Housing: 1200, Food: 350, Transport: 100, Utilities: 150, Health: 80,
    Entertainment: 80, Shopping: 200, Education: 150, Insurance: 0, 'Debt Payment': 0, 'Personal Care': 50, Other: 100
  };

  // Seed goals
  goals.push({ id: uid(), name: 'Emergency Fund', target: 15000, saved: 8500, date: `${y}-12-31`, category: 'Emergency Fund' });
  goals.push({ id: uid(), name: 'Summer Vacation', target: 3000, saved: 1200, date: `${y}-07-01`, category: 'Vacation' });
  goals.push({ id: uid(), name: 'New Laptop', target: 2000, saved: 800, date: `${y}-06-01`, category: 'Other' });

  // Seed debts
  debts.push({ id: uid(), name: 'Credit Card', lender: 'Bank A', balance: 2400, rate: 22, minpay: 50, extra: 200 });
  debts.push({ id: uid(), name: 'Student Loan', lender: 'Gov. Fund', balance: 18000, rate: 5.5, minpay: 210, extra: 0 });

  DB.save('income', income); DB.save('expenses', expenses); DB.save('savings', savings);
  DB.save('goals', goals); DB.save('debts', debts); DB.save('budgets', budgets);
}

// ──────────────────────────────────────────────
// 21. INIT
// ──────────────────────────────────────────────
seedData();
activateTab('dashboard');

// ──────────────────────────────────────────────
// 22. MOBILE SIDEBAR TOGGLE
// ──────────────────────────────────────────────
(function initMobileNav() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const hamburger = document.getElementById('hamburger-btn');

  function openSidebar() { sidebar.classList.add('open'); overlay.classList.add('show'); document.body.style.overflow = 'hidden'; }
  function closeSidebar() { sidebar.classList.remove('open'); overlay.classList.remove('show'); document.body.style.overflow = ''; }

  hamburger.addEventListener('click', () => sidebar.classList.contains('open') ? closeSidebar() : openSidebar());
  overlay.addEventListener('click', closeSidebar);

  // Auto-close sidebar when a nav link is tapped on mobile
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => { if (window.innerWidth <= 768) closeSidebar(); });
  });

  // Close sidebar on window resize if it becomes desktop
  window.addEventListener('resize', () => { if (window.innerWidth > 768) closeSidebar(); });
})();
