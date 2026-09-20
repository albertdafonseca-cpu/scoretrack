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
// Installation tout-ou-rien : un seul fichier manquant annule l'installation (jamais de version « à moitié
// hors ligne » qui dégraderait en polices de secours) ; la page en est informée (état `redundant`).
// Le précache est constitué dans un cache TEMPORAIRE puis basculé : une installation qui échoue ne
// touche jamais le cache que le service worker actif est peut-être en train de servir.

// >>> PRECACHE (généré — ne pas éditer à la main)
const VERSION = 'bcc3b4b4';
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
  './css/critical.css',
  './css/deferred.css',
  './css/fonts.css',
  './css/game.css',
  './css/modals.css',
  './css/motion.css',
  './css/setup.css',
  './css/system.css',
  './css/themes.css',
  './css/tokens.css',
  './icons/apple-touch-icon.png',
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
  './js/fx/confetti.js',
  './js/fx/flip.js',
  './js/fx/hold-ring.js',
  './js/fx/layout-fit.js',
  './js/fx/motion.js',
  './js/fx/score.js',
  './js/main.js',
  './js/platform/backup.js',
  './js/platform/boot.js',
  './js/platform/errors.js',
  './js/platform/haptics.js',
  './js/platform/prepaint.js',
  './js/platform/shortcuts.js',
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
/** Cache de travail de l'installation : seul lui peut être supprimé en cas d'échec. */
const STAGING = `${CACHE}-tmp`;
/** Caches des versions antérieures au précache versionné : leur présence déclenche la migration immédiate. */
const LEGACY_CACHES = ['st-v1', 'st-fonts-v1', 'st-v2'];

const scopeUrl = (u) => new URL(u, self.registration.scope).href;
const PRECACHED = new Set(PRECACHE.map(scopeUrl));

// Page de dernier recours : aucun script (ni en ligne ni externe), sa propre CSP, « Réessayer » = simple lien.
const OFFLINE_PAGE = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>ScoreTrack — hors ligne</title>
<style>html{background:#020d12;color:#e0fff8;font:16px/1.5 system-ui,sans-serif}body{margin:0;min-height:100vh;display:grid;place-items:center;text-align:center;padding:24px}
h1{font-size:20px;margin:0 0 8px}p{margin:0 0 20px;color:#9addd0}a{display:inline-block;font:inherit;padding:12px 20px;border-radius:8px;border:1px solid #00ffe0;color:#00ffe0;text-decoration:none;min-height:44px;box-sizing:border-box}</style></head>
<body><main><h1>ScoreTrack est hors ligne</h1><p>La première visite doit se faire en ligne pour installer l'application.</p>
<a href="./">Réessayer</a></main></body></html>`;

// ── Installation ────────────────────────────────────────────────────

/** Signale un précache incomplet aux pages ouvertes (elles ne voient pas les journaux du worker). */
async function reportInstallFailure(failed) {
  try {
    const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
    clients.forEach((c) =>
      c.postMessage({ type: 'INSTALL_FAILED', version: VERSION, missing: failed.slice(0, 5) }),
    );
  } catch {
    /* aucune page à prévenir */
  }
}

/**
 * Précache tout-ou-rien : chaque fichier est tenté séparément pour pouvoir les nommer tous, mais le moindre
 * échec (y compris une police ou une icône) annule l'installation — sinon l'application se croirait hors ligne
 * tout en affichant des polices de secours.
 *
 * Tout est d'abord écrit dans `STAGING`. En cas d'échec, seul ce cache de travail est supprimé : le cache
 * définitif, que le service worker actif dessert peut-être encore (même nom si seule la logique du SW a
 * changé), reste intact — une mise à jour ratée ne peut donc pas priver l'utilisateur de son hors-ligne.
 */
async function precache() {
  await caches.delete(STAGING);
  const staging = await caches.open(STAGING);
  const results = await Promise.allSettled(
    PRECACHE.map(async (url) => {
      const res = await fetch(new Request(url, { cache: 'reload' }));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await staging.put(url, res);
    }),
  );
  const failed = PRECACHE.filter((_, i) => results[i].status === 'rejected');
  if (failed.length) {
    failed.forEach((url, i) =>
      console.warn(`[sw-st ${VERSION}] précache impossible : ${url}`, results[i].reason),
    );
    await caches.delete(STAGING);
    await reportInstallFailure(failed);
    throw new Error(
      `Précache incomplet (${failed.length}/${PRECACHE.length}) : ${failed.slice(0, 3).join(', ')}`,
    );
  }
  // Bascule : le cache définitif n'est écrit qu'une fois le jeu complet téléchargé.
  const cache = await caches.open(CACHE);
  const staged = await staging.keys();
  await Promise.all(
    staged.map(async (request) => {
      const res = await staging.match(request);
      if (res) await cache.put(request, res);
    }),
  );
  await caches.delete(STAGING);
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

/**
 * Supprime les autres caches (anciennes versions, st-v1, st-fonts-v1…, cache de travail éventuel) et les
 * entrées orphelines du cache courant. N'est appelée qu'à l'activation, donc quand ce SW prend la main.
 */
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
  const cache = await caches.open(CACHE);
  const cached = await cache.match('./index.html');
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

/**
 * Réponse partielle (206) découpée dans une réponse complète mise en cache, pour les requêtes `Range`
 * (lecteurs audio/vidéo) ; null si l'en-tête n'est pas une plage d'octets simple exploitable.
 */
async function sliceRange(response, rangeHeader) {
  const m = /^bytes=(\d*)-(\d*)$/.exec((rangeHeader || '').trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  const buffer = await response.clone().arrayBuffer();
  const size = buffer.byteLength;
  let start = m[1] === '' ? size - Number(m[2]) : Number(m[1]);
  let end = m[1] === '' || m[2] === '' ? size - 1 : Number(m[2]);
  start = Math.max(0, start);
  end = Math.min(end, size - 1);
  if (start > end) {
    return new Response(null, {
      status: 416,
      statusText: 'Range Not Satisfiable',
      headers: { 'Content-Range': `bytes */${size}` },
    });
  }
  const headers = new Headers(response.headers);
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  headers.set('Content-Length', String(end - start + 1));
  headers.set('Accept-Ranges', 'bytes');
  return new Response(buffer.slice(start, end + 1), {
    status: 206,
    statusText: 'Partial Content',
    headers,
  });
}

/** Actif précaché : cache d'abord (cache courant uniquement), réseau en secours ; gère les requêtes `Range`. */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  const range = request.headers.get('range');
  if (cached) return range ? ((await sliceRange(cached, range)) ?? cached) : cached;
  const res = await fetch(request);
  if (res.ok && !range) putInCache(request, res.clone());
  return res;
}

/** Autre ressource de l'origine : réseau d'abord, cache en secours. */
async function networkFirst(request) {
  try {
    const res = await fetch(request);
    if (res.ok) putInCache(request, res.clone());
    return res;
  } catch (err) {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request, { ignoreSearch: true });
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
