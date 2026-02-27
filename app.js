const API = '';
let currentMonth = new Date().toISOString().slice(0, 7);
let currentPage = 'budget';

const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

function monthLabel(id) {
  const [y, m] = id.split('-');
  return `${MONTHS_FR[parseInt(m) - 1]} ${y}`;
}

function fmt(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
}

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

// Navigation
function switchPage(page) {
  currentPage = page;
  $$('.page').forEach(p => p.classList.remove('active'));
  $$('.tab').forEach(t => t.classList.remove('active'));
  $(`#page-${page}`).classList.add('active');
  $(`[data-page="${page}"]`).classList.add('active');
  if (page === 'budget') loadMonth();
  if (page === 'summary') loadSummary();
  if (page === 'history') loadHistory();
}

// Month navigation
function prevMonth() {
  const [y, m] = currentMonth.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  currentMonth = d.toISOString().slice(0, 7);
  loadMonth();
}

function nextMonth() {
  const [y, m] = currentMonth.split('-').map(Number);
  const d = new Date(y, m, 1);
  currentMonth = d.toISOString().slice(0, 7);
  loadMonth();
}

// Load month data
async function loadMonth() {
  const res = await fetch(`${API}/api/month?id=${currentMonth}`);
  const data = await res.json();
  $('#monthLabel').textContent = monthLabel(currentMonth);
  $('#salaryInput').value = data.month.salary || 0;
  renderExpenses(data.expenses);
  updateSummaryBoxes(data);
}

function updateSummaryBoxes(data) {
  const expenses = data.expenses || [];
  const salary = data.month.salary || 0;
  const totalEst = expenses.reduce((s, e) => s + e.estimated, 0);
  const totalAct = expenses.reduce((s, e) => s + e.actual, 0);
  const balance = salary - totalAct;
  const remaining = salary - totalEst;

  $('#totalEstimated').textContent = fmt(totalEst);
  $('#totalActual').textContent = fmt(totalAct);
  $('#balance').textContent = fmt(balance);
  $('#balance').style.color = balance >= 0 ? 'var(--green)' : 'var(--red)';
  $('#remaining').textContent = fmt(remaining);
  $('#remaining').style.color = remaining >= 0 ? 'var(--green)' : 'var(--red)';
}

function renderExpenses(expenses) {
  const tbody = $('#expenseBody');
  tbody.innerHTML = '';

  const fixed = expenses.filter(e => e.type === 'fixed');
  const variable = expenses.filter(e => e.type === 'variable');

  if (fixed.length) {
    tbody.innerHTML += `<tr><td colspan="6" style="padding:12px;color:var(--blue);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:1px;background:rgba(96,165,250,0.05)">Dépenses fixes</td></tr>`;
    fixed.forEach(e => tbody.innerHTML += expenseRow(e));
  }
  if (variable.length) {
    tbody.innerHTML += `<tr><td colspan="6" style="padding:12px;color:var(--yellow);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:1px;background:rgba(251,191,36,0.05)">Dépenses variables</td></tr>`;
    variable.forEach(e => tbody.innerHTML += expenseRow(e));
  }
}

function expenseRow(e) {
  const diff = e.estimated - e.actual;
  const diffClass = diff >= 0 ? 'diff-positive' : 'diff-negative';
  const diffText = diff >= 0 ? `+${fmt(diff)}` : fmt(diff);
  return `
    <tr data-id="${e.id}">
      <td><input value="${e.label}" onchange="updateExpense(${e.id}, 'label', this.value)" /></td>
      <td><input value="${e.category}" onchange="updateExpense(${e.id}, 'category', this.value)" /></td>
      <td>
        <select onchange="updateExpense(${e.id}, 'type', this.value)">
          <option value="fixed" ${e.type === 'fixed' ? 'selected' : ''}>Fixe</option>
          <option value="variable" ${e.type === 'variable' ? 'selected' : ''}>Variable</option>
        </select>
      </td>
      <td><input type="number" step="0.01" value="${e.estimated}" onchange="updateExpense(${e.id}, 'estimated', +this.value)" /></td>
      <td><input type="number" step="0.01" value="${e.actual}" onchange="updateExpense(${e.id}, 'actual', +this.value)" /></td>
      <td class="${diffClass}" style="font-size:12px;white-space:nowrap">${diffText}</td>
      <td><button class="btn btn-danger btn-sm" onclick="deleteExpense(${e.id})">×</button></td>
    </tr>`;
}

