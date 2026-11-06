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
// Un iscritto risulta nel foglio ma non paga la quota — va escluso dall'incasso.
const FANTALISTONE_NON_PAGANTI = 1;

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
  { mese: 'Settembre 2026', descrizione: 'Claude', importo: 22 },
  { mese: 'Ottobre 2026', descrizione: 'ChatGPT', importo: 23 },
  { mese: 'Ottobre 2026', descrizione: 'Claude', importo: 22 },
  { mese: 'Novembre 2026', descrizione: 'ChatGPT', importo: 23 },
];

// Evita di rifare tutte le chiamate (iscritti + aste + FantaListone) ogni
// volta che si riapre il tab Profit andando avanti e indietro — entro questa
// finestra i dati già in memoria bastano.
let profitCache = null; // { data, ts }
// Ultimo conto economico calcolato con TUTTI i dati: se un caricamento fallisce si
// mostra questo (con l'avviso) invece di una pagina vuota o, peggio, di ricavi parziali.
const PROFIT_LAST_GOOD_KEY = 'epf_profit_last_good_v3';

// Quota del Profeta: 20% di (numero totale di iscritti x quota standard), senza costi.
// Contano tutti gli iscritti, anche chi ha pagato 0 o una quota ridotta, e ognuno
// vale esattamente 15 euro.
const QUOTA_ISCRIZIONE_STANDARD = 15;

// Come si divide ogni riga del conto economico tra le tre parti.
//   iscrizioni: prima la quota del Profeta (profeta, calcolata sul teorico iscritti x 15 €);
//               il resto si divide a metà tra Direzionale ed Esperti (direzionale/esperti);
//   aste:       tutta al Direzionale;
//   costi:      a metà tra Direzionale ed Esperti, il Profeta non sostiene costi.
// Per costruzione Profeta + Direzionale + Esperti == utile netto.
const PROFIT_SPLIT = {
  iscrizioni: { profeta: 0.20, direzionale: 0.50, esperti: 0.50 },
  aste:       { profeta: 0,    direzionale: 1,    esperti: 0 },
  costi:      { profeta: 0,    direzionale: 0.50, esperti: 0.50 },
};
const PROFIT_CACHE_TTL_MS = 45 * 1000;

