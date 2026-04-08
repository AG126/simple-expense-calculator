/* ============================================================
   EXPENSE CALCULATOR — main.js  v4
   ============================================================ */

// ── CONSTANTS ──
const APP_SIGNATURE = 'EXPCALC_V1';
const LS_KEY        = 'expense_autosave';

// ── STATE ──
let currentLang       = 'en';
let expenseArray      = [];
let am = 0, ex = 0, rem = 0;
let calculateDone     = false;   // true only after Calculate button is pressed
let activeAmountInput = null;
let importedFileId    = null;
let importedFileType  = null;

// ── MARATHI MAPS ──
const M2E = {'०':'0','१':'1','२':'2','३':'3','४':'4','५':'5','६':'6','७':'7','८':'8','९':'9'};
const E2M = {'0':'०','1':'१','2':'२','3':'३','4':'४','5':'५','6':'६','7':'७','8':'८','9':'९'};
const m2e = s => String(s).replace(/[०-९]/g, c => M2E[c]||c);
const e2m = s => String(s).replace(/[0-9]/g,  c => E2M[c]||c);

// ── HELPERS ──
function isNum(v){ return typeof v==='number' && isFinite(v) && !isNaN(v); }
function rnd(){ return Math.random().toString(36).substr(2,6).toUpperCase(); }
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function commaNum(amount) {
  let minus=false, frac='';
  amount = String(amount);
  if(amount[0]==='-'){minus=true;amount=amount.slice(1);}
  const d=amount.indexOf('.');
  if(d!==-1){frac=amount.slice(d);amount=amount.slice(0,d);}
  const ch=[...amount]; let cnt=0;
  for(let i=ch.length-1;i>=0;i--){
    cnt++;
    if(cnt===3&&ch.length>3)ch.splice(i,0,',');
    else if(cnt===5&&ch.length>6)ch.splice(i,0,',');
    else if(cnt===7&&ch.length>9)ch.splice(i,0,',');
  }
  return (minus?'-':'')+ch.join('')+frac;
}

// ── LANGUAGE ──
// function toggleLanguage() {
//   currentLang = currentLang==='en' ? 'mr' : 'en';
//   applyLanguage();
//   updateInputModes();
//   autoSave();
// }
function toggleLanguage() {
  currentLang = currentLang === 'en' ? 'mr' : 'en';

  applyLanguage();
  updateInputModes();

  // refresh expense field
  getExpense();

  // refresh amount input value
  const amountInput = document.getElementById('amount');
  const expenseInput = document.getElementById('expense');

  if (amountInput.value) {
    const val = m2e(amountInput.value);
    amountInput.value =
      currentLang === 'mr' ? e2m(val) : val;
  }

  if (expenseInput.value) {
    const val = m2e(expenseInput.value);
    expenseInput.value =
      currentLang === 'mr' ? e2m(val) : val;
  }

  // refresh remaining
  if (calculateDone) {
    const remEl = document.getElementById('remain');
    const rs = commaNum(String(rem));

    remEl.textContent =
      currentLang === 'mr'
        ? 'शिल्लक: ₹' + e2m(rs)
        : 'Remaining: ₹' + rs;
  }

  autoSave();
}



function applyLanguage() {
  const mr = currentLang==='mr';
  document.getElementById('langLabel').textContent = mr ? 'English' : 'मराठी';
  document.querySelectorAll('[data-en]').forEach(el => {
    el.textContent = mr ? (el.dataset.mr||el.dataset.en) : el.dataset.en;
  });
  document.querySelectorAll('[data-ph-en]').forEach(el => {
    el.placeholder = mr ? el.dataset.phMr : el.dataset.phEn;
  });
}

function updateInputModes() {
  const mr = currentLang==='mr';
  document.querySelectorAll('.amount-input, #amount, #expense').forEach(inp => {
    if(mr){
      inp.setAttribute('readonly','');
      inp.setAttribute('inputmode','none');
    } else {
      inp.removeAttribute('readonly');
      inp.setAttribute('inputmode','decimal');
    }
  });
  document.querySelectorAll('.title-input').forEach(inp => {
    inp.removeAttribute('readonly');
    inp.setAttribute('inputmode','text');
  });
  if(!mr) closeMarathiKeypad();
}

// ── MARATHI KEYPAD ──
let keypadOpen = false;

function openMarathiKeypad(inputEl) {
  if(currentLang !== 'mr') return;
  activeAmountInput = inputEl;
  const label = inputEl.closest('.summary-field')?.querySelector('label')?.textContent
    || inputEl.closest('.input-row')?.querySelector('.title-input')?.placeholder
    || '';
  document.getElementById('keypadActiveLabel').textContent =
    (currentLang==='mr' ? 'रक्कम: ' : 'Amount: ') + (label || '—');

  const kp = document.getElementById('marathiKeypad');
  kp.classList.remove('hidden');
  requestAnimationFrame(() => {
    const h = kp.offsetHeight;
    document.documentElement.style.setProperty('--keypad-h', h+'px');
    kp.classList.add('keypad-visible');
    document.body.classList.add('keypad-open');
    keypadOpen = true;
    setTimeout(()=>{ inputEl.scrollIntoView({behavior:'smooth', block:'center'}); }, 250);
  });
  document.querySelectorAll('.form-input').forEach(i=>i.classList.remove('active-input'));
  inputEl.classList.add('active-input');
}

