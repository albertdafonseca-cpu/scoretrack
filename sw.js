// ScoreTrack Test — Service Worker
// Incrémenter VERSION (et la meta app-version de index.html) à chaque déploiement.
const PREFIX = 'st-test-';
const VERSION = '76';
const CACHE = PREFIX + 'v' + VERSION;

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './fonts/13755630d7d2.woff2',
  './fonts/306b4441c639.woff2',
  './fonts/36ccc775c221.woff2',
  './fonts/39332efa7a67.woff2',
  './fonts/3b78c6fa6456.woff2',
  './fonts/46932d16807a.woff2',
  './fonts/499056d5ded8.woff2',
  './fonts/56d3066b13fa.woff2',
  './fonts/6925862a5123.woff2',
  './fonts/6ab57b19c69b.woff2',
  './fonts/7baaaf3049b7.woff2',
  './fonts/99110e439625.woff2',
  './fonts/a375c31d43e6.woff2',
  './fonts/b6db4a06c119.woff2',
  './fonts/da72a9f73897.woff2',
  './fonts/e8a5b1bf533e.woff2',
  './fonts/ea98c7d3947e.woff2',
  './fonts/f059b71e05ff.woff2',
  './fonts/fonts-classic.css',
  './fonts/fonts-core.css',
  './fonts/fonts-retro.css',
  './icons/apple-touch-icon.png',
  './icons/favicon-64.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/splash.png',
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(PRECACHE.map(u => cache.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const old = (await caches.keys()).filter(k => k.startsWith(PREFIX) && k !== CACHE);
    await Promise.all(old.map(k => caches.delete(k)));
    await self.clients.claim();
    if (old.length) {
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach(c => c.postMessage({ type: 'SW_UPDATED', version: CACHE }));
    }
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetch(req);
        if (res.status === 200) cache.put(req, res.clone());
        return res;
      } catch (err) {
        return (await cache.match(req)) || (await cache.match('./index.html'))
          || new Response('Hors ligne', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  // Stale-while-revalidate
  const p = caches.open(CACHE).then(async cache => {
    const cached = await cache.match(req);
    const network = fetch(req).then(res => {
      if (res.status === 200) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    return { cached, network };
  });
  e.respondWith(p.then(async ({ cached, network }) => cached || (await network) || new Response('', { status: 504 })));
  e.waitUntil(p.then(({ network }) => network));
});
