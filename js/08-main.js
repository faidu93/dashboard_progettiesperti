// ============================================================================
// js/08-main.js — Funzione init() e event listeners. Entry point dell'app.
// Dipendenze: tutti i file precedenti (01-07).
// ============================================================================

async function init(opts) {
  // silent = true → ricarica in background (stale-while-revalidate): niente
  // overlay di caricamento, niente ri-setup degli eventi, solo ri-rendering
  // con i dati freschi arrivati nel frattempo.
  const silent = !!(opts && opts.silent);

  if (silent) {
    try { document.getElementById('loadingLog').innerHTML = ''; } catch(e) {}
  } else {
    loadingStart();
    loadingStep('setup', 'Configurazione interfaccia…');
  }

  // Attiva tab calendario subito
  document.querySelectorAll('section[data-tab="calendario"]').forEach(s => s.classList.add('tab-active'));
  updateOnboarding();
  if (!silent) setStatus('', 'Caricamento dati…');
  // CRITICAL: setup eventi PRIMA del fetch — così i bottoni funzionano anche se
  // il backend fallisce. In silent NON va rifatto (raddoppierebbe i listener).
  if (!silent) {
    calSetupEvents();
  }
  calRender();

  // Scorciatoie dall'icona PWA (manifest.json "shortcuts"): ?shortcut=pianifica
  // apre subito il modal nuovo post, ?shortcut=aste salta dritto alla tab Aste.
  // Solo azioni DOM, nessuna dipendenza dal fetch dati che segue.
  const params = new URLSearchParams(location.search);
  const shortcut = silent ? null : params.get('shortcut');
  const isSharedFile = silent ? false : params.get('shared') === '1';
  if (shortcut === 'pianifica') {
    setTimeout(() => {
      calOpenModal(null, null);
      if (isSharedFile) loadSharedFileIntoModal();
    }, 50);
  } else if (shortcut === 'aste') {
    const asteTabBtn = document.querySelector('.tab-btn[data-tab="aste"]');
    if (asteTabBtn) tabSwitch(asteTabBtn);
  }
  // Ripulisco l'URL: senza questo, un refresh della pagina riaprirebbe sempre
  // lo stesso file condiviso.
  if (shortcut || isSharedFile) {
    history.replaceState(null, '', location.pathname);
  }
  let savedSecret = '';
  try { savedSecret = sessionStorage.getItem('publish_secret') || localStorage.getItem('publish_secret') || ''; } catch(e) {}
  if (!silent) {
    if (savedSecret) loadPublishQueue();
    gcalInit(); // Google Calendar init (una volta sola)
    intelRestoreFields(); // ripristina API key e preferenze Intelligence
    if (typeof updateNavCloudinaryBadge === 'function') updateNavCloudinaryBadge();
    loadingDone('setup', 'Interfaccia pronta');
    loadingProgress(10);
  }

  try {
    // 1. Avvio dei fetch in parallelo (concorrenza per caricamento veloce)
    const igPromise = fetchCachedBackend('/api/instagram?type=insights', 'cache_ig_insights')
      .catch(e => {
        console.warn('Errore connessione backend Instagram:', e);
        return { isMock: true, data: generateMockInstagramData() };
      });
      
    const ytPromise = fetchCachedBackend('/api/youtube-videos', 'cache_yt_videos_v2')
      .catch(e => {
        console.warn('YouTube non disponibile:', e);
        return { error: true };
      });

    const demoPromise = fetchCachedBackend('/api/instagram?type=demographics', 'cache_ig_demo')
      .catch(e => {
        console.warn('Dati demografici non disponibili:', e);
        return null;
      });

    const subPromise = savedSecret
      ? fetchWithRetry(`${BACKEND_BASE}/api/subscribers`, { headers: { 'X-Publish-Secret': savedSecret } })
          .then(res => res.ok ? res.json() : (res.status === 401 ? { unauthorized: true } : { error: true }))
          .catch(e => ({ error: true }))
      : Promise.resolve({ unauthorized: true });

    // === FASE 1: Instagram Insights ===
    loadingStep('ig', 'Connessione Instagram Graph API…');
    loadingProgress(15);
    let igResult = await igPromise;
    let ig = igResult.isMock ? igResult.data : igResult;
    let isMockIg = !!igResult.isMock;
    
    if (isMockIg) {
      loadingWarn('ig', 'Instagram non disponibile (uso dati di test)');
    }
    
    const daily = ig.daily || [];
    const posts = ig.posts || [];
    const profile = ig.profile || {};
    daily.sort((a,b) => new Date(a.date) - new Date(b.date));
    CACHED = { daily, posts, profile };
    if (isMockIg) {
      window.IS_USING_MOCK_IG = true;
    } else {
      loadingDone('ig', `Instagram · ${posts.length} post · ${daily.length} giorni`);
    }
    loadingProgress(35);

    renderFreshness(daily);
    calPublishedPosts = posts;
    calRender();

    // === FASE 2: YouTube ===
    loadingStep('yt', 'Caricamento video YouTube…');
    loadingProgress(40);
    const ytResult = await ytPromise;
    if (ytResult && !ytResult.error) {
      const ytRaw = ytResult.data || ytResult.videos || [];
      const ytMap = {};
      ytRaw.forEach(r => {
        const t = r.video_title || 'Video';
        const pubDate = (r.published_at || '').slice(0, 10);
        if (!pubDate) return;
        const key = t + '|' + pubDate;
        if (!ytMap[key]) {
          ytMap[key] = { date: pubDate, title: t, views: 0, likes: 0, videoId: r.video || '', ytType: r.ytType || 'VIDEO' };
        }
        ytMap[key].views += (r.views || 0);
        ytMap[key].likes += (r.likes || 0);
        if (r.video && !ytMap[key].videoId) ytMap[key].videoId = r.video;
        if (r.ytType && r.ytType !== 'VIDEO') ytMap[key].ytType = r.ytType;
      });
      window.ytPublishedVideos = Object.values(ytMap);
      loadingDone('yt', `YouTube · ${window.ytPublishedVideos.length} video caricati`);
    } else {
      loadingWarn('yt', 'YouTube non disponibile (continuo)');
      window.ytPublishedVideos = [];
    }
    ytRender();
    loadingProgress(55);

    // === FASE 3: Rendering KPI e grafici ===
    loadingStep('render', 'Calcolo KPI e grafici…');
    const validPosts = posts.filter(p =>
      (p.media_reach != null && p.media_reach > 0) ||
      (p.media_engagement != null && p.media_engagement > 0) ||
      (p.media_like_count != null && p.media_like_count > 0)
    );
    const ctx = renderKPIs(daily, profile, validPosts, ig.views_total_30d || 0);
    if (ctx) {
      CACHED.period = ctx.period;
      renderWeeks(ctx.period, validPosts);
      renderReachChart(ctx.period);
      renderFollowerAnalysis(daily);
    }
    renderLatest(validPosts);
    renderTopPostsByFormat(validPosts);
    renderFormatTable(validPosts);
    renderEngagementMix(validPosts);
    renderPiList(validPosts);
    renderConversion(CACHED.daily, validPosts);
    renderSlots(validPosts);
    setupWowToggle(validPosts);
    renderDailyActions(daily, validPosts, profile);
    loadingDone('render', `KPI e grafici pronti · ${validPosts.length} post analizzati`);
    loadingProgress(75);

    // === FASE 4: Dati demografici ===
    loadingStep('demo', 'Caricamento demografia e orari…');
    const demo = await demoPromise;
    if (demo) {
      window.CACHED_DEMO = demo;
      renderDemographics(demo);
      renderOnlineFollowers(demo);
      loadingDone('demo', 'Dati demografici e orari attivi');
    } else {
      loadingWarn('demo', 'Dati demografici non disponibili');
    }
    loadingProgress(92);

    // === FASE 5: Dati iscritti (SWR cache per rendering istantaneo 0ms) ===
    loadingStep('subscribers', 'Caricamento dati iscritti…');
    try {
      const cachedSubStr = localStorage.getItem('cached_subscribers_v1');
      if (cachedSubStr) {
        const cachedSub = JSON.parse(cachedSubStr);
        if (cachedSub && Array.isArray(cachedSub.subscribers)) {
          window.CACHED_SUBSCRIBERS = cachedSub;
          renderSubscribersKPIs(cachedSub);
          loadingDone('subscribers', `Iscritti · ${cachedSub.subscribers.length} totali`);
        }
      }
    } catch(e) {}

    const subData = await subPromise;
    if (subData) {
      if (Array.isArray(subData.subscribers)) {
        window.CACHED_SUBSCRIBERS = subData;
        try { localStorage.setItem('cached_subscribers_v1', JSON.stringify(subData)); } catch(e) {}
        renderSubscribersKPIs(subData);
        loadingDone('subscribers', `Iscritti · ${subData.subscribers.length} totali`);
      } else if (subData.unauthorized) {
        window.CACHED_SUBSCRIBERS = { unauthorized: true };
        renderSubscribersUnauthorized();
        loadingDone('subscribers', 'Iscritti · sbloccare con password');
      } else {
        if (!window.CACHED_SUBSCRIBERS || window.CACHED_SUBSCRIBERS.error) {
          window.CACHED_SUBSCRIBERS = { error: true };
          renderSubscribersError();
          loadingWarn('subscribers', 'Iscritti non disponibili');
        }
      }
    } else {
      if (!window.CACHED_SUBSCRIBERS || window.CACHED_SUBSCRIBERS.error) {
        window.CACHED_SUBSCRIBERS = { error: true };
        renderSubscribersError();
        loadingWarn('subscribers', 'Iscritti non disponibili');
      }
    }
    loadingProgress(98);

    const now = new Date();
    document.getElementById('footTime').textContent = now.toLocaleString('it-IT');
    if (window.IS_USING_MOCK_IG) {
      setStatus('error', 'Offline (Dati di test) · ' + now.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}));
    } else {
      setStatus('live', 'Live · ' + now.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}));
    }
    if (silent) { flashDataUpdated(); } else { loadingFinish(true); }
  } catch(e) {
    console.error('Backend error:', e);
    if (!silent) {
      setStatus('error', 'Errore: ' + e.message.slice(0,60));
      loadingStep('error', 'Errore connessione backend: ' + e.message.slice(0, 60), 'error');
      loadingFinish(false);
    }
  }
}

