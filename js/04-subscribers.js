// ============================================================================
// js/04-subscribers.js — Sezione Acquisizioni: KPI iscritti e grafico MRR
// Dipendenze: 01-api.js
// ============================================================================

// ============================================================================
// LOGICA ISCRITTI & ACQUISIZIONI
// ============================================================================

// Paginazione e ricerca
let subCurrentPage = 1;
const subPageSize = 10;
let subFilteredList = [];

// Helper standard ISO per ottenere il numero di settimana
function getSubWeekNumber(d) {
  const dateCopy = new Date(d.valueOf());
  dateCopy.setHours(0, 0, 0, 0);
  dateCopy.setDate(dateCopy.getDate() + 4 - (dateCopy.getDay() || 7));
  const yearStart = new Date(dateCopy.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((dateCopy - yearStart) / 86400000) + 1) / 7);
  return { year: dateCopy.getFullYear(), week: weekNo };
}

// Nomi leggibili dei mesi in italiano
const SUB_MONTHS_IT = {
  '01': 'Gen', '02': 'Feb', '03': 'Mar', '04': 'Apr', '05': 'Mag', '06': 'Giu',
  '07': 'Lug', '08': 'Ago', '09': 'Set', '10': 'Ott', '11': 'Nov', '12': 'Dic'
};

// Renderizza lo stato Non Autorizzato (richiesta password)
function renderSubscribersUnauthorized() {
  const container = document.querySelector('section[data-tab="acquisizioni"]');
  if (!container) return;
  
  container.innerHTML = `
    <div style="max-width:480px;margin:80px auto;text-align:center;padding:40px 30px;background:var(--bg-elev);border:1px solid var(--line);border-radius:12px;box-shadow:0 20px 40px rgba(0,0,0,0.3);">
      <span class="material-symbols-rounded" style="font-size:56px;color:var(--accent);margin-bottom:20px;display:block;">lock</span>
      <h3 style="font-size:18px;font-weight:600;color:var(--ink);margin-bottom:12px;">Sezione protetta</h3>
      <p style="font-size:13px;color:var(--ink-soft);line-height:1.5;margin-bottom:24px;">Inserisci la password di pubblicazione (PUBLISH_SECRET) per sbloccare i dati degli iscritti e delle entrate del progetto.</p>
      <div style="display:flex;flex-direction:column;gap:12px;">
        <input type="password" id="subPassField" placeholder="Inserisci PUBLISH_SECRET" style="width:100%;padding:11px 14px;background:var(--bg-elev-2);border:1px solid var(--line-strong);border-radius:6px;color:var(--ink);font-size:13.5px;text-align:center;" onkeydown="if(event.key==='Enter') unlockSubscribers()">
        <button class="nav-btn" onclick="unlockSubscribers()" style="width:100%;justify-content:center;padding:11px 0;background:var(--accent);border-color:var(--accent);color:#000;font-weight:600;font-size:13.5px;">Sblocca dati</button>
      </div>
      <div id="subUnlockError" style="margin-top:12px;font-size:12px;color:var(--neg);display:none;">Password errata. Riprova.</div>
    </div>
  `;
}

// Gestisce lo sblocco tramite password
async function unlockSubscribers() {
  const pw = document.getElementById('subPassField').value.trim();
  if (!pw) return;
  
  const errDiv = document.getElementById('subUnlockError');
  if (errDiv) errDiv.style.display = 'none';
  
  const btn = document.querySelector('section[data-tab="acquisizioni"] button');
  if (btn) { btn.textContent = 'Verifica in corso...'; btn.disabled = true; }
  
  try {
    const res = await fetch(`${BACKEND_BASE}/api/subscribers`, {
      headers: { 'X-Publish-Secret': pw }
    });
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.subscribers)) {
        try {
          sessionStorage.setItem('publish_secret', pw);
          localStorage.setItem('publish_secret', pw);
        } catch(e) {}
        
        window.CACHED_SUBSCRIBERS = data;
        
        resetSubscribersHTML();
        renderSubscribersKPIs(data);
        renderSubscribersChart();
      } else {
        if (errDiv) {
          errDiv.textContent = 'Dati non validi dal server. Verifica di aver installato il nuovo Apps Script nel Google Sheet degli iscritti.';
          errDiv.style.display = 'block';
        }
        if (btn) { btn.textContent = 'Sblocca dati'; btn.disabled = false; }
      }
    } else {
      if (errDiv) {
        errDiv.textContent = res.status === 401 ? 'Password errata. Riprova.' : 'Errore del server durante il caricamento.';
        errDiv.style.display = 'block';
      }
      if (btn) { btn.textContent = 'Sblocca dati'; btn.disabled = false; }
    }
  } catch(e) {
    if (errDiv) {
      errDiv.textContent = 'Errore di rete: ' + e.message;
      errDiv.style.display = 'block';
    }
    if (btn) { btn.textContent = 'Sblocca dati'; btn.disabled = false; }
  }
}

