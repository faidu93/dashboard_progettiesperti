// ============================================================================
// js/06-calendar.js — Tab Navigator e Calendario Editoriale mensile
// Dipendenze: 02-instagram-publish.js, 01-api.js
// ============================================================================

// ============================================================================
// CALENDARIO EDITORIALE MENSILE
// ============================================================================
const CAL_KEY = 'epf_calendar';
const YT_CAL_KEY = 'epf_yt_calendar';
let calCurrentDate = new Date();
let calCurrentFilter = 'all'; // 'all' | 'ig' | 'yt'

// calPublishedPosts è già dichiarato globalmente in 01-api.js

function calLoad() {
  // Se Google Calendar è connesso, ritorna gli eventi pianificati IG
  if (gcalSignedIn) return gcalGetIgPlanned();
  // Fallback localStorage (offline)
  try { return JSON.parse(localStorage.getItem(CAL_KEY) || '[]'); } catch { return []; }
}
function calSave(items) {
  // Quando Google è connesso, il save è gestito dal modal (gcalCreate/Update/Delete)
  // Questa funzione resta per il fallback localStorage
  if (!gcalSignedIn) localStorage.setItem(CAL_KEY, JSON.stringify(items));
}

function ytCalLoad() {
  // Se Google Calendar è connesso, ritorna gli eventi pianificati YT
  if (gcalSignedIn) return gcalGetYtPlanned();
  // Fallback localStorage
  try { return JSON.parse(localStorage.getItem(YT_CAL_KEY) || '[]'); } catch { return []; }
}
function ytCalSave(items) {
  if (!gcalSignedIn) localStorage.setItem(YT_CAL_KEY, JSON.stringify(items));
}
function calShortTitle(caption) {
  if (!caption) return 'Post';
  const first = caption.split('\n')[0].replace(/[\u{1F300}-\u{1FAFF}]/gu, '').trim();
  return first.length > 28 ? first.slice(0, 28) + '…' : (first || 'Post');
}
function calDateStr(date) {
  return date.getFullYear() + '-' +
    String(date.getMonth()+1).padStart(2,'0') + '-' +
    String(date.getDate()).padStart(2,'0');
}

