/**
 * NutriPulse Service Worker
 * Versioned app-shell & static asset caching with offline fallback.
 *
 * IMPORTANT ARCHITECTURAL NOTE:
 * Cloud Firestore and Firebase Authentication manage their own IndexedDB
 * persistence and synchronization queues directly via the Firebase Web SDK.
 * This Service Worker intentionally NEVER intercepts or caches Firebase API
 * traffic, preventing conflicting sources of truth.
 */

const CACHE_VERSION = 'v1.0.0';
const STATIC_CACHE_NAME = `nutripulse-static-${CACHE_VERSION}`;
const RUNTIME_CACHE_NAME = `nutripulse-runtime-${CACHE_VERSION}`;
const OFFLINE_FALLBACK_URL = '/offline.html';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  OFFLINE_FALLBACK_URL,
  '/manifest.webmanifest',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
  '/icons/maskable-icon.svg',
];

// Hosts that must NEVER be cached by the Service Worker (handled by Firebase SDK)
const BYPASS_HOSTS = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'googleapis.com',
  'firebaseinstallations.googleapis.com',
  'apis.google.com',
  'accounts.google.com',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter(
              (name) =>
                name.startsWith('nutripulse-') &&
                name !== STATIC_CACHE_NAME &&
                name !== RUNTIME_CACHE_NAME
            )
            .map((staleCache) => caches.delete(staleCache))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'GET_VERSION') {
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ version: CACHE_VERSION });
    }
  }
});

function shouldBypassRequest(requestUrl) {
  if (requestUrl.protocol !== 'http:' && requestUrl.protocol !== 'https:') {
    return true;
  }
  for (const host of BYPASS_HOSTS) {
    if (requestUrl.hostname === host || requestUrl.hostname.endsWith(`.${host}`)) {
      return true;
    }
  }
  // Bypass Vite HMR / dev websocket endpoints
  if (requestUrl.pathname.startsWith('/@') || requestUrl.pathname.includes('__vite')) {
    return true;
  }
  return false;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(request.url);
  if (shouldBypassRequest(requestUrl)) {
    return;
  }

  // 1. Navigation requests (HTML pages / SPA routes): Network-first -> Cached index.html -> offline.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const copy = networkResponse.clone();
            caches.open(STATIC_CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cachedIndex = await caches.match('/index.html');
          if (cachedIndex) {
            return cachedIndex;
          }
          const offlineFallback = await caches.match(OFFLINE_FALLBACK_URL);
          return (
            offlineFallback ||
            new Response('Offline — Please connect to the internet.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain' },
            })
          );
        })
    );
    return;
  }

  // 2. Same-origin static assets (JS, CSS, SVG, fonts, manifest): Stale-While-Revalidate
  if (requestUrl.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(RUNTIME_CACHE_NAME).then((cache) => {
                cache.put(request, responseClone);
              });
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
  }
});
