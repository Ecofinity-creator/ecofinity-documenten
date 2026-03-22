// ══════════════════════════════════════════════════
// CONFIGURATIE — pas deze waarden aan
// ══════════════════════════════════════════════════
const SHEET_ID    = '15AwVlEBf_K2d9S8lSdHO1hnf_nHtsly2LDArv1oqo2s';
const ACCESS_CODE = 'ecofinity2025'; // ← Verander dit naar jouw eigen code!

// Google Apps Script URL — stap 2 (zie instructies onderaan)
// Laat leeg ('') als je dit nog niet hebt ingesteld
const SCRIPT_URL  = '';
// ══════════════════════════════════════════════════

const CSV_URL = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/export?format=csv&gid=0';

let docs = [], activeFilter = '', currentQrUrl = '', editingId = null, deleteId = null, isUnlocked = false;

const CAT_ICONS = { 'Handleidingen':'📋','HVAC':'🌡️','Elektriciteit':'⚡','Zonne-energie':'☀️','Waterbehandeling':'💧','Ventilatie':'🌬️','Overige':'🔧' };
const catSlug = c => c.toLowerCase().replace(/[^a-z]/g,'');

// TOEGANGSCODE
function checkCode() {
  const v = document.getElementById('accessCodeInput').value.trim();
  if (v === ACCESS_CODE) {
    isUnlocked = true;
    document.getElementById('accessBanner').classList.add('unlocked');
    document.getElementById('accessBadge').classList.add('unlocked');
    document.getElementById('accessBadge').textContent = '🔓 Bewerken actief';
    document.getElementById('accessText').textContent  = 'Je kan documenten toevoegen, bewerken en verwijderen.';
    document.getElementById('accessActions').style.display = 'none';
    document.getElementById('fabBtn').classList.remove('locked');
    showToast('🔓 Toegang verleend!');
    filterDocs();
  } else {
    showToast('❌ Toegangscode onjuist');
    document.getElementById('accessCodeInput').value = '';
  }
}

// LADEN UIT SHEET (CSV — geen login nodig)
async function loadDocs() {
  document.getElementById('loadingState').style.display = '';
  document.getElementById('docGrid').style.display = 'none';
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('countBadge').textContent = 'laden…';
  try {
    const resp = await fetch(CSV_URL + '&t=' + Date.now());
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const csv = await resp.text();
    const parsed = parseCSV(csv);
    // Voeg lokaal opgeslagen documenten toe als er geen Script URL is
    if (!SCRIPT_URL) {
      const local = JSON.parse(localStorage.getItem('eco_local') || '[]');
      docs = [...parsed, ...local.filter(l => !parsed.find(p => p.id === l.id))];
    } else {
      docs = parsed;
    }
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('docGrid').style.display = '';
    filterDocs();
  } catch(e) {
    console.error(e);
    // Probeer lokale data te tonen als fallback
    const local = JSON.parse(localStorage.getItem('eco_local') || '[]');
    if (local.length) {
      docs = local;
      document.getElementById('loadingState').style.display = 'none';
      document.getElementById('docGrid').style.display = '';
      filterDocs();
      showToast('⚠️ Sheet niet bereikbaar — lokale data getoond.');
    } else {
      document.getElementById('loadingState').innerHTML = `
        <div style="font-size:2rem;margin-bottom:.75rem">⚠️</div>
        <p style="margin-bottom:1rem">Kon documenten niet laden.<br>Controleer of de Google Sheet <strong>publiek gedeeld</strong> is.</p>
        <button class="btn btn-green" onclick="loadDocs()">🔄 Opnieuw proberen</button>`;
      document.getElementById('countBadge').textContent = 'Fout';
    }
  }
}

function parseCSV(csv) {
  const lines = csv.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  return lines.slice(1).map((line, i) => {
    const c = parseCSVLine(line);
    return { id: c[0]||String(i+1), name: c[1]||'', cat: c[2]||'Overige', model: c[3]||'', location: c[4]||'', url: c[5]||'', desc: c[6]||'', tags: c[7] ? c[7].split(',').map(t=>t.trim()).filter(Boolean) : [], _row: i+2 };
  }).filter(d => d.name);
}

