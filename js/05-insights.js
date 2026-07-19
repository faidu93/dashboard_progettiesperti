// ============================================================================
// js/05-insights.js — Slot pubblicazione, WoW, Daily Actions, Freshness
// Dipendenze: 03-kpi.js, 01-api.js
// ============================================================================

// ============================================================================
// SLOT PUBBLICAZIONE: identifica top performer e slot da testare
// ============================================================================
const DAYS_IT = ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
const BUCKETS = [
  { id: 'morning', label: '06–10', from: 6, to: 9 },
  { id: 'midday', label: '10–14', from: 10, to: 13 },
  { id: 'afternoon', label: '14–18', from: 14, to: 17 },
  { id: 'evening', label: '18–22', from: 18, to: 21 },
  { id: 'night', label: '22–06', from: 22, to: 5 }
];
function bucketIdx(h) {
  if (h>=6 && h<10) return 0;
  if (h>=10 && h<14) return 1;
  if (h>=14 && h<18) return 2;
  if (h>=18 && h<22) return 3;
  return 4;
}
// dayIdx ISO: 0=Lun ... 6=Dom
function dayIdxIso(d) {
  const w = d.getDay(); // 0=Dom, 1=Lun ... 6=Sab
  return (w + 6) % 7;
}

function renderSlots(posts) {
  // === HEATMAP 7 giorni x 5 fasce orarie ===
  const grid = document.getElementById('heatmap');
  if (!grid) return;
  const DAYS = ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
  const BUCKETS = ['06-10','10-14','14-18','18-22','22-06'];

  // 1. Mappa i tuoi post negli slot (timezone IT via getUTC + 2h)
  const median = computeMedian(posts.map(p => p.media_reach || 0));
  const slotData = {}; // key "day-bucket" -> { reaches: [] }
  posts.forEach(p => {
    const d = new Date(p.timestamp);
    const dit = new Date(d.getTime() + 2*60*60*1000);
    const dayJs = dit.getUTCDay();           // 0=Dom..6=Sab
    const day = (dayJs + 6) % 7;             // 0=Lun..6=Dom
    const h = dit.getUTCHours();
    let b;
    if (h >= 6 && h < 10) b = 0;
    else if (h >= 10 && h < 14) b = 1;
    else if (h >= 14 && h < 18) b = 2;
    else if (h >= 18 && h < 22) b = 3;
    else b = 4;
    const key = day + '-' + b;
    if (!slotData[key]) slotData[key] = [];
    slotData[key].push(p.media_reach || 0);
  });

  // 2. Slot consigliati dal benchmark (Sprout/Metricool/Hootsuite 2026)
  //    Prime time: 10-14 e 14-18, picchi Mar/Gio, buoni Lun-Mer mattina
  //    day index: 0=Lun..6=Dom, bucket: 0=06-10,1=10-14,2=14-18,3=18-22,4=22-06
  const benchmarkTest = new Set([
    '0-1','0-2',  // Lun 10-14, 14-18
    '1-1','1-2',  // Mar 10-14, 14-18
    '2-1','2-2',  // Mer 10-14, 14-18
    '3-1','3-2',  // Gio 10-14, 14-18
    '4-1',        // Ven 10-14
    '0-0','1-0','2-0','3-0',  // mattine feriali 06-10
  ]);
  // Slot da sconsigliare: notte tutti i giorni + weekend sera/notte + dom pomeriggio tardi
  const badSlots = new Set([
    '0-4','1-4','2-4','3-4','4-4','5-4','6-4',  // notte 22-06 tutti
    '5-3','6-3',  // Sab/Dom 18-22
    '5-2','6-2',  // Sab/Dom 14-18 (poco affidabile)
  ]);

  // 3. Costruisci griglia
  let h = '';
  h += '<div class="heatmap-corner"></div>';
  BUCKETS.forEach(b => { h += `<div class="heatmap-colhead">${b}</div>`; });

  DAYS.forEach((dayName, day) => {
    const isWeekend = day >= 5;
    h += `<div class="heatmap-rowhead${isWeekend ? ' weekend' : ''}">${dayName}</div>`;
    for (let b = 0; b < 5; b++) {
      const key = day + '-' + b;
      const reaches = slotData[key];
      let cls, content, tip;
      if (reaches && reaches.length > 0) {
        // Slot testato dai tuoi post
        const avg = reaches.reduce((a,c)=>a+c,0) / reaches.length;
        const pi = median > 0 ? avg/median : 0;
        if (pi >= 1.5) { cls = 'top-strong'; content = pi.toFixed(1)+'×'; tip = `${dayName} ${BUCKETS[b]} · TOP performer · ${pi.toFixed(2)}× · ${reaches.length} post`; }
        else if (pi >= 1.0) { cls = 'top'; content = pi.toFixed(1)+'×'; tip = `${dayName} ${BUCKETS[b]} · sopra media · ${pi.toFixed(2)}× · ${reaches.length} post`; }
        else { cls = 'under'; content = pi.toFixed(1)+'×'; tip = `${dayName} ${BUCKETS[b]} · sotto media · ${pi.toFixed(2)}× · ${reaches.length} post`; }
      } else if (benchmarkTest.has(key)) {
        cls = 'test'; content = '◌'; tip = `${dayName} ${BUCKETS[b]} · da testare (consigliato dal benchmark)`;
      } else if (badSlots.has(key)) {
        cls = 'bad'; content = '✕'; tip = `${dayName} ${BUCKETS[b]} · sconsigliato`;
      } else {
        cls = 'neutral'; content = '·'; tip = `${dayName} ${BUCKETS[b]} · neutro`;
      }
      h += `<div class="heatmap-cell ${cls}" title="${tip}"><span class="hc-pi">${content}</span></div>`;
    }
  });
  grid.innerHTML = h;
}

