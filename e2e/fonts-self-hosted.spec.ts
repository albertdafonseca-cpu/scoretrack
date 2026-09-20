// Élément D — preuve e2e que l'auto-hébergement des polices (préparé par
// l'élément E, docs/audit/DECISIONS-E.md §2) est bien câblé côté index.html :
// plus aucune requête vers fonts.googleapis.com / fonts.gstatic.com au
// chargement de la page, condition nécessaire pour que la politique de
// confidentialité (variante A, DECISIONS-E.md §4) soit exacte.
//
// Note de robustesse multi-agent : `build.mjs` (hors périmètre de l'élément
// D, propriété de l'élément F) ne copie pas encore `fonts/` vers
// `dist/fonts/` au moment de ce commit (action documentée comme restante
// dans DECISIONS-E.md §2.2, à appliquer par F). Pour ne pas dépendre de ce
// commit tiers non encore fait, le petit serveur HTTP de ce test sert
// `dist/` en priorité et retombe sur le répertoire `fonts/` du dépôt pour
// tout chemin `/fonts/*` absent de `dist/` — cela teste les VRAIS fichiers
// auto-hébergés par l'élément E, pas une simulation, et reste valide sans
// changement une fois que F aura ajouté le `cpSync` dans `build.mjs` (à ce
// moment `dist/fonts/*` existera directement et le repli ne sera plus
// sollicité).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path, { extname } from 'node:path';
import { expect, test } from '@playwright/test';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const FONTS_FALLBACK = path.join(ROOT, 'fonts');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
};

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function startStaticServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    (async () => {
      const reqPath = (req.url || '/').split('?')[0];
      let filePath = path.join(DIST, reqPath === '/' ? 'index.html' : reqPath);
      if (!filePath.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
      if (reqPath.startsWith('/fonts/') && !(await exists(filePath))) {
        // Repli documenté ci-dessus : dist/fonts/ n'existe pas encore tant
        // que build.mjs (élément F) n'a pas appliqué DECISIONS-E.md §2.2.
        filePath = path.join(FONTS_FALLBACK, reqPath.slice('/fonts/'.length));
      }
      try {
        const body = await readFile(filePath);
        res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
        res.end(body);
      } catch {
        res.writeHead(404);
        res.end('not found');
      }
    })();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  };
}

test('aucune requête externe vers Google Fonts au chargement de la page', async ({ page }) => {
  const server = await startStaticServer();
  try {
    const externalFontRequests: string[] = [];
    page.on('request', req => {
      const url = req.url();
      if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
        externalFontRequests.push(url);
      }
    });
    const pageErrors: string[] = [];
    page.on('pageerror', err => pageErrors.push(String(err)));

    await page.goto(server.url);
    await page.locator('#btn-privacy-accept').click();
    await expect(page.locator('.preset-card').first()).toBeVisible();

    // Laisse le temps aux @font-face déclarés dans fonts/fonts.css d'être
    // effectivement résolus (font-display: swap peut différer le fetch).
    await page.waitForTimeout(300);

    expect(externalFontRequests).toEqual([]);
    expect(pageErrors).toEqual([]);

    // Vérifie que la feuille locale est bien référencée (et pas un import
    // Google Fonts résiduel) et que les polices réellement utilisées à
    // l'écran de démarrage sont chargées depuis les fichiers locaux.
    const fontsUsed = await page.evaluate(async () => {
      await (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready;
      const fontFaces = Array.from((document as unknown as { fonts: Iterable<{ family: string; status: string }> }).fonts);
      return fontFaces.map(f => `${f.family}:${f.status}`);
    });
    expect(fontsUsed.some(f => f.startsWith('Inter:') && f.endsWith(':loaded'))).toBe(true);
  } finally {
    await server.close();
  }
});
