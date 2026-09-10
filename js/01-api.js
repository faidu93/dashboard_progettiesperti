// ============================================================================
// js/01-api.js — Backend API helpers, caching e autenticazione
// Dipendenze: nessuna. Caricato PRIMA di tutto.
// ============================================================================

// Variabili globali condivise tra i moduli del frontend
let CACHED = { daily: null, posts: null, profile: null };
let calPublishedPosts = [];

// ============================================================================
// TOAST — notifiche non bloccanti (sostituiscono i popup alert() di sistema)
// ============================================================================
function toast(message, type = 'info', duration = 3800) {
  let host = document.getElementById('toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    (document.body || document.documentElement).appendChild(host);
  }
  const el = document.createElement('div');
  el.className = 'toast toast-' + type;
  el.setAttribute('role', 'status');
  const icons = { ok: 'check_circle', error: 'error', warn: 'warning', info: 'info' };
  const ico = document.createElement('span');
  ico.className = 'material-symbols-rounded';
  ico.textContent = icons[type] || icons.info;
  const txt = document.createElement('span');
  txt.textContent = String(message);
  el.appendChild(ico); el.appendChild(txt);
  host.appendChild(el); // l'animazione d'ingresso parte da sola (CSS)
  const close = () => { el.classList.add('toast-out'); setTimeout(() => el.remove(), 240); };
  const t = setTimeout(close, duration);
  el.addEventListener('click', () => { clearTimeout(t); close(); });
}

// Reindirizza i vecchi alert() bloccanti sui toast, con tipo dedotto dal testo.
(function () {
  const nativeAlert = window.alert ? window.alert.bind(window) : function () {};
  window.alert = function (msg) {
    try {
      const s = String(msg);
      let type = 'info';
      if (/success|✅|⚡.*(pubblicat|complet)|programmat/i.test(s)) type = 'ok';
      else if (/errore|fallit|non valid|mancante|scadut|non riuscit|non disponibil|non sei conness|non ancora/i.test(s)) type = 'error';
      else if (/⚠️|attenzione|riprova/i.test(s)) type = 'warn';
      toast(s, type, type === 'error' ? 5200 : 3800);
    } catch (e) { nativeAlert(msg); }
  };
})();





// URL del backend Vercel. Configurabile via localStorage senza modificare il file:
// localStorage.setItem('backend_base', 'https://...')
const BACKEND_BASE = (() => {
  try { return localStorage.getItem('backend_base') || 'https://dashboard-esperti-backend.vercel.app'; }
  catch(e) { return 'https://dashboard-esperti-backend.vercel.app'; }
})();

// Wrapper attorno a fetch() con retry automatico e backoff — pensato per
// connessioni mobile ballerine (4G in giro, wifi che cade un attimo): un
// singolo blip di rete non deve più costringere l'utente a premere "Riprova"
// a mano. Riprova solo su errori di rete/timeout, MAI su risposte HTTP valide
// (401/404/500 non sono blip, sono errori reali da mostrare subito).
async function fetchWithRetry(url, opts = {}, retries = 2, delayMs = 700) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(url, opts);
    } catch (e) {
      if (attempt >= retries) throw e;
      await new Promise(r => setTimeout(r, delayMs * (attempt + 1)));
    }
  }
}

// Chiama un endpoint del backend Vercel e restituisce il JSON.
async function fetchBackend(path) {
  const url = `${BACKEND_BASE}${path}`;
  const res = await fetchWithRetry(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} — ${body.slice(0, 200)}`);
  }
  const j = await res.json();
  if (j && j.error) throw new Error(j.error);
  return j;
}

// Caching helper Stale-While-Revalidate: rende SUBITO l'ultima copia locale
// (0ms) e, se è più vecchia di `revalidateMs`, rifà la chiamata in background.
// Quando i dati freschi sono DIVERSI da quelli in cache, aggiorna localStorage
// e avvisa la app via window.__onDataRevalidated(cacheKey) così può ri-disegnare
// la sezione senza che l'utente debba premere "Aggiorna".
//   ttlMs        = oltre questo la cache è "scaduta" (comunque mostrata, ma il
//                  refetch parte sempre)
//   revalidateMs = entro questo la cache è "abbastanza fresca": nessun refetch,
//                  per non martellare il backend a ogni cambio tab
async function fetchCachedBackend(endpoint, cacheKey, ttlMs = 3600 * 1000, revalidateMs = 90 * 1000) {
  const now = Date.now();
  let cachedData = null;
  let cachedRaw = null;
  let age = Infinity;

  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      cachedData = parsed.data;
      cachedRaw = JSON.stringify(parsed.data);
      age = now - parsed.timestamp;
    }
  } catch(e) {
    console.warn(`Errore lettura cache per ${endpoint}:`, e);
  }

  if (cachedData) {
    // Refetch in background solo se la copia locale non è già fresca fresca.
    if (age >= revalidateMs) {
      fetchBackend(endpoint).then(freshData => {
        let changed = true;
        try {
          changed = JSON.stringify(freshData) !== cachedRaw;
          localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data: freshData }));
        } catch(e) {}
        if (changed && typeof window.__onDataRevalidated === 'function') {
          try { window.__onDataRevalidated(cacheKey); } catch(e) {}
        }
      }).catch(e => console.warn(`Re-fetch background fallito per ${endpoint}:`, e));
    }
    return cachedData; // rendering ISTANTANEO con l'ultima copia
  }

  // Prima volta assoluta (nessuna cache): fetch sincrona.
  const freshData = await fetchBackend(endpoint);
  try {
    localStorage.setItem(cacheKey, JSON.stringify({ timestamp: now, data: freshData }));
  } catch(e) {}
  return freshData;
}

// Forza il ricaricamento completo svuotando la cache locale
async function forceRefreshAllAnalytics(event) {
  if (event) event.preventDefault();
  
  const links = [document.getElementById('btnForceRefreshAllTop')].filter(Boolean);
  const icons = [document.getElementById('iconForceRefreshAllTop')].filter(Boolean);
  
  if (links.length > 0 && links[0].dataset.loading === 'true') return;
  
  links.forEach(link => {
    link.dataset.loading = 'true';
    link.style.opacity = '0.7';
    link.style.pointerEvents = 'none';
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
  
  localStorage.removeItem('cache_ig_insights');
  localStorage.removeItem('cache_yt_videos');
  localStorage.removeItem('cache_ig_demo');
  
  try {
    await init();
  } catch(e) {
    console.error('Errore durante il refresh forzato:', e);
  } finally {
    links.forEach(link => {
      link.dataset.loading = 'false';
      link.style.opacity = '1';
      link.style.pointerEvents = 'auto';
    });
    icons.forEach(icon => {
      icon.style.animation = 'none';
    });
  }
}

