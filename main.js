/* ============================================================
   EXPENSE CALCULATOR SUITE — main.js  v6
   ============================================================
   Changes from v5:
   - Qty×Price: per-row subtotal line below each row (Qty × Price = ₹Amount)
   - Qty×Price: single-row grand total now updates correctly (was showing 0)
   - PDF export for Qty: descriptive table with subtotals per row
   - Bug fix: grand total column shows correct value when only 1 row entered
   - Bug fix: Marathi digits correctly rendered in all export paths
   - Separate JS file (no inline script in HTML)
   ============================================================ */

// ── CONSTANTS ──
const APP_SIG = 'EXPCALC_V1';
const QTY_SIG = 'QTYCALC_V1';
const CAT_SIG = 'CATCALC_V1';
const LS_EXP  = 'exp_autosave';
const LS_QTY  = 'qty_autosave';
const LS_CAT  = 'cat_autosave';

// ── LANGUAGE / THEME STATE ──
let currentLang = 'en';

// ── MARATHI MAPS ──
const M2E = {'०':'0','१':'1','२':'2','३':'3','४':'4','५':'5','६':'6','७':'7','८':'8','९':'9'};
const E2M = {'0':'०','1':'१','2':'२','3':'३','4':'४','5':'५','6':'६','7':'७','8':'८','9':'९'};
const m2e = s => String(s).replace(/[०-९]/g, c => M2E[c] || c);
const e2m = s => String(s).replace(/[0-9]/g,  c => E2M[c] || c);
const fmtNum = (n, mr) => mr ? e2m(commaNum(String(n))) : commaNum(String(n));
const rawNum = s => parseFloat(m2e(String(s || ''))) || 0;

// ── HELPERS ──
function isNum(v) { return typeof v === 'number' && isFinite(v) && !isNaN(v); }
function rnd() { return Math.random().toString(36).substr(2, 6).toUpperCase(); }
function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function commaNum(amount) {
  let minus = false, frac = '';
  amount = String(amount);
  if (amount[0] === '-') { minus = true; amount = amount.slice(1); }
  const d = amount.indexOf('.');
  if (d !== -1) { frac = amount.slice(d); amount = amount.slice(0, d); }
  const ch = [...amount]; let cnt = 0;
  for (let i = ch.length - 1; i >= 0; i--) {
    cnt++;
    if (cnt === 3 && ch.length > 3)      ch.splice(i, 0, ',');
    else if (cnt === 5 && ch.length > 6) ch.splice(i, 0, ',');
    else if (cnt === 7 && ch.length > 9) ch.splice(i, 0, ',');
  }
  return (minus ? '-' : '') + ch.join('') + frac;
}

// ── CURRENT CALC PAGE ──
let currentCalc = 0;
let currentPdfFn = null, currentImgFn = null;

function switchCalc(i) {
  document.querySelectorAll('.calc-page').forEach((p, j) => p.classList.toggle('active', j === i));
  document.querySelectorAll('.calc-tab').forEach((t, j) => t.classList.toggle('active', j === i));
  currentCalc = i;
  closeMarathiKeypad();
}

// ── THEME ──
function toggleTheme() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark');
  document.getElementById('themeIcon').textContent = dark ? '🌙' : '☀️';
  expAutoSave(); qtyAutoSave(); catAutoSave();
}

// ── LANGUAGE ──
function toggleLanguage() {
  currentLang = currentLang === 'en' ? 'mr' : 'en';
  applyLanguage();
  updateInputModes();

  // Refresh expense calc
  expGetTotal();
  const ai = document.getElementById('expAmount'), ei = document.getElementById('expTotal');
  if (ai.value) { const v = m2e(ai.value); ai.value = currentLang === 'mr' ? e2m(v) : v; }
  if (ei.value) { const v = m2e(ei.value); ei.value = currentLang === 'mr' ? e2m(v) : v; }
  document.querySelectorAll('#expRows .amt-input').forEach(inp => {
    if (!inp.value) return;
    inp.value = currentLang === 'mr' ? e2m(m2e(inp.value)) : m2e(inp.value);
  });
  if (expCalcDone) {
    const remEl = document.getElementById('expRemain');
    const rs = commaNum(String(expRem));
    remEl.textContent = currentLang === 'mr' ? 'शिल्लक: ₹' + e2m(rs) : 'Remaining: ₹' + rs;
  }

  // Refresh qty calc
  qtyGetTotal();
  document.querySelectorAll('#qtyRows .amt-input, #qtyRows .qty-input').forEach(inp => {
    if (!inp.value) return;
    inp.value = currentLang === 'mr' ? e2m(m2e(inp.value)) : m2e(inp.value);
  });
  // re-render subtotal lines
  document.querySelectorAll('#qtyRows .qty-row-wrap').forEach(wrap => {
    const row = wrap.querySelector('.input-row');
    if (row) updateQtySubtotalLine(wrap);
  });
  const qb = document.getElementById('qtyBudget');
  if (qb.value) { const v = m2e(qb.value); qb.value = currentLang === 'mr' ? e2m(v) : v; }
  if (qtyCalcDone) {
    const remEl = document.getElementById('qtyRemain');
    const rs = commaNum(String(qtyRem));
    remEl.textContent = currentLang === 'mr' ? 'शिल्लक: ₹' + e2m(rs) : 'Remaining: ₹' + rs;
  }

  // Refresh cat calc
  catRefreshAll();
  const cb = document.getElementById('catBudget');
  if (cb.value) { const v = m2e(cb.value); cb.value = currentLang === 'mr' ? e2m(v) : v; }
  expAutoSave(); qtyAutoSave(); catAutoSave();
}

function applyLanguage() {
  const mr = currentLang === 'mr';
  document.getElementById('langLabel').textContent = mr ? 'English' : 'मराठी';
  document.querySelectorAll('[data-en]').forEach(el => {
    if (el.tagName === 'INPUT') return;
    el.textContent = mr ? (el.dataset.mr || el.dataset.en) : el.dataset.en;
  });
  document.querySelectorAll('[data-ph-en]').forEach(el => {
    el.placeholder = mr ? el.dataset.phMr : el.dataset.phEn;
  });
  // dynamic row placeholders
  document.querySelectorAll('#expRows .title-input').forEach(el => el.placeholder = mr ? 'शीर्षक' : 'Title');
  document.querySelectorAll('#expRows .amt-input').forEach(el => el.placeholder = mr ? '०' : '0');
  document.querySelectorAll('#qtyRows .title-input').forEach(el => el.placeholder = mr ? 'वस्तूचे नाव' : 'Item Name');
  document.querySelectorAll('#qtyRows .qty-input').forEach(el => el.placeholder = mr ? '०' : '0');
  document.querySelectorAll('#qtyRows .amt-input').forEach(el => el.placeholder = mr ? '०' : '0');
  document.querySelectorAll('.cat-name-input').forEach(el => el.placeholder = mr ? 'श्रेणीचे नाव' : 'Category Name');
  document.querySelectorAll('.cat-item-title').forEach(el => el.placeholder = mr ? 'वस्तू' : 'Item');
  document.querySelectorAll('.cat-item-amt').forEach(el => el.placeholder = mr ? '०' : '0');
  const kdb = document.querySelector('.keypad-done-btn');
  if (kdb) kdb.textContent = mr ? 'झाले ✓' : 'Done ✓';
}

function updateInputModes() {
  const mr = currentLang === 'mr';
  // Include cat-item-amt so category amount fields also get the Marathi keypad
  document.querySelectorAll('.amt-input,.qty-input,.cat-item-amt,#expAmount,#expTotal,#qtyBudget,#qtyTotalDisp,#catBudget,#catTotalDisp').forEach(inp => {
    if (mr) {
      inp.setAttribute('readonly', '');
      inp.setAttribute('inputmode', 'none'); // Disable native keyboard, use custom Marathi keypad
    } else {
      if (!['expTotal','qtyTotalDisp','catTotalDisp'].includes(inp.id)) {
        inp.removeAttribute('readonly');
      }
      inp.setAttribute('inputmode', 'tel'); // numeric-only native keypad for English
    }
  });
  if (!mr) closeMarathiKeypad();
}

// ── MARATHI KEYPAD ──
let keypadOpen = false, activeInput = null;

function openMarathiKeypad(el) {
  if (currentLang !== 'mr') return;
  activeInput = el;
  const label = el.dataset.label || el.placeholder || '—';
  document.getElementById('keypadActiveLabel').textContent = label + ': ';
  const kp = document.getElementById('marathiKeypad');

  // Remove hidden so it enters the layout flow (but still translateY(100%) off-screen)
  kp.classList.remove('hidden');
  kp.classList.remove('keypad-visible');

  // Highlight active input immediately
  document.querySelectorAll('.form-input,.amt-input,.qty-input,.cat-item-amt').forEach(i => i.classList.remove('active-input'));
  el.classList.add('active-input');

  // Double rAF: first frame triggers display, second frame has real offsetHeight
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const h = kp.offsetHeight || 280;
      document.documentElement.style.setProperty('--keypad-h', h + 'px');
      kp.classList.add('keypad-visible');
      document.body.classList.add('keypad-open');
      keypadOpen = true;
      // Scroll after transition finishes (220ms) so element isn't still behind keypad
      setTimeout(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 260);
    });
  });
}

function closeMarathiKeypad() {
  const kp = document.getElementById('marathiKeypad');
  kp.classList.remove('keypad-visible');
  document.body.classList.remove('keypad-open');
  keypadOpen = false;
  activeInput = null;
  document.querySelectorAll('.form-input,.amt-input,.qty-input,.cat-item-amt').forEach(i => i.classList.remove('active-input'));
  setTimeout(() => { if (!keypadOpen) kp.classList.add('hidden'); }, 260);
}

function kp(char) {
  if (!activeInput) return;
  const pos = activeInput.selectionStart || activeInput.value.length;
  const end = activeInput.selectionEnd || pos;
  const val = activeInput.value;
  if (char === '.' && val.includes('.')) return;
  activeInput.value = val.slice(0, pos) + char + val.slice(end);
  const np = pos + 1;
  try { activeInput.setSelectionRange(np, np); } catch (e) {}
  activeInput.dispatchEvent(new Event('input', { bubbles: true }));
}

function kpDel() {
  if (!activeInput) return;
  const val = activeInput.value;
  const pos = activeInput.selectionStart || val.length;
  const end = activeInput.selectionEnd || pos;
  if (pos === 0 && end === 0) return;
  if (pos !== end) {
    activeInput.value = val.slice(0, pos) + val.slice(end);
    try { activeInput.setSelectionRange(pos, pos); } catch (e) {}
  } else {
    activeInput.value = val.slice(0, pos - 1) + val.slice(pos);
    try { activeInput.setSelectionRange(pos - 1, pos - 1); } catch (e) {}
  }
  activeInput.dispatchEvent(new Event('input', { bubbles: true }));
}

// Helper: all numeric inputs that use the Marathi keypad
function isNumericInput(el) {
  return el.classList.contains('amt-input') ||
         el.classList.contains('qty-input') ||
         el.classList.contains('cat-item-amt') ||
         ['expAmount','qtyBudget','catBudget'].includes(el.id);
}
const READONLY_IDS = ['expTotal','qtyTotalDisp','catTotalDisp'];

// Open keypad on click (Marathi mode)
document.addEventListener('click', e => {
  if (currentLang !== 'mr') return;
  const inp = e.target;
  if (isNumericInput(inp)) {
    e.preventDefault();
    openMarathiKeypad(inp);
  } else if (READONLY_IDS.includes(inp.id)) {
    e.preventDefault(); // block native keyboard on read-only display fields
  }
});

document.addEventListener('input', e => {
  if (e.target.classList.contains('cat-item-amt')) {
    catRefreshAll();
  }
});

// Blur native keyboard on touch (Marathi mode) to prevent it appearing
document.addEventListener('touchstart', e => {
  if (currentLang !== 'mr') return;
  const inp = e.target;
  if (isNumericInput(inp)) { inp.blur(); }
}, { passive: true });

// Close keypad when tapping outside any numeric input or keypad itself
document.addEventListener('click', e => {
  if (!keypadOpen) return;
  const kpEl = document.getElementById('marathiKeypad');
  if (!isNumericInput(e.target) && !READONLY_IDS.includes(e.target.id) && !kpEl.contains(e.target)) {
    closeMarathiKeypad();
  }
});

document.addEventListener('input', e => {
  const t = e.target;
  if ((t.classList.contains('amt-input') || t.classList.contains('qty-input') ||
      ['expAmount','qtyBudget','catBudget'].includes(t.id)) && currentLang === 'en') {
    let v = t.value.replace(/[^0-9.]/g, '');
    const p = v.split('.');
    if (p.length > 2) v = p[0] + '.' + p.slice(1).join('');
    if (t.value !== v) t.value = v;
  }
});

