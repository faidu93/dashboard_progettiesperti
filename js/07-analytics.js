// ============================================================================
// js/07-analytics.js — Follower Analysis, YouTube, Google Calendar, AI Intel
// Dipendenze: 01-api.js, 03-kpi.js
// ============================================================================

// ============================================================================
// FOLLOWER ANALYSIS — chart + KPI
// ============================================================================
// ============================================================================
// DEMOGRAFIA REALE (Meta) — età + genere
// ============================================================================
function renderDemographics(demo) {
  if (!demo || !demo.available) return; // mantengo il fallback hardcoded
  const content = document.getElementById('demoContent');
  const sub = document.getElementById('demoSub');
  if (!content) return;

  const gender = demo.gender || {};
  const age = demo.age || {};
  const M = gender.M || 0, F = gender.F || 0, U = gender.U || 0;
  const totGenderDich = M + F; // escludo "non dichiarato" dalle percentuali genere
  const totCategorizzati = M + F + U;

  // Costruisco le righe genere
  let html = '<div class="demo-section"><div class="demo-section-title">Genere</div>';
  if (totGenderDich > 0) {
    const pM = (M/totGenderDich)*100, pF = (F/totGenderDich)*100;
    const maxG = Math.max(pM, pF) || 1;
    html += demoRow('Maschi', pM, (pM/maxG)*100);
    html += demoRow('Femmine', pF, (pF/maxG)*100);
  }
  html += '</div>';

  // Righe età (ordino le fasce)
  const ageOrder = ['13-17','18-24','25-34','35-44','45-54','55-64','65+'];
  const ageLabels = {'13-17':'13–17','18-24':'18–24','25-34':'25–34','35-44':'35–44','45-54':'45–54','55-64':'55–64','65+':'65+'};
  const totAge = ageOrder.reduce((s,k)=>s+(age[k]||0),0);
  if (totAge > 0) {
    const maxAge = Math.max(...ageOrder.map(k=>age[k]||0)) || 1;
    html += '<div class="demo-section"><div class="demo-section-title">Età</div>';
    ageOrder.forEach(k => {
      if ((age[k]||0) > 0) {
        const pct = ((age[k]||0)/totAge)*100;
        html += demoRow(ageLabels[k], pct, ((age[k]||0)/maxAge)*100);
      }
    });
    html += '</div>';
  }

  content.innerHTML = html;
  if (sub) sub.textContent = numIt(totCategorizzati) + ' follower categorizzati · dati Meta';

  // Aggiorno l'insight "Audience iper-qualificata" nella Strategia con numeri reali
  const insight = document.getElementById('insightAudience');
  if (insight && totGenderDich > 0 && totAge > 0) {
    const pctM = Math.round((M/totGenderDich)*100);
    const core = ((age['25-34']||0) + (age['35-44']||0));
    const pctCore = Math.round((core/totAge)*100);
    insight.textContent = `${pctM}% maschi sui categorizzati · ${pctCore}% fascia 25-44 · italiani città Serie A. Profilo perfetto del fantallenatore.`;
  }
}

function demoRow(label, pctVal, barWidth) {
  return `<div class="demo-row"><span class="demo-label">${label}</span>`
    + `<div class="demo-track"><div class="demo-fill" style="width:${Math.max(2,barWidth).toFixed(0)}%"></div></div>`
    + `<span class="demo-val">${pct1(pctVal)}</span></div>`;
}

// ============================================================================
// ORARI ATTIVITÀ FOLLOWER (Meta online_followers) — appare solo se disponibile
// ============================================================================
let onlineChart = null;
function renderOnlineFollowers(demo) {
  const section = document.getElementById('onlineFollowersSection');
  if (!section) return;
  const online = (demo && demo.online_followers) || {};
  const hours = Object.keys(online);
  if (!hours.length) { section.style.display = 'none'; return; } // Meta non li espone ancora

  section.style.display = '';
  const labels = [];
  const data = [];
  for (let h = 0; h < 24; h++) {
    labels.push(h + ':00');
    data.push(online[String(h)] || 0);
  }
  const canvas = document.getElementById('chartOnline');
  if (!canvas || typeof Chart === 'undefined') return;
  if (onlineChart) onlineChart.destroy();
  onlineChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Follower online', data,
      backgroundColor: 'rgba(255,140,30,0.55)', borderColor: 'rgba(255,140,30,1)', borderWidth: 1, borderRadius: 3 }] },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { ticks: { color: '#8a8f98', font: { size: 9 } }, grid: { display: false } },
                y: { ticks: { color: '#8a8f98', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } } } }
  });
}

function renderFollowerAnalysis(daily) {
  // Prendo gli ultimi 30 giorni con dati validi
  const valid = daily.filter(d => d.follower_count_1d != null || d.follows_and_unfollows != null).slice(-30);
  if (valid.length === 0) return;
  // Instagram via Graph API NON espone gli unfollow separati: 'follows_and_unfollows'
  // è già un saldo netto giornaliero. Mostriamo solo quel dato reale, senza
  // dedurre unfollow/retention da una sottrazione che darebbe sempre ~0.
  const netF = valid.reduce((s,d) => s + (d.follows_and_unfollows != null ? d.follows_and_unfollows : (d.follower_count_1d||0)), 0);
  const el = (id,v) => { const e = document.getElementById(id); if(e) e.textContent = v; };
  el('follNew', (netF >= 0 ? '+' : '') + netF);
  // Chart
  const ctx = document.getElementById('chartFollowers');
  if (!ctx) return;
  // Distruggo il grafico precedente su questo canvas, se esiste
  if (window.followersChart) { window.followersChart.destroy(); window.followersChart = null; }
  window.followersChart = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: {
      labels: valid.map(d => fmtDate(new Date(d.date))),
      datasets: [
        { label: 'Saldo netto follower', data: valid.map(d => d.follows_and_unfollows != null ? d.follows_and_unfollows : (d.follower_count_1d||0)), backgroundColor: 'rgba(54,201,118,0.6)', borderRadius: 3, barPercentage: 0.8 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 10 }, color: '#6b6b74' } }, y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { font: { family: 'Inter', size: 10 }, color: '#6b6b74' } } }
    }
  });
}


// ============================================================================
// GOOGLE CALENDAR INTEGRATION
// ============================================================================
const GCAL_CLIENT_ID = '875353468796-v9nc0d2v9nf55ebnji97n4gh4bpdteld.apps.googleusercontent.com';
const GCAL_CALENDAR_ID = 'progettoespertiprofeta@gmail.com';
const GCAL_SCOPES = 'https://www.googleapis.com/auth/calendar.events';

let gcalTokenClient = null;
let gcalSignedIn = false;
let gcalEvents = []; // cache eventi Google

function gcalUpdateUI() {
  const status = document.getElementById('gcalStatus');
  const loginBtn = document.getElementById('gcalLoginBtn');
  const logoutBtn = document.getElementById('gcalLogoutBtn');
  if (!status) return;
  if (gcalSignedIn) {
    status.innerHTML = '<strong style="color:var(--pos);">✓ Connesso a Google Calendar</strong> · sync automatico ogni 60s · <span id="gcalEvtCount">' + gcalEvents.length + '</span> eventi caricati';
    loginBtn.style.display = 'none';
    logoutBtn.style.display = 'inline-flex';
  } else {
    status.innerHTML = '<strong>Google Calendar non connesso</strong> · accedi per sincronizzare post pianificati tra dispositivi e team';
    loginBtn.style.display = 'inline-flex';
    logoutBtn.style.display = 'none';
  }
  // Aggiorno anche l'onboarding banner
  if (typeof updateOnboarding === 'function') updateOnboarding();
}


// === DRAG & DROP eventi pianificati ===
let calDragData = null;

document.addEventListener('dragstart', (e) => {
  const post = e.target.closest('.cal-post.plan');
  if (!post) return;
  calDragData = {
    id: post.dataset.evid,
    platform: post.dataset.platform,
    type: post.dataset.evtype,
    title: post.dataset.evtitle,
    notes: post.dataset.evnotes,
    time: post.dataset.evtime,
    host: post.dataset.evhost
  };
  e.dataTransfer.effectAllowed = 'move';
  // Aggiungo classe di feedback visivo
  post.style.opacity = '0.4';
});

document.addEventListener('dragend', (e) => {
  const post = e.target.closest('.cal-post.plan');
  if (post) post.style.opacity = '';
  calDragData = null;
});

function calDragOver(e) {
  if (!calDragData) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('cal-day-drop-target');
}

function calDragLeave(e) {
  e.currentTarget.classList.remove('cal-day-drop-target');
}

async function calDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('cal-day-drop-target');
  if (!calDragData) return;
  const newDate = e.currentTarget.dataset.date;
  if (!newDate || newDate === undefined) return;
  const d = calDragData; // copia locale prima dell'await
  calDragData = null;

  try {
    if (gcalSignedIn) {
      // Aggiorno l'evento su Google Calendar
      const ok = await gcalUpdateEvent(d.id, d.platform, newDate, d.time, d.type, d.title, d.notes, d.host);
      if (!ok) alert('Errore nello spostamento.');
    } else {
      // Fallback localStorage
      const loadFn = d.platform === 'yt' ? ytCalLoad : calLoad;
      const saveFn = d.platform === 'yt' ? ytCalSave : calSave;
      const items = loadFn();
      const idx = items.findIndex(i => i.id === d.id);
      if (idx >= 0) {
        items[idx].date = newDate;
        saveFn(items);
        calRender();
      }
    }
  } catch (err) {
    console.error('Drop error:', err);
    alert('Errore: ' + err.message);
  }
}