// Ripristina l'HTML strutturato del tab acquisizioni dopo lo sblocco
function resetSubscribersHTML() {
  const container = document.querySelector('section[data-tab="acquisizioni"]');
  if (!container) return;
  
  container.innerHTML = `
    <!-- KPI -->
    <div class="kpi-band" style="margin-bottom:24px;" id="subKpiBand">
      <div class="kpi">
        <div class="kpi-label">👥 Iscritti totali</div>
        <div class="kpi-value" id="sub-total">—</div>
        <div class="kpi-target">Membri registrati</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">💰 Entrate Totali</div>
        <div class="kpi-value accent" id="sub-revenue">—</div>
        <div class="kpi-target">Fatturato complessivo</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">📅 Entrate Oggi</div>
        <div class="kpi-value" id="sub-today">—</div>
        <div class="kpi-target">Fatturato giornaliero</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">📈 Entrate Settimana</div>
        <div class="kpi-value" id="sub-week">—</div>
        <div class="kpi-target">Lun - Dom corrente</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">📊 Entrate Mese</div>
        <div class="kpi-value" id="sub-month">—</div>
        <div class="kpi-target">Mese corrente</div>
      </div>
    </div>

    <!-- GRIGLIA PANNELLI (Grafico/Economics + Anagrafica/Ricerca) -->
    <div class="panel-grid two-col">
      <!-- Economics & Andamento -->
      <div class="panel" style="display:flex; flex-direction:column; gap:16px;">
        <div>
          <div class="panel-title" style="display:flex; justify-content:space-between; align-items:center;">
            <span style="display:flex; align-items:center; gap:8px;">
              <span class="material-symbols-rounded" style="color:var(--accent);">insights</span>
              Economics & Andamento
            </span>
            <select id="subPeriodType" onchange="onSubscribersPeriodChange()" style="padding:6px 10px; background:var(--bg-elev-2); border:1px solid var(--line-strong); border-radius:5px; color:var(--ink-soft); font-size:12px; font-family:var(--font-body); cursor:pointer;">
              <option value="daily">Distribuzione Giornaliera</option>
              <option value="weekly">Distribuzione Settimanale</option>
              <option value="monthly">Distribuzione Mensile</option>
            </select>
          </div>
          <div class="panel-sub">Statistiche di acquisizione e fatturato ripartite nel tempo</div>
        </div>
        
        <!-- Grafico -->
        <div style="position:relative;height:240px;">
          <canvas id="chartSubscribers"></canvas>
        </div>

        <!-- Tabella Economics -->
        <div style="overflow-x:auto; margin-top:8px;">
          <table style="width:100%; border-collapse:collapse; font-size:12px; text-align:left;">
            <thead>
              <tr style="border-bottom:1px solid var(--line); color:var(--ink-soft); font-family:var(--font-mono); font-size:10px; text-transform:uppercase;">
                <th style="padding:8px 0; font-weight:600;">Periodo</th>
                <th style="padding:8px 0; font-weight:600; text-align:center;">Nuovi Iscritti</th>
                <th style="padding:8px 0; font-weight:600; text-align:right;">Entrate Periodo</th>
              </tr>
            </thead>
            <tbody id="subscribersEconomicsBody">
              <!-- Popolata via JS -->
            </tbody>
          </table>
        </div>
      </div>

      <!-- Anagrafica & Ricerca -->
      <div class="panel" style="display:flex; flex-direction:column; gap:16px;">
        <div>
          <div class="panel-title" style="display:flex; justify-content:space-between; align-items:center;">
            <span style="display:flex; align-items:center; gap:8px;">
              <span class="material-symbols-rounded" style="color:var(--info);">search</span>
              Anagrafica Iscritti
            </span>
            <button id="subRefreshBtn" onclick="onSubscribersRefresh()" style="display:flex; align-items:center; gap:6px; padding:6px 10px; background:var(--bg-elev-2); border:1px solid var(--line-strong); border-radius:5px; color:var(--ink-soft); font-size:11.5px; font-family:var(--font-body); cursor:pointer; transition:all 0.15s; font-weight:500;">
              <span class="material-symbols-rounded" style="font-size:15px; transition: transform 0.5s ease;" id="subRefreshIcon">sync</span>
              <span>Aggiorna Dati</span>
            </button>
          </div>
          <div class="panel-sub">Elenco completo e ricerca degli iscritti al progetto</div>
        </div>

        <!-- Search Input -->
        <div style="position:relative;">
          <input type="text" id="subSearchInput" placeholder="Cerca per nome, cognome o username Telegram..." oninput="onSubscribersSearch()" style="width:100%; padding:10px 14px 10px 38px; background:var(--bg-elev-2); border:1px solid var(--line-strong); border-radius:6px; color:var(--ink); font-size:13px; font-family:var(--font-body); outline:none; transition:border-color 0.15s;">
          <span class="material-symbols-rounded" style="position:absolute; left:12px; top:10px; font-size:18px; color:var(--ink-mute);">search</span>
        </div>

        <!-- Tabella Completa -->
        <div style="overflow-x:auto; flex-grow:1;">
          <table style="width:100%; border-collapse:collapse; font-size:12px; text-align:left;">
            <thead>
              <tr style="border-bottom:1px solid var(--line); color:var(--ink-soft); font-family:var(--font-mono); font-size:10px; text-transform:uppercase;">
                <th style="padding:8px 0; font-weight:600;">Data</th>
                <th style="padding:8px 0; font-weight:600;">Nome & Cognome</th>
                <th style="padding:8px 0; font-weight:600; text-align:center;">Donazione</th>
                <th style="padding:8px 0; font-weight:600; text-align:right;">Telegram</th>
              </tr>
            </thead>
            <tbody id="subscribersTableBody">
              <!-- Popolata via JS -->
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--line); padding-top:12px; font-family:var(--font-mono); font-size:11px; color:var(--ink-mute);">
          <span id="subPaginationInfo">Mostrando 1-10 di 0</span>
          <div style="display:flex; gap:8px;">
            <button class="nav-btn" id="subPrevBtn" onclick="onSubscribersPrevPage()" style="padding:4px 8px; font-size:11px; min-height:0; height:26px;"><span class="material-symbols-rounded" style="font-size:14px;">chevron_left</span>Prec</button>
            <button class="nav-btn" id="subNextBtn" onclick="onSubscribersNextPage()" style="padding:4px 8px; font-size:11px; min-height:0; height:26px;">Succ<span class="material-symbols-rounded" style="font-size:14px;">chevron_right</span></button>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Renderizza lo stato di Errore Generico
function renderSubscribersError() {
  const container = document.querySelector('section[data-tab="acquisizioni"]');
  if (!container) return;
  
  container.innerHTML = `
    <div style="max-width:480px;margin:80px auto;text-align:center;padding:40px 30px;background:var(--bg-elev);border:1px solid var(--line);border-radius:12px;">
      <span class="material-symbols-rounded" style="font-size:56px;color:var(--neg);margin-bottom:20px;display:block;">error</span>
      <h3 style="font-size:18px;font-weight:600;color:var(--ink);margin-bottom:12px;">Errore caricamento dati</h3>
      <p style="font-size:13px;color:var(--ink-soft);line-height:1.5;margin-bottom:24px;">Si è verificato un errore nel recupero delle informazioni degli iscritti da Google Sheets. Verifica la configurazione del backend o riprova più tardi.</p>
      <button class="nav-btn" onclick="location.reload()" style="width:100%;justify-content:center;padding:11px 0;">Ricarica la pagina</button>
    </div>
  `;
}

// Popola i KPI e inizializza la tabella degli iscritti
function renderSubscribersKPIs(data) {
  if (!data || !data.subscribers) return;
  const list = data.subscribers;
  
  const total = list.length;
  const revenue = list.reduce((acc, s) => acc + (s.amount !== undefined ? s.amount : 15), 0);
  
  const today = new Date();
  
  // 1. Entrate oggi (giornaliero)
  const dailyRevenue = list.filter(s => {
    if (!s.date) return false;
    const d = new Date(s.date);
    return d.getDate() === today.getDate() &&
           d.getMonth() === today.getMonth() &&
           d.getFullYear() === today.getFullYear();
  }).reduce((acc, s) => acc + (s.amount !== undefined ? s.amount : 15), 0);
  
  // 2. Entrate settimana (Lun - Dom corrente)
  const dayOfWeek = today.getDay();
  const distanceToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const mondayOfThisWeek = new Date(today);
  mondayOfThisWeek.setDate(today.getDate() - distanceToMonday);
  mondayOfThisWeek.setHours(0, 0, 0, 0);
  
  const sundayOfThisWeek = new Date(mondayOfThisWeek);
  sundayOfThisWeek.setDate(mondayOfThisWeek.getDate() + 6);
  sundayOfThisWeek.setHours(23, 59, 59, 999);
  
  const weeklyRevenue = list.filter(s => {
    if (!s.date) return false;
    const d = new Date(s.date);
    return d.getTime() >= mondayOfThisWeek.getTime() && d.getTime() <= sundayOfThisWeek.getTime();
  }).reduce((acc, s) => acc + (s.amount !== undefined ? s.amount : 15), 0);
  
  // 3. Entrate mese (mese corrente)
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();
  const monthlyRevenue = list.filter(s => {
    if (!s.date) return false;
    const d = new Date(s.date);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  }).reduce((acc, s) => acc + (s.amount !== undefined ? s.amount : 15), 0);
  
  // Assegnazione valori agli elementi
  const elTotal = document.getElementById('sub-total');
  const elRevenue = document.getElementById('sub-revenue');
  const elToday = document.getElementById('sub-today');
  const elWeek = document.getElementById('sub-week');
  const elMonth = document.getElementById('sub-month');
  
  if (elTotal) elTotal.textContent = total.toLocaleString('it-IT');
  if (elRevenue) elRevenue.textContent = revenue.toLocaleString('it-IT') + ' €';
  if (elToday) elToday.textContent = dailyRevenue.toLocaleString('it-IT') + ' €';
  if (elWeek) elWeek.textContent = weeklyRevenue.toLocaleString('it-IT') + ' €';
  if (elMonth) elMonth.textContent = monthlyRevenue.toLocaleString('it-IT') + ' €';
  
  subFilteredList = [...list];
  subCurrentPage = 1;
  
  renderSubscribersTablePage();
}

// Paginazione e visualizzazione tabella anagrafica
function renderSubscribersTablePage() {
  const tbody = document.getElementById('subscribersTableBody');
  if (!tbody) return;
  
  const totalItems = subFilteredList.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / subPageSize));
  
  if (subCurrentPage > totalPages) subCurrentPage = totalPages;
  if (subCurrentPage < 1) subCurrentPage = 1;
  
  const startIdx = (subCurrentPage - 1) * subPageSize;
  const endIdx = Math.min(startIdx + subPageSize, totalItems);
  const pageItems = subFilteredList.slice(startIdx, endIdx);
  
  if (totalItems === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="padding:16px 0;color:var(--ink-mute);text-align:center;">Nessun iscritto corrisponde ai filtri di ricerca.</td></tr>`;
    document.getElementById('subPaginationInfo').textContent = `Mostrando 0-0 di 0`;
    document.getElementById('subPrevBtn').disabled = true;
    document.getElementById('subNextBtn').disabled = true;
    return;
  }
  
  tbody.innerHTML = pageItems.map(s => {
    const dateStr = s.date ? new Date(s.date).toLocaleDateString('it-IT', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'}) : '—';
    const tgUsername = s.telegram ? `<a href="https://t.me/${s.telegram.replace('@','')}" target="_blank" style="color:var(--info);text-decoration:none;">${s.telegram}</a>` : 'Non inserito';
    const amountVal = s.amount !== undefined ? `${s.amount.toLocaleString('it-IT')} €` : '15 €';
    return `
      <tr style="border-bottom:1px solid var(--line); transition:background 0.15s;">
        <td style="padding:11px 0;color:var(--ink-soft);font-family:var(--font-mono);font-size:11.5px;">${dateStr}</td>
        <td style="padding:11px 0;color:var(--ink);font-weight:500;">${s.name}</td>
        <td style="padding:11px 0;text-align:center;color:var(--ink);font-family:var(--font-mono);">${amountVal}</td>
        <td style="padding:11px 0;text-align:right;font-family:var(--font-mono);font-size:12px;">${tgUsername}</td>
      </tr>
    `;
  }).join('');
  
  document.getElementById('subPaginationInfo').textContent = `Mostrando ${startIdx + 1}-${endIdx} di ${totalItems}`;
  document.getElementById('subPrevBtn').disabled = (subCurrentPage === 1);
  document.getElementById('subNextBtn').disabled = (subCurrentPage === totalPages);
}