// ── TITLE PROMPT ──
function askTitle(def) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'title-overlay';
    const mr = currentLang === 'mr';
    overlay.innerHTML = `<div class="title-box">
      <p>${mr ? 'सारांशाचे शीर्षक द्या:' : 'Enter summary title:'}</p>
      <input type="text" id="_titleInp" placeholder="${def}" autocomplete="off">
      <div class="title-box-btns">
        <button class="btn btn-secondary" id="_skipBtn">${mr ? 'वगळा' : 'Skip'}</button>
        <button class="btn btn-primary" id="_okBtn">${mr ? 'ठीक आहे' : 'OK'}</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    const inp = overlay.querySelector('#_titleInp');
    setTimeout(() => inp.focus(), 60);
    const done = () => {
      const v = inp.value.trim() || def;
      document.body.removeChild(overlay);
      resolve(v);
    };
    overlay.querySelector('#_skipBtn').onclick = () => { document.body.removeChild(overlay); resolve(def); };
    overlay.querySelector('#_okBtn').onclick = done;
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') done(); });
  });
}

// ── MODAL ──
function closeModal() { document.getElementById('resultModal').classList.add('hidden'); }
function handleModalClick(e) { if (e.target.id === 'resultModal') closeModal(); }

let currentSaveAsNewFn = null;  // Store the save as new function

function openModal(title, headHtml, rows, footHtml, summaryHtml, pdfFn, imgFn, saveAsNewFn = null) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalDate').textContent = new Date().toLocaleDateString();
  document.getElementById('modalTableHead').innerHTML = headHtml;
  const tb = document.querySelector('#myTable tbody');
  tb.innerHTML = '';
  rows.forEach(r => { const tr = document.createElement('tr'); tr.innerHTML = r; tb.appendChild(tr); });
  document.getElementById('modalTableFoot').innerHTML = footHtml;
  document.getElementById('modalSummary').innerHTML = summaryHtml;
  currentPdfFn = pdfFn; 
  currentImgFn = imgFn;
  currentSaveAsNewFn = saveAsNewFn;
  
  // Show/hide Save as New button based on whether function is provided
//  const saveBtn = document.getElementById('modalSaveNewBtn');
  // if (saveAsNewFn) {
  //   saveBtn.style.display = 'inline-flex';
  // } else {
  //   saveBtn.style.display = 'none';
  // }
  
  document.getElementById('resultModal').classList.remove('hidden');
}

// ────────────────────────────────────────────
// ── CALCULATOR 1 — EXPENSE ──
// ────────────────────────────────────────────
let expCalcDone = false, expAm = 0, expEx = 0, expRem = 0;
let expImportedId = null, expImportedType = null;

function expMakeRow(title = '', amount = '') {
  const div = document.createElement('div');
  div.className = 'input-row input-row-2';
  const mr = currentLang === 'mr';
  const amAttr = mr ? 'readonly' : '';
  const imAttr = mr ? 'none' : 'decimal';
  const displayAmt = amount ? (mr ? e2m(String(amount)) : String(amount)) : '';
  div.innerHTML = `
    <input type="text" class="form-input title-input" placeholder="${mr ? 'शीर्षक' : 'Title'}" value="${esc(title)}">
    <div class="amount-wrap">
      <input type="text" class="form-input amt-input" placeholder="${mr ? '०' : '0'}"
        inputmode="${imAttr}" ${amAttr} value="${esc(displayAmt)}">
      <span class="currency-badge">₹</span>
    </div>`;
  return div;
}

function expAddRow() { document.getElementById('expRows').appendChild(expMakeRow()); expGetTotal(); }

function expRemoveRow() {
  const c = document.getElementById('expRows');
  if (c.children.length > 1) c.removeChild(c.lastElementChild);
  expGetTotal();
}

function expReset() {
  const c = document.getElementById('expRows');
  c.innerHTML = '';
  c.appendChild(expMakeRow());
  document.getElementById('expAmount').value = '';
  document.getElementById('expTotal').value = '';
  document.getElementById('expShow').textContent = '—';
  document.getElementById('expShow').dataset.rawValue = '';
  document.getElementById('expRemain').classList.add('hidden');
  document.getElementById('expSaveBar').classList.add('hidden');
  expCalcDone = false; expAm = expEx = expRem = 0;
  expImportedId = expImportedType = null;
  closeMarathiKeypad(); expGetTotal(); expAutoSave();
  showToast(currentLang === 'mr' ? 'रीसेट झाले!' : 'Reset!');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('expRows').addEventListener('input', e => {
    if (e.target.tagName === 'INPUT') {
      expCalcDone = false;
      document.getElementById('expRemain').classList.add('hidden');
      expGetTotal(); expAutoSave();
    }
  });
  document.getElementById('expAmount').addEventListener('input', () => {
    expCalcDone = false;
    document.getElementById('expRemain').classList.add('hidden');
    expAutoSave();
  });
});

function expGetTotal() {
  let add = 0;
  document.querySelectorAll('#expRows .amt-input').forEach(ip => {
    const v = parseFloat(m2e(ip.value));
    if (isNum(v)) add += v;
  });
  const es = document.getElementById('expShow');
  const ei = document.getElementById('expTotal');
  if (add > 0) {
    es.dataset.rawValue = add;
    es.textContent = '+ ₹' + fmtNum(add, currentLang === 'mr');
    ei.value = currentLang === 'mr' ? e2m(String(add)) : String(add);
  } else {
    es.dataset.rawValue = '';
    es.textContent = '—';
    ei.value = '';
  }
}

function saveAsNewPDF() {
  if (currentSaveAsNewFn) {
    currentSaveAsNewFn();
  }
}

function expCalculate() {
  const am = rawNum(document.getElementById('expAmount').value);
  const ex = rawNum(document.getElementById('expTotal').value);
  if (am <= 0) { showToast(currentLang === 'mr' ? 'रक्कम टाका' : 'Enter your amount', 'error'); return; }
  if (ex <= 0) { showToast(currentLang === 'mr' ? 'खर्च टाका' : 'Enter expenses', 'error'); return; }
  expAm = am; expEx = ex; expRem = am - ex; expCalcDone = true;
  const remEl = document.getElementById('expRemain');
  remEl.classList.remove('hidden');
  const rs = commaNum(String(expRem));
  remEl.textContent = currentLang === 'mr' ? 'शिल्लक: ₹' + e2m(rs) : 'Remaining: ₹' + rs;
  remEl.style.cssText = expRem < 0
    ? 'background:var(--danger-bg);color:var(--danger);border:1.5px solid var(--danger);margin-top:12px;padding:11px 15px;border-radius:var(--r-sm);font-size:.95rem;font-weight:700;text-align:center'
    : 'background:var(--success-bg);color:var(--success);border:1.5px solid var(--success);margin-top:12px;padding:11px 15px;border-radius:var(--r-sm);font-size:.95rem;font-weight:700;text-align:center';
  expShowModal(); expAutoSave();
}

function expShowModal() {
  const arr = expAllRows();
  const mr = currentLang === 'mr';
  const am = rawNum(document.getElementById('expAmount').value);
  const ex = rawNum(document.getElementById('expTotal').value);
  const rem = expCalcDone ? expRem : (am - ex);
  const fmt = v => '₹' + fmtNum(v, mr);
  const headHtml = `<th>#</th><th>${mr ? 'शीर्षक' : 'Title'}</th><th>${mr ? 'रक्कम' : 'Amount'}</th>`;
  const rows = arr.filter(r => r.title || r.amount).map((r, i) =>
    `<td>${i + 1}</td><td>${esc(r.title || '—')}</td><td>₹${mr ? e2m(commaNum(r.amount)) : commaNum(r.amount)}</td>`);
  const footHtml = `<td colspan="2">${mr ? 'एकूण खर्च' : 'Total Expense'}</td><td>₹${fmtNum(ex, mr)}</td>`;
  const summaryHtml = `
    <div class="summary-row sr-amount"><span>${mr ? 'रक्कम' : 'Amount'}</span><strong>${fmt(am)}</strong></div>
    <div class="summary-row sr-expense"><span>${mr ? 'एकूण खर्च' : 'Total Expense'}</span><strong>${fmt(ex)}</strong></div>
    ${expCalcDone ? `<div class="summary-row sr-remain"><span>${mr ? 'शिल्लक रक्कम' : 'Remaining Money'}</span><strong>${fmt(rem)}</strong></div>` : ''}`;
  openModal(mr ? 'खर्चाचा सारांश' : 'Expense Summary', headHtml, rows, footHtml, summaryHtml, expExportPDF, expExportImage, expSaveAsNewPDF);
}

function expSaveAsNewPDF() {
  const mr = currentLang === 'mr';
  const dateStr = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
  const def = mr ? `खर्च सारांश - ${dateStr}` : `Expense Summary - ${dateStr}`;
  askTitle(def).then(title => _expDoPDF(title));
}

function expAllRows() {
  const rows = [];
  document.querySelectorAll('#expRows .input-row').forEach(row => {
    const t = row.querySelector('.title-input')?.value || '';
    const a = m2e(row.querySelector('.amt-input')?.value || '');
    rows.push({ title: t, amount: a });
  });
  return rows;
}

// EXP AUTO SAVE
function expAutoSave() {
  try {
    localStorage.setItem(LS_EXP, JSON.stringify({
      sig: APP_SIG, lang: currentLang,
      theme: document.documentElement.getAttribute('data-theme'),
      amount: m2e(document.getElementById('expAmount').value || ''),
      expense: m2e(document.getElementById('expTotal').value || ''),
      rows: expAllRows().map(r => ({ Title: r.title, Amount: r.amount })),
      savedAt: new Date().toISOString()
    }));
  } catch (e) {}
}

function expLoadSave() {
  try {
    const raw = localStorage.getItem(LS_EXP);
    if (raw) { const d = JSON.parse(raw); if (d.sig === APP_SIG) expFillData(d); }
  } catch (e) {}
}

function expFillData(data) {
  if (!data) return;
  if (data.theme) {
    document.documentElement.setAttribute('data-theme', data.theme);
    document.getElementById('themeIcon').textContent = data.theme === 'dark' ? '☀️' : '🌙';
  }
  if (data.lang) { currentLang = data.lang; applyLanguage(); }
  const mr = currentLang === 'mr';
  if (data.amount) { document.getElementById('expAmount').value = mr ? e2m(data.amount) : data.amount; }
  const c = document.getElementById('expRows'); c.innerHTML = '';
  (data.rows || []).forEach(r => {
    const eng = m2e(String(r.Amount || ''));
    c.appendChild(expMakeRow(r.Title || '', eng));
  });
  expGetTotal();
  expAm = parseFloat(data.amount) || 0;
  expEx = parseFloat(data.expense) || 0;
  expRem = data.remaining !== undefined ? parseFloat(data.remaining) : (expAm - expEx);
  if (!isNaN(expRem) && expAm > 0) {
    expCalcDone = true;
    const remEl = document.getElementById('expRemain');
    remEl.classList.remove('hidden');
    const rs = commaNum(String(expRem));
    remEl.textContent = mr ? 'शिल्लक: ₹' + e2m(rs) : 'Remaining: ₹' + rs;
    remEl.style.cssText = expRem < 0
      ? 'background:var(--danger-bg);color:var(--danger);border:1.5px solid var(--danger);margin-top:12px;padding:11px 15px;border-radius:var(--r-sm);font-size:.95rem;font-weight:700;text-align:center'
      : 'background:var(--success-bg);color:var(--success);border:1.5px solid var(--success);margin-top:12px;padding:11px 15px;border-radius:var(--r-sm);font-size:.95rem;font-weight:700;text-align:center';
  }
  updateInputModes();
}

// ── IMPORT/EXPORT CHOICE MODAL ──
function closeImportExportModal() {
  document.getElementById('importExportModal').classList.add('hidden');
}

function showImportChoice(module) {
  const mr = currentLang === 'mr';
  document.getElementById('importExportModalTitle').textContent = mr ? 'आयात स्वरूप निवडा' : 'Choose Import Format';
  const btns = document.getElementById('importExportBtns');
  btns.innerHTML = `
    <button class="btn btn-primary" onclick="closeImportExportModal();_doImport('${module}','json')" style="justify-content:center;padding:13px">
      📋 JSON ${mr ? 'आयात' : 'Import'}
      <span style="display:block;font-size:.73rem;font-weight:400;opacity:.85;margin-top:2px">${mr ? 'जलद, पूर्ण डेटा' : 'Fast, full data restore'}</span>
    </button>
    <button class="btn btn-info" onclick="closeImportExportModal();_doImport('${module}','pdf')" style="justify-content:center;padding:13px">
      📄 PDF ${mr ? 'आयात' : 'Import'}
      <span style="display:block;font-size:.73rem;font-weight:400;opacity:.85;margin-top:2px">${mr ? 'आधी निर्यात केलेला PDF' : 'Re-import exported PDF'}</span>
    </button>`;
  document.getElementById('importExportModal').classList.remove('hidden');
}

function showExportChoice(module) {
  const mr = currentLang === 'mr';
  document.getElementById('importExportModalTitle').textContent = mr ? 'निर्यात स्वरूप निवडा' : 'Choose Export Format';
  const btns = document.getElementById('importExportBtns');
  btns.innerHTML = `
    <button class="btn btn-success" onclick="closeImportExportModal();_doExport('${module}','json')" style="justify-content:center;padding:13px">
      📋 JSON ${mr ? 'जतन' : 'Save'}
      <span style="display:block;font-size:.73rem;font-weight:400;opacity:.85;margin-top:2px">${mr ? 'पुन्हा आयात करता येते' : 'Can re-import later'}</span>
    </button>
    <button class="btn btn-danger" onclick="closeImportExportModal();_doExport('${module}','pdf')" style="justify-content:center;padding:13px">
      📄 PDF ${mr ? 'निर्यात' : 'Export'}
      <span style="display:block;font-size:.73rem;font-weight:400;opacity:.85;margin-top:2px">${mr ? 'छपाईसाठी, पुन्हा आयात होते' : 'Printable, re-importable'}</span>
    </button>
    <button class="btn btn-secondary" onclick="closeImportExportModal();_doExport('${module}','image')" style="justify-content:center;padding:13px">
      🖼️ ${mr ? 'प्रतिमा निर्यात' : 'Image Export'}
      <span style="display:block;font-size:.73rem;font-weight:400;opacity:.85;margin-top:2px">${mr ? 'शेअर करण्यासाठी PNG' : 'PNG for sharing'}</span>
    </button>`;
  document.getElementById('importExportModal').classList.remove('hidden');
}

