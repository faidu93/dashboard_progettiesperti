// ============================================================================
// js/09-aste.js — Recap quote raccolte per asta (Google Sheet pubblico)
// Dipendenze: 01-api.js (BACKEND_BASE), 02-instagram-publish.js (getPublishSecret)
// ============================================================================

let asteCache = { summary: null, summaryTs: 0 };
// "Solo aste con mancanti": filtra il riepilogo alle sole righe con mancanti > 0.
let asteFilterMancanti = false;
// Evita di rifare tutte le chiamate (CSV Google Sheet + notifica Telegram) ogni
// volta che si riapre il tab Aste andando avanti e indietro — entro questa
// finestra il riepilogo già in memoria basta.
const ASTE_SUMMARY_TTL_MS = 45 * 1000;

// Barra di caricamento in cima alla tab Aste — finché non si vede la barra
// completarsi non è chiaro se i dati sono ancora in arrivo o già aggiornati.
// Progresso simulato (il fetch non espone percentuali reali) più uno "scatto"
// finale al 100% quando la risposta arriva davvero. Un contatore di richieste
// attive evita che si nasconda mentre un'altra fetch (summary + dettaglio,
// spesso in parallelo) è ancora in corso.
let asteProgressActive = 0;
let asteProgressInterval = null;
function asteProgressStart() {
  asteProgressActive++;
  const bar = document.getElementById('asteProgress');
  const fill = document.getElementById('asteProgressFill');
  if (!bar || !fill) return;
  bar.style.display = 'block';
  if (asteProgressInterval) return; // già in corso, non riparte da zero
  fill.style.width = '10%';
  let pct = 10;
  asteProgressInterval = setInterval(() => {
    pct += (85 - pct) * 0.15;
    fill.style.width = pct + '%';
  }, 200);
}
function asteProgressDone() {
  asteProgressActive = Math.max(0, asteProgressActive - 1);
  if (asteProgressActive > 0) return; // altre richieste ancora in volo
  const bar = document.getElementById('asteProgress');
  const fill = document.getElementById('asteProgressFill');
  clearInterval(asteProgressInterval);
  asteProgressInterval = null;
  if (!bar || !fill) return;
  fill.style.width = '100%';
  setTimeout(() => {
    bar.style.display = 'none';
    fill.style.width = '0%';
  }, 350);
}

// I tab del foglio si chiamano "9 Ago", "2 Set" — solo giorno e mese, senza anno.
// Per ricavare il giorno della settimana assumo la stagione in corso (anno corrente,
// o l'anno prossimo se il mese del tab è già passato rispetto a oggi — evita che le
// aste di inizio stagione risultino nel passato quando si è a cavallo di un anno nuovo).
const ASTE_MESI_IT = { gen: 0, feb: 1, mar: 2, apr: 3, mag: 4, giu: 5, lug: 6, ago: 7, set: 8, ott: 9, nov: 10, dic: 11 };
const ASTE_GIORNI_IT = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
function astaWeekday(name) {
  const m = /^(\d{1,2})\s+([A-Za-zàèìòù]+)/.exec((name || '').trim());
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = ASTE_MESI_IT[m[2].toLowerCase().slice(0, 3)];
  if (month === undefined || !day) return null;
  const now = new Date();
  let year = now.getFullYear();
  const candidate = new Date(year, month, day);
  if (candidate < new Date(now.getFullYear(), now.getMonth(), now.getDate() - 300)) year++;
  return ASTE_GIORNI_IT[new Date(year, month, day).getDay()];
}

// Richiamato dal pulsante "Iscritti" in alto (onSubscribersRefresh): rilegge il
// riepilogo. Silenzioso: se la password non è ancora salvata non fa nulla —
// niente prompt a sorpresa, niente da aggiornare comunque.
async function refreshAsteQuietly() {
  let secret = '';
  try { secret = sessionStorage.getItem('publish_secret') || localStorage.getItem('publish_secret') || ''; } catch (e) {}
  if (!secret) return;
  try {
    await loadAsteSummary(true);
  } catch (e) {
    console.warn('Aggiornamento aste fallito:', e.message);
  }
}

// Toggle "Solo aste con mancanti" — filtra senza rifare la chiamata di rete.
function onAsteFilterMancantiChange() {
  asteFilterMancanti = !!document.getElementById('asteFilterMancanti')?.checked;
  if (asteCache.summary) renderAsteSummary(asteCache.summary);
}