// Funzione di ricerca degli iscritti
function onSubscribersSearch() {
  const query = document.getElementById('subSearchInput').value.toLowerCase().trim();
  const allSubscribers = (window.CACHED_SUBSCRIBERS && window.CACHED_SUBSCRIBERS.subscribers) || [];
  
  if (!query) {
    subFilteredList = [...allSubscribers];
  } else {
    subFilteredList = allSubscribers.filter(s => 
      (s.name && s.name.toLowerCase().includes(query)) || 
      (s.telegram && s.telegram.toLowerCase().includes(query))
    );
  }
  
  subCurrentPage = 1;
  renderSubscribersTablePage();
}

function onSubscribersPrevPage() {
  if (subCurrentPage > 1) {
    subCurrentPage--;
    renderSubscribersTablePage();
  }
}

function onSubscribersNextPage() {
  const totalItems = subFilteredList.length;
  const totalPages = Math.ceil(totalItems / subPageSize);
  if (subCurrentPage < totalPages) {
    subCurrentPage++;
    renderSubscribersTablePage();
  }
}

// Cambio tipo di visualizzazione Economics (Mensile vs Settimanale)
function onSubscribersPeriodChange() {
  renderSubscribersChart();
}

// Aggiorna solo la parte degli iscritti interrogando l'API
async function onSubscribersRefresh() {
  const btns = [document.getElementById('subRefreshBtn'), document.getElementById('subRefreshBtnTop')].filter(Boolean);
  const icons = [document.getElementById('subRefreshIcon'), document.getElementById('subRefreshIconTop')].filter(Boolean);
  
  if (btns.length > 0 && btns[0].disabled) return;
  
  btns.forEach(btn => {
    btn.disabled = true;
    btn.style.opacity = '0.7';
  });
  
  icons.forEach(icon => {
    if (!document.getElementById('sub-spin-style')) {
      const style = document.createElement('style');
      style.id = 'sub-spin-style';
      style.innerHTML = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
      document.head.appendChild(style);
    }
    icon.style.animation = 'spin 1s linear infinite';
  });
  
  let savedSecret = '';
  try { savedSecret = sessionStorage.getItem('publish_secret') || localStorage.getItem('publish_secret') || ''; } catch(e) {}
  
  try {
    const subRes = await fetch(`${BACKEND_BASE}/api/subscribers`, {
      headers: { 'X-Publish-Secret': savedSecret }
    });
    if (subRes.ok) {
      const subData = await subRes.json();
      if (subData && Array.isArray(subData.subscribers)) {
        window.CACHED_SUBSCRIBERS = subData;
        renderSubscribersKPIs(subData);
        renderSubscribersChart();
        
        // Animazione successo sui bottoni
        btns.forEach(btn => {
          const textSpan = btn.querySelector('span:not(.material-symbols-rounded)');
          if (textSpan) {
            const oldText = textSpan.textContent;
            textSpan.textContent = 'Aggiornato!';
            const oldBorder = btn.style.borderColor;
            const oldColor = btn.style.color;
            btn.style.borderColor = 'var(--pos)';
            btn.style.color = 'var(--pos)';
            setTimeout(() => {
              textSpan.textContent = oldText;
              btn.style.borderColor = oldBorder;
              btn.style.color = oldColor;
            }, 2000);
          }
        });
      }
    }
  } catch(e) {
    console.error('Errore durante l\'aggiornamento degli iscritti:', e);
  } finally {
    btns.forEach(btn => {
      btn.disabled = false;
      btn.style.opacity = '1';
    });
    icons.forEach(icon => {
      icon.style.animation = 'none';
      icon.style.transform = 'none';
    });
  }
}

