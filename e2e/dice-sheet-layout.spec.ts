// Deux régressions visuelles trouvées par l'utilisateur en dehors de tout
// audit formel (le rendu 3D des dés est verrouillé par CLAUDE.md, mais
// l'interface autour ne l'est pas — elle n'avait simplement jamais eu de QA
// visuelle écran par écran) :
//
// 1. `#dice-config-toggle` avait une largeur figée (42px, pensée pour une
//    icône ou un libellé court comme « d6 ») : le badge `#dice-type-badge`
//    déborde des deux côtés dès qu'un type de dé s'écrit sur 3-4 caractères
//    (d100, d120). Corrigé en `min-width` + padding horizontal (css/app.css).
// 2. `#dice-fab` (bouton flottant « au centre du plateau ») était positionné
//    en dur à `top:50%;left:50%` du viewport, en supposant que ce point tombe
//    toujours sur une coupure entre cartes. Faux dans les deux sens : dès que
//    le nombre de rangées est impair (6 joueurs, grille 2x3), le centre tombe
//    en plein milieu d'une rangée ; et même quand il tombe sur une vraie
//    coupure de grille (2 joueurs, cartes empilées), le NOM d'une carte
//    tournée à 180°/0° est un bandeau collé pile sur cette coupure (pour
//    rester lisible « vers le centre de la table »). Corrigé par
//    `positionDiceFab()` (src/dice-ui.ts), qui mesure les vrais rectangles
//    `.pplayer` rendus et cherche le plus grand espace libre entre eux,
//    plutôt que de supposer la géométrie de la grille ou des cartes.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path, { extname } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

// ScoreTrack est une app mobile (orientation verrouillée en portrait, gestes
// tactiles) : ce fichier teste des bugs de mise en page qui n'existent qu'à
// largeur de téléphone. Le viewport par défaut de la config (Desktop Chrome,
// ~1280px) masque les deux bugs — la grille de cartes et le bouton flottant
// ont assez de place pour ne jamais se chevaucher à cette largeur.
test.use({ viewport: { width: 390, height: 844 } });

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

async function acceptPrivacy(page: Page): Promise<void> {
  await page.locator('#btn-privacy-accept').click();
  await expect(page.locator('.preset-card').first()).toBeVisible();
}

async function startGameWithPlayers(page: Page, n: number): Promise<void> {
  await page.locator('#players-grid .player-chip', { hasText: new RegExp(`^${n}$`) }).click();
  await page.locator('#start-presets .points-chip[data-val="0"]').click();
  await page.locator('#obj-none').click();
  await page.locator('#go-btn').click();
  // Noms réels (pas les champs vides) : `.pplayer` n'existe que si un nom est
  // saisi (repli `.pplayer-ghost` sinon, largeur nulle, qui ne prouverait rien).
  const inputs = await page.locator('.name-input').all();
  const names = ['Alexandre', 'Béatrice', 'Christophe', 'Dominique', 'Emmanuelle', 'Frédéric', 'Grégoire', 'Henriette'];
  for (let i = 0; i < inputs.length; i++) await inputs[i].fill(names[i] || `Joueur ${i + 1}`);
  await page.locator('#names-go-btn').click();
  await expect(page.locator('.pcard .score').first()).toBeVisible();
}

test.describe('Lanceur de dés — badge de type dans sa capsule', () => {
  test('le badge (d6 court, d100/d120 longs) reste entièrement dans #dice-config-toggle', async ({ page }) => {
    const server = await startStaticServer();
    try {
      await disableServiceWorker(page);
      await page.goto(server.url);
      await acceptPrivacy(page);
      await startGameWithPlayers(page, 2);
      await page.locator('#dice-fab').click();
      await expect(page.locator('#dice-overlay')).not.toHaveClass(/\bhidden\b/);

      for (const faces of [6, 100, 120]) {
        await page.evaluate((f) => {
          const ST = (window as any).ScoreTrack;
          ST.diceUi.diceConfig.faces = f;
          ST.diceUi.diceSaveCfg();
          ST.diceUi.diceRenderConfig();
        }, faces);
        const toggle = await page.locator('#dice-config-toggle').boundingBox();
        const badge = await page.locator('#dice-type-badge').boundingBox();
        expect(toggle, `d${faces}: toggle box`).toBeTruthy();
        expect(badge, `d${faces}: badge box`).toBeTruthy();
        if (!toggle || !badge) continue;
        expect(badge.x, `d${faces}: déborde à gauche`).toBeGreaterThanOrEqual(toggle.x - 0.5);
        expect(badge.x + badge.width, `d${faces}: déborde à droite`).toBeLessThanOrEqual(toggle.x + toggle.width + 0.5);
      }
    } finally {
      await server.close();
    }
  });
});

// Le bouton flottant est CENSÉ chevaucher un peu les bords des cartes (il vit
// sur la coupure entre deux d'entre elles) : ce qui compte, c'est qu'il ne
// touche jamais le NOM d'un joueur. Sur les cartes tournées (joueurs de côté),
// `.pplayer` est une bande verticale collée au bord INTÉRIEUR de la carte —
// donc au plus près de la coupure entre deux cartes — ce qui en fait, mesuré
// en vrai (voir enquête utilisateur), la zone réellement recouverte par le
// bouton avant la correction de `positionDiceFab()` ; `.score-wrap`, plus
// éloigné des bords, ne suffit pas à révéler le bug.
test.describe('Écran de jeu — bouton dé flottant, jamais sur le nom d\'un joueur', () => {
  for (const n of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
    test(`${n} joueurs : le bouton ne recouvre aucun nom`, async ({ page }) => {
      const server = await startStaticServer();
      try {
        await disableServiceWorker(page);
        await page.goto(server.url);
        await acceptPrivacy(page);
        await startGameWithPlayers(page, n);
        await page.waitForTimeout(250); // positionDiceFab() s'exécute après la mise en page (tryFit)

        // Box uniforme {x,y,w,h} : `boundingBox()` de Playwright renvoie
        // `width`/`height`, `getBoundingClientRect()` du navigateur aussi —
        // les deux sont normalisés ici pour ne pas comparer un côté à `undefined`.
        const fabBox = await page.locator('#dice-fab').boundingBox();
        expect(fabBox).toBeTruthy();
        if (!fabBox) return;
        const fab = { x: fabBox.x, y: fabBox.y, w: fabBox.width, h: fabBox.height };
        const zones = await page.$$eval('.pplayer', els => els.map(el => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height };
        }).filter(r => r.w > 0 && r.h > 0));
        expect(zones.length).toBe(n);
        const rectsIntersect = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
          a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
        const overlapping = zones.filter(z => rectsIntersect(fab, z));
        expect(overlapping, `bouton dé sur le nom d'un joueur pour ${n} joueurs`).toHaveLength(0);
      } finally {
        await server.close();
      }
    });
  }
});
