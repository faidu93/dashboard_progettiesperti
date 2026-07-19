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
  {value:'REELS',     label:'▶ Reel'},
  {value:'STORY',     label:'◈ Story'}
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

// ===== SUGGERITORE DI SLOT ORARIO (#2) =====
// Valuta data+ora scelte nel modal contro le fasce prime-time validate dal
// benchmark di settore (mar/gio 10-13 e 15-18 i picchi; mer mattina buono;
// domenica e tarda sera deboli). Mostra un hint colorato, non blocca nulla.
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

  if ((dow === 2 || dow === 4) && (inMorning || inAfternoon)) {
    level = 'best';
    msg = `${DOW[dow]} ${String(h).padStart(2,'0')}:00 · slot prime-time (picco +16% engagement)`;
  } else if (dow === 3 && inMorning) {
    level = 'best';
    msg = `Mercoledì mattina · fascia forte per la tua audience`;
  } else if ((inMorning || inAfternoon || inLunch || inEvening) && dow !== 0) {
    level = 'good';
    msg = `${DOW[dow]} ${String(h).padStart(2,'0')}:00 · fascia discreta`;
  } else if (dow === 0) {
    level = 'weak';
    msg = `Domenica · giorno meno prevedibile, engagement variabile`;
  } else if (h >= 22 || h < 7) {
    level = 'weak';
    msg = `Tarda sera/notte · fascia debole, poca attività`;
  } else {
    level = 'good';
    msg = `${DOW[dow]} ${String(h).padStart(2,'0')}:00 · fascia neutra`;
  }

  const styles = {
    best: { bg: 'rgba(46,204,113,0.12)', bd: 'var(--pos)', col: 'var(--pos)', ico: '✅' },
    good: { bg: 'rgba(255,140,30,0.10)', bd: 'rgba(255,140,30,0.4)', col: 'var(--accent)', ico: '○' },
    weak: { bg: 'rgba(231,76,60,0.10)', bd: 'rgba(231,76,60,0.4)', col: 'var(--neg)', ico: '⚠' }
  };
  const s = styles[level];
  hint.style.display = 'block';
  hint.style.background = s.bg;
  hint.style.border = '1px solid ' + s.bd;
  hint.style.color = s.col;
  hint.innerHTML = `${s.ico} ${msg}`;
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
      const reach = p.media_reach ? ' · ' + numIt(p.media_reach) : '';
      const encoded = encodeURIComponent(JSON.stringify({
        type: p.media_type,
        caption: (p.media_caption||'').slice(0,300),
        reach: p.media_reach,
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

    h += `<div class="cal-day${cls}" data-date="${ds}"
      onclick="calDayClick(event,'${ds}')"
      ondragover="calDragOver(event)" ondrop="calDrop(event)" ondragleave="calDragLeave(event)">
      <span class="cal-day-num">${day}</span>
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



async function repurposeYoutubeToInstagram(url) {
  try {
    let videoId = "";
    try {
      if (url.includes("v=")) videoId = url.split("v=")[1].split("&")[0];
      else if (url.includes("youtu.be/")) videoId = url.split("youtu.be/")[1].split("?")[0];
    } catch(e) {}
    
    if(!videoId) { alert("Impossibile estrarre l\"ID del video."); return; }

    document.getElementById("calDetail").classList.remove("show");
    const intTabBtn = document.querySelector('button[data-tab="intelligence"]');
    if (intTabBtn) tabSwitch(intTabBtn);
    setTimeout(() => {
      const igSection = document.getElementById('igIntelConfig');
      if(igSection) igSection.scrollIntoView({behavior: 'smooth', block: 'start'});
    }, 100);
    
    loadingStart();
    document.getElementById('loadingTitle').textContent = 'Riciclo Contenuti AI';
    loadingStep('yt_sub', 'Estraggo i sottotitoli del video YouTube...', 'active');

    const res = await fetch(BACKEND_BASE + "/api/youtube-transcript?videoId=" + videoId);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Errore fetch transcript");

    loadingDone('yt_sub', 'Sottotitoli estratti.');

    let userReq = prompt(
      "Cosa vuoi creare da questo video?\nEs: \"3 Reel tecnici e 1 Carosello divertente\" oppure \"1 post testuale su X\"", 
      "3 idee per Reel e 2 per Caroselli"
    );
    if (!userReq) {
      loadingFinish(false);
      return; 
    }

    loadingStep('yt_claude', 'Genero idee di contenuto con Claude...', 'active');

    const claudePrompt = "Ecco l\"esatto transcript di un mio video YouTube appena scaricato:\n\n\"" + data.transcript + "\"\n\nAgisci come un Social Media Manager esperto.\nEstrai i concetti di maggior valore e trasformali in idee di contenuto per Instagram (per il mio account, usa il tono informale, appassionato e dritto al punto che mi contraddistingue).\n\nVoglio che crei esattamente:\n" + userReq + "\n\nDevono essere formattate esattamente usando il formato standard richiesto dal mio sistema, ossia:\nNUMERO) [FORMATO] - TITOLO FORTE\n[Spiegazione del contenuto, gancio iniziale, sviluppo ed eventuale call to action]";

    const ideas = await callClaudeForIdeas(claudePrompt, "igIdeas", "ig");
    
    loadingDone('yt_claude', 'Idee generate e salvate!');
    
    document.getElementById('igIntelConfig').style.display = 'none';
    document.getElementById('igIntelOutput').style.display = 'block';
    const nowStr = new Date().toLocaleString('it-IT');
    document.getElementById('igIntelOutTitle').textContent = 'Idee da YouTube · ' + nowStr;
    
    renderIdeas(ideas, "igIdeas", "ig", null, {});
    setTimeout(() => loadingFinish(true), 800);

  } catch(e) {
    console.error(e);
    loadingError('yt_err', e.message);
    setTimeout(() => loadingFinish(false), 2500);
  }
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
  const repBtn = document.getElementById("cdRepurposeBtn");
  if (d.url) {
    linkEl.href = d.url;
    linkEl.innerHTML = '<svg class="brand-ico yt" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.5 12 3.5 12 3.5s-7.505 0-9.377.55a3.016 3.016 0 0 0-2.122 2.136C.5 8.056.5 12 .5 12s0 3.944.501 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.55 9.377.55 9.377.55s7.505 0 9.377-.55a3.016 3.016 0 0 0 2.122-2.136C23.5 15.944 23.5 12 23.5 12s0-3.944-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg> Apri su YouTube';
    linkEl.style.display = "inline-flex";
    repBtn.style.display = "inline-flex";
    repBtn.onclick = () => repurposeYoutubeToInstagram(d.url);
  } else {
    linkEl.style.display = "none";
    repBtn.style.display = "none";
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
  document.getElementById('cdReach').textContent = d.reach ? 'Reach: ' + numIt(d.reach) : '';
  document.getElementById('cdCaption').textContent = d.caption || '—';
  // Reset link: torna a "Apri su Instagram" e ricostruisce contenuto originale
  const linkEl = document.getElementById("cdLink");
  const repBtn = document.getElementById("cdRepurposeBtn");
  if(repBtn) repBtn.style.display = "none";
  if (d.url) {
    linkEl.href = d.url;
    linkEl.style.display = 'inline-flex';
    linkEl.innerHTML = '<span class="material-symbols-rounded">open_in_new</span>Apri su Instagram';
  } else {
    linkEl.style.display = 'none';
  }
  document.getElementById('calDetail').classList.add('show');
}

function calEditPlanned(e, id, platform) {
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
  document.getElementById('calEditId').value = id;
  document.getElementById('calPlatform').value = platform;
  calOnPlatformChange(); // aggiorna pulsanti formato in base alla piattaforma
  document.getElementById('calDate').value = item.date;
  document.getElementById('calTime').value = item.time || '10:00';
  calSetType(item.type); // aggiorna pulsante tipo attivo
  document.getElementById('calTitle').value = item.title;
  // Estrai il tag [COLLAB:...] dalle note e ripristina il campo collaboratori
  let editNotes = item.notes || '';
  let editCollaborators = '';
  const collabMatch = editNotes.match(/\[COLLAB:([^\]]+)\]/);
  if (collabMatch) {
    editCollaborators = collabMatch[1];
    editNotes = editNotes.replace(/\s*\[COLLAB:[^\]]+\]/, '').trim();
  }
  document.getElementById('calNotes').value = editNotes;
  document.getElementById('calCollaborators').value = editCollaborators;
  document.getElementById('calHost').value = item.host || '';
  document.getElementById('calModal').dataset.platform = platform;
  document.getElementById('calDeleteBtn').style.display = 'inline-flex';
  document.getElementById('calModalTitle').textContent = 'Modifica post';
  calResetUpload();
  calToggleMediaField();
  calToggleHostField();
  calUpdateUploadInputMultiple();
  document.getElementById('calModal').classList.add('show');
}

function calOpenModal(ds, id) {
  document.getElementById('calEditId').value = id || '';
  document.getElementById('calDate').value = ds || calDateStr(new Date());
  document.getElementById('calTime').value = '10:00';
  document.getElementById('calPlatform').value = 'ig';
  document.getElementById('calModal').dataset.platform = 'ig';
  document.getElementById('calTitle').value = '';
  document.getElementById('calNotes').value = '';
  document.getElementById('calHost').value = '';
  document.getElementById('calCollaborators').value = '';
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

async function calGenerateAiCaption() {
  const title = document.getElementById('calTitle').value.trim();
  const notes = document.getElementById('calNotes').value.trim();
  const platform = document.getElementById('calPlatform').value;
  const type = document.getElementById('calType').value;

  if (!title) {
    alert('Inserisci prima il titolo o l\'idea del post per guidare l\'AI.');
    return;
  }

  const secret = getPublishSecret();
  if (!secret) {
    const inputSecret = prompt('Inserisci la password di pubblicazione per abilitare l\'AI:');
    if (!inputSecret) return;
    try {
      sessionStorage.setItem('publish_secret', inputSecret);
      localStorage.setItem('publish_secret', inputSecret);
    } catch(e) {}
  }

  const btn = document.getElementById('calAiCaptionBtn');
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="material-symbols-rounded" style="font-size:14px;animation:spin 1s linear infinite;">progress_activity</span> Scrittura…';

  let selectedModel = 'claude-sonnet-5';
  try { selectedModel = localStorage.getItem('intel_model') || 'claude-sonnet-5'; } catch(e) {}

  const extra = document.getElementById('calAiExtra').value.trim();

  // Estrai dinamicamente fino a 3 didascalie reali per fare da esempio
  let examplesText = "";
  const realPosts = (calPublishedPosts || [])
    .filter(p => p.media_caption && p.media_caption.trim().length > 40)
    .slice(0, 3);

  if (realPosts.length > 0) {
    examplesText = "Ecco alcuni esempi reali di didascalie pubblicate in precedenza su questa pagina per comprenderne lo stile, la lunghezza e la struttura:\n\n";
    realPosts.forEach((p, idx) => {
      examplesText += `--- ESEMPIO ${idx + 1} ---\n${p.media_caption.trim()}\n\n`;
    });
  } else {
    // Fallback statico basato sui migliori post reali analizzati
    examplesText = `Ecco lo stile esatto da seguire, preso da post di successo già pubblicati su questa pagina:\n\n` +
      `--- ESEMPIO 1 ---\n` +
      `Fazzini al Cagliari 👀 \n` +
      `Un talento che sembrava esplodere all'Empoli, ora riparte in una piazza calda e affamata di calcio come Cagliari.\n\n` +
      `Per lui può essere la stagione della svolta definitiva — o un altro step di crescita rimandato.\n\n` +
      `Al fanta la domanda è una sola: **talento da lanciare o scommessa troppo rischiosa?**\n\n` +
      `Voi ci punterete al fantacalcio? Scrivetelo nei commenti 👇\n\n` +
      `#Fazzini #FantacalcioSerieA #Cagliari\n\n` +
      `--- ESEMPIO 2 ---\n` +
      `Taylor alla Lazio: scommessa da bonus o regolarista? 🔍\n` +
      `Ambidestro, visione di gioco, tiro in porta e tanta corsa. Kenneth Taylor ha tutto per accendere la luce a Formello, ma la sua appetibilità al Fantacalcio dipenderà interamente dal ruolo. Più lontano dalla porta perde fascino, dietro la punta diventa un potenziale top di reparto.\n\n` +
      `Tu ci punterai alla prossima asta? E soprattutto: in che ruolo pensi possa fare svoltare la tua rosa?\n` +
      `Lascia un commento qui sotto. Parliamone. 💬\n\n` +
      `#ProgettoEsperti #Lazio #Fantacalcio`;
  }

  const sysPrompt = `Sei l'AI Copywriter ufficiale di "Progetto Esperti", community di riferimento in Italia per il fantacalcio e l'analisi di Serie A. Il tuo stile di scrittura è diretto, professionale ma estremamente amichevole, cordiale ed empatico. Parla da appassionato esperto che vuole dare valore concreto ai fantallenatori, evitando assolutamente toni arroganti o da "fenomeno" (non ergerti a guru infallibile).

REGOLE DI SCRITTURA TASSATIVE (DA SEGUIRE RIGIDAMENTE):
1. NO PREAMBOLI/CHIUSURE: Inizia direttamente con il testo da copiare. Non scrivere mai formule introduttive o finali (es. "Ecco la didascalia..."), né racchiudere il testo in virgolette o parentesi.
2. HOOK INIZIALE SHOCK: Inizia sempre la prima riga con un gancio visivo fortissimo ed evidente. Usa parole chiave o nomi in MAIUSCOLO seguiti da un'emoji (es. "FAZZINI AL CAGLIARI 👀" o "🇳🇬 AKOR ADAMS AL VENEZIA"). Deve costringere chi scorre il feed a fermarsi e leggere.
3. CONCISIONE E RITMO: Scrivi didascalie brevi e dinamiche (max 80-120 parole). Paragrafi corti (1-2 frasi al massimo) separati da una riga vuota.
4. GRASSETTO TATTICO: Usa il grassetto markdown (**) solo una volta nel post, esclusivamente per evidenziare il dubbio strategico o la scelta cruciale al fanta (es. **talento da lanciare o scommessa troppo rischiosa?**).
5. EVITA CLICHÉ DA AI: Non usare mai formule trite come "Benvenuti", "Ehi fantallenatori", "Scopriamo insieme", "Nel panorama", "Incredibile". Evita transizioni inutili come "infatti", "tuttavia", "dunque". Usa il gergo calcistico reale ed esperto ("asta", "fanta", "gerarchie", "titolarità", "regolarista", "bonus").
6. FINALITÀ DEL POST & CALL TO ACTION (CTA): Ogni post deve avere un singolo e chiarissimo obiettivo strategico. In base all'idea del post e alle note, determina e applica in modo naturale solo UNA delle seguenti tre finalità:
   - DISCUSSIONE / COMMENTI (Default): Chiudi con una domanda aperta e diretta per far esprimere i follower nei commenti (es. "Voi ci punterete? Scrivetelo nei commenti 👇").
   - RIMANDO YOUTUBE: Se il post fa riferimento a un video approfondito, a novità di calciomercato o analisi ampie, invita gli utenti a guardare il video completo su YouTube (es. "Trovi il video approfondimento al link in stories o in bio 🎬").
   - CRESCITA CANALE TELEGRAM: Se il post parla di consigli pratici, aste, gerarchie, news H24 o supporto diretto, invita gli utenti ad entrare nel Canale Telegram Privato (es. "Per consigli continui H24 e supporto sulla tua rosa, entra nel nostro gruppo Telegram privato (link in bio) 📲").
   Lascia sempre una riga vuota prima di questa CTA.
7. HASHTAG — SELEZIONE INTELLIGENTE DALLA BANCA HASHTAG:
   Alla fine del post, lascia una riga vuota e inserisci ESATTAMENTE 3 hashtag Capitalizzati scelti dalla banca qui sotto. Scegli quelli più pertinenti al contenuto specifico del post. Mescola SEMPRE: 1 hashtag brand/fisso + 2 hashtag contestuali al tema.

   HASHTAG FISSO/BRAND (usa sempre UNO di questi):
   #Fantacalcio | #FantacalcioSerieA | #ProgettoEsperti

   HASHTAG CONTESTUALI — scegli 2 in base al tema del post:

   • POST SU GIOCATORE SPECIFICO (acquisto, analisi, trasferimento):
     #ConsigliFantacalcio | #FantaConsigli | #FantaAllenatori | #SerieA | #Calciomercato

   • POST SU CONSIGLI / CHI SCHIERARE / FORMAZIONI:
     #ChiSchierare | #ProbabiliFormazioni | #FantaConsigli | #ConsigliFantacalcio | #UltimeDaiCampi

   • POST SU ASTA / MERCATO / RIPARAZIONE:
     #AstaFantacalcio | #CalciomercatoFanta | #FantaMercato | #ScambiFantacalcio | #StrategiaFanta

   • POST SU VOTI / GIORNATA / RISULTATI:
     #VotiFantacalcio | #GiornataFantacalcio | #FantaVoti | #SerieA | #AnalisiFantacalcio

   • POST COMMUNITY / ENGAGEMENT / SONDAGGIO:
     #LegheFantacalcio | #FantaMaster | #Fantapazz | #FantaAllenatori | #ComunityFanta

   • POST VIDEO / REEL / CONTENUTO VIRALE:
     #CalcioReel | #ReelCalcio | #FantacalcioVideo | #SerieAHighlights | #CalcioItaliano

   • POST TELEGRAM / GRUPPO / COMMUNITY:
     #GruppoTelegram | #FantaConsigli | #LegheFantacalcio | #FantaMaster | #ConsigliFantacalcio

   NON usare mai più o meno di 3 hashtag. NON inventare hashtag fuori dalla banca.
${examplesText}`;

  let promptText = `Crea ora una didascalia personalizzata basandoti su queste informazioni:\n`;
  promptText += `Titolo/Idea del post: ${title}\n`;
  promptText += `Formato del post: ${type}\n`;
  if (notes) {
    promptText += `Contesto/Note di partenza: ${notes}\n`;
  }
  if (extra) {
    promptText += `Informazioni o parole chiave da inserire assolutamente: ${extra}\n`;
  }

  try {
    const res = await fetch(BACKEND_BASE + '/api/claude', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Publish-Secret': getPublishSecret()
      },
      body: JSON.stringify({
        model: selectedModel,
        max_tokens: 1500,
        messages: [
          { role: 'user', content: sysPrompt + "\n\n" + promptText }
        ]
      })
    });
    
    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    if (text) {
      document.getElementById('calNotes').value = text;
    } else {
      alert('Nessun testo generato. Riprova.');
    }
  } catch (e) {
    alert('Errore nella generazione: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
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
  document.getElementById('calSaveBtn').onclick = async () => {
    const platform = document.getElementById('calPlatform').value || 'ig';
    const id = document.getElementById('calEditId').value;
    const date = document.getElementById('calDate').value;
    const time = document.getElementById('calTime').value;
    const type = document.getElementById('calType').value;
    const title = document.getElementById('calTitle').value.trim();
    const notes = document.getElementById('calNotes').value.trim();
    const collaboratorsRaw = (document.getElementById('calCollaborators') ? document.getElementById('calCollaborators').value.trim() : '');
    // Appende il tag [COLLAB:...] in fondo alle note se ci sono collaboratori e siamo su IG
    const finalNotes = (collaboratorsRaw && platform === 'ig')
      ? (notes + (notes ? '\n\n' : '') + '[COLLAB:' + collaboratorsRaw + ']')
      : notes;
    const host = (platform === 'yt' && (type === 'LIVE' || type === 'ASTA_LIVE')) ? document.getElementById('calHost').value.trim() : '';
    if (!date || !title) { alert('Inserisci almeno data e titolo.'); return; }

    // --- PUBBLICAZIONE REALE: solo IG + media caricato ---
    let mediaUrl = document.getElementById('calMediaUrl') ? document.getElementById('calMediaUrl').value : '';
    let mediaKind = document.getElementById('calMediaKind') ? document.getElementById('calMediaKind').value : '';
    const coverUrl = document.getElementById('calCoverUrl') ? document.getElementById('calCoverUrl').value : '';

    if (type === 'CAROUSEL_ALBUM') {
      mediaKind = 'carousel';
    }
    
    // Comma-separate coverUrl for Reels if it exists
    if (platform === 'ig' && type === 'REELS' && coverUrl && mediaUrl) {
      mediaUrl = mediaUrl + ',' + coverUrl;
    }

    let willAutoPublish = false;
    if (platform === 'ig' && mediaUrl) {
      const localDateTime = new Date(`${date}T${(time || '10:00')}:00`);
      if (isNaN(localDateTime.getTime())) { alert('Data/ora non valide.'); return; }
      if (localDateTime.getTime() < Date.now() - 60000) {
        if (!confirm('L\'orario scelto è nel passato: il post verrà pubblicato al prossimo giro del cron. Continuare?')) return;
      }
      const saveBtn = document.getElementById('calSaveBtn');
      const prevLabel = saveBtn.innerHTML;
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<span class="material-symbols-rounded">progress_activity</span>Accodo pubblicazione…';
      try {
        await schedulePublish({ mediaUrl, mediaKind, caption: finalNotes, scheduledAtIso: localDateTime.toISOString() });
        willAutoPublish = true;
      } catch (e) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = prevLabel;
        alert('Errore nella programmazione della pubblicazione: ' + (e.message || 'sconosciuto'));
        return;
      }
      saveBtn.disabled = false;
      saveBtn.innerHTML = prevLabel;
    }
    // Marco titolo/note per distinguere i post auto-pubblicati in calendario
    const titleForCal = willAutoPublish ? ('✅ ' + title) : title;
    const notesForCal = willAutoPublish
      ? (finalNotes + '\n\n[Pubblicazione automatica programmata · media già caricato]')
      : finalNotes;

    // Se Google connesso, scrive direttamente su Google Calendar
    if (gcalSignedIn) {
      if (id) { await gcalUpdateEvent(id, platform, date, time, type, titleForCal, notesForCal, host); }
      else { await gcalCreateEvent(platform, date, time, type, titleForCal, notesForCal, host); }
      // Hook bacheca idee
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
      return;
    }
    // Fallback localStorage (Google non connesso)
    const loadFn = platform === 'yt' ? ytCalLoad : calLoad;
    const saveFn = platform === 'yt' ? ytCalSave : calSave;
    const renderFn = platform === 'yt' ? ytRender : calRender;
    const items = loadFn();
    if (id) {
      const idx = items.findIndex(i => i.id === id);
      if (idx >= 0) items[idx] = {id, date, time, type, title: titleForCal, notes: notesForCal, host};
    } else {
      items.push({id: Date.now().toString(), date, time, type, title: titleForCal, notes: notesForCal, host});
    }
    saveFn(items);
    // Se viene da un'idea, rimuovo l'idea dalla bacheca (è stata "spostata" nel calendario)
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
    renderFn();
  };
  document.getElementById('calDeleteBtn').onclick = async () => {
    const platform = document.getElementById('calPlatform').value || 'ig';
    const id = document.getElementById('calEditId').value;
    if (!id) { alert('ID evento mancante.'); return; }
    if (!confirm('Eliminare questo post pianificato?')) return;

    const btn = document.getElementById('calDeleteBtn');
    btn.disabled = true;
    btn.textContent = 'Eliminazione...';

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