async function gcalInit() {
  // Aspetta che gli script Google E gapi.client siano caricati
  if (typeof google === 'undefined' || typeof gapi === 'undefined') {
    if (!window.__gcalInitAttempts) window.__gcalInitAttempts = 0;
    window.__gcalInitAttempts++;
    if (window.__gcalInitAttempts > 50) {
      console.warn('[gcalInit] Google scripts non caricati dopo 10s.');
      return;
    }
    setTimeout(gcalInit, 200);
    return;
  }
  // gapi è caricato ma gapi.client potrebbe non esistere ancora — lo carico
  if (!gapi.client) {
    console.log('[gcalInit] caricando gapi.client...');
    gapi.load('client', () => {
      console.log('[gcalInit] gapi.client caricato, riprendo init');
      gcalInit();
    });
    return;
  }
  console.log('[gcalInit] gapi.client pronto, init in corso');
  // Init GAPI con Calendar API (gapi.client è già pronto a questo punto)
  if (!gapi.client.calendar) {
    try {
      await gapi.client.init({
        discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest']
      });
      console.log('[gcalInit] gapi.client.calendar inizializzato');
    } catch(e) {
      console.error('[gcalInit] GAPI init error:', e);
      return;
    }
  }
  // Init token client
  try {
    gcalTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GCAL_CLIENT_ID,
      scope: GCAL_SCOPES,
      callback: async (resp) => {
        console.log('[token callback] response:', resp.error || 'success');
        if (resp.error) {
          if (resp.error === 'interaction_required' || resp.error === 'login_required' || resp.error === 'consent_required') {
            console.log('[token callback] richiede interazione utente:', resp.error);
            gcalUpdateUI();
            return;
          }
          console.error('[token callback] auth error:', resp);
          alert('Errore login Google: ' + (resp.error_description || resp.error));
          return;
        }
        // Salvo subito in localStorage (sopravvive a refresh)
        const expiresAt = Date.now() + (resp.expires_in * 1000);
        localStorage.setItem('gcal_token', resp.access_token);
        localStorage.setItem('gcal_expires', String(expiresAt));
        localStorage.setItem('gcal_was_signed_in', '1');

        // Aspetto che gapi.client sia pronto prima di setToken
        let attempts = 0;
        while ((typeof gapi === 'undefined' || !gapi.client || typeof gapi.client.setToken !== 'function') && attempts < 50) {
          await new Promise(r => setTimeout(r, 100));
          attempts++;
        }
        if (typeof gapi === 'undefined' || !gapi.client || typeof gapi.client.setToken !== 'function') {
          console.error('[token callback] gapi.client mai pronto dopo 5s');
          alert('Google API non caricata. Ricarica la pagina e riprova.');
          return;
        }
        // Se manca anche gapi.client.calendar, lo carico
        if (!gapi.client.calendar) {
          try {
            await gapi.client.init({
              discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest']
            });
            console.log('[token callback] gapi.client.calendar inizializzato');
          } catch(e) {
            console.error('[token callback] gapi.client.init error:', e);
            alert('Errore inizializzazione Calendar API: ' + (e.message || 'sconosciuto'));
            return;
          }
        }
        gapi.client.setToken({ access_token: resp.access_token });
        gcalSignedIn = true;
        gcalUpdateUI();
        gcalLoadEvents();
        if (!window.gcalRefreshInterval) {
          window.gcalRefreshInterval = setInterval(gcalLoadEvents, 60000);
        }
        gcalScheduleSilentRefresh(expiresAt);
      }
    });
    // Auto-restore se c'è un token valido
    const savedToken = localStorage.getItem('gcal_token');
    const expires = parseInt(localStorage.getItem('gcal_expires') || '0');
    // Riuso il token salvato quasi fino alla scadenza reale (margine 2 min),
    // così a ogni refresh NON ripropongo il login se il token è ancora buono.
    const stillValid = savedToken && (Date.now() < expires - 2*60*1000);

    console.log('[gcalInit] token cached:', !!savedToken, 'valid:', stillValid, 'expires in (s):', Math.round((expires - Date.now())/1000));

    if (stillValid) {
      // IMPORTANTE: setto il token in gapi PRIMA di marcare signed-in
      // Altrimenti gapi.client.calendar.X() chiamerebbe senza autenticazione
      gapi.client.setToken({ access_token: savedToken });
      gcalSignedIn = true;
      console.log('[gcalInit] token ripristinato, signed in');
      gcalUpdateUI();
      gcalLoadEvents();
      if (!window.gcalRefreshInterval) {
        window.gcalRefreshInterval = setInterval(gcalLoadEvents, 60000);
      }
      gcalScheduleSilentRefresh(expires);
    } else if (localStorage.getItem('gcal_was_signed_in') === '1') {
      console.log('[gcalInit] token scaduto/assente ma flag was_signed_in c’è, tento silent refresh');
      // L'utente si era loggato — tenta silent auth (no popup)
      gcalUpdateUI();
      setTimeout(() => gcalSilentRefresh(), 500);
    } else {
      console.log('[gcalInit] primo accesso, mostro banner login');
      gcalUpdateUI();
    }
  } catch(e) { console.error('Token client init error:', e); gcalUpdateUI(); }
}


// Silent refresh: richiede un nuovo access token senza popup (se l'utente
// è ancora loggato a Google nel browser). Per casi in cui il token è scaduto.
function gcalSilentRefresh() {
  if (!gcalTokenClient) return;
  try {
    // prompt: '' = silent — niente popup, niente richiesta di consenso.
    // Funziona se l'utente è già loggato a Google nel browser.
    gcalTokenClient.requestAccessToken({ prompt: '' });
  } catch (e) {
    console.warn('Silent refresh fallito:', e);
  }
}

// Programma un silent refresh ~1 minuto prima che il token scada
function gcalScheduleSilentRefresh(expiresAt) {
  if (window.gcalSilentRefreshTimer) clearTimeout(window.gcalSilentRefreshTimer);
  const msUntilRefresh = expiresAt - Date.now() - 60 * 1000; // 1 min prima
  if (msUntilRefresh > 0) {
    window.gcalSilentRefreshTimer = setTimeout(() => {
      console.log('Silent refresh del token Google...');
      gcalSilentRefresh();
    }, msUntilRefresh);
  }
}

function gcalLogin() {
  if (!gcalTokenClient) { alert('Google non ancora pronto. Riprova tra qualche secondo.'); return; }
  // prompt:'' riusa il consenso già dato (niente schermata ripetuta se già autorizzato).
  // Se non c'è ancora alcun consenso, Google mostra comunque il popup la prima volta.
  // Il flag forza 'consent' solo se l'utente preme di nuovo dopo un fallimento.
  const needConsent = (localStorage.getItem('gcal_was_signed_in') !== '1');
  gcalTokenClient.requestAccessToken({ prompt: needConsent ? 'consent' : '' });
}

function gcalLogout() {
  const token = gapi.client.getToken();
  if (token) {
    google.accounts.oauth2.revoke(token.access_token, () => {});
    gapi.client.setToken(null);
  }
  localStorage.removeItem('gcal_token');
  localStorage.removeItem('gcal_expires');
  localStorage.removeItem('gcal_was_signed_in');
  gcalSignedIn = false;
  gcalEvents = [];
  if (window.gcalRefreshInterval) { clearInterval(window.gcalRefreshInterval); window.gcalRefreshInterval = null; }
  if (window.gcalSilentRefreshTimer) { clearTimeout(window.gcalSilentRefreshTimer); window.gcalSilentRefreshTimer = null; }
  gcalUpdateUI();
  calRender();
}

async function gcalLoadEvents() {
  if (!gcalSignedIn) { console.log('[gcalLoadEvents] skipped: not signed in'); return; }
  if (typeof gapi === 'undefined' || !gapi.client || !gapi.client.calendar) {
    console.log('[gcalLoadEvents] skipped: gapi not ready');
    return;
  }
  if (!gcalEnsureToken()) {
    console.warn('[gcalLoadEvents] token non disponibile');
    gcalSignedIn = false;
    gcalUpdateUI();
    return;
  }
  console.log('[gcalLoadEvents] loading from', GCAL_CALENDAR_ID);
  try {
    const timeMin = new Date(Date.now() - 60*24*3600*1000).toISOString();
    const timeMax = new Date(Date.now() + 180*24*3600*1000).toISOString();
    const resp = await gapi.client.calendar.events.list({
      calendarId: GCAL_CALENDAR_ID,
      timeMin, timeMax,
      maxResults: 500,
      singleEvents: true,
      orderBy: 'startTime'
    });
    gcalEvents = resp.result.items || [];
    console.log('[gcalLoadEvents] loaded', gcalEvents.length, 'events');
    const countEl = document.getElementById('gcalEvtCount');
    if (countEl) countEl.textContent = gcalEvents.length;
    calRender(); ytRender();
  } catch(e) {
    console.error('gcalLoadEvents error:', e);
    if (e?.status === 401 || e?.result?.error?.code === 401) {
      // Token scaduto → tento silent refresh PRIMA di sloggare l'utente
      console.log('Token scaduto, tento silent refresh...');
      gcalSilentRefresh();
    }
  }
}


// Helper: assicura che gapi abbia il token corrente settato prima di una chiamata API
// Restituisce true se OK, false se serve riloggare
function gcalEnsureToken() {
  if (typeof gapi === 'undefined' || !gapi.client || typeof gapi.client.setToken !== 'function') {
    console.warn('[gcalEnsureToken] gapi.client non pronto');
    return false;
  }
  const savedToken = localStorage.getItem('gcal_token');
  const expires = parseInt(localStorage.getItem('gcal_expires') || '0');
  if (!savedToken || Date.now() >= expires) {
    console.warn('[gcalEnsureToken] token scaduto o assente in localStorage');
    return false;
  }
  const current = gapi.client.getToken();
  if (!current || current.access_token !== savedToken) {
    console.log('[gcalEnsureToken] re-setto token in gapi');
    gapi.client.setToken({ access_token: savedToken });
  }
  return true;
}

async function gcalCreateEvent(platform, date, time, type, title, notes, host) {
  console.log('[gcalCreateEvent] start', { platform, date, time, type, title, host });

  // Diagnostica preliminare
  if (typeof gapi === 'undefined' || !gapi.client) {
    const msg = 'Google API non caricata. Ricarica la pagina e riprova.';
    console.error(msg);
    alert(msg);
    return null;
  }
  if (!gapi.client.calendar) {
    const msg = 'Calendar API non inizializzata. Ricarica la pagina e riprova.';
    console.error(msg);
    alert(msg);
    return null;
  }
  if (!gcalSignedIn) {
    alert('Non sei connesso a Google Calendar. Premi "Accedi a Google".');
    return null;
  }
  // Assicuro che il token sia settato in gapi prima della chiamata
  if (!gcalEnsureToken()) {
    alert('Sessione Google scaduta. Premi "Accedi a Google" per riloggare.');
    gcalSignedIn = false;
    gcalUpdateUI();
    return null;
  }

  // Costruisco l'evento
  const startDate = date + 'T' + (time || '10:00') + ':00';
  const start = new Date(startDate);
  const end = new Date(start.getTime() + 30*60*1000);
  const formatEmoji = {IMAGE:'📊', CAROUSEL_ALBUM:'🎠', REELS:'🎬', STORY:'📱', VIDEO:'🎬', SHORT:'📱', LIVE:'🔴', ASTA_LIVE:'🔨'};
  const platformTag = platform === 'yt' ? '[YT]' : '[IG]';
  const summary = `${platformTag} ${formatEmoji[type]||''} ${title}`;
  const description = 'Piattaforma: ' + (platform === 'yt' ? 'YouTube' : 'Instagram') + '\nFormato: ' + type + (host ? '\nHost: ' + host : '') + '\n\n' + (notes || '');

  const resource = {
    summary,
    description,
    start: { dateTime: start.toISOString(), timeZone: 'Europe/Rome' },
    end: { dateTime: end.toISOString(), timeZone: 'Europe/Rome' },
    extendedProperties: { private: { platform, type, title, notes: notes||'', host: host||'' } }
  };

  console.log('[gcalCreateEvent] sending', { calendarId: GCAL_CALENDAR_ID, resource });

  try {
    const resp = await gapi.client.calendar.events.insert({
      calendarId: GCAL_CALENDAR_ID,
      resource
    });
    console.log('[gcalCreateEvent] success', resp.result);
    await gcalLoadEvents();
    return resp.result;
  } catch(e) {
    console.error('[gcalCreateEvent] ERROR:', e);
    // Estraggo il messaggio più chiaro possibile da Google
    const status = e?.status || e?.result?.error?.code;
    const errMsg = e?.result?.error?.message || e?.body || e?.message || JSON.stringify(e);

    let userMsg = 'Errore: ' + errMsg;
    if (status === 401) {
      userMsg = 'Sessione Google scaduta. Premi "Accedi a Google" per riloggare.';
      gcalSignedIn = false;
      localStorage.removeItem('gcal_token');
      gcalUpdateUI();
    } else if (status === 403) {
      userMsg = 'Permesso negato dal calendario. Verifica di essere loggato con l’account giusto (progettoespertiprofeta@gmail.com).';
    } else if (status === 404) {
      userMsg = 'Calendario non trovato. Verifica di essere loggato con progettoespertiprofeta@gmail.com.';
    }
    alert(userMsg);
    return null;
  }
}

