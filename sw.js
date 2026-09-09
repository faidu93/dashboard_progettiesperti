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

const CACHE_NAME = 'pep-dashboard-v2';
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

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Solo richieste GET sulla stessa origin (niente API backend, niente CDN esterni)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  const isShell = NETWORK_FIRST.some((p) => url.pathname === p || url.pathname.endsWith('/dashboard_progettiesperti/'));

  if (isShell) {
    // Network-first: prova la rete, cache solo come fallback offline.
    // cache:'no-store' è essenziale qui — senza, fetch() può comunque
    // restituire una risposta dalla cache HTTP del browser (se il server
    // manda header di cache permissivi), rendendo 'network-first' finto:
    // sembra andare in rete ma in realtà pesca comunque roba vecchia.
    event.respondWith(
      fetch(req, { cache: 'no-store' }).then((res) => {
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