async function updateSalary() {
  const salary = parseFloat($('#salaryInput').value) || 0;
  await fetch(`${API}/api/salary`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ month_id: currentMonth, salary })
  });
  loadMonth();
}

async function updateExpense(id, field, value) {
  const row = document.querySelector(`tr[data-id="${id}"]`);
  const inputs = row.querySelectorAll('input');
  const select = row.querySelector('select');
  await fetch(`${API}/api/expense`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id,
      label: inputs[0].value,
      category: inputs[1].value,
      type: select.value,
      estimated: parseFloat(inputs[2].value) || 0,
      actual: parseFloat(inputs[3].value) || 0
    })
  });
  loadMonth();
}

async function addExpense() {
  await fetch(`${API}/api/expense`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      month_id: currentMonth,
      category: 'Autre',
      type: 'variable',
      label: 'Nouvelle dépense',
      estimated: 0,
      actual: 0
    })
  });
  loadMonth();
}

async function deleteExpense(id) {
  await fetch(`${API}/api/expense?id=${id}`, { method: 'DELETE' });
  loadMonth();
}

// === SUMMARY PAGE ===
async function loadSummary() {
  const res = await fetch(`${API}/api/month?id=${currentMonth}`);
  const data = await res.json();
  $('#summaryMonthLabel').textContent = monthLabel(currentMonth);

  const expenses = data.expenses || [];
  const salary = data.month.salary || 0;
  const totalEst = expenses.reduce((s, e) => s + e.estimated, 0);
  const totalAct = expenses.reduce((s, e) => s + e.actual, 0);

  // Category breakdown
  const byCategory = {};
  expenses.forEach(e => {
    if (!byCategory[e.category]) byCategory[e.category] = { estimated: 0, actual: 0 };
    byCategory[e.category].estimated += e.estimated;
    byCategory[e.category].actual += e.actual;
  });

  // Type breakdown
  const fixed = expenses.filter(e => e.type === 'fixed');
  const variable = expenses.filter(e => e.type === 'variable');
  const fixedTotal = fixed.reduce((s, e) => s + e.actual, 0);
  const variableTotal = variable.reduce((s, e) => s + e.actual, 0);

  drawDonut('chartDonut', byCategory);
  drawBarChart('chartBar', byCategory);
  drawStackedBar('chartStacked', salary, fixedTotal, variableTotal);
  drawEstVsActual('chartComparison', byCategory);
}

