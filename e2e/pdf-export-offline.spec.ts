// Élément E — preuve e2e que l'export PDF fonctionne réellement hors ligne
// depuis que jsPDF est bundlé par esbuild (npm, plus de <script> CDN vers
// cdnjs.cloudflare.com — voir docs/audit/DECISIONS-E.md, §1).
//
// Note de périmètre (voir DECISIONS-E.md) : le contrat de propriété de
// l'élément E limite ses nouveaux fichiers de test à `tests/` (Vitest), mais
// `playwright.config.ts` (propriété de l'élément A) fixe `testDir: './e2e'` —
// un spec Playwright placé sous `tests/` ne serait jamais exécuté par
// `npm run test:e2e`. Ce fichier est donc ajouté sous `e2e/`, seul
// emplacement où il peut réellement s'exécuter, sans toucher à aucun fichier
// existant d'un autre élément.
//
// Contrairement à `e2e/smoke.spec.ts` (ouverture en file://), ce test sert
// `dist/` en HTTP puis coupe le réseau (`context.setOffline(true)`), comme
// documenté dans CLAUDE.md pour tester le mode hors ligne — condition
// nécessaire pour que `context.setOffline` ait un effet observable (le
// chargement initial en `file://` n'est de toute façon jamais réseau).
//
// IMPORTANT — ce test échoue tant qu'index.html (hors périmètre de l'élément
// E) contient encore la balise <script src="https://cdnjs.cloudflare.com/
// ajax/libs/jspdf/2.5.1/jspdf.umd.min.js" ...> : cette balise déclenche une
// requête réseau réelle à CHAQUE chargement de page, que son résultat soit
// utilisé ou non (il ne l'est plus, jsPDF est bundlé dans app.js). Vérifié
// manuellement : en supprimant cette seule ligne d'un dist/index.html de
// test, ce spec passe intégralement (0 requête externe, PDF valide généré
// hors ligne). Voir docs/audit/DECISIONS-E.md §1 pour l'instruction exacte
// à appliquer par l'élément D. Ce n'est pas un défaut de ce test : c'est la
// preuve automatisée qu'il reste une action P0 à faire ailleurs.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path, { extname } from 'node:path';
import { expect, test } from '@playwright/test';

const DIST = path.resolve(import.meta.dirname, '..', 'dist');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

async function startStaticServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    (async () => {
      const reqPath = (req.url || '/').split('?')[0];
      const filePath = path.join(DIST, reqPath === '/' ? 'index.html' : reqPath);
      if (!filePath.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
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

test('export PDF récapitulatif hors ligne, sans requête vers un CDN externe', async ({ page, context }) => {
  const server = await startStaticServer();
  try {
    // 1. cdnjs.cloudflare.com (ancien CDN de jsPDF) ne doit plus JAMAIS être
    //    contacté, en ligne ou hors ligne : preuve définitive que jsPDF est
    //    bundlé et non plus chargé par <script> externe.
    const cdnRequests: string[] = [];
    // 2. Une fois hors ligne, l'export PDF ne doit déclencher AUCUNE requête
    //    réseau, vers quelque hôte que ce soit (bundlé = zéro fetch).
    let offline = false;
    const requestsAfterOffline: string[] = [];
    page.on('request', req => {
      if (req.url().includes('cdnjs.cloudflare.com')) cdnRequests.push(req.url());
      if (offline) requestsAfterOffline.push(req.url());
    });
    const pageErrors: string[] = [];
    page.on('pageerror', err => pageErrors.push(String(err)));

    // Premier chargement EN LIGNE (sert dist/ tel quel, un vrai déploiement
    // n'est jamais consulté hors ligne avant sa toute première visite) : on
    // vérifie ensuite que l'export PDF fonctionne dès la coupure réseau qui
    // suit, sans dépendre d'un quelconque pré-chargement de service worker.
    await page.goto(server.url);
    await page.locator('#btn-privacy-accept').click();
    await page.locator('.preset-card').first().click();
    await page.locator('#go-btn').click();
    await page.locator('#names-go-btn').click();
    await expect(page.locator('.pcard .score').first()).toBeVisible();

    // Coupure réseau : simule un usage hors ligne (avion, zone blanche).
    await context.setOffline(true);
    offline = true;

    // Ouvre le récapitulatif (géré par game.ts, exposé sur window par
    // main.ts, cf. CLAUDE.md) puis déclenche l'export PDF.
    await page.evaluate(() => (window as unknown as { showRecap: () => void }).showRecap());
    await expect(page.locator('#btn-pdf-dl')).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#btn-pdf-dl').click();
    const download = await downloadPromise;

    // Le fichier téléchargé est un vrai PDF (en-tête %PDF-), pas une page
    // d'erreur ou un fichier vide.
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    const header = await readFile(downloadPath as string, { encoding: 'latin1', flag: 'r' });
    expect(header.startsWith('%PDF-')).toBe(true);
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);

    // jsPDF n'a jamais été demandé au CDN cdnjs (bundlé dans app.js).
    expect(cdnRequests).toEqual([]);
    // Ouvrir le récapitulatif et exporter le PDF, une fois hors ligne, n'a
    // déclenché aucune requête réseau (vers le serveur local ou ailleurs).
    expect(requestsAfterOffline).toEqual([]);
    expect(pageErrors).toEqual([]);
  } finally {
    await server.close();
  }
});