// Renderizza il grafico e la tabella Economics per periodo
function renderSubscribersChart() {
  const canvas = document.getElementById('chartSubscribers');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  if (window.subscribersChartInstance) {
    window.subscribersChartInstance.destroy();
    window.subscribersChartInstance = null;
  }
  
  const data = window.CACHED_SUBSCRIBERS;
  if (!data || !data.subscribers || data.unauthorized || data.error) return;
  
  const list = data.subscribers;
  const viewType = document.getElementById('subPeriodType').value; // 'daily' | 'weekly' | 'monthly'
  
  const groups = {}; // Raggruppamento dati (conteggi)
  const groupRevenues = {}; // Somma entrate per periodo
  
  if (viewType === 'daily') {
    list.forEach(s => {
      if (!s.date) return;
      const dKey = s.date.slice(0, 10); // YYYY-MM-DD
      groups[dKey] = (groups[dKey] || 0) + 1;
      groupRevenues[dKey] = (groupRevenues[dKey] || 0) + (s.amount !== undefined ? s.amount : 15);
    });
  } else if (viewType === 'monthly') {
    list.forEach(s => {
      if (!s.date) return;
      const mKey = s.date.slice(0, 7); // YYYY-MM
      groups[mKey] = (groups[mKey] || 0) + 1;
      groupRevenues[mKey] = (groupRevenues[mKey] || 0) + (s.amount !== undefined ? s.amount : 15);
    });
  } else {
    list.forEach(s => {
      if (!s.date) return;
      const d = new Date(s.date);
      const wk = getSubWeekNumber(d);
      const wKey = `${wk.year}-W${String(wk.week).padStart(2,'0')}`;
      groups[wKey] = (groups[wKey] || 0) + 1;
      groupRevenues[wKey] = (groupRevenues[wKey] || 0) + (s.amount !== undefined ? s.amount : 15);
    });
  }
  
  let sortedPeriods = Object.keys(groups).sort();
  if (viewType === 'daily' && sortedPeriods.length > 30) {
    // Limitiamo agli ultimi 30 giorni sul grafico per leggibilità
    sortedPeriods = sortedPeriods.slice(-30);
  }
  
  const labels = sortedPeriods.map(p => {
    if (viewType === 'daily') {
      const parts = p.split('-'); // [YYYY, MM, DD]
      const monthsAbbr = {
        '01': 'Gen', '02': 'Feb', '03': 'Mar', '04': 'Apr', '05': 'Mag', '06': 'Giu',
        '07': 'Lug', '08': 'Ago', '09': 'Set', '10': 'Ott', '11': 'Nov', '12': 'Dic'
      };
      return `${parts[2]} ${monthsAbbr[parts[1]] || parts[1]}`;
    } else if (viewType === 'monthly') {
      const parts = p.split('-');
      return SUB_MONTHS_IT[parts[1]] + ' ' + parts[0].slice(-2);
    } else {
      const parts = p.split('-W');
      return `Sett. ${parts[1]} (${parts[0].slice(-2)})`;
    }
  });
  
  const counts = sortedPeriods.map(p => groups[p]);
  
  const grad = ctx.createLinearGradient(0, 0, 0, 200);
  grad.addColorStop(0, 'rgba(255,140,30,0.5)'); // accent
  grad.addColorStop(1, 'rgba(255,140,30,0.05)');
  
  window.subscribersChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Nuovi Iscritti',
          data: counts,
          backgroundColor: grad,
          borderColor: '#ff8c1e',
          borderWidth: 1.5,
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1c212b',
          borderColor: '#ff8c1e',
          borderWidth: 1,
          titleColor: '#ffa53c',
          bodyColor: '#f5f5f5',
          titleFont: { family: 'Inter', size: 11 },
          bodyFont: { family: 'Inter', size: 12 },
          padding: 10,
          callbacks: {
            label: c => {
              const period = sortedPeriods[c.dataIndex];
              const count = counts[c.dataIndex];
              const rev = groupRevenues[period] || 0;
              return `Nuovi Iscritti: ${count} (${rev.toLocaleString('it-IT')} €)`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            font: { size: 10, family: 'Inter' },
            color: '#5a5c64'
          },
          grid: { display: false },
          border: { color: 'rgba(255,255,255,0.06)' }
        },
        y: {
          ticks: {
            font: { size: 10, family: 'Inter' },
            color: '#5a5c64',
            stepSize: Math.max(1, Math.ceil(Math.max(...counts) / 5))
          },
          grid: { color: 'rgba(255,255,255,0.04)' },
          border: { display: false }
        }
      }
    }
  });
  
  const ecoBody = document.getElementById('subscribersEconomicsBody');
  if (ecoBody) {
    if (sortedPeriods.length === 0) {
      ecoBody.innerHTML = `<tr><td colspan="3" style="padding:16px 0;color:var(--ink-mute);text-align:center;">Nessun dato economico disponibile.</td></tr>`;
      return;
    }
    
    const reversedPeriods = [...sortedPeriods].reverse();
    ecoBody.innerHTML = reversedPeriods.map(p => {
      let label = '';
      if (viewType === 'daily') {
        const parts = p.split('-');
        const monthsNames = {
          '01': 'Gennaio', '02': 'Febbraio', '03': 'Marzo', '04': 'Aprile', '05': 'Maggio', '06': 'Giugno',
          '07': 'Luglio', '08': 'Agosto', '09': 'Settembre', '10': 'Ottobre', '11': 'Novembre', '12': 'Dicembre'
        };
        label = `${parts[2]} ${monthsNames[parts[1]] || parts[1]} ${parts[0]}`;
      } else if (viewType === 'monthly') {
        label = SUB_MONTHS_IT[p.split('-')[1]] + ' ' + p.split('-')[0];
      } else {
        label = `Settimana ${p.split('-W')[1]} (${p.split('-')[0]})`;
      }
      const count = groups[p];
      const revenue = groupRevenues[p] || 0;
      
      return `
        <tr style="border-bottom:1px solid var(--line); font-size:12px;">
          <td style="padding:9px 0;color:var(--ink); font-weight:500;">${label}</td>
          <td style="padding:9px 0;text-align:center;color:var(--ink-soft);font-family:var(--font-mono);">${count}</td>
          <td style="padding:9px 0;text-align:right;color:var(--pos);font-weight:600;font-family:var(--font-mono);">+${revenue.toLocaleString('it-IT')} €</td>
        </tr>
      `;
    }).join('');
  }
}

