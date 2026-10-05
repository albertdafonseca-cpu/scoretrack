// Refonte visuelle — phase 2 : audit des tailles de zones tactiles (WCAG
// 2.5.8 AA, minimum 24×24px CSS). Même méthode que la phase 1 (contraste,
// voir theme-card-contrast.spec.ts) : une mesure sur le DOM réellement
// rendu plutôt qu'une opinion visuelle, passée sur tous les écrans
// principaux et quelques modales.
//
// Un seul vrai dépassement trouvé : la poignée du tiroir d'actions
// (#bar-handle-zone, Undo/Rotation/Récap/Thème/Reset) mesurait 13px de haut
// à l'état fermé (padding 5px/4px) — sous le minimum, alors que c'est le
// SEUL moyen d'atteindre ces 5 actions de jeu (le tiroir se referme de
// lui-même après 3s d'inactivité une fois ouvert, src/game.ts
// initBarDrawer). Corrigé en portant le padding à 11px/10px (css/app.css) :
// l'indicateur visuel (36×4px) ne change pas, seule sa marge de respiration
// grandit. Une fois ouvert, les boutons eux-mêmes mesurent déjà 72×45px,
// confirmé par ce test.
//
// Les deux autres pistes explorées n'étaient pas de vrais dépassements :
// les pastilles de couleur du sélecteur de thème (.theme-swatch, 18×18px)
// sont décoratives — c'est toute la carte (.theme-card) qui porte le clic,
// vérifié dans src/game.ts (renderThemeGrid) — et les boutons compacts du
// lanceur de dés (sélecteur de type, pas +/-) restent tous ≥27px, au-dessus
// du seuil WCAG même si en dessous de la recommandation de confort 44px :
// une grille 14 types sur une feuille à hauteur fixe (verrouillée par
// CLAUDE.md) n'a pas la place de les agrandir sans rouvrir ce verrouillage,
// hors de portée de ce correctif ciblé.
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

test.use({ viewport: { width: 390, height: 844 } });

test.describe('Tiroir d\'actions du jeu — zone tactile WCAG 2.5.8', () => {
  test('la poignée (état fermé) atteint >= 24px de haut ; les boutons (état ouvert) restent >= 44px', async ({ page }) => {
    const server = await startStaticServer();
    try {
      await disableServiceWorker(page);
      await page.goto(server.url);
      await page.locator('#btn-privacy-accept').click();
      await page.locator('#players-grid .player-chip', { hasText: /^2$/ }).click();
      await page.locator('#start-presets .points-chip[data-val="0"]').click();
      await page.locator('#obj-none').click();
      await page.locator('#go-btn').click();
      const inputs = await page.locator('.name-input').all();
      for (let i = 0; i < inputs.length; i++) await inputs[i].fill(`Joueur${i + 1}`);
      await page.locator('#names-go-btn').click();
      await expect(page.locator('.pcard .score').first()).toBeVisible();

      // État fermé (par défaut à l'arrivée sur l'écran de jeu) : seule la
      // poignée est visible/cliquable, c'est elle qui doit atteindre 24px.
      const handleClosed = await page.locator('#bar-handle-zone').boundingBox();
      expect(handleClosed, 'poignée introuvable').toBeTruthy();
      expect(handleClosed!.height, `poignée fermée : ${handleClosed!.height}px`).toBeGreaterThanOrEqual(24);

      // État ouvert : les 5 boutons d'action doivent rester confortables (44px).
      await page.locator('#bar-handle-zone').click();
      await expect(page.locator('#bar')).toHaveClass(/\bopen\b/);
      await page.waitForTimeout(300); // transition CSS (max-height) avant mesure
      for (const id of ['undo-btn', 'bar-rotate-btn', 'bar-recap-btn', 'bar-theme-btn', 'bar-reset-btn']) {
        const box = await page.locator(`#${id}`).boundingBox();
        expect(box, `#${id} introuvable ou invisible`).toBeTruthy();
        expect(box!.width, `#${id} largeur : ${box!.width}px`).toBeGreaterThanOrEqual(44);
        expect(box!.height, `#${id} hauteur : ${box!.height}px`).toBeGreaterThanOrEqual(44);
      }
    } finally {
      await server.close();
    }
  });
});