// Stato del filtro mese del Performance Index ('all' o 'YYYY-MM')
let PI_MONTH_FILTER = 'all';

// Popola il <select> dei mesi una sola volta, in base ai post disponibili
function piPopulateMonths(posts) {
  const sel = document.getElementById('piMonthFilter');
  if (!sel) return;
  const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
  // Raccolgo i mesi distinti (YYYY-MM) presenti nei post, ordinati dal più recente
  const months = [...new Set(posts.map(p => {
    const d = new Date(p.timestamp);
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
  }))].sort().reverse();
  const prev = sel.value || 'all';
  sel.innerHTML = '<option value="all">Tutti i mesi</option>' +
    months.map(m => {
      const [y, mo] = m.split('-');
      return `<option value="${m}">${MESI[parseInt(mo)-1]} ${y}</option>`;
    }).join('');
  // Mantengo la selezione se ancora valida
  sel.value = [...sel.options].some(o => o.value === prev) ? prev : 'all';
  if (!sel.dataset.bound) {
    sel.addEventListener('change', () => {
      PI_MONTH_FILTER = sel.value;
      renderPiList(CACHED && CACHED.posts ? piValidPosts(CACHED.posts) : []);
    });
    sel.dataset.bound = '1';
  }
}

// Helper: stesso filtro "post validi" usato altrove
function piValidPosts(posts) {
  return posts.filter(p =>
    (p.media_reach != null && p.media_reach > 0) ||
    (p.media_engagement != null && p.media_engagement > 0) ||
    (p.media_like_count != null && p.media_like_count > 0)
  );
}

