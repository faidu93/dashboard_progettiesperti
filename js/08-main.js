// ============================================================================
// js/08-main.js — Funzione init() e event listeners. Entry point dell'app.
// Dipendenze: tutti i file precedenti (01-07).
// ============================================================================

async function init() {
  // Avvio overlay di caricamento
  loadingStart();
  loadingStep('setup', 'Configurazione interfaccia…');

  // Attiva tab calendario subito
  document.querySelectorAll('section[data-tab="calendario"]').forEach(s => s.classList.add('tab-active'));
  updateOnboarding();
  setStatus('', 'Caricamento dati…');
  // CRITICAL: setup eventi PRIMA del fetch — così i bottoni funzionano anche se il backend fallisce
  calSetupEvents();
  calRender();
  let savedSecret = '';
  try { savedSecret = sessionStorage.getItem('publish_secret') || localStorage.getItem('publish_secret') || ''; } catch(e) {}
  if (savedSecret) {
    loadPublishQueue();
  }
  gcalInit(); // Google Calendar init sempre
  intelRestoreFields(); // ripristina API key e preferenze Intelligence
  loadingDone('setup', 'Interfaccia pronta');
  loadingProgress(10);

  try {
    // === FASE 1: Instagram Insights ===
    loadingStep('ig', 'Connessione Instagram Graph API…');
    loadingProgress(15);
    let ig = null;
    let isMockIg = false;
    try {
      ig = await fetchCachedBackend('/api/instagram-insights', 'cache_ig_insights');
    } catch(e) {
      console.warn('Errore connessione backend Instagram, uso dati di test:', e);
      loadingWarn('ig', 'Instagram non disponibile (uso dati di test)');
      ig = generateMockInstagramData();
      isMockIg = true;
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
    // Calendario: assegno i post pubblicati e re-render
    calPublishedPosts = posts;
    calRender();

    // === FASE 2: YouTube ===
    loadingStep('yt', 'Caricamento video YouTube…');
    loadingProgress(40);
    try {
      const yt = await fetchCachedBackend('/api/youtube-videos', 'cache_yt_videos_v2');
      const ytRaw = yt.data || yt.videos || [];
      // Deduplicazione per titolo: ogni video ha una sola published_at reale
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
    } catch(e) {
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
    const ctx = renderKPIs(daily, profile, validPosts);
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
    document.getElementById('compYou').textContent = numIt(profile.followers_count);
    loadingDone('render', `KPI e grafici pronti · ${validPosts.length} post analizzati`);
    loadingProgress(75);

    // === FASE 4: Dati demografici ===
    loadingStep('demo', 'Caricamento demografia e orari…');
    try {
      const demo = await fetchCachedBackend('/api/instagram-demographics', 'cache_ig_demo');
      window.CACHED_DEMO = demo;
      renderDemographics(demo);
      renderOnlineFollowers(demo);
      loadingDone('demo', 'Dati demografici e orari attivi');
    } catch(e) {
      loadingWarn('demo', 'Dati demografici non disponibili');
    }
    loadingProgress(92);

    // === FASE 5: Dati iscritti ===
    loadingStep('subscribers', 'Caricamento dati iscritti…');
    try {
      let savedSecret = '';
      try { savedSecret = sessionStorage.getItem('publish_secret') || localStorage.getItem('publish_secret') || ''; } catch(e) {}
      
      if (savedSecret) {
        const subRes = await fetch(`${BACKEND_BASE}/api/subscribers`, {
          headers: { 'X-Publish-Secret': savedSecret }
        });
        if (subRes.ok) {
          const subData = await subRes.json();
          if (subData && Array.isArray(subData.subscribers)) {
            window.CACHED_SUBSCRIBERS = subData;
            renderSubscribersKPIs(subData);
            loadingDone('subscribers', `Iscritti · ${subData.subscribers.length} totali`);
          } else {
            console.warn('Dati iscritti non validi (manca array subscribers):', subData);
            window.CACHED_SUBSCRIBERS = { error: true };
            renderSubscribersError();
            loadingWarn('subscribers', 'Iscritti · dati non validi');
          }
        } else if (subRes.status === 401) {
          window.CACHED_SUBSCRIBERS = { unauthorized: true };
          renderSubscribersUnauthorized();
          loadingDone('subscribers', 'Iscritti · sbloccare con password');
        } else {
          window.CACHED_SUBSCRIBERS = { error: true };
          renderSubscribersError();
          loadingWarn('subscribers', 'Iscritti · errore caricamento');
        }
      } else {
        window.CACHED_SUBSCRIBERS = { unauthorized: true };
        renderSubscribersUnauthorized();
        loadingDone('subscribers', 'Iscritti · inserire password per sbloccare');
      }
    } catch(e) {
      console.warn('Errore iscritti:', e);
      window.CACHED_SUBSCRIBERS = { error: true };
      renderSubscribersError();
      loadingWarn('subscribers', 'Iscritti non disponibili');
    }
    loadingProgress(98);

    // Aggiorno barra mappa: scala log su max 100k (L4 medio)
    const mapBar = document.getElementById('mapYouBar');
    if (mapBar) {
      const f = profile.followers_count;
      const pct = f > 0 ? Math.min(40, Math.max(8, (Math.log10(f) / 5) * 40)) : 8;
      mapBar.style.width = pct + '%';
    }
    const now = new Date();
    document.getElementById('footTime').textContent = now.toLocaleString('it-IT');
    if (window.IS_USING_MOCK_IG) {
      setStatus('error', 'Offline (Dati di test) · ' + now.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}));
    } else {
      setStatus('live', 'Live · ' + now.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}));
    }
    loadingFinish(true);
  } catch(e) {
    console.error('Backend error:', e);
    setStatus('error', 'Errore: ' + e.message.slice(0,60));
    loadingStep('error', 'Errore connessione backend: ' + e.message.slice(0, 60), 'error');
    loadingFinish(false);
  }
}

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


    function openEditQueueModal(id, caption, isoDate) {
      document.getElementById('editQueueId').value = id;
      document.getElementById('editQueueCaption').value = caption || '';
      
      if (isoDate && isoDate !== 'null') {
        const dt = new Date(isoDate);
        document.getElementById('editQueueDate').value = dt.toISOString().split('T')[0];
        document.getElementById('editQueueTime').value = String(dt.getHours()).padStart(2,'0') + ':' + String(dt.getMinutes()).padStart(2,'0');
      } else {
        document.getElementById('editQueueDate').value = '';
        document.getElementById('editQueueTime').value = '';
      }
      
      const modal = document.getElementById('editQueueModal');
      modal.style.display = 'flex';
    }

    function closeEditQueueModal() {
      document.getElementById('editQueueModal').style.display = 'none';
    }

    async function saveEditQueueModal() {
      const id = document.getElementById('editQueueId').value;
      const caption = document.getElementById('editQueueCaption').value.trim();
      const d = document.getElementById('editQueueDate').value;
      const t = document.getElementById('editQueueTime').value;
      
      if (!id) return;
      if (!d || !t) {
        alert('Inserisci data e ora valide.');
        return;
      }

      const isoDate = new Date(d + 'T' + t).toISOString();
      const secret = getPublishSecret();
      if (!secret) { alert('Password di pubblicazione mancante.'); return; }

      const btn = document.getElementById('saveEditQueueBtn');
      const originalHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="material-symbols-rounded" style="animation:spin 1s linear infinite;font-size:18px;">progress_activity</span> Salvataggio...';

      try {
        const res = await fetch(`${BACKEND_BASE}/api/schedule?action=update&id=${encodeURIComponent(id)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Publish-Secret': secret },
          body: JSON.stringify({
            caption: caption,
            scheduledAt: isoDate
          })
        });
        
        const j = await res.json().catch(() => ({}));
        if (!res.ok || j.error) {
          if (res.status === 401) clearPublishSecret();
          throw new Error(j.error || `HTTP ${res.status}`);
        }
        
        closeEditQueueModal();
        loadPublishQueue(); // Refresh queue
      } catch (e) {
        alert('Errore durante il salvataggio: ' + e.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
      }
    }
  