// Serveur statique de test (Node natif) : sert la racine du dépôt sans cache HTTP, peut être arrêté
// (vrai hors-ligne) et servir une variante de `sw-st.js` avec une autre VERSION (simulation de mise à jour).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

/**
 * Démarre le serveur ; renvoie { url, port, stop(), start(), setSwVersion(v), requests }.
 * `port` 0 (défaut) = port libre attribué par le système, conservé aux redémarrages (même origine pour le SW).
 */
export async function startStaticServer({ root, port = 0 }) {
  const base = resolve(root);
  let swVersion = null;
  let swPatch = null;
  const sockets = new Set();
  const requests = [];
  const blocked = new Set();

  async function handle(req, res) {
    const url = new URL(req.url, `http://localhost:${port}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = normalize(join(base, pathname));
    if (!file.startsWith(base)) {
      res.writeHead(403).end();
      return;
    }
    if (blocked.has(pathname)) {
      requests.push({ path: pathname, status: 404 });
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Bloqué');
      return;
    }
    try {
      const info = await stat(file);
      if (!info.isFile()) throw new Error('not a file');
      let body = await readFile(file);
      if (pathname === '/sw-st.js' && (swVersion || swPatch)) {
        let src = body.toString('utf8');
        if (swVersion)
          src = src.replace(/const VERSION = '[^']*';/, `const VERSION = '${swVersion}';`);
        if (swPatch) src = swPatch(src);
        body = Buffer.from(src);
      }
      requests.push({ path: pathname, status: 200 });
      res.writeHead(200, {
        'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
        'Content-Length': body.length,
        'Cache-Control': 'no-cache',
      });
      res.end(body);
    } catch {
      requests.push({ path: pathname, status: 404 });
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Introuvable');
    }
  }

  let server = null;
  const start = () =>
    new Promise((ok, ko) => {
      server = createServer((req, res) => {
        handle(req, res).catch(() => res.writeHead(500).end());
      });
      server.on('connection', (s) => {
        sockets.add(s);
        s.on('close', () => sockets.delete(s));
      });
      server.once('error', ko);
      server.listen(port, '127.0.0.1', () => {
        port = server.address().port;
        ok();
      });
    });
  const stop = () =>
    new Promise((ok) => {
      if (!server) return ok();
      for (const s of sockets) s.destroy();
      server.close(() => {
        server = null;
        ok();
      });
    });

  await start();
  return {
    url: `http://localhost:${port}/`,
    port,
    requests,
    start,
    stop,
    /** VERSION servie dans sw-st.js (null = fichier du dépôt tel quel). */
    setSwVersion(v) {
      swVersion = v;
    },
    /**
     * Transforme la source de sw-st.js à la volée, sans toucher à sa VERSION : simule un déploiement
     * qui ne modifie que la logique du service worker. `null` rétablit le fichier du dépôt.
     */
    setSwPatch(fn) {
      swPatch = fn;
    },
    /** Chemins renvoyés en 404 (simulation d'un actif indisponible pendant le précache). */
    setBlocked(paths) {
      blocked.clear();
      paths.forEach((p) => blocked.add(p));
    },
  };
}
