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
      ['chatSecret', 'chatSecretOverlay', 'ytSecret', 'igSecret', 'calSecret'].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.value) el.value = s;
      });
    }
  } catch(e) {}
  const ytKeyEl = document.getElementById('ytApiKey');
  if (ytKeyEl && !ytKeyEl.value) {
    try { ytKeyEl.value = atob('QUl6YVN5QlB0bzk0RkwxcTlfWUpoS1hWX042Z0Q1dmNITGZwMUVN'); } catch(e) {}
    intelSaveField('ytApiKey');
  }
  ytRenderChannelChips();
}

// ── YouTube Competitor Channel Manager ──
function ytGetChannels() {
  const txt = document.getElementById('ytChannels')?.value || '';
  return txt.split('\n').map(s => s.trim()).filter(Boolean);
}

function ytSetChannels(arr) {
  const unique = [...new Set(arr.map(s => s.trim().startsWith('@') ? s.trim() : '@' + s.trim()))].filter(Boolean);
  const textVal = unique.join('\n');
  const el = document.getElementById('ytChannels');
  if (el) {
    el.value = textVal;
    intelSaveField('ytChannels');
  }
  ytRenderChannelChips();
}

function ytRenderChannelChips() {
  const container = document.getElementById('ytChannelsChips');
  if (!container) return;
  const channels = ytGetChannels();
  if (!channels.length) {
    container.innerHTML = '<span style="font-family:var(--font-mono);font-size:11px;color:var(--ink-mute);">Nessun canale inserito. Aggiungine uno sotto o clicca sui preset rapidi.</span>';
    return;
  }
  container.innerHTML = channels.map(ch => `
    <span class="ch-chip" style="display:inline-flex;align-items:center;gap:6px;background:var(--bg);border:1px solid var(--line-strong);border-radius:14px;padding:3px 10px;font-family:var(--font-mono);font-size:11.5px;color:var(--ink);">
      <span style="color:var(--accent);">▶</span> ${ch}
      <button type="button" onclick="ytRemoveChannelChip('${ch.replace(/'/g, "\\'")}')" style="background:none;border:none;color:var(--ink-mute);cursor:pointer;font-size:13px;padding:0;margin-left:2px;line-height:1;" title="Rimuovi">&times;</button>
    </span>
  `).join('');
}

function ytAddChannelChip(handle) {
  const inputEl = document.getElementById('ytNewChannelInput');
  const val = (handle || (inputEl ? inputEl.value : '')).trim();
  if (!val) return;
  const current = ytGetChannels();
  const formatted = val.startsWith('@') ? val : '@' + val;
  if (!current.some(c => c.toLowerCase() === formatted.toLowerCase())) {
    current.push(formatted);
    ytSetChannels(current);
  }
  if (inputEl) inputEl.value = '';
}

function ytRemoveChannelChip(handle) {
  const current = ytGetChannels().filter(c => c.toLowerCase() !== handle.toLowerCase());
  ytSetChannels(current);
}

// ── Storia ricerche in localStorage ──
// Struttura: { id, platform, timestamp, label, ideas[], votes{} }
const INTEL_HISTORY_KEY = 'intel_search_history';
const INTEL_MAX_SESSIONS = 20;

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

function ytCompNewSearch() {
  document.getElementById('ytCompConfig').style.display = 'block';
  document.getElementById('ytCompOutput').style.display = 'none';
}

