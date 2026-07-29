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

function parseAiTextToEditorFields(text) {
  const result = {
    strategy: '',
    visual: '',
    script: '',
    caption: ''
  };
  
  if (!text) return result;
  
  // Dividiamo in blocchi usando lookahead per intercettare i tag
  const sections = text.split(/(?=\n(?:STRATEGIA|Strategia|OBIETTIVO|Obiettivo|VISUAL|Visual|CONTESTO VISIVO|Contesto visivo|COPIONE|Copione|SCRIPT|Script|DIDASCALIA|Didascalia|CAPTION|Caption|Slide \d|SLIDE \d)[:\n\-#])/i);
  
  let unclassified = [];
  
  sections.forEach(sec => {
    const trimmed = sec.trim();
    if (!trimmed) return;
    
    if (trimmed.match(/^(?:STRATEGIA|Strategia|OBIETTIVO|Obiettivo)[:\n\-#\s]/i)) {
      result.strategy = trimmed.replace(/^(?:STRATEGIA|Strategia|OBIETTIVO|Obiettivo)[:\n\-#\s]+/i, '').trim();
    } else if (trimmed.match(/^(?:VISUAL|Visual|CONTESTO VISIVO|Contesto visivo|GRAFICA|Grafica)[:\n\-#\s]/i)) {
      result.visual = trimmed.replace(/^(?:VISUAL|Visual|CONTESTO VISIVO|Contesto visivo|GRAFICA|Grafica)[:\n\-#\s]+/i, '').trim();
    } else if (trimmed.match(/^(?:COPIONE|Copione|SCRIPT|Script|STRUTTURA|Struttura)[:\n\-#\s]/i)) {
      result.script = trimmed.replace(/^(?:COPIONE|Copione|SCRIPT|Script|STRUTTURA|Struttura)[:\n\-#\s]+/i, '').trim();
    } else if (trimmed.match(/^(?:DIDASCALIA|Didascalia|CAPTION|Caption)[:\n\-#\s]/i)) {
      result.caption = trimmed.replace(/^(?:DIDASCALIA|Didascalia|CAPTION|Caption)[:\n\-#\s]+/i, '').trim();
    } else {
      unclassified.push(trimmed);
    }
  });
  
  if (!result.caption && !result.script) {
    result.caption = text.trim();
  } else if (unclassified.length > 0) {
    if (result.caption) {
      result.caption += '\n\n' + unclassified.join('\n\n');
    } else {
      result.script += '\n\n' + unclassified.join('\n\n');
    }
  }
  
  return result;
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
  const platform = document.getElementById('calPlatform')?.value || 'ig';
  const type = document.getElementById('calType')?.value || 'IMAGE';

  if (mediaField) mediaField.style.display = 'block';
  if (collabField) collabField.style.display = (platform === 'ig') ? 'block' : 'none';
  if (coverField) coverField.style.display = (platform === 'ig' && type === 'REELS') ? 'block' : 'none';
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
    const intTabBtn = document.querySelector('button[data-tab="contentstudio"]');
    if (intTabBtn) tabSwitch(intTabBtn);
    setTimeout(() => {
      // Switcha al sotto-tab Generatore Idee e scrolla al form IG
      intelSwitchSubTab('studio');
      const igSection = document.getElementById('igIntelConfig');
      if(igSection) igSection.scrollIntoView({behavior: 'smooth', block: 'start'});
    }, 150);
    
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
  document.getElementById('calStrategy').value = '';
  document.getElementById('calVisual').value = '';
  document.getElementById('calScript').value = '';
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
  document.getElementById('calSaveBtn').onclick = async () => {
    const platform = document.getElementById('calPlatform').value || 'ig';
    const id = document.getElementById('calEditId').value;
    const date = document.getElementById('calDate').value;
    const time = document.getElementById('calTime').value;
    const type = document.getElementById('calType').value;
    const title = document.getElementById('calTitle').value.trim();
    
    // Recupero e serializzazione dei campi del Bynor Editor
    const strategy = document.getElementById('calStrategy').value.trim();
    const visual = document.getElementById('calVisual').value.trim();
    const script = document.getElementById('calScript').value.trim();
    const caption = document.getElementById('calNotes').value.trim();
    
    const serialized = serializeStructuredNotes(strategy, visual, script, caption);
    const collaboratorsRaw = (document.getElementById('calCollaborators') ? document.getElementById('calCollaborators').value.trim() : '');
    
    const finalNotes = (collaboratorsRaw && platform === 'ig')
      ? (serialized + (serialized ? '\n\n' : '') + '[COLLAB:' + collaboratorsRaw + ']')
      : serialized;
    const host = (platform === 'yt' && (type === 'LIVE' || type === 'ASTA_LIVE')) ? document.getElementById('calHost').value.trim() : '';
    
    // Se il titolo o la data non sono valorizzati, li generiamo automaticamente dalla didascalia o dalle note
    const autoTitle = caption ? caption.slice(0, 40).split('\n')[0].replace(/[#*]/g, '').trim() : (document.getElementById('calAiExtra')?.value.trim() || 'Post Instagram');
    const finalTitle = title || autoTitle || 'Post Instagram';
    const finalDate = date || calDateStr(new Date());

    // --- PUBBLICAZIONE REALE: solo IG + media caricato ---
    let mediaUrl = document.getElementById('calMediaUrl') ? document.getElementById('calMediaUrl').value : '';
    let mediaKind = document.getElementById('calMediaKind') ? document.getElementById('calMediaKind').value : '';
    const coverUrl = document.getElementById('calCoverUrl') ? document.getElementById('calCoverUrl').value : '';

    if (type === 'REELS') {
      mediaKind = 'video';
    } else if (type === 'CAROUSEL_ALBUM') {
      mediaKind = 'carousel';
    } else if (!mediaKind) {
      mediaKind = 'image';
    }
    
    // Comma-separate coverUrl for Reels if it exists
    if (platform === 'ig' && type === 'REELS' && coverUrl && mediaUrl) {
      mediaUrl = mediaUrl + ',' + coverUrl;
    }

    let willAutoPublish = false;
    if (platform === 'ig' && mediaUrl) {
      const localDateTime = new Date(`${finalDate}T${(time || '10:00')}:00`);
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
    const titleForCal = willAutoPublish ? ('✅ ' + finalTitle) : finalTitle;
    const notesForCal = willAutoPublish
      ? (finalNotes + '\n\n[Pubblicazione automatica programmata · media già caricato]')
      : finalNotes;

    // Se Google connesso, scrive direttamente su Google Calendar
    if (gcalSignedIn) {
      if (id) { await gcalUpdateEvent(id, platform, finalDate, time, type, titleForCal, notesForCal, host); }
      else { await gcalCreateEvent(platform, finalDate, time, type, titleForCal, notesForCal, host); }
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

  // Pubblicazione immediata 0-to-100 (1-Click Publish Now)
  window.calPublishNow = async function() {
    const platform = document.getElementById('calPlatform').value || 'ig';
    const type = document.getElementById('calType').value;
    const title = document.getElementById('calTitle').value.trim();
    
    // Imposta data e ora ad adesso per pubblicazione istantanea
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const hours = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    document.getElementById('calDate').value = dateStr;
    document.getElementById('calTime').value = `${hours}:${mins}`;

    const pubBtn = document.getElementById('calPublishNowBtn');
    const prevHtml = pubBtn ? pubBtn.innerHTML : '';
    if (pubBtn) {
      pubBtn.disabled = true;
      pubBtn.innerHTML = '<span class="material-symbols-rounded">progress_activity</span>Pubblicazione immediata in corso…';
    }

    try {
      // Esegue la programmazione normale (data ad adesso)
      await document.getElementById('calSaveBtn').click();

      // Triggera immediatamente la coda backend per non attendere la cron-job
      let secret = sessionStorage.getItem('publish_secret') || localStorage.getItem('publish_secret') || '';
      if (secret && typeof BACKEND_BASE !== 'undefined') {
        try {
          await fetch(BACKEND_BASE + '/api/cron-publish', {
            method: 'GET',
            headers: { 'X-Publish-Secret': secret }
          });
        } catch(e) {}
      }
    } catch(e) {
      alert('Errore durante la pubblicazione: ' + (e.message || e));
    } finally {
      if (pubBtn) {
        pubBtn.disabled = false;
        pubBtn.innerHTML = prevHtml;
      }
    }
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

// ============================================================================
/* CAROUSEL SLIDE GENERATOR LOGIC - STILE BYNOR.AI */
// ============================================================================
let slideBuilderList = [];
let slideBuilderIndex = 0;
const loadedLogos = {};

function preloadLogoAssets() {
  const logos = ['logo.png', 'asta-logo.png'];
  logos.forEach(name => {
    if (loadedLogos[name]) return;
    const img = new Image();
    img.src = 'assets/' + name;
    img.onload = () => {
      loadedLogos[name] = img;
      // se l'overlay è visibile, aggiorniamo la preview
      const overlay = document.getElementById('slideGeneratorOverlay');
      if (overlay && overlay.style.display === 'flex') {
        renderSlidePreview();
      }
    };
  });
}

function openSlideGeneratorWithIdea(title, scriptBody) {
  try {
    preloadLogoAssets();
    const rawText = ((title || '') + ' ' + (scriptBody || '')).trim();
    
    // Proviamo a parsare i nomi dei giocatori o punti
    let slides = [];
    
    // Se il testo contiene 2 o più righe/giocatori separati da due punti, virgola o a capo
    if (rawText.length > 0) {
      let mainTitle = title || 'TOP CONTENUTO';
      let itemsText = scriptBody || '';
      
      if (rawText.includes(':')) {
        const parts = rawText.split(':');
        mainTitle = parts[0].trim();
        itemsText = parts.slice(1).join(':').trim();
      }
      
      // Estraiamo la lista di giocatori/elementi
      let items = itemsText.split(/,|\n| e | - /).map(x => x.trim()).filter(x => x.length > 1);
      
      // Slide 1: Copertina
      slides.push({
        title: mainTitle.toUpperCase(),
        content: items.length > 0 ? ['Analisi completa ed approfondita'] : ['Consigli trasversali per l\'asta'],
        layout: 'cover',
        logo: 'logo.png',
        pattern: 'grid_aurora',
        accent: 'border_orange',
        watermark: 'logo_faded',
        player: '',
        highlights: mainTitle.slice(0, 15)
      });
      
      // Slide 2..N: Scheda per ogni giocatore / punto
      if (items.length > 0) {
        items.forEach((item, idx) => {
          slides.push({
            title: item.toUpperCase(),
            content: ['- Titolare / Slot strategico', '- Ottimo rendimento atteso per il fanta'],
            layout: 'points',
            logo: 'logo.png',
            pattern: 'grid_aurora',
            accent: 'border_orange',
            watermark: 'logo_faded',
            player: item,
            highlights: item
          });
        });
      }
      
      // Slide finale: CTA
      slides.push({
        title: 'SEGUI PROGETTO ESPERTI',
        content: ['Salva il post per la tua asta', 'Commenta per ricevere la guida completa'],
        layout: 'cta',
        logo: 'logo.png',
        pattern: 'grid_aurora',
        accent: 'border_orange',
        watermark: 'logo_faded',
        player: '',
        highlights: 'Salva, guida'
      });
    }

    if (slides.length > 0) {
      slideBuilderList = slides;
    }
  } catch(e) {
    console.error('Slide parsing fallback:', e);
  }

  // Fallback di sicurezza: se la lista è vuota la popoliamo col mazzo base
  if (!slideBuilderList || !slideBuilderList.length) {
    slideBuilderList = [
      {
        title: 'TOP 5 ACQUISTI SERIE A',
        content: ['Guida completa per l\'asta del fantacalcio'],
        layout: 'cover',
        logo: 'logo.png',
        pattern: 'grid_aurora',
        accent: 'border_orange',
        watermark: 'logo_faded',
        player: '',
        highlights: 'TOP 5'
      }
    ];
  }

  slideBuilderIndex = 0;
  const overlay = document.getElementById('slideGeneratorOverlay');
  if (overlay) {
    overlay.style.display = 'flex';
    renderSlideList();
    loadSlideDataIntoForm();
    renderSlidePreview();
  }
}

function getDallePromptForSlide(slide) {
  const title = slide ? slide.title || '' : '';
  const content = slide && slide.content ? slide.content.join(' ') : '';
  const topic = title + ' ' + content;

  return `Professional sports graphic background image for a Serie A football post about: "${topic}". Dark moody stadium/field atmosphere, cinematic lighting, glowing neon orange ambient highlights (#FF5000), 8k quality, ultra detailed, no text inside the image.`;
}

function copyDallePromptForCurrentSlide() {
  const slide = slideBuilderList[slideBuilderIndex];
  if (!slide) return;
  const promptText = getDallePromptForSlide(slide);
  navigator.clipboard.writeText(promptText).then(() => {
    const status = document.getElementById('sgDalleStatus');
    if (status) status.textContent = '✅ Prompt per ChatGPT copiato negli appunti!';
    setTimeout(() => { if (status) status.textContent = ''; }, 3500);
  }).catch(() => {
    alert('Prompt ChatGPT:\n\n' + promptText);
  });
}

async function generateDalleImageForCurrentSlide() {
  const slide = slideBuilderList[slideBuilderIndex];
  if (!slide) return;
  const apiKey = prompt("Inserisci la tua OpenAI API Key (sk-...) per generare l'immagine con DALL-E 3:");
  if (!apiKey) return;
  const status = document.getElementById('sgDalleStatus');
  if (status) status.textContent = '⏳ Generazione immagine DALL-E 3 in corso…';
  try {
    const promptText = getDallePromptForSlide(slide);
    const resp = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.trim()}`
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: promptText,
        n: 1,
        size: '1024x1024',
        quality: 'standard'
      })
    });
    const data = await resp.json();
    if (!resp.ok || !data.data || !data.data[0]) {
      throw new Error(data.error ? data.error.message : 'Errore generazione DALL-E 3');
    }
    const imgUrl = data.data[0].url;
    slide.bgImage = imgUrl;
    if (status) status.textContent = '✅ Immagine DALL-E 3 applicata con successo!';
    renderSlidePreview();
  } catch(e) {
    if (status) status.textContent = '❌ Errore: ' + e.message;
  }
}

function openSlideGenerator() {
  preloadLogoAssets();
  const scriptText = document.getElementById('calScript').value.trim();
  
  if (scriptText) {
    slideBuilderList = parseScriptToSlides(scriptText);
  } else {
    // mazzo di default
    slideBuilderList = [
      {
        title: 'TITOLO COPERTINA',
        content: ['Sottotitolo o gancio forte della tua copertina'],
        layout: 'cover',
        logo: 'logo.png',
        pattern: 'grid_aurora',
        accent: 'border_orange',
        watermark: 'logo_faded',
        player: '',
        highlights: ''
      },
      {
        title: 'I DATI PRINCIPALI',
        content: ['- 3 Gol e 2 Assist in stagione', '- Ruolo: trequartista di spinta', '- Prezzo all\'asta: scommessa low-cost'],
        layout: 'points',
        logo: 'logo.png',
        pattern: 'grid_aurora',
        accent: 'border_orange',
        watermark: 'logo_faded',
        player: '',
        highlights: 'low-cost, scommessa'
      },
      {
        title: 'IL NOSTRO VERDETTO',
        content: ['PRENDERE\nScommessa da 5° slot', 'LASCIARE\nSe pagato oltre 15 crediti'],
        layout: 'compare',
        logo: 'logo.png',
        pattern: 'grid_aurora',
        accent: 'border_orange',
        watermark: 'logo_faded',
        player: '',
        highlights: 'PRENDERE, LASCIARE'
      },
      {
        title: 'SEGUI PROGETTO ESPERTI',
        content: ['Commenta "ASTA" per ricevere la guida completa', 'Salva il Reel per non perderlo'],
        layout: 'cta',
        logo: 'logo.png',
        pattern: 'grid_aurora',
        accent: 'border_orange',
        watermark: 'logo_faded',
        player: '',
        highlights: 'guida, Salva'
      }
    ];
  }
  
  slideBuilderIndex = 0;
  document.getElementById('slideGeneratorOverlay').style.display = 'flex';
  renderSlideList();
  loadSlideDataIntoForm();
  renderSlidePreview();
}

function closeSlideGenerator() {
  document.getElementById('slideGeneratorOverlay').style.display = 'none';
}

function renderSlideList() {
  const container = document.getElementById('sgSlideList');
  if (!container) return;
  container.innerHTML = '';
  
  slideBuilderList.forEach((slide, idx) => {
    const card = document.createElement('div');
    card.className = `sg-slide-card ${idx === slideBuilderIndex ? 'active' : ''}`;
    card.onclick = () => {
      slideBuilderIndex = idx;
      renderSlideList();
      loadSlideDataIntoForm();
      renderSlidePreview();
    };
    
    card.innerHTML = `
      <div style="font-size: 13px; font-weight: 800;">${idx + 1}</div>
      <div class="sg-slide-card-layout">${slide.layout}</div>
    `;
    container.appendChild(card);
  });
  
  renderPaginationDots();
}

function renderPaginationDots() {
  const dotsContainer = document.getElementById('sgPaginationDots');
  if (!dotsContainer) return;
  dotsContainer.innerHTML = '';
  slideBuilderList.forEach((_, idx) => {
    const dot = document.createElement('div');
    dot.className = `sg-dot ${idx === slideBuilderIndex ? 'active' : ''}`;
    dot.onclick = () => {
      slideBuilderIndex = idx;
      renderSlideList();
      loadSlideDataIntoForm();
      renderSlidePreview();
    };
    dotsContainer.appendChild(dot);
  });
}

function loadSlideDataIntoForm() {
  const slide = slideBuilderList[slideBuilderIndex];
  if (!slide) return;
  
  document.getElementById('sgSelectedSlideTitle').textContent = `Modifica Slide ${slideBuilderIndex + 1}`;
  
  document.querySelectorAll('.cal-btn-option[id^="sgBtnLayout"]').forEach(btn => {
    btn.classList.remove('active');
  });
  const layoutBtn = document.getElementById('sgBtnLayout' + slide.layout.charAt(0).toUpperCase() + slide.layout.slice(1));
  if (layoutBtn) layoutBtn.classList.add('active');
  
  document.getElementById('sgSlideLogo').value = slide.logo || 'logo.png';
  document.getElementById('sgSlidePattern').value = slide.pattern || 'glow';
  document.getElementById('sgSlideAccent').value = slide.accent || 'none';
  document.getElementById('sgSlideWatermark').value = slide.watermark || 'none';
  document.getElementById('sgSlideTitle').value = slide.title || '';
  document.getElementById('sgSlideContent').value = (slide.content || []).join('\n');
  document.getElementById('sgSlidePlayer').value = slide.player || '';
  document.getElementById('sgSlideHighlights').value = slide.highlights || '';
  
  if (slide.layout === 'compare') {
    document.getElementById('sgFieldPlayer').style.display = 'block';
    document.getElementById('sgFieldContent').querySelector('label').textContent = 'Confronto Box 1 e Box 2 (dividi con riga vuota)';
  } else {
    document.getElementById('sgFieldPlayer').style.display = 'none';
    document.getElementById('sgFieldContent').querySelector('label').textContent = 'Testo o Punti Elenco (uno per riga)';
  }
}

function updateSlideDataFromForm() {
  const slide = slideBuilderList[slideBuilderIndex];
  if (!slide) return;
  
  slide.logo = document.getElementById('sgSlideLogo').value;
  slide.pattern = document.getElementById('sgSlidePattern').value;
  slide.accent = document.getElementById('sgSlideAccent').value;
  slide.watermark = document.getElementById('sgSlideWatermark').value;
  slide.title = document.getElementById('sgSlideTitle').value;
  slide.content = document.getElementById('sgSlideContent').value.split('\n');
  slide.player = document.getElementById('sgSlidePlayer').value;
  slide.highlights = document.getElementById('sgSlideHighlights').value;
  
  renderSlidePreview();
}

function setSlideLayout(layout) {
  const slide = slideBuilderList[slideBuilderIndex];
  if (!slide) return;
  slide.layout = layout;
  loadSlideDataIntoForm();
  renderSlidePreview();
  renderSlideList();
}

function addNewSlide() {
  slideBuilderList.push({
    title: 'NUOVA SLIDE',
    content: ['Inserisci qui i punti elenco'],
    layout: 'points',
    logo: 'logo.png',
    player: '',
    highlights: ''
  });
  slideBuilderIndex = slideBuilderList.length - 1;
  renderSlideList();
  loadSlideDataIntoForm();
  renderSlidePreview();
}

function deleteCurrentSlide() {
  if (slideBuilderList.length <= 1) {
    alert('Devi mantenere almeno una slide.');
    return;
  }
  slideBuilderList.splice(slideBuilderIndex, 1);
  if (slideBuilderIndex >= slideBuilderList.length) {
    slideBuilderIndex = slideBuilderList.length - 1;
  }
  renderSlideList();
  loadSlideDataIntoForm();
  renderSlidePreview();
}

function generateSlidesFromScriptText() {
  const scriptText = document.getElementById('calScript').value.trim();
  if (!scriptText) {
    alert('Il campo Copione è vuoto. Scrivi o genera uno script per popolarlo.');
    return;
  }
  if (confirm('Sei sicuro di voler rigenerare le slide? Questo sovrascriverà le modifiche correnti.')) {
    slideBuilderList = parseScriptToSlides(scriptText);
    slideBuilderIndex = 0;
    renderSlideList();
    loadSlideDataIntoForm();
    renderSlidePreview();
  }
}

function parseScriptToSlides(text) {
  const slides = [];
  if (!text) return slides;
  
  const regex = /(?:^|\n)(?:Slide|SLIDE|slide|Copertina|COPERTINA)\s*\d*[:\-#]*\s*/g;
  
  const matches = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.push({ index: match.index, length: match[0].length, text: match[0] });
  }
  
  const blocks = [];
  if (matches.length === 0) {
    blocks.push(text);
  } else {
    if (matches[0].index > 0) {
      blocks.push(text.substring(0, matches[0].index));
    }
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index + matches[i].length;
      const end = (i + 1 < matches.length) ? matches[i+1].index : text.length;
      const blockText = text.substring(start, end).trim();
      blocks.push(blockText);
    }
  }
  
  blocks.forEach((block, idx) => {
    const trimmedBlock = block.trim();
    if (!trimmedBlock) return;
    
    const lines = trimmedBlock.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return;
    
    let title = lines[0].replace(/^#+\s*/, '');
    lines.shift();
    
    let layout = 'points';
    if (idx === 0) {
      layout = 'cover';
    } else if (idx === blocks.length - 1 || title.toLowerCase().includes('segui') || title.toLowerCase().includes('cta') || lines.join(' ').toLowerCase().includes('segui')) {
      layout = 'cta';
    }
    
    slides.push({
      title: title || `Slide ${idx + 1}`,
      content: lines,
      layout: layout,
      logo: 'logo.png',
      pattern: 'grid_aurora',
      accent: 'border_orange',
      watermark: 'logo_faded',
      player: '',
      highlights: ''
    });
  });
  
  if (slides.length === 0) {
    slides.push({
      title: 'TITOLO COPERTINA',
      content: ['Sottotitolo della copertina'],
      layout: 'cover',
      logo: 'logo.png',
      pattern: 'glow',
      accent: 'none',
      watermark: 'none',
      player: '',
      highlights: ''
    });
  }
  
  return slides;
}

function renderSlidePreview() {
  const canvas = document.getElementById('sgCanvas');
  const slide = slideBuilderList[slideBuilderIndex];
  if (!canvas || !slide) return;
  drawSlideCanvas(canvas, slide);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, highlightWords) {
  const words = text.split(' ');
  let line = '';
  let lines = [];
  
  for (let n = 0; n < words.length; n++) {
    let testLine = line + words[n] + ' ';
    let metrics = ctx.measureText(testLine);
    let testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      lines.push(line.trim());
      line = words[n] + ' ';
    } else {
      line = testLine;
    }
  }
  lines.push(line.trim());
  
  const highlights = highlightWords ? highlightWords.split(',').map(w => w.trim().toLowerCase()).filter(w => w.length > 0) : [];
  
  let currentY = y;
  lines.forEach(l => {
    if (highlights.length === 0) {
      ctx.fillText(l, x, currentY);
    } else {
      const lineWords = l.split(' ');
      let currentX = x;
      if (ctx.textAlign === 'center') {
        const totalWidth = ctx.measureText(l).width;
        currentX = x - totalWidth / 2;
      }
      
      const prevAlign = ctx.textAlign;
      ctx.textAlign = 'left';
      
      lineWords.forEach((word, wordIdx) => {
        const cleanWord = word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").toLowerCase();
        const isHighlighted = highlights.some(hl => cleanWord.includes(hl));
        
        ctx.fillStyle = isHighlighted ? '#FF6B00' : '#E5E2E1';
        ctx.fillText(word, currentX, currentY);
        currentX += ctx.measureText(word + ' ').width;
      });
      
      ctx.textAlign = prevAlign;
    }
    currentY += lineHeight;
  });
  
  return currentY;
}

function drawSlideCanvas(canvas, data) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  
  // 1. Sfondo scuro e vibrante (o immagine AI da DALL-E / ChatGPT)
  ctx.fillStyle = '#131313';
  ctx.fillRect(0, 0, W, H);

  if (data.bgImage) {
    const bgImg = new Image();
    bgImg.crossOrigin = 'anonymous';
    bgImg.src = data.bgImage;
    if (bgImg.complete && bgImg.naturalWidth !== 0) {
      ctx.drawImage(bgImg, 0, 0, W, H);
      ctx.fillStyle = 'rgba(19, 19, 19, 0.75)';
      ctx.fillRect(0, 0, W, H);
    }
  }
  
  // 2. Disegna Watermark di Sfondo (Ultra sfumato)
  if (data.watermark === 'logo' && data.logo && data.logo !== 'none') {
    const logoImg = loadedLogos[data.logo];
    if (logoImg) {
      ctx.save();
      ctx.globalAlpha = 0.02; // ultra-low opacity
      const watermarkSize = 600;
      const watermarkH = watermarkSize * (logoImg.height / logoImg.width);
      ctx.drawImage(logoImg, (W - watermarkSize)/2, (H - watermarkH)/2, watermarkSize, watermarkH);
      ctx.restore();
    }
  }
  
  // 3. Texture e bagliori d'atmosfera in base al pattern (default: glow)
  const pattern = data.pattern || 'glow';
  if (pattern === 'glow' || pattern === 'glow_grid') {
    const grad = ctx.createRadialGradient(W * 0.8, H * 0.8, 10, W * 0.8, H * 0.8, 400);
    grad.addColorStop(0, 'rgba(255, 107, 0, 0.04)');
    grad.addColorStop(1, 'rgba(255, 107, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    
    const grad2 = ctx.createRadialGradient(W * 0.2, H * 0.2, 10, W * 0.2, H * 0.2, 300);
    grad2.addColorStop(0, 'rgba(255, 107, 0, 0.02)');
    grad2.addColorStop(1, 'rgba(255, 107, 0, 0)');
    ctx.fillStyle = grad2;
    ctx.fillRect(0, 0, W, H);
  }
  
  if (pattern === 'grid' || pattern === 'glow_grid') {
    ctx.strokeStyle = 'rgba(255, 107, 0, 0.015)';
    ctx.lineWidth = 1;
    const gridSize = 60;
    for (let x = 0; x < W; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
  }
  
  // 3. Disegna il Logo ufficiale se presente
  if (data.logo && data.logo !== 'none') {
    const logoImg = loadedLogos[data.logo];
    if (logoImg) {
      if (data.layout === 'cover' || data.layout === 'cta') {
        const logoW = 140;
        const logoH = logoW * (logoImg.height / logoImg.width);
        ctx.drawImage(logoImg, (W - logoW)/2, H * 0.2, logoW, logoH);
      } else {
        const logoW = 80;
        const logoH = logoW * (logoImg.height / logoImg.width);
        ctx.drawImage(logoImg, W - logoW - 60, 50, logoW, logoH);
      }
    }
  }
  
  // 4. Renders basati sul layout
  if (data.layout === 'cover') {
    ctx.textAlign = 'center';
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '800 68px "Space Grotesk", sans-serif';
    const titleY = H * 0.52;
    wrapText(ctx, (data.title || '').toUpperCase(), W / 2, titleY, W - 160, 80, data.highlights);
    
    ctx.fillStyle = '#A0A0A5';
    ctx.font = '500 32px "Plus Jakarta Sans", sans-serif';
    const subText = (data.content && data.content[0]) ? data.content[0] : '';
    wrapText(ctx, subText, W / 2, H * 0.76, W - 200, 44, data.highlights);
    
    ctx.fillStyle = '#FF6B00';
    ctx.font = '800 28px "Space Grotesk", sans-serif';
    ctx.fillText('SWIPE ➡️', W / 2, H * 0.9);
    
  } else if (data.layout === 'points') {
    ctx.textAlign = 'left';
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '800 52px "Space Grotesk", sans-serif';
    wrapText(ctx, (data.title || '').toUpperCase(), 80, 110, W - 260, 64, data.highlights);
    
    ctx.strokeStyle = 'rgba(255, 107, 0, 0.3)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(80, 150);
    ctx.lineTo(240, 150);
    ctx.stroke();
    
    let currentY = 240;
    const items = data.content || [];
    
    items.forEach(item => {
      if (!item.trim()) return;
      
      ctx.fillStyle = '#FF6B00';
      ctx.font = 'bold 36px "Space Grotesk", sans-serif';
      ctx.fillText('✓', 80, currentY + 6);
      
      ctx.fillStyle = '#E5E2E1';
      ctx.font = '400 32px "Plus Jakarta Sans", sans-serif';
      
      const cleanText = item.replace(/^[\s\-\*•]+/, '');
      const nextY = wrapText(ctx, cleanText, 130, currentY, W - 210, 46, data.highlights);
      currentY = nextY + 36;
    });
    
    ctx.fillStyle = '#55555A';
    ctx.font = '700 20px "Space Grotesk", sans-serif';
    ctx.fillText('@PROGETTOESPERTI', 80, H - 60);
    
  } else if (data.layout === 'compare') {
    ctx.textAlign = 'center';
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '800 52px "Space Grotesk", sans-serif';
    wrapText(ctx, (data.title || '').toUpperCase(), W / 2, 110, W - 260, 64, data.highlights);
    
    if (data.player) {
      ctx.fillStyle = '#FF6B00';
      ctx.font = '700 28px "Space Grotesk", sans-serif';
      ctx.fillText(data.player.toUpperCase(), W / 2, 175);
    }
    
    const boxW = 420;
    const boxH = 500;
    const boxY = 240;
    const gap = 60;
    
    const x1 = (W - boxW * 2 - gap) / 2;
    const x2 = x1 + boxW + gap;
    
    ctx.fillStyle = '#1C1B1B';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    roundRect(ctx, x1, boxY, boxW, boxH, 16, true, true);
    
    ctx.fillStyle = '#1C1B1B';
    roundRect(ctx, x2, boxY, boxW, boxH, 16, true, true);
    
    const lines = data.content || [];
    let leftContent = [];
    let rightContent = [];
    
    const half = Math.ceil(lines.length / 2);
    leftContent = lines.slice(0, half);
    rightContent = lines.slice(half);
    
    ctx.textAlign = 'center';
    let currentY1 = boxY + 60;
    leftContent.forEach((txt, idx) => {
      if (idx === 0) {
        ctx.fillStyle = '#FF6B00';
        ctx.font = '800 36px "Space Grotesk", sans-serif';
      } else {
        ctx.fillStyle = '#E5E2E1';
        ctx.font = '500 26px "Plus Jakarta Sans", sans-serif';
      }
      const next = wrapText(ctx, txt, x1 + boxW/2, currentY1, boxW - 60, 36, data.highlights);
      currentY1 = next + 20;
    });
    
    let currentY2 = boxY + 60;
    rightContent.forEach((txt, idx) => {
      if (idx === 0) {
        ctx.fillStyle = '#FF6B00';
        ctx.font = '800 36px "Space Grotesk", sans-serif';
      } else {
        ctx.fillStyle = '#E5E2E1';
        ctx.font = '500 26px "Plus Jakarta Sans", sans-serif';
      }
      const next = wrapText(ctx, txt, x2 + boxW/2, currentY2, boxW - 60, 36, data.highlights);
      currentY2 = next + 20;
    });
    
    ctx.textAlign = 'left';
    ctx.fillStyle = '#55555A';
    ctx.font = '700 20px "Space Grotesk", sans-serif';
    ctx.fillText('@PROGETTOESPERTI', 80, H - 60);
    
  } else if (data.layout === 'cta') {
    ctx.textAlign = 'center';
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '800 64px "Space Grotesk", sans-serif';
    const mainY = H * 0.5;
    wrapText(ctx, (data.title || 'SEGUI PROGETTO ESPERTI').toUpperCase(), W / 2, mainY, W - 160, 78, data.highlights);
    
    ctx.fillStyle = '#A0A0A5';
    ctx.font = '500 30px "Plus Jakarta Sans", sans-serif';
    let currentY = H * 0.68;
    (data.content || []).forEach(txt => {
      if (!txt.trim()) return;
      const next = wrapText(ctx, txt, W / 2, currentY, W - 200, 42, data.highlights);
      currentY = next + 24;
    });
    
    ctx.fillStyle = '#FF6B00';
    ctx.font = '800 26px "Space Grotesk", sans-serif';
    ctx.fillText('LASCIA UN LIKE ❤️', W / 2, H * 0.88);
  }
  
  // 5. Cornici o Linee d'accento superiori (data.accent)
  const accent = data.accent || 'none';
  if (accent === 'border') {
    ctx.strokeStyle = '#FF6B00';
    ctx.lineWidth = 2;
    roundRect(ctx, 16, 16, W - 32, H - 32, 12, false, true);
  } else if (accent === 'top_line') {
    ctx.fillStyle = '#FF6B00';
    ctx.fillRect(0, 0, W, 4);
  }
}

function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
  if (typeof radius === 'undefined') radius = 5;
  if (typeof radius === 'number') {
    radius = {tl: radius, tr: radius, br: radius, bl: radius};
  } else {
    var defaultRadius = {tl: 0, tr: 0, br: 0, bl: 0};
    for (var side in defaultRadius) {
      radius[side] = radius[side] || defaultRadius[side];
    }
  }
  ctx.beginPath();
  ctx.moveTo(x + radius.tl, y);
  ctx.lineTo(x + width - radius.tr, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
  ctx.lineTo(x + width, y + height - radius.br);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
  ctx.lineTo(x + radius.bl, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
  ctx.lineTo(x, y + radius.tl);
  ctx.quadraticCurveTo(x, y, x + radius.tl, y);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

async function exportSlidesToPost() {
  const saveBtn = document.getElementById('sgSaveToPostBtn');
  const prevLabel = saveBtn.innerHTML;
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<span class="material-symbols-rounded">progress_activity</span>Caricamento in corso…';
  
  try {
    const urls = [];
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 1080;
    tempCanvas.height = 1080;
    
    for (let i = 0; i < slideBuilderList.length; i++) {
      const slide = slideBuilderList[i];
      drawSlideCanvas(tempCanvas, slide);
      
      const blob = await new Promise(resolve => tempCanvas.toBlob(resolve, 'image/jpeg', 0.92));
      const file = new File([blob], `slide_${i+1}.jpg`, { type: 'image/jpeg' });
      
      saveBtn.innerHTML = `<span class="material-symbols-rounded" style="font-size:14px;animation:spin 1s linear infinite;">progress_activity</span> Caricamento slide ${i+1}/${slideBuilderList.length}…`;
      const url = await uploadMediaToSupabase(file);
      urls.push(url);
    }
    
    document.getElementById('calMediaUrl').value = urls.join(',');
    document.getElementById('calMediaKind').value = 'carousel';
    
    const prevContainer = document.getElementById('calUploadPreview');
    if (prevContainer) {
      prevContainer.innerHTML = urls.map(u => {
        return `<div class="cal-upload-thumb" style="background-image:url('${u}')"></div>`;
      }).join('');
    }
    
    const removeBtn = document.getElementById('calUploadRemove');
    if (removeBtn) removeBtn.style.display = 'inline-flex';
    
    const uploadStatus = document.getElementById('calUploadStatus');
    if (uploadStatus) {
      uploadStatus.className = 'cal-upload-status ok';
      uploadStatus.innerHTML = `<span class="material-symbols-rounded" style="font-size:14px;">check_circle</span> ${slideBuilderList.length} Slide AI generate e caricate con successo!`;
    }
    
    closeSlideGenerator();
    
  } catch (e) {
    alert('Errore durante l\'esportazione e il caricamento delle slide: ' + e.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = prevLabel;
  }
}

function downloadSlidesAsJpegs() {
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = 1080;
  tempCanvas.height = 1080;
  
  slideBuilderList.forEach((slide, i) => {
    drawSlideCanvas(tempCanvas, slide);
    const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.95);
    
    const link = document.createElement('a');
    link.download = `slide_${i+1}.jpg`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
}

// Redraw whenever fonts are loaded to guarantee visual correctness
if (document.fonts) {
  document.fonts.ready.then(() => {
    const overlay = document.getElementById('slideGeneratorOverlay');
    if (overlay && overlay.style.display === 'flex') {
      renderSlidePreview();
    }
  });
}