async function gcalUpdateEvent(eventId, platform, date, time, type, title, notes, host) {
  console.log('[gcalUpdateEvent] start', { eventId, platform, date, time, type, host });
  if (typeof gapi === 'undefined' || !gapi.client || !gapi.client.calendar) {
    alert('Google API non caricata. Ricarica la pagina.'); return false;
  }
  if (!gcalSignedIn) { alert('Non sei connesso a Google Calendar.'); return false; }
  if (!eventId) { alert('ID evento mancante.'); return false; }
  if (!gcalEnsureToken()) {
    alert('Sessione Google scaduta. Premi "Accedi a Google" per riloggare.');
    gcalSignedIn = false;
    gcalUpdateUI();
    return false;
  }

  const startDate = date + 'T' + (time || '10:00') + ':00';
  const start = new Date(startDate);
  const end = new Date(start.getTime() + 30*60*1000);
  const formatEmoji = {IMAGE:'📊', CAROUSEL_ALBUM:'🎠', REELS:'🎬', STORY:'📱', VIDEO:'🎬', SHORT:'📱', LIVE:'🔴', ASTA_LIVE:'🔨'};
  const platformTag = platform === 'yt' ? '[YT]' : '[IG]';
  const summary = `${platformTag} ${formatEmoji[type]||''} ${title}`;
  const description = 'Piattaforma: ' + (platform === 'yt' ? 'YouTube' : 'Instagram') + '\nFormato: ' + type + (host ? '\nHost: ' + host : '') + '\n\n' + (notes || '');

  try {
    const resp = await gapi.client.calendar.events.update({
      calendarId: GCAL_CALENDAR_ID,
      eventId,
      resource: {
        summary, description,
        start: { dateTime: start.toISOString(), timeZone: 'Europe/Rome' },
        end: { dateTime: end.toISOString(), timeZone: 'Europe/Rome' },
        extendedProperties: { private: { platform, type, title, notes: notes||'', host: host||'' } }
      }
    });
    console.log('[gcalUpdateEvent] success');
    await gcalLoadEvents();
    return true;
  } catch(e) {
    console.error('[gcalUpdateEvent] ERROR:', e);
    const status = e?.status || e?.result?.error?.code;
    const errMsg = e?.result?.error?.message || e?.message || JSON.stringify(e);
    let userMsg = 'Errore aggiornamento: ' + errMsg;
    if (status === 401) {
      userMsg = 'Sessione Google scaduta. Premi "Accedi a Google" per riloggare.';
      gcalSignedIn = false;
      localStorage.removeItem('gcal_token');
      gcalUpdateUI();
    } else if (status === 403 || status === 404) {
      userMsg = 'Permesso negato o evento/calendario non trovato. Verifica l’account Google.';
    }
    alert(userMsg);
    return false;
  }
}

async function gcalDeleteEvent(eventId) {
  console.log('[gcalDeleteEvent] start', { eventId });
  if (typeof gapi === 'undefined' || !gapi.client || !gapi.client.calendar) {
    alert('Google API non caricata. Ricarica la pagina.'); return false;
  }
  if (!gcalSignedIn) { alert('Non sei connesso a Google Calendar.'); return false; }
  if (!eventId) { alert('ID evento mancante.'); return false; }
  if (!gcalEnsureToken()) {
    alert('Sessione Google scaduta. Premi "Accedi a Google" per riloggare.');
    gcalSignedIn = false;
    gcalUpdateUI();
    return false;
  }
  try {
    await gapi.client.calendar.events.delete({ calendarId: GCAL_CALENDAR_ID, eventId });
    console.log('[gcalDeleteEvent] success');
    await gcalLoadEvents();
    return true;
  } catch(e) {
    console.error('[gcalDeleteEvent] ERROR:', e);
    const status = e?.status || e?.result?.error?.code;
    if (status === 410 || status === 404) {
      // Già eliminato — considerato successo
      await gcalLoadEvents();
      return true;
    }
    const errMsg = e?.result?.error?.message || e?.message || JSON.stringify(e);
    let userMsg = 'Errore eliminazione: ' + errMsg;
    if (status === 401) {
      userMsg = 'Sessione Google scaduta. Premi "Accedi a Google" per riloggare.';
      gcalSignedIn = false;
      localStorage.removeItem('gcal_token');
      gcalUpdateUI();
    } else if (status === 403) {
      userMsg = 'Permesso negato. Verifica di essere loggato con progettoespertiprofeta@gmail.com.';
    }
    alert(userMsg);
    return false;
  }
}

// Converte un evento Google → formato interno per il render
function gcalEventToInternal(ev) {
  const ext = ev.extendedProperties?.private || {};
  const startDt = ev.start?.dateTime || ev.start?.date;
  const dt = new Date(startDt);
  const date = dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0') + '-' + String(dt.getDate()).padStart(2,'0');
  const time = String(dt.getHours()).padStart(2,'0') + ':' + String(dt.getMinutes()).padStart(2,'0');
  return {
    id: ev.id,
    date, time,
    type: ext.type || 'IMAGE',
    title: ext.title || (ev.summary||'').replace(/^\[(IG|YT)\]\s*[\u{1F300}-\u{1FAFF}]?\s*/u, ''),
    notes: ext.notes || '',
    host: ext.host || '',
    platform: ext.platform || (ev.summary?.startsWith('[YT]') ? 'yt' : 'ig')
  };
}

// Funzioni che il calRender e ytRender chiameranno per ottenere i "pianificati"
function gcalGetIgPlanned() {
  return gcalEvents
    .filter(e => {
      const ext = e.extendedProperties?.private || {};
      return ext.platform === 'ig' || (!ext.platform && e.summary?.startsWith('[IG]'));
    })
    .map(gcalEventToInternal);
}
function gcalGetYtPlanned() {
  return gcalEvents
    .filter(e => {
      const ext = e.extendedProperties?.private || {};
      return ext.platform === 'yt' || (!ext.platform && e.summary?.startsWith('[YT]'));
    })
    .map(gcalEventToInternal);
}


// Nasconde permanentemente il banner di onboarding salvando la preferenza
function dismissOnboardingBanner() {
  const banner = document.getElementById('onboardingBanner');
  if (banner) banner.style.display = 'none';
  try {
    localStorage.setItem('dismissed_onboarding_banner', 'true');
  } catch(e) {}
}

function updateOnboarding() {
  const banner = document.getElementById('onboardingBanner');
  if (!banner) return;
  
  // Se l'utente ha chiuso il banner in passato, non mostrarlo
  try {
    if (localStorage.getItem('dismissed_onboarding_banner') === 'true') {
      banner.style.display = 'none';
      return;
    }
  } catch(e) {}

  const hasGoogle = gcalSignedIn;
  // I dati IG/YT arrivano dal backend (sempre configurato). Il banner serve ora
  // solo a guidare la connessione di Google Calendar.
  banner.style.display = hasGoogle ? 'none' : 'block';

  // Step 1: Google
  const step1Card = document.getElementById('step1Card');
  const step1Status = document.getElementById('step1Status');
  const loginBtn = document.getElementById('onboardingLoginBtn');
  if (hasGoogle) {
    step1Card.style.opacity = '0.6';
    step1Card.style.borderLeftColor = 'var(--pos)';
    step1Status.innerHTML = '<span style="color:var(--pos);">✓ Completato</span>';
    if (loginBtn) {
      loginBtn.innerHTML = '<span class="material-symbols-rounded" style="font-size:16px;">check_circle</span>Connesso';
      loginBtn.style.background = 'var(--pos)';
      loginBtn.disabled = true;
    }
  } else {
    step1Card.style.opacity = '1';
    step1Card.style.borderLeftColor = 'var(--accent)';
    step1Status.textContent = 'da fare';
    if (loginBtn) {
      loginBtn.innerHTML = '<span class="material-symbols-rounded" style="font-size:16px;">login</span>Accedi a Google';
      loginBtn.style.background = 'var(--accent)';
      loginBtn.disabled = false;
    }
  }

  // Step 2: dati Instagram/YouTube — ora sempre attivi via backend
  const step2Card = document.getElementById('step2Card');
  const step2Status = document.getElementById('step2Status');
  const keyBtn = document.getElementById('onboardingKeyBtn');
  if (step2Card) {
    step2Card.style.opacity = '0.6';
    step2Card.style.borderLeftColor = 'var(--pos)';
  }
  if (step2Status) step2Status.innerHTML = '<span style="color:var(--pos);">✓ Attivo</span>';
  if (keyBtn) {
    keyBtn.innerHTML = '<span class="material-symbols-rounded" style="font-size:16px;">check_circle</span>Connesso';
    keyBtn.style.background = 'var(--pos)';
    keyBtn.disabled = true;
  }
}

// ── Persistenza campi Intelligence ──
function intelSaveSecret(fieldId) {
  const val = document.getElementById(fieldId)?.value?.trim();
  if (!val) return;
  try { localStorage.setItem('publish_secret', val); sessionStorage.setItem('publish_secret', val); } catch(e) {}
}

const INTEL_KEYS = {
  ytApiKey:'intel_yt_apikey', ytChannels:'intel_yt_channels', ytVideoCount:'intel_yt_count',
  ytIdeaCount:'intel_yt_ideacount',
  ytTopic:'intel_yt_topic', ytPeriod:'intel_yt_period',
  igProfiles:'intel_ig_profiles', igFocus:'intel_ig_focus',
  igFormatFilter:'intel_ig_format', igIdeaCount:'intel_ig_ideacount',
};
const INTEL_LOCAL = new Set([
  'ytApiKey', 'ytChannels', 'ytVideoCount', 'ytIdeaCount', 'ytTopic', 'ytPeriod',
  'igProfiles', 'igFocus', 'igFormatFilter', 'igIdeaCount'
]);

