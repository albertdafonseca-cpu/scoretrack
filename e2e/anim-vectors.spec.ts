// Élément H, round 3 (docs/audit/H-critique-round2.md, périmètre étendu à
// deux points précis de src/animations.ts, voir docs/audit/BRIEF.md §9) :
// vérification comportementale réelle (pas seulement une inspection de
// source, voir tests/animations-icons.test.ts) que les deux animations
// concernées fonctionnent toujours correctement, sur plusieurs instants
// réels de l'animation — pas un seul instant figé.
//
// Piège de mesure signalé par le critique round 2 (H-critique-round2.md
// §2) : `page.waitForTimeout(ms)` côté test sous-estime le temps réel
// écoulé côté page à cause du coût des allers-retours Playwright/CDP.
// `waitRealMs` ci-dessous programme l'attente ENTIÈREMENT dans le
// navigateur (un `setTimeout` dont la promesse résout après le délai réel
// écoulé côté page), pour échantillonner à des instants fiables.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path, { extname } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

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

/** Attend `ms` millisecondes de temps RÉEL côté navigateur (pas côté Node) :
 *  voir le commentaire d'en-tête sur le piège `waitForTimeout`. */
async function waitRealMs(page: Page, ms: number): Promise<void> {
  await page.evaluate((d) => new Promise<void>(resolve => setTimeout(resolve, d)), ms);
}

/** Nombre de pixels dont le canal alpha dépasse un seuil, sur un canvas
 *  identifié par id — mesure réelle sur les pixels rendus, pas une
 *  supposition sur ce que le code est censé dessiner. */
async function countInkPixels(page: Page, canvasId: string, alphaThreshold = 20): Promise<number> {
  return page.evaluate(({ canvasId, alphaThreshold }) => {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
    if (!canvas || canvas.width === 0 || canvas.height === 0) return 0;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 0;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let count = 0;
    for (let i = 3; i < data.length; i += 4) { if (data[i] > alphaThreshold) count++; }
    return count;
  }, { canvasId, alphaThreshold });
}

/** Nombre de pixels dont la couleur RGB s'écarte notablement d'une couleur
 *  de fond donnée — sert à détecter un dessin par-dessus un fond uni
 *  (`fin-anim-canvas`, qui est toujours peint en fond `rgba(0,0,0,0.94)`
 *  avant que quoi que ce soit d'autre ne soit dessiné dessus). */
async function countNonBackgroundPixels(page: Page, canvasId: string, bg: [number, number, number], tolerance = 12): Promise<number> {
  return page.evaluate(({ canvasId, bg, tolerance }) => {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
    if (!canvas || canvas.width === 0 || canvas.height === 0) return 0;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 0;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      const dr = Math.abs(data[i] - bg[0]), dg = Math.abs(data[i + 1] - bg[1]), db = Math.abs(data[i + 2] - bg[2]);
      if (dr > tolerance || dg > tolerance || db > tolerance) count++;
    }
    return count;
  }, { canvasId, bg, tolerance });
}

async function gotoPastPrivacy(page: Page, url: string) {
  await page.goto(url);
  await page.locator('#btn-privacy-accept').click();
  await expect(page.locator('.preset-card').first()).toBeVisible();
}

