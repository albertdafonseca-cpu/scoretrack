// ─────────────────────────────────────────────────────────────────
//  ScoreTrack — Service Worker (compilé par esbuild vers dist/sw.js)
//  La version vient de la balise <meta name="app-version"> d'index.html,
//  injectée au build (__APP_VERSION__) : l'incrémenter à chaque déploiement
//  invalide le cache sur tous les appareils.
// ─────────────────────────────────────────────────────────────────
/// <reference lib="webworker" />
export {}; // module : évite tout conflit de portée globale
declare const __APP_VERSION__: string;
const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE_VERSION = 'st-v' + __APP_VERSION__;
// L'ancien cache de polices Google Fonts ('st-fonts-v4') n'est plus créé ;
// `activate` supprime déjà toute clé de cache différente de CACHE_VERSION,
// donc il disparaît de lui-même chez les visiteurs qui l'avaient encore.

// Fichiers de l'app à précacher (chemins relatifs à dist/, la racine déployée).
// jsPDF n'est plus chargé par CDN (bundlé dans app.js via npm, voir
// docs/audit/DECISIONS-E.md §1). Les polices sont auto-hébergées sous
// ./fonts/ (index.html les référence via ./fonts/fonts.css, voir
// docs/audit/DECISIONS-E.md §2) : plus aucune requête vers Google Fonts,
// `precache` est tolérant, un chemin absent est simplement ignoré et ne
// bloque pas l'installation du service worker.
const STATIC = [
  './',
  './index.html',
  './app.js',
  './fonts/fonts.css',
  './fonts/orbitron-latin.woff2',
  './fonts/share-tech-mono-latin.woff2',
  './fonts/inter-latin.woff2',
  './fonts/inter-latin-ext.woff2',
  './fonts/inter-cyrillic.woff2',
  './fonts/inter-cyrillic-ext.woff2',
  './fonts/inter-greek.woff2',
  './fonts/inter-greek-ext.woff2',
  './fonts/inter-vietnamese.woff2',
  './fonts/press-start-2p-latin.woff2',
  './fonts/press-start-2p-latin-ext.woff2',
  './fonts/press-start-2p-cyrillic.woff2',
  './fonts/press-start-2p-cyrillic-ext.woff2',
  './fonts/press-start-2p-greek.woff2',
  './fonts/cinzel-latin.woff2',
  './fonts/cinzel-latin-ext.woff2',
  './fonts/bebas-neue-latin.woff2',
  './fonts/bebas-neue-latin-ext.woff2',
  './fonts/ballet-latin.woff2',
  './fonts/ballet-latin-ext.woff2',
  './fonts/ballet-vietnamese.woff2',
  './fonts/permanent-marker-latin.woff2',
  './fonts/dancing-script-latin.woff2',
  './fonts/dancing-script-latin-ext.woff2',
  './fonts/dancing-script-vietnamese.woff2',
];

/** Précache tolérant : un fichier absent n'empêche pas l'installation. */
async function precache(cache: Cache, urls: string[], init?: RequestInit): Promise<void> {
  await Promise.all(urls.map(url =>
    fetch(url, init)
      .then(res => { if (res.ok) return cache.put(url, res); })
      .catch(() => {/* hors ligne à l'install — réessai au premier fetch */})
  ));
}

// ── Installation ──────────────────────────────────────────────────
sw.addEventListener('install', (e: ExtendableEvent) => {
  e.waitUntil((async () => {
    // Fichiers statiques de l'app, dont les polices auto-hébergées (cf. STATIC).
    // Plus aucune requête vers un serveur tiers à l'installation.
    await precache(await caches.open(CACHE_VERSION), STATIC);
    await sw.skipWaiting();
  })());
});

// ── Activation ────────────────────────────────────────────────────
sw.addEventListener('activate', (e: ExtendableEvent) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => k !== CACHE_VERSION)
        .map(k => caches.delete(k))
    );
    await sw.clients.claim();
    const clients = await sw.clients.matchAll({ type: 'window' });
    clients.forEach(c => c.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION }));
  })());
});

// ── Fetch ─────────────────────────────────────────────────────────
sw.addEventListener('fetch', (e: FetchEvent) => {
  if (e.request.method !== 'GET') return;

  // app.js, index.html et les polices auto-hébergées sous ./fonts/ (toutes
  // servies par la même origine que l'app, aucune requête vers un serveur
  // tiers) : network-first, repli sur le cache hors ligne.
  e.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    try {
      const res = await fetch(e.request);
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    } catch {
      return (await cache.match(e.request))
        || new Response('Hors ligne — rechargez une fois connecté.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
           });
    }
  })());
});