function renderLatest(posts) {
  const list = document.getElementById('latestList');
  list.innerHTML = '';
  const sorted = [...posts].sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 5);
  const allReaches = posts.map(p => p.media_reach || 0);
  const median = computeMedian(allReaches);
  const collabSet = getCollabSet();
  sorted.forEach(p => {
    const d = new Date(p.timestamp);
    const t = normalizeType(p.media_type);
    const reach = p.media_reach || 0;
    const eng = p.media_engagement || 0;
    const er = reach > 0 ? (eng/reach)*100 : 0;
    const pi = findPi(reach, median);
    const piCls = piClass(pi);
    const cardCls = pi >= 1.5 ? 'strong' : pi >= 0.8 ? '' : 'weak';
    const isCollab = collabSet.has(p.media_id);
    const card = document.createElement('div');
    card.className = `latest-card ${cardCls}`;
    card.innerHTML = `
      <div class="latest-meta">
        <span class="latest-date">${fmtDate(d)}</span>
        <span class="latest-fmt ${t}">${t.toLowerCase()}</span>
        <span class="latest-pi ${piCls}">${pi.toFixed(2)}× PI</span>
        ${isCollab ? '<span class="latest-collab">↗ collab</span>' : ''}
        <label style="font-family:var(--font-mono);font-size:10px;color:var(--ink-mute);display:flex;align-items:center;gap:4px;cursor:pointer;margin-top:2px;">
          <input type="checkbox" data-collab="${p.media_id}" ${isCollab?'checked':''} style="cursor:pointer;accent-color:var(--accent);">
          marca collab
        </label>
      </div>
      <div class="latest-content">
        <div class="latest-caption">${shortCaption(p.media_caption)}</div>
        <a class="latest-link" href="${p.media_permalink}" target="_blank" rel="noopener"><svg class="brand-ico ig" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg> Apri su Instagram</a>
      </div>
      <div class="latest-stats">
        <div class="latest-stat"><span class="latest-stat-label">Reach</span><span class="latest-stat-val${pi>=1.5?' accent':''}">${numIt(reach)}</span></div>
        <div class="latest-stat"><span class="latest-stat-label">Eng</span><span class="latest-stat-val">${numIt(eng)}</span></div>
        <div class="latest-stat"><span class="latest-stat-label">ER</span><span class="latest-stat-val">${pct1(er)}</span></div>
        <div class="latest-stat"><span class="latest-stat-label">Like</span><span class="latest-stat-val">${numIt(p.media_like_count||0)}</span></div>
        <div class="latest-stat"><span class="latest-stat-label">Comm</span><span class="latest-stat-val">${numIt(p.media_comments_count||0)}</span></div>
        <div class="latest-stat"><span class="latest-stat-label">Save</span><span class="latest-stat-val">${numIt(p.media_saved||0)}</span></div>
      </div>`;
    list.appendChild(card);
  });
  // Bind checkbox collab
  list.querySelectorAll('input[data-collab]').forEach(cb => {
    cb.addEventListener('change', (e) => {
      toggleCollab(e.target.dataset.collab);
      // Refresh tutto per riallineare PI/medie con/senza collab
      refreshDataDisplay();
    });
  });
}