function intelSaveField(id) {
  try {
    const store = INTEL_LOCAL.has(id) ? localStorage : sessionStorage;
    store.setItem(INTEL_KEYS[id], document.getElementById(id).value);
  } catch(e) {}
}

function intelRestoreFields() {
  Object.entries(INTEL_KEYS).forEach(([id, key]) => {
    try {
      const store = INTEL_LOCAL.has(id) ? localStorage : sessionStorage;
      const val = store.getItem(key);
      const el = document.getElementById(id);
      if (val !== null && el) el.value = val;
    } catch(e) {}
  });
  try {
    const s = localStorage.getItem('publish_secret') || sessionStorage.getItem('publish_secret') || '';
    if (s) {
      ['ytSecret','igSecret'].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.value) el.value = s;
      });
    }
  } catch(e) {}
}

// ── Storia ricerche in localStorage ──
// Struttura: { id, platform, timestamp, label, ideas[], votes{} }
const INTEL_HISTORY_KEY = 'intel_search_history';
const INTEL_MAX_SESSIONS = 20;

function intelHistoryLoad() {
  try { return JSON.parse(localStorage.getItem(INTEL_HISTORY_KEY) || '[]'); } catch(e) { return []; }
}
function intelHistorySave(sessions) {
  try { localStorage.setItem(INTEL_HISTORY_KEY, JSON.stringify(sessions.slice(-INTEL_MAX_SESSIONS))); } catch(e) {}
}
function intelHistoryAdd(platform, label, ideas, params) {
  const sessions = intelHistoryLoad();
  const id = Date.now().toString(36);
  sessions.push({ id, platform, timestamp: Date.now(), label, ideas, votes: {}, params });
  intelHistorySave(sessions);
  return id;
}
function intelHistoryVote(sessionId, ideaNum, vote) {
  const sessions = intelHistoryLoad();
  const s = sessions.find(x => x.id === sessionId);
  if (!s) return;
  s.votes[ideaNum] = s.votes[ideaNum] === vote ? null : vote; // toggle
  intelHistorySave(sessions);
}
function intelHistoryDelete(sessionId) {
  const sessions = intelHistoryLoad().filter(x => x.id !== sessionId);
  intelHistorySave(sessions);
}

function intelRenderHistoryBar(platform, activeId) {
  const barId = platform === 'yt' ? 'ytHistoryBar' : 'igHistoryBar';
  const bar = document.getElementById(barId);
  if (!bar) return;
  const sessions = intelHistoryLoad().filter(s => s.platform === platform).reverse();
  if (!sessions.length) { bar.style.display = 'none'; return; }
  bar.style.display = 'block';
  bar.innerHTML = '<div class="intel-history-bar">' +
    '<span style="font-family:var(--font-mono);font-size:10px;color:var(--ink-mute);align-self:center;">Ricerche:</span>' +
    sessions.map(s => {
      const d = new Date(s.timestamp);
      const lbl = d.getDate() + '/' + (d.getMonth()+1) + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
      const active = s.id === activeId ? ' active' : '';
      return `<span class="intel-hist-chip${active}" onclick="intelLoadSession('${s.id}','${platform}')">
        ${s.label || lbl}
        <span class="hist-del" onclick="event.stopPropagation();intelDeleteSession('${s.id}','${platform}')">×</span>
      </span>`;
    }).join('') +
  '</div>';
}

function intelLoadSession(sessionId, platform) {
  const sessions = intelHistoryLoad();
  const s = sessions.find(x => x.id === sessionId);
  if (!s) return;
  const ideasBox = platform === 'yt' ? 'ytIdeas' : 'igIdeas';
  
  if (platform === 'yt') {
    ytSwitchSubTab('ideas');
    document.getElementById('ytIdeasConfig').style.display = 'none';
    document.getElementById('ytIdeasOutput').style.display = 'block';
    const titleEl = document.getElementById('ytIdeasOutTitle');
    const d = new Date(s.timestamp);
    if (titleEl) titleEl.textContent = s.label + ' · ' + d.toLocaleString('it-IT');
  } else {
    const outDiv = 'igIntelOutput';
    const titleEl = 'igIntelOutTitle';
    const cfgDiv = 'igIntelConfig';
    document.getElementById(cfgDiv).style.display = 'none';
    document.getElementById(outDiv).style.display = 'block';
    const d = new Date(s.timestamp);
    document.getElementById(titleEl).textContent = s.label + ' · ' + d.toLocaleString('it-IT');
  }
  
  renderIdeas(s.ideas, ideasBox, platform, sessionId, s.votes || {});
  intelRenderHistoryBar(platform, sessionId);
}

function intelDeleteSession(sessionId, platform) {
  if (!confirm('Eliminare questa ricerca dalla storia?')) return;
  intelHistoryDelete(sessionId);
  intelRenderHistoryBar(platform, null);
  
  if (platform === 'yt') {
    document.getElementById('ytIdeasOutput').style.display = 'none';
    document.getElementById('ytIdeasConfig').style.display = 'block';
  } else {
    document.getElementById('igIntelOutput').style.display = 'none';
    document.getElementById('igIntelConfig').style.display = 'block';
  }
}

// ── Helper: legge la secret senza prompt bloccante ──
function intelGetSecret(platform) {
  const fieldId = platform === 'yt' ? 'ytSecret' : 'igSecret';
  const el = document.getElementById(fieldId);
  let s = (el && el.value.trim()) || '';
  if (!s) {
    try { s = localStorage.getItem('publish_secret') || sessionStorage.getItem('publish_secret') || ''; } catch(e) {}
  }
  if (s) {
    try { localStorage.setItem('publish_secret', s); sessionStorage.setItem('publish_secret', s); } catch(e) {}
    if (el && !el.value) el.value = s;
  }
  return s;
}

function parseIsoDuration(duration) {
  if (!duration) return 0;
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || 0);
  const minutes = parseInt(match[2] || 0);
  const seconds = parseInt(match[3] || 0);
  return hours * 3600 + minutes * 60 + seconds;
}

function ytSwitchSubTab(tab) {
  const btnComp = document.getElementById('btnSubYtComp');
  const btnIdeas = document.getElementById('btnSubYtIdeas');
  const panelComp = document.getElementById('panelYtComp');
  const panelIdeas = document.getElementById('panelYtIdeas');
  
  if (!btnComp || !btnIdeas || !panelComp || !panelIdeas) return;

  if (tab === 'comp') {
    btnComp.classList.add('active');
    btnIdeas.classList.remove('active');
    panelComp.style.display = 'block';
    panelIdeas.style.display = 'none';
  } else {
    btnComp.classList.remove('active');
    btnIdeas.classList.add('active');
    panelComp.style.display = 'none';
    panelIdeas.style.display = 'block';
  }
}

function ytCompNewSearch() {
  document.getElementById('ytCompConfig').style.display = 'block';
  document.getElementById('ytCompOutput').style.display = 'none';
}

function ytIdeasNewSearch() {
  document.getElementById('ytIdeasConfig').style.display = 'block';
  document.getElementById('ytIdeasOutput').style.display = 'none';
}

function igIntelNewSearch() {
  document.getElementById('igIntelConfig').style.display = 'block';
  document.getElementById('igIntelOutput').style.display = 'none';
  intelRenderHistoryBar('ig', null);
}

function checkYtResponse(resData) {
  if (resData && resData.error) {
    const msg = resData.error.message || 'Errore API sconosciuto';
    const code = resData.error.code;
    const reason = resData.error.errors?.[0]?.reason || '';
    if (code === 400 || code === 403 || reason === 'quotaExceeded' || reason === 'keyInvalid') {
      throw new Error(`YouTube API Error [${code}]: ${msg}`);
    }
  }
}