async function loadAsteSummary(force) {
  const box = document.getElementById('asteSummary');
  if (!box) return;

  const secret = await getPublishSecret();
  if (!secret) {
    box.innerHTML = '<div style="font-family:var(--font-mono);font-size:12px;color:var(--ink-mute);padding:16px 0;text-align:center;">Inserisci la password di pubblicazione per vedere il riepilogo.</div>';
    return;
  }

  if (!force && asteCache.summary && (Date.now() - asteCache.summaryTs) < ASTE_SUMMARY_TTL_MS) {
    renderAsteSummary(asteCache.summary);
    return;
  }

  box.innerHTML = '<div style="font-family:var(--font-mono);font-size:12px;color:var(--ink-mute);padding:16px 0;text-align:center;"><span class="material-symbols-rounded" style="font-size:14px;vertical-align:middle;animation:spin 1s linear infinite;">progress_activity</span> Caricamento riepilogo…</div>';

  asteProgressStart();
  try {
    const res = await fetchWithRetry(`${BACKEND_BASE}/api/aste?action=summary`, { headers: { 'X-Publish-Secret': secret } });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.error) {
      if (res.status === 401) clearPublishSecret();
      throw new Error(j.error || `HTTP ${res.status}`);
    }
    asteCache.summary = Array.isArray(j.aste) ? j.aste : [];
    asteCache.summaryTs = Date.now();
    renderAsteSummary(asteCache.summary);
  } catch (e) {
    box.innerHTML = `<div style="font-family:var(--font-mono);font-size:12px;color:var(--neg);padding:16px 0;text-align:center;">
      Impossibile caricare il riepilogo: ${e.message}
      <div style="margin-top:12px;"><button onclick="loadAsteSummary(true)" style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;background:var(--bg-elev-2);border:1px solid var(--line-strong);border-radius:6px;color:var(--ink);font-size:12px;font-family:var(--font-body);cursor:pointer;"><span class="material-symbols-rounded" style="font-size:15px;">refresh</span> Riprova</button></div>
    </div>`;
  } finally {
    asteProgressDone();
  }
}

// Flag manuale "va in diretta su YouTube" — non deducibile da nessun dato, lo
// spunti tu a mano. Salvato in locale, sopravvive al ricaricamento della pagina.
const ASTE_YT_LIVE_KEY = 'epf_aste_yt_live';
function getAsteYtLiveSet() {
  try { return new Set(JSON.parse(localStorage.getItem(ASTE_YT_LIVE_KEY) || '[]')); }
  catch (e) { return new Set(); }
}
function toggleAsteYtLive(gid, checked) {
  const s = getAsteYtLiveSet();
  if (checked) s.add(gid); else s.delete(gid);
  try { localStorage.setItem(ASTE_YT_LIVE_KEY, JSON.stringify([...s])); } catch (e) {}
}