function _doImport(module, format) {
  const inputId = module === 'exp' ? 'expImportInput' : module === 'qty' ? 'qtyImportInput' : 'catImportInput';
  const el = document.getElementById(inputId);
  el.value = '';
  el.accept = format === 'json' ? '.json' : '.pdf';
  el.click();
}

function _doExport(module, format) {
  if (module === 'exp') {
    if (format === 'json') expExportJSON();
    else if (format === 'pdf') expExportPDF();
    else expExportImage();
  } else if (module === 'qty') {
    if (format === 'json') qtyExportJSON();
    else if (format === 'pdf') qtyExportPDF();
    else qtyExportImage();
  } else {
    if (format === 'json') catExportJSON();
    else if (format === 'pdf') catExportPDF();
    else catExportImage();
  }
}

// EXP IMPORT/EXPORT
function triggerImport(type) {
  showImportChoice(type);
}

// function handleExpImport(e) {
//   const file = e.target.files[0]; if (!file) return;
//   if (file.name.endsWith('.json')) {
//     const reader = new FileReader();
//     reader.onload = ev => {
//       try {
//         const data = JSON.parse(ev.target.result);
//         if (data.sig !== APP_SIG) { showToast(currentLang === 'mr' ? 'आमचे JSON नाही!' : 'Not our JSON!', 'error'); return; }
//         expImportedId = data.fileId || null; expImportedType = 'json';
//         expFillData(data);
//         document.getElementById('expSaveBar').classList.remove('hidden');
//         showToast(currentLang === 'mr' ? 'डेटा लोड झाला!' : 'Data imported!', 'success');
//       } catch { showToast('Invalid file!', 'error'); }
//     };
//     reader.readAsText(file);
//   } else if (file.name.endsWith('.pdf')) {
//     expImportFromPDF(file);
//   } else {
//     showToast(currentLang === 'mr' ? 'फक्त PDF किंवा JSON' : 'Only PDF or JSON', 'error');
//   }
// }
function handleExpImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  const mr = currentLang === 'mr';

  if (file.name.endsWith('.json')) {
    const reader = new FileReader();
    reader.onload = function (ev) {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.sig === APP_SIG) {
          expImportedId = data.fileId || null; expImportedType = 'json';
          expFillData(data);
          document.getElementById('expSaveBar').classList.remove('hidden');
          showToast(mr ? 'खर्च आयात झाला!' : 'Expense imported!', 'success');
        } else if (data.sig === QTY_SIG) {
          switchCalc(1);
          qtyFillData(data);
          showToast(mr ? 'Qty आयात झाला!' : 'Qty imported!', 'success');
        } else if (data.sig === CAT_SIG) {
          switchCalc(2);
          catFillData(data);
          showToast(mr ? 'श्रेणी आयात झाली!' : 'Category imported!', 'success');
        } else {
          showToast(mr ? 'अवैध फाइल!' : 'Invalid file!', 'error');
        }
      } catch (err) {
        showToast(mr ? 'अवैध JSON!' : 'Invalid JSON!', 'error');
      }
    };
    reader.readAsText(file);
  } else if (file.name.endsWith('.pdf')) {
    expImportFromPDF(file);
  } else {
    showToast(mr ? 'फक्त PDF किंवा JSON' : 'Only PDF or JSON', 'error');
  }
}

async function expImportFromPDF(file) {
  showToast(currentLang === 'mr' ? 'PDF वाचत आहे...' : 'Reading PDF...', 'default');
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const SM = `<<${APP_SIG}>>`, EM = `<<END>>`;
    let json = null;
    try {
      const meta = await pdf.getMetadata();
      const sub = meta?.info?.Subject || '';
      const si = sub.indexOf(SM), ei = sub.indexOf(EM);
      if (si !== -1 && ei !== -1) json = sub.substring(si + SM.length, ei).trim();
    } catch (e) {}
    if (!json) {
      let txt = '';
      for (let p = 1; p <= pdf.numPages; p++) {
        const pg = await pdf.getPage(p);
        const tc = await pg.getTextContent();
        txt += tc.items.map(i => i.str).join('') + ' ';
      }
      const si = txt.indexOf(SM), ei = txt.indexOf(EM);
      if (si !== -1 && ei !== -1) json = txt.substring(si + SM.length, ei).trim();
    }
    if (!json) { showToast(currentLang === 'mr' ? 'आमच्या अ‍ॅपचे PDF नाही!' : 'Not our app PDF!', 'error'); return; }
    const data = JSON.parse(json);
    if (data.sig !== APP_SIG) { showToast('Invalid PDF!', 'error'); return; }
    expImportedId = data.fileId || null; expImportedType = 'pdf';
    expFillData(data);
    document.getElementById('expSaveBar').classList.remove('hidden');
    showToast(currentLang === 'mr' ? 'PDF आयात झाला!' : 'PDF imported!', 'success');
  } catch (err) { showToast('PDF read error!', 'error'); }
}

function expSaveAsNew() {
  expImportedId = null; expImportedType = null;
  expExportPDF();
  document.getElementById('expSaveBar').classList.add('hidden');
}