async function runYtCompetitorAnalysis() {
  const channelRaw = document.getElementById('ytChannels').value.trim();
  const apiKey = document.getElementById('ytApiKey').value.trim();
  const n = parseInt(document.getElementById('ytVideoCount').value) || 10;
  const periodDays = parseInt(document.getElementById('ytPeriod')?.value) || 30;

  if (!channelRaw) { alert('Inserisci almeno un canale.'); return; }
  if (!apiKey) { alert('Inserisci la API Key YouTube.'); return; }

  const channels = channelRaw.split('\n').map(s => s.trim()).filter(Boolean);
  const btn = document.getElementById('ytIntelRunBtn');
  const status = document.getElementById('ytIntelStatus');
  btn.disabled = true;

  const minDate = new Date();
  minDate.setDate(minDate.getDate() - periodDays);
  const minDateISO = minDate.toISOString();
  
  const periodLabel = periodDays === 3 ? 'ultimi 3 giorni'
                    : periodDays === 7 ? 'ultima settimana'
                    : periodDays === 14 ? 'ultime 2 settimane'
                    : periodDays === 30 ? 'ultimi 30 giorni'
                    : 'ultimi 45 giorni';

  status.textContent = 'Recupero video…';

  try {
    const allVideos = [];
    const errors = [];
    
    window.ytChannelErrors = window.ytChannelErrors || {};
    for (const ch of channels) {
      try {
        delete window.ytChannelErrors[ch];
        let channelId = ch;
        let subscriberCount = 0;

        const handleClean = ch.trim().toLowerCase();
        const handleLower = handleClean.startsWith('@') ? handleClean : '@' + handleClean;
        const KNOWN_YT_CHANNELS = {
          '@carmyspecial': 'UCMtH10Af4F5xshHdTEbpb0w',
          '@ludovicorossini': 'UC6fTpzA1EHqGYnQ3U_d-FQg',
          '@lucadiddi': 'UCAP6ktxXuHQA-VUkCY991xA',
          '@fantavirus': 'UCJ-Ov8s3eN6m_BKURClAqoA',
          '@ilprofetafantacalcio': 'UC0sjUSHxZxsE2eakZ-HBvMg',
          '@recosta': 'UCvAYdLxV5_xxigfJB5L6yJA',
          '@lorenzocantarini': 'UC70c-ffIIpEW_-DVpKIKbiA',
          '@fantalab_official': 'UCbEvmTFMG6zBeraU8475lTQ',
          '@andreamarinozziyt': 'UCC4uAMotqxQM0akswEuizNg',
          '@stefanoborghi296': 'UCCmRCjR_A5GEdHV3Iv7Y0hg',
          '@marcellobaldigiornalista': 'UCXxyju1QEkYHAMrd1snK7Yw'
        };

        if (KNOWN_YT_CHANNELS[handleLower]) {
          channelId = KNOWN_YT_CHANNELS[handleLower];
        } else if (ch.startsWith('@') || !ch.startsWith('UC')) {
          const handle = ch.startsWith('@') ? ch : '@' + ch;
          const handleName = handle.replace('@', '');
          
          // 1. Tenta con channels?forHandle (esatto)
          try {
            const chRes = await fetch('https://www.googleapis.com/youtube/v3/channels?part=statistics,contentDetails&forHandle=' + encodeURIComponent(handleName) + '&key=' + apiKey);
            const chData = await chRes.json();
            checkYtResponse(chData);
            
            if (chData.items && chData.items.length > 0) {
              channelId = chData.items[0].id;
              subscriberCount = parseInt(chData.items[0].statistics?.subscriberCount || 0);
            }
          } catch(err) {
            if (err.message.includes('YouTube API Error') || err.message.includes('quota') || err.message.includes('key')) {
              throw err;
            }
            console.warn('Errore forHandle per ' + ch + ':', err);
          }
          
          // 2. Fallback ricerca classica con @
          if (!channelId.startsWith('UC')) {
            try {
              const q = encodeURIComponent(handle);
              const srRes = await fetch('https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=' + q + '&maxResults=1&key=' + apiKey);
              const srData = await srRes.json();
              checkYtResponse(srData);
              if (srData.items && srData.items.length > 0) {
                channelId = srData.items[0].id?.channelId || ch;
              }
            } catch(err) {
              if (err.message.includes('YouTube API Error') || err.message.includes('quota') || err.message.includes('key')) {
                throw err;
              }
              console.warn('Errore ricerca con @ per ' + ch + ':', err);
            }
          }
          
          // 3. Fallback ricerca classica senza @
          if (!channelId.startsWith('UC')) {
            try {
              const q = encodeURIComponent(handleName);
              const srRes = await fetch('https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=' + q + '&maxResults=1&key=' + apiKey);
              const srData = await srRes.json();
              checkYtResponse(srData);
              if (srData.items && srData.items.length > 0) {
                channelId = srData.items[0].id?.channelId || ch;
              }
            } catch(err) {
              if (err.message.includes('YouTube API Error') || err.message.includes('quota') || err.message.includes('key')) {
                throw err;
              }
              console.warn('Errore ricerca senza @ per ' + ch + ':', err);
            }
          }
        }

        // Verifica finale di correttezza dell'ID
        if (!channelId.startsWith('UC')) {
          throw new Error(`Non è stato possibile risolvere l'ID del canale per l'handle "${ch}". Verifica che sia scritto correttamente.`);
        }

        const chRes = await fetch('https://www.googleapis.com/youtube/v3/channels?part=statistics,contentDetails&id=' + channelId + '&key=' + apiKey);
        const chData = await chRes.json();
        checkYtResponse(chData);
        subscriberCount = parseInt(chData.items?.[0]?.statistics?.subscriberCount || 0);
        const uploadsPlaylistId = chData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads || ('UU' + channelId.slice(2));

        window.ytChannelSubs = window.ytChannelSubs || {};
        window.ytChannelSubs[ch] = subscriberCount;

        let playlistUrl = 'https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=' + uploadsPlaylistId
          + '&maxResults=' + n
          + '&key=' + apiKey;

        const playlistRes = await fetch(playlistUrl);
        const playlistData = await playlistRes.json();
        checkYtResponse(playlistData);
        
        const videoIds = (playlistData.items || [])
          .filter(item => {
            const pubDate = new Date(item.snippet?.publishedAt || '');
            return pubDate >= minDate;
          })
          .map(item => item.snippet?.resourceId?.videoId)
          .filter(Boolean);

        if (!videoIds.length) continue;

        const statsRes = await fetch('https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails,snippet,liveStreamingDetails&id=' + videoIds.join(',') + '&key=' + apiKey);
        const statsData = await statsRes.json();
        checkYtResponse(statsData);
        
        (statsData.items||[]).forEach(v => {
          const durationSec = parseIsoDuration(v.contentDetails?.duration || '');
          const title = (v.snippet?.title || '').toLowerCase();
          const desc = (v.snippet?.description || '').toLowerCase();

          const isCurrentlyLive = v.snippet?.liveBroadcastContent === 'live';
          const isCompletedBroadcast = v.snippet?.liveBroadcastContent === 'completed';
          const isLiveStreamTitle = title.includes('live') || title.includes('diretta') || title.includes('streamed');
          const isLongLive = durationSec > 3000 && v.liveStreamingDetails !== undefined;

          const isLiveStream = isCurrentlyLive || isCompletedBroadcast || isLiveStreamTitle || isLongLive;
          if (isLiveStream) return;

          const isShortTag = title.includes('#short') || desc.includes('#short') || (v.snippet?.tags || []).some(t => t.toLowerCase().includes('short'));
          if (durationSec > 0 && (durationSec <= 180 || isShortTag)) return;

          const vViews = parseInt(v.statistics?.viewCount||0);
          const vLikes = parseInt(v.statistics?.likeCount||0);
          const vComments = parseInt(v.statistics?.commentCount||0);
          const vEngScore = vViews > 0 ? ((vLikes + vComments) / vViews * 100) : 0;
          
          allVideos.push({
            channel: ch, title: v.snippet?.title||'—', publishedAt: (v.snippet?.publishedAt||'').slice(0,10),
            views: vViews, likes: vLikes, comments: vComments, engScore: Math.round(vEngScore * 100) / 100,
            videoId: v.id, description: (v.snippet?.description||'').slice(0,300).replace(/\n/g,' '),
            tags: (v.snippet?.tags||[]).slice(0,8).join(', '), thumbnail: v.snippet?.thumbnails?.medium?.url || v.snippet?.thumbnails?.default?.url || ''
          });
        });
      } catch(e) {
        console.warn('Errore canale ' + ch + ':', e.message);
        errors.push(ch + ': ' + e.message);
        window.ytChannelErrors = window.ytChannelErrors || {};
        window.ytChannelErrors[ch] = e.message;
        // Se è un errore globale, lo rilanciamo per fermare il loop
        if (e.message.includes('YouTube API Error') || e.message.includes('quota') || e.message.includes('key')) {
          throw e;
        }
      }
    }

    if (!allVideos.length) {
      if (errors.length > 0) {
        status.textContent = '❌ Errore API riscontrato:\n' + errors.slice(0, 2).join('\n');
      } else {
        status.textContent = '⚠ Nessun video trovato negli ' + periodLabel + '. Verifica gli handle.';
      }
      btn.disabled = false;
      return;
    }

    const byChannel = {};
    allVideos.forEach(v => { byChannel[v.channel] = (byChannel[v.channel] || 0) + 1; });
    const channelCounts = Object.values(byChannel);
    const avgPerChannel = channelCounts.reduce((s,c) => s+c, 0) / channelCounts.length;
    const maxPerChannel = Math.max(Math.ceil(avgPerChannel * 2), 3);
    const balancedVideos = [];
    const channelUsed = {};
    const sortedByViews = [...allVideos].sort((a,b) => b.views - a.views);
    sortedByViews.forEach(v => {
      channelUsed[v.channel] = (channelUsed[v.channel] || 0);
      if (channelUsed[v.channel] < maxPerChannel) {
        balancedVideos.push(v);
        channelUsed[v.channel]++;
      }
    });

    window.lastFetchedYtVideos = balancedVideos;
    window.lastFetchedYtChannels = channels;
    window.lastFetchedYtPeriodLabel = periodLabel;
    window.lastFetchedYtPeriodDays = periodDays;
    window.lastFetchedYtChannelsRaw = channelRaw;

    document.getElementById('kpiTotalVideos').textContent = balancedVideos.length;
    const counts = {};
    balancedVideos.forEach(v => { counts[v.channel] = (counts[v.channel] || 0) + 1; });
    let mostActive = '—', maxC = 0;
    Object.entries(counts).forEach(([ch, c]) => { if (c > maxC) { maxC = c; mostActive = ch; } });
    document.getElementById('kpiMostActive').textContent = mostActive;
    const avgEngVal = balancedVideos.reduce((sum, v) => sum + v.engScore, 0) / balancedVideos.length;
    document.getElementById('kpiAvgEng').textContent = avgEngVal.toFixed(1) + '%';

    const channelKpis = {};
    channels.forEach(ch => { channelKpis[ch] = { count: 0, totalViews: 0, totalEng: 0 }; });
    balancedVideos.forEach(v => {
      if (channelKpis[v.channel]) {
        channelKpis[v.channel].count++;
        channelKpis[v.channel].totalViews += v.views;
        channelKpis[v.channel].totalEng += v.engScore;
      }
    });
    
    const sortedChs = Object.entries(channelKpis).sort((a, b) => b[1].count - a[1].count);
    let tableHtml = '';
    sortedChs.forEach(([ch, stat]) => {
      const avgViews = stat.count > 0 ? Math.round(stat.totalViews / stat.count) : 0;
      const avgEng = stat.count > 0 ? (stat.totalEng / stat.count).toFixed(1) : '0.0';
      const engColor = parseFloat(avgEng) >= 5 ? '#2ec4b6' : parseFloat(avgEng) >= 2 ? '#ff9f1c' : 'var(--ink-mute)';
      const fmtViews = avgViews >= 1000 ? (avgViews / 1000).toFixed(1) + 'k' : avgViews;
      
      const subs = window.ytChannelSubs?.[ch] || 0;
      const fmtSubs = subs >= 1000000 ? (subs/1000000).toFixed(1) + 'M' : (subs >= 1000 ? (subs/1000).toFixed(1) + 'k' : subs);
      
      const videosPerWeek = periodDays > 0 ? (stat.count / (periodDays / 7)) : 0;
      const fmtRate = videosPerWeek.toFixed(1);
      const cellCountText = stat.count > 0 ? `${stat.count} <span style="color:var(--ink-mute);font-size:10px;font-weight:400;">(${fmtRate}/sett.)</span>` : '0';
      
      const hasError = window.ytChannelErrors?.[ch];
      const errorIndicator = hasError ? ` <span title="${hasError.replace(/"/g, '&quot;')}" style="color:#ef4444;cursor:help;font-weight:bold;">⚠️</span>` : '';
      
      tableHtml += `<tr style="border-bottom:1px solid var(--line);color:var(--ink-mid);">
          <td style="padding:8px 6px;text-align:left;font-weight:600;font-family:var(--font-mono);font-size:10px;">${ch}${errorIndicator}</td>
          <td style="padding:8px 6px;text-align:right;font-family:var(--font-mono);color:var(--ink-soft);">${hasError ? '—' : (fmtSubs || '—')}</td>
          <td style="padding:8px 6px;text-align:center;font-weight:600;font-family:var(--font-mono);">${hasError ? '<span style="color:#ef4444;font-size:10px;">Errore API</span>' : cellCountText}</td>
          <td style="padding:8px 6px;text-align:right;font-family:var(--font-mono);font-weight:600;color:var(--accent);">${fmtViews}</td>
          <td style="padding:8px 6px;text-align:right;font-family:var(--font-mono);font-weight:700;color:${engColor};">${avgEng}%</td>
        </tr>`;
    });
    document.querySelector('#ytChannelKpiTable tbody').innerHTML = tableHtml;

    renderYtRawTable(balancedVideos);
    document.getElementById('ytCompConfig').style.display = 'none';
    document.getElementById('ytCompOutput').style.display = 'block';
    document.getElementById('ytCompOutTitle').textContent = balancedVideos.length + ' video analizzati · ' + periodLabel;
    
    document.getElementById('ytIdeas').innerHTML = `
      <div class="idea-card loading" style="border-style:dashed;background:transparent;flex-direction:column;gap:12px;padding:24px;text-align:center;min-height:120px;justify-content:center;">
        <span class="material-symbols-rounded" style="font-size:32px;color:var(--accent);">lightbulb</span>
        <div>
          <strong style="display:block;margin-bottom:4px;color:var(--ink);">Competitor analizzati!</strong>
          <span style="font-size:12px;color:var(--ink-mute);">Ora clicca sulla scheda <strong>"2. Generatore Idee"</strong> in alto per creare idee con l'IA.</span>
        </div>
      </div>
    `;
    document.getElementById('ytIdeasConfig').style.display = 'block';
    document.getElementById('ytIdeasOutput').style.display = 'none';

    status.textContent = '';
  } catch(e) { status.textContent = '❌ ' + e.message; }
  btn.disabled = false;
}