function renderTopPostsByFormat(posts) {
  const cont = document.getElementById('topCols');
  cont.innerHTML = '';
  const byType = { IMAGE: [], CAROUSEL: [], REELS: [] };
  posts.forEach(p => {
    const t = normalizeType(p.media_type);
    if (byType[t]) byType[t].push(p);
  });
  const allReaches = posts.map(p => p.media_reach || 0);
  const median = computeMedian(allReaches);
  const collabSet = getCollabSet();
  const types = [
    { key: 'IMAGE', label: 'Top Image' },
    { key: 'CAROUSEL', label: 'Top Carosello' },
    { key: 'REELS', label: 'Top Reel' }
  ];
  types.forEach(({key, label}) => {
    const items = byType[key].sort((a,b) => (b.media_reach||0) - (a.media_reach||0)).slice(0, 5);
    const col = document.createElement('div');
    col.className = 'top-col';
    let html = `
      <div class="top-col-head">
        <div class="top-col-title">${label} <span class="lab-fmt-badge ${key}">${key.toLowerCase()}</span></div>
        <div class="top-col-count">${byType[key].length} tot.</div>
      </div>`;
    if (items.length === 0) {
      html += `<div style="font-family:var(--font-mono);font-size:11px;color:var(--ink-mute);padding:14px 0;text-align:center;">Nessun ${key.toLowerCase()} nel periodo</div>`;
    } else {
      items.forEach(p => {
        const d = new Date(p.timestamp);
        const reach = p.media_reach || 0;
        const pi = findPi(reach, median);
        const isCollab = collabSet.has(p.media_id);
        html += `
          <div class="top-item">
            <div class="top-item-head">
              <div class="top-item-title"><a href="${p.media_permalink}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;">${titleFromCaption(p.media_caption, 60)}</a></div>
              <div class="top-item-reach">${numIt(reach)}</div>
            </div>
            <div class="top-item-foot">
              <span class="top-item-date">${fmtDate(d)}</span>
              <span class="top-item-pi ${piClass(pi)}">${pi.toFixed(2)}× PI</span>
              ${isCollab ? '<span class="top-item-collab">↗ collab</span>' : ''}
            </div>
          </div>`;
      });
    }
    col.innerHTML = html;
    cont.appendChild(col);
  });
}