function expExportJSON() {
  const data = {
    sig: APP_SIG, lang: currentLang,
    theme: document.documentElement.getAttribute('data-theme'),
    amount: m2e(document.getElementById('expAmount').value || ''),
    expense: m2e(document.getElementById('expTotal').value || ''),
    rows: expAllRows().map(r => ({ Title: r.title, Amount: r.amount })),
    fileId: rnd(), exportedAt: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  a.download = `Expense_${new Date().toLocaleDateString('en-GB').replace(/\//g, '-')}_${data.fileId}.json`;
  a.click(); URL.revokeObjectURL(url);
  showToast(currentLang === 'mr' ? 'JSON जतन झाले!' : 'JSON saved!', 'success');
}

function expExportPDF() {
  const def = currentLang === 'mr' ? 'खर्चाचा सारांश' : 'Expense Summary';
  askTitle(def).then(title => _expDoPDF(title));
}

function expExportImage() {
  const def = currentLang === 'mr' ? 'खर्चाचा सारांश' : 'Expense Summary';
  askTitle(def).then(title => _expDoImage(title));
}

function _expDoPDF(chosenTitle) {
  closeModal();
  const arr = expAllRows().filter(r => r.title || r.amount);
  const mr = currentLang === 'mr';
  const amVal = rawNum(document.getElementById('expAmount').value);
  const exVal = rawNum(document.getElementById('expTotal').value);
  const remVal = expCalcDone ? (amVal - exVal) : null;
  if (!arr.length && amVal === 0 && exVal === 0) { showToast(currentLang === 'mr' ? 'डेटा टाका' : 'Enter data first', 'error'); return; }

  const payload = JSON.stringify({
    sig: APP_SIG, lang: mr ? 'mr' : 'en',
    theme: document.documentElement.getAttribute('data-theme'),
    amount: String(amVal), expense: String(exVal),
    remaining: remVal !== null ? String(remVal) : undefined,
    rows: arr.map(r => ({ Title: r.title, Amount: m2e(r.amount) })),
    fileId: expImportedId || rnd(), exportedAt: new Date().toISOString()
  });
  const embed = `<<${APP_SIG}>>${payload}<<END>>`;

  _setupPdfFonts();
  const tableBody = [[
    { text: '#', fillColor: '#2563eb', color: '#fff', bold: true, alignment: 'center' },
    { text: mr ? 'शीर्षक' : 'Title', fillColor: '#2563eb', color: '#fff', bold: true },
    { text: mr ? 'रक्कम (₹)' : 'Amount (₹)', fillColor: '#2563eb', color: '#fff', bold: true, alignment: 'right' }
  ]];
  arr.forEach((r, i) => {
    const dispAmt = mr ? e2m(commaNum(r.amount)) : commaNum(r.amount);
    tableBody.push([
      { text: String(i + 1), alignment: 'center' },
      { text: r.title || '—' },
      { text: '₹ ' + dispAmt, alignment: 'right' }
    ]);
  });
  const dispEx = mr ? e2m(commaNum(String(exVal))) : commaNum(String(exVal));
  tableBody.push([
    { text: mr ? 'एकूण खर्च' : 'Total Expense', colSpan: 2, bold: true, alignment: 'center', fillColor: '#1e293b', color: '#fff' },
    {},
    { text: '₹ ' + dispEx, bold: true, alignment: 'right', fillColor: '#1e293b', color: '#fff' }
  ]);

  const summaryBody = [
    [{ text: mr ? 'रक्कम' : 'Amount', bold: true }, { text: '₹ ' + (mr ? e2m(commaNum(String(amVal))) : commaNum(String(amVal))), color: '#16a34a', bold: true, alignment: 'right' }],
    [{ text: mr ? 'एकूण खर्च' : 'Total Expense', bold: true }, { text: '₹ ' + dispEx, color: '#dc2626', bold: true, alignment: 'right' }]
  ];
  if (remVal !== null) {
    const dispRem = mr ? e2m(commaNum(String(remVal))) : commaNum(String(remVal));
    summaryBody.push([
      { text: mr ? 'शिल्लक रक्कम' : 'Remaining Money', bold: true, fillColor: '#1e293b', color: '#fff' },
      { text: '₹ ' + dispRem, bold: true, alignment: 'right', fillColor: '#1e293b', color: '#fff' }
    ]);
  }
  _buildAndDownloadPDF(chosenTitle, embed, tableBody, summaryBody, [30, '*', 100],
    mr ? 'खर्च कॅल्क्युलेटर द्वारे तयार केले' : 'Generated by Expense Calculator');
}

async function _expDoImage(chosenTitle) {
  closeModal();
  const arr = expAllRows().filter(r => r.title || r.amount);
  const mr = currentLang === 'mr';
  const amVal = rawNum(document.getElementById('expAmount').value);
  const exVal = rawNum(document.getElementById('expTotal').value);
  const remVal = expCalcDone ? (amVal - exVal) : null;
  if (!arr.length && amVal === 0 && exVal === 0) { showToast(currentLang === 'mr' ? 'डेटा टाका' : 'Enter data first', 'error'); return; }
  const C = getImgColors();
  const rowsHtml = arr.map((r, i) => {
    const bg = i % 2 === 0 ? C.alt : C.bg;
    const da = mr ? e2m(commaNum(r.amount)) : commaNum(r.amount);
    return `<tr style="background:${bg}"><td style="${tdSt(C)};text-align:center;color:${C.muted}">${i + 1}</td><td style="${tdSt(C)}">${esc(r.title || '—')}</td><td style="${tdSt(C)};text-align:right">₹ ${da}</td></tr>`;
  }).join('');
  const dispEx = mr ? e2m(commaNum(String(exVal))) : commaNum(String(exVal));
  const dispAm = mr ? e2m(commaNum(String(amVal))) : commaNum(String(amVal));
  const remainHtml = remVal !== null
    ? `<div style="display:flex;justify-content:space-between;align-items:center;padding:11px 16px;background:#1e293b;border-top:1px solid ${C.bdr}"><span style="font-size:13px;color:#94a3b8">${mr ? 'शिल्लक रक्कम' : 'Remaining Money'}</span><strong style="font-size:14px;color:#fff">₹ ${mr ? e2m(commaNum(String(remVal))) : commaNum(String(remVal))}</strong></div>` : '';
  const html = _imgWrap(C, chosenTitle,
    `<table style="width:100%;border-collapse:collapse;margin-bottom:16px">
      <thead><tr style="background:#2563eb"><th style="padding:9px;color:#fff;font-size:12px;width:36px">#</th><th style="padding:9px;text-align:left;color:#fff;font-size:12px">${mr ? 'शीर्षक' : 'Title'}</th><th style="padding:9px;text-align:right;color:#fff;font-size:12px">${mr ? 'रक्कम (₹)' : 'Amount (₹)'}</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
      <tfoot><tr style="background:#1e293b"><td colspan="2" style="padding:9px;color:#fff;font-weight:700;font-size:13px;text-align:center">${mr ? 'एकूण खर्च' : 'Total Expense'}</td><td style="padding:9px;color:#fff;font-weight:700;font-size:13px;text-align:right">₹ ${dispEx}</td></tr></tfoot>
    </table>
    <div style="border:1px solid ${C.bdr};border-radius:10px;overflow:hidden">
      <div style="display:flex;justify-content:space-between;padding:10px 15px;background:${C.suBg}"><span style="font-size:13px;color:${C.muted}">${mr ? 'रक्कम' : 'Amount'}</span><strong style="color:${C.suTxt}">₹ ${dispAm}</strong></div>
      <div style="display:flex;justify-content:space-between;padding:10px 15px;background:${C.exBg};border-top:1px solid ${C.bdr}"><span style="font-size:13px;color:${C.muted}">${mr ? 'एकूण खर्च' : 'Total Expense'}</span><strong style="color:${C.exTxt}">₹ ${dispEx}</strong></div>
      ${remainHtml}
    </div>`,
    mr ? 'खर्च कॅल्क्युलेटर द्वारे तयार केले' : 'Generated by Expense Calculator');
  await _downloadImage(html, C.bg);
}

// ────────────────────────────────────────────
// ── CALCULATOR 2 — QTY × PRICE ──
// ────────────────────────────────────────────
let qtyCalcDone = false, qtyTotal = 0, qtyRem = 0;

/**
 * Helper: update the subtotal line under one qty-row-wrap
 */
// function updateQtySubtotalLine(wrap) {
//   const qInp = wrap.querySelector('.qty-input');
//   const pInp = wrap.querySelector('.amt-input');
//   const lineEl = wrap.querySelector('.qty-subtotal-line');
//   if (!qInp || !pInp || !lineEl) return;
//   const q = parseFloat(m2e(qInp.value || '')) || 0;
//   const p = parseFloat(m2e(pInp.value || '')) || 0;
//   const mr = currentLang === 'mr';
//   if (q > 0 || p > 0) {
//     const sub = q * p;
//     const dq = mr ? e2m(String(q)) : String(q);
//     const dp = mr ? e2m(commaNum(String(p))) : commaNum(String(p));
//     const ds = mr ? e2m(commaNum(String(sub))) : commaNum(String(sub));
//     if (q > 0 && p > 0) {
//       lineEl.textContent = `${dq} × ₹${dp} = ₹${ds}`;
//       lineEl.className = 'qty-subtotal-line';
//     } else if (p > 0) {
//       lineEl.textContent = `₹${dp}`;
//       lineEl.className = 'qty-subtotal-line empty';
//     } else {
//       lineEl.textContent = q > 0 ? (mr ? `प्रमाण: ${dq}` : `Qty: ${dq}`) : '';
//       lineEl.className = 'qty-subtotal-line empty';
//     }
//   } else {
//     lineEl.textContent = mr ? 'प्रमाण × किंमत = रक्कम' : 'Qty × Price = Amount';
//     lineEl.className = 'qty-subtotal-line empty';
//   }
// }

// function qtyMakeRow(title = '', qty = '', price = '') {
//   const wrap = document.createElement('div');
//   wrap.className = 'qty-row-wrap';
//   const mr = currentLang === 'mr';
//   const amAttr = mr ? 'readonly' : '';
//   const imAttr = mr ? 'none' : 'decimal';
//   const dq = qty ? (mr ? e2m(String(qty)) : String(qty)) : '';
//   const dp = price ? (mr ? e2m(String(price)) : String(price)) : '';

//   const row = document.createElement('div');
//   row.className = 'input-row input-row-3';
//   row.innerHTML = `
//     <input type="text" class="form-input title-input" placeholder="${mr ? 'वस्तूचे नाव' : 'Item Name'}" value="${esc(title)}">
//     <div class="amount-wrap">
//       <input type="text" class="form-input qty-input form-input-sm" placeholder="${mr ? '०' : '0'}"
//         inputmode="${imAttr}" ${amAttr} value="${esc(dq)}" data-label="${mr ? 'प्रमाण' : 'Qty'}">
//     </div>
//     <div class="amount-wrap">
//       <input type="text" class="form-input amt-input form-input-sm" placeholder="${mr ? '०' : '0'}"
//         inputmode="${imAttr}" ${amAttr} value="${esc(dp)}" data-label="${mr ? 'किंमत' : 'Price'}">
//       <span class="currency-badge">₹</span>
//     </div>`;

//   const subtotalLine = document.createElement('div');
//   subtotalLine.className = 'qty-subtotal-line empty';
//   subtotalLine.textContent = mr ? 'प्रमाण × किंमत = रक्कम' : 'Qty × Price = Amount';

//   wrap.appendChild(row);
//   wrap.appendChild(subtotalLine);

//   // update line on input
//   row.addEventListener('input', () => {
//     updateQtySubtotalLine(wrap);
//   });

//   // initial render if values exist
//   if (qty || price) {
//     // defer so DOM is ready
//     setTimeout(() => updateQtySubtotalLine(wrap), 0);
//   }
//   return wrap;
// }
function qtyMakeRow(title = '', qty = '', price = '') {
  const wrap = document.createElement('div');
  wrap.className = 'qty-row-wrap'; // ✅ REQUIRED
  
  const mr = currentLang === 'mr';
  const readonly = mr ? 'readonly' : '';
  const inputmode = mr ? 'none' : 'tel';  // 'tel' ensures numeric keypad only (no letters)
  const dq = qty ? (mr ? e2m(String(qty)) : String(qty)) : '';
  const dp = price ? (mr ? e2m(String(price)) : String(price)) : '';

  wrap.innerHTML = `
    <div class="input-row input-row-3">
      <input type="text" class="form-input title-input" placeholder="${mr ? 'वस्तूचे नाव' : 'Item Name'}" value="${esc(title)}">

      <div class="amount-wrap">
        <input type="text" class="form-input qty-input form-input-sm" placeholder="${mr ? '०' : '0'}" 
          inputmode="${inputmode}" ${readonly} value="${esc(dq)}" data-label="${mr ? 'प्रमाण' : 'Qty'}">
      </div>

      <div class="amount-wrap">
        <input type="text" class="form-input amt-input form-input-sm" placeholder="${mr ? '०' : '0'}" 
          inputmode="${inputmode}" ${readonly} value="${esc(dp)}" data-label="${mr ? 'किंमत' : 'Price'}">
        <span class="currency-badge">₹</span>
      </div>
    </div>
    <div class="qty-subtotal-line empty"></div>
  `;

  return wrap;
}

// function qtyAddRow() { document.getElementById('qtyRows').appendChild(qtyMakeRow()); qtyGetTotal(); }

function qtyAddRow() {
  const row = qtyMakeRow();

  document.getElementById('qtyRows').appendChild(row);

  updateQtySubtotalLine(row);
  qtyGetTotal();

  // ✅ focus first input
  row.querySelector('.title-input')?.focus();
}
function qtyRemoveRow() {
  const c = document.getElementById('qtyRows');
  if (c.children.length > 1) c.removeChild(c.lastElementChild);
  qtyGetTotal();
}

function qtyReset() {
  const c = document.getElementById('qtyRows');
  c.innerHTML = '';
  c.appendChild(qtyMakeRow());
  document.getElementById('qtyBudget').value = '';
  document.getElementById('qtyTotalDisp').value = '';
  document.getElementById('qtyShow').textContent = '—';
  document.getElementById('qtyRemain').classList.add('hidden');
  qtyCalcDone = false; qtyTotal = qtyRem = 0;
  closeMarathiKeypad(); qtyGetTotal(); qtyAutoSave();
  showToast(currentLang === 'mr' ? 'रीसेट झाले!' : 'Reset!');
}

document.addEventListener('DOMContentLoaded', () => {
  // document.getElementById('qtyRows').addEventListener('input', e => {

  //   if (e.target.tagName === 'INPUT') {
  //     qtyCalcDone = false;
  //     document.getElementById('qtyRemain').classList.add('hidden');
  //     qtyGetTotal(); qtyAutoSave();
  //   }
  // });


  document.getElementById('qtyRows').addEventListener('input', e => {
  if (e.target.tagName === 'INPUT') {

    qtyCalcDone = false;
    document.getElementById('qtyRemain').classList.add('hidden');

    // 👉 IMPORTANT: find current row
    const row = e.target.closest('.qty-row-wrap');

    // 👉 Update that row subtotal
    if (row) {
      updateQtySubtotalLine(row);
    }

    // 👉 Update full total
    qtyGetTotal();

    // 👉 Auto save
    qtyAutoSave();
  }
});
  document.getElementById('qtyBudget').addEventListener('input', () => {
    qtyCalcDone = false;
    document.getElementById('qtyRemain').classList.add('hidden');
    qtyAutoSave();
  });
});

function qtyGetTotal() {
  let total = 0;
  // BUG FIX: iterate over qty-row-wrap, not input-row directly
  document.querySelectorAll('#qtyRows .qty-row-wrap').forEach(wrap => {
    const q = parseFloat(m2e(wrap.querySelector('.qty-input')?.value || '')) || 0;
    const p = parseFloat(m2e(wrap.querySelector('.amt-input')?.value || '')) || 0;
    total += q * p;
  });
  qtyTotal = total;
  const es = document.getElementById('qtyShow');
  const ei = document.getElementById('qtyTotalDisp');
  if (total > 0) {
    es.textContent = '₹ ' + fmtNum(total, currentLang === 'mr');
    ei.value = currentLang === 'mr' ? e2m(String(total)) : String(total);
  } else {
    es.textContent = '—';
    ei.value = '';
  }
}

function qtyCalculate() {
  const budget = rawNum(document.getElementById('qtyBudget').value);
  const total = rawNum(document.getElementById('qtyTotalDisp').value);
  if (budget <= 0) { showToast(currentLang === 'mr' ? 'बजेट टाका' : 'Enter your budget', 'error'); return; }
  if (total <= 0) { showToast(currentLang === 'mr' ? 'वस्तू टाका' : 'Add items first', 'error'); return; }
  qtyRem = budget - total; qtyCalcDone = true;
  const remEl = document.getElementById('qtyRemain');
  remEl.classList.remove('hidden');
  const rs = commaNum(String(qtyRem));
  remEl.textContent = currentLang === 'mr' ? 'शिल्लक: ₹' + e2m(rs) : 'Remaining: ₹' + rs;
  remEl.style.cssText = qtyRem < 0
    ? 'background:var(--danger-bg);color:var(--danger);border:1.5px solid var(--danger);margin-top:12px;padding:11px 15px;border-radius:var(--r-sm);font-size:.95rem;font-weight:700;text-align:center'
    : 'background:var(--success-bg);color:var(--success);border:1.5px solid var(--success);margin-top:12px;padding:11px 15px;border-radius:var(--r-sm);font-size:.95rem;font-weight:700;text-align:center';
  qtyShowModal(); qtyAutoSave();
}

function qtyShowModal() {
  const arr = qtyAllRows();
  const mr = currentLang === 'mr';
  const budget = rawNum(document.getElementById('qtyBudget').value);
  const total = qtyTotal;
  const rem = qtyCalcDone ? qtyRem : (budget - total);
  const fmt = v => '₹' + fmtNum(v, mr);
  const headHtml = `<th>#</th><th>${mr ? 'वस्तूचे नाव' : 'Item Name'}</th><th>${mr ? 'प्रमाण' : 'Qty'}</th><th>${mr ? 'किंमत' : 'Price'}</th><th>${mr ? 'एकूण' : 'Total'}</th>`;
  const rows = arr.filter(r => r.title || r.qty || r.price).map((r, i) => {
    const q = parseFloat(m2e(r.qty)) || 0, p = parseFloat(m2e(r.price)) || 0, t = q * p;
    const dq = mr ? e2m(commaNum(String(q))) : commaNum(String(q));
    const dp = mr ? e2m(commaNum(String(p))) : commaNum(String(p));
    const dt = mr ? e2m(commaNum(String(t))) : commaNum(String(t));
    return `<td>${i + 1}</td><td>${esc(r.title || '—')}</td><td>${dq}</td><td>₹${dp}</td><td>₹${dt}</td>`;
  });
  // BUG FIX: grand total uses computed qtyTotal, not just last row
  const dispTotal = mr ? e2m(commaNum(String(total))) : commaNum(String(total));
  const footHtml = `<td colspan="4">${mr ? 'एकूण रक्कम' : 'Grand Total'}</td><td>₹${dispTotal}</td>`;
  const summaryHtml = `
    <div class="summary-row sr-amount"><span>${mr ? 'बजेट' : 'Budget'}</span><strong>${fmt(budget)}</strong></div>
    <div class="summary-row sr-expense"><span>${mr ? 'एकूण रक्कम' : 'Grand Total'}</span><strong>${fmt(total)}</strong></div>
    ${qtyCalcDone ? `<div class="summary-row sr-remain"><span>${mr ? 'शिल्लक' : 'Remaining'}</span><strong>${fmt(rem)}</strong></div>` : ''}`;
  openModal(mr ? 'प्रमाण × किंमत सारांश' : 'Qty × Price Summary', headHtml, rows, footHtml, summaryHtml, qtyExportPDF, qtyExportImage, qtySaveAsNewPDF);
}

function qtySaveAsNewPDF() {
  const mr = currentLang === 'mr';
  const dateStr = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
  const def = mr ? `प्रमाण × किंमत सारांश - ${dateStr}` : `Qty × Price Summary - ${dateStr}`;
  askTitle(def).then(title => _qtyDoPDF(title));
}

function qtyAllRows() {
  const rows = [];
  document.querySelectorAll('#qtyRows .qty-row-wrap').forEach(wrap => {
    const t = wrap.querySelector('.title-input')?.value || '';
    const q = m2e(wrap.querySelector('.qty-input')?.value || '');
    const p = m2e(wrap.querySelector('.amt-input')?.value || '');
    rows.push({ title: t, qty: q, price: p });
  });
  return rows;
}

function qtyAutoSave() {
  try {
    localStorage.setItem(LS_QTY, JSON.stringify({
      sig: QTY_SIG, lang: currentLang,
      rows: qtyAllRows(),
      budget: m2e(document.getElementById('qtyBudget').value || ''),
      savedAt: new Date().toISOString()
    }));
  } catch (e) {}
}

function qtyLoadSave() {
  try {
    const raw = localStorage.getItem(LS_QTY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d.sig === QTY_SIG) {
        const mr = currentLang === 'mr';
        const c = document.getElementById('qtyRows'); c.innerHTML = '';
        (d.rows || []).forEach(r => c.appendChild(qtyMakeRow(r.title || '', m2e(r.qty || ''), m2e(r.price || ''))));
        if (d.budget && d.budget !== '0') { document.getElementById('qtyBudget').value = mr ? e2m(d.budget) : d.budget; }
        qtyGetTotal();
      }
    }
  } catch (e) {}
}