function closeMarathiKeypad() {
  const kp = document.getElementById('marathiKeypad');
  kp.classList.remove('keypad-visible');
  document.body.classList.remove('keypad-open');
  keypadOpen = false;
  document.querySelectorAll('.form-input').forEach(i=>i.classList.remove('active-input'));
  setTimeout(()=>{ if(!keypadOpen) kp.classList.add('hidden'); }, 240);
}

document.addEventListener('click', function(e) {
  if(currentLang !== 'mr') return;
  const inp = e.target;
  if(inp.classList.contains('amount-input') || inp.id==='amount' || inp.id==='expense') {
    e.preventDefault();
    openMarathiKeypad(inp);
  }
});

document.addEventListener('touchstart', function(e) {
  if(currentLang !== 'mr') return;
  const inp = e.target;
  if(inp.classList.contains('amount-input') || inp.id==='amount' || inp.id==='expense') {
    inp.blur();
  }
}, {passive:true});

document.addEventListener('click', function(e) {
  if(!keypadOpen) return;
  const kp = document.getElementById('marathiKeypad');
  const isInput = e.target.classList.contains('amount-input') || e.target.id==='amount' || e.target.id==='expense';
  const inKeypad = kp.contains(e.target);
  if(!isInput && !inKeypad) closeMarathiKeypad();
});

function insertMarathiNum(char) {
  if(!activeAmountInput) return;
  const pos = activeAmountInput.selectionStart || activeAmountInput.value.length;
  const end = activeAmountInput.selectionEnd  || pos;
  const val = activeAmountInput.value;
  if(char==='.' && val.includes('.')) return;
  activeAmountInput.value = val.slice(0, pos) + char + val.slice(end);
  const np = pos+1;
  try{ activeAmountInput.setSelectionRange(np,np); }catch(e){}
  activeAmountInput.dispatchEvent(new Event('input',{bubbles:true}));
}

function marathiBackspace() {
  if(!activeAmountInput) return;
  const val = activeAmountInput.value;
  const pos = activeAmountInput.selectionStart || val.length;
  const end = activeAmountInput.selectionEnd  || pos;
  if(pos===0 && end===0) return;
  if(pos!==end){
    activeAmountInput.value = val.slice(0,pos)+val.slice(end);
    try{activeAmountInput.setSelectionRange(pos,pos);}catch(e){}
  } else {
    activeAmountInput.value = val.slice(0,pos-1)+val.slice(pos);
    try{activeAmountInput.setSelectionRange(pos-1,pos-1);}catch(e){}
  }
  activeAmountInput.dispatchEvent(new Event('input',{bubbles:true}));
}

document.addEventListener('input', function(e) {
  const t = e.target;
  if((t.classList.contains('amount-input')||t.id==='amount'||t.id==='expense') && currentLang==='en') {
    let v = t.value.replace(/[^0-9.]/g,'');
    const parts = v.split('.');
    if(parts.length>2) v = parts[0]+'.'+parts.slice(1).join('');
    if(t.value !== v) t.value = v;
  }
});

// ── ROW MANAGEMENT ──
function makeRow(title='', amount='') {
  const div = document.createElement('div');
  div.className='input-row';
  const amAttr = currentLang==='mr' ? 'readonly' : '';
  const imAttr  = currentLang==='mr' ? 'none'    : 'decimal';
  div.innerHTML = `
    <input type="text" class="form-input title-input"
           placeholder="${currentLang==='mr'?'शीर्षक':'Title'}"
           data-ph-en="Title" data-ph-mr="शीर्षक" value="${esc(title)}">
    <div class="amount-wrap">
      <input type="text" class="form-input amount-input"
             placeholder="${currentLang==='mr'?'०':'0'}"
             inputmode="${imAttr}" ${amAttr}
             data-ph-en="0" data-ph-mr="०" value="${esc(amount)}">
      <span class="currency-badge">₹</span>
    </div>`;
  return div;
}

function addInputRow()    { document.getElementById('inputRows').appendChild(makeRow()); getExpense(); }
function removeInputRow() {
  const c=document.getElementById('inputRows');
  if(c.children.length>1) c.removeChild(c.lastElementChild);
  getExpense();
}

function resetIp() {
  const c=document.getElementById('inputRows');
  c.innerHTML=''; c.appendChild(makeRow());
  document.getElementById('expense').value='';
  document.getElementById('amount').value='';
  const es=document.getElementById('expenseShow');
  es.textContent='—'; es.dataset.rawValue='';
  const remEl=document.getElementById('remain');
  remEl.classList.add('hidden'); remEl.textContent='';
  importedFileId   = null;
  importedFileType = null;
  calculateDone    = false;   // FIX: reset calculate flag
  am = 0; ex = 0; rem = 0;
  document.getElementById('saveOptionsBar').classList.add('hidden');
  expenseArray=[];
  closeMarathiKeypad();
  getExpense(); autoSave();
  showToast(currentLang==='mr'?'रीसेट झाले!':'Reset!');
}

// ── EXPENSE CALCULATION ──
document.getElementById('inputRows').addEventListener('input', e => {
  if(e.target.tagName==='INPUT') {
    calculateDone = false;  // FIX: any edit invalidates previous calculate
    getExpense(); autoSave();
  }
});

