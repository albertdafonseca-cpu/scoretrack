// Élément G (audit AAA, round 3, post-clôture) — filet de sécurité pour le
// remplacement des 65 attributs `onclick="..."` d'`index.html` par un
// câblage `addEventListener` explicite dans `src/main.ts` (voir
// docs/audit/DECISIONS-G.md). Ce fichier ne re-teste pas la logique métier
// de `src/game.ts`/`src/dice-ui.ts`/`src/animations.ts` (déjà couverte par
// les tests unitaires Vitest et les e2e existants) : il prouve que CHAQUE
// bouton/élément qui portait un `onclick` déclenche encore, après le
// refactor, exactement le même comportement observable qu'avant.
//
// Sert `dist/` en HTTP (comme e2e/accessibility-basics.spec.ts) plutôt que
// `file://` : nécessaire pour la future vérification CSP (e2e/csp-script-
// src.spec.ts), et sans incidence ici.
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

/** Empêche l'enregistrement du service worker pour ces tests : sans cela, sa
 *  bannière « mise à jour disponible » (`src/sw.ts`, hors périmètre de cet
 *  élément — elle se déclenche à CHAQUE activation, pas seulement lors d'une
 *  vraie mise à jour) peut apparaître en cours de test sur un scénario un
 *  peu long et intercepter des clics sans rapport avec elle. N'affecte
 *  aucun des 65 gestionnaires testés ici (aucun ne dépend du SW). */