function parseCSVLine(line) {
  const res = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i]==='"') { if (q&&line[i+1]==='"'){cur+='"';i++;} else q=!q; }
    else if (line[i]===','&&!q) { res.push(cur.trim()); cur=''; }
    else cur+=line[i];
  }
  res.push(cur.trim()); return res;
}

// FILTER & RENDER
function filterDocs() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  const list = docs.filter(d => {
    const mc = !activeFilter || d.cat === activeFilter;
    const mq = !q || [d.name,d.model,d.location,d.cat,d.desc,...(d.tags||[])].join(' ').toLowerCase().includes(q);
    return mc && mq;
  });
  renderGrid(list);
}

function setFilter(cat, el) {
  activeFilter = cat;
  document.querySelectorAll('.filter-chip').forEach(c=>c.classList.remove('active'));
  el.classList.add('active');
  filterDocs();
}

function renderGrid(list) {
  const grid = document.getElementById('docGrid'), empty = document.getElementById('emptyState');
  document.getElementById('countBadge').textContent = list.length + ' resultaat' + (list.length!==1?'en':'');
  document.getElementById('statTotal').textContent  = docs.length;
  document.getElementById('statCats').textContent   = [...new Set(docs.map(d=>d.cat))].length;
  if (!list.length) { grid.innerHTML=''; empty.style.display=''; grid.style.display='none'; return; }
  empty.style.display='none'; grid.style.display='';
  const editHTML = id => isUnlocked
    ? `<button class="btn btn-outline" onclick="editDoc('${id}')">✏️</button><button class="btn btn-danger" onclick="askDelete('${id}')">🗑</button>`
    : '';
  grid.innerHTML = list.map(d => {
    const sl = catSlug(d.cat), ic = CAT_ICONS[d.cat]||'📄';
    const tg = (d.tags||[]).length ? `<div class="card-tags">${d.tags.map(t=>`<span class="tag">${t}</span>`).join('')}</div>` : '';
    return `<div class="card"><div class="card-accent cat-${sl}"></div>
      <div class="card-top"><div class="card-icon cat-${sl}">${ic}</div>
      <div class="card-meta"><div class="card-cat">${d.cat}</div><div class="card-name" title="${d.name}">${d.name}</div></div></div>
      <div class="card-body"><div class="card-divider"></div>
      <div class="card-info">${d.model?`<b>Model:</b> ${d.model}<br>`:''} ${d.location?`<b>Locatie:</b> ${d.location}<br>`:''} ${d.desc||''}</div>
      ${tg}<div class="card-actions">
        <button class="btn btn-green" onclick="openDoc('${d.id}')">📄 Open</button>
        <button class="btn btn-outline" onclick="openQR('${d.id}')">📱 QR</button>
        ${editHTML(d.id)}
      </div></div></div>`;
  }).join('');
}

// OPEN DOC
function openDoc(id) {
  const d = docs.find(x=>x.id===id);
  if (!d?.url) return showToast('⚠️ Geen link beschikbaar.');
  window.open(d.url,'_blank');
}

// QR
function openQR(id) {
  const d = docs.find(x=>x.id===id); if (!d) return;
  currentQrUrl = d.url;
  document.getElementById('qrDocName').textContent = d.name;
  document.getElementById('qrUrl').textContent = d.url;
  document.getElementById('qr-container').innerHTML = '';
  new QRCode(document.getElementById('qr-container'), { text: d.url, width: 210, height: 210, colorDark: '#2e5c0a', colorLight: '#eef7e4', correctLevel: QRCode.CorrectLevel.H });
  document.getElementById('qrOverlay').classList.add('open');
}
function downloadQR() {
  const c = document.querySelector('#qr-container canvas'); if (!c) return;
  const a = document.createElement('a');
  a.download = 'qr-' + document.getElementById('qrDocName').textContent.replace(/\s+/g,'-').toLowerCase().substring(0,40) + '.png';
  a.href = c.toDataURL('image/png'); a.click();
  showToast('✅ QR gedownload!');
}
function copyUrl() {
  navigator.clipboard.writeText(currentQrUrl).then(()=>showToast('✅ Link gekopieerd!')).catch(()=>prompt('Link:',currentQrUrl));
}

