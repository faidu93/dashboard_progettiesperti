// ============================================================================
// js/03-kpi.js — Rendering KPI Instagram (follower, reach, ER)
// Dipendenze: 01-api.js
// ============================================================================

// ============================================================================
// MAIN RENDER
// ============================================================================
function renderKPIs(daily, profile, posts) {
  // Filtra periodo "ripresa attiva": dal 27 aprile in poi (data dichiarata di ripresa pubblicazioni)
  const RESUME_DATE = '2026-04-27';
  let startIdx = 0;
  for (let i=0; i<daily.length; i++) { if (daily[i].date >= RESUME_DATE) { startIdx = i; break; } }
  const period = daily.slice(startIdx);
  if (period.length === 0) return null;

  // Totali periodo ripresa
  const reach = period.reduce((s,r)=>s+(r.reach||0),0);
  // INTERAZIONI/SHARES dai POST del periodo (i daily non li espongono — Meta non li dà
  // come serie giornaliera). I post invece hanno engagement reale per ciascuno.
  const RESUME = new Date(RESUME_DATE);
  const periodPosts = (posts || []).filter(p => {
    const t = new Date(p.timestamp);
    return t >= RESUME;
  });
  const ints = periodPosts.reduce((s,p)=>s+(p.media_engagement||0),0);
  const shares = periodPosts.reduce((s,p)=>s+(p.media_shares||0),0);
  // accounts_engaged non disponibile come serie: stima = interazioni (proxy prudente)
  const eng = periodPosts.reduce((s,p)=>s+(p.media_engagement||0),0);
  const foll = period.reduce((s,r)=>s+(r.follows_and_unfollows||0),0);
  // reach dei post del periodo (per la shareability e riferimenti coerenti)
  const postReachPeriod = periodPosts.reduce((s,p)=>s+(p.media_reach||0),0);
  // ER MEDIO = media degli ER per-post (engagement/reach di ciascun post), come fanno
  // gli strumenti di mercato (Metricool ecc.). Stessa formula del Content Lab → numeri
  // coerenti in tutta la dashboard e allineati ai benchmark esterni (~4-5%).
  const erPostList = periodPosts.map(p => { const r=p.media_reach||0; return r>0 ? (p.media_engagement||0)/r*100 : null; }).filter(v => v!==null);
  const er = erPostList.length ? erPostList.reduce((s,v)=>s+v,0)/erPostList.length : 0;
  const conv = reach > 0 ? (foll/reach)*100 : 0;
  const shareability = postReachPeriod > 0 ? (shares/postReachPeriod)*100 : 0;
  const reachPerDay = reach/period.length;

  // Costruisco 3 finestre allineate alle settimane di CALENDARIO (lun → dom):
  // settimana corrente (quella che contiene l'ultimo giorno di dati), precedente,
  // e quella ancora prima. Così "WK corr." e "WK prec." coincidono con le card
  // settimanali e con il calendario reale.
  const lastIdx = daily.length - 1;
  // Lunedì della settimana che contiene una certa data
  const mondayOf = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    const dow = (d.getDay() + 6) % 7; // 0=Lun..6=Dom
    d.setDate(d.getDate() - dow);
    d.setHours(0,0,0,0);
    return d;
  };
  // Somma i daily il cui date cade in [from, to] (estremi inclusi), via sumWindow su indici
  const weekWindow = (mondayDate, posts) => {
    const sunday = new Date(mondayDate); sunday.setDate(sunday.getDate()+6); sunday.setHours(23,59,59,999);
    const monStr = mondayDate.toISOString().slice(0,10);
    const sunStr = sunday.toISOString().slice(0,10);
    // Trovo indici start/end nei daily
    let startI = -1, endI = -1;
    for (let i=0;i<daily.length;i++){
      if (daily[i].date >= monStr && daily[i].date <= sunStr){
        if (startI===-1) startI=i;
        endI=i;
      }
    }
    if (startI===-1) return { reach:0, postReach:0, erAvg:0, int:0, eng:0, foll:0, shares:0, days:0, _mon:mondayDate, _sun:sunday, _empty:true };
    const r = sumWindow(daily, endI-startI+1, endI, posts);
    r._mon = mondayDate; r._sun = sunday;
    return r;
  };
  const monCur = mondayOf(daily[lastIdx].date);
  const monPrev = new Date(monCur); monPrev.setDate(monPrev.getDate()-7);
  const monPrev2 = new Date(monCur); monPrev2.setDate(monPrev2.getDate()-14);
  const last7 = weekWindow(monCur, periodPosts);
  const prev7 = weekWindow(monPrev, periodPosts);
  const prev14 = weekWindow(monPrev2, periodPosts);
  // Etichette date GG/MM lunedì–domenica
  const fmtWk = (w) => w ? `${fmtDate(w._mon)}–${fmtDate(w._sun)}` : '—';
  // La settimana corrente è parziale se la sua domenica è oltre l'ultimo giorno di dati
  const lastDataDate = new Date(daily[lastIdx].date + 'T00:00:00');
  const curIsPartial = last7._sun > lastDataDate;
  const wk1Dates = fmtWk(last7) + (curIsPartial ? ' · in corso' : '');
  const wk2Dates = fmtWk(prev7);
  // Se la WK corrente è parziale, il confronto vs la settimana piena precedente
  // è fuorviante (mostrerebbe un finto crollo). In quel caso il delta della WK
  // corrente diventa neutro "parziale", così non viene letto come calo reale.
  const wk1Delta = (curr, prev) => curIsPartial
    ? { cls:'flat', icon:'schedule', val:'parziale' }
    : deltaPctIcon(curr, prev);

  // Date inizio/fine
  const dStart = new Date(period[0].date);
  const dEnd = new Date(period[period.length-1].date);

  document.getElementById('metaPeriod').textContent = `${fmtDate(dStart)} – ${fmtDate(dEnd)} · ${period.length}g`;
  document.getElementById('reachPanelSub').textContent = `${period.length} giorni`;

  // === TARGET DINAMICI (basati sul profilo) ===
  // Calcolo target a partire dai dati storici/medie del profilo stesso
  const reachMedianDaily = (function() {
    const reaches = period.map(r => r.reach || 0).sort((a,b) => a-b);
    return reaches[Math.floor(reaches.length/2)] || 0;
  })();
  // Targets:
  // - Follower: +50/sett (linea-base obiettivo per profilo in crescita)
  // - Reach: settimana attesa = mediana_daily * 7 * 1.2 (20% sopra il trend medio)
  // - Interazioni: ER 5% * reach_target (per nicchia fantacalcio)
  // - ER medio: 3% benchmark nicchia (>3% buono, <2% scarso)
  // - Shareability: 1% benchmark Instagram (>1% buono)
  const targets = {
    follow: 50,        // follower/settimana
    reach: Math.round(reachMedianDaily * 7 * 1.2),
    int: Math.round(reachMedianDaily * 7 * 1.2 * 0.05),
    er: 3.0,
    share: 1.0,
    conv: 1.2          // reach→follower %
  };

  function setTarget(id, label, current, target, format, higherIsBetter=true) {
    const el = document.getElementById(id);
    if (!el) return;
    const ratio = target > 0 ? current/target : 0;
    let cls = '';
    if (higherIsBetter) {
      if (ratio >= 1) cls = 'good';
      else if (ratio < 0.5) cls = 'bad';
    }
    el.className = 'kpi-target ' + cls;
    el.textContent = `🎯 ${label}: ${format(target)}`;
  }

  setTarget('k-followers-target', 'wk', last7.foll, targets.follow, v => '+'+v);
  setTarget('k-reach-target', 'wk', last7.reach, targets.reach, numIt);
  setTarget('k-int-target', 'wk', last7.int, targets.int, numIt);
  setTarget('k-er-target', 'benchmark', er, targets.er, pct1);
  setTarget('k-share-target', 'benchmark', shareability, targets.share, pct2);

  // KPI 1: Follower — WK corr (vs prec), WK prec (vs 2 fa)
  const foll1 = last7.foll, foll2 = prev7.foll, foll3 = prev14.foll;
  renderKPI('k-followers', numIt(profile.followers_count), '',
    { dates: wk1Dates, abs: (foll1>=0?'+':'') + foll1, delta: wk1Delta(foll1, foll2) },
    { dates: wk2Dates, abs: (foll2>=0?'+':'') + foll2, delta: deltaPctIcon(foll2, foll3) });

  // KPI 2: Reach (accent)
  renderKPI('k-reach', numIt(reach), 'accent',
    { dates: wk1Dates, abs: numIt(last7.reach), delta: wk1Delta(last7.reach, prev7.reach) },
    { dates: wk2Dates, abs: numIt(prev7.reach), delta: deltaPctIcon(prev7.reach, prev14.reach) });

  // KPI 3: Interazioni
  renderKPI('k-int', numIt(ints), '',
    { dates: wk1Dates, abs: numIt(last7.int), delta: wk1Delta(last7.int, prev7.int) },
    { dates: wk2Dates, abs: numIt(prev7.int), delta: deltaPctIcon(prev7.int, prev14.int) });

  // KPI 4: ER medio — media degli ER per-post (coerente con Content Lab e benchmark)
  const er1 = last7.erAvg, er2 = prev7.erAvg, er3 = prev14.erAvg;
  renderKPI('k-er', pct1(er), '',
    { dates: wk1Dates, abs: pct1(er1), delta: wk1Delta(er1, er2) },
    { dates: wk2Dates, abs: pct1(er2), delta: deltaPctIcon(er2, er3) });

  // KPI 5: Shareability — shares / reach dei post della finestra
  const sh1 = last7.postReach > 0 ? (last7.shares/last7.postReach)*100 : 0;
  const sh2 = prev7.postReach > 0 ? (prev7.shares/prev7.postReach)*100 : 0;
  const sh3 = prev14.postReach > 0 ? (prev14.shares/prev14.postReach)*100 : 0;
  renderKPI('k-share', pct2(shareability), '',
    { dates: wk1Dates, abs: pct2(sh1), delta: wk1Delta(sh1, sh2) },
    { dates: wk2Dates, abs: pct2(sh2), delta: deltaPctIcon(sh2, sh3) });

  // FUNNEL BAR (sopra KPI)
  document.getElementById('fb-reach').textContent = numIt(reach);
  document.getElementById('fb-engaged').textContent = numIt(eng);
  document.getElementById('fb-engaged-conv').textContent = `${pct1(er)} ER sulla reach contenuti`;
  document.getElementById('fb-follow').textContent = `${foll>=0?'+':''}${foll}`;
  document.getElementById('fb-follow-conv').textContent = `${pct1(conv)} reach→follower · target 1,2%`;

  // Integrazione dinamica degli iscritti nel funnel
  const elFollowArrow = document.getElementById('fb-follow-arrow');
  const elSubStep = document.getElementById('fb-subscribers-step');
  const elFunnelBar = document.querySelector('.funnel-bar');
  
  if (window.CACHED_SUBSCRIBERS && !window.CACHED_SUBSCRIBERS.unauthorized && !window.CACHED_SUBSCRIBERS.error && Array.isArray(window.CACHED_SUBSCRIBERS.subscribers)) {
    if (elFollowArrow) elFollowArrow.style.display = 'flex';
    if (elSubStep) elSubStep.style.display = 'flex';
    if (elFunnelBar) elFunnelBar.style.gridTemplateColumns = 'repeat(4, 1fr)';
    
    const paying = window.CACHED_SUBSCRIBERS.subscribers.length;
    const revenue = window.CACHED_SUBSCRIBERS.subscribers.reduce((acc, s) => acc + (s.amount !== undefined ? s.amount : 15), 0);
    
    const elSubVal = document.getElementById('fb-subscribers');
    const elSubConv = document.getElementById('fb-subscribers-conv');
    
    if (elSubVal) elSubVal.textContent = paying.toLocaleString('it-IT');
    if (elSubConv) elSubConv.textContent = `${revenue.toLocaleString('it-IT')} € entrate totali`;
  } else {
    if (elFollowArrow) elFollowArrow.style.display = 'none';
    if (elSubStep) elSubStep.style.display = 'none';
    if (elFunnelBar) elFunnelBar.style.gridTemplateColumns = 'repeat(3, 1fr)';
  }

  return { period, dStart, dEnd };
}