function renderFormatTable(posts) {
  const byT = {};
  posts.forEach(p => {
    const t = normalizeType(p.media_type);
    if (!byT[t]) byT[t] = [];
    byT[t].push(p);
  });
  const tbody = document.getElementById('fmtTable');
  tbody.innerHTML = '';
  const order = ['IMAGE','CAROUSEL','REELS'];
  const stats = order.map(t => {
    const items = byT[t] || [];
    const n = items.length;
    if (n === 0) return null;
    return {
      t, n,
      reach: items.reduce((s,p)=>s+(p.media_reach||0),0)/n,
      er: (() => { const vals = items.map(p=>{const r=p.media_reach||0; return r>0?(p.media_engagement||0)/r*100:null;}).filter(v=>v!==null); return vals.length ? vals.reduce((s,v)=>s+v,0)/vals.length : 0; })(),
      save: items.reduce((s,p)=>s+(p.media_saved||0),0)/n,
      share: items.reduce((s,p)=>s+(p.media_shares||0),0)/n,
      comm: items.reduce((s,p)=>s+(p.media_comments_count||0),0)/n,
    };
  }).filter(Boolean);
  if (stats.length === 0) return;
  const fields = ['reach','er','save','share','comm'];
  const maxV = {}, minV = {};
  fields.forEach(f => { maxV[f] = Math.max(...stats.map(s=>s[f])); minV[f] = Math.min(...stats.map(s=>s[f])); });
  stats.forEach(s => {
    const tr = document.createElement('tr');
    const cls = (v, f) => v === maxV[f] && stats.length>1 ? 'best' : v === minV[f] && stats.length>1 ? 'weak' : '';
    tr.innerHTML = `
      <td><span class="lab-fmt-badge ${s.t}">${s.t.toLowerCase()}</span></td>
      <td class="num">${s.n}</td>
      <td class="num ${cls(s.reach,'reach')}">${numIt(s.reach)}</td>
      <td class="num ${cls(s.er,'er')}">${pct1(s.er)}</td>
      <td class="num ${cls(s.save,'save')}">${s.save.toFixed(1)}</td>
      <td class="num ${cls(s.share,'share')}">${s.share.toFixed(1)}</td>
      <td class="num ${cls(s.comm,'comm')}">${s.comm.toFixed(1)}</td>`;
    tbody.appendChild(tr);
  });
}

