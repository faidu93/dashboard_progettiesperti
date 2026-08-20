// ============================================================================
// js/09-aste.js — Recap quote raccolte per asta (Google Sheet pubblico)
// Dipendenze: 01-api.js (BACKEND_BASE), 02-instagram-publish.js (getPublishSecret)
// ============================================================================

let asteCache = { tabs: [], selectedGid: null, summary: null };

// Richiamato dal pulsante "Iscritti" in alto (onSubscribersRefresh): rilegge il
// riepilogo e, se sei già sulla tab Aste con un'asta aperta, anche il suo dettaglio.
// Silenzioso: se la password non è ancora salvata o la tab Aste non è mai stata
// aperta non fa nulla — niente prompt a sorpresa, niente da aggiornare comunque.
async function refreshAsteQuietly() {
  let secret = '';
  try { secret = sessionStorage.getItem('publish_secret') || localStorage.getItem('publish_secret') || ''; } catch (e) {}
  if (!secret || asteCache.tabs.length === 0) return;
  try {
    await loadAsteSummary();
    if (asteCache.selectedGid) await loadAsteData(asteCache.selectedGid);
  } catch (e) {
    console.warn('Aggiornamento aste fallito:', e.message);
  }
}

async function loadAsteTabs() {
  const sel = document.getElementById('asteSelect');
  const content = document.getElementById('asteContent');
  if (!sel || !content) return;

  loadAsteSummary();

  const secret = getPublishSecret();
  if (!secret) {
    sel.innerHTML = '<option value="">Password richiesta</option>';
    content.innerHTML = '<div style="font-family:var(--font-mono);font-size:12px;color:var(--ink-mute);padding:24px 0;text-align:center;">Inserisci la password di pubblicazione per vedere i dati delle aste.</div>';
    return;
  }

  if (asteCache.tabs.length === 0) {
    sel.innerHTML = '<option value="">Caricamento…</option>';
    try {
      const res = await fetch(`${BACKEND_BASE}/api/aste?action=list`, { headers: { 'X-Publish-Secret': secret } });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) {
        if (res.status === 401) clearPublishSecret();
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      asteCache.tabs = Array.isArray(j.aste) ? j.aste : [];
    } catch (e) {
      sel.innerHTML = '<option value="">Errore caricamento</option>';
      content.innerHTML = `<div style="font-family:var(--font-mono);font-size:12px;color:var(--neg);padding:24px 0;text-align:center;">Impossibile caricare l'elenco aste: ${e.message}</div>`;
      return;
    }
  }

  if (asteCache.tabs.length === 0) {
    sel.innerHTML = '<option value="">Nessuna asta trovata</option>';
    content.innerHTML = '<div style="font-family:var(--font-mono);font-size:12px;color:var(--ink-mute);padding:24px 0;text-align:center;">Nessuna asta trovata nel foglio.</div>';
    return;
  }

  sel.innerHTML = asteCache.tabs.map(t => `<option value="${t.gid}">${t.name}</option>`).join('');
  const gidToSelect = asteCache.selectedGid && asteCache.tabs.some(t => t.gid === asteCache.selectedGid)
    ? asteCache.selectedGid
    : asteCache.tabs[asteCache.tabs.length - 1].gid; // ultimo tab del foglio = asta più recente
  sel.value = gidToSelect;
  loadAsteData(gidToSelect);
}

