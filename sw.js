const CACHE_VERSION = 'vetrx-v4-offline-first';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './styles/main.css',
  './data/drug_catalog.json',
  './data/drug_catalog_browser.js',
  './src/dose_engine.js',
  './src/crypto_storage.js',
  './src/i18n.js',
  './src/app_controller.js',
  './vetrx_standalone_final.html',
  'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await Promise.allSettled(APP_SHELL.map(async (url) => {
      try {
        const req = new Request(url, { cache: 'reload' });
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) await cache.put(req, res.clone());
      } catch (e) {
        // Best-effort precache for offline-first shell
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;

  // App shell/navigation: network-first with cache fallback for freshness + offline resilience
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_VERSION);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch (e) {
        return (await caches.match(req)) || (await caches.match('./index.html')) || (await caches.match('./vetrx_standalone_final.html'));
      }
    })());
    return;
  }

  // Same-origin static assets: cache-first, then network and cache
  if (isSameOrigin) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        const cache = await caches.open(CACHE_VERSION);
        cache.put(req, res.clone());
        return res;
      } catch (e) {
        return caches.match('./index.html');
      }
    })());
    return;
  }

  // Cross-origin (CDN): stale-while-revalidate
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    const cached = await cache.match(req);
    const fetchPromise = fetch(req).then((res) => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    return cached || fetchPromise || new Response('', { status: 504, statusText: 'Offline' });
  })());
});
