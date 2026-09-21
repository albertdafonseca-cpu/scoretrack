// Amorce de la refonte visuelle demandée par l'utilisateur : plutôt qu'une
// opinion esthétique, un point de départ mesurable — un audit de contraste
// WCAG réel (getComputedStyle, pas une lecture théorique du CSS source) sur
// les 22 thèmes × 10 couleurs de carte.
//
// Trouvaille : le nom du joueur (`.pplayer`) et les signes +/- (`.tap-sign-*`)
// avaient une couleur figée à blanc (`#fff`), pensée pour les thèmes sombres.
// Deux thèmes clairs (`light`, `mono-light`) avaient déjà leur propre
// correctif (`color:#111`) ; les 8 autres thèmes `-light` en héritaient
// silencieusement — contraste mesuré ~1.2-1.6:1 (quasi illisible) contre
// leurs cartes pastel. Corrigé en réutilisant `var(--text)` (déjà correct
// par thème, sombre pour les thèmes clairs) au lieu du blanc figé.
// Trouvaille annexe : `cyber-light` n'avait pas d'override pour
// `.pcard.color-10`, retombant sur le magenta SOMBRE par défaut dans un
// thème clair (1.28:1) — override ajouté, aligné sur les 7 autres thèmes
// clairs pour cette même couleur.
//
// Restent des dépassements distincts et documentés séparément (hors
// périmètre ici) : `nature` et `ocean` (thèmes sombres) ont une palette de
// cartes délibérément grisée/mate dont la luminance est trop proche à la
// fois du texte clair et de la couleur d'accent (score) — un vrai choix de
// couleurs à revoir, pas un oubli mécanique comme les deux ci-dessus.
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
  '.woff2': 'font/woff2',
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

async function disableServiceWorker(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register = () => Promise.reject(new Error('service worker désactivé pour ce test e2e'));
    }
  });
}

// Thèmes concernés par la trouvaille principale (couleur de texte figée à
// blanc) : les 8 thèmes clairs qui n'avaient pas leur propre correctif.
// `light` et `mono-light` (déjà corrects avant cette PR) et `cyber-light`
// (correctif dédié testé séparément ci-dessous) ne sont pas répétés ici.
const FIXED_LIGHT_THEMES = [
  'dark-light', 'neon-pink-light', 'arcade-light',
  'nature-light', 'sunset-light', 'ocean-light', 'gold-light',
];

test.describe('Contraste WCAG — nom de joueur et signes +/- sur les cartes', () => {
  test('les 7 thèmes clairs corrigés atteignent >= 4.5:1 (nom) et >= 3:1 (signes) sur les 10 couleurs de carte', async ({ page }) => {
    const server = await startStaticServer();
    try {
      await disableServiceWorker(page);
      await page.goto(server.url);
      await page.locator('#btn-privacy-accept').click();
      await page.locator('#players-grid .player-chip', { hasText: /^10$/ }).click();
      await page.locator('#start-presets .points-chip[data-val="0"]').click();
      await page.locator('#obj-none').click();
      await page.locator('#go-btn').click();
      const inputs = await page.locator('.name-input').all();
      for (let i = 0; i < inputs.length; i++) await inputs[i].fill(`Joueur${i + 1}`);
      await page.locator('#names-go-btn').click();
      await expect(page.locator('.pcard .score').first()).toBeVisible();

      for (const theme of FIXED_LIGHT_THEMES) {
        await page.evaluate((t) => {
          (window as unknown as { ScoreTrack: { game: { applyTheme: (id: string) => void } } })
            .ScoreTrack.game.applyTheme(t);
        }, theme);
        await page.waitForTimeout(80);

        const data = await page.$$eval('.pcard', cards => cards.map(card => {
          function relLum(rgb: string): number {
            const m = rgb.match(/\d+(\.\d+)?/g);
            if (!m) return 0;
            const [r, g, b] = m.slice(0, 3).map(Number).map((c) => {
              const s = c / 255;
              return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
            });
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
          }
          function contrast(a: string, b: string): number {
            const l1 = relLum(a), l2 = relLum(b);
            const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
            return (hi + 0.05) / (lo + 0.05);
          }
          const bg = getComputedStyle(card).backgroundColor;
          const name = card.querySelector('.pplayer');
          const sign = card.querySelector('.tap-sign-minus');
          return {
            cls: [...card.classList].find(c => c.startsWith('color-')),
            nameContrast: name ? contrast(bg, getComputedStyle(name).color) : null,
            signContrast: sign ? contrast(bg, getComputedStyle(sign).color) : null,
          };
        }));

        for (const d of data) {
          expect(d.nameContrast, `${theme} / ${d.cls} : contraste nom`).toBeGreaterThanOrEqual(4.5);
          expect(d.signContrast, `${theme} / ${d.cls} : contraste signe +/-`).toBeGreaterThanOrEqual(3);
        }
      }
    } finally {
      await server.close();
    }
  });

  test('cyber-light : la carte color-10 (override manquant) atteint >= 4.5:1', async ({ page }) => {
    const server = await startStaticServer();
    try {
      await disableServiceWorker(page);
      await page.goto(server.url);
      await page.locator('#btn-privacy-accept').click();
      await page.locator('#players-grid .player-chip', { hasText: /^10$/ }).click();
      await page.locator('#start-presets .points-chip[data-val="0"]').click();
      await page.locator('#obj-none').click();
      await page.locator('#go-btn').click();
      const inputs = await page.locator('.name-input').all();
      for (let i = 0; i < inputs.length; i++) await inputs[i].fill(`Joueur${i + 1}`);
      await page.locator('#names-go-btn').click();
      await expect(page.locator('.pcard .score').first()).toBeVisible();
      await page.evaluate(() => {
        (window as unknown as { ScoreTrack: { game: { applyTheme: (id: string) => void } } })
          .ScoreTrack.game.applyTheme('cyber-light');
      });
      await page.waitForTimeout(80);

      const ratio = await page.$eval('.pcard.color-10', card => {
        function relLum(rgb: string): number {
          const m = rgb.match(/\d+(\.\d+)?/g);
          if (!m) return 0;
          const [r, g, b] = m.slice(0, 3).map(Number).map((c) => {
            const s = c / 255;
            return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        }
        const bg = getComputedStyle(card).backgroundColor;
        const name = card.querySelector('.pplayer')!;
        const l1 = relLum(bg), l2 = relLum(getComputedStyle(name).color);
        const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
        return (hi + 0.05) / (lo + 0.05);
      });
      expect(ratio, `cyber-light / color-10 : contraste nom mesuré ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    } finally {
      await server.close();
    }
  });
});
