// Service worker ScoreTrack — hors ligne complet. Nom de fichier figé (D3).
// La liste de précache et la version (hash du contenu) sont générées par `npm run build:sw`.
//
// Stratégies :
//   navigation        → cache d'abord (index.html), réseau ensuite, page hors ligne intégrée en dernier recours ;
//   actif précaché    → cache d'abord, réseau en secours (et mise en cache) ;
//   autre requête     → réseau d'abord, cache en secours.
// Mise à jour : le nouveau SW attend (`waiting`) que l'utilisateur applique la mise à jour depuis la bannière
// (message SKIP_WAITING) — sauf lors de la première migration depuis les anciens caches `st-v1`/`st-fonts-v1`/
// `st-v2`, où il prend la main immédiatement afin de les purger.

// >>> PRECACHE (généré — ne pas éditer à la main)
const VERSION = 'b4704f20';
const PRECACHE = [
  './',
  './assets/brand/logo-mono.svg',
  './assets/brand/logo.svg',
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
  './assets/icons/sprite.svg',
  './css/base.css',
  './css/fonts.css',
  './css/game.css',
  './css/modals.css',
  './css/motion.css',
  './css/setup.css',
  './css/system.css',
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
  './js/platform/backup.js',
  './js/platform/boot.js',
  './js/platform/errors.js',
  './js/platform/haptics.js',
  './js/platform/storage.js',
  './js/platform/sw-client.js',
  './js/store.js',
  './js/ui/a11y.js',
  './js/ui/dom.js',
  './js/ui/game.js',
  './js/ui/icons.js',
  './js/ui/modals.js',
  './js/ui/names.js',
  './js/ui/recap.js',
  './js/ui/settings.js',
  './js/ui/setup.js',
  './js/ui/toast.js',
  './js/ui/update-banner.js',
  './manifest-st.json',
];
// <<< PRECACHE

const CACHE = `st-${VERSION}`;
/** Caches des versions antérieures au précache versionné : leur présence déclenche la migration immédiate. */
const LEGACY_CACHES = ['st-v1', 'st-fonts-v1', 'st-v2'];
/** Extensions dont l'échec de précache fait échouer l'installation (l'application ne marcherait pas hors ligne). */
const ESSENTIAL = /\.(html|css|js|json)$|\/$/;

const scopeUrl = (u) => new URL(u, self.registration.scope).href;
const PRECACHED = new Set(PRECACHE.map(scopeUrl));

const OFFLINE_PAGE = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>ScoreTrack — hors ligne</title>
<style>html{background:#020d12;color:#e0fff8;font:16px/1.5 system-ui,sans-serif}body{margin:0;min-height:100vh;display:grid;place-items:center;text-align:center;padding:24px}
h1{font-size:20px;margin:0 0 8px}p{margin:0 0 20px;color:#9ad}button{font:inherit;padding:12px 20px;border-radius:8px;border:1px solid #00ffe0;background:transparent;color:#00ffe0;min-height:44px}</style></head>
<body><main><h1>ScoreTrack est hors ligne</h1><p>La première visite doit se faire en ligne pour installer l'application.</p>
<button type="button" onclick="location.reload()">Réessayer</button></main></body></html>`;

// ── Installation ────────────────────────────────────────────────────

/** Précache : chaque fichier est tenté séparément ; un échec sur un fichier essentiel annule l'installation. */
async function precache() {
  const cache = await caches.open(CACHE);
  const results = await Promise.allSettled(
    PRECACHE.map(async (url) => {
      const res = await fetch(new Request(url, { cache: 'reload' }));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await cache.put(url, res);
    }),
  );
  const failed = [];
  results.forEach((r, i) => {
    if (r.status !== 'rejected') return;
    console.warn(`[sw-st ${VERSION}] précache impossible : ${PRECACHE[i]}`, r.reason);
    if (ESSENTIAL.test(PRECACHE[i])) failed.push(PRECACHE[i]);
  });
  if (failed.length) throw new Error(`Précache incomplet : ${failed.join(', ')}`);
}

/** Vrai si un cache d'une version antérieure au précache versionné existe encore. */
async function hasLegacyCache() {
  const keys = await caches.keys();
  return keys.some((k) => LEGACY_CACHES.includes(k));
}

self.addEventListener('install', (e) => {
  e.waitUntil(
    (async () => {
      await precache();
      // Migration : les anciens SW ne signalent pas leurs mises à jour ; on prend la main pour purger leurs caches.
      if (await hasLegacyCache()) await self.skipWaiting();
    })(),
  );
});

// ── Activation ──────────────────────────────────────────────────────

/** Supprime les autres caches (anciennes versions, st-v1, st-fonts-v1…) et les entrées orphelines du cache courant. */
async function cleanup() {
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
  const cache = await caches.open(CACHE);
  const entries = await cache.keys();
  await Promise.all(
    entries.filter((req) => !PRECACHED.has(req.url)).map((req) => cache.delete(req)),
  );
}

self.addEventListener('activate', (e) => {
  e.waitUntil(cleanup().then(() => self.clients.claim()));
});

// ── Messages (client → SW) ──────────────────────────────────────────

self.addEventListener('message', (e) => {
  const type = e.data && e.data.type;
  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (type === 'GET_VERSION') {
    const reply = { type: 'VERSION', version: VERSION, cache: CACHE };
    if (e.ports && e.ports[0]) e.ports[0].postMessage(reply);
    else if (e.source) e.source.postMessage(reply);
  }
});

// ── Requêtes ────────────────────────────────────────────────────────

async function putInCache(request, response) {
  try {
    const cache = await caches.open(CACHE);
    await cache.put(request, response);
  } catch {
    /* quota ou cache indisponible : la réponse est déjà servie */
  }
}

/** Navigation : index.html précaché, sinon réseau, sinon page hors ligne intégrée. */
async function handleNavigation(request) {
  const cached = await caches.match('./index.html');
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res.ok) putInCache('./index.html', res.clone());
    return res;
  } catch {
    return new Response(OFFLINE_PAGE, {
      status: 503,
      statusText: 'Hors ligne',
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
}

/** Actif précaché : cache d'abord, réseau en secours. */
async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) putInCache(request, res.clone());
  return res;
}

/** Autre ressource de l'origine : réseau d'abord, cache en secours. */
async function networkFirst(request) {
  try {
    const res = await fetch(request);
    if (res.ok) putInCache(request, res.clone());
    return res;
  } catch (err) {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    e.respondWith(handleNavigation(request));
    return;
  }
  const key = url.origin + url.pathname;
  e.respondWith(PRECACHED.has(key) ? cacheFirst(request) : networkFirst(request));
});