async function runYtIdeaGeneration() {
  const videos = window.lastFetchedYtVideos;
  const channels = window.lastFetchedYtChannels;
  const periodLabel = window.lastFetchedYtPeriodLabel;
  const periodDays = window.lastFetchedYtPeriodDays;
  const channelsRaw = window.lastFetchedYtChannelsRaw;

  if (!videos || !videos.length) {
    alert('Nessun video competitor caricato. Torna alla scheda "1. Video Competitor" ed esegui prima l\'analisi.');
    return;
  }

  const topic = document.getElementById('ytTopic')?.value.trim() || '';
  const ideaCount = parseInt(document.getElementById('ytIdeaCount')?.value) || 6;
  const status = document.getElementById('ytIntelGenStatus');
  const genBtn = document.getElementById('ytIntelGenBtn');

  if (genBtn) {
    genBtn.disabled = true;
    genBtn.innerHTML = '<span class="material-symbols-rounded" style="animation:spin 1s linear infinite;font-size:14px;margin-right:4px;">progress_activity</span>Generazione idee…';
  }
  if (status) status.textContent = 'Claude sta elaborando le idee…';

  try {
    const prompt = buildYtPrompt(videos, channels, 'VIDEO', ideaCount, topic, periodLabel);
    const ideas = await callClaudeForIdeas(prompt, 'ytIdeas', 'yt');

    const label = channels.slice(0,2).join(', ') + (channels.length>2?' +altri':'') + ' · ' + periodLabel;
    const sessionId = intelHistoryAdd('yt', label, ideas, { channels: channelsRaw, formatFilter: 'VIDEO', ideaCount, topic, periodDays });
    
    renderIdeas(ideas, 'ytIdeas', 'yt', sessionId, {});
    intelRenderHistoryBar('yt', sessionId);
    
    document.getElementById('ytIdeasConfig').style.display = 'none';
    document.getElementById('ytIdeasOutput').style.display = 'block';
    document.getElementById('ytIdeasOutTitle').textContent = videos.length + ' video · ' + periodLabel + (topic ? ' · "' + topic + '"' : '') + ' · ' + ideaCount + ' idee generate';
    if (status) status.textContent = '';
  } catch(e) {
    alert('Errore durante la generazione delle idee: ' + e.message);
    if (status) status.textContent = '❌ Errore';
  } finally {
    if (genBtn) {
      genBtn.disabled = false;
      genBtn.innerHTML = '<span class="material-symbols-rounded" style="font-size:14px;">lightbulb</span>2. Genera idee con l\'IA';
    }
  }
}

function renderYtRawTable(videos) {
  const box = document.getElementById('ytRawData');
  const fmt = n => n >= 1000 ? (n/1000).toFixed(1)+'k' : String(n);
  
  // Ordino per engagement score
  const sorted = [...videos].sort((a,b) => b.engScore - a.engScore);
  
  let h = '';
  sorted.forEach(v => {
    const watchUrl = 'https://youtube.com/watch?v=' + v.videoId;
    const channelUrl = 'https://youtube.com/' + v.channel;
    const engColor = v.engScore >= 5 ? '#2ec4b6' : v.engScore >= 2 ? '#ff9f1c' : 'var(--ink-mute)';
    const descText = v.description ? v.description.slice(0, 100) + (v.description.length > 100 ? '…' : '') : '';
    
    h += `
      <div class="yt-card">
        <div class="yt-card-thumb">
          <a href="${watchUrl}" target="_blank" rel="noopener">
            <img src="${v.thumbnail || 'https://img.youtube.com/vi/' + v.videoId + '/mqdefault.jpg'}" alt="cover" loading="lazy">
          </a>
        </div>
        <div class="yt-card-content">
          <div>
            <div class="yt-card-channel">
              <a href="${channelUrl}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;font-weight:600;">${v.channel}</a>
            </div>
            <div class="yt-card-title" title="${v.title}">
              <a href="${watchUrl}" target="_blank" rel="noopener">${v.title}</a>
            </div>
            ${descText ? `<div style="font-size:10.5px;color:var(--ink-soft);margin-bottom:6px;line-height:1.35;">${descText}</div>` : ''}
          </div>
          <div class="yt-card-footer">
            <span style="font-size:9.5px;">${v.publishedAt}</span>
            <div class="yt-card-stats">
              <span>👁 ${fmt(v.views)}</span>
              <span>💬 ${fmt(v.comments)}</span>
            </div>
            <span class="yt-card-eng" style="color:${engColor};" title="Engagement: (like + commenti) / views">${v.engScore.toFixed(1)}%</span>
          </div>
        </div>
      </div>
    `;
  });
  
  box.innerHTML = h || '<div class="idea-card loading">Nessun video trovato.</div>';
}

function buildYtPrompt(videos, channels, formatFilter, ideaCount, topic, periodLabel) {
  // Passo tutti i video (non solo top 5) con titolo + descrizione per permettere
  // il clustering per topic. Limito a 15 per non superare i token.
  const rows = videos.slice(0,15).map(v => {
    const eng = v.engScore ? ' [eng:' + v.engScore.toFixed(1) + '%]' : '';
    const comments = v.comments ? ' 💬' + (v.comments >= 1000 ? (v.comments/1000).toFixed(1)+'k' : v.comments) : '';
    let row = '"' + v.title.slice(0,70) + '" (' + v.channel + ', ' + v.views + ' views' + comments + eng + ', ' + v.publishedAt + ')';
    if (v.description) row += ' — ' + v.description.slice(0,120);
    if (v.tags) row += ' [tag: ' + v.tags + ']';
    return row;
  }).join('\n');

  const fmtHint = 'Genera SOLO VIDEO standard/lunghi (10-20 minuti) con analisi approfondite e dati. Non considerare o generare Shorts.';
  const topicCtx = topic ? 'TOPIC RICHIESTO: ' + topic + '. Concentrati su questo argomento.' : '';
  const periodCtx = periodLabel ? 'Analisi degli ' + periodLabel + '.' : '';

  return `Sei un analista di contenuti YouTube specializzato in fantacalcio italiano. Il tuo compito è identificare i TOPIC IN TENDENZA tra i canali competitor e trasformarli in idee originali per @esperti_profeta_fantacalcio.

ISTRUZIONI:
1. Leggi tutti i video elencati (titoli, descrizioni, tag, views, commenti, eng%)
2. Identifica i TOPIC IN TENDENZA: se 2+ canali parlano dello stesso argomento È una tendenza. Dai priorità ai video con alto engagement% (ha generato discussione) oltre che alle views.
3. Genera ${ideaCount} idee YouTube ORIGINALI per @esperti_profeta_fantacalcio ispirate a queste tendenze, con angolo unico legato al cast di esperti
4. Nel campo "angle" indica esplicitamente: quale topic è in tendenza, quanti canali ne parlano, e come lo differenzia il cast

PROFILO: analisi fantacalcio Serie A, cast 25-30 esperti (uno per club), tono tecnico. Pubblico: fantaallenatori che vogliono vantaggio informativo insider.
${topicCtx}
${periodCtx}

VIDEO COMPETITOR DA ANALIZZARE (${channels.join(', ')}):
${rows}

${fmtHint}

Rispondi SOLO con JSON array puro, zero markdown, sii sintetico e incisivo nei testi per velocizzare la generazione:
[{"num":1,"format":"VIDEO","title":"titolo SEO specifico max 70 char","angle":"topic identificato come tendenza + come lo differenzia il cast di esperti","body":"struttura concisa: hook, 2-3 sezioni brevi, top 3 consigli rapidi","slot":"Martedi 18:00","tags":["fantacalcio","seriea","asta"]}]
Genera esattamente ${ideaCount} oggetti.`;
}

// ── Instagram Intelligence ──
async function runIgIntelligence() {
  const profiles = document.getElementById('igProfiles').value.trim();
  const focus = document.getElementById('igFocus').value.trim() || 'fantacalcio Serie A';
  const formatFilter = document.getElementById('igFormatFilter')?.value || 'ALL';
  const ideaCount = parseInt(document.getElementById('igIdeaCount')?.value) || 6;
  const btn = document.getElementById('igIntelRunBtn');
  const status = document.getElementById('igIntelStatus');
  btn.disabled = true;
  status.textContent = 'Generazione idee…';
  try {
    const prompt = buildIgPrompt(profiles, focus, formatFilter, ideaCount);
    const ideas = await callClaudeForIdeas(prompt, 'igIdeas', 'ig');
    const label = focus.slice(0,20) + (focus.length>20?'…':'');
    const sessionId = intelHistoryAdd('ig', label, ideas, { profiles, focus, formatFilter, ideaCount });
    renderIdeas(ideas, 'igIdeas', 'ig', sessionId, {});
    document.getElementById('igIntelConfig').style.display = 'none';
    document.getElementById('igIntelOutput').style.display = 'block';
    document.getElementById('igIntelOutTitle').textContent = ideaCount + ' idee · ' + formatFilter + ' · ' + focus.slice(0,30);
    intelRenderHistoryBar('ig', sessionId);
    status.textContent = '';
  } catch(e) { status.textContent = '❌ ' + e.message; }
  btn.disabled = false;
}

