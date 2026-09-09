// ============================================================================
// sw.js — Service Worker minimo per la PWA della dashboard.
// Due regole soltanto, per non rischiare di mostrare mai dati vecchi:
//   1. index.html e manifest.json → SEMPRE network-first (con fallback alla
//      cache solo se offline). Sono la fonte di verità di quale versione di
//      JS/CSS caricare (via i tag <script ...?v=...>), non vanno mai serviti
//      stantii dalla cache.
//   2. Asset versionati (js/*.js?v=..., index.css?v=..., icone) → cache-first.
//      Sono al sicuro perché ogni deploy cambia il numero di versione nella
//      query string — lo stesso URL non cambia MAI contenuto, quindi cache-first
//      è corretto e velocissimo. Un nuovo ?v= è semplicemente un URL diverso.
// Le chiamate al backend Vercel e a domini esterni (font, CDN) passano dritte
// alla rete, il Service Worker non le tocca.
// ============================================================================

const CACHE_NAME = 'pep-dashboard-v3';
const NETWORK_FIRST = ['/dashboard_progettiesperti/', '/dashboard_progettiesperti/index.html', '/dashboard_progettiesperti/manifest.json'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

// Condivisione da altre app (es. un'immagine generata con ChatGPT) verso la
// dashboard: il manifest dichiara index.html come share_target via POST, ma
// GitHub Pages è statico e non sa gestire un POST — il file viene quindi
// intercettato QUI, salvato in una cache temporanea, e l'utente rediretto a
// una GET normale con ?shared=1 perché la pagina lo recuperi al caricamento.
async function handleShareTarget(event) {
  const formData = await event.request.formData();
  const file = formData.get('media');
  const title = formData.get('title') || '';
  const text = formData.get('text') || '';
  const cache = await caches.open('pep-share-target');
  if (file && typeof file === 'object' && file.size > 0) {
    await cache.put('/shared-file', new Response(file, { headers: { 'Content-Type': file.type || 'application/octet-stream' } }));
    await cache.put('/shared-meta', new Response(JSON.stringify({ title, text, name: file.name || 'condiviso' })));
  }
  return Response.redirect('./index.html?shortcut=pianifica&shared=1', 303);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method === 'POST' && url.origin === self.location.origin && url.pathname.endsWith('/index.html')) {
    event.respondWith(handleShareTarget(event));
    return;
  }

  // Solo richieste GET sulla stessa origin (niente API backend, niente CDN esterni)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // req.mode === 'navigate' copre QUALSIASI caricamento di pagina (barra indirizzi,
  // link, reload) — più robusto del solo confronto sul path, che si è rivelato
  // insufficiente (una navigazione reale non passava dal ramo network-first).
  const isShell = req.mode === 'navigate' ||
    NETWORK_FIRST.some((p) => url.pathname === p || url.pathname.endsWith('/dashboard_progettiesperti/'));

  if (isShell) {
    // Network-first: prova la rete, cache solo come fallback offline.
    // cache:'no-store' è essenziale — senza, fetch() può comunque restituire
    // una risposta dalla cache HTTP del browser, rendendo 'network-first' finto.
    // Uso req.url (stringa) invece dell'oggetto Request originale: un Request
    // in modalità 'navigate' non si può ri-fetchare in modo affidabile con
    // opzioni modificate in tutti i browser.
    event.respondWith(
      fetch(req.url, { cache: 'no-store' }).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, clone));
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Cache-first per tutto il resto sulla stessa origin (asset versionati via ?v=)
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, clone));
        return res;
      });
    })
  );
});