function renderKPI(id, value, valueCls, wk1, wk2) {
  const valEl = document.getElementById(id);
  valEl.textContent = value;
  if (valueCls) valEl.classList.add(valueCls);
  document.getElementById(id+'-wk1-dates').textContent = wk1.dates;
  document.getElementById(id+'-wk1-abs').textContent = wk1.abs;
  document.getElementById(id+'-wk1-delta').innerHTML = `<span class="material-symbols-rounded">${wk1.delta.icon}</span>${wk1.delta.val}`;
  document.getElementById(id+'-wk1-delta').className = `kpi-delta-val ${wk1.delta.cls}`;
  document.getElementById(id+'-wk2-dates').textContent = wk2.dates;
  document.getElementById(id+'-wk2-abs').textContent = wk2.abs;
  document.getElementById(id+'-wk2-delta').innerHTML = `<span class="material-symbols-rounded">${wk2.delta.icon}</span>${wk2.delta.val}`;
  document.getElementById(id+'-wk2-delta').className = `kpi-delta-val ${wk2.delta.cls}`;
}

function renderWeeks(period, posts) {
  const grid = document.getElementById('weeksGrid');
  grid.innerHTML = '';
  // Raggruppo i giorni in settimane ISO (lunedì → domenica), non in blocchi da 7
  // a partire dal primo giorno disponibile. Così ogni WK è una settimana di
  // calendario reale e la "WK in corso" è quella che contiene oggi.
  const weeks = [];
  if (period.length) {
    let cur = [];
    period.forEach(d => {
      const dow = (new Date(d.date + 'T00:00:00').getDay() + 6) % 7; // 0=Lun..6=Dom
      if (dow === 0 && cur.length) { weeks.push(cur); cur = []; }
      cur.push(d);
    });
    if (cur.length) weeks.push(cur);
  }
  // La settimana "in corso" è quella che contiene la data di oggi (o l'ultima se
  // i dati finiscono prima di oggi ma la settimana non è ancora chiusa = < domenica).
  const today = new Date(); today.setHours(0,0,0,0);
  const lastWeek = weeks[weeks.length-1] || [];
  const lastDayOfLastWeek = lastWeek.length ? new Date(lastWeek[lastWeek.length-1].date + 'T00:00:00') : null;
  // Domenica della settimana dell'ultimo giorno
  const isLastPartial = (() => {
    if (!lastDayOfLastWeek) return false;
    const dow = (lastDayOfLastWeek.getDay() + 6) % 7; // 0=Lun..6=Dom
    // parziale se l'ultimo giorno NON è domenica (settimana non completata)
    return dow < 6;
  })();
  // Stats per ranking — interazioni E reach dei post calcolate dai post della settimana.
  // L'ER usa reach-dei-post (coerente: stesse fonti a num. e den.), non la reach
  // del profilo (che si spalma su più giorni e creava ER incoerenti).
  const stats = weeks.map(w => {
    let ints = 0, postReach = 0, shares = 0, erAvg = 0;
    if (posts && posts.length && w.length) {
      const ws = new Date(w[0].date + 'T00:00:00');
      const we = new Date(w[w.length-1].date + 'T23:59:59');
      const inWk = posts.filter(p => {
        const t = new Date(p.timestamp); return t >= ws && t <= we;
      });
      ints = inWk.reduce((s,p)=>s+(p.media_engagement||0),0);
      postReach = inWk.reduce((s,p)=>s+(p.media_reach||0),0);
      shares = inWk.reduce((s,p)=>s+(p.media_shares||0),0);
      const erList = inWk.map(p => { const r=p.media_reach||0; return r>0 ? (p.media_engagement||0)/r*100 : null; }).filter(v => v!==null);
      erAvg = erList.length ? erList.reduce((s,v)=>s+v,0)/erList.length : 0;
    }
    return {
      reach: w.reduce((s,r)=>s+(r.reach||0),0),  // reach profilo (mostrata)
      postReach,
      ints,
      shares,
      erAvg,
      foll: w.reduce((s,r)=>s+((r.follows_and_unfollows||0)),0),
    };
  });
  const maxReach = Math.max(...stats.map(s=>s.reach));
  // Conteggio post per settimana (per tipo)
  const postsByWeek = weeks.map(w => {
    if (!posts || w.length === 0) return { total:0, IMAGE:0, CAROUSEL_ALBUM:0, REELS:0 };
    const start = new Date(w[0].date); start.setHours(0,0,0,0);
    const end = new Date(w[w.length-1].date); end.setHours(23,59,59,999);
    const inWeek = posts.filter(p => {
      const t = new Date(p.timestamp);
      return t >= start && t <= end;
    });
    return {
      total: inWeek.length,
      IMAGE: inWeek.filter(p => p.media_type === 'IMAGE').length,
      CAROUSEL_ALBUM: inWeek.filter(p => p.media_type === 'CAROUSEL_ALBUM').length,
      REELS: inWeek.filter(p => p.media_type === 'REELS').length,
    };
  });
  weeks.forEach((w, idx) => {
    const s = stats[idx];
    const pCount = postsByWeek[idx];
    const er = s.erAvg;
    const dStart = new Date(w[0].date);
    const dEnd = new Date(w[w.length-1].date);
    const isCurrent = (idx === weeks.length-1 && isLastPartial);
    let cls;
    if (isCurrent) cls = 'current';
    else if (s.reach === maxReach && weeks.length > 1) cls = 'best';
    else if (s.reach >= maxReach * 0.7) cls = 'strong';
    else if (s.reach >= maxReach * 0.4) cls = 'mid';
    else cls = 'weak';
    const card = document.createElement('div');
    card.className = `week-card ${cls}`;
    const badge = (!isCurrent && s.reach === maxReach && weeks.length > 1) ? ' <span class="week-best-badge">★ TOP</span>' : '';
    const label = isCurrent ? 'WK in corso' : `WK${idx+1}`;
    card.innerHTML = `
      <div class="week-label">${label}${badge}</div>
      <div class="week-dates">${fmtDate(dStart)} – ${fmtDate(dEnd)}${isCurrent ? ' · parziale' : ''}</div>
      <div class="week-metric"><span class="week-metric-label">Reach</span><span class="week-metric-val${s.reach===maxReach?' accent':''}">${numIt(s.reach)}</span></div>
      <div class="week-metric"><span class="week-metric-label">Interazioni</span><span class="week-metric-val">${numIt(s.ints)}</span></div>
      <div class="week-metric"><span class="week-metric-label">Follower</span><span class="week-metric-val">${s.foll>=0?'+':''}${s.foll}</span></div>
      <div class="week-metric"><span class="week-metric-label">ER</span><span class="week-metric-val">${pct1(er)}</span></div>
      <div class="week-metric week-posts"><span class="week-metric-label">Contenuti</span><span class="week-metric-val">${pCount.total}${pCount.total > 0 ? ' <span class="week-types">'+(pCount.IMAGE?'<span class="wt wt-img" title="Foto" style="color:#7ec8f0"><span class="material-symbols-rounded" style="font-size:12px;vertical-align:middle;">photo_camera</span>'+pCount.IMAGE+'</span>':'')+(pCount.CAROUSEL_ALBUM?'<span class="wt wt-car" title="Carosello" style="color:#7ec8f0"><span class="material-symbols-rounded" style="font-size:12px;vertical-align:middle;">grid_view</span>'+pCount.CAROUSEL_ALBUM+'</span>':'')+(pCount.REELS?'<span class="wt wt-reel" title="Reel" style="color:#6ee0a0"><span class="material-symbols-rounded" style="font-size:12px;vertical-align:middle;">play_circle</span>'+pCount.REELS+'</span>':'')+'</span>' : ''}</span></div>`;
    grid.appendChild(card);
  });
}