function parseStructuredNotes(notes) {
  const result = {
    strategy: '',
    visual: '',
    script: '',
    caption: notes || ''
  };
  
  if (!notes) return result;
  
  const strategyMatch = notes.match(/\[STRATEGIA\]\n([\s\S]*?)(?=\n\[|$)/);
  const visualMatch = notes.match(/\[CONTESTO VISIVO\]\n([\s\S]*?)(?=\n\[|$)/);
  const scriptMatch = notes.match(/\[COPIONE\]\n([\s\S]*?)(?=\n\[|$)/);
  const captionMatch = notes.match(/\[CAPTION\]\n([\s\S]*?)(?=\n\[|$)/);
  
  if (strategyMatch || visualMatch || scriptMatch || captionMatch) {
    if (strategyMatch) result.strategy = strategyMatch[1].trim();
    if (visualMatch) result.visual = visualMatch[1].trim();
    if (scriptMatch) result.script = scriptMatch[1].trim();
    if (captionMatch) result.caption = captionMatch[1].trim();
  }
  
  return result;
}

function serializeStructuredNotes(strategy, visual, script, caption) {
  let parts = [];
  if (strategy && strategy.trim()) parts.push(`[STRATEGIA]\n${strategy.trim()}`);
  if (visual && visual.trim()) parts.push(`[CONTESTO VISIVO]\n${visual.trim()}`);
  if (script && script.trim()) parts.push(`[COPIONE]\n${script.trim()}`);
  if (caption && caption.trim()) parts.push(`[CAPTION]\n${caption.trim()}`);
  
  if (parts.length === 0) return '';
  if (parts.length === 1 && caption && caption.trim()) return caption.trim();
  
  return parts.join('\n\n');
}

function calSetFilter(btn) {
  document.querySelectorAll('.cal-filter').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  calCurrentFilter = btn.dataset.filter;
  calRender();
}


function calToggleHostField() {
  const platform = document.getElementById('calPlatform').value;
  const type = document.getElementById('calType').value;
  const hostField = document.getElementById('calHostField');
  if (hostField) {
    const shouldShow = (platform === 'yt' && (type === 'LIVE' || type === 'ASTA_LIVE'));
    hostField.style.display = shouldShow ? 'flex' : 'none';
  }
}

function calToggleMediaField() {
  const mediaField = document.getElementById('calMediaField');
  const collabField = document.getElementById('calCollabField');
  const coverField = document.getElementById('calCoverField');
  const notesField = document.getElementById('calNotesField');
  const ytTitleField = document.getElementById('calYtTitleField');
  const pubBtn = document.getElementById('calPublishNowBtn');

  const platform = document.getElementById('calPlatform')?.value || 'ig';
  const type = document.getElementById('calType')?.value || 'IMAGE';

  if (platform === 'yt') {
    if (mediaField) mediaField.style.display = 'none';
    if (collabField) collabField.style.display = 'none';
    if (coverField) coverField.style.display = 'none';
    if (notesField) notesField.style.display = 'none';
    if (ytTitleField) ytTitleField.style.display = 'block';
    if (pubBtn) pubBtn.style.display = 'none';
  } else {
    if (mediaField) mediaField.style.display = 'block';
    if (collabField) collabField.style.display = 'block';
    if (coverField) coverField.style.display = (type === 'REELS') ? 'block' : 'none';
    if (notesField) notesField.style.display = 'block';
    if (ytTitleField) ytTitleField.style.display = 'none';
    if (pubBtn) pubBtn.style.display = 'inline-flex';
  }
}

function calUpdateUploadInputMultiple() {
  const type = document.getElementById('calType').value;
  const input = document.getElementById('calUploadInput');
  if (input) {
    if (type === 'CAROUSEL_ALBUM') {
      input.setAttribute('multiple', 'multiple');
    } else {
      input.removeAttribute('multiple');
    }
  }
}

// Tipi di formato per piattaforma
const CAL_IG_TYPES = [
  {value:'IMAGE',      label:'📷 Foto'},
  {value:'CAROUSEL_ALBUM', label:'⊞ Carosello'},
  {value:'REELS',     label:'▶ Reel'}
];
const CAL_YT_TYPES = [
  {value:'VIDEO',     label:'▶ Video'},
  {value:'SHORT',     label:'⬜ Short'},
  {value:'LIVE',      label:'◉ Live'},
  {value:'ASTA_LIVE', label:'🔨 Asta'}
];

// Renderizza i pulsanti del gruppo Formato e sincronizza il select nascosto
function calRenderTypeButtons(types, selectedVal) {
  const group = document.getElementById('calTypeGroup');
  const sel   = document.getElementById('calType');
  if (!group) return;
  const val = selectedVal || types[0].value;
  group.innerHTML = types.map(o =>
    `<button type="button" class="cal-btn-option${o.value === val ? ' active' : ''}" data-val="${o.value}" onclick="calSetType('${o.value}')">${o.label}</button>`
  ).join('');
  if (sel) {
    sel.innerHTML = types.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
    sel.value = val;
  }
}

// Imposta la piattaforma via pulsante
function calSetPlatform(val) {
  document.getElementById('calPlatform').value = val;
  calOnPlatformChange();
}

// Imposta il formato via pulsante
function calSetType(val) {
  document.getElementById('calType').value = val;
  document.querySelectorAll('#calTypeGroup .cal-btn-option').forEach(b =>
    b.classList.toggle('active', b.dataset.val === val)
  );
  calOnTypeChange();
}

function calOnTypeChange() {
  calToggleHostField();
  calToggleMediaField();
  calUpdateUploadInputMultiple();
}

function calOnPlatformChange() {
  const platform = document.getElementById('calPlatform').value;
  const ytBanner  = document.getElementById('calYtBanner');
  const notesField = document.getElementById('calNotesField');
  // Sincronizza pulsanti piattaforma
  document.querySelectorAll('#calPlatformGroup .cal-btn-option').forEach(b =>
    b.classList.toggle('active', b.dataset.val === platform)
  );
  if (platform === 'yt') {
    calRenderTypeButtons(CAL_YT_TYPES, 'VIDEO');
    if (ytBanner)   ytBanner.style.display   = 'flex';
    if (notesField) notesField.style.display = 'none';
  } else {
    calRenderTypeButtons(CAL_IG_TYPES, 'IMAGE');
    if (ytBanner)   ytBanner.style.display   = 'none';
    if (notesField) notesField.style.display = '';
  }
  calToggleMediaField();
  calToggleHostField();
  calUpdateUploadInputMultiple();
  calUpdateSlotHint();
}

function calApplyOptimalTime(timeStr) {
  const timeInput = document.getElementById('calTime');
  if (timeInput) {
    timeInput.value = timeStr;
    calUpdateSlotHint();
  }
}

function calUpdateSlotHint() {
  const hint = document.getElementById('calSlotHint');
  if (!hint) return;
  const platform = document.getElementById('calPlatform');
  // Lo slot ha senso soprattutto per Instagram; per YT lo nascondo.
  if (platform && platform.value === 'yt') { hint.style.display = 'none'; return; }
  const dateV = document.getElementById('calDate').value;
  const timeV = document.getElementById('calTime').value;
  if (!dateV || !timeV) { hint.style.display = 'none'; return; }
  const d = new Date(dateV + 'T' + timeV);
  if (isNaN(d)) { hint.style.display = 'none'; return; }
  const dow = d.getDay(); // 0=Dom..6=Sab
  const h = d.getHours();
  const DOW = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];

  // Punteggio fascia: 'best' | 'good' | 'weak'
  let level = 'good', msg = '';
  const inMorning = h >= 10 && h < 13;     // 10-13
  const inAfternoon = h >= 15 && h < 18;   // 15-18
  const inLunch = h >= 12 && h < 14;       // pausa pranzo
  const inEvening = h >= 18 && h < 20;     // dopo-lavoro

  if ((dow === 2 || dow === 4) && (inMorning || inAfternoon || inEvening)) {
    level = 'best';
    msg = `${DOW[dow]} ${String(h).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} · slot prime-time (picco +16% engagement)`;
  } else if (dow === 3 && inMorning) {
    level = 'best';
    msg = `Mercoledì mattina · fascia forte per la tua audience`;
  } else if ((inMorning || inAfternoon || inLunch || inEvening) && dow !== 0) {
    level = 'good';
    msg = `${DOW[dow]} ${String(h).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} · fascia discreta`;
  } else if (dow === 0) {
    level = 'weak';
    msg = `Domenica · giorno meno prevedibile, engagement variabile`;
  } else if (h >= 22 || h < 7) {
    level = 'weak';
    msg = `Tarda sera/notte · fascia debole, poca attività`;
  } else {
    level = 'good';
    msg = `${DOW[dow]} ${String(h).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} · fascia neutra`;
  }

  const styles = {
    best: { bg: 'rgba(46,204,113,0.12)', bd: 'var(--pos)', col: 'var(--pos)', ico: '🔥' },
    good: { bg: 'rgba(255,140,30,0.10)', bd: 'rgba(255,140,30,0.4)', col: 'var(--accent)', ico: '○' },
    weak: { bg: 'rgba(255,255,255,0.03)', bd: 'var(--line)', col: 'var(--ink-mute)', ico: '⚠️' }
  };
  const st = styles[level] || styles.good;
  const optTime = (dow === 2 || dow === 4) ? '18:30' : ((dow === 3) ? '12:00' : '18:30');

  hint.style.display = 'flex';
  hint.style.alignItems = 'center';
  hint.style.justifyContent = 'space-between';
  hint.style.background = st.bg;
  hint.style.border = '1px solid ' + st.bd;
  hint.style.color = st.col;
  hint.innerHTML = `
    <span style="display:flex; align-items:center; gap:6px;">${st.ico} ${msg}</span>
    <button type="button" onclick="calApplyOptimalTime('${optTime}')" style="font-size:10.5px; font-weight:700; padding:3px 9px; border-radius:5px; border:1px solid ${st.bd}; background:rgba(255,255,255,0.1); color:inherit; cursor:pointer; font-family:var(--font-mono); display:inline-flex; align-items:center; gap:4px; flex-shrink:0;">
      ⚡ Usa slot consigliato (${optTime})
    </button>
  `;
}

// ytRender è alias di calRender (rendering unificato)
function ytRender() { calRender(); }

// Ritorna icona Material Symbols + label per un cal-post in base a piattaforma e tipo
function calPostChip(platform, type, label) {
  const icons = {
    // Instagram
    'ig:IMAGE':          'photo_camera',
    'ig:CAROUSEL_ALBUM': 'grid_view',
    'ig:REELS':          'play_circle',
    'ig:STORY':          'history',
    // YouTube
    'yt:VIDEO':          'smart_display',
    'yt:SHORT':          'smartphone',
    'yt:LIVE':           'sensors',
    'yt:ASTA_LIVE':      'gavel',
  };
  const key = platform + ':' + (type || '').toUpperCase();
  const icon = icons[key] || (platform === 'yt' ? 'smart_display' : 'photo_camera');
  return `<span class="cp-ico material-symbols-rounded" aria-hidden="true">${icon}</span><span class="cp-lbl">${label}</span>`;
}

function cleanStringForMatch(str) {
  if (!str) return '';
  return str.toLowerCase()
    .replace(/^[0-9]{1,2}[:.][0-9]{2}\s*/, '')
    .replace(/[^\w]/g, '');
}

function calRender() {
  const grid = document.getElementById('calGrid');
  const titleEl = document.getElementById('calMonthTitle');
  if (!grid) return;

  const MONTHS = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
    'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
  const DOW = ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
  const y = calCurrentDate.getFullYear();
  const m = calCurrentDate.getMonth();
  titleEl.textContent = MONTHS[m] + ' ' + y;

  const today = new Date(); today.setHours(0,0,0,0);
  const firstDay = new Date(y, m, 1);
  const lastDay = new Date(y, m+1, 0);
  const startDow = (firstDay.getDay() + 6) % 7; // 0=Lun
  const planned = calLoad();

  let h = DOW.map((d,i) =>
    `<div class="cal-dow${i>=5?' weekend':''}">${d}</div>`
  ).join('');

  // Celle precedenti al mese
  for (let i = 0; i < startDow; i++) {
    const d = new Date(y, m, 1-(startDow-i));
    h += `<div class="cal-day other-month"><span class="cal-day-num">${d.getDate()}</span></div>`;
  }

  // Giorni del mese
  for (let day = 1; day <= lastDay.getDate(); day++) {
    const date = new Date(y, m, day);
    const ds = calDateStr(date);
    const isToday = date.getTime() === today.getTime();
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    let cls = '';
    if (isToday) cls += ' today';
    if (isWeekend) cls += ' weekend-day';

    // Post Instagram pubblicati
    const igPub = (calCurrentFilter === 'yt') ? [] : calPublishedPosts.filter(p => {
      const pd = new Date(p.timestamp);
      return calDateStr(pd) === ds;
    });
    // Video YouTube pubblicati
    const ytPub = (calCurrentFilter === 'ig') ? [] : (window.ytPublishedVideos || []).filter(v => v.date === ds);
    // Post pianificati Google Calendar (filtrati per IG/YT)
    let igPlanned = [], ytPlanned = [];
    if (calCurrentFilter !== 'yt') {
      igPlanned = (gcalSignedIn ? gcalGetIgPlanned() : (JSON.parse(localStorage.getItem(CAL_KEY)||'[]'))).filter(p => p.date === ds);
      // Deduplicazione: nascondo il pianificato se esiste un post pubblicato corrispondente su IG
      igPlanned = igPlanned.filter(p => {
        const cleanPlan = cleanStringForMatch(p.title);
        if (!cleanPlan) return true;
        const isPublished = igPub.some(pub => {
          const cleanPub = cleanStringForMatch(pub.media_caption);
          return cleanPub.includes(cleanPlan) || cleanPlan.includes(cleanPub);
        });
        return !isPublished;
      });
    }
    if (calCurrentFilter !== 'ig') {
      ytPlanned = (gcalSignedIn ? gcalGetYtPlanned() : (JSON.parse(localStorage.getItem(YT_CAL_KEY)||'[]'))).filter(p => p.date === ds);
      // Deduplicazione: nascondo il pianificato se esiste un video pubblicato corrispondente su YT
      ytPlanned = ytPlanned.filter(p => {
        const cleanPlan = cleanStringForMatch(p.title);
        if (!cleanPlan) return true;
        const isPublished = ytPub.some(pub => {
          const cleanPub = cleanStringForMatch(pub.title);
          return cleanPub.includes(cleanPlan) || cleanPlan.includes(cleanPub);
        });
        return !isPublished;
      });
    }

    let posts = '';
    igPub.forEach(p => {
      const t = calShortTitle(p.media_caption).replace(/"/g, '&quot;');
      const reach = p.media_views ? ' · ' + numIt(p.media_views) + ' visual' : (p.media_reach ? ' · ' + numIt(p.media_reach) + ' reach' : '');
      const encoded = encodeURIComponent(JSON.stringify({
        type: p.media_type,
        caption: (p.media_caption||'').slice(0,300),
        reach: p.media_reach,
        views: p.media_views,
        ts: p.timestamp,
        url: p.media_permalink||''
      })).replace(/'/g, '%27');
      posts += `<div class="cal-post pub ${p.media_type}"
        onclick="calShowDetail(event,'${encoded}')"
        title="IG · ${t}${reach}">${calPostChip('ig', p.media_type, (p.time?p.time.slice(0,5)+' ':'')+t)}</div>`;
    });
    ytPub.forEach(v => {
      const shortT = (v.title.length > 25 ? v.title.slice(0,25)+'…' : v.title).replace(/"/g, '&quot;');
      const ytUrl = v.videoId ? 'https://www.youtube.com/watch?v=' + v.videoId : '';
      const encoded = encodeURIComponent(JSON.stringify({
        type: 'YT_VIDEO',
        title: v.title,
        views: v.views,
        likes: v.likes,
        date: v.date,
        url: ytUrl
      })).replace(/'/g, '%27');
      // Determino il tipo YT: la dashboard salva 'VIDEO','SHORT','LIVE' — uso VIDEO come default
      const ytType = v.ytType || 'VIDEO';
      posts += `<div class="cal-post pub ${ytType}"
        onclick="calShowYtDetail(event,'${encoded}')"
        title="YT · ${(v.title||'').replace(/"/g, '&quot;')} · ${v.views} views">${calPostChip('yt', ytType, shortT)}</div>`;
    });
    igPlanned.forEach(p => {
      // Un post si auto-pubblica se è stato salvato con media caricato:
      // lo riconosco dal ✅ nel titolo o dal marcatore nelle note.
      const isAutoPub = /✅/.test(p.title || '') || /Pubblicazione automatica/i.test(p.notes || '');
      const safeTitle = (p.title||'').replace(/"/g,'&quot;');
      posts += `<div class="cal-post plan ${p.type}${isAutoPub ? ' autopub' : ''}"
        draggable="true"
        data-evid="${p.id}" data-platform="ig" data-evtype="${p.type}" data-evtitle="${safeTitle}" data-evnotes="${(p.notes||'').replace(/"/g,'&quot;')}" data-evtime="${p.time||'10:00'}"
        onclick="calEditPlanned(event,'${p.id}','ig')"
        title="${isAutoPub ? '✅ Pubblicazione automatica · ' : ''}IG · ${p.time||''} ${safeTitle} (trascina per spostare)">${calPostChip('ig', p.type, (p.time?p.time.slice(0,5)+' ':'')+safeTitle)}</div>`;
    });
    ytPlanned.forEach(p => {
      const hostSuffix = p.host ? ` · Host: ${(p.host||'').replace(/"/g, '&quot;')}` : '';
      const safeTitle = (p.title||'').replace(/"/g,'&quot;');
      posts += `<div class="cal-post plan ${p.type||'VIDEO'}"
        draggable="true"
        data-evid="${p.id}" data-platform="yt" data-evtype="${p.type}" data-evtitle="${safeTitle}" data-evnotes="${(p.notes||'').replace(/"/g,'&quot;')}" data-evtime="${p.time||'10:00'}" data-evhost="${(p.host||'').replace(/"/g,'&quot;')}"
        onclick="calEditPlanned(event,'${p.id}','yt')"
        title="YT · ${p.time||''} ${safeTitle}${hostSuffix} (trascina per spostare)">${calPostChip('yt', p.type||'VIDEO', (p.time?p.time.slice(0,5)+' ':'')+safeTitle)}</div>`;
    });

    // La label del giorno settimana serve solo alla vista agenda mobile (il
    // grid da desktop la mostra già una volta sola in cima, in .cal-dow).
    const dowLabel = DOW[(date.getDay() + 6) % 7];
    h += `<div class="cal-day${cls}" data-date="${ds}"
      onclick="calDayClick(event,'${ds}')"
      ondragover="calDragOver(event)" ondrop="calDrop(event)" ondragleave="calDragLeave(event)">
      <span class="cal-day-num">${day}<span class="cal-day-dow">${dowLabel}${isToday ? ' · oggi' : ''}</span></span>
      ${posts}
      <div class="cal-plus">+</div>
    </div>`;
  }

  // Celle successive al mese
  const used = startDow + lastDay.getDate();
  const tail = (7 - (used % 7)) % 7;
  for (let i = 1; i <= tail; i++) {
    h += `<div class="cal-day other-month"><span class="cal-day-num">${i}</span></div>`;
  }

  grid.innerHTML = h;
}

function calDayClick(e, ds) {
  if (e.target.closest('.cal-post')) return;
  calOpenModal(ds, null);
}



function calShowYtDetail(e, encoded) {
  e.stopPropagation();
  const d = JSON.parse(decodeURIComponent(encoded));
  document.getElementById('cdBadge').innerHTML = '<svg class="brand-ico yt" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.5 12 3.5 12 3.5s-7.505 0-9.377.55a3.016 3.016 0 0 0-2.122 2.136C.5 8.056.5 12 .5 12s0 3.944.501 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.55 9.377.55 9.377.55s7.505 0 9.377-.55a3.016 3.016 0 0 0 2.122-2.136C23.5 15.944 23.5 12 23.5 12s0-3.944-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg> YT VIDEO';
  document.getElementById('cdBadge').style.background = 'rgba(255,0,0,0.2)';
  document.getElementById('cdBadge').style.color = '#ff6666';
  document.getElementById('cdTitle').textContent = d.title;
  // Costruisco la data leggibile
  const dt = d.date ? new Date(d.date + 'T00:00:00') : null;
  document.getElementById('cdDate').textContent = dt ? dt.toLocaleDateString('it-IT', { day:'numeric', month:'long', year:'numeric' }) : '—';
  // Reach → mostro views
  document.getElementById('cdReach').textContent = numIt(d.views || 0) + ' views · ' + numIt(d.likes || 0) + ' likes';
  document.getElementById('cdCaption').textContent = '';
  // Link a YouTube
  const linkEl = document.getElementById("cdLink");
  if (d.url) {
    linkEl.href = d.url;
    linkEl.innerHTML = '<svg class="brand-ico yt" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.5 12 3.5 12 3.5s-7.505 0-9.377.55a3.016 3.016 0 0 0-2.122 2.136C.5 8.056.5 12 .5 12s0 3.944.501 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.55 9.377.55 9.377.55s7.505 0 9.377-.55a3.016 3.016 0 0 0 2.122-2.136C23.5 15.944 23.5 12 23.5 12s0-3.944-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg> Apri su YouTube';
    linkEl.style.display = "inline-flex";
  } else {
    linkEl.style.display = "none";
  }
  document.getElementById("calDetail").classList.add("show");
}

function calShowDetail(e, encoded) {
  e.stopPropagation();
  const d = JSON.parse(decodeURIComponent(encoded));
  const TYPE = { IMAGE:'Foto', CAROUSEL_ALBUM:'Carosello', REELS:'Reel', VIDEO:'Video', SHORT:'Short', LIVE:'Live' };
  const dt = new Date(d.ts);
  const dateLabel = dt.toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'});
  const timeLabel = dt.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Rome'});
  const badge = document.getElementById('cdBadge');
  badge.innerHTML = '<svg class="brand-ico ig" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg> ' + (TYPE[d.type]||d.type);
  badge.className = 'cal-detail-badge ' + d.type;
  // Reset stile inline che YT detail aveva potenzialmente applicato
  badge.style.background = '';
  badge.style.color = '';
  document.getElementById('cdTitle').textContent = calShortTitle(d.caption) || 'Post';
  document.getElementById('cdDate').textContent = dateLabel + ' · ' + timeLabel;
  document.getElementById('cdReach').textContent = [
    d.views ? 'Visual: ' + numIt(d.views) : '',
    d.reach ? 'Reach: ' + numIt(d.reach) : '',
  ].filter(Boolean).join(' · ');
  document.getElementById('cdCaption').textContent = d.caption || '—';
  // Reset link: torna a "Apri su Instagram" e ricostruisce contenuto originale
  const linkEl = document.getElementById("cdLink");
  if (d.url) {
    linkEl.href = d.url;
    linkEl.style.display = 'inline-flex';
    linkEl.innerHTML = '<span class="material-symbols-rounded">open_in_new</span>Apri su Instagram';
  } else {
    linkEl.style.display = 'none';
  }
  document.getElementById('calDetail').classList.add('show');
}

async function calEditPlanned(e, id, platform) {
  e.stopPropagation();
  platform = platform || 'ig';

  let itemList = [];
  if (typeof gcalSignedIn !== 'undefined' && gcalSignedIn) {
    itemList = platform === 'yt' ? gcalGetYtPlanned() : gcalGetIgPlanned();
  } else {
    itemList = platform === 'yt' ? ytCalLoad() : calLoad();
  }

  const item = itemList.find(i => i.id === id);
  if (!item) {
    console.warn('calEditPlanned: evento non trovato', { id, platform });
    return;
  }

  // Se l'evento è collegato a un post reale nella coda di pubblicazione (Supabase),
  // recupero da lì media e didascalia veri — l'evento Google Calendar da solo non li conosce.
  let queuePost = null;
  if (platform === 'ig' && item.queuePostId) {
    try {
      const secret = await getPublishSecret();
      if (secret) {
        const res = await fetch(`${BACKEND_BASE}/api/schedule?action=list`, { headers: { 'X-Publish-Secret': secret } });
        const j = await res.json().catch(() => ({}));
        if (res.ok && Array.isArray(j.posts)) {
          queuePost = j.posts.find(p => p.id === item.queuePostId) || null;
        }
      }
    } catch(err) { console.warn('calEditPlanned: impossibile recuperare il post dalla coda', err); }
  }

  document.getElementById('calEditId').value = id;
  document.getElementById('calQueuePostId').value = queuePost ? queuePost.id : '';
  document.getElementById('calPlatform').value = platform;
  calOnPlatformChange(); // aggiorna pulsanti formato in base alla piattaforma
  document.getElementById('calDate').value = item.date;
  document.getElementById('calTime').value = item.time || '10:00';
  calSetType(item.type); // aggiorna pulsante tipo attivo

  document.getElementById('calTitle').value = item.title;

  // Preferisco la didascalia vera della coda (se collegata); altrimenti quella salvata
  // nelle note dell'evento Google Calendar (post più vecchi, o senza pubblicazione automatica).
  let editNotes = queuePost ? (queuePost.caption || '') : (item.notes || '');
  let editCollaborators = '';
  const collabMatch = editNotes.match(/\[COLLAB:([^\]]+)\]/);
  if (collabMatch) {
    editCollaborators = collabMatch[1];
    editNotes = editNotes.replace(/\s*\[COLLAB:[^\]]+\]/, '').trim();
  }

  // Destrutturiamo le note per il Bynor Editor
  const parsed = parseStructuredNotes(editNotes);
  document.getElementById('calStrategy').value = parsed.strategy;
  document.getElementById('calVisual').value = parsed.visual;
  document.getElementById('calScript').value = parsed.script;
  document.getElementById('calNotes').value = parsed.caption;

  document.getElementById('calCollaborators').value = editCollaborators;
  document.getElementById('calHost').value = item.host || '';
  document.getElementById('calModal').dataset.platform = platform;
  document.getElementById('calDeleteBtn').style.display = 'inline-flex';
  document.getElementById('calModalTitle').textContent = 'Modifica post';

  calResetUpload();
  if (queuePost && queuePost.mediaUrl) {
    calPopulateExistingMedia(queuePost.mediaType, queuePost.mediaUrl);
  }

  calToggleMediaField();
  calToggleHostField();
  calUpdateUploadInputMultiple();
  document.getElementById('calModal').classList.add('show');
}

function calOpenModal(ds, id) {
  document.getElementById('calEditId').value = id || '';
  document.getElementById('calQueuePostId').value = '';
  document.getElementById('calDate').value = ds || calDateStr(new Date());
  document.getElementById('calTime').value = '10:00';
  document.getElementById('calPlatform').value = 'ig';
  document.getElementById('calModal').dataset.platform = 'ig';
  document.getElementById('calTitle').value = '';
  document.getElementById('calStrategy').value = '';
  document.getElementById('calVisual').value = '';
  document.getElementById('calScript').value = '';
  document.getElementById('calNotes').value = '';
  document.getElementById('calHost').value = '';
  document.getElementById('calCollaborators').value = '';
  const ytTitleInput = document.getElementById('calYtTitle');
  if (ytTitleInput) ytTitleInput.value = '';
  document.getElementById('calDeleteBtn').style.display = 'none';
  document.getElementById('calModalTitle').textContent = 'Pianifica post';
  
  // Reset pulsanti piattaforma su Instagram
  document.querySelectorAll('#calPlatformGroup .cal-btn-option').forEach(b =>
    b.classList.toggle('active', b.dataset.val === 'ig')
  );
  // Renderizza pulsanti formato IG con Foto selezionata
  calRenderTypeButtons(CAL_IG_TYPES, 'IMAGE');
  const ytBanner = document.getElementById('calYtBanner');
  if (ytBanner) ytBanner.style.display = 'none';
  const notesField = document.getElementById('calNotesField');
  if (notesField) notesField.style.display = '';
  calResetUpload();
  calToggleMediaField();
  calToggleHostField();
  calUpdateUploadInputMultiple();
  calUpdateSlotHint();
  document.getElementById('calModal').classList.add('show');
}

async function generateCaptionFromUploadedImage() {
  const extraNotes = document.getElementById('calAiExtra')?.value.trim() || '';
  const mediaUrlInput = document.getElementById('calMediaUrl');
  const mediaUrl = mediaUrlInput ? mediaUrlInput.value.trim() : '';

  const btn = document.getElementById('calAiCaptionBtn');
  const notesField = document.getElementById('calNotes');
  if (!btn || !notesField) return;

  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="material-symbols-rounded" style="font-size:14px;animation:spin 1s linear infinite;">visibility</span> Scrittura caption AI…';

  const promptTopic = extraNotes || 'Analisi ed approfondimento fantacalcio Serie A per l\'asta';

  let prompt = `Sei il copywriter ed il content strategist ufficiale di @esperti_profeta_fantacalcio.
Genera la didascalia perfetta per Instagram basata su questo argomento/giocatore ed eventuale immagine caricata:

TOPIC / NOMI GIOCATORI: "${promptTopic}"
${mediaUrl ? `FILE MEDIA CARICATO: ${mediaUrl}` : ''}

REGOLE TASSATIVE:
1. HOOK D'IMPATTO INIZIALE: Inizia la prima riga con un gancio visivo fortissimo in MAIUSCOLO ed emoji (es. "${promptTopic.toUpperCase()} 👀" o "NOVITÀ ASTA FANTACALCIO 🔥").
2. ANALISI DEI DATI/GIOCATORI: Scrivi 3-5 righe sintetiche ed appassionate sul fantacalcio (consigli asta, gerarchie, titolarità, slot consigliato).
3. CALL TO ACTION: Chiudi con una domanda aperta per i commenti (es. "Voi ci punterete per l'asta? Scrivetelo nei commenti 👇").
4. HASHTAG: Inserisci esattamente 3-5 hashtag mirati (#fantacalcio #asta #seriea #progettoesperti).

Rispondi SOLO con il testo della didascalia pronta per essere copiata e pubblicata. Zero introduzioni o commenti prima.`;

  try {
    const res = await callClaudeForIdeas(prompt, null, 'ig');
    if (typeof res === 'string' && res.trim().length > 10) {
      notesField.value = res.trim();
    } else if (Array.isArray(res) && res[0]) {
      notesField.value = (res[0].body || res[0].title || JSON.stringify(res[0])).trim();
    } else {
      notesField.value = `🔥 ${promptTopic.toUpperCase()}\n\nAnalisi completa per l'asta del fantacalcio! Chi prendi tra questi nomi? Scrivilo nei commenti! 👇\n\n#fantacalcio #asta #seriea #progettoesperti`;
    }
  } catch(e) {
    console.error('Caption AI error:', e);
    notesField.value = `🔥 ${promptTopic.toUpperCase()}\n\nAnalisi strategica per la tua rosa di Fantacalcio! Titolarità, rendimento e slot consigliati per l'asta.\n\nVoi chi sceglierete? Scrivetelo qui sotto nei commenti! 👇\n\n#fantacalcio #asta #seriea #progettoesperti`;
  }

  btn.disabled = false;
  btn.innerHTML = originalHtml;
}

function calGenerateAiCaption() {
  return generateCaptionFromUploadedImage();
}

function calSetupEvents() {
  calSetupUpload();
  calSetupCoverUpload();
  const aiCaptionBtn = document.getElementById('calAiCaptionBtn');
  if (aiCaptionBtn) aiCaptionBtn.onclick = calGenerateAiCaption;
  document.getElementById('calPrev').onclick = () => {
    calCurrentDate = new Date(calCurrentDate.getFullYear(), calCurrentDate.getMonth()-1, 1);
    calRender();
  };
  document.getElementById('calNext').onclick = () => {
    calCurrentDate = new Date(calCurrentDate.getFullYear(), calCurrentDate.getMonth()+1, 1);
    calRender();
  };
  document.getElementById('calToday').onclick = () => {
    calCurrentDate = new Date();
    calRender();
  };
  document.getElementById('calAddBtn').onclick = () => calOpenModal(null, null);
  const qrb = document.getElementById('queueRefreshBtn');
  if (qrb) qrb.onclick = () => loadPublishQueue();
  document.getElementById('calCancelBtn').onclick = () => document.getElementById('calModal').classList.remove('show');
  document.getElementById('calModal').onclick = e => {
    if (e.target.id === 'calModal') document.getElementById('calModal').classList.remove('show');
  };
  document.getElementById('cdClose').onclick = () => document.getElementById('calDetail').classList.remove('show');
  document.getElementById('calDetail').onclick = e => {
    if (e.target.id === 'calDetail') document.getElementById('calDetail').classList.remove('show');
  };
  async function executeSaveAndPublish({ isImmediate = false } = {}) {
    const platform = document.getElementById('calPlatform')?.value || 'ig';
    const id = document.getElementById('calEditId')?.value || '';
    const existingQueueId = document.getElementById('calQueuePostId')?.value || '';
    const date = document.getElementById('calDate')?.value || '';
    const time = document.getElementById('calTime')?.value || '10:00';
    const type = document.getElementById('calType')?.value || 'IMAGE';
    const title = document.getElementById('calTitle')?.value.trim() || '';
    const caption = document.getElementById('calNotes')?.value.trim() || '';
    const extraNotes = document.getElementById('calAiExtra')?.value.trim() || '';

    const ytTitle = document.getElementById('calYtTitle')?.value.trim() || '';
    const autoTitle = caption ? caption.slice(0, 40).split('\n')[0].replace(/[#*]/g, '').trim() : (extraNotes || 'Post Instagram');
    const finalTitle = platform === 'yt' ? (ytTitle || 'Contenuto YouTube') : (title || autoTitle || 'Post Instagram');

    let finalDate = date;
    let finalTime = time;
    if (isImmediate) {
      const now = new Date();
      finalDate = now.toISOString().slice(0, 10);
      const hours = String(now.getHours()).padStart(2, '0');
      const mins = String(now.getMinutes()).padStart(2, '0');
      finalTime = `${hours}:${mins}`;
    } else if (!finalDate) {
      finalDate = calDateStr(new Date());
    }

    const strategy = document.getElementById('calStrategy')?.value.trim() || '';
    const visual = document.getElementById('calVisual')?.value.trim() || '';
    const script = document.getElementById('calScript')?.value.trim() || '';
    const serialized = serializeStructuredNotes(strategy, visual, script, caption);
    const collaboratorsRaw = (document.getElementById('calCollaborators')?.value.trim() || '');

    const finalNotes = (collaboratorsRaw && platform === 'ig')
      ? (serialized + (serialized ? '\n\n' : '') + '[COLLAB:' + collaboratorsRaw + ']')
      : serialized;

    const host = (platform === 'yt' && (type === 'LIVE' || type === 'ASTA_LIVE')) ? document.getElementById('calHost')?.value.trim() : '';

    let mediaUrl = document.getElementById('calMediaUrl')?.value.trim() || '';
    let mediaKind = document.getElementById('calMediaKind')?.value.trim() || '';
    const coverUrl = document.getElementById('calCoverUrl')?.value.trim() || '';

    if (type === 'REELS') {
      mediaKind = 'video';
    } else if (type === 'CAROUSEL_ALBUM') {
      mediaKind = 'carousel';
    } else if (!mediaKind) {
      mediaKind = 'image';
    }

    if (platform === 'ig' && type === 'REELS' && coverUrl && mediaUrl) {
      mediaUrl = mediaUrl + ',' + coverUrl;
    }

    const saveBtn = document.getElementById('calSaveBtn');
    const pubBtn = document.getElementById('calPublishNowBtn');
    const activeBtn = isImmediate ? pubBtn : saveBtn;
    const prevHtml = activeBtn ? activeBtn.innerHTML : '';

    if (activeBtn) {
      activeBtn.disabled = true;
      activeBtn.innerHTML = isImmediate 
        ? '<span class="material-symbols-rounded" style="font-size:14px;animation:spin 1s linear infinite;">progress_activity</span> Pubblicazione immediata in corso…'
        : '<span class="material-symbols-rounded" style="font-size:14px;animation:spin 1s linear infinite;">progress_activity</span> Programmazione in corso…';
    }

    let willAutoPublish = false;
    let scheduledPostId = null;

    try {
      if (platform === 'ig' && mediaUrl) {
        let scheduledAtIso;
        if (isImmediate) {
          scheduledAtIso = new Date().toISOString();
        } else {
          const localDateTime = new Date(`${finalDate}T${(finalTime || '10:00')}:00`);
          if (isNaN(localDateTime.getTime())) { 
            alert('Data o orario di pubblicazione non validi.'); 
            return; 
          }
          scheduledAtIso = localDateTime.toISOString();
        }

        if (isImmediate && typeof renderProgressBar === 'function') {
          renderProgressBar('calUploadStatus', 20, 'Salvataggio in coda…');
        }

        // STEP 1: Salva nella coda di pubblicazione del backend (/api/schedule).
        // Se stiamo modificando un post già collegato alla coda, aggiorno quella riga
        // invece di crearne una seconda (altrimenti ogni modifica duplicherebbe il post).
        const scheduledPost = await schedulePublish({ mediaUrl, mediaKind, caption: finalNotes, scheduledAtIso, existingQueueId: existingQueueId || null });
        scheduledPostId = scheduledPost?.id || existingQueueId || null;
        willAutoPublish = true;

        // STEP 2: Se PUBBLICAZIONE IMMEDIATA, forza subito l'esecuzione del cron SOLO per questo post.
        // I Reel usano il polling passo-passo (pollReelPublish): non blocchiamo mai una
        // singola richiesta in attesa che Meta finisca di processare il video.
        if (isImmediate) {
          if (type === 'REELS') {
            if (typeof renderProgressBar === 'function') renderProgressBar('calUploadStatus', 45, 'Invio a Instagram Graph API…');
            if (!scheduledPostId) throw new Error('Post non salvato correttamente in coda.');
            await pollReelPublish(scheduledPostId, {
              onProgress: (msg) => { if (typeof renderProgressBar === 'function') renderProgressBar('calUploadStatus', 75, msg); }
            });
          } else {
            if (typeof renderProgressBar === 'function') renderProgressBar('calUploadStatus', 75, 'Invio a Instagram Graph API…');
            const secret = await getPublishSecret();
            if (secret && typeof BACKEND_BASE !== 'undefined') {
              const qp = scheduledPostId ? `&postId=${encodeURIComponent(scheduledPostId)}` : '';
              const pubRes = await fetch(`${BACKEND_BASE}/api/cron-publish?immediate=1${qp}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Publish-Secret': secret }
              });
              const pubData = await pubRes.json().catch(() => ({}));
              if (!pubRes.ok || pubData.error) {
                throw new Error(pubData.error || pubData.details || `Pubblicazione immediata fallita (HTTP ${pubRes.status})`);
              }
              if (pubData.published === 0 && pubData.failed > 0) {
                const errMsg = pubData.results?.find(r => !r.ok)?.error || 'Errore durante la pubblicazione su Instagram.';
                throw new Error(`Instagram ha rifiutato il post: ${errMsg}`);
              }
              if (pubData.published === 0) {
                console.warn('Pubblicazione immediata: nessun post pubblicato. Verifica la coda.');
              }
            }
          }
          if (typeof renderProgressBar === 'function') {
            renderProgressBar('calUploadStatus', 100, '⚡ Pubblicato con successo!', 'var(--pos)');
          }
        }
      }

      // Aggiorna bacheca e calendario visivo
      const titleForCal = willAutoPublish ? ('✅ ' + finalTitle) : finalTitle;
      const notesForCal = willAutoPublish
        ? (finalNotes + '\n\n[Pubblicazione automatica programmata · media caricato]')
        : finalNotes;

      // Collego l'evento Google Calendar al post reale della coda (se esiste), così
      // riaprendolo con "Modifica" la modale può recuperare media e didascalia veri
      // invece di mostrarli vuoti.
      const linkedQueueId = platform === 'ig' ? (scheduledPostId || existingQueueId || '') : '';

      if (gcalSignedIn) {
        if (id) { await gcalUpdateEvent(id, platform, finalDate, finalTime, type, titleForCal, notesForCal, host, linkedQueueId); }
        else { await gcalCreateEvent(platform, finalDate, finalTime, type, titleForCal, notesForCal, host, linkedQueueId); }
      } else {
        const loadFn = platform === 'yt' ? ytCalLoad : calLoad;
        const saveFn = platform === 'yt' ? ytCalSave : calSave;
        const renderFn = platform === 'yt' ? ytRender : calRender;
        const items = loadFn();
        if (id) {
          const idx = items.findIndex(i => i.id === id);
          if (idx >= 0) items[idx] = {id, date: finalDate, time: finalTime, type, title: titleForCal, notes: notesForCal, host};
        } else {
          items.push({id: Date.now().toString(), date: finalDate, time: finalTime, type, title: titleForCal, notes: notesForCal, host});
        }
        saveFn(items);
        renderFn();
      }

      const fromIdea = document.getElementById('calModal').dataset.fromIdea;
      if (fromIdea) {
        if (typeof boardLoadIdeas === 'function' && typeof boardSaveIdeas === 'function') {
          const ideas = boardLoadIdeas().filter(i => i.id !== fromIdea);
          boardSaveIdeas(ideas);
          if (typeof boardRenderIdeas === 'function') boardRenderIdeas();
        }
        delete document.getElementById('calModal').dataset.fromIdea;
      }

      document.getElementById('calModal').classList.remove('show');

      if (navigator.vibrate) navigator.vibrate(12);
      if (isImmediate) {
        // Ricarica la coda pubblicazione per mostrare il nuovo stato
        if (typeof loadPublishQueue === 'function') setTimeout(loadPublishQueue, 1000);
        if (typeof toast === 'function') toast('Reel/Post pubblicato su Instagram', 'ok', 3500);
        else alert('⚡ Reel/Post pubblicato con successo su Instagram!');
      } else {
        // Programma contenuto: feedback via toast (prima era un setStatus non
        // visibile su mobile — l'utente non sapeva se era andato a buon fine).
        if (typeof toast === 'function') toast('Post programmato nel calendario', 'ok', 3200);
        else if (setStatus) setStatus('ok', 'Post programmato con successo');
      }

    } catch(e) {
      console.error('Save & Publish Error:', e);
      alert('Errore durante la pubblicazione/programmazione: ' + (e.message || e));
    } finally {
      if (activeBtn) {
        activeBtn.disabled = false;
        activeBtn.innerHTML = prevHtml;
      }
    }
  }

  document.getElementById('calSaveBtn').onclick = () => executeSaveAndPublish({ isImmediate: false });
  window.calPublishNow = () => executeSaveAndPublish({ isImmediate: true });
  document.getElementById('calDeleteBtn').onclick = async () => {
    const platform = document.getElementById('calPlatform').value || 'ig';
    const id = document.getElementById('calEditId').value;
    const queuePostId = document.getElementById('calQueuePostId').value;
    if (!id) { alert('ID evento mancante.'); return; }
    if (!confirm('Eliminare questo post pianificato?')) return;

    const btn = document.getElementById('calDeleteBtn');
    btn.disabled = true;
    btn.textContent = 'Eliminazione...';

    // Se il post è collegato alla coda di pubblicazione automatica, elimino anche
    // quella riga: altrimenti resterebbe lì e verrebbe pubblicata comunque.
    if (queuePostId) {
      try {
        const secret = await getPublishSecret();
        if (secret) {
          await fetch(`${BACKEND_BASE}/api/schedule?action=delete&id=${encodeURIComponent(queuePostId)}`, {
            method: 'POST',
            headers: { 'X-Publish-Secret': secret }
          });
        }
      } catch(err) {
        console.error('Eliminazione dalla coda fallita:', err);
      }
    }

    try {
      if (gcalSignedIn) {
        // Verifica che l'evento esista nella cache locale
        const exists = gcalEvents.some(e => e.id === id);
        if (!exists) {
          // L'evento non c'è nella cache — provo a ricaricare prima di tentare la delete
          await gcalLoadEvents();
        }
        const ok = await gcalDeleteEvent(id);
        if (!ok) {
          btn.disabled = false;
          btn.textContent = 'Elimina';
          return; // tengo il modal aperto se errore
        }
      } else {
        // Fallback localStorage
        const loadFn = platform === 'yt' ? ytCalLoad : calLoad;
        const saveFn = platform === 'yt' ? ytCalSave : calSave;
        saveFn(loadFn().filter(i => i.id !== id));
        calRender();
      }
      if (queuePostId && typeof loadPublishQueue === 'function') loadPublishQueue();
      document.getElementById('calModal').classList.remove('show');
    } catch(e) {
      console.error('Delete error:', e);
      alert('Errore: ' + (e?.message || 'sconosciuto'));
    } finally {
      btn.disabled = false;
      btn.textContent = 'Elimina';
    }
  };
}