function renderPiList(posts) {
  // La MEDIANA e le statistiche del Content Lab restano calcolate su TUTTI i post
  // (storico completo), così il PI è confrontabile tra mesi diversi.
  const allReaches = posts.map(p => p.media_reach || 0);
  const median = computeMedian(allReaches);
  document.getElementById('labMedian').textContent = numIt(median);
  const sortedAll = [...posts].sort((a,b) => (b.media_reach||0) - (a.media_reach||0));
  const topReach = sortedAll[0]?.media_reach || 0;
  const topPi = median > 0 ? topReach/median : 0;
  document.getElementById('labTopPi').textContent = topPi.toFixed(2) + '×';
  document.getElementById('labTopPiSub').textContent = `Best ${numIt(topReach)} vs mediana ${numIt(median)}`;

  // Popolo il filtro mesi (idempotente)
  piPopulateMonths(posts);

  // Applico il filtro mese SOLO alla lista visualizzata (la mediana resta globale)
  let view = sortedAll;
  let monthLabel = 'tutti i mesi';
  if (PI_MONTH_FILTER !== 'all') {
    view = sortedAll.filter(p => {
      const d = new Date(p.timestamp);
      const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
      return key === PI_MONTH_FILTER;
    });
    const [y, mo] = PI_MONTH_FILTER.split('-');
    const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
    monthLabel = `${MESI[parseInt(mo)-1]} ${y}`;
  }

  document.getElementById('piSub').textContent = `Reach del post / reach mediana del profilo (${numIt(median)}). Sotto 1× = sotto media · ${PI_MONTH_FILTER==='all'?'tutti i post':monthLabel+' ('+view.length+' post)'}`;
  document.getElementById('contentLabMeta').textContent = `Live · ${posts.length} post analizzati`;
  // La barra è proporzionale al reach massimo dello storico (coerenza visiva tra mesi)
  const maxReach = topReach;
  const piList = document.getElementById('piList');
  piList.innerHTML = '';
  if (view.length === 0) {
    piList.innerHTML = '<div style="font-family:var(--font-mono);font-size:12px;color:var(--ink-mute);padding:18px 0;text-align:center;">Nessun post in questo mese</div>';
  }
  const collabSet = getCollabSet();
  view.forEach((p, idx) => {
    const d = new Date(p.timestamp);
    const t = normalizeType(p.media_type);
    const reach = p.media_reach || 0;
    const pi = findPi(reach, median);
    const cls = piClass(pi);
    const barW = maxReach > 0 ? (reach/maxReach)*100 : 0;
    const isCollab = collabSet.has(p.media_id);
    const title = titleFromCaption(p.media_caption, 55);
    const row = document.createElement('div');
    row.className = 'lab-pi-row';
    row.innerHTML = `
      <span class="post-rank">${(idx+1).toString().padStart(2,'0')}</span>
      <span class="post-date-cell">${fmtDate(d)}</span>
      <span class="lab-fmt-badge ${t}">${t==='IMAGE'?'img':t==='CAROUSEL'?'car':'reel'}</span>
      <div class="lab-pi-bar-wrap">
        <span class="lab-pi-title"><a href="${p.media_permalink}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;">${title}</a>${isCollab?' <span style="color:var(--info);font-family:var(--font-mono);font-size:9.5px;">[collab]</span>':''}</span>
        <div class="lab-pi-bar"><div class="lab-pi-bar-fill ${cls}" style="width:${barW}%"></div></div>
      </div>
      <span class="lab-pi-val ${cls}">${pi.toFixed(2)}×</span>
      <span class="post-metric-cell">${numIt(reach)}</span>`;
    piList.appendChild(row);
  });
  // ER avg profilo (sempre su tutti i post)
  const erVals = posts.map(p => { const r=p.media_reach||0; return r>0 ? (p.media_engagement||0)/r*100 : null; }).filter(v => v!==null);
  const er = erVals.length ? erVals.reduce((s,v)=>s+v,0)/erVals.length : 0;
  document.getElementById('labErAvg').textContent = pct1(er);
}