function renderReachChart(period) {
  const ctx = document.getElementById('chartReach').getContext('2d');
  // Se esiste già un grafico su questo canvas, lo distruggo prima di ricrearlo
  // (altrimenti Chart.js dà "Canvas is already in use" e il grafico non si aggiorna).
  if (window.reachChart) { window.reachChart.destroy(); window.reachChart = null; }
  // Filtro giorni con dati validi (reach non null) per evitare cali fittizi a 0
  const validDays = period.filter(d => d.reach != null);
  const grad = ctx.createLinearGradient(0, 0, 0, 260);
  grad.addColorStop(0, 'rgba(255,140,30,0.32)');
  grad.addColorStop(1, 'rgba(255,140,30,0.01)');
  window.reachChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: validDays.map(d => fmtDate(new Date(d.date))),
      datasets: [{ label: 'Reach', data: validDays.map(d => d.reach||0), borderColor: '#ff8c1e', backgroundColor: grad, fill: true, borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: '#ffa53c', pointHoverBorderColor: '#0a0c12', pointHoverBorderWidth: 2, tension: 0.25 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1c212b', borderColor: '#ff8c1e', borderWidth: 1, titleColor: '#ffa53c', bodyColor: '#f5f5f5', titleFont: { family: 'Inter', size: 11 }, bodyFont: { family: 'Inter', size: 12 }, padding: 10, displayColors: false, callbacks: { label: c => 'Reach: ' + c.parsed.y.toLocaleString('it-IT') } } },
      scales: { x: { ticks: { maxTicksLimit: 10, font: { size: 10, family: 'Inter' }, color: '#5a5c64' }, grid: { display: false }, border: { color: 'rgba(255,255,255,0.06)' } }, y: { ticks: { font: { size: 10, family: 'Inter' }, color: '#5a5c64', callback: v => v >= 1000 ? (v/1000).toFixed(0)+'k' : v }, grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false }, border: { display: false } } }
    }
  });
}

