const API = '';
let currentMonth = new Date().toISOString().slice(0, 7);
let currentPage = 'budget';
let monthData = null;

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

// Effective split for an expense
function effectiveSplit(e, prorata) {
  return e.split_p1 < 0 ? prorata : e.split_p1;
}

// Load month
async function loadMonth() {
  const res = await fetch(`${API}/api/month?id=${currentMonth}`);
  monthData = await res.json();
  const { month, expenses, prorata } = monthData;

  $('#monthLabel').textContent = monthLabel(currentMonth);
  $('#salaryP1').value = month.salary || 0;
  $('#salaryP2').value = month.salary_p2 || 0;
  $('#nameP1').value = month.name_p1 || 'Personne 1';
  $('#nameP2').value = month.name_p2 || 'Personne 2';
  $('#prorataInfo').textContent = `Prorata : ${month.name_p1} ${prorata}% / ${month.name_p2} ${(100 - prorata).toFixed(1)}%`;

  renderExpenses(expenses, prorata);
  updateSummaryBoxes(monthData);
  renderPersonSummary(monthData);
}

function updateSummaryBoxes(data) {
  const { month, expenses, prorata } = data;
  const totalSalary = (month.salary || 0) + (month.salary_p2 || 0);
  const totalEst = expenses.reduce((s, e) => s + e.estimated, 0);
  const totalAct = expenses.reduce((s, e) => s + e.actual, 0);
  const balance = totalSalary - totalAct;
  const remaining = totalSalary - totalEst;

  $('#totalEstimated').textContent = fmt(totalEst);
  $('#totalActual').textContent = fmt(totalAct);
  $('#balance').textContent = fmt(balance);
  $('#balance').style.color = balance >= 0 ? 'var(--green)' : 'var(--red)';
  $('#remaining').textContent = fmt(remaining);
  $('#remaining').style.color = remaining >= 0 ? 'var(--green)' : 'var(--red)';
}

function renderPersonSummary(data) {
  const { month, expenses, prorata } = data;
  let p1 = 0, p2 = 0;
  expenses.forEach(e => {
    const sp = effectiveSplit(e, prorata);
    p1 += e.actual * sp / 100;
    p2 += e.actual * (100 - sp) / 100;
  });
  p1 = Math.round(p1 * 100) / 100;
  p2 = Math.round(p2 * 100) / 100;
  const bal1 = (month.salary || 0) - p1;
  const bal2 = (month.salary_p2 || 0) - p2;

  $('#personSummary').innerHTML = `
    <div class="person-card person-card-1">
      <div class="person-name">${month.name_p1}</div>
      <div class="person-stat"><span>Salaire</span><span>${fmt(month.salary || 0)}</span></div>
      <div class="person-stat"><span>Dépenses</span><span>${fmt(p1)}</span></div>
      <div class="person-stat"><span>Reste</span><span style="color:${bal1 >= 0 ? 'var(--green)' : 'var(--red)'}">${fmt(bal1)}</span></div>
    </div>
    <div class="person-card person-card-2">
      <div class="person-name">${month.name_p2}</div>
      <div class="person-stat"><span>Salaire</span><span>${fmt(month.salary_p2 || 0)}</span></div>
      <div class="person-stat"><span>Dépenses</span><span>${fmt(p2)}</span></div>
      <div class="person-stat"><span>Reste</span><span style="color:${bal2 >= 0 ? 'var(--green)' : 'var(--red)'}">${fmt(bal2)}</span></div>
    </div>`;
}

function renderExpenses(expenses, prorata) {
  const tbody = $('#expenseBody');
  tbody.innerHTML = '';
  const fixed = expenses.filter(e => e.type === 'fixed');
  const variable = expenses.filter(e => e.type === 'variable');

  if (fixed.length) {
    tbody.innerHTML += `<tr><td colspan="8" style="padding:12px;color:var(--blue);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:1px;background:rgba(96,165,250,0.05)">Dépenses fixes</td></tr>`;
    fixed.forEach(e => tbody.innerHTML += expenseRow(e, prorata));
  }
  if (variable.length) {
    tbody.innerHTML += `<tr><td colspan="8" style="padding:12px;color:var(--yellow);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:1px;background:rgba(251,191,36,0.05)">Dépenses variables</td></tr>`;
    variable.forEach(e => tbody.innerHTML += expenseRow(e, prorata));
  }
}

