// Élément G (audit AAA, round 3) — vérification réelle du resserrement de
// la CSP de `vercel.json` : retrait de `'unsafe-inline'` de `script-src`
// UNIQUEMENT (`style-src` le garde, à cause du `<style>` inline
// d'`index.html`, hors périmètre de ce chantier — voir docs/audit/
// DECISIONS-G.md). Ce retrait n'était possible qu'une fois les 65 attributs
// `onclick="..."` remplacés par `addEventListener` (src/main.ts) : c'était
// la seule raison documentée (DECISIONS-F.md §4, D7) de garder
// `'unsafe-inline'` dans `script-src`.
//
// Sert `dist/` en HTTP avec EXACTEMENT les en-têtes de `vercel.json` (lus
// dynamiquement depuis ce fichier, jamais dupliqués en dur ici, pour que ce
// test suive automatiquement tout futur changement de la CSP plutôt que de
// tester une copie figée) — les en-têtes ne s'appliquent jamais en `file://`
// ni via un serveur HTTP qui ne les pose pas explicitement. Un écouteur
// `securitypolicyviolation` posé par `addInitScript` (donc actif dès le tout
// premier script de la page, avant même `dist/app.js`) capture toute
// violation réelle sur un parcours complet : démarrage -> partie -> modal de
// score -> récapitulatif -> export PDF -> lanceur de dés -> dés lancés.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path, { extname } from 'node:path';
import { expect, test } from '@playwright/test';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
};

interface VercelHeaderRule {
  source: string;
  headers: Array<{ key: string; value: string }>;
}

async function loadVercelHeaders(): Promise<Array<[string, string]>> {
  const raw = await readFile(path.join(ROOT, 'vercel.json'), 'utf-8');
  const conf = JSON.parse(raw) as { headers: VercelHeaderRule[] };
  const rule = conf.headers.find(r => r.source === '/(.*)');
  if (!rule) throw new Error('vercel.json : règle d\'en-têtes "/(.*)" introuvable');
  return rule.headers.map(h => [h.key, h.value]);
}

async function startStaticServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const extraHeaders = await loadVercelHeaders();
  const cspHeader = extraHeaders.find(([k]) => k === 'Content-Security-Policy');
  if (!cspHeader) throw new Error('vercel.json : en-tête Content-Security-Policy introuvable');
  // Garde-fou : ce test n'a de sens que si `script-src` ne contient plus
  // 'unsafe-inline' — sinon il ne prouverait rien (une CSP qui autorise tout
  // ne peut pas être violée). Échoue bruyamment si la CSP a été relâchée.
  expect(cspHeader[1]).toMatch(/script-src[^;]*'self'[^;]*;/);
  expect(cspHeader[1].match(/script-src[^;]*/)?.[0]).not.toContain('unsafe-inline');

  const server = createServer((req, res) => {
    (async () => {
      const reqPath = (req.url || '/').split('?')[0];
      const filePath = path.join(DIST, reqPath === '/' ? 'index.html' : reqPath);
      if (!filePath.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
      try {
        const body = await readFile(filePath);
        const headers: Record<string, string> = { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' };
        for (const [k, v] of extraHeaders) headers[k] = v;
        res.writeHead(200, headers);
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

test('CSP resserrée (script-src sans unsafe-inline) : parcours complet sans aucune violation', async ({ page }) => {
  const server = await startStaticServer();
  try {
    const violations: string[] = [];
    const pageErrors: string[] = [];
    page.on('pageerror', err => pageErrors.push(String(err)));
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (e) => {
        (window as unknown as { __cspViolations: string[] }).__cspViolations ??= [];
        (window as unknown as { __cspViolations: string[] }).__cspViolations.push(
          `${e.violatedDirective} :: ${e.blockedURI} :: ${e.sourceFile}:${e.lineNumber}`,
        );
      });
    });

    await page.goto(server.url);
    await page.locator('#btn-privacy-accept').click();
    await expect(page.locator('.preset-card').first()).toBeVisible();

    // Écran de démarrage : quelques-uns des boutons re-câblés (élément G).
    await page.locator('#theme-gear-btn').click();
    await page.locator('#theme-back-btn').click();
    await page.locator('#lang-flag-btn').click();
    await page.locator('#lang-flag-btn').click();

    await page.locator('.preset-card').first().click();
    await page.locator('#go-btn').click();
    await page.locator('#names-go-btn').click();
    await expect(page.locator('.pcard .score').first()).toBeVisible();

    // Modal de score.
    await page.evaluate(() => (window as unknown as { ScoreTrack: { game: { openScoreModal: (i: number) => void } } }).ScoreTrack.game.openScoreModal(0));
    await page.locator('.key-btn', { hasText: /^5$/ }).click();
    await page.locator('#score-modal-confirm-btn').click();

    // Récapitulatif + export PDF (jsPDF bundlé, aucun <script> externe).
    await page.locator('#bar-recap-btn').click();
    await expect(page.locator('#recap')).not.toHaveClass(/\bhidden\b/);
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#btn-pdf-dl').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
    await page.locator('#recap').evaluate(el => el.classList.add('hidden'));

    // Lanceur de dés : ouverture, config, lancer, choix du joueur, fermeture.
    await page.locator('#dice-fab').click();
    await page.locator('#dice-faces-plus').click();
    await page.locator('#dice-faces-minus').click();
    await page.locator('#dice-roll-btn').click();
    await expect(page.locator('#dice-post')).toBeVisible({ timeout: 10000 });
    await page.locator('#dice-add-btn').click();
    await page.locator('#dice-pick-back').click();
    await page.locator('#dice-close-btn').click();

    const collected = await page.evaluate(() => (window as unknown as { __cspViolations?: string[] }).__cspViolations || []);
    violations.push(...collected);

    expect(violations, `violations CSP relevées : ${JSON.stringify(violations, null, 2)}`).toEqual([]);
    expect(pageErrors, `erreurs JS relevées : ${JSON.stringify(pageErrors, null, 2)}`).toEqual([]);
  } finally {
    await server.close();
  }
});