// ADD/EDIT
function onFabClick() {
  if (!isUnlocked) { showToast('🔒 Voer eerst de toegangscode in.'); return; }
  openAddModal();
}
function openAddModal() {
  editingId = null;
  document.getElementById('modalTitle').textContent = '➕ Document toevoegen';
  ['fName','fModel','fLocation','fUrl','fDesc','fTags'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('fCat').value = '';
  document.getElementById('addOverlay').classList.add('open');
}
function editDoc(id) {
  const d = docs.find(x=>x.id===id); if (!d) return;
  editingId = id;
  document.getElementById('modalTitle').textContent = '✏️ Document bewerken';
  document.getElementById('fName').value = d.name; document.getElementById('fCat').value = d.cat;
  document.getElementById('fModel').value = d.model||''; document.getElementById('fLocation').value = d.location||'';
  document.getElementById('fUrl').value = d.url; document.getElementById('fDesc').value = d.desc||'';
  document.getElementById('fTags').value = (d.tags||[]).join(', ');
  document.getElementById('addOverlay').classList.add('open');
}

async function saveDoc() {
  const name = document.getElementById('fName').value.trim();
  const cat  = document.getElementById('fCat').value;
  const url  = document.getElementById('fUrl').value.trim();
  if (!name||!cat||!url) { showToast('⚠️ Vul naam, categorie en link in.'); return; }
  const data = {
    id: editingId||Date.now().toString(), name, cat,
    model: document.getElementById('fModel').value.trim(),
    location: document.getElementById('fLocation').value.trim(),
    url, desc: document.getElementById('fDesc').value.trim(),
    tags: document.getElementById('fTags').value.split(',').map(t=>t.trim()).filter(Boolean),
    action: editingId?'update':'append',
    row: editingId ? docs.find(x=>x.id===editingId)?._row : null
  };

  const btn = document.getElementById('saveBtn');
  btn.textContent = '⏳ Opslaan…'; btn.disabled = true;

  if (SCRIPT_URL) {
    try {
      await fetch(SCRIPT_URL, { method:'POST', mode:'no-cors', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
      showToast('✅ Opgeslagen in Google Sheet!');
      closeOverlay('addOverlay');
      setTimeout(loadDocs, 2000);
    } catch(e) { localSave(data); }
  } else {
    localSave(data);
  }
  btn.textContent = '💾 Opslaan in Sheet'; btn.disabled = false;
}

function localSave(data) {
  const local = JSON.parse(localStorage.getItem('eco_local')||'[]');
  if (data.action==='update') { const i=local.findIndex(x=>x.id===data.id); if(i>=0) local[i]={...local[i],...data}; else local.push(data); }
  else local.push(data);
  localStorage.setItem('eco_local', JSON.stringify(local));
  if (data.action==='update') { const i=docs.findIndex(x=>x.id===data.id); if(i>=0) docs[i]={...docs[i],...data}; }
  else docs.push(data);
  filterDocs();
  showToast('✅ Opgeslagen! (voeg Apps Script URL toe voor sync met Sheet)');
  closeOverlay('addOverlay');
}

// DELETE
function askDelete(id) {
  deleteId = id;
  document.getElementById('deleteDocName').textContent = docs.find(x=>x.id===id)?.name||'dit document';
  document.getElementById('deleteOverlay').classList.add('open');
}
async function confirmDelete() {
  closeOverlay('deleteOverlay');
  if (!deleteId) return;
  if (SCRIPT_URL) {
    const d = docs.find(x=>x.id===deleteId);
    try { await fetch(SCRIPT_URL, { method:'POST', mode:'no-cors', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action:'delete',row:d._row}) }); setTimeout(loadDocs,2000); }
    catch(e) {}
  }
  // Altijd ook lokaal verwijderen
  docs = docs.filter(x=>x.id!==deleteId);
  const local = JSON.parse(localStorage.getItem('eco_local')||'[]').filter(x=>x.id!==deleteId);
  localStorage.setItem('eco_local', JSON.stringify(local));
  filterDocs();
  showToast('🗑 Document verwijderd.');
  deleteId = null;
}

// HELPERS
function closeOverlay(id,e) { if (!e||e.target===document.getElementById(id)) document.getElementById(id).classList.remove('open'); }
let toastTimer;
function showToast(msg) {
  const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),3000);
}

// START
loadDocs();