function expenseRow(e, prorata) {
  const diff = e.estimated - e.actual;
  const diffClass = diff >= 0 ? 'diff-positive' : 'diff-negative';
  const diffText = diff >= 0 ? `+${fmt(diff)}` : fmt(diff);
  const sp = effectiveSplit(e, prorata);
  const isCustom = e.split_p1 >= 0;
  const splitLabel = `${sp.toFixed(0)}/${(100-sp).toFixed(0)}`;

  return `
    <tr data-id="${e.id}">
      <td data-label="Libellé"><input value="${e.label}" onchange="updateExpense(${e.id})" /></td>
      <td data-label="Catégorie"><input value="${e.category}" onchange="updateExpense(${e.id})" /></td>
      <td data-label="Type">
        <select onchange="updateExpense(${e.id})">
          <option value="fixed" ${e.type === 'fixed' ? 'selected' : ''}>Fixe</option>
          <option value="variable" ${e.type === 'variable' ? 'selected' : ''}>Variable</option>
        </select>
      </td>
      <td data-label="Estimé"><input type="number" step="0.01" value="${e.estimated || ''}" onfocus="if(this.value==='0')this.value=''" onblur="if(this.value==='')this.value='0'" onchange="updateExpense(${e.id})" /></td>
      <td data-label="Réel"><input type="number" step="0.01" value="${e.actual || ''}" onfocus="if(this.value==='0')this.value=''" onblur="if(this.value==='')this.value='0'" onchange="updateExpense(${e.id})" /></td>
      <td data-label="Répartition">
        <div class="split-control">
          <select class="split-select" onchange="updateExpense(${e.id})">
            <option value="-1" ${!isCustom ? 'selected' : ''}>Prorata</option>
            <option value="50" ${isCustom && sp === 50 ? 'selected' : ''}>50/50</option>
            <option value="100" ${isCustom && sp === 100 ? 'selected' : ''}>100/0</option>
            <option value="0" ${isCustom && sp === 0 ? 'selected' : ''}>0/100</option>
            <option value="custom" ${isCustom && sp !== 50 && sp !== 100 && sp !== 0 ? 'selected' : ''}>Custom</option>
          </select>
          ${isCustom && sp !== 50 && sp !== 100 && sp !== 0 ? `<input type="number" class="split-custom" value="${sp}" min="0" max="100" step="1" onchange="updateExpense(${e.id})" />` : ''}
          <span class="split-label">${splitLabel}</span>
        </div>
      </td>
      <td data-label="Écart" class="${diffClass}" style="font-size:12px;white-space:nowrap">${diffText}</td>
      <td><button class="btn btn-danger btn-sm" onclick="deleteExpense(${e.id})">×</button></td>
    </tr>`;
}

async function updateSalary() {
  await fetch(`${API}/api/salary`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      month_id: currentMonth,
      salary: parseFloat($('#salaryP1').value) || 0,
      salary_p2: parseFloat($('#salaryP2').value) || 0,
      name_p1: $('#nameP1').value || 'Personne 1',
      name_p2: $('#nameP2').value || 'Personne 2'
    })
  });
  loadMonth();
}

