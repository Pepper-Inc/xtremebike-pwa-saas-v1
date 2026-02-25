/**
 * CYKLBOARD MANAGEMENT — SERVICE WORKER
 * Offline-first PWA caching strategy
 */

const CACHE_VERSION = 'cykl-v1.0.5';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;

// Core assets to pre-cache
const STATIC_ASSETS = [
    './',
    'index.html',
    'login.html',
    'css/theme.css',
    'css/components.css',
    'css/room-map.css',
    'css/checkin.css',
    'css/dashboard.css',
    'js/data.js',
    'js/utils.js',
    'js/room-map.js',
    'js/checkin.js',
    'js/dashboard.js',
    'js/app.js',
    'js/auth.js',
    'js/supabase-client.js',
    'manifest.json',
    'assets/favicon.png',
    'assets/logo.png',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'https://fonts.googleapis.com/css2?family=Barlow:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,700&family=Barlow+Condensed:wght@700;900&display=swap',
];

/* ── INSTALL ─────────────────────────────────────────────────── */
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

/* ── ACTIVATE ────────────────────────────────────────────────── */
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(key => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
                    .map(key => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

/* ── FETCH — Stale-while-revalidate for static, network-first for API ── */
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET and extension requests
    if (request.method !== 'GET') return;
    if (url.protocol === 'chrome-extension:') return;

    event.respondWith(
        caches.match(request).then(cached => {
            const networkFetch = fetch(request)
                .then(response => {
                    if (response && response.status === 200 && response.type === 'basic') {
                        const cloned = response.clone();
                        caches.open(DYNAMIC_CACHE).then(cache => cache.put(request, cloned));
                    }
                    return response;
                })
                .catch(() => cached); // fallback to cache on network fail

            return cached || networkFetch;
        })
    );
});