// function getExpense() {
//   let add=0;
//   document.querySelectorAll('#inputRows .amount-input').forEach(ip => {
//     const v=parseFloat(m2e(ip.value));
//     if(isNum(v)) add+=v;
//   });
//   const es=document.getElementById('expenseShow');
//   if(add>0){
//     es.dataset.rawValue=add;
//     es.textContent=(currentLang==='mr'?'+ ₹'+e2m(commaNum(String(add))):'+ ₹'+commaNum(String(add)));
//     document.getElementById('expense').value=add;
//   } else {
//     es.dataset.rawValue=''; es.textContent='—';
//   }
// }

function getExpense() {
  let add = 0;

  document.querySelectorAll('#inputRows .amount-input').forEach(ip => {
    const v = parseFloat(m2e(ip.value));
    if (isNum(v)) add += v;
  });

  const es = document.getElementById('expenseShow');
  const expenseInput = document.getElementById('expense');

  if (add > 0) {
    es.dataset.rawValue = add;

    const formattedDisplay =
      currentLang === 'mr'
        ? e2m(commaNum(String(add)))
        : commaNum(String(add));

    const formattedInput =
      currentLang === 'mr'
        ? e2m(String(add))
        : String(add);

    es.textContent = '+ ₹' + formattedDisplay;

    // IMPORTANT FIX
    expenseInput.value = formattedInput;
  } else {
    es.dataset.rawValue = '';
    es.textContent = '—';
    expenseInput.value = '';
  }
}
function getExpense() {
  let add = 0;

  document.querySelectorAll('#inputRows .amount-input').forEach(ip => {
    const v = parseFloat(m2e(ip.value));
    if (isNum(v)) add += v;
  });

  const es = document.getElementById('expenseShow');
  const expenseInput = document.getElementById('expense');

  if (add > 0) {
    es.dataset.rawValue = add;

    // FIX value rendering by language
    const formatted =
      currentLang === 'mr'
        ? e2m(commaNum(String(add)))
        : commaNum(String(add));

    es.textContent = '+ ₹' + formatted;

    // IMPORTANT: input value also update in Marathi
    expenseInput.value =
      currentLang === 'mr'
        ? e2m(String(add))
        : String(add);
  } else {
    es.dataset.rawValue = '';
    es.textContent = '—';
    expenseInput.value = '';
  }
}

// ── CALCULATE ──
function calculate() {
  const rawAm = m2e(document.getElementById('amount').value);
  const rawEx = m2e(document.getElementById('expense').value);

  am = parseFloat(rawAm); ex = parseFloat(rawEx);
  if(!isNum(am)||am<=0){ showToast(currentLang==='mr'?'रक्कम टाका':'Enter your amount','error'); return; }
  if(!isNum(ex)||ex<=0){ showToast(currentLang==='mr'?'खर्च टाका':'Enter expenses','error'); return; }
  rem = am - ex;
  calculateDone = true;   // FIX: mark that calculate was pressed
  const remEl = document.getElementById('remain');
  remEl.classList.remove('hidden');
  const rs = commaNum(String(rem));
  remEl.textContent = currentLang==='mr' ? 'शिल्लक: ₹'+e2m(rs) : 'Remaining: ₹'+rs;
  if(rem<0){
    remEl.style.cssText='background:var(--danger-bg);color:var(--danger);border:1.5px solid var(--danger)';
  } else {
    remEl.style.cssText='background:var(--success-bg);color:var(--success);border:1.5px solid var(--success)';
  }
  expenseArray=allCalList(); dynamicTable(expenseArray);
  populateModal();
  document.getElementById('resultModal').classList.remove('hidden');
  closeMarathiKeypad();
  autoSave();
}

function showModal() {
  expenseArray=allCalList(); dynamicTable(expenseArray);
  const amV=parseFloat(m2e(document.getElementById('amount').value))||0;
  const exV=parseFloat(m2e(document.getElementById('expense').value))||0;
  am=amV; ex=exV; rem=amV-exV;
  populateModal();
  document.getElementById('resultModal').classList.remove('hidden');
}

function populateModal() {
  const fmt = v => currentLang==='mr' ? '₹'+e2m(commaNum(String(v))) : '₹'+commaNum(String(v));
  document.getElementById('M_amount').textContent  = fmt(am);
  document.getElementById('M_expense').textContent = fmt(ex);
  document.getElementById('M_remain').textContent  = fmt(rem);
  document.getElementById('totalex').textContent   = currentLang==='mr'?e2m(String(ex)):String(ex);
  document.getElementById('modalDate').textContent = new Date().toLocaleDateString();
}

function closeModal()    { document.getElementById('resultModal').classList.add('hidden'); }
function handleModalClick(e){ if(e.target.id==='resultModal') closeModal(); }

function allCalList() {
  const rows=[];
  document.querySelectorAll('#inputRows .input-row').forEach(row=>{
    const t=row.querySelector('.title-input')?.value||'';
    const a=m2e(row.querySelector('.amount-input')?.value||'');
    if(t||a) rows.push({Title:t,Amount:a});
  });
  return rows;
}

function dynamicTable(arr) {
  const tb=document.querySelector('#myTable tbody');
  tb.innerHTML='';
  arr.forEach((obj,i)=>{
    if(!obj.Title&&!obj.Amount) return;
    const tr=document.createElement('tr');
    const da=obj.Amount?(currentLang==='mr'?e2m(obj.Amount):obj.Amount):'—';
    tr.innerHTML=`<td>${i+1}</td><td>${esc(obj.Title||'—')}</td><td>₹${da}</td>`;
    tb.appendChild(tr);
  });
}