async function updateExpense(id) {
  const row = document.querySelector(`tr[data-id="${id}"]`);
  const inputs = row.querySelectorAll('input:not(.split-custom)');
  const selects = row.querySelectorAll('select');
  const typeSelect = selects[0];
  const splitSelect = selects[1];
  const customInput = row.querySelector('.split-custom');

  let splitVal = parseFloat(splitSelect.value);
  if (splitSelect.value === 'custom') {
    splitVal = customInput ? parseFloat(customInput.value) : 50;
  }

  await fetch(`${API}/api/expense`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id,
      label: inputs[0].value,
      category: inputs[1].value,
      type: typeSelect.value,
      estimated: parseFloat(inputs[2].value) || 0,
      actual: parseFloat(inputs[3].value) || 0,
      split_p1: splitVal
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
      actual: 0,
      split_p1: -1
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
  const { month, expenses, prorata } = data;
  $('#summaryMonthLabel').textContent = monthLabel(currentMonth);

  const totalSalary = (month.salary || 0) + (month.salary_p2 || 0);

  const byCategory = {};
  expenses.forEach(e => {
    if (!byCategory[e.category]) byCategory[e.category] = { estimated: 0, actual: 0 };
    byCategory[e.category].estimated += e.estimated;
    byCategory[e.category].actual += e.actual;
  });

  const fixed = expenses.filter(e => e.type === 'fixed');
  const variable = expenses.filter(e => e.type === 'variable');
  const fixedTotal = fixed.reduce((s, e) => s + e.actual, 0);
  const variableTotal = variable.reduce((s, e) => s + e.actual, 0);

  let p1 = 0, p2 = 0;
  expenses.forEach(e => {
    const sp = effectiveSplit(e, prorata);
    p1 += e.actual * sp / 100;
    p2 += e.actual * (100 - sp) / 100;
  });

  drawDonut('chartDonut', byCategory);
  drawPersonSplit('chartPersonSplit', month, p1, p2);
  drawStackedBar('chartStacked', totalSalary, fixedTotal, variableTotal, month);
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

  ctx.fillStyle = '#e0e0e8';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(fmt(total), cx, cy + 6);

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

function drawPersonSplit(canvasId, month, p1, p2) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const w = rect.width, h = rect.height;
  ctx.clearRect(0, 0, w, h);

  const total = p1 + p2;
  if (total === 0) { ctx.fillStyle = '#6a6a80'; ctx.fillText('Aucune donnée', w/2-30, h/2); return; }

  const cx = w * 0.4, cy = h / 2, r = Math.min(cx, cy) - 20, inner = r * 0.55;
  const s1 = (p1 / total) * Math.PI * 2;

  // P1
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI/2, -Math.PI/2 + s1);
  ctx.arc(cx, cy, inner, -Math.PI/2 + s1, -Math.PI/2, true);
  ctx.closePath();
  ctx.fillStyle = '#7c5cfc';
  ctx.fill();

  // P2
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI/2 + s1, -Math.PI/2 + Math.PI * 2);
  ctx.arc(cx, cy, inner, -Math.PI/2 + Math.PI * 2, -Math.PI/2 + s1, true);
  ctx.closePath();
  ctx.fillStyle = '#22d3ee';
  ctx.fill();

  // Legend
  ctx.fillStyle = '#7c5cfc'; ctx.fillRect(w * 0.75, 20, 10, 10);
  ctx.fillStyle = '#e0e0e8'; ctx.font = '12px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(`${month.name_p1}: ${fmt(p1)}`, w * 0.75 + 16, 29);

  ctx.fillStyle = '#22d3ee'; ctx.fillRect(w * 0.75, 40, 10, 10);
  ctx.fillStyle = '#e0e0e8';
  ctx.fillText(`${month.name_p2}: ${fmt(p2)}`, w * 0.75 + 16, 49);

  ctx.fillStyle = '#e0e0e8';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${((p1/total)*100).toFixed(0)}/${((p2/total)*100).toFixed(0)}`, cx, cy + 5);
}

function drawStackedBar(canvasId, totalSalary, fixed, variable, month) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const w = rect.width, h = rect.height;
  ctx.clearRect(0, 0, w, h);

  if (totalSalary === 0) { ctx.fillStyle = '#6a6a80'; ctx.fillText('Renseignez les salaires', 20, h/2); return; }

  const remaining = Math.max(0, totalSalary - fixed - variable);
  const barH = 40;
  const y = h / 2 - barH / 2;
  const margin = 40;
  const barW = w - margin * 2;

  ctx.fillStyle = '#1e1e2e';
  ctx.beginPath(); ctx.roundRect(margin, y, barW, barH, 6); ctx.fill();

  const fixedW = (fixed / totalSalary) * barW;
  ctx.fillStyle = '#60a5fa';
  ctx.beginPath(); ctx.roundRect(margin, y, fixedW, barH, [6, 0, 0, 6]); ctx.fill();

  const varW = (variable / totalSalary) * barW;
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(margin + fixedW, y, varW, barH);

  if (remaining > 0) {
    const remW = (remaining / totalSalary) * barW;
    ctx.fillStyle = 'rgba(52, 211, 153, 0.3)';
    ctx.beginPath(); ctx.roundRect(margin + fixedW + varW, y, remW, barH, [0, 6, 6, 0]); ctx.fill();
  }

  ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
  [{ label: `Fixe: ${fmt(fixed)}`, color: '#60a5fa', x: w * 0.2 },
   { label: `Variable: ${fmt(variable)}`, color: '#fbbf24', x: w * 0.5 },
   { label: `Reste: ${fmt(remaining)}`, color: '#34d399', x: w * 0.8 }
  ].forEach(item => { ctx.fillStyle = item.color; ctx.fillText(item.label, item.x, y + barH + 24); });

  ctx.fillStyle = '#6a6a80'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(`${month.name_p1} (${fmt(month.salary)}) + ${month.name_p2} (${fmt(month.salary_p2)}) = ${fmt(totalSalary)}`, w / 2, y - 10);
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

  const labelW = 100, barMaxW = w - labelW - 80;
  cats.forEach(([name, val], i) => {
    const y = 10 + i * rowH;
    ctx.fillStyle = '#6a6a80'; ctx.font = '11px sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(name.slice(0, 12), labelW - 8, y + rowH * 0.65);
    const estW = (val.estimated / maxVal) * barMaxW;
    const actW = (val.actual / maxVal) * barMaxW;
    ctx.fillStyle = 'rgba(124, 92, 252, 0.2)';
    ctx.fillRect(labelW, y + 4, estW, rowH * 0.35);
    ctx.fillStyle = val.actual > val.estimated ? 'rgba(248,113,113,0.6)' : 'rgba(52,211,153,0.6)';
    ctx.fillRect(labelW, y + rowH * 0.45, actW, rowH * 0.35);
    ctx.fillStyle = '#6a6a80'; ctx.textAlign = 'left'; ctx.font = '10px sans-serif';
    ctx.fillText(fmt(val.actual), labelW + actW + 4, y + rowH * 0.75);
  });
}

// === HISTORY PAGE ===
async function loadHistory() {
  const res = await fetch(`${API}/api/history`);
  const data = await res.json();

  if (data.length > 0) {
    $('#histP1').textContent = data[0].name_p1 || 'P1';
    $('#histP2').textContent = data[0].name_p2 || 'P2';
  }

  const tbody = $('#historyBody');
  tbody.innerHTML = '';
  data.forEach(m => {
    const totalSalary = (m.salary || 0) + (m.salary_p2 || 0);
    const balClass = m.balance >= 0 ? 'diff-positive' : 'diff-negative';
    tbody.innerHTML += `
      <tr onclick="currentMonth='${m.id}';switchPage('budget')">
        <td style="font-weight:600">${monthLabel(m.id)}</td>
        <td>${fmt(totalSalary)}</td>
        <td>${fmt(m.totalActual)}</td>
        <td>${fmt(m.p1Total)}</td>
        <td>${fmt(m.p2Total)}</td>
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
  const maxVal = Math.max(...sorted.map(m => Math.max((m.salary || 0) + (m.salary_p2 || 0), m.totalActual)));
  if (maxVal === 0) return;
  const step = plotW / (sorted.length - 1 || 1);

  // Revenue line
  ctx.beginPath();
  sorted.forEach((m, i) => {
    const x = margin.left + i * step;
    const y = margin.top + plotH - (((m.salary||0) + (m.salary_p2||0)) / maxVal) * plotH;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#34d399'; ctx.lineWidth = 2; ctx.stroke();

  // Expense line
  ctx.beginPath();
  sorted.forEach((m, i) => {
    const x = margin.left + i * step;
    const y = margin.top + plotH - (m.totalActual / maxVal) * plotH;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#f87171'; ctx.lineWidth = 2; ctx.stroke();

  sorted.forEach((m, i) => {
    const x = margin.left + i * step;
    ctx.fillStyle = '#6a6a80'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(m.id.slice(5), x, h - 10);
  });

  ctx.fillStyle = '#34d399'; ctx.fillRect(w - 140, 8, 10, 10);
  ctx.fillStyle = '#e0e0e8'; ctx.font = '11px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('Revenus', w - 126, 17);
  ctx.fillStyle = '#f87171'; ctx.fillRect(w - 140, 24, 10, 10);
  ctx.fillStyle = '#e0e0e8'; ctx.fillText('Dépensé', w - 126, 33);
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  $$('.tab').forEach(t => t.addEventListener('click', () => switchPage(t.dataset.page)));
  switchPage('budget');
});