// ===== CONVERSIONE REACH → FOLLOWER (#3) =====
// Correlazione onesta a livello di giornata: per ogni giorno con pubblicazioni,
// confronto la reach totale e i follower netti guadagnati. Non attribuisco
// follower al singolo post (Instagram non fornisce quel dato).
function renderConversion(daily, posts) {
  const kpiBox = document.getElementById('convKpis');
  const listBox = document.getElementById('convList');
  if (!kpiBox || !listBox) return;

  // Conto i post pubblicati per data (YYYY-MM-DD)
  const postsByDay = {};
  (posts || []).forEach(p => {
    const key = new Date(p.timestamp).toISOString().slice(0,10);
    postsByDay[key] = (postsByDay[key] || 0) + 1;
  });

  // Giorni con almeno un post pubblicato e dati reach/follower disponibili
  const rows = (daily || [])
    .filter(d => postsByDay[d.date] && d.reach != null)
    .map(d => {
      const foll = d.follows_and_unfollows != null ? d.follows_and_unfollows : 0;
      const reach = d.reach || 0;
      const eff = reach > 0 ? (foll / reach) * 1000 : 0; // follower netti per 1000 reach
      return { date: d.date, reach, foll, nPosts: postsByDay[d.date], eff };
    })
    .sort((a,b) => new Date(b.date) - new Date(a.date));

  if (!rows.length) {
    kpiBox.innerHTML = '';
    listBox.innerHTML = '<div style="font-family:var(--font-mono);font-size:12px;color:var(--ink-mute);padding:16px 0;text-align:center;">Dati insufficienti per la conversione.</div>';
    return;
  }

  // KPI aggregati sul periodo
  const totReach = rows.reduce((s,r) => s + r.reach, 0);
  const totFoll = rows.reduce((s,r) => s + r.foll, 0);
  const avgEff = totReach > 0 ? (totFoll / totReach) * 1000 : 0;
  const bestDay = [...rows].sort((a,b) => b.eff - a.eff)[0];

  kpiBox.innerHTML = `
    <div class="conv-kpi"><div class="conv-kpi-label">Efficienza media</div><div class="conv-kpi-val accent">${avgEff.toFixed(2)}</div><div class="conv-kpi-sub">follower / 1.000 reach</div></div>
    <div class="conv-kpi"><div class="conv-kpi-label">Follower netti (giorni con post)</div><div class="conv-kpi-val">${totFoll >= 0 ? '+' : ''}${numIt(totFoll)}</div><div class="conv-kpi-sub">su ${numIt(totReach)} reach</div></div>
    <div class="conv-kpi"><div class="conv-kpi-label">Giorno più efficiente</div><div class="conv-kpi-val pos">${bestDay.eff.toFixed(2)}</div><div class="conv-kpi-sub">${fmtDate(new Date(bestDay.date))}</div></div>`;

  // Lista giorni: barra proporzionale all'efficienza
  const maxEff = Math.max(...rows.map(r => Math.abs(r.eff)), 0.01);
  let h = '';
  rows.slice(0, 20).forEach(r => {
    const pct = Math.min(100, (Math.abs(r.eff) / maxEff) * 100);
    const neg = r.foll < 0;
    const barColor = neg ? 'var(--neg)' : (r.eff >= avgEff ? 'var(--pos)' : 'var(--accent)');
    const single = r.nPosts === 1;
    h += `<div class="conv-row">
      <span class="conv-date">${fmtDate(new Date(r.date))}</span>
      <span class="conv-npost" title="${r.nPosts} post pubblicati">${single ? '1 post' : r.nPosts + ' post'}</span>
      <div class="conv-bar-wrap"><div class="conv-bar" style="width:${pct}%;background:${barColor};"></div></div>
      <span class="conv-eff" style="color:${barColor};">${r.eff.toFixed(2)}</span>
      <span class="conv-detail">${numIt(r.reach)} reach · ${r.foll >= 0 ? '+' : ''}${r.foll} follower</span>
    </div>`;
  });
  listBox.innerHTML = h;
}
// CACHE DATI: salvo i dati ricevuti per refresh locale senza richiesta API
// ============================================================================
// CACHED è già dichiarato globalmente in 01-api.js

function refreshDataDisplay() {
  if (!CACHED.daily) return;
  // Tiene i post che hanno almeno un segnale valido: reach, oppure interazioni
  // (like/commenti). Così non scarta post recenti la cui reach non è ancora
  // esposta da Meta, ma che hanno comunque engagement reale.
  const validPosts = CACHED.posts.filter(p =>
    (p.media_reach != null && p.media_reach > 0) ||
    (p.media_engagement != null && p.media_engagement > 0) ||
    (p.media_like_count != null && p.media_like_count > 0)
  );
  const ctx = renderKPIs(CACHED.daily, CACHED.profile, validPosts);
  if (ctx) {
    renderWeeks(ctx.period, validPosts);
  }
  renderLatest(validPosts);
  renderTopPostsByFormat(validPosts);
  renderFormatTable(validPosts);
  renderEngagementMix(validPosts);
  renderPiList(validPosts);
  renderConversion(CACHED.daily, validPosts);
  renderSlots(validPosts);
  renderDailyActions(CACHED.daily, validPosts, CACHED.profile);
  calPublishedPosts = validPosts;
}



// ============================================================================
// WoW (Week-over-Week) FORMAT — confronto sett. corrente vs precedente
// ============================================================================
let WOW_MODE = 'all'; // 'all' o 'wow'