// ── AUTO SAVE ──
function autoSave() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      sig:APP_SIGNATURE, lang:currentLang,
      theme:document.documentElement.getAttribute('data-theme'),
      amount:document.getElementById('amount').value,
      expense:document.getElementById('expense').value,
      rows:allCalList(), savedAt:new Date().toISOString()
    }));
  } catch(e){}
}

function loadAutoSave() {
  try {
    const raw=localStorage.getItem(LS_KEY);
    if(raw) { const d=JSON.parse(raw); if(d.sig===APP_SIGNATURE) fillFromData(d); }
  } catch(e){}
}

function fillFromData(data) {
  if (!data) return;

  if (data.theme) {
    document.documentElement.setAttribute("data-theme", data.theme);
    document.getElementById("themeIcon").textContent =
      data.theme === "dark" ? "☀️" : "🌙";
  }

  if (data.lang) {
    currentLang = data.lang;
    applyLanguage();
  }

  const amountEl = document.getElementById("amount");
  const expenseEl = document.getElementById("expense");
  const remainEl = document.getElementById("remain");

  if (data.amount) amountEl.value = data.amount;
  if (data.expense) expenseEl.value = data.expense;

  if (data.rows?.length) {
    const c = document.getElementById("inputRows");
    c.innerHTML = "";

    data.rows.forEach((r) =>
      c.appendChild(makeRow(r.Title || "", r.Amount || ""))
    );

    getExpense();
  }

  // restore numeric state
  am = parseFloat(data.amount) || 0;
  ex = parseFloat(data.expense) || 0;

  // IMPORTANT FIX
  rem =
    data.remaining !== undefined
      ? parseFloat(data.remaining)
      : am - ex;

  // show remaining after import
  if (!isNaN(rem)) {
    calculateDone = true;
    remainEl.classList.remove("hidden");

    const rs = commaNum(String(rem));

    remainEl.textContent =
      currentLang === "mr"
        ? "शिल्लक: ₹" + e2m(rs)
        : "Remaining: ₹" + rs;

    if (rem < 0) {
      remainEl.style.cssText =
        "background:var(--danger-bg);color:var(--danger);border:1.5px solid var(--danger)";
    } else {
      remainEl.style.cssText =
        "background:var(--success-bg);color:var(--success);border:1.5px solid var(--success)";
    }
  } else {
    calculateDone = false;
    remainEl.classList.add("hidden");
  }

  updateInputModes();
}

// ── THEME ──
function toggleTheme() {
  const dark=document.documentElement.getAttribute('data-theme')==='dark';
  document.documentElement.setAttribute('data-theme', dark?'light':'dark');
  document.getElementById('themeIcon').textContent=dark?'🌙':'☀️';
  autoSave();
}

