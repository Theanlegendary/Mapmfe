// ─────────────────────────────────────────────────────────────────────────────
// Metfone Express — PWA Service Worker
// Caches core app shell for offline/fast load. Data APIs always go network-first.
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_NAME = 'metfone-express-v3.1.2';

// App shell files to pre-cache on install
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/style.css?v=3.1.2',
  '/app.js?v=3.1.2',
  '/icon-192.png',
  '/icon-512.png',
  '/manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://cdn.jsdelivr.net/npm/leaflet.markercluster@1.4.1/dist/MarkerCluster.css',
  'https://cdn.jsdelivr.net/npm/leaflet.markercluster@1.4.1/dist/MarkerCluster.Default.css',
  'https://cdn.jsdelivr.net/npm/leaflet.markercluster@1.4.1/dist/leaflet.markercluster.js',
  'https://cdn.jsdelivr.net/npm/fuse.js@6.6.2/dist/fuse.min.js'
];

// ── Install: Pre-cache app shell ──────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: Clean up old caches ────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// ── Fetch: Strategy by request type ──────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Always go network-first for API calls (geocode, autocomplete, branch data)
  const isApiCall = url.pathname.startsWith('/api/') || url.pathname.startsWith('/data/');
  if (isApiCall) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // If offline and it is a JSON data file, try cache as fallback
        return caches.match(event.request);
      })
    );
    return;
  }

  // For external CDN resources: cache-first
  const isCDN = url.hostname.includes('cdnjs.cloudflare.com') ||
                url.hostname.includes('cdn.jsdelivr.net') ||
                url.hostname.includes('fonts.googleapis.com') ||
                url.hostname.includes('fonts.gstatic.com');
  if (isCDN) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request).then((response) => {
          const toCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, toCache));
          return response;
        });
      })
    );
    return;
  }

  // For app shell: cache-first with network fallback
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const toCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, toCache));
        return response;
      });
    })
  );
});
