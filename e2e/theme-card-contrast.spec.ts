// Point de départ mesurable de la refonte visuelle demandée par l'utilisateur
// (plutôt qu'une opinion esthétique) : audit de contraste WCAG réel
// (getComputedStyle sur le DOM rendu, pas une lecture théorique du CSS
// source) sur les 22 thèmes × 10 couleurs de carte de l'écran de jeu, pour
// le nom du joueur (.pplayer), les signes +/- (.tap-sign-*) et le score
// (.score). Trois rounds de correctifs, tous dans css/app.css :
//
// 1. .pplayer et .tap-sign-* avaient une couleur figée à blanc (#fff),
//    pensée pour les thèmes sombres. `light` et `mono-light` avaient déjà
//    leur propre correctif (color:#111) ; 8 autres thèmes clairs en
//    héritaient silencieusement — contraste mesuré ~1.2-1.6:1 (quasi
//    illisible). Corrigé en réutilisant var(--text), déjà correct par thème.
// 2. `cyber-light` n'avait pas d'override pour `.pcard.color-10`, retombant
//    sur le magenta SOMBRE par défaut dans un thème clair (1.28:1). Override
//    ajouté, aligné sur les 7 autres thèmes clairs pour cette même couleur.
// 3. Le score (.score, couleur = --accent) restait illisible sur plusieurs
//    thèmes : `nature`/`ocean` (thèmes sombres) avaient une palette de
//    cartes délibérément grisée/claire (luminance ~0.35-0.45) trop proche à
//    la fois du texte ET de l'accent — jusqu'à 1.01:1, quasi invisible sur
//    9 cartes chacun. Cartes assombries (mise à l'échelle RGB uniforme :
//    même teinte relative, luminance variée de carte à carte pour rester
//    distinguables entre elles — repère daltonien par la luminance, jamais
//    la seule teinte). Dépassements plus mineurs (2.75-2.96:1) sur `cyber`
//    et 3 thèmes clairs partageant le même accent (#997700) : cartes
//    légèrement éclaircies/assombries par la même méthode.
//
// Résultat : les 220 combinaisons passent les seuils WCAG (4.5:1 texte
// normal pour le nom, 3:1 pour le score — énorme, donc « grand texte » — et
// les signes +/-). Ce test vérifie l'ensemble de la matrice pour empêcher
// toute régression future, sur n'importe quel thème.
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

const ALL_THEMES = [
  'cyber', 'cyber-light', 'dark', 'dark-light', 'neon-pink', 'neon-pink-light',
  'arcade', 'arcade-light', 'nature', 'nature-light', 'sunset', 'sunset-light',
  'ocean', 'ocean-light', 'gold', 'gold-light', 'sobre', 'light', 'mono',
  'mono-light', 'ldm', 'ldm-day',
];

test.describe('Contraste WCAG — nom, score et signes +/- sur les cartes (22 thèmes × 10 couleurs)', () => {
  test('les 220 combinaisons atteignent >= 4.5:1 (nom), >= 3:1 (score, grand texte) et >= 3:1 (signes)', async ({ page }) => {
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

      const failures: string[] = [];
      for (const theme of ALL_THEMES) {
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
          const score = card.querySelector('.score');
          return {
            cls: [...card.classList].find(c => c.startsWith('color-')),
            nameContrast: name ? contrast(bg, getComputedStyle(name).color) : null,
            signContrast: sign ? contrast(bg, getComputedStyle(sign).color) : null,
            scoreContrast: score ? contrast(bg, getComputedStyle(score).color) : null,
          };
        }));

        for (const d of data) {
          if (d.nameContrast !== null && d.nameContrast < 4.5) {
            failures.push(`${theme} / ${d.cls} : nom ${d.nameContrast.toFixed(2)}:1`);
          }
          if (d.signContrast !== null && d.signContrast < 3) {
            failures.push(`${theme} / ${d.cls} : signe +/- ${d.signContrast.toFixed(2)}:1`);
          }
          if (d.scoreContrast !== null && d.scoreContrast < 3) {
            failures.push(`${theme} / ${d.cls} : score ${d.scoreContrast.toFixed(2)}:1`);
          }
        }
      }
      expect(failures, failures.join('\n')).toEqual([]);
    } finally {
      await server.close();
    }
  });
});
