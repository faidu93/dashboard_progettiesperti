// ============================================================================
// js/10-profit.js — Due cose distinte, non confonderle:
//   1. "Costi/Ricavi": ricavo del progetto (iscrizioni + quota extra 5€ aste,
//      dall'inizio stagione) meno costi sostenuti → utile netto del progetto.
//   2. "Saldo PayPal": tutto il denaro che dovrebbe fisicamente trovarsi sul
//      conto PayPal — TUTTO ciò che è stato incassato (iscrizioni, aste per
//      intero comprese di montepremio, FantaListone), senza filtri di data,
//      meno gli stessi costi sostenuti. Il montepremio delle aste è ancora
//      lì dentro finché non viene versato al vincitore, quindi conta.
// Dipendenze: 01-api.js (BACKEND_BASE), 02-instagram-publish.js (getPublishSecret)
// ============================================================================

// Da quando si contano i ricavi del progetto (sezione Costi/Ricavi soltanto —
// il saldo PayPal non filtra mai per data, conta tutto quello che è arrivato).
const PROFIT_PERIOD_START = '2026-06-01';

// FantaListone: quota fissa, nessuna colonna importo nel foglio.
const FANTALISTONE_QUOTA = 10;

// Costi fissi della stagione, inseriti a mano (nessun foglio li tiene — se ne
// aggiungi uno nuovo, aggiungi una riga qui). "previsto: true" = costo atteso
// ma non ancora sostenuto, escluso dai totali principali e mostrato a parte.
const PROFIT_COSTI = [
  { mese: 'Luglio 2026', descrizione: 'ChatGPT', importo: 23 },
  { mese: 'Agosto 2026', descrizione: 'ChatGPT', importo: 23 },
  { mese: 'Agosto 2026', descrizione: 'Fantalab (abbonamento annuale)', importo: 25 },
  { mese: 'Agosto 2026', descrizione: 'Streamyard', importo: 45 },
  { mese: 'Agosto 2026', descrizione: 'Claude', importo: 22 },
  { mese: 'Agosto 2026', descrizione: 'Editor', importo: 55 },
  { mese: 'Settembre 2026', descrizione: 'ChatGPT', importo: 23 },
  { mese: 'Settembre 2026', descrizione: 'Streamyard', importo: 45 },
];

async function loadProfitData() {
  const box = document.getElementById('profitContent');
  if (!box) return;

  const secret = getPublishSecret();
  if (!secret) {
    box.innerHTML = '<div style="font-family:var(--font-mono);font-size:12px;color:var(--ink-mute);padding:24px 0;text-align:center;">Inserisci la password di pubblicazione per vedere il conto economico.</div>';
    return;
  }

  box.innerHTML = '<div style="font-family:var(--font-mono);font-size:12px;color:var(--ink-mute);padding:24px 0;text-align:center;"><span class="material-symbols-rounded" style="font-size:14px;vertical-align:middle;animation:spin 1s linear infinite;">progress_activity</span> Caricamento…</div>';

  try {
    const [subRes, asteRes, flRes] = await Promise.all([
      fetch(`${BACKEND_BASE}/api/subscribers`, { headers: { 'X-Publish-Secret': secret } }),
      fetch(`${BACKEND_BASE}/api/aste?action=summary&notify=0`, { headers: { 'X-Publish-Secret': secret } }),
      fetch(`${BACKEND_BASE}/api/aste?action=fantalistone-count`, { headers: { 'X-Publish-Secret': secret } }),
    ]);

    const subJson = await subRes.json().catch(() => ({}));
    if (!subRes.ok || subJson.error) {
      if (subRes.status === 401) clearPublishSecret();
      throw new Error(subJson.error || `HTTP ${subRes.status} (iscritti)`);
    }
    const asteJson = await asteRes.json().catch(() => ({}));
    if (!asteRes.ok || asteJson.error) {
      if (asteRes.status === 401) clearPublishSecret();
      throw new Error(asteJson.error || `HTTP ${asteRes.status} (aste)`);
    }
    const flJson = await flRes.json().catch(() => ({}));
    if (!flRes.ok || flJson.error) {
      if (flRes.status === 401) clearPublishSecret();
      throw new Error(flJson.error || `HTTP ${flRes.status} (FantaListone)`);
    }

    const subscribers = Array.isArray(subJson.subscribers) ? subJson.subscribers : [];
    const asteRows = Array.isArray(asteJson.aste) ? asteJson.aste : [];
    const fantalistoneCount = Number(flJson.count) || 0;

    // --- 1) Costi/Ricavi: solo il ricavo del progetto, dall'inizio stagione ---
    const periodStart = new Date(PROFIT_PERIOD_START);
    const iscrizioniStagione = subscribers.filter(s => {
      const d = new Date((s.date || '').replace(' ', 'T'));
      return !isNaN(d.getTime()) && d >= periodStart;
    });
    const ricavoIscrizioni = iscrizioniStagione.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
    // Quota extra aste: solo i 5€, mai il montepremio (va al vincitore).
    const ricavoAste = asteRows.reduce((sum, r) => sum + (r.progetto || 0), 0);
    const ricavoTotale = ricavoIscrizioni + ricavoAste;

    const costiSostenuti = PROFIT_COSTI.filter(c => !c.previsto);
    const costiPrevisti = PROFIT_COSTI.filter(c => c.previsto);
    const totaleCostiSostenuti = costiSostenuti.reduce((sum, c) => sum + c.importo, 0);
    const totaleCostiPrevisti = costiPrevisti.reduce((sum, c) => sum + c.importo, 0);
    const utile = ricavoTotale - totaleCostiSostenuti;

    // --- 2) Saldo PayPal: TUTTO quello che è stato incassato, senza filtri di
    //     data — comprese le quote intere delle aste (montepremio incluso, è
    //     ancora fisicamente sul conto finché non viene versato al vincitore). ---
    const incassoIscrizioniTotale = subscribers.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
    const incassoAsteTotale = asteRows.reduce((sum, r) => sum + (r.totale || 0), 0);
    const incassoFantalistone = fantalistoneCount * FANTALISTONE_QUOTA;
    const incassoComplessivo = incassoIscrizioniTotale + incassoAsteTotale + incassoFantalistone;
    const saldoPaypal = incassoComplessivo - totaleCostiSostenuti;

    renderProfitContent({
      ricavoIscrizioni, numIscrizioni: iscrizioniStagione.length,
      ricavoAste,
      ricavoTotale,
      totaleCostiSostenuti, totaleCostiPrevisti,
      utile,
      incassoIscrizioniTotale, numIscrizioniTotale: subscribers.length,
      incassoAsteTotale,
      incassoFantalistone, fantalistoneCount,
      incassoComplessivo,
      saldoPaypal,
    });
  } catch (e) {
    // Errori di rete transitori (es. "Load failed") capitano — un pulsante per
    // riprovare sul colpo è meglio che dover cambiare tab e tornare indietro.
    box.innerHTML = `
      <div style="font-family:var(--font-mono);font-size:12px;color:var(--neg);padding:24px 0;text-align:center;">
        Impossibile caricare il conto economico: ${e.message}
        <div style="margin-top:12px;">
          <button onclick="loadProfitData()" style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;background:var(--bg-elev-2);border:1px solid var(--line-strong);border-radius:6px;color:var(--ink);font-size:12px;font-family:var(--font-body);cursor:pointer;">
            <span class="material-symbols-rounded" style="font-size:15px;">refresh</span> Riprova
          </button>
        </div>
      </div>`;
  }
}