// Piccolo segnale visivo quando un aggiornamento in background ha ridisegnato
// la dashboard: un lampo tenue sul badge "Live" + toast se disponibile.
function flashDataUpdated() {
  const el = document.getElementById('freshness') || document.getElementById('navStatus');
  if (el) {
    el.classList.add('data-flash');
    setTimeout(() => el.classList.remove('data-flash'), 1400);
  }
  if (typeof toast === 'function') toast('Dati aggiornati', 'ok', 2200);
}

// Stale-while-revalidate: quando fetchCachedBackend scopre dati nuovi in
// background, ricarica in silenzio (debounce per aspettare che TUTTe le
// revalidation in corso finiscano prima di ridisegnare una volta sola).
let _swrTimer = null;
window.__onDataRevalidated = function (cacheKey) {
  clearTimeout(_swrTimer);
  _swrTimer = setTimeout(() => {
    init({ silent: true }).catch(e => console.warn('Aggiornamento silenzioso fallito:', e));
  }, 900);
};

document.getElementById('btnConfig').addEventListener('click', () => {
  // Mostro l'URL backend corrente (vuoto = default) e verifico lo stato
  let saved = '';
  try { saved = localStorage.getItem('backend_base') || ''; } catch(e) {}
  document.getElementById('apiKey').value = saved;
  
  // Mostro il modello AI Claude salvato (default claude-sonnet-5)
  let savedModel = '';
  try { savedModel = localStorage.getItem('intel_model') || 'claude-sonnet-5'; } catch(e) {}
  document.getElementById('intelModel').value = savedModel;
  
  // Aggiorno gli indicatori di stato in base ai dati già caricati
  const stIg = document.getElementById('stIg');
  const stYt = document.getElementById('stYt');
  const stDemo = document.getElementById('stDemo');
  if (stIg) stIg.textContent = (CACHED && CACHED.profile && CACHED.profile.followers_count)
    ? `Instagram · attivo (${numIt(CACHED.profile.followers_count)} follower)` : 'Instagram · nessun dato';
  if (stYt) stYt.textContent = (window.ytPublishedVideos && window.ytPublishedVideos.length)
    ? `YouTube · attivo (${window.ytPublishedVideos.length} video)` : 'YouTube · nessun dato';
  if (stDemo) stDemo.textContent = (window.CACHED_DEMO && window.CACHED_DEMO.available)
    ? 'Demografia · attiva' : 'Demografia · in attesa di Meta';

  // Stato Cloudinary (era un badge fisso in barra, ora vive solo qui)
  if (typeof updateNavCloudinaryBadge === 'function') updateNavCloudinaryBadge();

  document.getElementById('modal').classList.add('show');
});
document.getElementById('btnCancel').addEventListener('click', () => document.getElementById('modal').classList.remove('show'));
document.getElementById('btnSave').addEventListener('click', () => {
  const v = document.getElementById('apiKey').value.trim();
  const modelVal = document.getElementById('intelModel').value;
  try {
    if (v) localStorage.setItem('backend_base', v.replace(/\/$/, ''));
    else localStorage.removeItem('backend_base');
    
    localStorage.setItem('intel_model', modelVal);
  } catch(e) {}
  document.getElementById('modal').classList.remove('show');
  location.reload(); // ricarico per applicare il nuovo URL backend e modello
});
document.getElementById('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') document.getElementById('modal').classList.remove('show'); });

