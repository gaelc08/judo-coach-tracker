const CACHE_VERSION = 'judo-coach-pwa-v53';
const APP_BUILD_ID = '2026-04-07-reset-v2';
const BASE_PATH = new URL('./', self.location.href).pathname;
const INDEX_URL = `${BASE_PATH}index.html`;
const OFFLINE_URL = `${BASE_PATH}offline.html`;

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match(INDEX_URL)));
  }
});
