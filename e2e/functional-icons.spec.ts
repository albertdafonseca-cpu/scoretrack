// Élément H (round 4, post-clôture) — remplacement des émojis système
// utilisés comme icônes fonctionnelles (🏆 victoire, 🏁 fin de manche /
// dernier perdant, 💀 élimination, 🔒 confidentialité — P1 #7 du constat
// initial) par de vraies icônes SVG inline dessinées à la main (voir
// src/ui-icons.ts, docs/audit/DECISIONS-H.md).
//
// Ce test vérifie, sur le DOM RÉELLEMENT rendu (pas une valeur théorique) :
// 1. qu'aucun des quatre émojis n'apparaît plus nulle part à l'écran ;
// 2. que la bonne icône SVG (silhouette précise, pas seulement « une icône
//    quelconque ») apparaît dans chaque état (victoire championne, finisher/
//    dernier perdant, élimination, confidentialité) ;
// 3. que chaque icône reste une silhouette structurellement distincte des
//    trois autres (D-CLAUDE-2/D-PREF-1 : distinction non chromatique).
//
// Les chaînes SVG attendues sont importées directement depuis
// `src/ui-icons.ts` (module pur, sans DOM ni dépendance) plutôt que
// recopiées à la main : un changement de dessin dans `ui-icons.ts` sans
// mise à jour de ce test resterait donc détecté comme une régression
// ailleurs (mutation testing, voir le corps du test ci-dessous), jamais
// comme un faux négatif silencieux.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path, { extname } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { ICON_FLAG, ICON_LOCK, ICON_SKULL, ICON_TROPHY } from '../src/ui-icons';

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

const EMOJI_RE = /💀|🏆|🔒|🏁/u;

/** `outerHTML` de tout le sous-arbre `<body>`, pour une recherche d'émoji
 *  résiliente (pas seulement `textContent`, au cas où un futur changement
 *  réintroduirait l'émoji dans un attribut plutôt qu'un texte). */
async function bodyHtml(page: Page): Promise<string> {
  return page.evaluate(() => document.body.innerHTML);
}

async function gotoPastPrivacy(page: Page, url: string) {
  await page.goto(url);
  await page.locator('#btn-privacy-accept').click();
  await expect(page.locator('.preset-card').first()).toBeVisible();
}

/** Normalise un fragment SVG en le faisant passer par le DOM du NAVIGATEUR
 *  (pas Node) avant de le comparer : Chromium re-sérialise les balises vides
 *  (`<rect/>` -> `<rect></rect>`) différemment de la chaîne source, ce qui
 *  casserait une comparaison de chaîne brute même quand le contenu réel est
 *  identique. En construisant aussi la référence attendue via ce même DOM
 *  (au lieu de comparer du HTML sérialisé par le navigateur à une chaîne
 *  TypeScript non passée par un navigateur), les deux côtés subissent
 *  exactement la même normalisation et une vraie différence de contenu
 *  reste, elle, détectée. */
async function normalizeSvgInBrowser(page: Page, svg: string): Promise<string> {
  return page.evaluate((s: string) => {
    const div = document.createElement('div');
    div.innerHTML = s;
    return div.innerHTML;
  }, svg);
}

