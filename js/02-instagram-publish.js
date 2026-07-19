// ============================================================================
// js/02-instagram-publish.js — Upload Supabase, coda pubblicazione IG
// Dipendenze: 01-api.js
// ============================================================================

// ============================================================================
// PUBBLICAZIONE INSTAGRAM (upload media + coda programmata)
// ============================================================================
// PUBLISH SECRET: chiesto una volta e tenuto solo per la sessione corrente
function getPublishSecret() {
  let s = '';
  try { s = sessionStorage.getItem('publish_secret') || localStorage.getItem('publish_secret') || ''; } catch(e) {}
  if (!s) {
    s = (prompt('Inserisci la password di pubblicazione (PUBLISH_SECRET):') || '').trim();
    if (s) {
      try { sessionStorage.setItem('publish_secret', s); } catch(e) {}
      try { localStorage.setItem('publish_secret', s); } catch(e) {}
    }
  }
  return s;
}
function clearPublishSecret() {
  try { sessionStorage.removeItem('publish_secret'); } catch(e) {}
  try { localStorage.removeItem('publish_secret'); } catch(e) {}
}

// Upload di un file su Supabase Storage tramite signed URL (bypass limite Vercel)
// Flusso: 1) backend genera URL firmato → 2) PUT diretto al bucket Supabase
async function uploadMediaToSupabase(file) {
  const secret = getPublishSecret();
  if (!secret) throw new Error('Password di pubblicazione mancante.');

  // STEP 1: richiedo l'URL firmato al backend
  const signRes = await fetch(
    `${BACKEND_BASE}/api/upload?action=sign&filename=${encodeURIComponent(file.name || 'upload')}`,
    { headers: { 'X-Publish-Secret': secret } }
  );
  const signData = await signRes.json().catch(() => ({}));
  if (!signRes.ok || signData.error) {
    if (signRes.status === 401) clearPublishSecret();
    throw new Error(signData.error || `Errore signed URL (HTTP ${signRes.status})`);
  }

  // STEP 2: carico direttamente su Supabase (nessun limite di dimensione)
  const uploadRes = await fetch(signData.signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => '');
    throw new Error(`Upload Supabase fallito (HTTP ${uploadRes.status}) — ${errText.slice(0,120)}`);
  }

  return signData.publicUrl;
}