async function disableServiceWorker(page: Page): Promise<void> {
  // `page.route('**/sw.js', ...)` n'intercepte pas fiablement la requête
  // interne de `navigator.serviceWorker.register()` sous Chromium/Playwright ;
  // neutraliser directement la méthode (avant tout script de page, via
  // `addInitScript`) est la manière fiable de constater ici qu'aucun test ne
  // doit dépendre du service worker.
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

/** Configure une partie personnalisée (pas un préréglage) à 2 joueurs, sans
 *  passer par les préréglages, pour exercer les chips objectif/points de
 *  l'écran de démarrage (une partie de la surface des 65 `onclick`). Utilise
 *  les chips `#players-grid`/`#start-presets` (câblage dynamique préexistant,
 *  hors périmètre de cet élément) uniquement comme point d'entrée neutre. */
async function configureCustomGame(
  page: Page,
  opts: { objectif: 'win' | 'elim' | 'none'; objectifVal?: number; singleWinner?: boolean; lastLoser?: boolean },
): Promise<void> {
  await page.locator('#players-grid .player-chip', { hasText: /^2$/ }).click();
  await page.locator('#start-presets .points-chip[data-val="0"]').click();
  if (opts.objectif === 'win') await page.locator('#obj-win').click();
  else if (opts.objectif === 'elim') await page.locator('#obj-elim').click();
  else await page.locator('#obj-none').click();
  if (opts.objectifVal !== undefined) {
    await page.locator(`#objectif-presets .points-chip[data-oval="${opts.objectifVal}"]`).click();
  }
  if (opts.singleWinner) await page.locator('#row-single-winner').click();
  if (opts.lastLoser) await page.locator('#row-last-loser').click();
  await expect(page.locator('#go-btn')).toBeEnabled();
  await page.locator('#go-btn').click();
  await page.locator('#names-go-btn').click();
  await expect(page.locator('.pcard .score').first()).toBeVisible();
}

test.describe('Câblage des anciens onclick — écran de démarrage', () => {
  test('chips objectif (Victoire/Défaite/No limit) + chips de points : sélection mutuelle, go-btn réagit', async ({ page }) => {
    const server = await startStaticServer();
    try {
      await disableServiceWorker(page);
      await page.goto(server.url);
      await acceptPrivacy(page);
      await page.locator('#players-grid .player-chip', { hasText: /^2$/ }).click();
      await page.locator('#start-presets .points-chip[data-val="0"]').click();

      // Le tout premier lancement applique un préréglage par défaut
      // (applyDefaults(), src/game.ts) dont le mode objectif n'est pas
      // forcément "No limit" — le clic ci-dessous fixe un état de départ
      // connu plutôt que de supposer celui laissé par le préréglage.
      await page.locator('#obj-none').click();
      await expect(page.locator('#obj-none')).toHaveClass(/\bon\b/);
      await expect(page.locator('#go-btn')).toBeEnabled();

      // Cas 4 (appel composé) : clic sur "Défaite" doit désactiver "No limit"
      // ET activer "Défaite" (clearPresetSelection(); selectObjectif('elim')).
      await page.locator('#obj-elim').click();
      await expect(page.locator('#obj-elim')).toHaveClass(/\bon\b/);
      await expect(page.locator('#obj-none')).not.toHaveClass(/\bon\b/);
      // selectObjectif('elim') (src/game.ts) sélectionne automatiquement la
      // chip "0" quand aucune valeur n'est déjà active -> go-btn est déjà
      // activable avec cette valeur par défaut.
      await expect(page.locator('#objectif-presets .points-chip[data-oval="0"]')).toHaveClass(/\bon\b/);
      await expect(page.locator('#go-btn')).toBeEnabled();

      // Cas 7 (groupe de chips par data-*) : sélection d'une autre valeur d'objectif.
      await page.locator('#objectif-presets .points-chip[data-oval="50"]').click();
      await expect(page.locator('#objectif-presets .points-chip[data-oval="50"]')).toHaveClass(/\bon\b/);
      await expect(page.locator('#go-btn')).toBeEnabled();

      // Cas 4 à nouveau : "Victoire" désactive "Défaite" et la chip 50 restait
      // active jusqu'à la resélection.
      await page.locator('#obj-win').click();
      await expect(page.locator('#obj-win')).toHaveClass(/\bon\b/);
      await expect(page.locator('#obj-elim')).not.toHaveClass(/\bon\b/);
    } finally {
      await server.close();
    }
  });

  test('options de victoire : "fin dès la première victoire" et "dernier joueur perdant" s\'excluent', async ({ page }) => {
    const server = await startStaticServer();
    try {
      await disableServiceWorker(page);
      await page.goto(server.url);
      await acceptPrivacy(page);
      await page.locator('#players-grid .player-chip', { hasText: /^2$/ }).click();
      await page.locator('#start-presets .points-chip[data-val="0"]').click();
      await page.locator('#obj-win').click();
      await page.locator('#objectif-presets .points-chip[data-oval="50"]').click();
      await expect(page.locator('#win-options')).toBeVisible();

      // "Dernier joueur perdant" d'abord (aucune des deux options n'est
      // encore désactivée dans cet ordre — voir note ci-dessous).
      await page.locator('#row-last-loser').click();
      await expect(page.locator('#toggle-last-loser')).toHaveClass(/\bon\b/);
      await expect(page.locator('#toggle-single-winner')).not.toHaveClass(/\bon\b/);

      // Incompatibles : activer l'autre désactive celui-ci (round-trip
      // complet de la logique déclenchée par le clic, pas seulement un aller
      // simple). Note : `updateWinOptionsUI` (src/game.ts) rend
      // `#row-last-loser` inerte (`pointer-events:none` via `.disabled`) tant
      // que "vainqueur unique" est actif — jamais l'inverse — donc le
      // round-trip repasse par un second clic sur "vainqueur unique" plutôt
      // que de cliquer une ligne rendue intentionnellement inerte.
      await page.locator('#row-single-winner').click();
      await expect(page.locator('#toggle-single-winner')).toHaveClass(/\bon\b/);
      await expect(page.locator('#toggle-last-loser')).not.toHaveClass(/\bon\b/);
      await expect(page.locator('#row-last-loser')).toHaveClass(/\bdisabled\b/);

      await page.locator('#row-single-winner').click();
      await expect(page.locator('#toggle-single-winner')).not.toHaveClass(/\bon\b/);
      await expect(page.locator('#row-last-loser')).not.toHaveClass(/\bdisabled\b/);

      await page.locator('#row-last-loser').click();
      await expect(page.locator('#toggle-last-loser')).toHaveClass(/\bon\b/);
    } finally {
      await server.close();
    }
  });

  test('réglages par défaut : enregistrer / restaurer / effacer, avec le vrai évènement de clic', async ({ page }) => {
    // Cas 3 (le gestionnaire lit `event.currentTarget` via `_getFooterBtn`,
    // src/i18n.ts, pour flasher le libellé du BON bouton) : preuve que
    // `main.ts` transmet le véritable évènement de clic, pas un évènement
    // vide ou absent (voir la passe de mutation testing dédiée plus bas).
    const server = await startStaticServer();
    try {
      await disableServiceWorker(page);
      await page.goto(server.url);
      await acceptPrivacy(page);
      await page.locator('#players-grid .player-chip', { hasText: /^3$/ }).click();
      await page.locator('#start-presets .points-chip[data-val="50"]').click();

      await page.locator('#btn-savedefault').click();
      // Flash local sur l'emoji du bouton cliqué (saveAsDefault ne dépend pas
      // de `event.currentTarget`, contrairement à restore/clear ci-dessous).
      await expect(page.locator('#btn-savedefault .btn-emoji')).toHaveText('✓');

      await page.locator('#btn-restoredefault').click();
      await expect(page.locator('#btn-restoredefault .btn-label')).toContainText(/Restauré|Restored/i);

      await page.locator('#btn-cleardefault').click();
      await expect(page.locator('#btn-cleardefault .btn-label')).toContainText(/Effacé|Cleared/i);
    } finally {
      await server.close();
    }
  });
});

test.describe('Câblage des anciens onclick — thème, langue, confidentialité', () => {
  test('thème depuis le démarrage : ouverture/retour ; confidentialité depuis le thème', async ({ page }) => {
    const server = await startStaticServer();
    try {
      await disableServiceWorker(page);
      await page.goto(server.url);
      await acceptPrivacy(page);

      await page.locator('#theme-gear-btn').click();
      await expect(page.locator('#settings-page')).toHaveClass(/\bactive\b/);

      await page.locator('#btn-privacy-txt').click();
      await expect(page.locator('#privacy-modal')).toHaveClass(/\bactive\b/);

      // closePrivacy() revient à l'origine mémorisée (ici settings-page).
      await page.locator('#privacy-back-btn').click();
      await expect(page.locator('#settings-page')).toHaveClass(/\bactive\b/);

      await page.locator('#theme-back-btn').click();
      await expect(page.locator('#setup-page')).toHaveClass(/\bactive\b/);
    } finally {
      await server.close();
    }
  });

  test('sélecteur de langue (drapeau) : ouverture/fermeture sur l\'écran de démarrage et sur la confidentialité', async ({ page }) => {
    const server = await startStaticServer();
    try {
      await disableServiceWorker(page);
      await page.goto(server.url);
      await acceptPrivacy(page);

      await expect(page.locator('#lang-dropdown')).toHaveClass(/\bhidden\b/);
      await page.locator('#lang-flag-btn').click();
      await expect(page.locator('#lang-dropdown')).not.toHaveClass(/\bhidden\b/);
      await page.locator('#lang-flag-btn').click();
      await expect(page.locator('#lang-dropdown')).toHaveClass(/\bhidden\b/);

      await page.locator('#theme-gear-btn').click();
      await page.locator('#btn-privacy-txt').click();
      await expect(page.locator('#lang-dropdown-privacy')).toHaveClass(/\bhidden\b/);
      await page.locator('#lang-flag-btn-privacy').click();
      await expect(page.locator('#lang-dropdown-privacy')).not.toHaveClass(/\bhidden\b/);
      await page.locator('#lang-flag-btn-privacy').click();
      await expect(page.locator('#lang-dropdown-privacy')).toHaveClass(/\bhidden\b/);
    } finally {
      await server.close();
    }
  });

  test('"Supprimer toutes les données" efface le stockage local et revient au démarrage', async ({ page }) => {
    const server = await startStaticServer();
    try {
      await disableServiceWorker(page);
      await page.goto(server.url);
      await acceptPrivacy(page);
      await page.locator('#theme-gear-btn').click();
      await page.locator('#btn-privacy-txt').click();
      await expect(page.locator('#btn-cleardata')).toBeVisible();

      await page.locator('#btn-cleardata').click();
      const remaining = await page.evaluate(() => localStorage.length);
      expect(remaining).toBe(0);
      await expect(page.locator('#setup-page')).toHaveClass(/\bactive\b/);
    } finally {
      await server.close();
    }
  });
});

test.describe('Câblage des anciens onclick — écran des noms', () => {
  test('mélanger / mémoriser / vider les cases / tout effacer / retour', async ({ page }) => {
    const server = await startStaticServer();
    try {
      // Force le brassage (Fisher-Yates) à toujours échanger les deux
      // premières valeurs : preuve déterministe que shufflePlayers() a bien
      // été appelé, sans dépendre du hasard.
      await page.addInitScript(() => { Math.random = () => 0; });
      await disableServiceWorker(page);
      await page.goto(server.url);
      await acceptPrivacy(page);
      await page.locator('#players-grid .player-chip', { hasText: /^2$/ }).click();
      await page.locator('#start-presets .points-chip[data-val="0"]').click();
      await page.locator('#go-btn').click();

      const inputs = page.locator('.name-input');
      await inputs.nth(0).fill('Alice');
      await inputs.nth(1).fill('Bob');

      await page.locator('#btn-shuffle').click();
      await expect(inputs.nth(0)).toHaveValue('Bob');
      await expect(inputs.nth(1)).toHaveValue('Alice');

      await page.locator('#btn-memorize').click();
      await expect(page.locator('#profiles-list')).not.toHaveClass(/\bhidden\b/);
      await expect(page.locator('.profile-chip')).toHaveCount(2);

      await page.locator('#btn-clearfields').click();
      await expect(inputs.nth(0)).toHaveValue('');
      await expect(inputs.nth(1)).toHaveValue('');
      // clearNames() ne touche pas aux profils mémorisés.
      await expect(page.locator('.profile-chip')).toHaveCount(2);

      await page.locator('#btn-clearnames').click();
      await expect(page.locator('#profiles-list')).toHaveClass(/\bhidden\b/);
      await expect(page.locator('.profile-chip')).toHaveCount(0);

      await page.locator('#btn-back-names').click();
      await expect(page.locator('#setup-page')).toHaveClass(/\bactive\b/);
    } finally {
      await server.close();
    }
  });
});

test.describe('Câblage des anciens onclick — écran de jeu', () => {
  test('barre d\'actions : rotation, récap, thème depuis le jeu', async ({ page }) => {
    const server = await startStaticServer();
    try {
      await disableServiceWorker(page);
      await page.goto(server.url);
      await acceptPrivacy(page);
      await configureCustomGame(page, { objectif: 'none' });

      const idsBefore = await page.locator('.pcard').evaluateAll(els => els.map(el => el.id));
      await page.locator('#bar-rotate-btn').click();
      // rotatePlayers() modifie l'ordre des sièges (seatOrder) : l'ordre
      // physique des cartes dans le DOM rendu doit changer en conséquence
      // (pas une valeur théorique — le DOM réellement produit par renderGame()).
      const idsAfter = await page.locator('.pcard').evaluateAll(els => els.map(el => el.id));
      expect(idsAfter).not.toEqual(idsBefore);

      // recap-close-btn : câblé une fois par main.ts (plus une réaffectation
      // `.onclick=` refaite à chaque showRecap(), voir game.ts::closeRecap) —
      // ouvre/ferme deux fois pour prouver l'absence de double-déclenchement
      // qu'un `addEventListener` mal câblé (empilé à chaque appel) aurait pu
      // introduire par rapport à l'ancienne affectation `.onclick=`.
      for (let i = 0; i < 2; i++) {
        await page.locator('#bar-recap-btn').click();
        await expect(page.locator('#recap')).not.toHaveClass(/\bhidden\b/);
        await page.locator('#recap-close-btn').click();
        await expect(page.locator('#recap')).toHaveClass(/\bhidden\b/);
      }

      await page.locator('#bar-theme-btn').click();
      await expect(page.locator('#settings-page')).toHaveClass(/\bactive\b/);
      await expect(page.locator('#game-screen')).toHaveCSS('display', 'none');
      await page.locator('#theme-back-btn').click();
      await expect(page.locator('#game-screen')).toHaveCSS('display', 'flex');
    } finally {
      await server.close();
    }
  });

  test('bouton Reset : ouverture, retour au jeu, nouvelle partie, retour au menu', async ({ page }) => {
    const server = await startStaticServer();
    try {
      await disableServiceWorker(page);
      await page.goto(server.url);
      await acceptPrivacy(page);
      await configureCustomGame(page, { objectif: 'none' });

      // Cas 6 (manipulation DOM inline, reproduite telle quelle dans main.ts).
      await expect(page.locator('#reset-modal')).toHaveClass(/\bhidden\b/);
      await page.locator('#bar-reset-btn').click();
      await expect(page.locator('#reset-modal')).not.toHaveClass(/\bhidden\b/);

      await page.locator('#btn-back-reset').click();
      await expect(page.locator('#reset-modal')).toHaveClass(/\bhidden\b/);

      await page.locator('#bar-reset-btn').click();
      await page.locator('#btn-newgame-reset').click();
      await expect(page.locator('#reset-modal')).toHaveClass(/\bhidden\b/);
      await expect(page.locator('.pcard .score').first()).toHaveText('0');

      await page.locator('#bar-reset-btn').click();
      await page.locator('#btn-menu-reset').click();
      await expect(page.locator('#setup-page')).toHaveClass(/\bactive\b/);
    } finally {
      await server.close();
    }
  });

  test('modal de score : signe +/- et confirmer/annuler', async ({ page }) => {
    const server = await startStaticServer();
    try {
      await disableServiceWorker(page);
      await page.goto(server.url);
      await acceptPrivacy(page);
      await configureCustomGame(page, { objectif: 'none' });

      await page.evaluate(() => (window as unknown as { ScoreTrack: { game: { openScoreModal: (i: number) => void } } }).ScoreTrack.game.openScoreModal(0));
      await expect(page.locator('#score-modal')).not.toHaveClass(/\bhidden\b/);

      // Cas 2 (argument littéral) : les deux signes, sans taper de chiffre au
      // clavier pour ne pas déclencher la validation automatique de setSign()
      // (comportement préexistant : un montant > 0 valide immédiatement).
      await page.locator('#sign-minus').click();
      await expect(page.locator('#sign-minus')).toHaveClass(/\bactive\b/);
      await expect(page.locator('#score-modal-display')).toHaveClass(/\bneg\b/);
      await page.locator('#sign-plus').click();
      await expect(page.locator('#sign-plus')).toHaveClass(/\bactive\b/);
      await expect(page.locator('#score-modal-display')).toHaveClass(/\bpos\b/);

      // Annuler : aucune modification du score. Cible `#sc-0` (id posé par
      // updateDisplay(), src/game.ts) plutôt que ".pcard .score" en premier
      // du DOM : pour 2 joueurs, l'ordre d'affichage place le joueur 1 avant
      // le joueur 0 (voir renderGame()) — openScoreModal(0) agit sur le
      // joueur 0, jamais sur la première carte affichée.
      const before = await page.locator('#sc-0').textContent();
      await page.locator('.key-btn', { hasText: /^7$/ }).click();
      await page.locator('#score-modal-cancel-btn').click();
      await expect(page.locator('#score-modal')).toHaveClass(/\bhidden\b/);
      await expect(page.locator('#sc-0')).toHaveText(before || '0');

      // closeScoreModal() pose un garde `window._modalJustClosed` (350ms)
      // qui ignore toute réouverture immédiate (protection anti-double-tap
      // préexistante, non liée à ce chantier) : attendre qu'il retombe avant
      // de rouvrir le modal, sinon openScoreModal() ci-dessous est un no-op.
      await page.waitForFunction(() => !(window as unknown as { _modalJustClosed?: boolean })._modalJustClosed);

      // Confirmer : +7 appliqué.
      await page.evaluate(() => (window as unknown as { ScoreTrack: { game: { openScoreModal: (i: number) => void } } }).ScoreTrack.game.openScoreModal(0));
      await page.locator('.key-btn', { hasText: /^7$/ }).click();
      await page.locator('#score-modal-confirm-btn').click();
      await expect(page.locator('#score-modal')).toHaveClass(/\bhidden\b/);
      await expect(page.locator('#sc-0')).toHaveText(String(Number(before) + 7));
    } finally {
      await server.close();
    }
  });
});

test.describe('Câblage des anciens onclick — fin de partie', () => {
  test('élimination : annuler restaure le score, confirmer élimine le joueur', async ({ page }) => {
    const server = await startStaticServer();
    try {
      await disableServiceWorker(page);
      await page.goto(server.url);
      await acceptPrivacy(page);
      // elim à 0, 2 joueurs -> déclenche #elim-modal (confirmation, alive<=2)
      // dès qu'un joueur atteint 0, exactement comme un vrai coup joué.
      await configureCustomGame(page, { objectif: 'elim', objectifVal: 0 });

      const evalAdjust = (delta: number) => page.evaluate((d) => (window as unknown as {
        ScoreTrack: { game: { adjust: (i: number, delta: number) => void } };
      }).ScoreTrack.game.adjust(0, d), delta);

      await evalAdjust(-50); // startPoints=0 -> passe à -50, condition elim (<=0) déclenchée
      await expect(page.locator('#elim-modal')).not.toHaveClass(/\bhidden\b/);

      await page.locator('#btn-cancel-elim').click();
      await expect(page.locator('#elim-modal')).toHaveClass(/\bhidden\b/);
      await expect(page.locator('.pcard .score').first()).toHaveText('0'); // undo réel

      await evalAdjust(-50);
      await expect(page.locator('#elim-modal')).not.toHaveClass(/\bhidden\b/);
      await page.locator('#btn-elim-confirm-txt').click();
      await expect(page.locator('#elim-modal')).toHaveClass(/\bhidden\b/);
      // L'animation d'élimination démarre : forcer son arrêt immédiat via le
      // même chemin que le clic sur l'overlay (voir groupe suivant) pour ne
      // pas dépendre de sa durée totale ici.
      await page.evaluate(() => (window as unknown as { ScoreTrack: { animations: { stopElimAnim: () => void } } }).ScoreTrack.animations.stopElimAnim());
      const eliminated = await page.evaluate(() => (window as unknown as {
        ScoreTrack: { game: { players: Array<{ eliminated?: boolean }> } };
      }).ScoreTrack.game.players[0].eliminated);
      expect(eliminated).toBe(true);
    } finally {
      await server.close();
    }
  });

  test('fin de partie (vainqueur unique) : annuler puis confirmer, puis les boutons du modal vainqueur', async ({ page }) => {
    const server = await startStaticServer();
    try {
      await disableServiceWorker(page);
      await page.goto(server.url);
      await acceptPrivacy(page);
      await configureCustomGame(page, { objectif: 'win', objectifVal: 10, singleWinner: true });

      const evalAdjust = (delta: number) => page.evaluate((d) => (window as unknown as {
        ScoreTrack: { game: { adjust: (i: number, delta: number) => void } };
      }).ScoreTrack.game.adjust(0, d), delta);

      await evalAdjust(10);
      await expect(page.locator('#endgame-modal')).not.toHaveClass(/\bhidden\b/);

      await page.locator('#endgame-btn-cancel').click();
      await expect(page.locator('#endgame-modal')).toHaveClass(/\bhidden\b/);
      const winnerAfterCancel = await page.evaluate(() => (window as unknown as {
        ScoreTrack: { game: { players: Array<{ winner?: boolean }> } };
      }).ScoreTrack.game.players[0].winner);
      expect(winnerAfterCancel).toBeFalsy();

      await evalAdjust(10);
      await expect(page.locator('#endgame-modal')).not.toHaveClass(/\bhidden\b/);
      await page.locator('#endgame-modal-confirm-btn').click();
      await expect(page.locator('#endgame-modal')).toHaveClass(/\bhidden\b/);

      // Passer directement l'animation de victoire (cas 1 : clic sur
      // l'overlay -> stopWinAnim(), testé isolément dans le groupe
      // "animations" ci-dessous) pour atteindre #winner-modal sans attendre
      // sa durée totale.
      await page.locator('#win-anim-overlay').click();
      await expect(page.locator('#winner-modal')).not.toHaveClass(/\bhidden\b/);

      await page.locator('#btn-seerecap').click();
      await expect(page.locator('#recap')).not.toHaveClass(/\bhidden\b/);
      await page.locator('#recap').evaluate(el => el.classList.add('hidden'));

      await page.evaluate(() => (window as unknown as { ScoreTrack: { game: { showWinnerModal: (b: boolean) => void } } }).ScoreTrack.game.showWinnerModal(true));
      await page.locator('#btn-newgame').click();
      await expect(page.locator('#winner-modal')).toHaveClass(/\bhidden\b/);
      await expect(page.locator('.pcard .score').first()).toBeVisible();

      await page.evaluate(() => (window as unknown as { ScoreTrack: { game: { showWinnerModal: (b: boolean) => void } } }).ScoreTrack.game.showWinnerModal(true));
      await page.locator('#btn-returnmenu').click();
      await expect(page.locator('#setup-page')).toHaveClass(/\bactive\b/);
    } finally {
      await server.close();
    }
  });
});

test.describe('Câblage des anciens onclick — lanceur de dés', () => {
  test('ouverture, config, lancer, choix du joueur, retour, fermeture', async ({ page }) => {
    const server = await startStaticServer();
    try {
      await disableServiceWorker(page);
      await page.goto(server.url);
      await acceptPrivacy(page);
      await configureCustomGame(page, { objectif: 'none' });

      await page.locator('#dice-fab').click();
      await expect(page.locator('#dice-overlay')).not.toHaveClass(/\bhidden\b/);

      // Cas 5 : clic sur le fond flouté ferme, clic à l'intérieur ne ferme pas.
      await page.locator('.dice-sheet').click();
      await expect(page.locator('#dice-overlay')).not.toHaveClass(/\bhidden\b/);

      const isCollapsed = () => page.locator('#dice-config').evaluate(el => el.classList.contains('collapsed'));
      const before = await isCollapsed();
      await page.locator('#dice-config-toggle').click();
      expect(await isCollapsed()).toBe(!before);
      await page.locator('#dice-config-toggle').click();
      expect(await isCollapsed()).toBe(before);

      // S'assurer que la config est dépliée pour lire dice-faces-val.
      if (await isCollapsed()) await page.locator('#dice-config-toggle').click();

      await expect(page.locator('#dice-faces-val')).toHaveText('d6');
      await page.locator('#dice-faces-plus').click();
      await expect(page.locator('#dice-faces-val')).toHaveText('d8');
      await page.locator('#dice-faces-minus').click();
      await expect(page.locator('#dice-faces-val')).toHaveText('d6');

      await expect(page.locator('#dice-count-val')).toHaveText('1');
      await page.locator('#dice-count-plus').click();
      await expect(page.locator('#dice-count-val')).toHaveText('2');
      await page.locator('#dice-count-minus').click();
      await expect(page.locator('#dice-count-val')).toHaveText('1');

      await page.locator('#dice-roll-btn').click();
      await expect(page.locator('#dice-post')).toBeVisible({ timeout: 10000 });

      await page.locator('#dice-add-btn').click();
      await expect(page.locator('#dice-player-pick')).toBeVisible();
      await expect(page.locator('#dice-post')).toBeHidden();

      await page.locator('#dice-pick-back').click();
      await expect(page.locator('#dice-post')).toBeVisible();
      await expect(page.locator('#dice-player-pick')).toBeHidden();

      await page.locator('#dice-sub-btn').click();
      await expect(page.locator('#dice-player-pick')).toBeVisible();
      await page.locator('#dice-pick-back').click();

      await page.locator('#dice-close-btn').click();
      await expect(page.locator('#dice-overlay')).toHaveClass(/\bhidden\b/);

      // Fermeture par clic sur le fond (cas 5), depuis un état frais.
      await page.locator('#dice-fab').click();
      await expect(page.locator('#dice-overlay')).not.toHaveClass(/\bhidden\b/);
      await page.locator('#dice-overlay').click({ position: { x: 2, y: 2 } });
      await expect(page.locator('#dice-overlay')).toHaveClass(/\bhidden\b/);
    } finally {
      await server.close();
    }
  });
});

test.describe('Câblage des anciens onclick — superpositions d\'animation', () => {
  test('cliquer sur l\'overlay interrompt l\'animation (finisher / victoire / élimination)', async ({ page }) => {
    const server = await startStaticServer();
    try {
      await disableServiceWorker(page);
      await page.goto(server.url);
      await acceptPrivacy(page);
      // Mode "win" + vainqueur unique : nécessaire pour que playWinAnim(0)
      // joue réellement l'animation de victoire sur #win-anim-overlay (sinon
      // elle délègue à playFinAnim, cf. src/animations.ts — un joueur non
      // classé n°1 n'est jamais "champion").
      await configureCustomGame(page, { objectif: 'win', objectifVal: 10, singleWinner: true });

      type Anim = { ScoreTrack: { animations: { playFinAnim: (i: number) => void; playWinAnim: (i: number) => void; playElimAnim: (i: number) => void } } };
      type GameNs = { ScoreTrack: { game: { players: Array<{ winRank?: number }> } } };

      await page.evaluate(() => (window as unknown as Anim).ScoreTrack.animations.playFinAnim(0));
      await expect(page.locator('#fin-anim-overlay')).toHaveCSS('display', 'flex');
      await page.locator('#fin-anim-overlay').click();
      await expect(page.locator('#fin-anim-overlay')).toHaveCSS('display', 'none');

      await page.evaluate(() => { (window as unknown as GameNs).ScoreTrack.game.players[0].winRank = 1; });
      await page.evaluate(() => (window as unknown as Anim).ScoreTrack.animations.playWinAnim(0));
      await expect(page.locator('#win-anim-overlay')).toHaveCSS('display', 'flex');
      await page.locator('#win-anim-overlay').click();
      await expect(page.locator('#win-anim-overlay')).toHaveCSS('display', 'none');

      await page.evaluate(() => (window as unknown as Anim).ScoreTrack.animations.playElimAnim(0));
      await expect(page.locator('#elim-anim-overlay')).toHaveCSS('display', 'flex');
      await page.locator('#elim-anim-overlay').click();
      await expect(page.locator('#elim-anim-overlay')).toHaveCSS('display', 'none');
    } finally {
      await server.close();
    }
  });
});