async function loadProfitData(force) {
  const box = document.getElementById('profitContent');
  if (!box) return;

  const secret = await getPublishSecret();
  if (!secret) {
    box.innerHTML = '<div style="font-family:var(--font-mono);font-size:12px;color:var(--ink-mute);padding:24px 0;text-align:center;">Inserisci la password di pubblicazione per vedere il conto economico.</div>';
    return;
  }

  if (!force && profitCache && (Date.now() - profitCache.ts) < PROFIT_CACHE_TTL_MS) {
    renderProfitContent(profitCache.data);
    return;
  }

  box.innerHTML = '<div style="font-family:var(--font-mono);font-size:12px;color:var(--ink-mute);padding:24px 0;text-align:center;"><span class="material-symbols-rounded" style="font-size:14px;vertical-align:middle;animation:spin 1s linear infinite;">progress_activity</span> Caricamento…</div>';

  try {
    const [subRes, asteRes, flRes] = await Promise.all([
      fetchWithRetry(`${BACKEND_BASE}/api/subscribers`, { headers: { 'X-Publish-Secret': secret } }),
      fetchWithRetry(`${BACKEND_BASE}/api/aste?action=summary&notify=0`, { headers: { 'X-Publish-Secret': secret } }),
      fetchWithRetry(`${BACKEND_BASE}/api/aste?action=fantalistone-count`, { headers: { 'X-Publish-Secret': secret } }),
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
    // Un'asta che non si è letta non ha i suoi importi: sommarla come 0 farebbe
    // risultare i ricavi più bassi del vero senza dire niente. Meglio fermarsi.
    const asteNonLette = asteRows.filter(r => r.error);
    if (asteNonLette.length > 0) {
      throw new Error(`${asteNonLette.length} aste non lette (${asteNonLette.map(r => r.name).join(', ')}): ricavi incompleti`);
    }
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
    const fantalistonePaganti = Math.max(0, fantalistoneCount - FANTALISTONE_NON_PAGANTI);
    const incassoFantalistone = fantalistonePaganti * FANTALISTONE_QUOTA;
    const incassoComplessivo = incassoIscrizioniTotale + incassoAsteTotale + incassoFantalistone;
    const saldoPaypal = incassoComplessivo - totaleCostiSostenuti;

    const d = {
      ricavoIscrizioni, numIscrizioni: iscrizioniStagione.length,
      // Base della quota del Profeta: tutti gli iscritti della stagione, anche a 0 €.
      numQuotaProfeta: iscrizioniStagione.length,
      ricavoAste,
      ricavoTotale,
      totaleCostiSostenuti, totaleCostiPrevisti,
      utile,
      incassoIscrizioniTotale, numIscrizioniTotale: subscribers.length,
      incassoAsteTotale,
      incassoFantalistone, fantalistoneCount, fantalistonePaganti,
      incassoComplessivo,
      saldoPaypal,
    };
    profitCache = { data: d, ts: Date.now() };
    try { localStorage.setItem(PROFIT_LAST_GOOD_KEY, JSON.stringify({ d, ts: Date.now() })); } catch (err) {}
    renderProfitContent(d);
  } catch (e) {
    let ultimo = null;
    try { ultimo = JSON.parse(localStorage.getItem(PROFIT_LAST_GOOD_KEY) || 'null'); } catch (err) {}
    if (ultimo && ultimo.d) {
      renderProfitContent(ultimo.d);
      const quando = new Date(ultimo.ts).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      box.insertAdjacentHTML('afterbegin', `
        <div style="font-family:var(--font-mono);font-size:11.5px;color:var(--neg);border:1px solid var(--neg);border-radius:8px;padding:10px 14px;margin-bottom:16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
          <span>Dati non aggiornati: ${e.message}. Mostro l'ultimo conto completo, salvato il ${quando}.</span>
          <button onclick="loadProfitData(true)" style="padding:5px 12px;background:var(--bg-elev-2);border:1px solid var(--line-strong);border-radius:6px;color:var(--ink);font-size:12px;cursor:pointer;">Riprova</button>
        </div>`);
      return;
    }
    // Errori di rete transitori (es. "Load failed") capitano — un pulsante per
    // riprovare sul colpo è meglio che dover cambiare tab e tornare indietro.
    box.innerHTML = `
      <div style="font-family:var(--font-mono);font-size:12px;color:var(--neg);padding:24px 0;text-align:center;">
        Impossibile caricare il conto economico: ${e.message}
        <div style="margin-top:12px;">
          <button onclick="loadProfitData(true)" style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;background:var(--bg-elev-2);border:1px solid var(--line-strong);border-radius:6px;color:var(--ink);font-size:12px;font-family:var(--font-body);cursor:pointer;">
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
  // Suddivisione per riga: ogni importo (iscrizioni, quota extra aste, costi) si
  // distribuisce con le percentuali di PROFIT_SPLIT; le quote finali sono la somma
  // delle righe, con i costi in negativo. Per costruzione Profeta + Direzionale +
  // Esperti == utile netto.
  const PARTI = ['profeta', 'direzionale', 'esperti'];
  const haPaganti = typeof d.numQuotaProfeta === 'number'; // assente nei conti salvati da versioni precedenti
  const teoricoPaganti = haPaganti ? d.numQuotaProfeta * QUOTA_ISCRIZIONE_STANDARD : null;
  // senza il numero degli iscritti (conti salvati da versioni precedenti) ripiega sul 20% del ricavo reale
  const quotaProfetaIscrizioni = PROFIT_SPLIT.iscrizioni.profeta * (haPaganti ? teoricoPaganti : d.ricavoIscrizioni);
  const righeSplit = [
    { label: '🎟️ Iscrizioni gruppo', totale: d.ricavoIscrizioni, regola: PROFIT_SPLIT.iscrizioni, segno: 1,
      // il Profeta prende il 20% di tutti gli iscritti x 15 €, non del ricavo reale;
      // il resto delle iscrizioni va a metà a Direzionale ed Esperti
      override: {
        profeta: quotaProfetaIscrizioni,
        direzionale: (d.ricavoIscrizioni - quotaProfetaIscrizioni) * PROFIT_SPLIT.iscrizioni.direzionale,
        esperti: (d.ricavoIscrizioni - quotaProfetaIscrizioni) * PROFIT_SPLIT.iscrizioni.esperti,
      },
      nota: haPaganti ? `Profeta 20% × ${d.numQuotaProfeta} iscritti × ${QUOTA_ISCRIZIONE_STANDARD}€ = 20% × ${fmtEuro(teoricoPaganti)}€ · il resto 50% · 50%` : 'Profeta 20% · il resto 50% · 50%' },
    { label: '🔨 Quota extra aste',  totale: d.ricavoAste,       regola: PROFIT_SPLIT.aste,       segno: 1 },
    { label: '💸 Costi sostenuti',   totale: d.totaleCostiSostenuti, regola: PROFIT_SPLIT.costi,  segno: -1 },
  ].map(r => ({ ...r, parti: Object.fromEntries(PARTI.map(k => [k, (r.override && k in r.override) ? r.override[k] : r.segno * r.totale * r.regola[k]])) }));
  const quota = Object.fromEntries(PARTI.map(k => [k, righeSplit.reduce((sum, r) => sum + r.parti[k], 0)]));
  const quotaProfeta = quota.profeta, quotaDirezionale = quota.direzionale, quotaEsperti = quota.esperti;
  const fmtSigned = n => (n < 0 ? '−' : '') + '€' + fmtEuro(Math.abs(n));
  const fmtRegola = reg => PARTI.map(k => Math.round(reg[k] * 100) + '%').join(' · ');
  const splitRowsHtml = righeSplit.map(r => `
    <tr>
      <td style="color:var(--ink);">${r.label}<div style="font-family:var(--font-mono); font-size:10px; color:var(--ink-mute);">${r.nota || fmtRegola(r.regola)}</div></td>
      <td style="text-align:right; font-family:var(--font-mono); color:var(--ink-soft);">${fmtSigned(r.segno * r.totale)}</td>
      ${PARTI.map(k => `<td style="text-align:right; font-family:var(--font-mono); color:${r.parti[k] < 0 ? 'var(--neg)' : (r.parti[k] === 0 ? 'var(--ink-mute)' : 'var(--ink)')};">${fmtSigned(r.parti[k])}</td>`).join('')}
    </tr>`).join('');
  // Controllo di coerenza: la somma delle tre quote deve coincidere con l'utile netto;
  // se non coincide per qualche motivo la differenza resta visibile, non assegnata.
  const sommaQuote = PARTI.reduce((sum, k) => sum + quota[k], 0);
  const nonAssegnato = d.utile - sommaQuote;

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

      <div class="panel-grid equal" style="align-items:start;">
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

        <details class="profit-costi">
          <summary style="list-style:none; cursor:pointer; display:flex; align-items:center; justify-content:space-between; gap:8px; user-select:none;">
            <span class="mini-section-label" style="color:var(--neg); margin:0;">Dettaglio costi</span>
            <span style="display:inline-flex; align-items:center; gap:4px; font-family:var(--font-mono); font-size:12px; font-weight:700; color:var(--neg);">
              €${d.totaleCostiSostenuti}
              <span class="material-symbols-rounded profit-costi-chevron" style="font-size:18px; color:var(--ink-mute); transition:transform .2s;">expand_more</span>
            </span>
          </summary>
          <style>
            .profit-costi > summary::-webkit-details-marker { display:none; }
            .profit-costi[open] .profit-costi-chevron { transform:rotate(180deg); }
          </style>
          <div style="overflow-x:auto; margin-top:8px;">
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
        </details>
      </div>

      <div style="margin-top:18px; padding-top:14px; border-top:1px solid var(--line);">
        <div class="mini-section-label" style="color:var(--accent);">Suddivisione ricavi e costi</div>
        <div style="overflow-x:auto; margin-bottom:12px;">
          <table class="mini-table" style="font-size:12px; text-align:left; min-width:420px;">
            <thead>
              <tr style="color:var(--ink-mute); font-family:var(--font-mono); font-size:10px; text-transform:uppercase;">
                <th style="font-weight:600;">Voce</th>
                <th style="font-weight:600; text-align:right;">Totale</th>
                <th style="font-weight:600; text-align:right;">Profeta</th>
                <th style="font-weight:600; text-align:right;">Direzionale</th>
                <th style="font-weight:600; text-align:right;">Esperti</th>
              </tr>
            </thead>
            <tbody>${splitRowsHtml}</tbody>
            <tfoot>
              <tr style="border-top:2px solid var(--line-strong); font-weight:700;">
                <td style="color:var(--ink);">Totale spettante</td>
                <td style="text-align:right; font-family:var(--font-mono); color:${d.utile >= 0 ? 'var(--pos)' : 'var(--neg)'};">${fmtSigned(d.utile)}</td>
                ${PARTI.map(k => `<td style="text-align:right; font-family:var(--font-mono); color:${quota[k] >= 0 ? 'var(--pos)' : 'var(--neg)'};">${fmtSigned(quota[k])}</td>`).join('')}
              </tr>
              ${Math.abs(nonAssegnato) >= 0.005 ? `<tr>
                <td colspan="5" style="color:var(--ink-mute); font-family:var(--font-mono); font-size:10px; font-weight:400;">Somma delle quote ${fmtSigned(sommaQuote)} · utile netto ${fmtSigned(d.utile)} · differenza non assegnata ${fmtSigned(nonAssegnato)}</td>
              </tr>` : ''}
            </tfoot>
          </table>
        </div>
        <div style="display:flex; gap:12px; flex-wrap:wrap;">
          <div class="mini-card" style="flex:1; min-width:140px;">
            <div class="mini-label">👤 Quota Profeta</div>
            <div class="mini-value">${fmtSigned(quotaProfeta)}</div>
          </div>
          <div class="mini-card" style="flex:1; min-width:140px;">
            <div class="mini-label">🧭 Gruppo Direzionale</div>
            <div class="mini-value">${fmtSigned(quotaDirezionale)}</div>
          </div>
          <div class="mini-card" style="flex:1; min-width:140px;">
            <div class="mini-label">🎙️ Gruppo Esperti</div>
            <div class="mini-value">${fmtSigned(quotaEsperti)}</div>
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
            <td style="color:var(--ink-mute); font-family:var(--font-mono); font-size:11px;">${d.fantalistonePaganti} paganti × 10€ (${d.fantalistoneCount} iscritti)</td>
            <td style="text-align:right; font-family:var(--font-mono); font-weight:700; color:var(--ink-soft);">€${d.incassoFantalistone}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}