// Modal "Come condividere"
document.getElementById('btnShare').addEventListener('click', () => document.getElementById('modalShare').classList.add('show'));
document.getElementById('btnShareClose').addEventListener('click', () => document.getElementById('modalShare').classList.remove('show'));
document.getElementById('modalShare').addEventListener('click', (e) => { if (e.target.id === 'modalShare') document.getElementById('modalShare').classList.remove('show'); });

document.addEventListener('DOMContentLoaded', () => { init(); });

// ============================================================================
// PULL-TO-REFRESH (PWA mobile) — trascina verso il basso dalla cima per
// ricaricare. Su desktop / senza touch non si attiva.
// ============================================================================
(function () {
  if (!('ontouchstart' in window) && !navigator.maxTouchPoints) return;

  const THRESHOLD = 68;   // px di trascinamento per far scattare il refresh
  const MAX_PULL  = 100;  // px oltre cui non scende più

  const ind = document.createElement('div');
  ind.id = 'ptr-indicator';
  ind.innerHTML = '<span class="material-symbols-rounded">arrow_downward</span>';
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(ind));
  if (document.body) document.body.appendChild(ind);

  let startY = 0, pulling = false, dist = 0, triggered = false;
  const atTop = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 0;

  window.addEventListener('touchstart', (e) => {
    if (triggered || e.touches.length !== 1 || !atTop()) { pulling = false; return; }
    // non partire se il tocco è dentro un elemento scrollabile in orizzontale/verticale proprio
    startY = e.touches[0].clientY;
    pulling = true; dist = 0;
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (!pulling || triggered) return;
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0 || !atTop()) {
      pulling = false;
      ind.style.transform = '';
      ind.classList.remove('ptr-visible', 'ptr-ready');
      return;
    }
    dist = Math.min(MAX_PULL, dy * 0.5);
    ind.classList.add('ptr-visible');
    ind.classList.toggle('ptr-ready', dist >= THRESHOLD);
    ind.style.transform = `translateX(-50%) translateY(${dist}px)`;
    if (dy > 8) e.preventDefault(); // blocca il bounce nativo mentre si tira
  }, { passive: false });

  const end = () => {
    if (!pulling || triggered) return;
    pulling = false;
    if (dist >= THRESHOLD) {
      triggered = true;
      ind.classList.add('ptr-spinning');
      ind.classList.remove('ptr-ready');
      ind.querySelector('.material-symbols-rounded').textContent = 'refresh';
      ind.style.transform = 'translateX(-50%) translateY(52px)';
      setTimeout(() => location.reload(), 180);
    } else {
      ind.classList.remove('ptr-visible', 'ptr-ready');
      ind.style.transform = '';
    }
  };
  window.addEventListener('touchend', end, { passive: true });
  window.addEventListener('touchcancel', end, { passive: true });
})();