test.describe('Icônes fonctionnelles SVG (élément H) — remplacement des émojis système', () => {
  test('aucun émoji 💀/🏆/🔒/🏁 nulle part sur l\'écran de démarrage', async ({ page }) => {
    const server = await startStaticServer();
    try {
      await gotoPastPrivacy(page, server.url);
      expect(await bodyHtml(page)).not.toMatch(EMOJI_RE);
    } finally {
      await server.close();
    }
  });

  test('confidentialité : icône cadenas SVG dans le bouton et dans le titre de la page', async ({ page }) => {
    const server = await startStaticServer();
    try {
      await gotoPastPrivacy(page, server.url);
      await page.locator('#theme-gear-btn').click();
      await expect(page.locator('#btn-privacy-txt')).toBeVisible();

      // Bouton d'accès à la politique de confidentialité.
      const btnSvg = page.locator('#btn-privacy-txt svg.ui-icon');
      await expect(btnSvg).toHaveCount(1);
      expect(await bodyHtml(page)).not.toMatch(EMOJI_RE);

      await page.locator('#btn-privacy-txt').click();
      await expect(page.locator('#privacy-title-txt')).toBeVisible();
      const titleSvg = page.locator('#privacy-title-txt svg.ui-icon');
      await expect(titleSvg).toHaveCount(1);
      expect(await bodyHtml(page)).not.toMatch(EMOJI_RE);

      // La même icône que src/ui-icons.ts (ICON_LOCK), pas une approximation.
      const titleOuter = await page.locator('#privacy-title-txt').innerHTML();
      expect(titleOuter).toContain('<svg class="ui-icon"');
      const expectedLock = await normalizeSvgInBrowser(page, ICON_LOCK);
      expect(titleOuter).toContain(expectedLock);

      await page.screenshot({ path: 'test-results/h-privacy-lock.png' });
    } finally {
      await server.close();
    }
  });

  // `#winner-modal` vit dans `#game-screen` (masqué par `display:none` tant
  // qu'aucune partie n'est lancée) : un ancêtre `display:none` ne met pas
  // seulement l'élément hors-écran, il retire tout le sous-arbre du rendu —
  // `position:fixed` ou pas, sa boîte englobante devient 0×0 (vérifié en
  // inspectant `getBoundingClientRect()` avant ce correctif de test). Le
  // contenu DOM (donc l'icône) reste correct même hors écran de jeu, mais la
  // capture d'écran de preuve visuelle exige un vrai écran de jeu actif —
  // d'où le lancement réel d'une partie ci-dessous, comme le fait déjà
  // `e2e/accessibility-basics.spec.ts` pour `#score-modal`/`#dice-overlay`.
  async function startRealGame(page: Page) {
    await page.locator('.preset-card').first().click();
    await expect(page.locator('#go-btn')).toBeEnabled();
    await page.locator('#go-btn').click();
    await page.locator('#names-go-btn').click();
    await page.locator('.pcard .score').first().waitFor();
  }

  test('victoire (champion unique) : trophée SVG dans #winner-icon', async ({ page }) => {
    const server = await startStaticServer();
    try {
      await gotoPastPrivacy(page, server.url);
      await startRealGame(page);
      await page.evaluate(() => {
        (window as unknown as { ScoreTrack: { game: { showWinnerModal: (b: boolean) => void } } })
          .ScoreTrack.game.showWinnerModal(true);
      });
      await expect(page.locator('#winner-modal')).not.toHaveClass(/hidden/);
      await expect(page.locator('#winner-modal .modal-box')).toBeVisible();
      const html = await page.locator('#winner-icon').innerHTML();
      expect(html).toContain('<svg class="ui-icon"');
      expect(html).toBe(await normalizeSvgInBrowser(page, ICON_TROPHY));
      expect(html).not.toMatch(EMOJI_RE);
      await page.screenshot({ path: 'test-results/h-winner-trophy.png' });
    } finally {
      await server.close();
    }
  });

  test('finisher / dernier perdant désigné : drapeau à damier SVG dans #winner-icon', async ({ page }) => {
    const server = await startStaticServer();
    try {
      await gotoPastPrivacy(page, server.url);
      await startRealGame(page);
      await page.evaluate(() => {
        (window as unknown as { ScoreTrack: { game: { showWinnerModal: (b: boolean) => void } } })
          .ScoreTrack.game.showWinnerModal(false);
      });
      await expect(page.locator('#winner-modal .modal-box')).toBeVisible();
      const html = await page.locator('#winner-icon').innerHTML();
      expect(html).toBe(await normalizeSvgInBrowser(page, ICON_FLAG));
      expect(html).not.toMatch(EMOJI_RE);
      await page.screenshot({ path: 'test-results/h-winner-flag.png' });
    } finally {
      await server.close();
    }
  });

  test('élimination : crâne SVG dans la tuile de carte, réellement joué', async ({ page }) => {
    const server = await startStaticServer();
    try {
      await gotoPastPrivacy(page, server.url);
      // Partie réelle à 4 joueurs, préréglage "Magic" (objectif "elim" à 0
      // point, cf. GAME_PRESETS dans src/game.ts) — index 4 du tableau.
      await page.locator('.preset-card').nth(4).click();
      await expect(page.locator('#go-btn')).toBeEnabled();
      await page.locator('#go-btn').click();
      await page.locator('#names-go-btn').click();
      await page.locator('.pcard .score').first().waitFor();

      // Amener le score du premier joueur exactement à 0 (seuil d'élimination
      // du préréglage) via `adjust()`, la vraie fonction déclenchée par le
      // clavier du modal de score (même fonction, pas un raccourci qui
      // contournerait la logique testée) — évite de dépendre du layout
      // exact du pavé numérique, non pertinent pour ce test d'icône.
      const startScore = await page.evaluate(() =>
        (window as unknown as { ScoreTrack: { game: { players: { score: number }[] } } })
          .ScoreTrack.game.players[0].score);
      await page.evaluate((delta) => {
        (window as unknown as { ScoreTrack: { game: { adjust: (i: number, d: number) => void } } })
          .ScoreTrack.game.adjust(0, delta);
      }, -startScore);

      // L'élimination avec ≤2 joueurs encore en jeu déclenche `elim-modal`
      // (confirmation) — avec 4 joueurs tous en jeu, l'élimination est
      // directe (`elimDirect`, une fois l'animation d'élimination terminée,
      // voir `window._afterElimAnim` dans src/animations.ts, hors périmètre) :
      // on couvre donc ici la tuile de carte, le test suivant couvrant la
      // confirmation manuelle (≤2 joueurs).
      await expect(page.locator('.elim-tag .elim-icon').first()).toBeVisible({ timeout: 8000 });
      const cardIconHtml = await page.locator('.elim-tag .elim-icon').first().innerHTML();
      expect(cardIconHtml).toBe(await normalizeSvgInBrowser(page, ICON_SKULL));
      expect(cardIconHtml).not.toMatch(EMOJI_RE);
      await page.screenshot({ path: 'test-results/h-elim-card-skull.png' });

      // Récapitulatif : le badge « Éliminé » porte la même icône crâne.
      await page.evaluate(() => {
        (window as unknown as { ScoreTrack: { game: { showRecap: () => void } } })
          .ScoreTrack.game.showRecap();
      });
      const recapHtml = await page.locator('.recap-status.elim').first().innerHTML();
      expect(recapHtml).toContain(await normalizeSvgInBrowser(page, ICON_SKULL));
      expect(await bodyHtml(page)).not.toMatch(EMOJI_RE);
      await page.screenshot({ path: 'test-results/h-recap-skull.png' });
    } finally {
      await server.close();
    }
  });

  test('confirmation d\'élimination manuelle (≤2 joueurs en jeu) : crâne SVG dans #elim-modal', async ({ page }) => {
    const server = await startStaticServer();
    try {
      await gotoPastPrivacy(page, server.url);
      await page.locator('.preset-card').nth(4).click(); // "Magic"
      await page.locator('#players-grid .player-chip').nth(1).click(); // 2 joueurs
      await expect(page.locator('#go-btn')).toBeEnabled();
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
      const elimModalHtml = await page.locator('#elim-modal .winner-icon').innerHTML();
      expect(elimModalHtml).toBe(await normalizeSvgInBrowser(page, ICON_SKULL));
      expect(elimModalHtml).not.toMatch(EMOJI_RE);
      await page.screenshot({ path: 'test-results/h-elim-confirm-skull.png' });
    } finally {
      await server.close();
    }
  });

  test('les 4 icônes restent 4 silhouettes structurellement distinctes (D-CLAUDE-2/D-PREF-1)', async ({ page }) => {
    // Preuve mécanique, complémentaire à la vérification visuelle manuelle
    // (capture + désaturation, voir docs/audit/DECISIONS-H.md §3) : les 4
    // icônes ne doivent jamais partager la même signature structurelle
    // (même construction de `<path>`/`<rect>`), qui est ce qu'un daltonien
    // perçoit réellement (la forme), pas la couleur.
    function fingerprint(svg: string): string {
      const div = { innerHTML: svg } as unknown as { innerHTML: string };
      void div;
      const paths = (svg.match(/<path/g) || []).length;
      const rects = (svg.match(/<rect/g) || []).length;
      const evenodd = (svg.match(/fill-rule="evenodd"/g) || []).length;
      const strokes = (svg.match(/stroke="currentColor"/g) || []).length;
      return `p${paths}-r${rects}-e${evenodd}-s${strokes}`;
    }
    const prints = [ICON_TROPHY, ICON_FLAG, ICON_SKULL, ICON_LOCK].map(fingerprint);
    expect(new Set(prints).size, `signatures attendues toutes différentes : ${prints.join(', ')}`).toBe(4);
  });

  test('round 2 (H-critique-round1.md, P1-3) : #elim-anim-skull utilise ICON_SKULL, plus l\'émoji ☠️, animation intacte', async ({ page }) => {
    // `#elim-anim-skull` (l'émoji le plus visible de toute l'app pendant
    // l'animation d'élimination, occupant la quasi-totalité de l'écran)
    // était volontairement laissé de côté au round 1 (voir
    // docs/audit/DECISIONS-H.md §5) : périmètre étendu par le coordinateur
    // pour ce seul remplacement (BRIEF.md §9). Correctif appliqué
    // UNIQUEMENT dans index.html (markup + une règle CSS `color`) —
    // `src/animations.ts` reste totalement intact (`git diff --stat` vide,
    // vérifié dans DECISIONS-H.md §8) : le mécanisme existant
    // (`skull.style.fontSize=...`, `.ui-icon{width:1em;height:1em}`) suffit
    // à faire grossir une icône SVG exactement comme il faisait grossir un
    // caractère emoji.
    const server = await startStaticServer();
    try {
      await gotoPastPrivacy(page, server.url);
      await page.locator('.preset-card').nth(4).click(); // "Magic" : objectif elim à 0
      await page.locator('#players-grid .player-chip').nth(1).click(); // 2 joueurs -> confirmation manuelle
      await expect(page.locator('#go-btn')).toBeEnabled();
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

      // L'icône SVG remplace bien l'émoji, dès l'apparition de l'overlay.
      await expect(page.locator('#elim-anim-skull svg.ui-icon')).toHaveCount(1, { timeout: 3000 });
      const skullHtml = await page.locator('#elim-anim-skull').innerHTML();
      expect(skullHtml).toBe(await normalizeSvgInBrowser(page, ICON_SKULL));
      expect(skullHtml).not.toMatch(/☠️|💀/u);

      // Animation intacte : la taille (pilotée par `fontSize`, mécanisme
      // inchangé) grossit bien dans le temps, comme avant ce correctif.
      const fontSizeAt = (ms: number) => page.waitForTimeout(ms).then(() =>
        page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('elim-anim-skull')!).fontSize)));
      const early = await fontSizeAt(200);
      const later = await fontSizeAt(500);
      expect(later, `taille attendue croissante : ${early}px puis ${later}px`).toBeGreaterThan(early);

      // Aucune erreur JS pendant toute la séquence (le mécanisme de taille
      // dynamique/`drop-shadow`/rotation d'`animations.ts`, non modifié,
      // continue de s'appliquer normalement à un <svg> plutôt qu'à du texte).
      const pageErrors: string[] = [];
      page.on('pageerror', e => pageErrors.push(String(e)));
      await page.waitForTimeout(2000);
      expect(pageErrors).toEqual([]);

      await page.screenshot({ path: 'test-results/h-elim-anim-skull-svg.png' });
    } finally {
      await server.close();
    }
  });
});