function renderFormatTableWow(posts) {
  // Suddivido i post in due bucket: ultimi 7gg vs 7gg prec
  const now = Date.now();
  const dayMs = 24*60*60*1000;
  const cur = posts.filter(p => {
    const t = new Date(p.timestamp).getTime();
    return (now - t) <= 7*dayMs;
  });
  const prev = posts.filter(p => {
    const t = new Date(p.timestamp).getTime();
    return (now - t) > 7*dayMs && (now - t) <= 14*dayMs;
  });

  const byT = (arr) => {
    const m = {};
    arr.forEach(p => {
      const t = normalizeType(p.media_type);
      if (!m[t]) m[t] = [];
      m[t].push(p);
    });
    return m;
  };
  const groupCur = byT(cur);
  const groupPrev = byT(prev);

  const stat = (items) => {
    const n = items.length;
    if (n === 0) return null;
    return {
      n,
      reach: items.reduce((s,p)=>s+(p.media_reach||0),0)/n,
      er: (() => { const vals = items.map(p=>{const r=p.media_reach||0; return r>0?(p.media_engagement||0)/r*100:null;}).filter(v=>v!==null); return vals.length ? vals.reduce((s,v)=>s+v,0)/vals.length : 0; })(),
      save: items.reduce((s,p)=>s+(p.media_saved||0),0)/n,
      share: items.reduce((s,p)=>s+(p.media_shares||0),0)/n,
      comm: items.reduce((s,p)=>s+(p.media_comments_count||0),0)/n,
    };
  };

  const tbody = document.getElementById('fmtTable');
  if (!tbody) return;
  tbody.innerHTML = '';
  const order = ['IMAGE','CAROUSEL','REELS'];

  function deltaWow(curr, prev) {
    if (prev == null) return '';
    if (prev === 0 && curr === 0) return '';
    if (prev === 0) return ' <span class="wow-delta pos">nuovo</span>';
    const pct = (curr - prev) / Math.abs(prev) * 100;
    if (Math.abs(pct) < 1) return ' <span class="wow-delta">0%</span>';
    const cls = pct > 0 ? 'pos' : 'neg';
    const sign = pct > 0 ? '+' : '';
    let val = sign + Math.round(pct) + '%';
    if (pct > 999) val = '>999%';
    if (pct < -99) val = '-99%';
    return ` <span class="wow-delta ${cls}">${val}</span>`;
  }

  order.forEach(t => {
    const sC = stat(groupCur[t] || []);
    const sP = stat(groupPrev[t] || []);
    if (!sC && !sP) return;
    const tr = document.createElement('tr');
    if (WOW_MODE === 'wow' && sC) {
      // Modalità "vs WK prec." → mostro valori correnti + delta
      tr.innerHTML = `
        <td><span class="lab-fmt-badge ${t}">${t.toLowerCase()}</span></td>
        <td class="num">${sC.n}${sP ? ' <span class="wow-delta">vs '+sP.n+'</span>' : ''}</td>
        <td class="num">${numIt(sC.reach)}${sP ? deltaWow(sC.reach, sP.reach) : ''}</td>
        <td class="num">${pct1(sC.er)}${sP ? deltaWow(sC.er, sP.er) : ''}</td>
        <td class="num">${sC.save.toFixed(1)}${sP ? deltaWow(sC.save, sP.save) : ''}</td>
        <td class="num">${sC.share.toFixed(1)}${sP ? deltaWow(sC.share, sP.share) : ''}</td>
        <td class="num">${sC.comm.toFixed(1)}${sP ? deltaWow(sC.comm, sP.comm) : ''}</td>`;
    } else if (WOW_MODE === 'wow' && !sC && sP) {
      // Categoria che esisteva prima ma non questa settimana
      tr.innerHTML = `
        <td><span class="lab-fmt-badge ${t}">${t.toLowerCase()}</span></td>
        <td class="num weak" colspan="6">0 post questa settimana (prec: ${sP.n})</td>`;
    }
    tbody.appendChild(tr);
  });

  if (WOW_MODE === 'wow' && tbody.children.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="7" class="num weak" style="text-align:center;padding:20px;">Nessun post nelle ultime 2 settimane</td>`;
    tbody.appendChild(tr);
  }
}

function setupWowToggle(posts) {
  const allBtn = document.getElementById('wowAll');
  const wowBtn = document.getElementById('wowDelta');
  if (!allBtn || !wowBtn) return;
  allBtn.addEventListener('click', () => {
    WOW_MODE = 'all';
    allBtn.classList.add('active');
    wowBtn.classList.remove('active');
    renderFormatTable(posts); // funzione esistente
  });
  wowBtn.addEventListener('click', () => {
    WOW_MODE = 'wow';
    wowBtn.classList.add('active');
    allBtn.classList.remove('active');
    renderFormatTableWow(posts);
  });
}

// ============================================================================
// DAILY ACTIONS — Genera 3-4 suggerimenti contestuali sui dati
// ============================================================================
function renderDailyActions(daily, posts, profile) {
  const list = document.getElementById('dailyActionList');
  const nowEl = document.getElementById('dailyActionNow');
  if (!list) return;

  const now = new Date();
  const days = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
  const day = days[now.getDay()];
  const hour = now.getHours();
  let fascia = 'notte';
  if (hour >= 6 && hour < 10) fascia = 'mattina (06-10)';
  else if (hour >= 10 && hour < 14) fascia = 'mezzogiorno (10-14)';
  else if (hour >= 14 && hour < 18) fascia = 'pomeriggio (14-18)';
  else if (hour >= 18 && hour < 22) fascia = 'sera (18-22)';
  nowEl.textContent = `${day} · ${fascia}`;

  const actions = [];

  // ── Action 1: slot orario corrente
  const isTopDay = ['Martedì','Giovedì'].includes(day);
  const isTopHour = (hour >= 10 && hour < 14) || (hour >= 8 && hour < 10);
  if (isTopDay && isTopHour) {
    actions.push({
      cls: 'good', emoji: '🎯',
      headline: `Slot premium attivo: ${day} ${fascia}`,
      body: `I tuoi 3 picchi storici sono tutti su <strong>${day} 08-14</strong>. Se hai un post pronto, <strong>pubblicalo entro 2 ore</strong>. Format consigliato: TOP-LIST tecnica.`
    });
  } else if (isTopDay) {
    actions.push({
      cls: 'tip', emoji: '⏰',
      headline: `${day} è top, ma fuori fascia ideale`,
      body: `Oggi è ${day} (uno dei tuoi giorni migliori) ma la finestra premium è <strong>08-14</strong>. Programma il prossimo post per questa fascia.`
    });
  }

  // ── Action 2: giorni senza pubblicare
  const sortedPosts = [...posts].sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
  if (sortedPosts.length > 0) {
    const lastPost = new Date(sortedPosts[0].timestamp);
    const daysSince = Math.floor((now - lastPost) / (24*60*60*1000));
    if (daysSince >= 3) {
      actions.push({
        cls: 'urgent', emoji: '🚨',
        headline: `${daysSince} giorni senza pubblicare`,
        body: `L'algoritmo ti perde velocità dopo 48h di silenzio. <strong>Pubblica oggi</strong>, anche un post leggero. La frequenza target è 4 post/settimana.`
      });
    } else if (daysSince >= 2) {
      actions.push({
        cls: 'tip', emoji: '⏳',
        headline: `${daysSince} giorni dall'ultimo post`,
        body: `Ti avvicini alla soglia di 48h che inizia a frenare l'algoritmo. <strong>Pianifica oggi</strong> il prossimo contenuto.`
      });
    }
  }

  // ── Action 3: trend follower
  const lastIdx = daily.length - 1;
  const last7 = daily.slice(Math.max(0, lastIdx-6), lastIdx+1);
  const prev7 = daily.slice(Math.max(0, lastIdx-13), lastIdx-6);
  const foll7 = last7.reduce((s,d) => s + (d.follows_and_unfollows||0), 0);
  const follPrev = prev7.reduce((s,d) => s + (d.follows_and_unfollows||0), 0);
  if (foll7 < 0) {
    actions.push({
      cls: 'urgent', emoji: '📉',
      headline: `Saldo follower negativo: ${foll7} ultimi 7gg`,
      body: `Più unfollow che follow questa settimana. Controlla se hai pubblicato contenuti fuori target o se è effetto delle storie. <strong>Rivedi gli ultimi 3 post</strong>.`
    });
  } else if (foll7 < follPrev && follPrev > 0) {
    actions.push({
      cls: 'tip', emoji: '📊',
      headline: `Crescita follower in rallentamento`,
      body: `Settimana: <strong>+${foll7}</strong> vs <strong>+${follPrev}</strong> della precedente. Rivedi il mix dei post: TOP-LIST porta reach ma poco follow, serve un post "bridge" con CTA esplicita.`
    });
  } else if (foll7 >= 50) {
    actions.push({
      cls: 'good', emoji: '🚀',
      headline: `Target settimanale raggiunto: +${foll7} follower`,
      body: `Hai superato i 50 follower/settimana. <strong>Replica</strong> il pattern editoriale dell'ultima settimana per le prossime due.`
    });
  }

  // ── Action 4: top post recente da riamplificare
  const recentTop = sortedPosts.find(p => {
    const days = (now - new Date(p.timestamp)) / (24*60*60*1000);
    return days <= 7 && days >= 2;
  });
  if (recentTop) {
    const median = computeMedian(posts.map(p => p.media_reach||0));
    const pi = median > 0 ? (recentTop.media_reach||0)/median : 0;
    if (pi >= 1.5) {
      const dStr = fmtDate(new Date(recentTop.timestamp));
      actions.push({
        cls: 'tip', emoji: '🔁',
        headline: `Post del ${dStr} sta performando (${pi.toFixed(2)}×)`,
        body: `Reach ${numIt(recentTop.media_reach)}: sopra mediana. <strong>Condividilo nelle storie</strong> oggi per spingere il bridge al follow. <a href="${recentTop.media_permalink}" target="_blank" rel="noopener" style="color:var(--accent);">Apri post</a>`
      });
    }
  }

  // ── Action 5: fallback se non ci sono action specifiche
  if (actions.length === 0) {
    actions.push({
      cls: 'tip', emoji: '💡',
      headline: 'Tutto sotto controllo',
      body: `Nessuna anomalia rilevata oggi. Continua col tuo piano editoriale. Prossimo slot premium: <strong>Martedì/Giovedì 10-14</strong>.`
    });
  }

  // Limito a 4 per non sovraffollare
  const top = actions.slice(0, 4);
  list.innerHTML = '';
  top.forEach(a => {
    const item = document.createElement('div');
    item.className = `daily-action-item ${a.cls}`;
    item.innerHTML = `
      <span class="daily-action-emoji">${a.emoji}</span>
      <div class="daily-action-text">
        <div class="daily-action-headline">${a.headline}</div>
        <div class="daily-action-body">${a.body}</div>
      </div>
    `;
    list.appendChild(item);
  });
}