function qtyExportJSON() {
  const arr = qtyAllRows().filter(r => r.title || r.qty || r.price);
  const mr = currentLang === 'mr';
  const budget = rawNum(document.getElementById('qtyBudget').value);
  const total = qtyTotal;
  
  if (!arr.length) { showToast(currentLang === 'mr' ? 'वस्तू टाका' : 'Add items first', 'error'); return; }
  
  const data = {
    sig: QTY_SIG, lang: mr ? 'mr' : 'en',
    rows: arr.map(r => ({ title: r.title, qty: m2e(r.qty), price: m2e(r.price) })),
    budget: budget > 0 ? String(budget) : "",
    fileId: rnd(),
    exportedAt: new Date().toISOString()
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Qty_${new Date().toLocaleDateString('en-GB').replace(/\//g, '-')}_${data.fileId}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(currentLang === 'mr' ? 'JSON जतन झाले!' : 'JSON saved!', 'success');
}

function qtyExportPDF() {
  const mr = currentLang === 'mr';
  const dateStr = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
  const def = mr ? `प्रमाण × किंमत सारांश - ${dateStr}` : `Qty × Price Summary - ${dateStr}`;
  askTitle(def).then(title => _qtyDoPDF(title));
}

function qtyExportImage() {
  const mr = currentLang === 'mr';
  const dateStr = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
  const def = mr ? `प्रमाण × किंमत सारांश - ${dateStr}` : `Qty × Price Summary - ${dateStr}`;
  askTitle(def).then(title => _qtyDoImage(title));
}

function _qtyDoPDF(chosenTitle) {
  closeModal();
  const arr = qtyAllRows().filter(r => r.title || r.qty || r.price);
  const mr = currentLang === 'mr';
  const budget = rawNum(document.getElementById('qtyBudget').value);
  const total = qtyTotal;
  const remVal = qtyCalcDone ? (budget - total) : null;
  if (!arr.length) { showToast(currentLang === 'mr' ? 'वस्तू टाका' : 'Add items first', 'error'); return; }
  
  // 🔧 CREATE PAYLOAD FOR PDF IMPORT
  const payload = JSON.stringify({
    sig: QTY_SIG, lang: mr ? 'mr' : 'en',
    rows: arr.map(r => ({ title: r.title, qty: m2e(r.qty), price: m2e(r.price) })),
    budget: budget > 0 ? String(budget) : "",
    exportedAt: new Date().toISOString()
  });
  const embed = `<<${QTY_SIG}>>${payload}<<END>>`;
  
  _setupPdfFonts();

  // DESCRIPTIVE table: item name, qty, unit price, subtotal — with subtotal formula shown
  const tableBody = [[
    { text: '#', fillColor: '#2563eb', color: '#fff', bold: true, alignment: 'center' },
    { text: mr ? 'वस्तूचे नाव' : 'Item Name', fillColor: '#2563eb', color: '#fff', bold: true },
    { text: mr ? 'प्रमाण' : 'Qty', fillColor: '#2563eb', color: '#fff', bold: true, alignment: 'center' },
    { text: mr ? 'एकक किंमत' : 'Unit Price', fillColor: '#2563eb', color: '#fff', bold: true, alignment: 'right' },
    { text: mr ? 'उप-एकूण' : 'Subtotal', fillColor: '#2563eb', color: '#fff', bold: true, alignment: 'right' }
  ]];

  arr.forEach((r, i) => {
    const q = parseFloat(m2e(r.qty)) || 0;
    const p = parseFloat(m2e(r.price)) || 0;
    const t = q * p;
    const dq  = mr ? e2m(commaNum(String(q))) : commaNum(String(q));
    const dp  = mr ? e2m(commaNum(String(p))) : commaNum(String(p));
    const dt  = mr ? e2m(commaNum(String(t))) : commaNum(String(t));
    // descriptive formula in subtotal col: "Qty × ₹Price = ₹Total"
    const formulaText = (q > 0 && p > 0) ? `${dq} × ₹${dp} = ₹${dt}` : `₹${dt}`;
    tableBody.push([
      { text: String(i + 1), alignment: 'center' },
      { text: r.title || '—', bold: true },
      { text: dq, alignment: 'center' },
      { text: '₹ ' + dp, alignment: 'right' },
      { text: formulaText, alignment: 'right', color: '#2563eb', bold: true }
    ]);
  });

  const dispTotal = mr ? e2m(commaNum(String(total))) : commaNum(String(total));
  tableBody.push([
    { text: mr ? 'एकूण रक्कम' : 'Grand Total', colSpan: 4, bold: true, alignment: 'center', fillColor: '#1e293b', color: '#fff' },
    {}, {}, {},
    { text: '₹ ' + dispTotal, bold: true, alignment: 'right', fillColor: '#1e293b', color: '#fff' }
  ]);

  const summaryBody = [
    [{ text: mr ? 'बजेट' : 'Budget', bold: true }, { text: '₹ ' + (mr ? e2m(commaNum(String(budget))) : commaNum(String(budget))), color: '#16a34a', bold: true, alignment: 'right' }],
    [{ text: mr ? 'एकूण रक्कम' : 'Grand Total', bold: true }, { text: '₹ ' + dispTotal, color: '#dc2626', bold: true, alignment: 'right' }]
  ];
  if (remVal !== null) {
    const dispRem = mr ? e2m(commaNum(String(remVal))) : commaNum(String(remVal));
    summaryBody.push([
      { text: mr ? 'शिल्लक' : 'Remaining', bold: true, fillColor: '#1e293b', color: '#fff' },
      { text: '₹ ' + dispRem, bold: true, alignment: 'right', fillColor: '#1e293b', color: '#fff' }
    ]);
  }
  _buildAndDownloadPDF(chosenTitle, embed, tableBody, summaryBody, [22, '*', 35, 70, 100],
    mr ? 'खर्च कॅल्क्युलेटर द्वारे तयार केले' : 'Generated by Expense Calculator');
}

async function _qtyDoImage(chosenTitle) {
  closeModal();
  const arr = qtyAllRows().filter(r => r.title || r.qty || r.price);
  const mr = currentLang === 'mr';
  const budget = rawNum(document.getElementById('qtyBudget').value);
  const total = qtyTotal;
  const remVal = qtyCalcDone ? (budget - total) : null;
  if (!arr.length) { showToast(currentLang === 'mr' ? 'वस्तू टाका' : 'Add items first', 'error'); return; }
  const C = getImgColors();
  const rowsHtml = arr.map((r, i) => {
    const q = parseFloat(m2e(r.qty)) || 0, p = parseFloat(m2e(r.price)) || 0, t = q * p;
    const bg = i % 2 === 0 ? C.alt : C.bg;
    const dq = mr ? e2m(commaNum(String(q))) : commaNum(String(q));
    const dp = mr ? e2m(commaNum(String(p))) : commaNum(String(p));
    const dt = mr ? e2m(commaNum(String(t))) : commaNum(String(t));
    const formula = (q > 0 && p > 0) ? `${dq} × ₹${dp} = ₹${dt}` : `₹${dt}`;
    return `<tr style="background:${bg}">
      <td style="${tdSt(C)};text-align:center;color:${C.muted}">${i + 1}</td>
      <td style="${tdSt(C)};font-weight:600">${esc(r.title || '—')}</td>
      <td style="${tdSt(C)};text-align:center">${dq}</td>
      <td style="${tdSt(C)};text-align:right">₹ ${dp}</td>
      <td style="${tdSt(C)};text-align:right;color:#2563eb;font-weight:700">${formula}</td>
    </tr>`;
  }).join('');
  const dispTotal = mr ? e2m(commaNum(String(total))) : commaNum(String(total));
  const dispBudget = mr ? e2m(commaNum(String(budget))) : commaNum(String(budget));
  const remainHtml = remVal !== null
    ? `<div style="display:flex;justify-content:space-between;padding:10px 15px;background:#1e293b;border-top:1px solid ${C.bdr}"><span style="font-size:12px;color:#94a3b8">${mr ? 'शिल्लक' : 'Remaining'}</span><strong style="font-size:13px;color:#fff">₹ ${mr ? e2m(commaNum(String(remVal))) : commaNum(String(remVal))}</strong></div>` : '';
  const html = _imgWrap(C, chosenTitle,
    `<table style="width:100%;border-collapse:collapse;margin-bottom:16px">
      <thead><tr style="background:#2563eb">
        <th style="padding:8px;color:#fff;font-size:11px;width:26px">#</th>
        <th style="padding:8px;text-align:left;color:#fff;font-size:11px">${mr ? 'वस्तूचे नाव' : 'Item'}</th>
        <th style="padding:8px;text-align:center;color:#fff;font-size:11px">${mr ? 'प्रमाण' : 'Qty'}</th>
        <th style="padding:8px;text-align:right;color:#fff;font-size:11px">${mr ? 'एकक किंमत' : 'Unit Price'}</th>
        <th style="padding:8px;text-align:right;color:#fff;font-size:11px">${mr ? 'उप-एकूण' : 'Subtotal'}</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
      <tfoot><tr style="background:#1e293b"><td colspan="4" style="padding:9px;color:#fff;font-weight:700;font-size:12px;text-align:center">${mr ? 'एकूण रक्कम' : 'Grand Total'}</td><td style="padding:9px;color:#fff;font-weight:700;font-size:13px;text-align:right">₹ ${dispTotal}</td></tr></tfoot>
    </table>
    <div style="border:1px solid ${C.bdr};border-radius:10px;overflow:hidden">
      <div style="display:flex;justify-content:space-between;padding:10px 15px;background:${C.suBg}"><span style="font-size:12px;color:${C.muted}">${mr ? 'बजेट' : 'Budget'}</span><strong style="color:${C.suTxt}">₹ ${dispBudget}</strong></div>
      <div style="display:flex;justify-content:space-between;padding:10px 15px;background:${C.exBg};border-top:1px solid ${C.bdr}"><span style="font-size:12px;color:${C.muted}">${mr ? 'एकूण रक्कम' : 'Grand Total'}</span><strong style="color:${C.exTxt}">₹ ${dispTotal}</strong></div>
      ${remainHtml}
    </div>`,
    mr ? 'खर्च कॅल्क्युलेटर द्वारे तयार केले' : 'Generated by Expense Calculator');
  await _downloadImage(html, C.bg);
}

// ────────────────────────────────────────────
// ── CALCULATOR 3 — CATEGORY ──
// ────────────────────────────────────────────
let catCalcDone = false, catGrandTotal = 0, catRem = 0;
const CAT_COLORS = ['#2563eb','#16a34a','#dc2626','#d97706','#7c3aed','#0891b2','#db2777','#65a30d','#ea580c','#0d9488'];
let categories = []; // [{id,name,color,rows:[{title,amount}]}]

function catAdd() {
  const id = 'cat_' + rnd();
  const color = CAT_COLORS[categories.length % CAT_COLORS.length];
  categories.push({ id, name: '', color, rows: [] });
  catRenderAll();
  catAutoSave();
  setTimeout(() => {
    const el = document.querySelector(`[data-catid="${id}"] .cat-name-input`);
    if (el) el.focus();
  }, 60);
}

function catRemove(id) {
  categories = categories.filter(c => c.id !== id);
  catRenderAll(); catUpdateGrand(); catAutoSave();
}

function catAddRow(id) {
  const cat = categories.find(c => c.id === id); if (!cat) return;
  cat.rows.push({ title: '', amount: '' });
  catRenderAll(); catAutoSave();
}

function catRemoveRow(id) {
  const cat = categories.find(c => c.id === id); if (!cat) return;
  if (cat.rows.length > 1) cat.rows.pop();
  else cat.rows = [];
  catRenderAll(); catUpdateGrand(); catAutoSave();
}

function catSyncFromDOM() {
  document.querySelectorAll('.cat-card').forEach(card => {
    const id = card.dataset.catid;
    const cat = categories.find(c => c.id === id); if (!cat) return;
    cat.name = card.querySelector('.cat-name-input')?.value || '';
    cat.rows = [];
    card.querySelectorAll('.cat-item-row').forEach(row => {
      const t = row.querySelector('.cat-item-title')?.value || '';
      const a = m2e(row.querySelector('.cat-item-amt')?.value || '');
      cat.rows.push({ title: t, amount: a });
    });
  });
}

function catRenderAll() {
  const mr = currentLang === 'mr';
  const list = document.getElementById('catList'); list.innerHTML = '';
  categories.forEach(cat => {
    const card = document.createElement('div');
    card.className = 'cat-card'; card.dataset.catid = cat.id;
    const amAttr = mr ? 'readonly' : '';
    const imAttr = mr ? 'none' : 'tel';  // Changed from 'decimal' to 'tel' for numeric-only keyboard
    const rowsHtml = cat.rows.map((r, i) => `
      <div class="input-row input-row-3s cat-item-row">
        <input type="text" class="form-input form-input-sm cat-item-title" placeholder="${mr ? 'वस्तू' : 'Item'}" value="${esc(r.title)}">
        <div class="amount-wrap">
          <input type="text" class="form-input form-input-sm amt-input cat-item-amt" placeholder="${mr ? '०' : '0'}"
            inputmode="${imAttr}" ${amAttr} value="${esc(r.amount ? (mr ? e2m(String(r.amount)) : String(r.amount)) : '')}">
          <span class="currency-badge">₹</span>
        </div>
      </div>`).join('');
    const catTotal = cat.rows.reduce((s, r) => { const v = parseFloat(m2e(r.amount || '')); return s + (isNaN(v) ? 0 : v); }, 0);
    const dispTotal = catTotal > 0 ? '₹ ' + fmtNum(catTotal, mr) : '₹ 0';
    card.innerHTML = `
      <div class="cat-card-header">
        <div class="cat-label-wrap">
          <div class="cat-dot" style="background:${cat.color}"></div>
          <input type="text" class="cat-name-input" placeholder="${mr ? 'श्रेणीचे नाव' : 'Category Name'}" value="${esc(cat.name)}">
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="cat-total" style="font-weight:bold;font-size:1rem;color:var(--primary);">${dispTotal}</span>
          <button class="btn-remove-cat" onclick="catRemove('${cat.id}')">${mr ? 'काढा' : 'Remove'}</button>
        </div>
      </div>
      <div class="col-headers col-headers-3s"><span>${mr ? 'वस्तू' : 'Item'}</span><span>${mr ? 'रक्कम (₹)' : 'Amount (₹)'}</span></div>
      <div class="cat-rows-wrap">${rowsHtml || `<div class="input-row input-row-3s cat-item-row"><input type="text" class="form-input form-input-sm cat-item-title" placeholder="${mr ? 'वस्तू' : 'Item'}"><div class="amount-wrap"><input type="text" class="form-input form-input-sm amt-input cat-item-amt" placeholder="${mr ? '०' : '0'}" inputmode="${imAttr}" ${amAttr}><span class="currency-badge">₹</span></div></div>`}</div>
      <div class="cat-row-controls">
        <button class="btn-icon-round btn-cat-icon" onclick="catSyncFromDOM();catAddRow('${cat.id}')" title="Add row">➕</button>
        <button class="btn-icon-round btn-cat-icon" onclick="catSyncFromDOM();catRemoveRow('${cat.id}')" title="Remove last">➖</button>
      </div>`;
    card.querySelector('.cat-name-input').addEventListener('input', e => {
      const c = categories.find(x => x.id === cat.id); if (c) c.name = e.target.value;
      catAutoSave();
    });
    card.querySelectorAll('.cat-item-row').forEach(row => {
      row.querySelector('.cat-item-title').addEventListener('input', () => {
        catSyncFromDOM(); catUpdateGrand(); catAutoSave();
      });
      row.querySelector('.cat-item-amt').addEventListener('input', () => {
        catCalcDone = false;
        document.getElementById('catRemain').classList.add('hidden');
        catSyncFromDOM(); catUpdateGrand(); catAutoSave();
      });
    });
    list.appendChild(card);
  });
  catUpdateGrand();
}

// function catRefreshAll() {
//   catSyncFromDOM(); catRenderAll();
// }

function catRefreshAll() {
  let grandTotal = 0;
  const mr = currentLang === 'mr';

  document.querySelectorAll('.cat-card').forEach(card => {
    let catTotal = 0;

    card.querySelectorAll('.cat-item-amt').forEach(inp => {
      const val = rawNum(inp.value);
      if (val > 0) catTotal += val;
    });

    // ✅ update category total (near remove button)
    const totalEl = card.querySelector('.cat-total');
    if (totalEl) {
      const formatted = mr ? e2m(commaNum(catTotal)) : commaNum(catTotal);
      totalEl.textContent = '₹' + formatted;
    }

    grandTotal += catTotal;
  });

  // ✅ update GRAND TOTAL
  const grandEl = document.getElementById('catTotalDisp');

  if (grandTotal > 0) {
    const formatted = mr ? e2m(commaNum(grandTotal)) : commaNum(grandTotal);
    grandEl.textContent = '₹' + formatted;
  } else {
    grandEl.textContent = '—';
  }
}

function catUpdateGrand() {
  catSyncFromDOM();
  const mr = currentLang === 'mr';
  let grand = 0;
  categories.forEach(cat => {
    cat.rows.forEach(r => { const v = parseFloat(m2e(r.amount || '')); if (!isNaN(v)) grand += v; });
  });
  catGrandTotal = grand;
  const gc = document.getElementById('catGrandCard');
  if (categories.length > 0) gc.classList.remove('hidden'); else gc.classList.add('hidden');
  document.getElementById('catGrandVal').textContent = '₹ ' + fmtNum(grand, mr);
  document.getElementById('catTotalDisp').value = mr ? e2m(String(grand)) : String(grand);
  const sl = document.getElementById('catSummaryList'); sl.innerHTML = '';
  categories.forEach(cat => {
    const t = cat.rows.reduce((s, r) => { const v = parseFloat(m2e(r.amount || '')); return s + (isNaN(v) ? 0 : v); }, 0);
    if (!t && !cat.name) return;
    const row = document.createElement('div'); row.className = 'cat-summary-row';
    row.innerHTML = `<span class="cat-summary-name"><span class="cat-summary-dot" style="background:${cat.color}"></span>${esc(cat.name || '—')}</span><span class="cat-summary-amt">₹ ${fmtNum(t, mr)}</span>`;
    sl.appendChild(row);
  });
}

function catCalculate() {
  const budget = rawNum(document.getElementById('catBudget').value);
  const total = catGrandTotal;
  if (budget <= 0) { showToast(currentLang === 'mr' ? 'बजेट टाका' : 'Enter your budget', 'error'); return; }
  if (total <= 0) { showToast(currentLang === 'mr' ? 'वस्तू टाका' : 'Add items first', 'error'); return; }
  catRem = budget - total; catCalcDone = true;
  const remEl = document.getElementById('catRemain');
  remEl.classList.remove('hidden');
  const rs = commaNum(String(catRem));
  remEl.textContent = currentLang === 'mr' ? 'शिल्लक: ₹' + e2m(rs) : 'Remaining: ₹' + rs;
  remEl.style.cssText = catRem < 0
    ? 'background:var(--danger-bg);color:var(--danger);border:1.5px solid var(--danger);margin-top:10px;padding:11px 15px;border-radius:var(--r-sm);font-size:.95rem;font-weight:700;text-align:center'
    : 'background:var(--success-bg);color:var(--success);border:1.5px solid var(--success);margin-top:10px;padding:11px 15px;border-radius:var(--r-sm);font-size:.95rem;font-weight:700;text-align:center';
  catShowModal(); catAutoSave();
}

function catShowModal() {
  catSyncFromDOM();
  const mr = currentLang === 'mr';
  const budget = rawNum(document.getElementById('catBudget').value);
  const total = catGrandTotal;
  const rem = catCalcDone ? catRem : (budget - total);
  const fmt = v => '₹' + fmtNum(v, mr);
  const headHtml = `<th>${mr ? 'श्रेणी' : 'Category'}</th><th>${mr ? 'वस्तू' : 'Item'}</th><th>${mr ? 'रक्कम' : 'Amount'}</th>`;
  const rows = [];
  categories.forEach(cat => {
    cat.rows.forEach((r, i) => {
      const da = r.amount ? (mr ? e2m(commaNum(r.amount)) : commaNum(r.amount)) : '0';
      rows.push(`<td>${esc(i === 0 ? (cat.name || '—') : '')}</td><td>${esc(r.title || '—')}</td><td>₹${da}</td>`);
    });
    const t = cat.rows.reduce((s, r) => { const v = parseFloat(m2e(r.amount || '')); return s + (isNaN(v) ? 0 : v); }, 0);
    rows.push(`<td colspan="2" style="font-weight:700;background:var(--surface2)">${esc(cat.name || '—')} ${mr ? 'एकूण' : 'Total'}</td><td style="font-weight:700;background:var(--surface2)">₹${fmtNum(t, mr)}</td>`);
  });
  const dispTotal = mr ? e2m(commaNum(String(total))) : commaNum(String(total));
  const footHtml = `<td colspan="2">${mr ? 'एकूण' : 'Grand Total'}</td><td>₹${dispTotal}</td>`;
  const summaryHtml = `
    <div class="summary-row sr-amount"><span>${mr ? 'बजेट' : 'Budget'}</span><strong>${fmt(budget)}</strong></div>
    <div class="summary-row sr-expense"><span>${mr ? 'एकूण रक्कम' : 'Total Spent'}</span><strong>${fmt(total)}</strong></div>
    ${catCalcDone ? `<div class="summary-row sr-remain"><span>${mr ? 'शिल्लक' : 'Remaining'}</span><strong>${fmt(rem)}</strong></div>` : ''}`;
  openModal(mr ? 'श्रेणी सारांश' : 'Category Summary', headHtml, rows, footHtml, summaryHtml, catExportPDF, catExportImage, catSaveAsNewPDF);
}

function catSaveAsNewPDF() {
  const mr = currentLang === 'mr';
  const dateStr = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
  const def = mr ? `श्रेणी सारांश - ${dateStr}` : `Category Summary - ${dateStr}`;
  askTitle(def).then(title => _catDoPDF(title));
}

function catAutoSave() {
  try {
    catSyncFromDOM();
    localStorage.setItem(LS_CAT, JSON.stringify({
      sig: CAT_SIG, lang: currentLang, categories,
      budget: m2e(document.getElementById('catBudget').value || ''),
      savedAt: new Date().toISOString()
    }));
  } catch (e) {}
}

function catLoadSave() {
  try {
    const raw = localStorage.getItem(LS_CAT);
    if (raw) {
      const d = JSON.parse(raw);
      if (d.sig === CAT_SIG && d.categories) {
        categories = d.categories;
        const mr = currentLang === 'mr';
        if (d.budget && d.budget !== '0') { document.getElementById('catBudget').value = mr ? e2m(d.budget) : d.budget; }
        catRenderAll();
      }
    }
  } catch (e) {}
}

function catExportJSON() {
  catSyncFromDOM();
  const mr = currentLang === 'mr';
  const budget = rawNum(document.getElementById('catBudget').value);
  const total = catGrandTotal;
  
  if (total === 0) { showToast(currentLang === 'mr' ? 'डेटा टाका' : 'Add data first', 'error'); return; }
  
  const data = {
    sig: CAT_SIG, lang: mr ? 'mr' : 'en',
    categories: categories.map(cat => ({
      name: cat.name,
      items: cat.rows.map(r => ({ title: r.title, amount: m2e(r.amount) }))
    })),
    budget: budget > 0 ? String(budget) : "",
    fileId: rnd(),
    exportedAt: new Date().toISOString()
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Category_${new Date().toLocaleDateString('en-GB').replace(/\//g, '-')}_${data.fileId}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(currentLang === 'mr' ? 'JSON जतन झाले!' : 'JSON saved!', 'success');
}

function catExportPDF() {
  const mr = currentLang === 'mr';
  const dateStr = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
  const def = mr ? `श्रेणी सारांश - ${dateStr}` : `Category Summary - ${dateStr}`;
  askTitle(def).then(title => _catDoPDF(title));
}

function catExportImage() {
  const mr = currentLang === 'mr';
  const dateStr = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
  const def = mr ? `श्रेणी सारांश - ${dateStr}` : `Category Summary - ${dateStr}`;
  askTitle(def).then(title => _catDoImage(title));
}

function _catDoPDF(chosenTitle) {
  closeModal();
  catSyncFromDOM();
  const mr = currentLang === 'mr';
  const budget = rawNum(document.getElementById('catBudget').value);
  const total = catGrandTotal;
  const remVal = catCalcDone ? (budget - total) : null;
  if (total === 0) { showToast(currentLang === 'mr' ? 'डेटा टाका' : 'Add data first', 'error'); return; }
  
  // 🔧 CREATE PAYLOAD FOR PDF IMPORT
  const payload = JSON.stringify({
    sig: CAT_SIG, lang: mr ? 'mr' : 'en',
    categories: categories.map(cat => ({
      name: cat.name,
      items: cat.rows.map(r => ({ title: r.title, amount: m2e(r.amount) }))
    })),
    budget: budget > 0 ? String(budget) : "",
    exportedAt: new Date().toISOString()
  });
  const embed = `<<${CAT_SIG}>>${payload}<<END>>`;
  
  _setupPdfFonts();
  const tableBody = [[
    { text: mr ? 'श्रेणी' : 'Category', fillColor: '#2563eb', color: '#fff', bold: true },
    { text: mr ? 'वस्तू' : 'Item', fillColor: '#2563eb', color: '#fff', bold: true },
    { text: mr ? 'रक्कम (₹)' : 'Amount (₹)', fillColor: '#2563eb', color: '#fff', bold: true, alignment: 'right' }
  ]];
  categories.forEach(cat => {
    const catT = cat.rows.reduce((s, r) => { const v = parseFloat(m2e(r.amount || '')); return s + (isNaN(v) ? 0 : v); }, 0);
    cat.rows.forEach((r, i) => {
      const da = r.amount ? (mr ? e2m(commaNum(r.amount)) : commaNum(r.amount)) : '0';
      tableBody.push([
        { text: i === 0 ? (cat.name || '—') : '', bold: i === 0, color: cat.color },
        { text: r.title || '—' },
        { text: '₹ ' + da, alignment: 'right' }
      ]);
    });
    const dt = mr ? e2m(commaNum(String(catT))) : commaNum(String(catT));
    tableBody.push([
      { text: mr ? (cat.name || '—') + ' एकूण' : (cat.name || '—') + ' Total', colSpan: 2, bold: true, fontSize: 13, fillColor: '#e8f0fe', color: '#1e293b' },
      {},
      { text: '₹ ' + dt, bold: true, fontSize: 13, alignment: 'right', fillColor: '#e8f0fe', color: '#1e293b' }
    ]);
  });
  const dispTotal = mr ? e2m(commaNum(String(total))) : commaNum(String(total));
  tableBody.push([
    { text: mr ? 'एकूण' : 'Grand Total', colSpan: 2, bold: true, alignment: 'center', fillColor: '#1e293b', color: '#fff' },
    {},
    { text: '₹ ' + dispTotal, bold: true, alignment: 'right', fillColor: '#1e293b', color: '#fff' }
  ]);
  const summaryBody = [
    [{ text: mr ? 'बजेट' : 'Budget', bold: true }, { text: '₹ ' + (mr ? e2m(commaNum(String(budget))) : commaNum(String(budget))), color: '#16a34a', bold: true, alignment: 'right' }],
    [{ text: mr ? 'एकूण रक्कम' : 'Total Spent', bold: true }, { text: '₹ ' + dispTotal, color: '#dc2626', bold: true, alignment: 'right' }]
  ];
  if (remVal !== null) {
    const dr = mr ? e2m(commaNum(String(remVal))) : commaNum(String(remVal));
    summaryBody.push([
      { text: mr ? 'शिल्लक' : 'Remaining', bold: true, fillColor: '#1e293b', color: '#fff' },
      { text: '₹ ' + dr, bold: true, alignment: 'right', fillColor: '#1e293b', color: '#fff' }
    ]);
  }
  _buildAndDownloadPDF(chosenTitle, embed, tableBody, summaryBody, ['*', '*', 100],
    mr ? 'खर्च कॅल्क्युलेटर द्वारे तयार केले' : 'Generated by Expense Calculator');
}

async function _catDoImage(chosenTitle) {
  closeModal();
  catSyncFromDOM();
  const mr = currentLang === 'mr';
  const budget = rawNum(document.getElementById('catBudget').value);
  const total = catGrandTotal;
  const remVal = catCalcDone ? (budget - total) : null;
  if (total === 0) { showToast(currentLang === 'mr' ? 'डेटा टाका' : 'Add data first', 'error'); return; }
  const C = getImgColors();
  let bodyHtml = '';
  categories.forEach(cat => {
    const catT = cat.rows.reduce((s, r) => { const v = parseFloat(m2e(r.amount || '')); return s + (isNaN(v) ? 0 : v); }, 0);
    cat.rows.forEach((r, i) => {
      const da = r.amount ? (mr ? e2m(commaNum(r.amount)) : commaNum(r.amount)) : '0';
      bodyHtml += `<tr style="background:${C.bg}"><td style="padding:7px 9px;border-bottom:1px solid ${C.bdr};font-size:12px;color:${cat.color};font-weight:${i === 0 ? '600' : '400'}">${i === 0 ? esc(cat.name || '—') : ''}</td><td style="${tdSt(C)}">${esc(r.title || '—')}</td><td style="${tdSt(C)};text-align:right">₹ ${da}</td></tr>`;
    });
    const dt = mr ? e2m(commaNum(String(catT))) : commaNum(String(catT));
    bodyHtml += `<tr style="background:${C.alt}"><td colspan="2" style="padding:7px 9px;font-weight:700;font-size:12px;color:${C.muted};border-bottom:1px solid ${C.bdr}">${esc(cat.name || '—')} ${mr ? 'एकूण' : 'Total'}</td><td style="padding:7px 9px;font-weight:700;font-size:12px;text-align:right;border-bottom:1px solid ${C.bdr};color:${C.text}">₹ ${dt}</td></tr>`;
  });
  const dispTotal = mr ? e2m(commaNum(String(total))) : commaNum(String(total));
  const dispBudget = mr ? e2m(commaNum(String(budget))) : commaNum(String(budget));
  const remainHtml = remVal !== null
    ? `<div style="display:flex;justify-content:space-between;padding:10px 15px;background:#1e293b;border-top:1px solid ${C.bdr}"><span style="font-size:12px;color:#94a3b8">${mr ? 'शिल्लक' : 'Remaining'}</span><strong style="font-size:13px;color:#fff">₹ ${mr ? e2m(commaNum(String(remVal))) : commaNum(String(remVal))}</strong></div>` : '';
  const chipsHtml = categories.map(cat => {
    const t = cat.rows.reduce((s, r) => { const v = parseFloat(m2e(r.amount || '')); return s + (isNaN(v) ? 0 : v); }, 0);
    return `<div style="display:flex;justify-content:space-between;padding:7px 11px;background:rgba(255,255,255,.1);border-radius:6px;font-size:12px"><span style="display:flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:${cat.color};display:inline-block"></span>${esc(cat.name || '—')}</span><strong style="color:#fff">₹ ${fmtNum(t, mr)}</strong></div>`;
  }).join('');
  const html = _imgWrap(C, chosenTitle,
    `<table style="width:100%;border-collapse:collapse;margin-bottom:16px">
      <thead><tr style="background:#2563eb">
        <th style="padding:8px;text-align:left;color:#fff;font-size:11px">${mr ? 'श्रेणी' : 'Category'}</th>
        <th style="padding:8px;text-align:left;color:#fff;font-size:11px">${mr ? 'वस्तू' : 'Item'}</th>
        <th style="padding:8px;text-align:right;color:#fff;font-size:11px">${mr ? 'रक्कम' : 'Amount'}</th>
      </tr></thead>
      <tbody>${bodyHtml}</tbody>
      <tfoot><tr style="background:#1e293b"><td colspan="2" style="padding:9px;color:#fff;font-weight:700;font-size:12px">${mr ? 'एकूण' : 'Grand Total'}</td><td style="padding:9px;color:#fff;font-weight:700;font-size:13px;text-align:right">₹ ${dispTotal}</td></tr></tfoot>
    </table>
    <div style="background:linear-gradient(135deg,#1e293b,#2563eb);border-radius:10px;padding:14px;margin-bottom:12px">
      <div style="font-size:10px;color:#a0c4ff;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">${mr ? 'श्रेणी विभाजन' : 'Category Breakdown'}</div>
      <div style="display:flex;flex-direction:column;gap:5px">${chipsHtml}</div>
    </div>
    <div style="border:1px solid ${C.bdr};border-radius:10px;overflow:hidden">
      <div style="display:flex;justify-content:space-between;padding:10px 15px;background:${C.suBg}"><span style="font-size:12px;color:${C.muted}">${mr ? 'बजेट' : 'Budget'}</span><strong style="color:${C.suTxt}">₹ ${dispBudget}</strong></div>
      <div style="display:flex;justify-content:space-between;padding:10px 15px;background:${C.exBg};border-top:1px solid ${C.bdr}"><span style="font-size:12px;color:${C.muted}">${mr ? 'एकूण रक्कम' : 'Total Spent'}</span><strong style="color:${C.exTxt}">₹ ${dispTotal}</strong></div>
      ${remainHtml}
    </div>`,
    mr ? 'खर्च कॅल्क्युलेटर द्वारे तयार केले' : 'Generated by Expense Calculator');
  await _downloadImage(html, C.bg);
}

// ────────────────────────────────────────────
// ── SHARED PDF / IMAGE UTILS ──
// ────────────────────────────────────────────
function _setupPdfFonts() {
  pdfMake.fonts = {
    Deva: {
      normal: 'NotoSansDevanagari-Regular.ttf',
      bold: 'NotoSansDevanagari-Regular.ttf',
      italics: 'NotoSansDevanagari-Regular.ttf',
      bolditalics: 'NotoSansDevanagari-Regular.ttf'
    }
  };
}

function _buildAndDownloadPDF(title, embed, tableBody, summaryBody, widths, footer) {
  const content = [
    { text: title, fontSize: 20, bold: true, color: '#1e293b' },
    { text: new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }), fontSize: 10, color: '#64748b', margin: [0, 4, 0, 0] },
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 2, lineColor: '#2563eb' }], margin: [0, 12, 0, 12] },
    {
      table: { headerRows: 1, widths, body: tableBody },
      layout: {
        hLineWidth: (i, n) => (i === 0 || i === n.table.body.length) ? 1 : .4,
        vLineWidth: () => 0,
        hLineColor: () => '#e2e8f0',
        paddingLeft: () => 8, paddingRight: () => 8,
        paddingTop: () => 6, paddingBottom: () => 6,
        fillColor: (r) => r === 0 ? null : (r % 2 === 0 ? '#f8fafc' : null)
      },
      margin: [0, 0, 0, 16]
    },
    {
      table: { widths: ['*', 120], body: summaryBody },
      layout: {
        hLineWidth: () => .4, vLineWidth: () => 0,
        hLineColor: () => '#e2e8f0',
        paddingLeft: () => 8, paddingRight: () => 8,
        paddingTop: () => 7, paddingBottom: () => 7
      },
      margin: [0, 0, 0, 20]
    },
    { text: footer, fontSize: 8, color: '#94a3b8', alignment: 'center', margin: [0, 4, 0, 0] }
  ];
  if (embed) {
    content.push({ text: embed, fontSize: 1, color: '#ffffff', background: '#ffffff', margin: [0, 0, 0, 0] });
  }
  const docDef = {
    pageSize: 'A4', pageMargins: [40, 50, 40, 50],
    info: { title, author: 'Expense Calculator', subject: embed || '', creator: 'ExpCalc' },
    defaultStyle: { font: 'Deva', fontSize: 12 }, content
  };
  try {
    pdfMake.createPdf(docDef).download(`${title.replace(/[^a-zA-Z0-9\u0900-\u097F]/g, '_')}_${rnd()}.pdf`);
    showToast(currentLang === 'mr' ? 'PDF डाउनलोड होत आहे...' : 'PDF downloading...', 'success');
  } catch (err) {
    showToast('PDF error: ' + err.message, 'error');
  }
}

function getImgColors() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    bg: dark ? '#1e293b' : '#ffffff', text: dark ? '#f1f5f9' : '#1a202c',
    muted: dark ? '#94a3b8' : '#64748b', bdr: dark ? '#334155' : '#e2e8f0',
    alt: dark ? '#253148' : '#f8fafc',
    suBg: dark ? '#14532d' : '#f0fdf4', suTxt: '#16a34a',
    exBg: dark ? '#450a0a' : '#fff1f2', exTxt: '#dc2626'
  };
}