function buildIgPrompt(profiles, focus, formatFilter, ideaCount) {
  const p = profiles || '@fantamantra_, @fantaverso_official, @fantacalciotattico, @euroleghefc, @fantacalcioaddicted, @laboratoriocalcistico, @fantagoal_fantacalcio, @ilcalcioverticale, @fantarete, @nic.cariglia_';

  const fmtHint = formatFilter === 'CAROUSEL_ALBUM'
    ? `Genera SOLO caroselli (CAROUSEL_ALBUM).
COSA SONO: contenuto prodotto internamente dal team con grafiche e dati. L'esperto NON compare.
STRUTTURA TIPO: slide 1 = titolo con il dato/hook principale | slide 2-7 = un elemento per slide (giocatore, squadra, statistica) con il numero chiave in evidenza | slide finale = CTA "salva e condividi".
ANGOLO IDEALE: statistiche di giocatori Serie A che stanno emergendo al Mondiale → cosa significano per il fanta della prossima stagione. Oppure: classifiche modificatori/bonus della stagione passata per club.`
    : formatFilter === 'REELS'
    ? `Genera SOLO reel (REELS).
COSA SONO: brief operativi da dare all'esperto del cast. Il "body" deve essere scritto come istruzione per l'esperto, non come descrizione del video finito.
STRUTTURA BRIEF: indica quale esperto coinvolgere (es. "esperto Juventus"), l'hook di apertura che deve dire nei primi 3 secondi, il consiglio/rivelazione insider che deve dare (specifico, non generico), e come chiudere con CTA.
TONO: personale e diretto, l'esperto parla in prima persona dalla sua esperienza di chi segue quella squadra ogni giorno.`
    : formatFilter === 'IMAGE'
    ? `Genera SOLO post immagine singola (IMAGE).
COSA SONO: grafiche prodotte internamente con TOP-LIST e statistiche. L'esperto NON compare.
STRUTTURA: titolo forte con numero + lista ordinata con dati specifici per ogni elemento. Questo è il format con più reach (8-15x la media del profilo).`
    : `Mix bilanciato tra i tre format:
- Immagini (IMAGE): TOP-LIST grafiche con statistiche → massima reach
- Caroselli (CAROUSEL_ALBUM): dati slide per slide → engagement e salvataggi → prodotti internamente
- Reel (REELS): brief per l'esperto del cast → acquisizione nuovi follower`;

  const seasonCtx = (focus.toLowerCase().includes('mondial') || focus.toLowerCase().includes('world'))
    ? `STAGIONALITÀ: Mondiale 2026 in corso (giugno-luglio 2026).
ANGOLO OBBLIGATORIO: collegare sempre il Mondiale al fantacalcio Serie A della prossima stagione.
Per post/caroselli: statistiche dei giocatori Serie A al Mondiale (gol, assist, minuti, rendimento) → "ecco chi sale di valore per l'asta di agosto".
Per reel: l'esperto del club commenta le prestazioni mondiali dei giocatori della sua squadra → "il nostro esperto Napoli su Kvaratskhelia al Mondiale".
MAI analisi tattica pura o risultati calcistici senza il filtro fanta.`
    : `STAGIONALITÀ: Pre-stagione Serie A (luglio-agosto 2026).
Per post/caroselli: statistiche amichevoli, probabili formazioni, rendimenti fanta attesi per club.
Per reel: l'esperto del club dà i suoi 3 consigli di acquisto per l'asta, svela un nome poco noto, commenta le mosse di mercato in chiave fanta.`;

  return `Sei un content strategist specializzato in fantacalcio italiano. Genera ${ideaCount} idee Instagram SPECIFICHE e PRONTE DA USARE per @esperti_profeta_fantacalcio.

PROFILO:
- Community fantacalcio Serie A, ~2.200 follower, tono tecnico e analitico
- Pubblico: fantaallenatori che cercano vantaggio informativo reale (nomi poco noti, cambi tattici, insider da chi segue la squadra ogni giorno)
- Cast di 25-30 esperti (uno per ogni club Serie A) disponibili a fare reel su brief

DUE TIPI DI CONTENUTO — rispetta sempre questa distinzione:
1. POST e CAROSELLI = prodotti internamente dal team. Grafiche con dati, statistiche, classifiche numeriche. L'esperto NON compare. Il team raccoglie i dati e costruisce la grafica.
2. REEL = brief da dare all'esperto del cast. Il campo "body" deve essere scritto come istruzione operativa per l'esperto ("Chiedi all'esperto [squadra] di aprire con questa domanda, poi di dare questo consiglio specifico..."), non come descrizione del video finito.

COSA FUNZIONA (dati reali del profilo):
- TOP-LIST numeriche (TOP 10 MARCATORI, TOP 10 MODIFICATORI) → 8-15x la reach media
- Titoli con numeri specifici battono sempre quelli generici
- Reel con hook forte nel primo secondo (rivelazione o domanda provocatoria)
- Collab con altri profili → +20-30% reach

NON FARE: meme, contenuti comici, clickbait vuoto, analisi generica senza dati, titoli placeholder.

${seasonCtx}

COMPETITOR di riferimento: ${p}. Focus richiesto: ${focus}.
${fmtHint}

Rispondi SOLO con JSON array puro, zero testo prima o dopo, zero markdown, sii sintetico e conciso nei testi delle idee per velocizzare la generazione:
[{"num":1,"format":"IMAGE","title":"titolo con dato specifico e numero, max 80 char, PRONTO DA USARE","angle":"l'insight specifico che rende questo contenuto unico rispetto ai competitor","body":"POST/CAROSELLO: descrivi slide per slide in modo super sintetico. REEL: brief brevissimo per l'esperto (hook, consiglio rapido, chiusura)","slot":"Martedi 10:30","tags":["fantacalcio","seriea","fanta"]}]
Genera esattamente ${ideaCount} oggetti.`;
}

// ── Core: chiama Claude via proxy Vercel ──
function repairTruncatedJson(str) {
  str = str.trim();
  // Rimuove virgole o due punti pendenti alla fine prima di riparare
  str = str.replace(/,\s*$/, '');
  str = str.replace(/:\s*$/, '');

  let inQuote = false;
  let escaped = false;
  let cleanStr = "";

  for (let i = 0; i < str.length; i++) {
    let char = str[i];
    if (char === '\\' && !escaped) {
      escaped = true;
    } else {
      if (char === '"' && !escaped) {
        inQuote = !inQuote;
      }
      escaped = false;
    }
    cleanStr += char;
  }

  if (inQuote) {
    cleanStr += '"';
  }

  // Rimuove virgole inserite prima di graffe o quadre chiuse
  cleanStr = cleanStr.replace(/,\s*([}\]])/g, '$1');

  let stack = [];
  inQuote = false;
  escaped = false;

  for (let i = 0; i < cleanStr.length; i++) {
    let char = cleanStr[i];
    if (char === '\\' && !escaped) {
      escaped = true;
    } else {
      if (char === '"' && !escaped) {
        inQuote = !inQuote;
      }
      escaped = false;
    }

    if (!inQuote) {
      if (char === '{' || char === '[') {
        stack.push(char === '{' ? '}' : ']');
      } else if (char === '}' || char === ']') {
        if (stack.length && stack[stack.length - 1] === char) {
          stack.pop();
        }
      }
    }
  }

  while (stack.length) {
    cleanStr += stack.pop();
  }

  cleanStr = cleanStr.replace(/,\s*([}\]])/g, '$1');
  return cleanStr;
}

async function callClaudeForIdeas(prompt, targetId, platform) {
  const box = document.getElementById(targetId);
  box.innerHTML = '<div class="idea-card loading"><span class="material-symbols-rounded" style="animation:spin 1s linear infinite;font-size:20px;margin-right:8px;">progress_activity</span>Claude sta generando le idee…</div>';
  const secret = intelGetSecret(platform);
  if (!secret) {
    box.innerHTML = '<div class="idea-card loading" style="color:var(--neg);">⚠ Inserisci la password di pubblicazione nel campo qui sopra.</div>';
    throw new Error('Password mancante');
  }
  
  let selectedModel = 'claude-sonnet-5';
  try { selectedModel = localStorage.getItem('intel_model') || 'claude-sonnet-5'; } catch(e) {}
  
  const res = await fetch(BACKEND_BASE + '/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Publish-Secret': secret },
    body: JSON.stringify({ model: selectedModel, max_tokens: 4000, messages: [{ role: 'user', content: prompt }] })
  });
  const data = await res.json();
  if (data.error) {
    const msg = typeof data.error === 'string' ? data.error : (data.error.message || JSON.stringify(data.error));
    throw new Error(msg);
  }
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  const clean = text.replace(/```json|```/g, '').trim();
  let ideas;
  try {
    ideas = JSON.parse(clean);
  } catch(e) {
    const m = clean.match(/\[[\s\S]*\]/);
    if (m) {
      try {
        ideas = JSON.parse(m[0]);
      } catch(inner) {
        try {
          const repaired = repairTruncatedJson(m[0]);
          ideas = JSON.parse(repaired);
        } catch(repErr) {
          throw new Error('Risposta AI incompleta o non valida. Riprova.');
        }
      }
    } else {
      try {
        const repaired = repairTruncatedJson(clean);
        ideas = JSON.parse(repaired);
      } catch(repErr) {
        throw new Error('Risposta AI non parsabile. Riprova.');
      }
    }
  }
  return Array.isArray(ideas) ? ideas : [];
}