// Selezionando una riga del riepilogo si salta al dettaglio di quell'asta qui sotto.
function selectAstaFromSummary(gid) {
  const sel = document.getElementById('asteSelect');
  if (!sel) return;
  sel.value = gid;
  onAsteSelectChange();
  document.getElementById('asteContent')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function loadAsteSummary() {
  const box = document.getElementById('asteSummary');
  if (!box) return;

  const secret = getPublishSecret();
  if (!secret) {
    box.innerHTML = '<div style="font-family:var(--font-mono);font-size:12px;color:var(--ink-mute);padding:16px 0;text-align:center;">Inserisci la password di pubblicazione per vedere il riepilogo.</div>';
    return;
  }

  box.innerHTML = '<div style="font-family:var(--font-mono);font-size:12px;color:var(--ink-mute);padding:16px 0;text-align:center;"><span class="material-symbols-rounded" style="font-size:14px;vertical-align:middle;animation:spin 1s linear infinite;">progress_activity</span> Caricamento riepilogo…</div>';

  try {
    const res = await fetch(`${BACKEND_BASE}/api/aste?action=summary`, { headers: { 'X-Publish-Secret': secret } });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.error) {
      if (res.status === 401) clearPublishSecret();
      throw new Error(j.error || `HTTP ${res.status}`);
    }
    asteCache.summary = Array.isArray(j.aste) ? j.aste : [];
    renderAsteSummary(asteCache.summary);
  } catch (e) {
    box.innerHTML = `<div style="font-family:var(--font-mono);font-size:12px;color:var(--neg);padding:16px 0;text-align:center;">Impossibile caricare il riepilogo: ${e.message}</div>`;
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

  const totIncassato = rows.reduce((s, r) => s + (r.totale || 0), 0);
  const totMancante = rows.reduce((s, r) => s + (r.stimaMancante || 0), 0);
  const ytLiveSet = getAsteYtLiveSet();

  const trs = rows.map(r => {
    if (r.error) {
      return `<tr style="border-bottom:1px solid var(--line); opacity:0.6;">
        <td style="padding:8px 10px; color:var(--ink);">${r.name}</td>
        <td colspan="6" style="padding:8px 10px; color:var(--neg); font-family:var(--font-mono); font-size:11px;">Errore: ${r.error}</td>
      </tr>`;
    }
    const completa = r.mancanti === 0;
    const isLive = ytLiveSet.has(r.gid);
    return `<tr style="border-bottom:1px solid var(--line); cursor:pointer;" onclick="selectAstaFromSummary('${r.gid}')" onmouseover="this.style.background='var(--bg-elev-2)'" onmouseout="this.style.background='transparent'">
      <td style="padding:8px 10px; color:var(--ink); font-weight:600;">${r.name}</td>
      <td style="padding:8px 10px; color:var(--ink-soft); font-family:var(--font-mono); font-size:11px;">${r.modalita || '—'}</td>
      <td style="padding:8px 10px; text-align:right; font-family:var(--font-mono);">${r.count}${r.maxPosti !== null ? ` / ${r.maxPosti}` : ''}</td>
      <td style="padding:8px 10px; text-align:right; font-family:var(--font-mono); font-weight:600; color:${completa ? 'var(--pos)' : 'var(--accent)'};">${r.mancanti !== null ? r.mancanti : '—'}</td>
      <td style="padding:8px 10px; text-align:right; font-family:var(--font-mono); font-weight:600; color:var(--pos);">€${r.totale}</td>
      <td style="padding:8px 10px; text-align:right; font-family:var(--font-mono); color:var(--ink-mute);">${r.stimaMancante ? '€' + r.stimaMancante : '—'}</td>
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
          <th style="padding:8px 10px; font-weight:600; text-align:right;">Mancanti</th>
          <th style="padding:8px 10px; font-weight:600; text-align:right;">Incassato</th>
          <th style="padding:8px 10px; font-weight:600; text-align:right;">Da incassare (stima)</th>
          <th style="padding:8px 10px; font-weight:600; text-align:center;" title="Va in diretta sul canale YouTube — spunta manuale">📺 Live YT</th>
        </tr>
      </thead>
      <tbody>${trs}</tbody>
      <tfoot>
        <tr style="border-top:2px solid var(--line-strong); font-weight:700;">
          <td colspan="4" style="padding:10px; color:var(--ink);">Totale</td>
          <td style="padding:10px; text-align:right; font-family:var(--font-mono); color:var(--pos);">€${totIncassato}</td>
          <td style="padding:10px; text-align:right; font-family:var(--font-mono); color:var(--ink-mute);">€${totMancante}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>
    <div style="font-family:var(--font-mono); font-size:10.5px; color:var(--ink-mute); margin-top:8px;">"Da incassare" è una stima basata sulla quota media già versata in ciascuna asta — non sappiamo se i posti liberi saranno "esperti" (20€) o soci normali (25€).</div>
  `;
}

function onAsteSelectChange() {
  const sel = document.getElementById('asteSelect');
  if (!sel || !sel.value) return;
  loadAsteData(sel.value);
}

async function loadAsteData(gid) {
  const content = document.getElementById('asteContent');
  if (!content) return;
  asteCache.selectedGid = gid;

  content.innerHTML = '<div style="font-family:var(--font-mono);font-size:12px;color:var(--ink-mute);padding:24px 0;text-align:center;"><span class="material-symbols-rounded" style="font-size:14px;vertical-align:middle;animation:spin 1s linear infinite;">progress_activity</span> Caricamento…</div>';

  const secret = getPublishSecret();
  if (!secret) return;

  const tab = asteCache.tabs.find(t => t.gid === gid);
  const nameParam = tab ? `&name=${encodeURIComponent(tab.name)}` : '';

  try {
    const res = await fetch(`${BACKEND_BASE}/api/aste?action=data&gid=${encodeURIComponent(gid)}${nameParam}`, { headers: { 'X-Publish-Secret': secret } });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.error) {
      if (res.status === 401) clearPublishSecret();
      throw new Error(j.error || `HTTP ${res.status}`);
    }
    renderAsteContent(j);
  } catch (e) {
    content.innerHTML = `<div style="font-family:var(--font-mono);font-size:12px;color:var(--neg);padding:24px 0;text-align:center;">Errore caricamento dati: ${e.message}</div>`;
  }
}

function renderAsteContent(data) {
  const content = document.getElementById('asteContent');
  if (!content) return;

  const partecipanti = Array.isArray(data.partecipanti) ? data.partecipanti : [];
  const totale = data.totale || 0;
  const count = data.count || 0;
  const perImporto = data.perImporto || {};
  const maxPosti = typeof data.maxPosti === 'number' ? data.maxPosti : null;
  const mancanti = maxPosti !== null ? Math.max(0, maxPosti - count) : null;

  const breakdownHtml = Object.keys(perImporto).sort((a, b) => b - a).map(importo =>
    `<span style="font-family:var(--font-mono); font-size:11.5px; color:var(--ink-soft); background:var(--bg-elev-2); border:1px solid var(--line); border-radius:6px; padding:4px 10px;">€${importo} · ${perImporto[importo]} ${perImporto[importo] === 1 ? 'persona' : 'persone'}</span>`
  ).join('');

  const rowsHtml = partecipanti.map(p => {
    const d = p.data ? new Date(p.data) : null;
    const dataFmt = d && !isNaN(d.getTime())
      ? d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) + ' · ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
      : '—';
    const nomeCompleto = [p.nome, p.cognome].filter(Boolean).join(' ') || '—';
    const tgHandle = (p.telegram || '').replace('@', '').trim();
    const telegramHtml = tgHandle
      ? `<a href="https://t.me/${tgHandle}" target="_blank" rel="noopener" style="color:var(--accent); text-decoration:none;">@${tgHandle}</a>`
      : '—';
    return `<tr style="border-bottom:1px solid var(--line);">
      <td style="padding:9px 10px; color:var(--ink);">${nomeCompleto}</td>
      <td style="padding:9px 10px;">${telegramHtml}</td>
      <td style="padding:9px 10px; text-align:right; font-family:var(--font-mono); font-weight:600; color:var(--pos);">€${p.importo}</td>
      <td style="padding:9px 10px; text-align:right; font-family:var(--font-mono); font-size:11px; color:var(--ink-mute);">${dataFmt}</td>
    </tr>`;
  }).join('');

  content.innerHTML = `
    <div class="kpi-band" style="margin:20px 0;">
      <div class="kpi">
        <div class="kpi-label">💰 Quote raccolte</div>
        <div class="kpi-value accent">€${totale}</div>
        <div class="kpi-target">Totale versato per questa asta</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">👥 Partecipanti</div>
        <div class="kpi-value">${count}${maxPosti !== null ? `<span style="font-size:16px;color:var(--ink-mute);"> / ${maxPosti}</span>` : ''}</div>
        <div class="kpi-target">Hanno confermato il pagamento</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">🪑 Posti mancanti</div>
        <div class="kpi-value" style="color:${mancanti > 0 ? 'var(--accent)' : 'var(--pos)'};">${mancanti !== null ? mancanti : '—'}</div>
        <div class="kpi-target">${maxPosti !== null ? `Asta da ${maxPosti} posti` : 'Capienza non trovata'}</div>
      </div>
    </div>

    <div class="panel" style="margin-bottom:20px;">
      <div class="panel-title"><span class="material-symbols-rounded" style="color:var(--accent);">pie_chart</span> Ripartizione quote</div>
      <div class="panel-sub">Quante persone per ciascun importo versato</div>
      <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:4px;">
        ${breakdownHtml || '<span style="font-family:var(--font-mono);font-size:11.5px;color:var(--ink-mute);">Nessun dato</span>'}
      </div>
    </div>

    <div class="panel" style="margin-bottom:20px;">
      <div class="panel-title"><span class="material-symbols-rounded" style="color:var(--accent);">list_alt</span> Partecipanti</div>
      <div class="panel-sub">${count} ${count === 1 ? 'persona ha' : 'persone hanno'} versato la quota per questa asta</div>
      <div style="overflow-x:auto; margin-top:8px;">
        <table style="width:100%; border-collapse:collapse; font-size:12.5px; text-align:left;">
          <thead>
            <tr style="border-bottom:1px solid var(--line); color:var(--ink-soft); font-family:var(--font-mono); font-size:10px; text-transform:uppercase;">
              <th style="padding:8px 10px; font-weight:600;">Nome</th>
              <th style="padding:8px 10px; font-weight:600;">Telegram</th>
              <th style="padding:8px 10px; font-weight:600; text-align:right;">Quota</th>
              <th style="padding:8px 10px; font-weight:600; text-align:right;">Inviato</th>
            </tr>
          </thead>
          <tbody>${rowsHtml || '<tr><td colspan="4" style="padding:16px 10px;text-align:center;color:var(--ink-mute);font-family:var(--font-mono);font-size:11.5px;">Nessun partecipante</td></tr>'}</tbody>
        </table>
      </div>
    </div>

    <div class="panel">
      <div class="panel-title"><span class="material-symbols-rounded" style="color:var(--ink-mute);">person_search</span> Utenti mancanti</div>
      <div class="panel-sub">Quanti posti mancano per riempire l'asta — solo il numero: per sapere <em>chi</em> manca serve la lista completa iscritti, non ancora collegata</div>
      ${maxPosti === null ? `
      <div style="font-family:var(--font-mono); font-size:12px; color:var(--ink-mute); padding:16px 0; text-align:center; border:1px dashed var(--line); border-radius:8px; margin-top:8px;">
        Capienza non trovata per questa asta sul sito iscrizioni.
      </div>` : mancanti === 0 ? `
      <div style="font-family:var(--font-mono); font-size:12px; color:var(--pos); padding:16px 0; text-align:center; border:1px dashed var(--line); border-radius:8px; margin-top:8px;">
        <span class="material-symbols-rounded" style="font-size:14px;vertical-align:middle;">check_circle</span> Asta al completo — nessun posto mancante.
      </div>` : `
      <div style="font-family:var(--font-mono); font-size:13px; color:var(--ink); padding:16px 0; text-align:center; border:1px dashed var(--line); border-radius:8px; margin-top:8px;">
        Mancano <strong style="color:var(--accent);">${mancanti}</strong> ${mancanti === 1 ? 'persona' : 'persone'} per riempire questa asta da ${maxPosti} posti.
      </div>`}
    </div>
  `;
}
