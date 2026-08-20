// ============================================================================
// js/09-aste.js — Recap quote raccolte per asta (Google Sheet pubblico)
// Dipendenze: 01-api.js (BACKEND_BASE), 02-instagram-publish.js (getPublishSecret)
// ============================================================================

let asteCache = { tabs: [], selectedGid: null };

async function loadAsteTabs() {
  const sel = document.getElementById('asteSelect');
  const content = document.getElementById('asteContent');
  if (!sel || !content) return;

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

  try {
    const res = await fetch(`${BACKEND_BASE}/api/aste?action=data&gid=${encodeURIComponent(gid)}`, { headers: { 'X-Publish-Secret': secret } });
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
        <div class="kpi-value">${count}</div>
        <div class="kpi-target">Hanno confermato il pagamento</div>
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
      <div class="panel-sub">Chi doveva partecipare ma non ha ancora versato la quota</div>
      <div style="font-family:var(--font-mono); font-size:12px; color:var(--ink-mute); padding:16px 0; text-align:center; border:1px dashed var(--line); border-radius:8px; margin-top:8px;">
        In attesa della lista completa iscritti per calcolare chi manca.
      </div>
    </div>
  `;
}