function tdSt(C) {
  return `padding:7px 9px;border-bottom:1px solid ${C.bdr};font-size:13px;color:${C.text}`;
}

function _imgWrap(C, title, body, footer) {
  return `<div style="font-family:'Noto Sans Devanagari',Arial,sans-serif;background:${C.bg};color:${C.text};padding:28px;width:580px;border-radius:16px;">
    <div style="font-size:20px;font-weight:700;margin-bottom:3px">${title}</div>
    <div style="font-size:11px;color:${C.muted};margin-bottom:16px">${new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
    <div style="height:3px;background:#2563eb;border-radius:2px;margin-bottom:16px"></div>
    ${body}
    <div style="text-align:center;font-size:10px;color:${C.muted};margin-top:14px">${footer}</div>
  </div>`;
}

async function _downloadImage(html, bg) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1';
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  showToast(currentLang === 'mr' ? 'प्रतिमा तयार होत आहे...' : 'Generating image...', 'default');
  try {
    const canvas = await html2canvas(wrap.firstElementChild, {
      scale: 3, backgroundColor: bg, useCORS: true, logging: false, allowTaint: true
    });
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = `Summary_${new Date().toLocaleDateString('en-GB').replace(/\//g, '-')}_${rnd()}.png`;
      a.click(); URL.revokeObjectURL(url);
      showToast(currentLang === 'mr' ? 'प्रतिमा डाउनलोड!' : 'Image downloaded!', 'success');
    }, 'image/png');
  } catch (err) {
    showToast('Image export failed', 'error');
  } finally {
    document.body.removeChild(wrap);
  }
}