// ── Render idee con valutazione e pianifica ──
function renderIdeas(ideas, targetId, platform, sessionId, votes) {
  const box = document.getElementById(targetId);
  if (!Array.isArray(ideas) || !ideas.length) {
    box.innerHTML = '<div class="idea-card loading">Nessuna idea generata. Riprova.</div>';
    return;
  }
  const fmtLabel = { 'CAROUSEL_ALBUM':'Carosello', 'IMAGE':'Foto', 'REELS':'Reel', 'VIDEO':'Video', 'SHORT':'Short', 'LIVE':'Live', 'ASTA_LIVE':'Asta Live' };
  const fmtClass = { 'CAROUSEL_ALBUM':'ig-post', 'IMAGE':'ig-post', 'REELS':'ig-reel', 'VIDEO':'yt-vid', 'SHORT':'yt-short', 'LIVE':'yt-live', 'ASTA_LIVE':'yt-asta-live' };
  box.innerHTML = ideas.map(idea => {
    const fmt = idea.format || (platform === 'yt' ? 'VIDEO' : 'CAROUSEL_ALBUM');
    const cls = fmtClass[fmt] || 'ig-post';
    const lbl = fmtLabel[fmt] || fmt;
    const tags = (idea.tags||[]).map(t => '<span class="idea-tag">' + (t.startsWith('#')?t:'#'+t) + '</span>').join('');
    const voteUp = votes[idea.num] === 'up' ? ' active' : '';
    const voteDown = votes[idea.num] === 'down' ? ' active' : '';
    const sid = sessionId || '';
    // Prepara dati per pianifica nel calendario
    const planType = fmt === 'REELS' ? 'REELS' : fmt === 'CAROUSEL_ALBUM' ? 'CAROUSEL_ALBUM' : fmt === 'VIDEO' ? 'VIDEO' : fmt === 'SHORT' ? 'SHORT' : fmt === 'LIVE' ? 'LIVE' : fmt === 'ASTA_LIVE' ? 'ASTA_LIVE' : 'IMAGE';
    const planTitle = (idea.title||'').replace(/'/g, "\\'").slice(0,80);
    const planSlot = (idea.slot||'').replace(/'/g,"'");
    return '<div class="idea-card" id="idea-' + sid + '-' + idea.num + '">' +
      '<div class="idea-header">' +
        '<span class="idea-num">' + String(idea.num||'').padStart(2,'0') + '</span>' +
        '<span class="idea-format ' + cls + '">' + lbl + '</span>' +
        (idea.slot ? '<span class="idea-slot">⏰ ' + idea.slot + '</span>' : '') +
      '</div>' +
      '<div class="idea-title">' + (idea.title||'—') + '</div>' +
      '<div class="idea-body">' + (idea.body||'') + '</div>' +
      (idea.angle ? '<div style="margin-top:8px;font-size:11px;color:var(--accent);font-family:var(--font-mono);">💡 ' + idea.angle + '</div>' : '') +
      (tags ? '<div class="idea-tags">' + tags + '</div>' : '') +
      '<div class="idea-footer">' +
        '<button class="idea-vote up' + voteUp + '" title="Utile" onclick="intelVote(\'' + sid + '\',' + idea.num + ',\'up\',this)">👍</button>' +
        '<button class="idea-vote down' + voteDown + '" title="Non utile" onclick="intelVote(\'' + sid + '\',' + idea.num + ',\'down\',this)">👎</button>' +
        '<button class="idea-plan-btn" onclick="calOpenModalFromIdea(\'' + planTitle + '\',\'' + planType + '\',\'' + planSlot + '\',\'' + platform + '\')">' +
          '<span class="material-symbols-rounded" style="font-size:14px;">calendar_month</span>Pianifica' +
        '</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

function intelVote(sessionId, ideaNum, vote, btn) {
  if (!sessionId) return;
  intelHistoryVote(sessionId, ideaNum, vote);
  // Aggiorno UI della card
  const card = document.getElementById('idea-' + sessionId + '-' + ideaNum);
  if (card) {
    card.querySelectorAll('.idea-vote').forEach(b => b.classList.remove('active'));
    const sessions = intelHistoryLoad();
    const s = sessions.find(x => x.id === sessionId);
    const currentVote = s?.votes?.[ideaNum];
    if (currentVote === 'up') card.querySelector('.idea-vote.up')?.classList.add('active');
    if (currentVote === 'down') card.querySelector('.idea-vote.down')?.classList.add('active');
  }
  // Aggiorno il pannello preferiti in cima
  renderFavorites();
}

function renderFavorites() {
  const countEl = document.getElementById('favCount');
  const igBox = document.getElementById('favListIg');
  const ytBox = document.getElementById('favListYt');
  const igCount = document.getElementById('favCountIg');
  const ytCount = document.getElementById('favCountYt');
  if (!igBox || !ytBox) return;

  const sessions = intelHistoryLoad();
  const igFavs = [], ytFavs = [];

  sessions.forEach(s => {
    Object.entries(s.votes || {}).forEach(([num, vote]) => {
      if (vote !== 'up') return;
      const idea = (s.ideas || []).find(i => String(i.num) === String(num));
      if (!idea) return;
      const entry = { ...idea, _sessionId: s.id, _platform: s.platform, _label: s.label, _ts: s.timestamp };
      if (s.platform === 'yt') ytFavs.push(entry);
      else igFavs.push(entry);
    });
  });

  igFavs.sort((a,b) => b._ts - a._ts);
  ytFavs.sort((a,b) => b._ts - a._ts);
  const total = igFavs.length + ytFavs.length;

  if (countEl) countEl.textContent = total ? total + ' idea' + (total > 1 ? 'e' : '') : '';
  if (igCount) igCount.textContent = igFavs.length ? igFavs.length + '' : '0';
  if (ytCount) ytCount.textContent = ytFavs.length ? ytFavs.length + '' : '0';

  const fmtLabel = { 'CAROUSEL_ALBUM':'Carosello','IMAGE':'Foto','REELS':'Reel','VIDEO':'Video','SHORT':'Short','LIVE':'Live','ASTA_LIVE':'Asta Live' };
  const fmtClass = { 'CAROUSEL_ALBUM':'ig-post','IMAGE':'ig-post','REELS':'ig-reel','VIDEO':'yt-vid','SHORT':'yt-short','LIVE':'yt-live','ASTA_LIVE':'yt-asta-live' };

  function buildFavCard(idea) {
    const fmt = idea.format || 'IMAGE';
    const cls = fmtClass[fmt] || 'ig-post';
    const lbl = fmtLabel[fmt] || fmt;
    const tags = (idea.tags||[]).map(t => '<span class="idea-tag">' + (t.startsWith('#')?t:'#'+t) + '</span>').join('');
    const d = new Date(idea._ts);
    const sessionInfo = (idea._label||'') + ' · ' + d.getDate() + '/' + (d.getMonth()+1);
    const planTitle = (idea.title||'').replace(/'/g,"\\'").slice(0,80);
    const planSlot = (idea.slot||'').replace(/'/g,"'");
    return '<div class="idea-card fav-card">' +
      '<div class="idea-header">' +
        '<span class="idea-format ' + cls + '">' + lbl + '</span>' +
        (idea.slot ? '<span class="idea-slot">⏰ ' + idea.slot + '</span>' : '') +
        '<span style="margin-left:auto;font-family:var(--font-mono);font-size:10px;color:var(--ink-mute);">' + sessionInfo + '</span>' +
      '</div>' +
      '<div class="idea-title">' + (idea.title||'—') + '</div>' +
      '<div class="idea-body">' + (idea.body||'') + '</div>' +
      (idea.angle ? '<div style="margin-top:8px;font-size:11px;color:var(--accent);font-family:var(--font-mono);">💡 ' + idea.angle + '</div>' : '') +
      (tags ? '<div class="idea-tags">' + tags + '</div>' : '') +
      '<div class="idea-footer">' +
        '<button class="idea-vote up active" title="Rimuovi dai preferiti" onclick="intelVote(\'' + idea._sessionId + '\',' + idea.num + ',\'up\',this)">👍 preferita</button>' +
        '<button class="idea-plan-btn" onclick="calOpenModalFromIdea(\'' + planTitle + '\',\'' + fmt + '\',\'' + planSlot + '\',\'' + idea._platform + '\')">' +
          '<span class="material-symbols-rounded" style="font-size:14px;">calendar_month</span>Pianifica' +
        '</button>' +
      '</div>' +
    '</div>';
  }

  igBox.innerHTML = igFavs.length
    ? igFavs.map(buildFavCard).join('')
    : '<div class="fav-empty">Nessuna idea Instagram salvata ancora — dai un 👍 alle idee IG che ti piacciono.</div>';

  ytBox.innerHTML = ytFavs.length
    ? ytFavs.map(buildFavCard).join('')
    : '<div class="fav-empty">Nessuna idea YouTube salvata ancora — dai un 👍 alle idee YT che ti piacciono.</div>';
}

// ── Pianifica idea nel calendario ──
function calOpenModalFromIdea(title, type, slot, platform) {
  // Determino data: prossimo giorno utile in base allo slot (es. "Martedi 10:30")
  const days = { 'luned':1,'marted':2,'mercoled':3,'gioved':4,'vened':5,'sabat':6,'domenic':0 };
  let targetDate = new Date();
  const slotLower = slot.toLowerCase();
  for (const [key, dow] of Object.entries(days)) {
    if (slotLower.includes(key)) {
      const today = targetDate.getDay();
      let diff = (dow - today + 7) % 7 || 7;
      targetDate.setDate(targetDate.getDate() + diff);
      break;
    }
  }
  // Estraggo ora
  const timeMatch = slot.match(/(\d{1,2})[:\.](\d{2})/);
  const time = timeMatch ? timeMatch[1].padStart(2,'0') + ':' + timeMatch[2] : '10:00';
  const dateStr = targetDate.toISOString().slice(0,10);
  // Apro il modal del calendario
  calOpenModal(dateStr, null);
  // Precompilo i campi
  setTimeout(() => {
    const titleEl = document.getElementById('calTitle');
    const timeEl = document.getElementById('calTime');
    const typeEl = document.getElementById('calType');
    const platEl = document.getElementById('calPlatform');
    if (titleEl) titleEl.value = title;
    if (timeEl) timeEl.value = time;
    // Imposto piattaforma
    const isYt = platform === 'yt' || type === 'VIDEO' || type === 'SHORT' || type === 'LIVE' || type === 'ASTA_LIVE';
    if (platEl) { platEl.value = isYt ? 'yt' : 'ig'; calOnPlatformChange(); }
    // Imposto tipo
    if (typeEl) typeEl.value = type;
    calUpdateSlotHint();
  }, 50);
}

// Ricarica la storia all'avvio della tab Intelligence
function intelInitHistoryBars() {
  renderFavorites();
  intelRenderHistoryBar('yt', null);
  intelRenderHistoryBar('ig', null);
}

function generateMockInstagramData() {
  const profile = {
    account_name: 'esperti_profeta_mock',
    username: 'esperti_profeta_mock',
    followers_count: 12450,
    media_count: 142,
    profile_picture_url: ''
  };

  const daily = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(now.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    daily.push({
      date: dateStr,
      reach: Math.floor(Math.random() * 2000) + 1500,
      views: Math.floor(Math.random() * 2000) + 1500,
      follower_count_1d: Math.floor(Math.random() * 30) - 5,
      accounts_engaged: 0,
      total_interactions: 0,
      follows_and_unfollows: 0,
      likes: 0, comments: 0, saves: 0, shares: 0
    });
  }

  const posts = [];
  const types = ['REELS', 'CAROUSEL_ALBUM', 'IMAGE'];
  const captions = [
    '🔥 CONSIGLI FANTACALCIO 11a GIORNATA! Chi schierare e chi evitare!',
    '⚽️ ANALISI UDINESE - LECCE: Scopriamo le gerarchie di Runjaic.',
    '🧠 I 5 SCOMMESSE da bonus per questa giornata di Serie A!',
    '📸 I top voti di giornata secondo i nostri esperti di squadra.',
    '🎥 Reels speciale scambi: ecco chi dare via subito!'
  ];

  for (let i = 0; i < 20; i++) {
    const d = new Date();
    d.setDate(now.getDate() - i * 1.5);
    const likes = Math.floor(Math.random() * 200) + 50;
    const comments = Math.floor(Math.random() * 20) + 5;
    const saved = Math.floor(Math.random() * 30) + 5;
    const shares = Math.floor(Math.random() * 15) + 2;
    const reach = likes * 15 + Math.floor(Math.random() * 500);
    posts.push({
      media_id: 'mock_' + (100000000000 + i),
      media_caption: captions[i % captions.length],
      media_type: types[i % types.length],
      media_permalink: 'https://instagram.com',
      timestamp: d.toISOString(),
      media_like_count: likes,
      media_comments_count: comments,
      media_reach: reach,
      media_engagement: likes + comments + saved + shares,
      media_saved: saved,
      media_shares: shares
    });
  }

  return { profile, daily, posts };
}