// ============================================================================
// FRESHNESS BADGE - Mostra quando sono stati aggiornati gli ultimi dati
// ============================================================================
function renderFreshness(daily) {
  const el = document.getElementById('freshness');
  const txt = document.getElementById('freshnessText');
  if (!el || !txt || daily.length === 0) return;

  const sorted = [...daily].sort((a, b) => new Date(b.date) - new Date(a.date));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  
  const lastComplete = sorted.find(d => d.follows_and_unfollows != null && d.reach != null);
  const lastAny = sorted[0];
  
  if (!lastComplete) {
    el.className = 'nav-status old';
    txt.innerHTML = `Nessun dato`;
    return;
  }

  const lastCompleteDate = new Date(lastComplete.date + 'T00:00:00');
  const todayCopy = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffTime = todayCopy - lastCompleteDate;
  const daysAgo = Math.round(diffTime / (24 * 60 * 60 * 1000));
  
  // Età relativa
  let ageLabel;
  if (daysAgo <= 0) ageLabel = 'oggi';
  else if (daysAgo === 1) ageLabel = 'ieri';
  else ageLabel = `${daysAgo}g fa`;

  // Stato del badge
  let cls = 'fresh';
  if (daysAgo >= 2) cls = 'stale';
  if (daysAgo >= 3) cls = 'old';
  el.className = `nav-status ${cls}`;

  // Compose testo minimale e pulito
  txt.innerHTML = `Dati: ${fmtDate(lastCompleteDate)} (${ageLabel})`;
}


// ============================================================================
// TAB NAVIGATOR
// ============================================================================
function tabSwitch(btn) {
  const tabId = btn.dataset.tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('section[data-tab]').forEach(s => s.classList.remove('tab-active'));
  btn.classList.add('active');
  document.querySelectorAll(`section[data-tab="${tabId}"]`).forEach(s => s.classList.add('tab-active'));
  if (tabId === 'performance' && CACHED && CACHED.period) {
    renderReachChart(CACHED.period);
  }
  if (tabId === 'calendario') {
    calRender();
    ytRender();
    let savedSecret = '';
    try { savedSecret = sessionStorage.getItem('publish_secret') || localStorage.getItem('publish_secret') || ''; } catch(e) {}
    if (savedSecret) {
      loadPublishQueue();
    }
  }
  if (tabId === 'intelligence') { intelInitHistoryBars(); }
  if (tabId === 'acquisizioni') { renderSubscribersChart(); }
}

