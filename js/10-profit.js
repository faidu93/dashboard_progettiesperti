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
  { mese: 'Settembre 2026', descrizione: 'Streamyard', importo: 45, previsto: true },
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
      fetch(`${BACKEND_BASE}/api/aste?action=summary`, { headers: { 'X-Publish-Secret': secret } }),
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
    <tr style="border-bottom:1px solid var(--line);">
      <td style="padding:9px 10px; color:var(--ink-mute); font-family:var(--font-mono); font-size:11px;">${c.mese}</td>
      <td style="padding:9px 10px; color:var(--ink);">${c.descrizione}${c.previsto ? ' <span style="font-family:var(--font-mono); font-size:10px; color:var(--accent); border:1px solid var(--accent); border-radius:4px; padding:1px 5px; margin-left:4px;">previsto</span>' : ''}</td>
      <td style="padding:9px 10px; text-align:right; font-family:var(--font-mono); font-weight:600; color:${c.previsto ? 'var(--ink-mute)' : 'var(--neg)'};">€${c.importo}</td>
    </tr>
  `).join('');

  box.innerHTML = `
    <p style="font-family:var(--font-mono); font-size:11px; color:var(--accent); text-transform:uppercase; letter-spacing:0.04em; margin:4px 0 4px;">Costi / Ricavi</p>
    <div class="kpi-band" style="margin:0 0 20px;">
      <div class="kpi">
        <div class="kpi-label">💰 Ricavi totali</div>
        <div class="kpi-value accent">€${d.ricavoTotale}</div>
        <div class="kpi-target">Iscrizioni + quota extra aste, da giugno</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">💸 Costi sostenuti</div>
        <div class="kpi-value" style="color:var(--neg);">€${d.totaleCostiSostenuti}</div>
        <div class="kpi-target">${d.totaleCostiPrevisti > 0 ? `+ €${d.totaleCostiPrevisti} previsti` : 'Nessun costo previsto in più'}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">${d.utile >= 0 ? '📈' : '📉'} Utile netto</div>
        <div class="kpi-value" style="color:${d.utile >= 0 ? 'var(--pos)' : 'var(--neg)'};">€${d.utile}</div>
        <div class="kpi-target">Ricavi meno costi sostenuti</div>
      </div>
    </div>

    <div class="panel" style="margin-bottom:20px;">
      <div class="panel-title"><span class="material-symbols-rounded" style="color:var(--pos);">trending_up</span> Ricavi</div>
      <div class="panel-sub">Da dove arrivano i €${d.ricavoTotale} raccolti</div>
      <div style="display:flex; gap:16px; flex-wrap:wrap; margin-top:8px;">
        <div style="flex:1; min-width:180px; background:var(--bg-elev-2); border:1px solid var(--line); border-radius:8px; padding:12px 16px;">
          <div style="font-family:var(--font-mono); font-size:10px; color:var(--ink-mute); text-transform:uppercase;">🎟️ Iscrizioni gruppo</div>
          <div style="font-family:var(--font-display); font-size:22px; font-weight:800; color:var(--ink-soft);">€${d.ricavoIscrizioni}</div>
          <div style="font-family:var(--font-mono); font-size:10.5px; color:var(--ink-mute); margin-top:2px;">${d.numIscrizioni} iscritti × 15€</div>
        </div>
        <div style="flex:1; min-width:180px; background:var(--bg-elev-2); border:1px solid var(--pos); border-radius:8px; padding:12px 16px;">
          <div style="font-family:var(--font-mono); font-size:10px; color:var(--ink-mute); text-transform:uppercase;">🔨 Quota extra aste</div>
          <div style="font-family:var(--font-display); font-size:22px; font-weight:800; color:var(--pos);">€${d.ricavoAste}</div>
          <div style="font-family:var(--font-mono); font-size:10.5px; color:var(--ink-mute); margin-top:2px;">I 5€ oltre al montepremio</div>
        </div>
      </div>
      <div style="font-family:var(--font-mono); font-size:10.5px; color:var(--ink-mute); margin-top:8px;">Il montepremio delle aste (20€ a persona) non è ricavo: va ridistribuito al vincitore. Il FantaListone non è incluso qui.</div>
    </div>

    <div class="panel" style="margin-bottom:20px;">
      <div class="panel-title"><span class="material-symbols-rounded" style="color:var(--neg);">receipt_long</span> Costi</div>
      <div class="panel-sub">Inseriti a mano — aggiungine uno chiedendomi di aggiornare la lista</div>
      <div style="overflow-x:auto; margin-top:8px;">
        <table style="width:100%; border-collapse:collapse; font-size:12.5px; text-align:left;">
          <thead>
            <tr style="border-bottom:1px solid var(--line); color:var(--ink-soft); font-family:var(--font-mono); font-size:10px; text-transform:uppercase;">
              <th style="padding:8px 10px; font-weight:600;">Mese</th>
              <th style="padding:8px 10px; font-weight:600;">Voce</th>
              <th style="padding:8px 10px; font-weight:600; text-align:right;">Importo</th>
            </tr>
          </thead>
          <tbody>${costiRowsHtml}</tbody>
          <tfoot>
            <tr style="border-top:2px solid var(--line-strong); font-weight:700;">
              <td colspan="2" style="padding:10px; color:var(--ink);">Totale sostenuti</td>
              <td style="padding:10px; text-align:right; font-family:var(--font-mono); color:var(--neg);">€${d.totaleCostiSostenuti}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <p style="font-family:var(--font-mono); font-size:11px; color:var(--accent); text-transform:uppercase; letter-spacing:0.04em; margin:24px 0 4px;">Saldo PayPal</p>
    <div class="panel">
      <div class="panel-title"><span class="material-symbols-rounded" style="color:var(--accent);">account_balance_wallet</span> Quanto dovremmo avere sul conto</div>
      <div class="panel-sub">Tutto l'incassato, senza filtri di data — montepremio delle aste compreso, perché è ancora lì finché non lo versiamo al vincitore</div>
      <div class="kpi-band" style="margin:12px 0 12px;">
        <div class="kpi">
          <div class="kpi-label">💳 Incassato totale</div>
          <div class="kpi-value accent">€${d.incassoComplessivo}</div>
          <div class="kpi-target">Iscrizioni + aste intere + FantaListone</div>
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
      <div style="display:flex; gap:12px; flex-wrap:wrap;">
        <div style="flex:1; min-width:150px; background:var(--bg-elev-2); border:1px solid var(--line); border-radius:8px; padding:10px 14px;">
          <div style="font-family:var(--font-mono); font-size:10px; color:var(--ink-mute); text-transform:uppercase;">🎟️ Iscrizioni</div>
          <div style="font-family:var(--font-display); font-size:18px; font-weight:800; color:var(--ink-soft);">€${d.incassoIscrizioniTotale}</div>
          <div style="font-family:var(--font-mono); font-size:10px; color:var(--ink-mute); margin-top:2px;">${d.numIscrizioniTotale} iscritti, sempre</div>
        </div>
        <div style="flex:1; min-width:150px; background:var(--bg-elev-2); border:1px solid var(--line); border-radius:8px; padding:10px 14px;">
          <div style="font-family:var(--font-mono); font-size:10px; color:var(--ink-mute); text-transform:uppercase;">🔨 Aste (intere)</div>
          <div style="font-family:var(--font-display); font-size:18px; font-weight:800; color:var(--ink-soft);">€${d.incassoAsteTotale}</div>
          <div style="font-family:var(--font-mono); font-size:10px; color:var(--ink-mute); margin-top:2px;">Quote da 20€ e 25€, tutte</div>
        </div>
        <div style="flex:1; min-width:150px; background:var(--bg-elev-2); border:1px solid var(--line); border-radius:8px; padding:10px 14px;">
          <div style="font-family:var(--font-mono); font-size:10px; color:var(--ink-mute); text-transform:uppercase;">🏆 FantaListone</div>
          <div style="font-family:var(--font-display); font-size:18px; font-weight:800; color:var(--ink-soft);">€${d.incassoFantalistone}</div>
          <div style="font-family:var(--font-mono); font-size:10px; color:var(--ink-mute); margin-top:2px;">${d.fantalistoneCount} iscritti × 10€</div>
        </div>
      </div>
    </div>
  `;
}
