/* =============================================================
   Bonus Bridge Pro — Service Worker
   Network-first for everything, falling back to cache only when
   offline. This is the lesson learned from both Bridge Modes
   Calculator and the old Bonus Bridge PWA: a cache-first strategy
   silently serves stale files forever unless you remember to bump
   a version string on every single deploy. Network-first means
   every deploy just works, with no manual step required.
   ============================================================= */

const CACHE_VERSION = 'bonus-bridge-pro-v1';

const STATIC_URLS = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './scoring.js',
    './license.js',
    './manifest.json',
    './favicon.ico',
    './favicon.svg'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        (async () => {
            const cache = await caches.open(CACHE_VERSION);
            try {
                await cache.addAll(STATIC_URLS);
            } catch (err) {
                console.warn('[SW] Could not pre-cache all static assets:', err);
            }
            self.skipWaiting();
        })()
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            const keys = await caches.keys();
            await Promise.all(
                keys
                    .filter((key) => key !== CACHE_VERSION)
                    .map((key) => {
                        console.log('[SW] Deleting old cache:', key);
                        return caches.delete(key);
                    })
            );
            await self.clients.claim();
        })()
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;

    event.respondWith(
        (async () => {
            try {
                const networkResponse = await fetch(event.request);
                if (networkResponse.ok) {
                    const cache = await caches.open(CACHE_VERSION);
                    cache.put(event.request, networkResponse.clone());
                }
                return networkResponse;
            } catch {
                const cached = await caches.match(event.request);
                if (cached) return cached;

                const appShell = await caches.match('./index.html');
                if (appShell) return appShell;

                return new Response('Offline — please open the app while connected first', {
                    status: 503,
                    headers: { 'Content-Type': 'text/plain' }
                });
            }
        })()
    );
});