function renderProfitContent(d) {
  const box = document.getElementById('profitContent');
  if (!box) return;

  const costiRowsHtml = PROFIT_COSTI.map(c => `
    <tr>
      <td style="color:var(--ink-mute); font-family:var(--font-mono); font-size:11px;">${c.mese}</td>
      <td style="color:var(--ink);">${c.descrizione}${c.previsto ? ' <span style="font-family:var(--font-mono); font-size:10px; color:var(--accent); border:1px solid var(--accent); border-radius:4px; padding:1px 5px; margin-left:4px;">previsto</span>' : ''}</td>
      <td style="text-align:right; font-family:var(--font-mono); font-weight:600; color:${c.previsto ? 'var(--ink-mute)' : 'var(--neg)'};">€${c.importo}</td>
    </tr>
  `).join('');

  const fmtEuro = n => Number.isInteger(n) ? n : n.toFixed(2);
  // Suddivisione dei ricavi (non dell'utile netto: nessuna sottrazione costi qui):
  // le iscrizioni gruppo si dividono 20% Profeta / 40% Direzionale / 40% Esperti;
  // la quota extra aste va solo a Direzionale ed Esperti, 50/50 (il Profeta non
  // ne prende parte).
  const quotaProfeta = d.ricavoIscrizioni * 0.20;
  const quotaGruppo = d.ricavoIscrizioni * 0.40 + d.ricavoAste * 0.50;

  box.innerHTML = `
    <div class="panel" style="margin-bottom:28px;">
      <div class="panel-title"><span class="material-symbols-rounded">account_balance</span> Conto economico</div>
      <div class="panel-sub">Ricavi e costi del progetto, da giugno in poi</div>

      <div class="mini-card" style="display:flex; gap:20px; flex-wrap:wrap; margin:12px 0 16px;">
        <div style="flex:1; min-width:110px;">
          <div class="mini-label">💰 Ricavi</div>
          <div class="mini-value" style="font-size:19px; color:var(--accent);">€${fmtEuro(d.ricavoTotale)}</div>
        </div>
        <div style="flex:1; min-width:110px;">
          <div class="mini-label">💸 Costi</div>
          <div class="mini-value" style="font-size:19px; color:var(--neg);">€${fmtEuro(d.totaleCostiSostenuti)}</div>
        </div>
        <div style="flex:1; min-width:110px;">
          <div class="mini-label">${d.utile >= 0 ? '📈' : '📉'} Utile netto</div>
          <div class="mini-value" style="font-size:19px; color:${d.utile >= 0 ? 'var(--pos)' : 'var(--neg)'};">€${fmtEuro(d.utile)}</div>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; align-items:start;">
        <div>
          <div class="mini-section-label" style="color:var(--pos);">Ricavi</div>
          <table class="mini-table">
            <tbody>
              <tr>
                <td style="color:var(--ink);">🎟️ Iscrizioni gruppo</td>
                <td style="color:var(--ink-mute); font-family:var(--font-mono); font-size:10.5px; text-align:right;">${d.numIscrizioni} isc.</td>
                <td style="text-align:right; font-family:var(--font-mono); font-weight:700; color:var(--ink-soft);">€${d.ricavoIscrizioni}</td>
              </tr>
              <tr>
                <td style="color:var(--ink);">🔨 Quota extra aste</td>
                <td style="color:var(--ink-mute); font-family:var(--font-mono); font-size:10.5px; text-align:right;">5€/asta</td>
                <td style="text-align:right; font-family:var(--font-mono); font-weight:700; color:var(--pos);">€${d.ricavoAste}</td>
              </tr>
            </tbody>
          </table>
          <div class="mini-label" style="margin-top:8px; text-transform:none;">Il montepremio non è ricavo: va al vincitore. FantaListone escluso.</div>
        </div>

        <div>
          <div class="mini-section-label" style="color:var(--neg);">Costi</div>
          <div style="overflow-x:auto;">
            <table class="mini-table" style="font-size:12px; text-align:left;">
              <tbody>${costiRowsHtml}</tbody>
              <tfoot>
                <tr style="border-top:2px solid var(--line-strong); font-weight:700;">
                  <td colspan="2" style="color:var(--ink);">Totale sostenuti</td>
                  <td style="text-align:right; font-family:var(--font-mono); color:var(--neg);">€${d.totaleCostiSostenuti}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      <div style="margin-top:18px; padding-top:14px; border-top:1px solid var(--line);">
        <div class="mini-section-label" style="color:var(--accent);">Suddivisione ricavi</div>
        <div class="mini-label" style="margin-bottom:8px; text-transform:none;">Iscrizioni: 20% Profeta / 40% Direzionale / 40% Esperti · Quota extra aste: 50% Direzionale / 50% Esperti</div>
        <div style="display:flex; gap:12px; flex-wrap:wrap;">
          <div class="mini-card" style="flex:1; min-width:140px;">
            <div class="mini-label">👤 Quota Profeta</div>
            <div class="mini-value">€${fmtEuro(quotaProfeta)}</div>
          </div>
          <div class="mini-card" style="flex:1; min-width:140px;">
            <div class="mini-label">🧭 Gruppo Direzionale</div>
            <div class="mini-value">€${fmtEuro(quotaGruppo)}</div>
          </div>
          <div class="mini-card" style="flex:1; min-width:140px;">
            <div class="mini-label">🎙️ Gruppo Esperti</div>
            <div class="mini-value">€${fmtEuro(quotaGruppo)}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-title"><span class="material-symbols-rounded">account_balance_wallet</span> Saldo PayPal</div>
      <div class="panel-sub">Tutto l'incassato, senza filtri di data — montepremio delle aste compreso, perché è ancora lì finché non lo versiamo al vincitore</div>

      <div class="kpi-band" style="margin:14px 0 16px;">
        <div class="kpi">
          <div class="kpi-label">💳 Incassato totale</div>
          <div class="kpi-value accent">€${d.incassoComplessivo}</div>
          <div class="kpi-target">Iscrizioni + aste + FantaListone</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">💸 Costi sostenuti</div>
          <div class="kpi-value" style="color:var(--neg);">€${d.totaleCostiSostenuti}</div>
          <div class="kpi-target">Stessi costi di sopra</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">🏦 Saldo atteso</div>
          <div class="kpi-value" style="color:${d.saldoPaypal >= 0 ? 'var(--pos)' : 'var(--neg)'};">€${d.saldoPaypal}</div>
          <div class="kpi-target">Incassato meno costi</div>
        </div>
      </div>

      <table class="mini-table" style="font-size:13px;">
        <tbody>
          <tr>
            <td style="color:var(--ink);">🎟️ Iscrizioni</td>
            <td style="color:var(--ink-mute); font-family:var(--font-mono); font-size:11px;">${d.numIscrizioniTotale} iscritti</td>
            <td style="text-align:right; font-family:var(--font-mono); font-weight:700; color:var(--ink-soft);">€${d.incassoIscrizioniTotale}</td>
          </tr>
          <tr>
            <td style="color:var(--ink);">🔨 Aste</td>
            <td style="color:var(--ink-mute); font-family:var(--font-mono); font-size:11px;">Tutte le quote</td>
            <td style="text-align:right; font-family:var(--font-mono); font-weight:700; color:var(--ink-soft);">€${d.incassoAsteTotale}</td>
          </tr>
          <tr>
            <td style="color:var(--ink);">🏆 FantaListone</td>
            <td style="color:var(--ink-mute); font-family:var(--font-mono); font-size:11px;">${d.fantalistoneCount} iscritti × 10€</td>
            <td style="text-align:right; font-family:var(--font-mono); font-weight:700; color:var(--ink-soft);">€${d.incassoFantalistone}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}
