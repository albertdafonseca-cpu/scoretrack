const fs = require('fs');
const { test, expect, storage, json, startGame, score, applyDelta, tapCard, openBar, acceptPrivacyIfAsked, focusCard } = require('./helpers');

const saved = async (page) => json((await storage(page))['st:test:save']);

test.describe('Parcours de jeu', () => {
  test('setup : valeurs par défaut valides, tous les nombres de joueurs disponibles', async ({ page }) => {
    await page.goto('/');
    await acceptPrivacyIfAsked(page);
    await expect(page.locator('#go-btn')).toBeEnabled();
    await page.locator('#players-grid .player-chip', { hasText: /^12$/ }).click();
    expect(await page.evaluate(() => numPlayers)).toBe(12);
    await expect(page.locator('#pro-popup')).toHaveCount(0);
  });

  test('setup → noms → partie : cartes, scores de départ, noms par défaut', async ({ page }) => {
    await startGame(page, { players: 3, points: 20, names: ['Alice', '', 'Chloé'] });
    await expect(page.locator('#game-screen')).toBeVisible();
    await expect(page.locator('#card-0')).toHaveAttribute('aria-label', /^Alice, 20/);
    await expect(page.locator('#card-1')).toHaveAttribute('aria-label', /^Joueur 2, 20/);
    for (let i = 0; i < 3; i++) expect(await score(page, i)).toBe(20);
    expect((await saved(page)).players).toHaveLength(3);
  });

  test('+ / − au toucher, delta avec glyphe, annonce, annuler', async ({ page }) => {
    await startGame(page, { players: 3, names: ['Alice', 'Bob', 'Chloé'] });
    await tapCard(page, 1, true);
    await expect(page.locator('#sc-1')).toHaveText('21');
    await expect(page.locator('#df-1')).toContainText('▲');
    await tapCard(page, 1, false);
    await tapCard(page, 1, false);
    await expect(page.locator('#sc-1')).toHaveText('19');
    await expect(page.locator('#df-1')).toContainText('▼');
    await expect(page.locator('#sr-status')).toContainText('Bob');
    await openBar(page);
    await page.click('#undo-btn');
    await expect(page.locator('#sc-1')).toHaveText('20');
    await page.click('#undo-btn');
    await page.click('#undo-btn');
    await expect(page.locator('#sc-1')).toHaveText('20');
    await expect(page.locator('#undo-btn')).toBeDisabled();
  });

  test('saisie par la modale : affichage ▲/▼ et application', async ({ page }) => {
    await startGame(page, { players: 3 });
    await focusCard(page, 2);
    await page.keyboard.press('Enter');
    await expect(page.locator('#score-modal')).toBeVisible();
    // le focus entre dans la modale juste après son ouverture : sinon Entrée la rouvrirait depuis la carte
    await expect.poll(() => page.evaluate(() => document.getElementById('score-modal').contains(document.activeElement))).toBe(true);
    await page.keyboard.press('5');
    await expect(page.locator('#score-modal-display')).toHaveText(/^▲ \+5/);
    await page.keyboard.press('Enter');
    await expect(page.locator('#score-modal')).toBeHidden();
    await expect(page.locator('#sc-2')).toHaveText('25');
    await applyDelta(page, 2, -7);
    await expect(page.locator('#sc-2')).toHaveText('18');
    await expect(page.locator('#df-2')).toContainText('▼');
  });

  test('une saisie sans changement réel ne crée pas d\'entrée d\'annulation', async ({ page }) => {
    await startGame(page, { players: 2 });
    const before = await page.evaluate(() => undoStack.length);
    await page.evaluate(() => { openScoreModal(0); modalValue = '0'; confirmScoreModal(); });
    expect(await page.evaluate(() => undoStack.length)).toBe(before);
  });

  test('rotation : l\'ordre des places change et est sauvegardé', async ({ page }) => {
    await startGame(page, { players: 3 });
    const before = (await saved(page)).seatOrder.join(',');
    await openBar(page);
    await page.locator('.bar-btn.accent-btn').click();
    await expect.poll(async () => (await saved(page)).seatOrder.join(',')).not.toBe(before);
  });

  test('récap : tous les joueurs, glyphes ▲/▼, fermé par Échap', async ({ page }) => {
    await startGame(page, { players: 3, names: ['A', 'B', 'C'] });
    await applyDelta(page, 0, 4);
    await applyDelta(page, 1, -2);
    await page.evaluate(() => showRecap());
    await expect(page.locator('#recap')).toBeVisible();
    const txt = await page.locator('#recap-body').textContent();
    expect(txt).toContain('▲ +');
    expect(txt).toContain('▼');
    await page.keyboard.press('Escape');
    await expect(page.locator('#recap')).toBeHidden();
  });

  test('rechargement : la partie en cours est reprise avec ses scores', async ({ page }) => {
    await startGame(page, { players: 3, names: ['A', 'B', 'C'] });
    await focusCard(page, 1);
    await page.keyboard.press('+');
    await expect.poll(async () => (await saved(page)).players[1].score).toBe(21);
    await page.reload();
    await expect(page.locator('.pcard')).toHaveCount(3);
    await expect(page.locator('#sc-1')).toHaveText('21');
    await expect(page.locator('#game-screen')).toHaveCSS('display', 'flex');
  });

  test('reset : annulable par Échap, « Retour au menu » efface la partie', async ({ page }) => {
    await startGame(page, { players: 2 });
    await openBar(page);
    await page.locator('.bar-btn.danger').click();
    await expect(page.locator('#reset-modal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#reset-modal')).toBeHidden();
    await expect(page.locator('.pcard')).toHaveCount(2);
    await page.locator('.bar-btn.danger').click();
    await page.click('#btn-menu-reset');
    await expect(page.locator('#setup-page')).toHaveClass(/active/);
    expect((await storage(page))['st:test:save']).toBeUndefined();
  });

  test('profils : mémoriser, réutiliser puis supprimer', async ({ page }) => {
    await page.goto('/');
    await acceptPrivacyIfAsked(page);
    await page.locator('#players-grid .player-chip', { hasText: /^2$/ }).click();
    await page.fill('#points-custom', '10');
    await page.click('#go-btn');
    await page.locator('.name-input').nth(0).fill('Zed');
    await page.locator('.name-input').nth(1).fill('Yan');
    await page.click('#btn-memorize');
    await expect(page.locator('.profile-chip-name')).toHaveText(['Zed', 'Yan']);
    expect(json((await storage(page))['st:test:profiles'])).toEqual(['Zed', 'Yan']);
    await page.locator('.profile-chip-del').first().click();
    await expect(page.locator('.profile-chip-name')).toHaveText(['Yan']);
    expect(json((await storage(page))['st:test:profiles'])).toEqual(['Yan']);
  });

  test('langue : le sélecteur change la langue de l\'interface et la mémorise', async ({ page }) => {
    await page.goto('/');
    await acceptPrivacyIfAsked(page);
    await page.click('#lang-flag-btn');
    await page.locator('#lang-dropdown .lang-opt', { hasText: 'English' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('#go-btn')).toContainText('Next');
    expect(json((await storage(page))['st:test:settings']).lang).toBe('en');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test.describe('Élimination et fin de partie', () => {
    test('à 0 avec plus de deux joueurs : le joueur est éliminé, la partie continue', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await startGame(page, { players: 3, names: ['A', 'B', 'C'] });
      await applyDelta(page, 0, -20);
      await expect.poll(() => page.evaluate(() => !!players[0].eliminated)).toBe(true);
      await expect(page.locator('#winner-modal')).toBeHidden();
      await expect(page.locator('#card-0')).toHaveClass(/elim/);
      expect(await page.evaluate(() => players.filter((p) => p.eliminated).length)).toBe(1);
    });

    test('à 0 quand il ne reste que deux joueurs : confirmation (alertdialog, focus sur Annuler), annulable', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await startGame(page, { players: 2, names: ['A', 'B'] });
      await applyDelta(page, 0, -20);
      const modal = page.locator('#elim-modal');
      await expect(modal).toBeVisible();
      await expect(modal).toHaveAttribute('role', 'alertdialog');
      await expect(page.locator('#btn-cancel-elim')).toBeFocused();
      await page.click('#btn-cancel-elim');
      await expect(modal).toBeHidden();
      expect(await page.evaluate(() => !!players[0].eliminated)).toBe(false);
    });

    test('dernier survivant (mouvement réduit) : modale de fin, sauvegarde effacée, annulation complète', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await startGame(page, { players: 2, names: ['A', 'B'] });
      await applyDelta(page, 0, -20);
      await page.click('#btn-elim-confirm-txt');
      await expect(page.locator('#winner-modal')).toBeVisible();
      await expect(page.locator('#elim-anim-overlay')).toBeHidden();
      await expect(page.locator('#win-anim-overlay')).toBeHidden();
      await expect.poll(async () => (await storage(page))['st:test:save']).toBeUndefined();
      await page.evaluate(() => undoLast());
      await expect(page.locator('#winner-modal')).toBeHidden();
      const st = await page.evaluate(() => ({ elim: !!players[0].eliminated, w: !!players[1].winner, rc: rankCounter }));
      expect(st).toEqual({ elim: false, w: false, rc: 0 });
      await expect.poll(async () => !!(await storage(page))['st:test:save']).toBe(true);
    });

    test('dernier survivant avec animation : l\'overlay s\'affiche et Échap le passe', async ({ page }) => {
      await startGame(page, { players: 2, names: ['A', 'B'] });
      // Enregistre l'apparition d'un des deux overlays, même brève (l'ordre et la durée varient selon la machine)
      await page.evaluate(() => {
        window.__ovSeen = false;
        const ids = ['elim-anim-overlay', 'win-anim-overlay'];
        const check = () => { if (ids.some((id) => { const e = document.getElementById(id); return e && getComputedStyle(e).display !== 'none'; })) window.__ovSeen = true; };
        new MutationObserver(check).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['style', 'class'] });
      });
      await applyDelta(page, 0, -20);
      await page.click('#btn-elim-confirm-txt');
      await expect.poll(() => page.evaluate(() => window.__ovSeen)).toBe(true);
      await expect(async () => {
        await page.keyboard.press('Escape');
        await expect(page.locator('#winner-modal')).toBeVisible({ timeout: 500 });
      }).toPass({ timeout: 10_000 });
      await expect(page.locator('#elim-anim-overlay')).toBeHidden();
      await expect(page.locator('#win-anim-overlay')).toBeHidden();
    });

    test('objectif « victoire » : atteindre la cible déclare le vainqueur', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/');
      await acceptPrivacyIfAsked(page);
      await page.locator('#players-grid .player-chip', { hasText: /^2$/ }).click();
      await page.fill('#points-custom', '20');
      await page.click('#obj-win');
      await page.locator('#objectif-presets .points-chip[data-oval="0"]').click();
      await page.click('#go-btn');
      await page.click('#names-go-btn');
      await expect(page.locator('.pcard')).toHaveCount(2);
      expect(await page.evaluate(() => objectifMode)).toBe('win');
      await applyDelta(page, 0, -20);
      await expect.poll(() => page.evaluate(() => !!players[0].winner)).toBe(true);
    });
  });

  test('export PDF : fichier PDF valide, jsPDF seul, chargé à la demande depuis ./vendor', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await startGame(page, { players: 2, names: ['A <b>B</b>', 'Bob'] });
    await applyDelta(page, 1, 3);
    await page.evaluate(() => showRecap());
    await expect(page.locator('#recap')).toBeVisible();
    expect(await page.evaluate(() => [...document.scripts].filter((s) => /jspdf|html2canvas/.test(s.src)).length)).toBe(0);
    await page.fill('#pdf-game-name', 'Test <b>PDF</b>');
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 25_000 }).catch(async () => {
        // Diagnostic : erreurs console, alertes et étape atteinte, pour comprendre un échec propre à un navigateur
        const state = await page.evaluate(() => ({ jspdf: !!window.jspdf }));
        throw new Error('Aucun téléchargement PDF. ' + JSON.stringify({ state, problems: page.problems, dialogs: page.dialogs }));
      }),
      page.click('#btn-pdf-dl'),
    ]);
    const file = await dl.path();
    const buf = fs.readFileSync(file);
    expect(dl.suggestedFilename()).toMatch(/\.pdf$/i);
    expect(buf.length).toBeGreaterThan(2000);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    // PDF dessiné par jsPDF : ni capture d'écran (html2canvas), ni page HTML intermédiaire
    const srcs = await page.evaluate(() => [...document.scripts].map((s) => s.src).filter(Boolean));
    expect(srcs.some((s) => s.endsWith('/vendor/jspdf.umd.min.js'))).toBe(true);
    expect(srcs.some((s) => /html2canvas/.test(s))).toBe(false);
    await expect(page.locator('iframe')).toHaveCount(0);
    expect(page.external).toEqual([]);
  });

  test('appui long sur Annuler : vide la pile puis s\'arrête, même relâché hors du bouton', async ({ page }) => {
    await startGame(page, { players: 2, points: 50 });
    await focusCard(page, 0);
    for (let k = 0; k < 6; k++) { await page.keyboard.press('+'); }
    await expect.poll(() => page.evaluate(() => undoStack.length)).toBeGreaterThan(0);
    await openBar(page);
    const ub = await page.locator('#undo-btn').boundingBox();
    await page.mouse.move(ub.x + ub.width / 2, ub.y + ub.height / 2);
    await page.mouse.down();
    await expect.poll(() => page.evaluate(() => undoStack.length), { timeout: 10_000 }).toBe(0);
    await page.mouse.move(5, 5);
    await page.mouse.up();
    expect(await score(page, 0)).toBe(50);
    await expect(page.locator('#undo-btn')).toBeDisabled();
  });
});