// ── TOAST ──
let _tt = null;
function showToast(msg, type = 'default') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast';
  if (type === 'success') t.classList.add('toast-success');
  if (type === 'error') t.classList.add('toast-error');
  t.classList.remove('hidden');
  clearTimeout(_tt);
  _tt = setTimeout(() => t.classList.add('hidden'), 2800);
}

// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
  // Init expense row
  document.getElementById('expRows').appendChild(expMakeRow());
  // Init qty row
  document.getElementById('qtyRows').appendChild(qtyMakeRow());
  // Load saves
  expLoadSave();
  qtyLoadSave();
  catLoadSave();
  updateInputModes();
  applyLanguage();
  // catBudget input listener
  document.getElementById('catBudget').addEventListener('input', () => {
    catCalcDone = false;
    document.getElementById('catRemain').classList.add('hidden');
    catAutoSave();
  });
});

// ── CALCULATOR 3 — CATEGORY ──

// 👇 ADD HERE (top or bottom inside this section)
function catFillData(data) {
  if (!data || !data.categories) return;
  const mr = currentLang === 'mr';
  // Rebuild categories array from imported data
  categories = data.categories.map((cat, i) => ({
    id: 'cat_' + rnd(),
    name: cat.name || '',
    color: CAT_COLORS[i % CAT_COLORS.length],
    rows: (cat.items || []).map(item => ({
      title: item.title || '',
      amount: m2e(String(item.amount || ''))
    }))
  }));
  if (data.budget && data.budget !== '0') {
    document.getElementById('catBudget').value = mr ? e2m(String(data.budget)) : String(data.budget);
  }
  catRenderAll();
  document.getElementById('catRemain').classList.add('hidden');
  catCalcDone = false;
  catAutoSave();
}

