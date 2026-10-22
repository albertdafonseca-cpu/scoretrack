const { test, expect, storage, json, startGame, score, applyDelta, tapCard, openBar, acceptPrivacyIfAsked } = require('./helpers');

const saved = async (page) => json((await storage(page))['st:light:save']);

test.describe('Parcours de jeu', () => {
  test('setup : valeurs par défaut valides, puces Pro verrouillées', async ({ page }) => {
    await page.goto('/');
    await acceptPrivacyIfAsked(page);
    await expect(page.locator('#go-btn')).toBeEnabled();
    // 5 joueurs est une option Pro : fenêtre d'information, le nombre de joueurs ne change pas
    const before = await page.evaluate(() => numPlayers);
    await page.locator('#players-grid .player-chip', { hasText: /^5$/ }).click();
    await expect(page.locator('#pro-popup')).toHaveClass(/show/);
    expect(await page.evaluate(() => numPlayers)).toBe(before);
    await page.keyboard.press('Escape');
    await expect(page.locator('#pro-popup')).not.toHaveClass(/show/);
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
    await page.locator('#card-2').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#score-modal')).toBeVisible();
    await page.keyboard.press('5');
    await expect(page.locator('#score-modal-display')).toHaveText(/^▲ \+5/);
    await page.click('#sign-minus');
    await expect(page.locator('#score-modal')).toBeHidden();
    await expect(page.locator('#sc-2')).toHaveText('15');
    await expect(page.locator('#df-2')).toContainText('▼');
  });

  test('rotation : l\'ordre des places change et est sauvegardé', async ({ page }) => {
    await startGame(page, { players: 3 });
    const before = (await saved(page)).seatOrder.join(',');
    await openBar(page);
    await page.locator('.bar-btn.accent-btn').click();
    await expect.poll(async () => (await saved(page)).seatOrder.join(',')).not.toBe(before);
  });

  test('rechargement : la partie en cours est reprise avec ses scores', async ({ page }) => {
    await startGame(page, { players: 3, names: ['A', 'B', 'C'] });
    await page.locator('#card-1').focus();
    await page.keyboard.press('+');
    await expect.poll(async () => (await saved(page)).players[1].score).toBe(21);
    await page.reload();
    await expect(page.locator('.pcard')).toHaveCount(3);
    await expect(page.locator('#sc-1')).toHaveText('21');
    await expect(page.locator('#game-screen')).toHaveCSS('display', 'flex');
  });

  test('reset : « Retour au jeu » conserve la partie, « Retour au menu » l\'efface', async ({ page }) => {
    await startGame(page, { players: 2 });
    await openBar(page);
    await page.locator('.bar-btn.danger').click();
    await expect(page.locator('#reset-modal')).toBeVisible();
    await page.click('#btn-back-reset');
    await expect(page.locator('#reset-modal')).toBeHidden();
    await expect(page.locator('.pcard')).toHaveCount(2);
    await page.locator('.bar-btn.danger').click();
    await page.click('#btn-menu-reset');
    await expect(page.locator('#setup-page')).toHaveClass(/active/);
    await expect(page.locator('#restore-banner')).toBeHidden();
    expect((await storage(page))['st:light:save']).toBeUndefined();
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
    expect(json((await storage(page))['st:light:profiles'])).toEqual(['Zed', 'Yan']);
    await page.locator('.profile-chip-del').first().click();
    await expect(page.locator('.profile-chip-name')).toHaveText(['Yan']);
    expect(json((await storage(page))['st:light:profiles'])).toEqual(['Yan']);
  });

  test('langue : le sélecteur change la langue de l\'interface et la mémorise', async ({ page }) => {
    await page.goto('/');
    await acceptPrivacyIfAsked(page);
    await page.click('#lang-flag-btn');
    await page.locator('#lang-dropdown .lang-opt[lang="en"]').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('#go-btn')).toContainText('Next');
    expect(json((await storage(page))['st:light:settings']).lang).toBe('en');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test.describe('Spécificités Light', () => {
    test('victoire à 0 : le joueur est marqué vainqueur, la partie continue pour les autres', async ({ page }) => {
      await startGame(page, { players: 3, names: ['A', 'B', 'C'] });
      await applyDelta(page, 0, -20);
      await expect.poll(() => page.evaluate(() => players[0].winner)).toBe(true);
      await expect(page.locator('#winner-modal')).toBeHidden();
    });

    test('fin de partie (mouvement réduit) : modale de fin, sauvegarde effacée, annulation possible', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await startGame(page, { players: 2, names: ['A', 'B'] });
      await applyDelta(page, 0, -20);
      await applyDelta(page, 1, -20);
      await expect(page.locator('#winner-modal')).toBeVisible();
      await expect(page.locator('#fin-anim-overlay')).toBeHidden();
      await expect.poll(async () => (await storage(page))['st:light:save']).toBeUndefined();
      // Annuler depuis la fin : modale masquée, dernier score restauré
      await page.evaluate(() => undoLast());
      await expect(page.locator('#winner-modal')).toBeHidden();
      expect(await score(page, 1)).toBe(20);
      expect(await page.evaluate(() => players[1].winner)).toBeFalsy();
    });

    test('fin de partie avec animation : l\'overlay s\'affiche et Échap le passe', async ({ page }) => {
      await startGame(page, { players: 2, names: ['A', 'B'] });
      await applyDelta(page, 0, -20);
      await applyDelta(page, 1, -20);
      const overlay = page.locator('#fin-anim-overlay, #win-anim-overlay');
      await expect(overlay.first()).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('#fin-anim-overlay')).toBeHidden();
      await expect(page.locator('#win-anim-overlay')).toBeHidden();
      await expect(page.locator('#winner-modal')).toBeVisible();
    });

    test('récap : montre les vainqueurs avec glyphes ▲/▼ et ferme avec Échap', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await startGame(page, { players: 3, names: ['A', 'B', 'C'] });
      await applyDelta(page, 0, 5);
      await applyDelta(page, 0, -25);
      await page.evaluate(() => showRecap());
      await expect(page.locator('#recap')).toBeVisible();
      const txt = await page.locator('#recap-body').textContent();
      expect(txt).toContain('▲');
      expect(txt).toContain('▼');
      await page.keyboard.press('Escape');
      await expect(page.locator('#recap')).toBeHidden();
    });

    test('élimination (preset Loi du Milieu) : un joueur à 0 est éliminé, les autres continuent', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/');
      await acceptPrivacyIfAsked(page);
      await page.locator('.preset-card').first().click();
      await page.click('#go-btn');
      await page.click('#names-go-btn');
      await expect(page.locator('.pcard')).toHaveCount(6);
      expect(await page.evaluate(() => objectifMode)).toBe('elim');
      await applyDelta(page, 0, -(await score(page, 0)));
      await expect.poll(() => page.evaluate(() => !!players[0].eliminated)).toBe(true);
      expect(await page.evaluate(() => players.filter((p) => p.eliminated).length)).toBe(1);
      await expect(page.locator('#winner-modal')).toBeHidden();
      await expect(page.locator('#card-0')).toHaveClass(/elim/);
    });

    test('export PDF verrouillé : fenêtre Pro, jsPDF jamais chargé', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await startGame(page, { players: 2 });
      await applyDelta(page, 0, -20);
      await page.evaluate(() => showRecap());
      await expect(page.locator('#recap')).toBeVisible();
      await page.evaluate(() => exportRecapPDF());
      await expect(page.locator('#pro-popup')).toHaveClass(/show/);
      expect(await page.evaluate(() => !!window.jspdf)).toBe(false);
      expect(await page.evaluate(() => [...document.scripts].some((s) => /jspdf/.test(s.src)))).toBe(false);
      await page.keyboard.press('Escape');
      await expect(page.locator('#pro-popup')).not.toHaveClass(/show/);
    });

    test('les options de victoire Pro sont verrouillées', async ({ page }) => {
      await page.goto('/');
      await acceptPrivacyIfAsked(page);
      await page.locator('#row-last-loser').click();
      await expect(page.locator('#pro-popup')).toHaveClass(/show/);
      expect(await page.evaluate(() => lastLoser)).toBeFalsy();
    });
  });

  test('appui long sur Annuler : vide la pile puis s\'arrête, même relâché hors du bouton', async ({ page }) => {
    await startGame(page, { players: 2, points: 50 });
    await page.locator('#card-0').focus();
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