// ── JSON EXPORT ──
function exportJSON() {
  const data={
    sig:APP_SIGNATURE, lang:currentLang,
    theme:document.documentElement.getAttribute('data-theme'),
    amount:document.getElementById('amount').value,
    expense:document.getElementById('expense').value,
    rows:allCalList(), fileId:rnd(),
    exportedAt:new Date().toISOString()
  };
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=`Expense_${new Date().toLocaleDateString('en-GB').replace(/\//g,'-')}_${data.fileId}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(currentLang==='mr'?'JSON जतन झाले!':'JSON saved!','success');
}

// ── IMPORT HANDLER ──
function triggerImport() {
  document.getElementById('importFileInput').value='';
  document.getElementById('importFileInput').click();
}

function handleImport(e) {
  const file=e.target.files[0];
  if(!file) return;

  if(file.name.endsWith('.json')) {
    const reader=new FileReader();
    reader.onload=ev=>{
      try {
        const data=JSON.parse(ev.target.result);
        if(data.sig !== APP_SIGNATURE) {
          showToast(currentLang==='mr'?'हे आमचे JSON नाही!':'Not our app\'s JSON file!','error');
          return;
        }
        importedFileId   = data.fileId || null;
        importedFileType = 'json';
        fillFromData(data);
        document.getElementById('saveOptionsBar').classList.remove('hidden');
        showToast(currentLang==='mr'?'डेटा लोड झाला!':'Data imported!','success');
      } catch(err) {
        showToast(currentLang==='mr'?'अवैध फाईल!':'Invalid file!','error');
      }
    };
    reader.readAsText(file);
  } else if(file.name.endsWith('.pdf')) {
    importFromPDF(file);
  } else {
    showToast(currentLang==='mr'?'फक्त PDF किंवा JSON':'Only PDF or JSON files','error');
  }
}

async function importFromPDF(file) {
  showToast(currentLang === 'mr' ? 'PDF वाचत आहे...' : 'Reading PDF...', 'default');
  try {
    const pdfjsLib = window['pdfjs-dist/build/pdf'];
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const startMarker = `<<${APP_SIGNATURE}>>`;
    const endMarker   = `<<END>>`;

    let jsonString = null;
    try {
      const meta = await pdf.getMetadata();
      const subject = meta?.info?.Subject || '';
      const si = subject.indexOf(startMarker);
      const ei = subject.indexOf(endMarker);
      if (si !== -1 && ei !== -1) {
        jsonString = subject.substring(si + startMarker.length, ei).trim();
      }
    } catch (e) {
      console.warn('Metadata read failed, trying text fallback:', e);
    }

    if (!jsonString) {
      let allText = '';
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const tc   = await page.getTextContent();
        allText += tc.items.map(i => i.str).join('') + ' ';
      }
      const si = allText.indexOf(startMarker);
      const ei = allText.indexOf(endMarker);
      if (si !== -1 && ei !== -1) {
        jsonString = allText.substring(si + startMarker.length, ei).trim();
      }
    }

    if (!jsonString) {
      showToast(
        currentLang === 'mr' ? 'हे आमच्या अ‍ॅपचे PDF नाही!' : 'This PDF was not generated by this app!',
        'error'
      );
      return;
    }

    let data;
    try {
      data = JSON.parse(jsonString);
    } catch (err) {
      showToast(currentLang === 'mr' ? 'PDF डेटा खराब आहे!' : 'Corrupted PDF data!', 'error');
      return;
    }

    if (data.sig !== APP_SIGNATURE) {
      showToast(currentLang === 'mr' ? 'अवैध PDF!' : 'Invalid app PDF!', 'error');
      return;
    }

    importedFileId   = data.fileId || null;
    importedFileType = 'pdf';
    fillFromData(data);
    document.getElementById('saveOptionsBar').classList.remove('hidden');
    showToast(
      currentLang === 'mr' ? 'PDF मधून डेटा लोड झाला!' : 'PDF imported successfully!',
      'success'
    );
  } catch (err) {
    console.error('PDF import error:', err);
    showToast(currentLang === 'mr' ? 'PDF वाचता आले नाही!' : 'Could not read PDF!', 'error');
  }
}

// ── SAVE OPTIONS ──
function saveOverwrite() {
  // If original import was a PDF → overwrite as PDF
  if (importedFileType === 'pdf') {
    exportPDF();
    document.getElementById('saveOptionsBar').classList.add('hidden');
    return;
  }
  // Otherwise → save as JSON, keeping the original fileId
  const data = {
    sig:     APP_SIGNATURE,
    lang:    currentLang,
    theme:   document.documentElement.getAttribute('data-theme'),
    amount:  document.getElementById('amount').value,
    expense: document.getElementById('expense').value,
    rows:    allCalList(),
    fileId:  importedFileId || rnd(),   // FIX: keep original fileId
    savedAt: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `Expense_${data.fileId}.json`;  // FIX: no date prefix — same filename as original
  a.click();
  URL.revokeObjectURL(url);
  document.getElementById('saveOptionsBar').classList.add('hidden');
  showToast(currentLang === 'mr' ? 'अपडेट झाले!' : 'Updated & saved!', 'success');
}

function saveAsNew() {
  importedFileId   = null;
  importedFileType = null;
  //exportJSON();  
  exportUpdatedPDF(); // FIX: generates fresh fileId + date prefix — clean "new" file
  document.getElementById('saveOptionsBar').classList.add('hidden');
}

// ═══════════════════════════════════════════════════════
// PDF EXPORT
// ═══════════════════════════════════════════════════════
function exportPDF() {
  const curArr=allCalList();
  const amVal=parseFloat(m2e(document.getElementById('amount').value))||0;
  const exVal=parseFloat(m2e(document.getElementById('expense').value))||0;
  // FIX: only show Remaining if Calculate was actually pressed
  const remVal = calculateDone ? (amVal - exVal) : null;

  if(!curArr.length && amVal===0 && exVal===0){
    showToast(currentLang==='mr'?'डेटा टाका':'Enter data first','error'); return;
  }

  const payload = JSON.stringify({
    sig:APP_SIGNATURE,
    lang:currentLang,
    theme:document.documentElement.getAttribute('data-theme'),
    amount:String(amVal),
    expense:String(exVal),
    rows:curArr,
    fileId: importedFileId || rnd(),   // FIX: preserve fileId on overwrite
    exportedAt:new Date().toISOString()
  });
  const embedString = `<<${APP_SIGNATURE}>>${payload}<<END>>`;

  pdfMake.fonts = {
    Deva:{
      normal:'NotoSansDevanagari-Regular.ttf',
      bold:'NotoSansDevanagari-Regular.ttf',
      italics:'NotoSansDevanagari-Regular.ttf',
      bolditalics:'NotoSansDevanagari-Regular.ttf'
    }
  };

  const tableBody=[
    [
      {text:'#',              fillColor:'#2563eb',color:'#fff',bold:true,alignment:'center'},
      {text:currentLang==='mr'?'शीर्षक':'Title',fillColor:'#2563eb',color:'#fff',bold:true},
      {text:currentLang==='mr'?'रक्कम (₹)':'Amount (₹)',fillColor:'#2563eb',color:'#fff',bold:true,alignment:'right'}
    ]
  ];
  curArr.forEach((obj,i)=>{
    if(!obj.Title&&!obj.Amount) return;
    tableBody.push([
      {text:String(i+1),alignment:'center'},
      {text:obj.Title||'—'},
      {text:'₹ '+commaNum(String(obj.Amount||0)),alignment:'right'}
    ]);
  });
  tableBody.push([
    {text:currentLang==='mr'?'एकूण खर्च':'Total Expense',colSpan:2,bold:true,alignment:'center',fillColor:'#1e293b',color:'#fff'},
    {},
    {text:'₹ '+commaNum(String(exVal)),bold:true,alignment:'right',fillColor:'#1e293b',color:'#fff'}
  ]);

  // FIX: summary rows — Remaining row only added if calculateDone
  const summaryBody=[
    [
      {text:currentLang==='mr'?'रक्कम':'Amount',bold:true},
      {text:'₹ '+commaNum(String(amVal)),color:'#16a34a',bold:true,alignment:'right'}
    ],
    [
      {text:currentLang==='mr'?'एकूण खर्च':'Total Expense',bold:true},
      {text:'₹ '+commaNum(String(exVal)),color:'#dc2626',bold:true,alignment:'right'}
    ]
  ];
  if (remVal !== null) {
    summaryBody.push([
      {text:currentLang==='mr'?'शिल्लक रक्कम':'Remaining Money',bold:true,fillColor:'#1e293b',color:'#fff'},
      {text:'₹ '+commaNum(String(remVal)),bold:true,alignment:'right',fillColor:'#1e293b',color:'#fff'}
    ]);
  }

  const docDef = {
    pageSize:'A4',
    pageMargins:[40,50,40,50],
    info:{
      title:'Expense Summary',
      author:'Expense Calculator App',
      subject: embedString,
      creator:'ExpCalc'
    },
    defaultStyle:{ font:'Deva', fontSize:12 },
    content:[
      {text:currentLang==='mr'?'खर्चाचा सारांश':'Expense Summary',fontSize:22,bold:true,color:'#1e293b'},
      {text:new Date().toLocaleDateString('en-IN',{year:'numeric',month:'long',day:'numeric'}),fontSize:10,color:'#64748b',margin:[0,4,0,0]},
      {canvas:[{type:'line',x1:0,y1:0,x2:515,y2:0,lineWidth:2,lineColor:'#2563eb'}],margin:[0,14,0,14]},
      {
        table:{headerRows:1,widths:[30,'*',100],body:tableBody},
        layout:{
          hLineWidth:(i,n)=>(i===0||i===n.table.body.length)?1:.4,
          vLineWidth:()=>0,
          hLineColor:()=>'#e2e8f0',
          paddingLeft:()=>9,paddingRight:()=>9,paddingTop:()=>7,paddingBottom:()=>7,
          fillColor:(r)=>r===0?null:(r%2===0?'#f8fafc':null)
        },
        margin:[0,0,0,18]
      },
      {
        table:{widths:['*',120],body:summaryBody},
        layout:{
          hLineWidth:()=>.4,vLineWidth:()=>0,hLineColor:()=>'#e2e8f0',
          paddingLeft:()=>9,paddingRight:()=>9,paddingTop:()=>8,paddingBottom:()=>8
        },
        margin:[0,0,0,28]
      },
      {
        text: embedString,
        fontSize:1,
        color:'#ffffff',
        background:'#ffffff',
        margin:[0,0,0,0]
      },
      {
        text:currentLang==='mr'?'खर्च कॅल्क्युलेटर द्वारे तयार केले  |  फक्त या अ‍ॅपमधून आयात करता येते':'Generated by Expense Calculator  |  Can be re-imported into this app only',
        fontSize:8,color:'#94a3b8',alignment:'center',margin:[0,4,0,0]
      }
    ]
  };

  try {
    const fn='Expense_'+new Date().toLocaleDateString('en-GB').replace(/\//g,'-')+'_'+rnd();
    pdfMake.createPdf(docDef).download(fn+'.pdf');
    showToast(currentLang==='mr'?'PDF डाउनलोड होत आहे...':'PDF downloading...','success');
  } catch(err){
    console.error('PDF error:',err);
    showToast('PDF error: '+err.message,'error');
  }
}

// ═══════════════════════════════════════════════════════
// IMAGE EXPORT
// ═══════════════════════════════════════════════════════
async function exportImage() {
  const curArr=allCalList();
  const amVal=parseFloat(m2e(document.getElementById('amount').value))||0;
  const exVal=parseFloat(m2e(document.getElementById('expense').value))||0;
  // FIX: only show Remaining if Calculate was pressed
  const remVal = calculateDone ? (amVal - exVal) : null;

  if(!curArr.length&&amVal===0&&exVal===0){
    showToast(currentLang==='mr'?'डेटा टाका':'Enter data first','error'); return;
  }

  const dark = document.documentElement.getAttribute('data-theme')==='dark';
  const C={
    bg:    dark?'#1e293b':'#ffffff',
    text:  dark?'#f1f5f9':'#1a202c',
    muted: dark?'#94a3b8':'#64748b',
    bdr:   dark?'#334155':'#e2e8f0',
    alt:   dark?'#253148':'#f8fafc',
    suBg:  dark?'#14532d':'#f0fdf4',
    suTxt: '#16a34a',
    exBg:  dark?'#450a0a':'#fff1f2',
    exTxt: '#dc2626'
  };

  const rowsHtml = curArr.map((obj,i)=>{
    if(!obj.Title&&!obj.Amount) return '';
    const bg = i%2===0?C.alt:C.bg;
    const da = obj.Amount?(currentLang==='mr'?e2m(obj.Amount):obj.Amount):'—';
    return `<tr style="background:${bg}">
      <td style="padding:8px 10px;text-align:center;color:${C.muted};font-size:13px;border-bottom:1px solid ${C.bdr}">${i+1}</td>
      <td style="padding:8px 10px;color:${C.text};font-size:13px;border-bottom:1px solid ${C.bdr}">${esc(obj.Title||'—')}</td>
      <td style="padding:8px 10px;text-align:right;color:${C.text};font-size:13px;border-bottom:1px solid ${C.bdr}">₹ ${commaNum(String(obj.Amount||0))}</td>
    </tr>`;
  }).join('');

  // FIX: only render the Remaining row in the image if Calculate was pressed
  const remainingHtml = remVal !== null ? `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:13px 16px;background:#1e293b;border-top:1px solid ${C.bdr}">
      <span style="font-size:13px;color:#94a3b8">${currentLang==='mr'?'शिल्लक रक्कम':'Remaining Money'}</span>
      <strong style="font-size:15px;color:#fff">₹ ${commaNum(String(remVal))}</strong>
    </div>` : '';

  const html=`<div style="font-family:'Noto Sans Devanagari',Arial,sans-serif;background:${C.bg};color:${C.text};padding:32px;width:540px;border-radius:16px;">
    <div style="font-size:22px;font-weight:700;color:${C.text};margin-bottom:3px">${currentLang==='mr'?'खर्चाचा सारांश':'Expense Summary'}</div>
    <div style="font-size:11px;color:${C.muted};margin-bottom:18px">${new Date().toLocaleDateString('en-IN',{year:'numeric',month:'long',day:'numeric'})}</div>
    <div style="height:3px;background:#2563eb;border-radius:2px;margin-bottom:18px"></div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:18px">
      <thead>
        <tr style="background:#2563eb">
          <th style="padding:10px;text-align:center;color:#fff;font-size:12px;width:38px">#</th>
          <th style="padding:10px;text-align:left;color:#fff;font-size:12px">${currentLang==='mr'?'शीर्षक':'Title'}</th>
          <th style="padding:10px;text-align:right;color:#fff;font-size:12px">${currentLang==='mr'?'रक्कम (₹)':'Amount (₹)'}</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
      <tfoot>
        <tr style="background:#1e293b">
          <td colspan="2" style="padding:10px;text-align:center;color:#fff;font-weight:700;font-size:13px">${currentLang==='mr'?'एकूण खर्च':'Total Expense'}</td>
          <td style="padding:10px;text-align:right;color:#fff;font-weight:700;font-size:13px">₹ ${commaNum(String(exVal))}</td>
        </tr>
      </tfoot>
    </table>
    <div style="border:1px solid ${C.bdr};border-radius:10px;overflow:hidden">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:11px 16px;background:${C.suBg}">
        <span style="font-size:13px;color:${C.muted}">${currentLang==='mr'?'रक्कम':'Amount'}</span>
        <strong style="font-size:14px;color:${C.suTxt}">₹ ${commaNum(String(amVal))}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:11px 16px;background:${C.exBg};border-top:1px solid ${C.bdr}">
        <span style="font-size:13px;color:${C.muted}">${currentLang==='mr'?'एकूण खर्च':'Total Expense'}</span>
        <strong style="font-size:14px;color:${C.exTxt}">₹ ${commaNum(String(exVal))}</strong>
      </div>
      ${remainingHtml}
    </div>
    <div style="text-align:center;font-size:10px;color:${C.muted};margin-top:16px">${currentLang==='mr'?'खर्च कॅल्क्युलेटर द्वारे तयार केले':'Generated by Expense Calculator'}</div>
  </div>`;

  const wrap=document.createElement('div');
  wrap.style.cssText='position:fixed;left:-9999px;top:0;z-index:-1';
  wrap.innerHTML=html;
  document.body.appendChild(wrap);

  showToast(currentLang==='mr'?'प्रतिमा तयार होत आहे...':'Generating image...','default');

  try {
    const canvas=await html2canvas(wrap.firstElementChild,{
      scale:3, backgroundColor:C.bg, useCORS:true, logging:false, allowTaint:true
    });
    canvas.toBlob(blob=>{
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url;
      a.download=`Expense_${new Date().toLocaleDateString('en-GB').replace(/\//g,'-')}_${rnd()}.png`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(currentLang==='mr'?'प्रतिमा डाउनलोड!':'Image downloaded!','success');
    },'image/png');
  } catch(err){
    console.error('Image error:',err);
    showToast('Image export failed','error');
  } finally {
    document.body.removeChild(wrap);
  }
}

