/* ============================================================
   PLUME — Service Worker
   Cache-First strategy for static assets
   ============================================================ */

const CACHE_NAME = 'plume-v1';

const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// ---- Install: cache static assets -------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// ---- Activate: clean old caches ---------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ---- Fetch: Cache-First for static, network for APIs ------
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Always fetch from network for external APIs
  const isApi =
    url.hostname === 'api.languagetool.org' ||
    url.hostname === 'api.mistral.ai' ||
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com';

  if (isApi) {
    // Network only — no caching
    return;
  }

  // Cache-First for everything else (static assets)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((response) => {
        // Don't cache non-ok or non-basic responses
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        const cloned = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, cloned);
        });

        return response;
      });
    })
  );
});
