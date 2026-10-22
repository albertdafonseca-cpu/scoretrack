const { test, expect, seedStorage, storage, json, startGame, score, tapCard0, focusCard } = require('./helpers');

test.describe('Parcours de jeu', () => {
  test('setup : « Suivant » n\'est actif qu\'avec un nombre de joueurs et des points', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#go-btn')).toBeDisabled();
    await page.locator('#players-grid .player-chip', { hasText: /^3$/ }).click();
    await page.locator('#start-presets .points-chip[data-val="20"]').click();
    await expect(page.locator('#go-btn')).toBeEnabled();
  });

  test('setup → noms → partie : cartes, scores de départ, noms par défaut', async ({ page }) => {
    await startGame(page, { players: 3, points: 20, names: ['Alice', '', 'Chloé'] });
    await expect(page.locator('#game-screen')).toBeVisible();
    await expect(page.locator('#card-0 .pplayer')).toContainText('Alice');
    await expect(page.locator('#card-1')).toHaveAttribute('aria-label', 'Joueur 2, 20 points');
    for (let i = 0; i < 3; i++) expect(await score(page, i)).toBe(20);
    expect(json((await storage(page))['st:main:save']).players).toHaveLength(3);
  });

  test('+ / − au toucher, delta avec glyphe, annonce, annuler', async ({ page }) => {
    await startGame(page, { players: 3, names: ['Alice', 'Bob', 'Chloé'] });
    await tapCard0(page, true);
    await tapCard0(page, true);
    await tapCard0(page, false);
    await expect(page.locator('#sc-0')).toHaveText('21');
    await expect(page.locator('#df-0')).toHaveText(/^[▲▼]/);
    await expect(page.locator('#sr-status')).toContainText('total');
    await page.click('#undo-btn');
    await expect(page.locator('#sc-0')).toHaveText('22');
    await expect(page.locator('#undo-btn')).toBeEnabled();
    // Annuler jusqu'au bout désactive le bouton
    await page.click('#undo-btn');
    await page.click('#undo-btn');
    await expect(page.locator('#sc-0')).toHaveText('20');
    await expect(page.locator('#undo-btn')).toBeDisabled();
  });

  test('saisie par la modale : affichage ▲/▼, application, annulation de la saisie', async ({ page }) => {
    await startGame(page, { players: 3 });
    await page.evaluate(() => openScoreModal(2));
    await page.locator('#modal-keypad .key-btn').nth(4).click(); // 5
    await expect(page.locator('#score-modal-display')).toHaveText(/^▲ \+5/);
    await page.locator('#sign-minus').click();
    await expect(page.locator('#score-modal-display')).toHaveText(/^▼ [-−]5/);
    await page.locator('#sign-plus').click();
    await page.locator('#score-modal .modal-btn.primary').click();
    await expect(page.locator('#sc-2')).toHaveText('25');
    await expect(page.locator('#score-modal')).toBeHidden();
  });

  test('une saisie sans changement réel ne crée pas d\'entrée d\'annulation', async ({ page }) => {
    await startGame(page, { players: 2 });
    await page.evaluate(() => openScoreModal(0));
    const before = await page.evaluate(() => undoStack.length);
    await page.locator('#score-modal .modal-btn.primary').click();
    expect(await page.evaluate(() => undoStack.length)).toBe(before);
    await page.evaluate(() => { maxPoints = 20; openScoreModal(0); pressKey(3); confirmScoreModal(); });
    expect(await page.evaluate(() => undoStack.length)).toBe(before);
    expect(await score(page, 0)).toBe(20);
  });

  test('rotation : l\'ordre des places change et est sauvegardé', async ({ page }) => {
    await startGame(page, { players: 3 });
    await page.locator('.bar-btn.accent-btn').click();
    await expect.poll(async () => json((await storage(page))['st:main:save']).seatOrder.join(',')).toBe('2,0,1');
  });

  test('récap : ouvert avec glyphes, fermé par Échap', async ({ page }) => {
    await startGame(page, { players: 3 });
    await tapCard0(page, false);
    await focusCard(page, 1);
    await page.keyboard.press('+');
    await page.locator('.bar-btn >> nth=2').click();
    await expect(page.locator('#recap')).toBeVisible();
    const txt = await page.locator('#recap-body').textContent();
    expect(txt).toContain('▲');
    expect(txt).toContain('▼');
    await page.keyboard.press('Escape');
    await expect(page.locator('#recap')).toBeHidden();
  });

  test('rechargement : bannière « partie en cours », reprise des scores', async ({ page }) => {
    await startGame(page, { players: 3, names: ['A', 'B', 'C'] });
    await tapCard0(page, true);
    await expect.poll(async () => json((await storage(page))['st:main:save']).players[0].score).toBe(21);
    await page.reload();
    await expect(page.locator('#restore-banner')).toBeVisible();
    await page.locator('.restore-btn.yes').click();
    await expect(page.locator('.pcard')).toHaveCount(3);
    await expect(page.locator('#sc-0')).toHaveText('21');
    await expect(page.locator('#restore-banner')).toBeHidden();
  });

  test('reset : confirmation, sauvegarde supprimée, retour au setup', async ({ page }) => {
    await startGame(page, { players: 2 });
    await page.locator('.bar-btn.danger').click();
    await expect(page.locator('#reset-modal')).toBeVisible();
    await page.locator('#reset-modal .modal-btn.secondary').click(); // Annuler
    await expect(page.locator('#reset-modal')).toBeHidden();
    await expect(page.locator('.pcard')).toHaveCount(2);
    await page.locator('.bar-btn.danger').click();
    await page.locator('#reset-modal .modal-btn.primary').click();
    await expect(page.locator('#setup-page')).toHaveClass(/active/);
    await expect(page.locator('#restore-banner')).toBeHidden();
    expect((await storage(page))['st:main:save']).toBeUndefined();
  });

  test('profils : mémoriser, réutiliser puis supprimer', async ({ page }) => {
    await page.goto('/');
    await page.locator('#players-grid .player-chip', { hasText: /^2$/ }).click();
    await page.locator('#start-presets .points-chip[data-val="10"]').click();
    await page.click('#go-btn');
    await page.locator('.name-input').nth(0).fill('Zed');
    await page.locator('.name-input').nth(1).fill('Yan');
    await page.getByRole('button', { name: /Mémoriser/ }).click();
    await expect(page.locator('.profile-chip-name')).toHaveText(['Zed', 'Yan']);
    expect(json((await storage(page))['st:main:profiles'])).toEqual(['Zed', 'Yan']);
    await page.locator('.profile-chip-del').first().click();
    await expect(page.locator('.profile-chip-name')).toHaveText(['Yan']);
    expect(json((await storage(page))['st:main:profiles'])).toEqual(['Yan']);
  });

  test('thème : changement via les réglages, mémorisé', async ({ page }) => {
    await page.goto('/');
    await page.locator('.logo-gear').click();
    await expect(page.locator('#settings-page')).toHaveClass(/active/);
    await page.locator('#themes-grid > *').nth(6).click(); // océan
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'ocean');
  });

  test.describe('Élimination (spécifique à la version principale)', () => {
    test('départ à 0 : aucune élimination en repassant par 0', async ({ page }) => {
      await startGame(page, { players: 2, points: 0 });
      await page.evaluate(() => { adjust(0, 1, document.querySelector('#card-0 .tap-zone')); adjust(0, -1, document.querySelector('#card-0 .tap-zone')); });
      await expect(page.locator('#elim-modal')).toBeHidden();
    });

    test('départ 10 : atteindre 0 propose l\'élimination, puis fin de partie sans survivant', async ({ page }) => {
      await startGame(page, { players: 1, points: 10 });
      await page.evaluate(() => { openScoreModal(0); setSign(-1); pressKey(1); pressKey(0); confirmScoreModal(); });
      await expect(page.locator('#elim-modal')).toBeVisible();
      await expect(page.locator('#elim-modal')).toHaveAttribute('role', 'alertdialog');
      await page.locator('.btn-elim-confirm').click();
      await expect(page.locator('#winner-modal')).toBeVisible();
      await expect(page.locator('#winner-name')).toHaveText('Fin de partie');
      expect((await storage(page))['st:main:save']).toBeUndefined();
      // Annuler depuis la fin : modale masquée, joueur ressuscité
      await page.evaluate(() => undoLast());
      await expect(page.locator('#winner-modal')).toBeHidden();
      expect(await page.evaluate(() => players[0].eliminated)).toBe(false);
    });

    test('annuler l\'élimination garde le joueur en jeu', async ({ page }) => {
      await startGame(page, { players: 2, points: 10 });
      await page.evaluate(() => { openScoreModal(0); setSign(-1); pressKey(1); pressKey(0); confirmScoreModal(); });
      await expect(page.locator('#elim-modal')).toBeVisible();
      await page.locator('#elim-modal .modal-btn.secondary').click();
      await expect(page.locator('#elim-modal')).toBeHidden();
      expect(await page.evaluate(() => players[0].eliminated)).toBe(false);
    });
  });

  test('appui long sur Annuler : vide la pile puis s\'arrête, même relâché hors du bouton', async ({ page }) => {
    await startGame(page, { players: 2, points: 5 });
    await page.evaluate(() => { for (let k = 0; k < 6; k++) adjust(0, 1, document.querySelector('#card-0 .tap-zone')); });
    await expect(page.locator('#undo-btn')).toBeEnabled();
    const ub = await page.locator('#undo-btn').boundingBox();
    await page.mouse.move(ub.x + 10, ub.y + 10);
    await page.mouse.down();
    await expect.poll(() => page.evaluate(() => undoStack.length), { timeout: 10_000 }).toBe(0);
    await page.mouse.move(5, 5);
    await page.mouse.up();
    expect(await score(page, 0)).toBe(5);
    await expect(page.locator('#undo-btn')).toBeDisabled();
  });

  test('plafond de points : le score est borné par le maximum', async ({ page }) => {
    await startGame(page, { players: 2, points: 10, max: 20 });
    await page.evaluate(() => { openScoreModal(0); pressKey(5); pressKey(0); confirmScoreModal(); });
    expect(await score(page, 0)).toBeLessThanOrEqual(20);
  });
});