// ── TOAST ──
let _tt=null;
function showToast(msg,type='default'){
  const t=document.getElementById('toast');
  t.textContent=msg; t.className='toast';
  if(type==='success') t.classList.add('toast-success');
  if(type==='error')   t.classList.add('toast-error');
  t.classList.remove('hidden');
  clearTimeout(_tt); _tt=setTimeout(()=>t.classList.add('hidden'),2600);
}

// ── INIT ──
document.addEventListener('DOMContentLoaded',()=>{
  loadAutoSave();
  updateInputModes();
  document.getElementById('amount').addEventListener('input',  ()=>{getExpense();autoSave();});
  document.getElementById('expense').addEventListener('input', ()=>{getExpense();autoSave();});
});



// ---UPDATED EXPORT ---

function exportUpdatedPDF() {
  const curArr = allCalList();

  const amVal =
    parseFloat(m2e(document.getElementById("amount").value)) || 0;

  const exVal =
    parseFloat(m2e(document.getElementById("expense").value)) || 0;

  // FIX: always calculate remaining
  const remVal =
    calculateDone && !isNaN(amVal - exVal)
      ? amVal - exVal
      : amVal - exVal;

  if (!curArr.length && amVal === 0 && exVal === 0) {
    showToast(
      currentLang === "mr" ? "डेटा टाका" : "Enter data first",
      "error"
    );
    return;
  }

  const payload = JSON.stringify({
    sig: APP_SIGNATURE,
    lang: currentLang,
    theme: document.documentElement.getAttribute("data-theme"),
    amount: String(amVal),
    expense: String(exVal),
    remaining: String(remVal), // added
    rows: curArr,
    fileId: importedFileId || rnd(),
    exportedAt: new Date().toISOString()
  });

  const embedString = `<<${APP_SIGNATURE}>>${payload}<<END>>`;

  pdfMake.fonts = {
    Deva: {
      normal: "NotoSansDevanagari-Regular.ttf",
      bold: "NotoSansDevanagari-Regular.ttf",
      italics: "NotoSansDevanagari-Regular.ttf",
      bolditalics: "NotoSansDevanagari-Regular.ttf"
    }
  };

  const tableBody = [
    [
      {
        text: "#",
        fillColor: "#2563eb",
        color: "#fff",
        bold: true,
        alignment: "center"
      },
      {
        text: currentLang === "mr" ? "शीर्षक" : "Title",
        fillColor: "#2563eb",
        color: "#fff",
        bold: true
      },
      {
        text:
          currentLang === "mr"
            ? "रक्कम (₹)"
            : "Amount (₹)",
        fillColor: "#2563eb",
        color: "#fff",
        bold: true,
        alignment: "right"
      }
    ]
  ];

  curArr.forEach((obj, i) => {
    if (!obj.Title && !obj.Amount) return;

    tableBody.push([
      { text: String(i + 1), alignment: "center" },
      { text: obj.Title || "—" },
      {
        text: "₹ " + commaNum(String(obj.Amount || 0)),
        alignment: "right"
      }
    ]);
  });

  tableBody.push([
    {
      text:
        currentLang === "mr"
          ? "एकूण खर्च"
          : "Total Expense",
      colSpan: 2,
      bold: true,
      alignment: "center",
      fillColor: "#1e293b",
      color: "#fff"
    },
    {},
    {
      text: "₹ " + commaNum(String(exVal)),
      bold: true,
      alignment: "right",
      fillColor: "#1e293b",
      color: "#fff"
    }
  ]);

  // always include remaining
  const summaryBody = [
    [
      {
        text: currentLang === "mr" ? "रक्कम" : "Amount",
        bold: true
      },
      {
        text: "₹ " + commaNum(String(amVal)),
        color: "#16a34a",
        bold: true,
        alignment: "right"
      }
    ],
    [
      {
        text:
          currentLang === "mr"
            ? "एकूण खर्च"
            : "Total Expense",
        bold: true
      },
      {
        text: "₹ " + commaNum(String(exVal)),
        color: "#dc2626",
        bold: true,
        alignment: "right"
      }
    ],
    [
      {
        text:
          currentLang === "mr"
            ? "शिल्लक रक्कम"
            : "Remaining Money",
        bold: true,
        fillColor: "#1e293b",
        color: "#fff"
      },
      {
        text: "₹ " + commaNum(String(remVal)),
        bold: true,
        alignment: "right",
        fillColor: "#1e293b",
        color: "#fff"
      }
    ]
  ];

  const docDef = {
    pageSize: "A4",
    pageMargins: [40, 50, 40, 50],
    info: {
      title: "Updated Expense Summary",
      author: "Expense Calculator App",
      subject: embedString,
      creator: "ExpCalc"
    },
    defaultStyle: { font: "Deva", fontSize: 12 },
    content: [
      {
        text:
          currentLang === "mr"
            ? "खर्चाचा सारांश"
            : "Updated Expense Summary",
        fontSize: 22,
        bold: true,
        color: "#1e293b"
      },
      {
        text: new Date().toLocaleDateString("en-IN", {
          year: "numeric",
          month: "long",
          day: "numeric"
        }),
        fontSize: 10,
        color: "#64748b",
        margin: [0, 4, 0, 0]
      },
      {
        canvas: [
          {
            type: "line",
            x1: 0,
            y1: 0,
            x2: 515,
            y2: 0,
            lineWidth: 2,
            lineColor: "#2563eb"
          }
        ],
        margin: [0, 14, 0, 14]
      },
      {
        table: {
          headerRows: 1,
          widths: [30, "*", 100],
          body: tableBody
        },
        margin: [0, 0, 0, 18]
      },
      {
        table: {
          widths: ["*", 120],
          body: summaryBody
        },
        margin: [0, 0, 0, 28]
      },
      {
        text: embedString,
        fontSize: 1,
        color: "#ffffff"
      }
    ]
  };

  try {
    const now = new Date();

    const fileName =
      "updated_expense_" +
      now.getFullYear() +
      "-" +
      String(now.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(now.getDate()).padStart(2, "0") +
      "_" +
      String(now.getHours()).padStart(2, "0") +
      "-" +
      String(now.getMinutes()).padStart(2, "0") +
      "-" +
      String(now.getSeconds()).padStart(2, "0");

    pdfMake.createPdf(docDef).download(fileName + ".pdf");

    showToast(
      currentLang === "mr"
        ? "PDF डाउनलोड होत आहे..."
        : "Updated PDF downloading...",
      "success"
    );
  } catch (err) {
    console.error("PDF error:", err);

    showToast("PDF error: " + err.message, "error");
  }
}