function updateQtySubtotalLine(wrap) {
  const qty = rawNum(wrap.querySelector('.qty-input')?.value);
  const price = rawNum(wrap.querySelector('.amt-input')?.value);
  const subtotal = qty * price;
  const mr = currentLang === 'mr';

  let subEl = wrap.querySelector('.qty-subtotal-line');

  if (!subEl) {
    subEl = document.createElement('div');
    subEl.className = 'qty-subtotal-line empty';
    wrap.appendChild(subEl);
  }

  if (qty > 0 && price > 0) {
    const dispQty = mr ? e2m(commaNum(String(qty))) : commaNum(String(qty));
    const dispPrice = mr ? e2m(commaNum(String(price))) : commaNum(String(price));
    const dispSubtotal = mr ? e2m(commaNum(String(subtotal))) : commaNum(String(subtotal));
    subEl.textContent = `= ${dispQty} × ${dispPrice} = ₹${dispSubtotal}`;
    subEl.classList.remove('empty');
  } else {
    subEl.textContent = '';
    subEl.classList.add('empty');
  }
}


function triggerQtyImport() {
  showImportChoice('qty');
}

function triggerCatImport() {
  showImportChoice('cat');
}


function handleQtyImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  const mr = currentLang === 'mr';

  if (file.name.endsWith('.json')) {
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.sig !== QTY_SIG) {
          showToast(mr ? 'अवैध Qty JSON' : 'Invalid Qty JSON', 'error');
          return;
        }
        qtyFillData(data);
        showToast(mr ? 'Qty डेटा आयात झाला!' : 'Qty Data Imported!', 'success');
      } catch {
        showToast(mr ? 'अवैध फाइल!' : 'Invalid file!', 'error');
      }
    };
    reader.readAsText(file);
  } else if (file.name.endsWith('.pdf')) {
    qtyImportFromPDF(file);
  } else {
    showToast(mr ? 'फक्त PDF किंवा JSON' : 'Only PDF or JSON', 'error');
  }
}

function qtyFillData(data) {
  const container = document.getElementById('qtyRows');
  container.innerHTML = '';
  const mr = currentLang === 'mr';

  (data.rows || []).forEach(r => {
    const dispQty = r.qty ? (mr ? e2m(String(r.qty)) : String(r.qty)) : '';
    const dispPrice = r.price ? (mr ? e2m(String(r.price)) : String(r.price)) : '';
    const row = qtyMakeRow(r.title, dispQty, dispPrice);
    container.appendChild(row);
    updateQtySubtotalLine(row);
  });

  if (data.budget && data.budget !== '0') {
    const dispBudget = mr ? e2m(String(data.budget)) : String(data.budget);
    document.getElementById('qtyBudget').value = dispBudget;
  }

  document.getElementById('qtyRemain').classList.add('hidden');
  qtyCalcDone = false;
  qtyGetTotal();
}

async function qtyImportFromPDF(file) {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText += content.items.map(item => item.str).join(' ');
    }

    if (!fullText.includes(QTY_SIG)) {
      showToast('Invalid Qty PDF', 'error');
      return;
    }

    // Extract JSON between markers
    const SM = `<<${QTY_SIG}>>`;
    const EM = `<<END>>`;
    const si = fullText.indexOf(SM);
    const ei = fullText.indexOf(EM);
    
    if (si === -1 || ei === -1) {
      showToast('PDF parsing failed', 'error');
      return;
    }
    
    const jsonStr = fullText.substring(si + SM.length, ei).trim();
    const data = JSON.parse(jsonStr);

    qtyFillData(data);
    showToast('Qty PDF Imported!', 'success');

  } catch (err) {
    showToast('PDF parsing failed: ' + err.message, 'error');
  }
}

function handleCatImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  const mr = currentLang === 'mr';

  if (file.name.endsWith('.json')) {
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.sig !== CAT_SIG) {
          showToast(mr ? 'अवैध श्रेणी JSON' : 'Invalid Category JSON', 'error');
          return;
        }
        catFillData(data);
        showToast(mr ? 'श्रेणी आयात झाली!' : 'Category Imported!', 'success');
      } catch {
        showToast(mr ? 'अवैध फाइल!' : 'Invalid file!', 'error');
      }
    };
    reader.readAsText(file);
  } else if (file.name.endsWith('.pdf')) {
    catImportFromPDF(file);
  } else {
    showToast(mr ? 'फक्त PDF किंवा JSON' : 'Only PDF or JSON', 'error');
  }
}

async function catImportFromPDF(file) {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText += content.items.map(item => item.str).join(' ');
    }

    if (!fullText.includes(CAT_SIG)) {
      showToast('Invalid Category PDF', 'error');
      return;
    }

    // Extract JSON between markers
    const SM = `<<${CAT_SIG}>>`;
    const EM = `<<END>>`;
    const si = fullText.indexOf(SM);
    const ei = fullText.indexOf(EM);
    
    if (si === -1 || ei === -1) {
      showToast('PDF parsing failed', 'error');
      return;
    }
    
    const jsonStr = fullText.substring(si + SM.length, ei).trim();
    const data = JSON.parse(jsonStr);

    catFillData(data);
    showToast('Category PDF Imported!', 'success');

  } catch (err) {
    showToast('PDF parsing failed: ' + err.message, 'error');
  }
}
// ────────────────────────────────────────────
// ── CALCULATOR 4 — BASIC CALCULATOR ──
// ────────────────────────────────────────────
(function() {
  let bcCurrent  = '0';   // what's shown on display
  let bcPrev     = '';    // previous operand (string)
  let bcOp       = '';    // pending operator
  let bcExpr     = '';    // expression string for top display
  let bcJustEq   = false; // did we just press =?
  let bcNewInput = false; // next digit should start fresh (after op or =)
  let bcHistory  = [];    // [{expr, result}]
  let bcOpActive = null;  // currently highlighted op button

  const MR_DIGITS = {'0':'०','1':'१','2':'२','3':'३','4':'४','5':'५','6':'६','7':'७','8':'८','9':'९'};
  const EN_DIGITS = {'०':'0','१':'1','२':'2','३':'3','४':'4','५':'5','६':'6','७':'7','८':'8','९':'9'};

  function bcToEN(s) { return String(s).replace(/[०-९]/g, c => EN_DIGITS[c] || c); }
  function bcToMR(s) { return String(s).replace(/[0-9]/g, c => MR_DIGITS[c] || c); }
  function bcLocalize(s) {
    const mr = currentLang === 'mr';
    return mr ? bcToMR(String(s)) : String(s);
  }

  function bcUpdateDisplay() {
    const valEl  = document.getElementById('basicCalcVal');
    const exprEl = document.getElementById('basicCalcExpr');
    if (!valEl) return;
    valEl.textContent  = bcLocalize(bcCurrent);
    exprEl.textContent = bcLocalize(bcExpr);
    // highlight active op button
    document.querySelectorAll('.bc-op').forEach(b => b.classList.remove('bc-op-active'));
    if (bcOp && !bcJustEq) {
      document.querySelectorAll('.bc-op').forEach(b => {
        if (b.textContent.trim() === bcOp) b.classList.add('bc-op-active');
      });
    }
  }

  function bcApplyOp(a, op, b) {
    a = parseFloat(a); b = parseFloat(b);
    if (op === '+') return a + b;
    if (op === '−') return a - b;
    if (op === '×') return a * b;
    if (op === '÷') return b === 0 ? 'Error' : a / b;
    return b;
  }

  function bcFormat(n) {
    if (n === 'Error') return 'Error';
    // trim floating point noise
    let s = parseFloat(n.toPrecision(12));
    return String(s);
  }

 window.bcAction = function(type, val) {
  switch(type) {

    case 'clear':
      bcCurrent = '0';
      bcPrev = '';
      bcOp = '';
      bcExpr = '';
      bcJustEq = false;
      bcNewInput = false;
      break;

    case 'sign':
      if (bcCurrent !== '0' && bcCurrent !== 'Error') {
        bcCurrent = bcCurrent.startsWith('-') 
          ? bcCurrent.slice(1) 
          : '-' + bcCurrent;
      }
      break;

    case 'pct':
      if (bcCurrent !== 'Error') {
        bcCurrent = bcFormat(parseFloat(bcCurrent) / 100);
      }
      break;

    case 'num':
      if (bcCurrent === 'Error') {
        bcCurrent = val;
        break;
      }

      if (bcJustEq) {
        bcCurrent = val;
        bcJustEq = false;
        bcExpr = '';
        break;
      }

      if (bcNewInput) {   // 🔥 FIX
        bcCurrent = val;
        bcNewInput = false;
        break;
      }

      if (bcCurrent === '0' || bcCurrent === '-0') {
        bcCurrent = (bcCurrent === '-0' ? '-' : '') + val;
      } else if (bcCurrent.length < 15) {
        bcCurrent += val;
      }
      break;

    case 'dot':
      if (bcJustEq) {
        bcCurrent = '0.';
        bcJustEq = false;
        bcExpr = '';
        break;
      }

      if (bcNewInput) {   // 🔥 important
        bcCurrent = '0.';
        bcNewInput = false;
        break;
      }

      if (!bcCurrent.includes('.')) {
        bcCurrent += '.';
      }
      break;

    case 'op':
      if (bcCurrent === 'Error') break;

      if (bcOp && bcPrev !== '' && !bcJustEq) {
        // chain operations
        const res = bcApplyOp(bcPrev, bcOp, bcCurrent);
        if (res === 'Error') {
          bcCurrent = 'Error';
          bcPrev = '';
          bcOp = '';
          bcExpr = '';
          break;
        }
        bcCurrent = bcFormat(res);
      }

      bcPrev = bcCurrent;
      bcOp = val;
      bcJustEq = false;
      bcNewInput = true; // 🔥 MAIN FIX
      bcExpr = bcCurrent + ' ' + val;
      break;

    case 'eq':
      if (!bcOp || bcPrev === '') break;

      const a = bcPrev;
      const b = bcCurrent;
      const op = bcOp;

      const res = bcApplyOp(a, op, b);
      const fullExpr = a + ' ' + op + ' ' + b + ' =';

      if (res === 'Error') {
        bcCurrent = 'Error';
      } else {
        bcCurrent = bcFormat(res);

        // history
        bcHistory.unshift({ expr: fullExpr, result: bcCurrent });
        if (bcHistory.length > 30) bcHistory.pop();
        bcRenderHistory();
      }

      bcExpr = fullExpr;
      bcPrev = '';
      bcOp = '';
      bcJustEq = true;
      bcNewInput = true; // 🔥 important
      break;
  }

  bcUpdateDisplay();
};

  function bcRenderHistory() {
    const mr = currentLang === 'mr';
    const el = document.getElementById('basicCalcHistory');
    const empty = document.getElementById('bcHistEmpty');
    if (!el) return;
    if (bcHistory.length === 0) {
      if (empty) empty.style.display = '';
      // remove rows
      el.querySelectorAll('.bc-history-row').forEach(r => r.remove());
      return;
    }
    if (empty) empty.style.display = 'none';
    el.querySelectorAll('.bc-history-row').forEach(r => r.remove());
    bcHistory.forEach(h => {
      const row = document.createElement('div');
      row.className = 'bc-history-row';
      row.innerHTML = `<span class="bc-history-expr">${bcLocalize(h.expr)}</span><span class="bc-history-result">${bcLocalize(h.result)}</span>`;
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => {
        bcCurrent = h.result; bcPrev = ''; bcOp = ''; bcJustEq = false; bcExpr = '';
        bcUpdateDisplay();
      });
      el.appendChild(row);
    });
  }

  window.bcClearHistory = function() {
    bcHistory = []; bcRenderHistory();
  };

  // Re-localize display when language changes
  const _origApply = window.applyLanguage;
  window.applyLanguage = function() {
    _origApply && _origApply();
    // relabel digit buttons
    const mr = currentLang === 'mr';
    document.querySelectorAll('#basicCalcGrid .bc-btn[data-mr]').forEach(b => {
      const key = b.getAttribute(mr ? 'data-mr' : 'data-en');
      if (key) b.textContent = key;
    });
    bcUpdateDisplay();
    bcRenderHistory();
    // relabel history empty text
    const empty = document.getElementById('bcHistEmpty');
    if (empty) empty.textContent = mr ? 'अद्याप कोणतेही गणना नाही' : 'No calculations yet';
  };

  // init on load
  document.addEventListener('DOMContentLoaded', function() {
    bcUpdateDisplay();
  });
})();