// Aggiunge un post alla coda di pubblicazione reale (/api/schedule)
async function schedulePublish({ mediaUrl, mediaKind, caption, scheduledAtIso }) {
  const secret = getPublishSecret();
  if (!secret) throw new Error('Password di pubblicazione mancante.');
  const res = await fetch(`${BACKEND_BASE}/api/schedule?action=add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Publish-Secret': secret },
    body: JSON.stringify({
      mediaType: mediaKind === 'video' ? 'REELS' : (mediaKind === 'carousel' ? 'CAROUSEL_ALBUM' : 'IMAGE'),
      mediaUrl,
      caption: caption || '',
      scheduledAt: scheduledAtIso
    })
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) {
    if (res.status === 401) clearPublishSecret();
    throw new Error(j.error || `Coda fallita (HTTP ${res.status})`);
  }
  return j.post;
}

// ===== CODA DI PUBBLICAZIONE (#1) =====
// Carica la coda reale dal backend (?action=list) e la mostra.
async function loadPublishQueue() {
  const box = document.getElementById('queueList');
  if (!box) return;
  box.innerHTML = '<div style="font-family:var(--font-mono);font-size:12px;color:var(--ink-mute);padding:16px 0;text-align:center;">Carico la coda…</div>';
  const secret = getPublishSecret();
  if (!secret) {
    box.innerHTML = '<div style="font-family:var(--font-mono);font-size:12px;color:var(--ink-mute);padding:16px 0;text-align:center;">Inserisci la password di pubblicazione (programma un post) per vedere la coda.</div>';
    return;
  }
  try {
    const res = await fetch(`${BACKEND_BASE}/api/schedule?action=list`, {
      headers: { 'X-Publish-Secret': secret }
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.error) {
      if (res.status === 401) clearPublishSecret();
      throw new Error(j.error || `HTTP ${res.status}`);
    }
    // Il backend schedule.js risponde { success, posts: [...] }
    const queue = Array.isArray(j.posts) ? j.posts : (Array.isArray(j.queue) ? j.queue : (Array.isArray(j) ? j : []));
    renderPublishQueue(queue);
  } catch (e) {
    box.innerHTML = `<div style="font-family:var(--font-mono);font-size:12px;color:var(--warn);padding:16px 0;text-align:center;">Coda non disponibile al momento (${e.message}).</div>`;
  }
}

function renderPublishQueue(queue) {
  const box = document.getElementById('queueList');
  if (!box) return;
  if (!queue.length) {
    box.innerHTML = '<div style="font-family:var(--font-mono);font-size:12px;color:var(--ink-mute);padding:16px 0;text-align:center;">Nessun post in coda.</div>';
    return;
  }
  // Ordino: prima i pending per orario, poi published/error
  const order = { pending: 0, error: 1, published: 2 };
  const sorted = [...queue].sort((a, b) => {
    const oa = order[a.status] ?? 3, ob = order[b.status] ?? 3;
    if (oa !== ob) return oa - ob;
    return new Date(a.scheduledAt) - new Date(b.scheduledAt);
  });
  const statusMeta = {
    pending:   { label: 'in attesa', color: 'var(--accent)', icon: 'schedule' },
    published: { label: 'pubblicato', color: 'var(--pos)', icon: 'check_circle' },
    error:     { label: 'errore', color: 'var(--neg)', icon: 'error' }
  };
  let h = '';
  sorted.forEach(p => {
    const m = statusMeta[p.status] || { label: p.status || '—', color: 'var(--ink-mute)', icon: 'help' };
    const dt = p.scheduledAt ? new Date(p.scheduledAt) : null;
    const when = dt ? `${fmtDate(dt)} · ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}` : '—';
    const cap = (p.caption || '').replace(/</g,'&lt;').slice(0, 70) || '(senza caption)';
    const kindMap = { REELS: '<svg class="brand-ico ig" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg> Reel', CAROUSEL_ALBUM: '<svg class="brand-ico ig" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg> Carosello', IMAGE: '<svg class="brand-ico ig" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg> Foto', STORY: '<svg class="brand-ico ig" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg> Story' };
    const kind = kindMap[p.mediaType] || '<svg class="brand-ico ig" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg> Foto';
    const canDelete = p.status === 'pending' || p.status === 'error';
    const escapedCaption = (p.caption || '').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, '\\n');
    h += `<div class="queue-row">
      <span class="material-symbols-rounded" style="color:${m.color};font-size:20px;">${m.icon}</span>
      <div class="queue-main">
        <div class="queue-cap">${cap}${cap.length >= 70 ? '…' : ''}</div>
        <div class="queue-meta">${kind} · ${when} · <span style="color:${m.color};">${m.label}</span>${p.status==='error' && p.error ? ' · <span style="color:var(--neg);">'+p.error.slice(0,40)+'</span>' : ''}</div>
      </div>
      ${canDelete ? `
      <button class="queue-del" style="color:var(--accent); margin-right:8px;" title="Modifica" onclick="openEditQueueModal('${p.id}', '${escapedCaption}', '${p.scheduledAt}')"><span class="material-symbols-rounded">edit</span></button>
      <button class="queue-del" title="Rimuovi dalla coda" onclick="deleteFromQueue('${p.id}')"><span class="material-symbols-rounded">delete</span></button>
      ` : ''}
    </div>`;
  });
  box.innerHTML = h;
}

async function deleteFromQueue(id) {
  if (!confirm('Rimuovere questo post dalla coda di pubblicazione?')) return;
  const secret = getPublishSecret();
  if (!secret) { alert('Password di pubblicazione mancante.'); return; }
  try {
    const res = await fetch(`${BACKEND_BASE}/api/schedule?action=delete&id=${encodeURIComponent(id)}`, {
      method: 'POST',
      headers: { 'X-Publish-Secret': secret }
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.error) {
      if (res.status === 401) clearPublishSecret();
      throw new Error(j.error || `HTTP ${res.status}`);
    }
    loadPublishQueue(); // ricarico
  } catch (e) {
    alert('Eliminazione fallita: ' + e.message);
  }
}

async function clearPublishedQueue() {
  if (!confirm('Rimuovere definitivamente dalla lista tutti i post già pubblicati con successo?')) return;
  const secret = getPublishSecret();
  if (!secret) { alert('Password di pubblicazione mancante.'); return; }
  
  const btn = document.getElementById('queueCleanBtn');
  const oldHtml = btn.innerHTML;
  btn.innerHTML = '<span class="material-symbols-rounded" style="animation:spin 1s linear infinite;">progress_activity</span>';
  
  try {
    const res = await fetch(`${BACKEND_BASE}/api/schedule?action=clear_published`, {
      method: 'POST',
      headers: { 'X-Publish-Secret': secret }
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.error) {
      if (res.status === 401) clearPublishSecret();
      throw new Error(j.error || `HTTP ${res.status}`);
    }
    loadPublishQueue(); // ricarico
  } catch (e) {
    alert('Pulizia fallita: ' + e.message);
  } finally {
    btn.innerHTML = oldHtml;
  }
}

// Gestione UI dell'area upload nel modal
function calResetUpload() {
  const u = document.getElementById('calMediaUrl');
  const k = document.getElementById('calMediaKind');
  if (u) u.value = '';
  if (k) k.value = '';
  const prev = document.getElementById('calUploadPreview');
  if (prev) { prev.innerHTML = ''; prev.classList.remove('show'); }
  const st = document.getElementById('calUploadStatus');
  if (st) { st.innerHTML = ''; st.className = 'cal-upload-status'; }
  const rm = document.getElementById('calUploadRemove');
  if (rm) rm.style.display = 'none';
  const inp = document.getElementById('calUploadInput');
  if (inp) inp.value = '';
}

async function calHandleFiles(files) {
  if (!files || !files.length) return;
  const platform = document.getElementById('calPlatform').value;
  const type = document.getElementById('calType').value;
  const isCarousel = (platform === 'ig' && type === 'CAROUSEL_ALBUM');

  // Se non è carosello, carichiamo solo il primo file
  const filesToUpload = isCarousel ? Array.from(files).slice(0, 10) : [files[0]];

  const status = document.getElementById('calUploadStatus');
  const prev = document.getElementById('calUploadPreview');
  const removeBtn = document.getElementById('calUploadRemove');

  status.className = 'cal-upload-status loading';
  status.innerHTML = '<span class="material-symbols-rounded" style="font-size:14px;">progress_activity</span> Caricamento in corso…';

  prev.innerHTML = '';
  prev.classList.add('show');

  const urls = [];
  const kinds = [];

  for (let i = 0; i < filesToUpload.length; i++) {
    const file = filesToUpload[i];
    const isVideo = (file.type || '').startsWith('video');
    const localUrl = URL.createObjectURL(file);

    const previewItem = document.createElement('div');
    previewItem.className = 'cal-preview-item';
    previewItem.innerHTML = isVideo
      ? `<video src="${localUrl}#t=0.5" style="width:80px;height:80px;object-fit:cover;border-radius:6px;border:1px solid var(--line);" preload="metadata"></video>`
      : `<img src="${localUrl}" style="width:80px;height:80px;object-fit:cover;border-radius:6px;border:1px solid var(--line);">`;
    prev.appendChild(previewItem);

    try {
      status.innerHTML = `<span class="material-symbols-rounded" style="font-size:14px;">progress_activity</span> Caricamento file ${i + 1}/${filesToUpload.length}…`;
      const url = await uploadMediaToSupabase(file);
      urls.push(url);
      kinds.push(isVideo ? 'video' : 'image');
    } catch (e) {
      status.className = 'cal-upload-status err';
      status.innerHTML = '<span class="material-symbols-rounded" style="font-size:14px;">error</span> ' + (e.message || 'Errore upload');
      calResetUpload();
      return;
    }
  }

  document.getElementById('calMediaUrl').value = urls.join(',');
  document.getElementById('calMediaKind').value = kinds.join(',');

  status.className = 'cal-upload-status ok';
  status.innerHTML = `<span class="material-symbols-rounded" style="font-size:14px;">check_circle</span> ${urls.length > 1 ? urls.length + ' media caricati' : 'Media caricato'} con successo`;
  if (removeBtn) removeBtn.style.display = 'inline-block';
}

function calSetupUpload() {
  const zone = document.getElementById('calUpload');
  const input = document.getElementById('calUploadInput');
  if (!zone || !input) return;
  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', e => calHandleFiles(e.target.files));
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('dragover');
    if (e.dataTransfer.files.length) calHandleFiles(e.dataTransfer.files);
  });
  const rm = document.getElementById('calUploadRemove');
  if (rm) rm.addEventListener('click', calResetUpload);
}

// Gestione Copertina Reel (Upload)
async function calHandleCoverFile(files) {
  const file = files[0];
  if (!file) return;
  const prev = document.getElementById('calCoverUploadPreview');
  const status = document.getElementById('calCoverUploadStatus');
  const removeBtn = document.getElementById('calCoverUploadRemove');
  if (!prev || !status) return;

  prev.innerHTML = '';
  status.className = 'cal-upload-status';
  status.innerHTML = '';

  if (!file.type.startsWith('image/')) {
    status.className = 'cal-upload-status err';
    status.innerHTML = '<span class="material-symbols-rounded" style="font-size:14px;">error</span> La copertina deve essere un\'immagine.';
    return;
  }

  const localUrl = URL.createObjectURL(file);
  const previewItem = document.createElement('div');
  previewItem.className = 'cal-preview-item';
  previewItem.innerHTML = `<img src="${localUrl}" style="width:80px;height:80px;object-fit:cover;border-radius:6px;border:1px solid var(--line);">`;
  prev.appendChild(previewItem);

  try {
    status.innerHTML = '<span class="material-symbols-rounded" style="font-size:14px;animation:spin 1s linear infinite;">progress_activity</span> Caricamento copertina…';
    const url = await uploadMediaToSupabase(file);
    document.getElementById('calCoverUrl').value = url;
    status.className = 'cal-upload-status ok';
    status.innerHTML = '<span class="material-symbols-rounded" style="font-size:14px;">check_circle</span> Copertina caricata con successo';
    if (removeBtn) removeBtn.style.display = 'inline-block';
  } catch (e) {
    status.className = 'cal-upload-status err';
    status.innerHTML = '<span class="material-symbols-rounded" style="font-size:14px;">error</span> ' + (e.message || 'Errore upload');
    calResetCoverUpload();
  }
}

function calResetCoverUpload() {
  document.getElementById('calCoverUrl').value = '';
  const prev = document.getElementById('calCoverUploadPreview');
  const status = document.getElementById('calCoverUploadStatus');
  const removeBtn = document.getElementById('calCoverUploadRemove');
  const input = document.getElementById('calCoverUploadInput');
  if (prev) prev.innerHTML = '';
  if (status) { status.className = 'cal-upload-status'; status.innerHTML = ''; }
  if (removeBtn) removeBtn.style.display = 'none';
  if (input) input.value = '';
}

function calSetupCoverUpload() {
  const zone = document.getElementById('calCoverUpload');
  const input = document.getElementById('calCoverUploadInput');
  if (!zone || !input) return;
  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', e => calHandleCoverFile(e.target.files));
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('dragover');
    if (e.dataTransfer.files.length) calHandleCoverFile(e.dataTransfer.files);
  });
  const rm = document.getElementById('calCoverUploadRemove');
  if (rm) rm.addEventListener('click', calResetCoverUpload);
}

// Mostra l'area media solo per Instagram, l'area copertina per i Reel e i collaboratori per IG (tranne Story)
function calToggleMediaField() {
  const platform = document.getElementById('calPlatform').value;
  const type = document.getElementById('calType').value;
  const field = document.getElementById('calMediaField');
  if (field) field.style.display = (platform === 'ig') ? 'flex' : 'none';

  const coverField = document.getElementById('calCoverField');
  if (coverField) {
    coverField.style.display = (platform === 'ig' && type === 'REELS') ? 'flex' : 'none';
  }

  const collabField = document.getElementById('calCollabField');
  if (collabField) {
    collabField.style.display = (platform === 'ig' && type !== 'STORY') ? 'flex' : 'none';
  }
}

const MONTHS_NUM = ['01','02','03','04','05','06','07','08','09','10','11','12'];
const COLLAB_KEY = 'epf_collab_posts'; // localStorage key per i post collaborativi

const numIt = n => Math.round(n).toLocaleString('it-IT');
const pct1 = n => (Math.round(n*10)/10).toLocaleString('it-IT',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';
const pct2 = n => (Math.round(n*100)/100).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})+'%';
// Formato data: GG/MM
const fmtDate = d => `${d.getDate().toString().padStart(2,'0')}/${MONTHS_NUM[d.getMonth()]}`;
const fmtDateLong = d => `${d.getDate().toString().padStart(2,'0')}/${MONTHS_NUM[d.getMonth()]}/${d.getFullYear()}`;

function getCollabSet() {
  try { return new Set(JSON.parse(localStorage.getItem(COLLAB_KEY) || '[]')); }
  catch(e) { return new Set(); }
}
function toggleCollab(mediaId) {
  const s = getCollabSet();
  if (s.has(mediaId)) s.delete(mediaId); else s.add(mediaId);
  try { localStorage.setItem(COLLAB_KEY, JSON.stringify([...s])); } catch(e) {}
}

function setStatus(mode, msg) {
  const el = document.getElementById('navStatus');
  const txt = document.getElementById('navStatusText');
  el.classList.remove('live','error');
  if (mode === 'live') el.classList.add('live');
  else if (mode === 'error') el.classList.add('error');
  txt.textContent = msg;
}

// ── LOADING OVERLAY ──
// Gestisce l'overlay di caricamento con log visivo riga per riga.
// Uso: loadingStart() → loadingStep(id, label) → loadingDone(id) / loadingError(id, msg)
//      → loadingFinish() per chiudere
const _loadRows = {};
function loadingStart() {
  const ov = document.getElementById('loadingOverlay');
  const log = document.getElementById('loadingLog');
  if (!ov || !log) return;
  Object.keys(_loadRows).forEach(k => delete _loadRows[k]);
  log.innerHTML = '';
  document.getElementById('loadingBarFill').style.width = '0%';
  document.getElementById('loadingTitle').textContent = 'Caricamento dashboard…';
  document.getElementById('loadingIcon').textContent = 'sync';
  document.getElementById('loadingIcon').style.color = 'var(--accent)';
  ov.classList.remove('fade-out','hidden');
}
function loadingStep(id, label, state = 'active') {
  const log = document.getElementById('loadingLog');
  if (!log) return;
  const icons = { active: 'progress_activity', done: 'check_circle', error: 'error', warn: 'warning' };
  const spin = state === 'active' ? ' spin' : '';
  const row = document.createElement('div');
  row.className = `log-row ${state}`;
  row.id = `log-${id}`;
  row.innerHTML = `<span class="log-ico material-symbols-rounded${spin}">${icons[state]||'circle'}</span><span>${label}</span>`;
  if (_loadRows[id]) {
    _loadRows[id].replaceWith(row);
  } else {
    log.appendChild(row);
  }
  _loadRows[id] = row;
}
function loadingDone(id, label) {
  const row = document.getElementById(`log-${id}`);
  if (!row) return;
  const ico = row.querySelector('.log-ico');
  row.className = 'log-row done';
  if (ico) { ico.classList.remove('spin'); ico.textContent = 'check_circle'; }
  if (label) row.querySelector('span:last-child').textContent = label;
}
function loadingError(id, label) {
  const row = document.getElementById(`log-${id}`);
  if (!row) return;
  const ico = row.querySelector('.log-ico');
  row.className = 'log-row error';
  if (ico) { ico.classList.remove('spin'); ico.textContent = 'error'; }
  if (label) row.querySelector('span:last-child').textContent = label;
}
function loadingWarn(id, label) {
  const row = document.getElementById(`log-${id}`);
  if (!row) return;
  const ico = row.querySelector('.log-ico');
  row.className = 'log-row warn';
  if (ico) { ico.classList.remove('spin'); ico.textContent = 'warning'; }
  if (label) row.querySelector('span:last-child').textContent = label;
}
function loadingProgress(pct) {
  const bar = document.getElementById('loadingBarFill');
  if (bar) bar.style.width = Math.min(100, pct) + '%';
}
function loadingFinish(ok = true) {
  const ov = document.getElementById('loadingOverlay');
  const ico = document.getElementById('loadingIcon');
  const title = document.getElementById('loadingTitle');
  if (!ov) return;
  loadingProgress(100);
  if (ok) {
    ico.textContent = 'check_circle'; ico.style.color = 'var(--pos)';
    ico.style.animation = 'none';
    title.textContent = 'Dati caricati ✓';
  } else {
    ico.textContent = 'error'; ico.style.color = 'var(--neg)';
    ico.style.animation = 'none';
    title.textContent = 'Caricamento parziale';
  }
  setTimeout(() => {
    ov.classList.add('fade-out');
    setTimeout(() => ov.classList.add('hidden'), 420);
  }, 900);
}

function normalizeType(t) {
  if (t === 'CAROUSEL_ALBUM') return 'CAROUSEL';
  if (t === 'VIDEO' || t === 'REEL') return 'REELS';
  return t;
}
function shortCaption(c, max=110) {
  if (!c) return '';
  let s = c.split('\n')[0].replace(/\*\*/g,'');
  if (s.length > max) s = s.slice(0,max-1) + '…';
  return s;
}
// Estrae un "titolo" breve significativo dal post per uso compatto
function titleFromCaption(c, max=50) {
  if (!c) return 'Post';
  let s = c.split('\n')[0].replace(/\*\*/g,'').replace(/^[🔥🛡️🧤⚽️🎯🚨🚀📊⚡️🎮👽⚫🔵💎🏆🎟️⚔️📈⬇️✍️🔵🧙🟣]+/g,'').trim();
  // Rimuove punti finali e taglia alla prima frase breve
  if (s.length > max) s = s.slice(0,max-1) + '…';
  return s || 'Post';
}

function findPi(reach, median) { return median > 0 ? reach/median : 0; }
function piClass(pi) { return pi >= 1.5 ? 'strong' : pi >= 0.8 ? 'mid' : 'weak'; }

function computeMedian(arr) {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a,b) => a-b);
  return s[Math.floor(s.length/2)];
}

function sumWindow(daily, days, endIdx, posts) {
  const start = Math.max(0, endIdx - days + 1);
  const window = daily.slice(start, endIdx + 1);
  let int = window.reduce((s,r)=>s+(r.total_interactions||0),0);
  let shares = window.reduce((s,r)=>s+(r.shares||0),0);
  let postReach = 0;
  let erAvg = 0; // media degli ER per-post nella finestra (coerente col Content Lab)
  // Se i daily non hanno interazioni (Meta non le espone), le calcolo dai post
  // pubblicati nell'intervallo di date della finestra. Raccolgo anche la reach
  // dei post e l'ER medio per-post.
  if (posts && posts.length && window.length) {
    const dStart = new Date(window[0].date + 'T00:00:00');
    const dEnd = new Date(window[window.length-1].date + 'T23:59:59');
    const inWin = posts.filter(p => {
      const t = new Date(p.timestamp);
      return t >= dStart && t <= dEnd;
    });
    const intFromPosts = inWin.reduce((s,p)=>s+(p.media_engagement||0),0);
    const sharesFromPosts = inWin.reduce((s,p)=>s+(p.media_shares||0),0);
    postReach = inWin.reduce((s,p)=>s+(p.media_reach||0),0);
    const erList = inWin.map(p => { const r=p.media_reach||0; return r>0 ? (p.media_engagement||0)/r*100 : null; }).filter(v => v!==null);
    erAvg = erList.length ? erList.reduce((s,v)=>s+v,0)/erList.length : 0;
    if (intFromPosts > 0) int = intFromPosts;
    if (sharesFromPosts > 0) shares = sharesFromPosts;
  }
  return {
    reach: window.reduce((s,r)=>s+(r.reach||0),0),
    postReach,
    erAvg,
    int,
    eng: int,
    foll: window.reduce((s,r)=>s+(r.follows_and_unfollows||0),0),
    shares,
    days: window.length
  };
}

function deltaPctIcon(curr, prev) {
  if (prev === 0 && curr === 0) return {cls:'flat', icon:'remove', val:'—'};
  // Se prev è molto piccolo (periodo inattivo precedente), la % esplode in modo
  // poco informativo. Mostro 'nuovo trend' invece di numeri tipo +5000%.
  if (Math.abs(prev) < 5 && curr > prev) return {cls:'pos', icon:'trending_up', val:'nuovo'};
  if (prev === 0) return {cls:'pos', icon:'trending_up', val:'nuovo'};
  const pct = ((curr - prev) / Math.abs(prev)) * 100;
  if (Math.abs(pct) < 1) return {cls:'flat', icon:'remove', val: '0%'};
  // Cap visivo: oltre +999% mostro >999%, sotto -99% mostro -99%
  let displayPct;
  if (pct > 999) displayPct = '>999%';
  else if (pct < -99) displayPct = '-99%';
  else displayPct = (pct > 0 ? '+' : '') + Math.round(pct) + '%';
  const cls = pct > 0 ? 'pos' : 'neg';
  const icon = pct > 0 ? 'arrow_upward' : 'arrow_downward';
  return {cls, icon, val: displayPct};
}