function drawDonut(canvasId, byCategory) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const w = rect.width, h = rect.height;
  ctx.clearRect(0, 0, w, h);

  const cats = Object.entries(byCategory).filter(([,v]) => v.actual > 0);
  if (!cats.length) { ctx.fillStyle = '#6a6a80'; ctx.fillText('Aucune donnée', w/2-30, h/2); return; }

  const total = cats.reduce((s, [,v]) => s + v.actual, 0);
  const colors = ['#7c5cfc','#34d399','#fbbf24','#f87171','#60a5fa','#22d3ee','#a78bfa','#fb923c'];
  const cx = w * 0.4, cy = h / 2, r = Math.min(cx, cy) - 20, inner = r * 0.55;

  let angle = -Math.PI / 2;
  cats.forEach(([name, val], i) => {
    const slice = (val.actual / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, angle, angle + slice);
    ctx.arc(cx, cy, inner, angle + slice, angle, true);
    ctx.closePath();
    ctx.fillStyle = colors[i % colors.length];
    ctx.fill();
    angle += slice;
  });

  // Center text
  ctx.fillStyle = '#e0e0e8';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(fmt(total), cx, cy + 6);

  // Legend
  let ly = 20;
  cats.forEach(([name, val], i) => {
    const pct = ((val.actual / total) * 100).toFixed(0);
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(w * 0.75, ly, 10, 10);
    ctx.fillStyle = '#e0e0e8';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${name} (${pct}%)`, w * 0.75 + 16, ly + 9);
    ly += 20;
  });
}

function drawBarChart(canvasId, byCategory) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const w = rect.width, h = rect.height;
  ctx.clearRect(0, 0, w, h);

  const cats = Object.entries(byCategory);
  if (!cats.length) return;

  const maxVal = Math.max(...cats.map(([,v]) => Math.max(v.estimated, v.actual)));
  if (maxVal === 0) return;

  const margin = { top: 10, right: 10, bottom: 40, left: 10 };
  const plotW = w - margin.left - margin.right;
  const plotH = h - margin.top - margin.bottom;
  const barGroupW = plotW / cats.length;
  const barW = barGroupW * 0.3;

  cats.forEach(([name, val], i) => {
    const x = margin.left + i * barGroupW + barGroupW * 0.15;
    const estH = (val.estimated / maxVal) * plotH;
    const actH = (val.actual / maxVal) * plotH;

    // Estimated
    ctx.fillStyle = 'rgba(124, 92, 252, 0.3)';
    ctx.fillRect(x, margin.top + plotH - estH, barW, estH);
    ctx.strokeStyle = 'rgba(124, 92, 252, 0.6)';
    ctx.strokeRect(x, margin.top + plotH - estH, barW, estH);

    // Actual
    ctx.fillStyle = val.actual > val.estimated ? 'rgba(248,113,113,0.5)' : 'rgba(52,211,153,0.5)';
    ctx.fillRect(x + barW + 2, margin.top + plotH - actH, barW, actH);

    // Label
    ctx.fillStyle = '#6a6a80';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.save();
    ctx.translate(x + barW, h - 5);
    ctx.rotate(-0.4);
    ctx.fillText(name.slice(0, 12), 0, 0);
    ctx.restore();
  });
}

function drawStackedBar(canvasId, salary, fixed, variable) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const w = rect.width, h = rect.height;
  ctx.clearRect(0, 0, w, h);

  if (salary === 0) { ctx.fillStyle = '#6a6a80'; ctx.fillText('Renseignez le salaire', 20, h/2); return; }

  const remaining = Math.max(0, salary - fixed - variable);
  const barH = 40;
  const y = h / 2 - barH / 2;
  const margin = 40;
  const barW = w - margin * 2;

  // Background (salary)
  ctx.fillStyle = '#1e1e2e';
  ctx.roundRect(margin, y, barW, barH, 6);
  ctx.fill();

  // Fixed
  const fixedW = (fixed / salary) * barW;
  ctx.fillStyle = '#60a5fa';
  ctx.beginPath();
  ctx.roundRect(margin, y, fixedW, barH, [6, 0, 0, 6]);
  ctx.fill();

  // Variable
  const varW = (variable / salary) * barW;
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(margin + fixedW, y, varW, barH);

  // Remaining
  if (remaining > 0) {
    const remW = (remaining / salary) * barW;
    ctx.fillStyle = 'rgba(52, 211, 153, 0.3)';
    ctx.beginPath();
    ctx.roundRect(margin + fixedW + varW, y, remW, barH, [0, 6, 6, 0]);
    ctx.fill();
  }

  // Labels
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  const items = [
    { label: `Fixe: ${fmt(fixed)}`, color: '#60a5fa', x: w * 0.2 },
    { label: `Variable: ${fmt(variable)}`, color: '#fbbf24', x: w * 0.5 },
    { label: `Reste: ${fmt(remaining)}`, color: '#34d399', x: w * 0.8 },
  ];
  items.forEach(item => {
    ctx.fillStyle = item.color;
    ctx.fillText(item.label, item.x, y + barH + 24);
  });

  ctx.fillStyle = '#6a6a80';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`Salaire: ${fmt(salary)}`, w / 2, y - 10);
}

function drawEstVsActual(canvasId, byCategory) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const w = rect.width, h = rect.height;
  ctx.clearRect(0, 0, w, h);

  const cats = Object.entries(byCategory).filter(([,v]) => v.estimated > 0 || v.actual > 0);
  if (!cats.length) return;

  const rowH = Math.min(30, (h - 20) / cats.length);
  const maxVal = Math.max(...cats.map(([,v]) => Math.max(v.estimated, v.actual)));
  if (maxVal === 0) return;

  const labelW = 100;
  const barMaxW = w - labelW - 80;

  cats.forEach(([name, val], i) => {
    const y = 10 + i * rowH;
    ctx.fillStyle = '#6a6a80';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(name.slice(0, 12), labelW - 8, y + rowH * 0.65);

    const estW = (val.estimated / maxVal) * barMaxW;
    const actW = (val.actual / maxVal) * barMaxW;

    // Estimated (background)
    ctx.fillStyle = 'rgba(124, 92, 252, 0.2)';
    ctx.fillRect(labelW, y + 4, estW, rowH * 0.35);

    // Actual
    ctx.fillStyle = val.actual > val.estimated ? 'rgba(248,113,113,0.6)' : 'rgba(52,211,153,0.6)';
    ctx.fillRect(labelW, y + rowH * 0.45, actW, rowH * 0.35);

    // Value
    ctx.fillStyle = '#6a6a80';
    ctx.textAlign = 'left';
    ctx.font = '10px sans-serif';
    ctx.fillText(fmt(val.actual), labelW + actW + 4, y + rowH * 0.75);
  });
}

// === HISTORY PAGE ===
async function loadHistory() {
  const res = await fetch(`${API}/api/history`);
  const data = await res.json();

  const tbody = $('#historyBody');
  tbody.innerHTML = '';
  data.forEach(m => {
    const balClass = m.balance >= 0 ? 'diff-positive' : 'diff-negative';
    tbody.innerHTML += `
      <tr onclick="currentMonth='${m.id}';switchPage('budget')">
        <td style="font-weight:600">${monthLabel(m.id)}</td>
        <td>${fmt(m.salary)}</td>
        <td>${fmt(m.totalEstimated)}</td>
        <td>${fmt(m.totalActual)}</td>
        <td>${fmt(m.fixedActual)}</td>
        <td>${fmt(m.variableActual)}</td>
        <td class="${balClass}" style="font-weight:600">${fmt(m.balance)}</td>
      </tr>`;
  });

  drawHistoryChart(data);
}

function drawHistoryChart(data) {
  const canvas = document.getElementById('chartHistory');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const w = rect.width, h = rect.height;
  ctx.clearRect(0, 0, w, h);

  const sorted = [...data].sort((a, b) => a.id.localeCompare(b.id)).slice(-12);
  if (!sorted.length) return;

  const margin = { top: 20, right: 20, bottom: 40, left: 20 };
  const plotW = w - margin.left - margin.right;
  const plotH = h - margin.top - margin.bottom;
  const maxVal = Math.max(...sorted.map(m => Math.max(m.salary, m.totalActual)));
  if (maxVal === 0) return;

  const step = plotW / (sorted.length - 1 || 1);

  // Salary line
  ctx.beginPath();
  sorted.forEach((m, i) => {
    const x = margin.left + i * step;
    const y = margin.top + plotH - (m.salary / maxVal) * plotH;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#34d399';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Actual line
  ctx.beginPath();
  sorted.forEach((m, i) => {
    const x = margin.left + i * step;
    const y = margin.top + plotH - (m.totalActual / maxVal) * plotH;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#f87171';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Labels
  sorted.forEach((m, i) => {
    const x = margin.left + i * step;
    ctx.fillStyle = '#6a6a80';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(m.id.slice(5), x, h - 10);
  });

  // Legend
  ctx.fillStyle = '#34d399'; ctx.fillRect(w - 140, 8, 10, 10);
  ctx.fillStyle = '#e0e0e8'; ctx.font = '11px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('Salaire', w - 126, 17);
  ctx.fillStyle = '#f87171'; ctx.fillRect(w - 140, 24, 10, 10);
  ctx.fillStyle = '#e0e0e8'; ctx.fillText('Dépensé', w - 126, 33);
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  $$('.tab').forEach(t => t.addEventListener('click', () => switchPage(t.dataset.page)));
  switchPage('budget');
});
