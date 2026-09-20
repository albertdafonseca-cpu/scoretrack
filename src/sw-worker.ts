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
const FONTS_CACHE   = 'st-fonts-v4';   // polices : mise à jour rare (v4 : liste corrigée, voir DECISIONS-E.md §2)

// Fichiers de l'app à précacher (chemins relatifs à dist/, la racine déployée).
// jsPDF n'est plus chargé par CDN (bundlé dans app.js via npm, voir
// docs/audit/DECISIONS-E.md §1) : plus de cache CDN séparé à tenir à jour.
// Les fichiers de polices auto-hébergées sont listés ici à titre PRÉVENTIF
// (voir DECISIONS-E.md §2) : `precache` est tolérant, un chemin absent (tant
// que l'auto-hébergement n'est pas câblé dans index.html/build.mjs) est
// simplement ignoré et ne bloque pas l'installation du service worker.
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

// Tant que l'auto-hébergement (DECISIONS-E.md §2) n'est pas câblé par
// l'élément D dans index.html, la feuille de style Google Fonts ci-dessous
// reste le filet de sécurité : elle DOIT rester identique, caractère pour
// caractère (ordre des familles/poids compris), à l'@import de la balise
// <style> d'index.html — un simple copier-coller. Avant ce correctif, cette
// liste ne correspondait à AUCUNE des polices réellement chargées par
// l'application (elle précachait "Exo 2", jamais utilisé, et omettait Inter,
// Press Start 2P, Cinzel, Bebas Neue, Ballet, Permanent Marker et Dancing
// Script) : le précache ne servait donc jamais la bonne ressource. Une fois
// l'auto-hébergement en place, ce bloc (FONT_CSS_URLS/FONT_HOSTS et la
// branche "Polices Google" du gestionnaire fetch ci-dessous) devient mort et
// doit être supprimé — voir DECISIONS-E.md §2 pour la marche à suivre exacte.
const FONT_CSS_URLS = [
  'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=Share+Tech+Mono&family=Inter:wght@400;600;700;800&family=Press+Start+2P&family=Cinzel:wght@400;600;700&family=Bebas+Neue&family=Ballet&family=Permanent+Marker&family=Dancing+Script:wght@600;700&display=swap',
];

const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

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
    // 1. Fichiers statiques de l'app (dont les polices auto-hébergées, cf. STATIC)
    await precache(await caches.open(CACHE_VERSION), STATIC);
    // 2. Filet de sécurité Google Fonts (cache séparé, tant que non retiré — voir FONT_CSS_URLS)
    await precache(await caches.open(FONTS_CACHE), FONT_CSS_URLS, { mode: 'cors' });
    await sw.skipWaiting();
  })());
});

// ── Activation ────────────────────────────────────────────────────
sw.addEventListener('activate', (e: ExtendableEvent) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => k !== CACHE_VERSION && k !== FONTS_CACHE)
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

  const url = new URL(e.request.url);

  // Filet de sécurité Google Fonts : cache-first (ne changent pas). Une fois
  // l'auto-hébergement de DECISIONS-E.md §2 câblé, ces requêtes ne se
  // produisent plus jamais (les polices sont servies depuis ./fonts/, donc
  // par la branche générique ci-dessous comme n'importe quel autre fichier
  // de l'app) : cette branche devient alors morte et doit être supprimée.
  if (FONT_HOSTS.includes(url.hostname)) {
    e.respondWith(
      caches.open(FONTS_CACHE).then(cache =>
        cache.match(e.request).then(cached => {
          if (cached) return cached;
          return fetch(e.request, { mode: 'cors' }).then(res => {
            if (res.ok) cache.put(e.request, res.clone());
            return res;
          }).catch(() => cached || new Response('', { status: 503 }));
        })
      )
    );
    return;
  }

  // Tout le reste (app.js, index.html, et — une fois auto-hébergées — les
  // polices sous ./fonts/) : network-first, repli sur le cache hors ligne
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
