// ============================================================================
// js/01-api.js — Backend API helpers, caching e autenticazione
// Dipendenze: nessuna. Caricato PRIMA di tutto.
// ============================================================================

// Variabili globali condivise tra i moduli del frontend
let CACHED = { daily: null, posts: null, profile: null };
let calPublishedPosts = [];





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

// Caching helper iper-veloce (Stale-While-Revalidate) per rendering istantaneo 0ms
async function fetchCachedBackend(endpoint, cacheKey, ttlMs = 3600 * 1000) {
  const now = Date.now();
  let cachedData = null;

  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      cachedData = parsed.data;
      // Se la cache è valida dentro il TTL, la usiamo subito senza rifare la fetch
      if (now - parsed.timestamp < ttlMs) {
        return cachedData;
      }
    }
  } catch(e) {
    console.warn(`Errore lettura cache per ${endpoint}:`, e);
  }

  // Se abbiamo una cache (anche se scaduta), la restituiamo subito per un rendering ISTANTANEO (0ms)
  // ed eseguiamo il re-fetch in background senza bloccare la UI dell'utente.
  if (cachedData) {
    fetchBackend(endpoint).then(freshData => {
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data: freshData }));
      } catch(e) {}
    }).catch(e => console.warn(`Re-fetch background fallito per ${endpoint}:`, e));

    return cachedData;
  }

  // Se è la prima volta assoluta (nessuna cache), facciamo la fetch sincrona
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