function renderAsteSummary(rows) {
  const box = document.getElementById('asteSummary');
  if (!box) return;

  if (!rows || rows.length === 0) {
    box.innerHTML = '<div style="font-family:var(--font-mono);font-size:12px;color:var(--ink-mute);padding:16px 0;text-align:center;">Nessuna asta trovata.</div>';
    return;
  }

  const visibleRows = asteFilterMancanti ? rows.filter(r => !r.error && (r.mancanti || 0) > 0) : rows;
  if (visibleRows.length === 0) {
    box.innerHTML = '<div style="font-family:var(--font-mono);font-size:12px;color:var(--pos);padding:16px 0;text-align:center;"><span class="material-symbols-rounded" style="font-size:14px;vertical-align:middle;">check_circle</span> Nessuna asta con mancanti — tutte al completo.</div>';
    return;
  }

  const totMontepremi = visibleRows.reduce((s, r) => s + (r.montepremi || 0), 0);
  const totProgetto = visibleRows.reduce((s, r) => s + (r.progetto || 0), 0);
  const totMancanti = visibleRows.reduce((s, r) => s + (r.mancanti || 0), 0);
  const totEsperti = visibleRows.reduce((s, r) => s + (r.esperti || 0), 0);
  const ytLiveSet = getAsteYtLiveSet();

  const trs = visibleRows.map(r => {
    if (r.error) {
      return `<tr style="border-bottom:1px solid var(--line); opacity:0.6;">
        <td style="padding:8px 10px; color:var(--ink);">${r.name}</td>
        <td colspan="7" style="padding:8px 10px; color:var(--neg); font-family:var(--font-mono); font-size:11px;">Errore: ${r.error}</td>
      </tr>`;
    }
    const completa = r.mancanti === 0;
    const isLive = ytLiveSet.has(r.gid);
    const weekday = astaWeekday(r.name);
    const baseBg = completa ? 'rgba(34,197,94,0.08)' : 'transparent';
    return `<tr style="border-bottom:1px solid var(--line); background:${baseBg};">
      <td style="padding:8px 10px; color:var(--ink); font-weight:600;">${weekday ? `<span style="color:var(--ink-mute); font-weight:400;">${weekday}</span> ` : ''}${r.name}</td>
      <td style="padding:8px 10px; color:var(--ink-soft); font-family:var(--font-mono); font-size:11px;">${r.modalita || '—'}</td>
      <td style="padding:8px 10px; text-align:right; font-family:var(--font-mono);">${r.count}${r.maxPosti !== null ? ` / ${r.maxPosti}` : ''}</td>
      <td style="padding:8px 10px; text-align:right; font-family:var(--font-mono); color:var(--ink-soft);" title="Utenti che pagano solo la quota montepremi, senza sovrapprezzo">${r.esperti !== undefined ? r.esperti : '—'}</td>
      <td style="padding:8px 10px; text-align:right; font-family:var(--font-mono); font-weight:600; color:${completa ? 'var(--pos)' : 'var(--accent)'};">${r.mancanti !== null ? r.mancanti : '—'}</td>
      <td style="padding:8px 10px; text-align:right; font-family:var(--font-mono); color:var(--ink-soft);">€${r.montepremi}</td>
      <td style="padding:8px 10px; text-align:right; font-family:var(--font-mono); font-weight:600; color:var(--pos);">€${r.progetto}</td>
      <td style="padding:8px 10px; text-align:center;" onclick="event.stopPropagation()">
        <input type="checkbox" ${isLive ? 'checked' : ''} onchange="toggleAsteYtLive('${r.gid}', this.checked)" style="width:16px; height:16px; cursor:pointer; accent-color: var(--accent);">
      </td>
    </tr>`;
  }).join('');

  box.innerHTML = `
    <table style="width:100%; border-collapse:collapse; font-size:12.5px; text-align:left;">
      <thead>
        <tr style="border-bottom:1px solid var(--line); color:var(--ink-soft); font-family:var(--font-mono); font-size:10px; text-transform:uppercase;">
          <th style="padding:8px 10px; font-weight:600;">Data</th>
          <th style="padding:8px 10px; font-weight:600;">Tipo</th>
          <th style="padding:8px 10px; font-weight:600; text-align:right;">Partecipanti</th>
          <th style="padding:8px 10px; font-weight:600; text-align:right;" title="Utenti che pagano solo la quota montepremi, senza sovrapprezzo">Esperti</th>
          <th style="padding:8px 10px; font-weight:600; text-align:right;">Mancanti</th>
          <th style="padding:8px 10px; font-weight:600; text-align:right;" title="Va ridistribuito al vincitore dell'asta">Montepremi</th>
          <th style="padding:8px 10px; font-weight:600; text-align:right;" title="I 5€ extra dei soci normali — questo è il vero guadagno">Ricavo progetto</th>
          <th style="padding:8px 10px; font-weight:600; text-align:center;" title="Va in diretta sul canale YouTube — spunta manuale">📺 Live YT</th>
        </tr>
      </thead>
      <tbody>${trs}</tbody>
      <tfoot>
        <tr style="border-top:2px solid var(--line-strong); font-weight:700;">
          <td colspan="3" style="padding:10px; color:var(--ink);">Totale</td>
          <td style="padding:10px; text-align:right; font-family:var(--font-mono); color:var(--ink-soft);">${totEsperti}</td>
          <td style="padding:10px; text-align:right; font-family:var(--font-mono); color:var(--accent);">${totMancanti}</td>
          <td style="padding:10px; text-align:right; font-family:var(--font-mono); color:var(--ink-soft);">€${totMontepremi}</td>
          <td style="padding:10px; text-align:right; font-family:var(--font-mono); color:var(--pos);">€${totProgetto}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>
    <div style="font-family:var(--font-mono); font-size:10.5px; color:var(--ink-mute); margin-top:8px;">Ogni quota si divide in <strong>montepremi</strong> (fino a 20€, va al vincitore dell'asta) e <strong>ricavo progetto</strong> (l'eccedenza — 5€ per i soci normali, 0€ per gli esperti). "Mancanti" è il numero di posti/quote ancora da versare — non un importo, perché non sappiamo se saranno esperti o soci normali.</div>
  `;
}