async function fetchYtApi(buildUrlFn) {
  const userKey = (document.getElementById('ytApiKey')?.value || '').trim() || localStorage.getItem('intel_yt_apikey') || '';
  const pool = userKey ? [userKey, ...YT_KEY_POOL] : YT_KEY_POOL;
  
  let attempts = 0;
  let lastError = null;
  while (attempts < pool.length) {
    const key = pool[ytKeyIdx % pool.length];
    const url = buildUrlFn(key);
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) {
        const msg = data.error.message || '';
        const code = data.error.code;
        if (code === 403 || msg.includes('quota') || msg.includes('key')) {
          ytKeyIdx++;
          attempts++;
          lastError = new Error(`YouTube API Error [${code}]: ${msg}`);
          continue;
        }
        throw new Error(`YouTube API Error [${code}]: ${msg}`);
      }
      return data;
    } catch(err) {
      if (err.message.includes('quota') || err.message.includes('403') || err.message.includes('key')) {
        ytKeyIdx++;
        attempts++;
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  throw lastError || new Error('Tutte le chiavi YouTube API hanno superato la quota. Inserisci una chiave personalizzata.');
}

async function runYtCompetitorAnalysis() {
  const channelRaw = document.getElementById('ytChannels').value.trim();
  const n = parseInt(document.getElementById('ytVideoCount').value) || 10;
  const periodDays = parseInt(document.getElementById('ytPeriod')?.value) || 30;
  const periodLabel = periodDays === 3 ? 'ultimi 3 giorni'
                    : periodDays === 7 ? 'ultima settimana'
                    : periodDays === 14 ? 'ultime 2 settimane'
                    : periodDays === 30 ? 'ultimi 30 giorni'
                    : 'ultimi 45 giorni';

  if (!channelRaw) { alert('Inserisci almeno un canale.'); return; }

  const channels = channelRaw.split('\n').map(s => s.trim()).filter(Boolean);
  const btn = document.getElementById('ytIntelRunBtn');
  const status = document.getElementById('ytIntelStatus');
  btn.disabled = true;

  const minDate = new Date();
  minDate.setDate(minDate.getDate() - periodDays);
  
  status.textContent = 'Recupero video…';

  try {
    const allVideos = [];
    const errors = [];
    
    window.ytChannelErrors = window.ytChannelErrors || {};
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

    for (const ch of channels) {
      try {
        delete window.ytChannelErrors[ch];
        let channelId = ch;
        let subscriberCount = 0;

        const handleClean = ch.trim().toLowerCase();
        const handleLower = handleClean.startsWith('@') ? handleClean : '@' + handleClean;

        if (KNOWN_YT_CHANNELS[handleLower]) {
          channelId = KNOWN_YT_CHANNELS[handleLower];
        } else if (ch.startsWith('@') || !ch.startsWith('UC')) {
          const handle = ch.startsWith('@') ? ch : '@' + ch;
          const handleName = handle.replace('@', '');
          
          try {
            const chData = await fetchYtApi(k => 'https://www.googleapis.com/youtube/v3/channels?part=statistics,contentDetails&forHandle=' + encodeURIComponent(handleName) + '&key=' + k);
            if (chData.items && chData.items.length > 0) {
              channelId = chData.items[0].id;
              subscriberCount = parseInt(chData.items[0].statistics?.subscriberCount || 0);
            }
          } catch(err) {
            console.warn('Errore forHandle per ' + ch + ':', err);
          }
          
          if (!channelId.startsWith('UC')) {
            try {
              const srData = await fetchYtApi(k => 'https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=' + encodeURIComponent(handle) + '&maxResults=1&key=' + k);
              if (srData.items && srData.items.length > 0) {
                channelId = srData.items[0].id?.channelId || ch;
              }
            } catch(err) {
              console.warn('Errore ricerca per ' + ch + ':', err);
            }
          }
        }

        if (!channelId.startsWith('UC')) {
          throw new Error(`Impossibile risolvere l'ID per "${ch}".`);
        }

        const uploadsPlaylistId = 'UU' + channelId.slice(2);

        // Fetch fino a 50 caricamenti recenti dal canale con rotazione chiavi
        const playlistData = await fetchYtApi(k => 'https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=' + uploadsPlaylistId + '&maxResults=50&key=' + k);
        
        const videoIds = (playlistData.items || [])
          .filter(item => {
            const pubDate = new Date(item.snippet?.publishedAt || '');
            return pubDate >= minDate;
          })
          .map(item => item.snippet?.resourceId?.videoId)
          .filter(Boolean);

        if (!videoIds.length) continue;

        // Fetch dettagli video in batch con rotazione chiavi (max 50 per chiamata)
        const statsData = await fetchYtApi(k => 'https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails,snippet,liveStreamingDetails&id=' + videoIds.slice(0, 50).join(',') + '&key=' + k);
        
        const channelVideos = [];
        (statsData.items||[]).forEach(v => {
          const durationSec = parseIsoDuration(v.contentDetails?.duration || '');
          const title = (v.snippet?.title || '').toLowerCase();
          const desc = (v.snippet?.description || '').toLowerCase();

          // Regola rigida di durata: include SOLO i video con durata tra 4 minuti (240s) e 55 minuti (3300s).
          // Qualsiasi video sotto i 4 min (< 240s) o sopra i 55 min (> 3300s) o diretta in corso viene escluso.
          const isCurrentlyLive = v.snippet?.liveBroadcastContent === 'live';
          if (isCurrentlyLive) return;

          const isShortTag = title.includes('#short') || desc.includes('#short') || (v.snippet?.tags || []).some(t => t.toLowerCase().includes('short'));
          if (isShortTag) return;

          const MIN_DURATION_SEC = 4 * 60;   // 240 secondi (4 min)
          const MAX_DURATION_SEC = 55 * 60;  // 3300 secondi (55 min)
          if (durationSec < MIN_DURATION_SEC || durationSec > MAX_DURATION_SEC) return;

          const vViews = parseInt(v.statistics?.viewCount||0);
          const vLikes = parseInt(v.statistics?.likeCount||0);
          const vComments = parseInt(v.statistics?.commentCount||0);
          const vEngScore = vViews > 0 ? ((vLikes + vComments) / vViews * 100) : 0;
          
          const durMin = Math.floor(durationSec / 60);
          const durSec = durationSec % 60;
          const durationFormatted = durMin + ' min' + (durSec > 0 ? ' ' + durSec + 's' : '');

          channelVideos.push({
            channel: ch, title: v.snippet?.title||'—', publishedAt: (v.snippet?.publishedAt||'').slice(0,10),
            views: vViews, likes: vLikes, comments: vComments, engScore: Math.round(vEngScore * 100) / 100,
            durationSec, durationFormatted,
            videoId: v.id, description: (v.snippet?.description||'').slice(0,300).replace(/\n/g,' '),
            tags: (v.snippet?.tags||[]).slice(0,8).join(', '), thumbnail: v.snippet?.thumbnails?.medium?.url || v.snippet?.thumbnails?.default?.url || ''
          });
        });

        // Limita i video del canale al numero max richiesto (n)
        const topChannelVideos = channelVideos.slice(0, n);
        allVideos.push(...topChannelVideos);
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
    
    const totalDurationSec = balancedVideos.reduce((sum, v) => sum + (v.durationSec || 0), 0);
    const avgDurationSec = balancedVideos.length > 0 ? Math.round(totalDurationSec / balancedVideos.length) : 0;
    const avgDurMin = Math.floor(avgDurationSec / 60);
    const avgDurSec = avgDurationSec % 60;
    const fmtOverallAvgDur = avgDurMin + ' min' + (avgDurSec > 0 ? ' ' + avgDurSec + 's' : '');
    const kpiDurEl = document.getElementById('kpiAvgDuration');
    if (kpiDurEl) kpiDurEl.textContent = fmtOverallAvgDur;

    const counts = {};
    balancedVideos.forEach(v => { counts[v.channel] = (counts[v.channel] || 0) + 1; });
    let mostActive = '—', maxC = 0;
    Object.entries(counts).forEach(([ch, c]) => { if (c > maxC) { maxC = c; mostActive = ch; } });
    document.getElementById('kpiMostActive').textContent = mostActive;
    const avgEngVal = balancedVideos.reduce((sum, v) => sum + v.engScore, 0) / balancedVideos.length;
    document.getElementById('kpiAvgEng').textContent = avgEngVal.toFixed(1) + '%';

    const channelKpis = {};
    channels.forEach(ch => { channelKpis[ch] = { count: 0, totalViews: 0, totalEng: 0, totalDurationSec: 0 }; });
    balancedVideos.forEach(v => {
      if (channelKpis[v.channel]) {
        channelKpis[v.channel].count++;
        channelKpis[v.channel].totalViews += v.views;
        channelKpis[v.channel].totalEng += v.engScore;
        channelKpis[v.channel].totalDurationSec += (v.durationSec || 0);
      }
    });
    
    const sortedChs = Object.entries(channelKpis).sort((a, b) => b[1].count - a[1].count);
    let tableHtml = '';
    sortedChs.forEach(([ch, stat]) => {
      const avgViews = stat.count > 0 ? Math.round(stat.totalViews / stat.count) : 0;
      const avgEng = stat.count > 0 ? (stat.totalEng / stat.count).toFixed(1) : '0.0';
      const engColor = parseFloat(avgEng) >= 5 ? '#2ec4b6' : parseFloat(avgEng) >= 2 ? '#ff9f1c' : 'var(--ink-mute)';
      const fmtViews = avgViews >= 1000 ? (avgViews / 1000).toFixed(1) + 'k' : avgViews;
      
      const chAvgDurSec = stat.count > 0 ? Math.round(stat.totalDurationSec / stat.count) : 0;
      const chAvgDurMin = Math.floor(chAvgDurSec / 60);
      const fmtChAvgDur = stat.count > 0 ? `${chAvgDurMin} min` : '—';

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
          <td style="padding:8px 6px;text-align:right;font-family:var(--font-mono);color:var(--accent);font-weight:600;">${fmtChAvgDur}</td>
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
          <div class="yt-card-footer" style="color:#e2e8f0;">
            <span style="font-size:10px;color:#cbd5e1;font-weight:500;">${v.publishedAt}</span>
            <div class="yt-card-stats" style="color:#f8fafc;font-weight:600;">
              <span style="color:#f8fafc;">⏱️ ${v.durationFormatted || '—'}</span>
              <span style="color:#f8fafc;">👁 ${fmt(v.views)}</span>
              <span style="color:#f8fafc;">💬 ${fmt(v.comments)}</span>
            </div>
            <span class="yt-card-eng" style="color:${engColor};font-weight:700;" title="Engagement: (like + commenti) / views">${v.engScore.toFixed(1)}%</span>
          </div>
        </div>
      </div>
    `;
  });
  
  box.innerHTML = h || '<div class="idea-card loading">Nessun video trovato.</div>';
}

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
  const box = targetId ? document.getElementById(targetId) : null;
  if (box) {
    box.innerHTML = '<div class="idea-card loading"><span class="material-symbols-rounded" style="animation:spin 1s linear infinite;font-size:20px;margin-right:8px;">progress_activity</span>Claude sta generando il contenuto…</div>';
  }
  let secret = intelGetSecret(platform);
  if (!secret) {
    secret = window.prompt('Inserisci la password di pubblicazione (PUBLISH_SECRET) per attivare la generazione AI:');
    if (secret) {
      try {
        localStorage.setItem('publish_secret', secret);
        sessionStorage.setItem('publish_secret', secret);
      } catch(e) {}
    }
  }
  if (!secret) {
    if (box) box.innerHTML = '<div class="idea-card loading" style="color:var(--neg);">⚠ Password di pubblicazione mancante.</div>';
    throw new Error('Password di pubblicazione (PUBLISH_SECRET) mancante.');
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

  if (!targetId) {
    return clean;
  }

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
          return clean;
        }
      }
    } else {
      return clean;
    }
  }
  return Array.isArray(ideas) ? ideas : clean;
}

// ── Render idee con valutazione e pianifica ──
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

