const CACHE_NAME = 'vetrx-v3-cache';
const ASSETS = [
  'index.html',
  'styles/main.css',
  'data/drug_catalog.json',
  'src/dose_engine.js',
  'src/crypto_storage.js',
  'src/i18n.js',
  'src/app_controller.js',
  'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
