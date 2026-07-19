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

// Chiama un endpoint del backend Vercel e restituisce il JSON.
async function fetchBackend(path) {
  const url = `${BACKEND_BASE}${path}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} — ${body.slice(0, 200)}`);
  }
  const j = await res.json();
  if (j && j.error) throw new Error(j.error);
  return j;
}

// Caching helper per velocizzare il caricamento della dashboard
async function fetchCachedBackend(endpoint, cacheKey, ttlMs = 3600 * 1000) {
  const now = Date.now();
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (now - parsed.timestamp < ttlMs) {
        console.log(`Caricato da cache: ${endpoint}`);
        return parsed.data;
      }
    }
  } catch(e) {
    console.warn(`Errore cache per ${endpoint}:`, e);
  }
  
  const freshData = await fetchBackend(endpoint);
  try {
    localStorage.setItem(cacheKey, JSON.stringify({
      timestamp: now,
      data: freshData
    }));
  } catch(e) {
    console.warn(`Errore scrittura cache per ${endpoint}:`, e);
  }
  return freshData;
}

// Forza il ricaricamento completo svuotando la cache locale
async function forceRefreshAllAnalytics(event) {
  if (event) event.preventDefault();
  
  const links = [document.getElementById('btnForceRefreshAll'), document.getElementById('btnForceRefreshAllTop')].filter(Boolean);
  const icons = [document.getElementById('iconForceRefreshAll'), document.getElementById('iconForceRefreshAllTop')].filter(Boolean);
  
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