function renderEngagementMix(posts) {
  const tl = posts.reduce((s,p)=>s+(p.media_like_count||0),0);
  const tc = posts.reduce((s,p)=>s+(p.media_comments_count||0),0);
  const ts = posts.reduce((s,p)=>s+(p.media_saved||0),0);
  const th = posts.reduce((s,p)=>s+(p.media_shares||0),0);
  const tot = tl+tc+ts+th;
  if (tot === 0) return;
  const pct = v => (v/tot*100).toFixed(1);
  document.getElementById('mixSub').textContent = `Come si distribuiscono le ${numIt(tot)} interazioni`;
  document.getElementById('mixBar').innerHTML = `
    <div class="lab-mix-bar" style="width:${pct(tl)}%; background:#ff8c1e;">Like ${pct(tl)}%</div>
    <div class="lab-mix-bar" style="width:${pct(th)}%; background:#5aaef0;">Share ${pct(th)}%</div>
    <div class="lab-mix-bar" style="width:${pct(tc)}%; background:#36c976;">Comm ${pct(tc)}%</div>
    <div class="lab-mix-bar" style="width:${pct(ts)}%; background:#a0a0a8;">Save ${pct(ts)}%</div>`;
  document.getElementById('mixLegend').innerHTML = `
    <span><i style="background:#ff8c1e"></i>${numIt(tl)} like</span>
    <span><i style="background:#5aaef0"></i>${numIt(th)} share</span>
    <span><i style="background:#36c976"></i>${numIt(tc)} comm</span>
    <span><i style="background:#a0a0a8"></i>${numIt(ts)} save</span>`;
}