test.describe('Animations vectorielles (élément H, round 3) — plus de fillText emoji', () => {
  test('explosion d\'élimination : fragments vectoriels réellement dessinés à plusieurs instants, puis disparaissent', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(String(e)));
    const server = await startStaticServer();
    try {
      await gotoPastPrivacy(page, server.url);
      await page.locator('.preset-card').nth(4).click(); // "Magic" : objectif elim à 0
      await page.locator('#players-grid .player-chip').nth(1).click(); // 2 joueurs
      await page.locator('#go-btn').click();
      await page.locator('#names-go-btn').click();
      await page.locator('.pcard .score').first().waitFor();

      const startScore = await page.evaluate(() =>
        (window as unknown as { ScoreTrack: { game: { players: { score: number }[] } } })
          .ScoreTrack.game.players[0].score);
      await page.evaluate((delta) => {
        (window as unknown as { ScoreTrack: { game: { adjust: (i: number, d: number) => void } } })
          .ScoreTrack.game.adjust(0, delta);
      }, -startScore);
      await expect(page.locator('#elim-modal')).not.toHaveClass(/hidden/, { timeout: 5000 });
      await page.locator('#btn-elim-confirm-txt').click();

      // Les fragments naissent vers T_FLASH+ft>0.4 (~1950ms+) et vivent 3000ms
      // (voir spawnFragments/animateFragments, src/animations.ts) : on
      // échantillonne à plusieurs instants réels pendant cette fenêtre.
      const samples: { atMs: number; ink: number }[] = [];
      let elapsed = 0;
      for (const target of [2100, 2400, 2700, 3000, 3400]) {
        await waitRealMs(page, target - elapsed);
        elapsed = target;
        const ink = await countInkPixels(page, 'elim-anim-noise');
        samples.push({ atMs: target, ink });
      }
      const activeSamples = samples.filter(s => s.ink > 0);
      expect(activeSamples.length, `échantillons avec de l'encre : ${JSON.stringify(samples)}`).toBeGreaterThanOrEqual(3);

      // Après la durée de vie des fragments (3000ms après leur naissance,
      // donc largement avant T_TOTAL=5000ms de l'animation globale), le
      // canvas doit être réellement vidé (animateFragments s'arrête et le
      // efface) — pas laissé rempli indéfiniment.
      await waitRealMs(page, 5200 - elapsed);
      const inkAfter = await countInkPixels(page, 'elim-anim-noise');
      expect(inkAfter, 'le canvas de fragments doit être vidé une fois leur durée de vie écoulée').toBe(0);

      expect(errors).toEqual([]);
      await page.screenshot({ path: 'test-results/h-r3-frag-skulls.png' });
    } finally {
      await server.close();
    }
  });

  test('animation finisher : voiture F1 vectorielle réellement dessinée à plusieurs instants (chemin de secours forcé en permanence)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(String(e)));
    const server = await startStaticServer();
    try {
      await gotoPastPrivacy(page, server.url);
      await page.locator('.preset-card').first().click();
      await expect(page.locator('#go-btn')).toBeEnabled();
      await page.locator('#go-btn').click();
      await page.locator('#names-go-btn').click();
      await page.locator('.pcard .score').first().waitFor();

      await page.evaluate(() => {
        (window as unknown as { ScoreTrack: { animations: { playFinAnim: (i: number) => void } } })
          .ScoreTrack.animations.playFinAnim(0);
      });

      const bg: [number, number, number] = [0, 0, 0]; // fillRect('rgba(0,0,0,0.94)') de fond
      const samples: { atMs: number; nonBg: number }[] = [];
      let elapsed = 0;
      for (const target of [150, 400, 700, 1000, 1400]) {
        await waitRealMs(page, target - elapsed);
        elapsed = target;
        const nonBg = await countNonBackgroundPixels(page, 'fin-anim-canvas', bg);
        samples.push({ atMs: target, nonBg });
      }
      // À chaque instant échantillonné, un contenu réel (voiture(s), piste,
      // étincelles, confettis, drapeau) doit être dessiné par-dessus le
      // fond uni — preuve que le rendu vectoriel tourne en continu, pas
      // seulement à la première trame.
      const drawingSamples = samples.filter(s => s.nonBg > 500);
      expect(drawingSamples.length, `échantillons avec du contenu dessiné : ${JSON.stringify(samples)}`).toBe(samples.length);

      expect(errors).toEqual([]);
      await page.screenshot({ path: 'test-results/h-r3-fin-f1-vector.png' });
    } finally {
      await server.close();
    }
  });
});
