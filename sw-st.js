// Service worker ScoreTrack — hors ligne complet. Nom de fichier figé (D3).
// La liste de précache et la version sont générées par `npm run build:sw` (scripts/build-sw.mjs).

// >>> PRECACHE (généré — ne pas éditer à la main)
const VERSION = 'dce23e77';
const PRECACHE = [
  './',
  './assets/fonts/bebas-neue-400-latin-ext.woff2',
  './assets/fonts/bebas-neue-400-latin.woff2',
  './assets/fonts/cinzel-400-700-latin-ext.woff2',
  './assets/fonts/cinzel-400-700-latin.woff2',
  './assets/fonts/inter-400-800-latin-ext.woff2',
  './assets/fonts/inter-400-800-latin.woff2',
  './assets/fonts/orbitron-400-900-latin.woff2',
  './assets/fonts/press-start-2p-400-latin-ext.woff2',
  './assets/fonts/press-start-2p-400-latin.woff2',
  './assets/fonts/share-tech-mono-400-latin.woff2',
  './css/base.css',
  './css/fonts.css',
  './css/game.css',
  './css/modals.css',
  './css/motion.css',
  './css/setup.css',
  './css/themes.css',
  './css/tokens.css',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './index.html',
  './js/core/constants.js',
  './js/core/format.js',
  './js/core/history.js',
  './js/core/layout.js',
  './js/core/rules.js',
  './js/core/save-schema.js',
  './js/main.js',
  './js/platform/boot.js',
  './js/platform/errors.js',
  './js/platform/haptics.js',
  './js/platform/storage.js',
  './js/platform/sw-client.js',
  './js/store.js',
  './js/ui/dom.js',
  './js/ui/game.js',
  './js/ui/modals.js',
  './js/ui/names.js',
  './js/ui/recap.js',
  './js/ui/settings.js',
  './js/ui/setup.js',
  './manifest-st.json',
];
// <<< PRECACHE

const CACHE = 'st-v2';
const OFFLINE_FALLBACK = './index.html';

/** Précache tolérant : chaque fichier est tenté séparément, les échecs sont journalisés sans bloquer l'installation. */
async function precache() {
  const cache = await caches.open(CACHE);
  const results = await Promise.allSettled(
    PRECACHE.map(async (url) => {
      const res = await fetch(new Request(url, { cache: 'reload' }));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await cache.put(url, res);
    }),
  );
  results.forEach((r, i) => {
    if (r.status === 'rejected')
      console.warn(`[sw-st ${VERSION}] précache impossible : ${PRECACHE[i]}`, r.reason);
  });
}

/** Supprime les anciens caches (st-v1, st-fonts-v1, …) et les entrées obsolètes du cache courant. */
async function cleanup() {
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
  const cache = await caches.open(CACHE);
  const wanted = new Set(PRECACHE.map((u) => new URL(u, self.registration.scope).href));
  const entries = await cache.keys();
  await Promise.all(entries.filter((req) => !wanted.has(req.url)).map((req) => cache.delete(req)));
}

self.addEventListener('install', (e) => {
  e.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(cleanup().then(() => self.clients.claim()));
});

/** Cache d'abord, réseau ensuite (mis en cache si OK) ; page d'accueil en secours pour les navigations. */
async function respond(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res.ok) {
      const cache = await caches.open(CACHE);
      cache.put(request, res.clone());
    }
    return res;
  } catch {
    if (request.mode === 'navigate') {
      const fallback = await caches.match(OFFLINE_FALLBACK);
      if (fallback) return fallback;
    }
    return new Response('Hors ligne', { status: 503, statusText: 'Hors ligne' });
  }
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(respond(e.request));
});
