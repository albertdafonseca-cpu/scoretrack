const { test, expect, startGame, openBar, applyDelta, acceptPrivacyIfAsked, contrastByTheme, focusCard } = require('./helpers');

test.describe('Accessibilité', () => {
  test('carte joueur : focusable, role=group, aria-label mis à jour au clavier', async ({ page }) => {
    await startGame(page, { players: 3, names: ['Alice', 'Bob', 'Chloé'] });
    const card = page.locator('#card-1');
    await expect(card).toHaveAttribute('tabindex', '0');
    await expect(card).toHaveAttribute('role', 'group');
    await expect(card).toHaveAttribute('aria-label', /^Bob, 20/);
    await card.focus();
    for (const k of ['+', 'ArrowUp', 'ArrowDown', '-', '-']) await page.keyboard.press(k);
    await expect(page.locator('#sc-1')).toHaveText('19');
    await expect(card).toHaveAttribute('aria-label', /^Bob, 19/);
    await expect(page.locator('#sr-status')).toContainText('Bob');
    await expect(page.locator('#sr-status')).toContainText('19');
  });

  test('Entrée ouvre la saisie (focus dans la modale), Échap la ferme et rend le focus', async ({ page }) => {
    await startGame(page, { players: 2 });
    await focusCard(page, 1);
    await page.keyboard.press('Enter');
    const modal = page.locator('#score-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute('role', 'dialog');
    await expect(modal).toHaveAttribute('aria-modal', 'true');
    await expect.poll(() => page.evaluate(() => document.getElementById('score-modal').contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
    await expect(page.locator('#card-1')).toBeFocused();
  });

  test('la modale de reset est une alertdialog : focus sur « Retour au jeu », Échap la ferme', async ({ page }) => {
    await startGame(page, { players: 2 });
    await openBar(page);
    await page.locator('.bar-btn.danger').click();
    const modal = page.locator('#reset-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute('role', 'alertdialog');
    await expect(page.locator('#btn-back-reset')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
  });

  test('les modales portent role, aria-modal et un nom accessible', async ({ page }) => {
    await page.goto('/');
    const info = await page.evaluate(() => [...document.querySelectorAll('.modal-overlay, .fullpage, #pro-popup')].map((m) => ({
      id: m.id, role: m.getAttribute('role'), modal: m.getAttribute('aria-modal'),
      name: (document.getElementById(m.getAttribute('aria-labelledby')) || {}).id,
    })));
    expect(info.length).toBeGreaterThanOrEqual(6);
    for (const m of info) {
      expect(['dialog', 'alertdialog'], m.id).toContain(m.role);
      expect(m.modal, m.id).toBe('true');
      expect(m.name, m.id).toBeTruthy();
    }
  });

  test('tous les boutons visibles ont un nom accessible', async ({ page }) => {
    await startGame(page, { players: 3, names: ['A', 'B', 'C'] });
    await openBar(page);
    const nameless = await page.evaluate(() => [...document.querySelectorAll('button')]
      .filter((e) => e.offsetParent !== null || e.closest('#bar'))
      .filter((e) => !(e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || (e.textContent || '').trim()))
      .map((e) => e.outerHTML.slice(0, 80)));
    expect(nameless).toEqual([]);
  });

  test('les options Pro sont des switch exposés avec aria-checked', async ({ page }) => {
    await page.goto('/');
    await acceptPrivacyIfAsked(page);
    const sw = page.locator('#row-single-winner');
    await expect(sw).toHaveAttribute('role', 'switch');
    await expect(sw).toHaveAttribute('aria-checked', 'false');
    await expect(sw).toHaveAttribute('tabindex', /^-?\d+$/);
  });

  test('puces : boutons clavier avec état ; une puce Pro verrouillée ouvre la fenêtre Pro au clavier', async ({ page }) => {
    await page.goto('/');
    await acceptPrivacyIfAsked(page);
    const chip = page.locator('#players-grid .player-chip', { hasText: /^4$/ });
    await expect(chip).toHaveAttribute('role', 'button');
    await expect(chip).toHaveAttribute('tabindex', '0');
    await chip.focus();
    await page.keyboard.press('Enter');
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    // Puce Pro (5 joueurs ou plus) : verrouillée, Entrée ouvre la fenêtre Pro sans changer le nombre de joueurs
    const locked = page.locator('#players-grid .player-chip', { hasText: /^8$/ });
    await expect(locked).toHaveClass(/lk-disabled/);
    await locked.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#pro-popup')).toHaveClass(/show/);
    expect(await page.evaluate(() => numPlayers)).toBe(4);
  });

  test('erreur de saisie : message texte + aria-invalid', async ({ page }) => {
    await page.goto('/');
    await acceptPrivacyIfAsked(page);
    await page.fill('#points-custom', '-5');
    await expect(page.locator('#points-custom')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#points-custom-err')).not.toBeEmpty();
    await page.fill('#points-custom', '20');
    await expect(page.locator('#points-custom')).not.toHaveAttribute('aria-invalid', 'true');
  });

  test('champs de nom étiquetés « Nom du joueur N »', async ({ page }) => {
    await page.goto('/');
    await acceptPrivacyIfAsked(page);
    await page.locator('#players-grid .player-chip', { hasText: /^3$/ }).click();
    await page.fill('#points-custom', '20');
    await page.click('#go-btn');
    await expect(page.locator('.name-input')).toHaveCount(3);
    await expect(page.locator('.name-input').nth(2)).toHaveAttribute('aria-label', /3/);
  });

  test('indicateurs non chromatiques : forme par joueur et glyphes ▲/▼', async ({ page }) => {
    await page.goto('/');
    await acceptPrivacyIfAsked(page);
    await page.click('#go-btn'); // 6 joueurs par défaut
    await page.click('#names-go-btn');
    await expect(page.locator('.pcard')).toHaveCount(6);
    const shapes = await page.locator('.pcard .pshape').allTextContents();
    expect(new Set(shapes).size).toBe(6);
    await expect(page.locator('.pcard .pshape').first()).toHaveAttribute('aria-hidden', 'true');
    await focusCard(page, 1);
    await page.keyboard.press('+');
    await expect(page.locator('#df-1')).toContainText('▲');
    await page.keyboard.press('-');
    await page.keyboard.press('-');
    await expect(page.locator('#df-1')).toContainText('▼');
  });

  test('contraste du texte des cartes >= 4.5:1 dans les 14 thèmes (6 joueurs)', async ({ page }) => {
    await page.goto('/');
    await acceptPrivacyIfAsked(page);
    await page.click('#go-btn');
    await page.click('#names-go-btn');
    await expect(page.locator('.pcard')).toHaveCount(6);
    const res = await contrastByTheme(page);
    expect(Object.keys(res)).toHaveLength(14);
    const bad = Object.entries(res).filter(([, v]) => v.min < 4.5);
    expect(bad, JSON.stringify(res)).toEqual([]);
  });

  test('mouvement réduit : transitions et animations quasi nulles', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await startGame(page, { players: 2 });
    const d = await page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector('.pcard'));
      return { t: parseFloat(cs.transitionDuration), a: parseFloat(cs.animationDuration) };
    });
    expect(d.t).toBeLessThan(0.01);
    expect(d.a).toBeLessThan(0.01);
  });

  test('un focus clavier est visible (contour)', async ({ page }) => {
    await startGame(page, { players: 2 });
    await focusCard(page, 0);
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    // L'anneau de focus s'anime (transition des boutons) : on attend sa valeur finale
    await expect(async () => {
      const outline = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return { w: parseFloat(s.outlineWidth), st: s.outlineStyle }; });
      expect(outline.st).not.toBe('none');
      expect(outline.w).toBeGreaterThanOrEqual(2);
    }).toPass({ timeout: 2000 });
  });

  test('les cibles du sélecteur de thème et de retour font au moins 44px', async ({ page }) => {
    await page.goto('/');
    await acceptPrivacyIfAsked(page);
    const gear = await page.locator('#btn-theme-gear').boundingBox();
    expect(gear.width).toBeGreaterThanOrEqual(44);
    expect(gear.height).toBeGreaterThanOrEqual(44);
    await page.locator('#btn-theme-gear').click();
    await expect(page.locator('#settings-page')).toHaveClass(/active/);
    const back = await page.locator('#settings-back-btn').boundingBox();
    expect(back.width).toBeGreaterThanOrEqual(44);
    expect(back.height).toBeGreaterThanOrEqual(44);
  });

  test('fin de partie : le focus passe dans la modale de fin et l\'annonce est faite', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await startGame(page, { players: 2, names: ['A', 'B'] });
    await applyDelta(page, 0, -20);
    await applyDelta(page, 1, -20);
    await expect(page.locator('#winner-modal')).toBeVisible();
    await expect(page.locator('#winner-modal')).toHaveAttribute('role', 'dialog');
    await expect.poll(() => page.evaluate(() => document.getElementById('winner-modal').contains(document.activeElement))).toBe(true);
  });
});

test.describe('Piège de focus des modales', () => {
  const inModal = (page, id) => page.evaluate((id) => document.getElementById(id).contains(document.activeElement), id);
  /** Arrière-plan inert, ni la modale ni ses ancêtres. */
  const inertState = (page, id) => page.evaluate((id) => {
    const m = document.getElementById(id);
    return {
      modal: !!m.closest('[inert]'),
      setup: document.getElementById('setup-page').inert,
      // les modales sont dans #game-screen : ce sont ses autres enfants (cartes, barre) qui sont inert
      game: document.getElementById('players-wrap').inert && document.getElementById('bar').inert,
      count: document.querySelectorAll('[inert]').length,
    };
  }, id);
  async function cycle(page, id, n = 14) {
    for (let i = 0; i < n; i++) {
      await page.keyboard.press('Tab');
      expect(await inModal(page, id), `Tab n°${i + 1}`).toBe(true);
    }
    for (let i = 0; i < n; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await inModal(page, id), `Maj+Tab n°${i + 1}`).toBe(true);
    }
  }

  test('modale de score : Tab / Maj+Tab bouclent, arrière-plan inert, focus rendu à la carte', async ({ page }) => {
    await startGame(page, { players: 2 });
    await focusCard(page, 1);
    await page.keyboard.press('Enter');
    await expect(page.locator('#score-modal')).toBeVisible();
    await expect.poll(() => inModal(page, 'score-modal')).toBe(true);
    expect(await inertState(page, 'score-modal')).toMatchObject({ modal: false, setup: true, game: true });
    await cycle(page, 'score-modal', 20); // plus que le nombre d'éléments (pavé de 12 touches + 4 boutons)
    // Boucle exacte : depuis le dernier élément, Tab revient au premier (et inversement)
    const ends = await page.evaluate(() => {
      const f = [...document.querySelectorAll('#score-modal button')].filter((b) => b.getClientRects().length);
      return [f[0].id || f[0].textContent, f[f.length - 1].id || f[f.length - 1].textContent];
    });
    await page.locator('#score-modal-cancel').focus();
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement.id || document.activeElement.textContent)).toBe(ends[0]);
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => document.activeElement.id || document.activeElement.textContent)).toBe(ends[1]);
    await page.keyboard.press('Escape');
    await expect(page.locator('#score-modal')).toBeHidden();
    expect((await inertState(page, 'score-modal')).count).toBe(0);
    await expect(page.locator('#card-1')).toBeFocused();
  });

  test('modale de reset : Tab / Maj+Tab bouclent, arrière-plan inert, focus rendu au bouton Reset', async ({ page }) => {
    await startGame(page, { players: 2 });
    await openBar(page);
    const trigger = page.locator('.bar-btn.danger');
    await trigger.click();
    await expect(page.locator('#reset-modal')).toBeVisible();
    await expect(page.locator('#btn-back-reset')).toBeFocused();
    expect(await inertState(page, 'reset-modal')).toMatchObject({ modal: false, setup: true, game: true });
    await cycle(page, 'reset-modal');
    await page.keyboard.press('Escape');
    await expect(page.locator('#reset-modal')).toBeHidden();
    expect((await inertState(page, 'reset-modal')).count).toBe(0);
    await expect(trigger).toBeFocused();
  });

  test('modales successives : seule la dernière ouverte compte', async ({ page }) => {
    await startGame(page, { players: 2 });
    await openBar(page);
    await page.locator('.bar-btn.danger').click();
    await expect(page.locator('#btn-back-reset')).toBeFocused();
    await page.evaluate(() => _spop());
    await expect(page.locator('#pro-popup')).toBeVisible();
    await expect.poll(() => inModal(page, 'pro-popup')).toBe(true);
    expect(await page.evaluate(() => !!document.getElementById('reset-modal').closest('[inert]'))).toBe(true); // via #game-screen
    expect(await inertState(page, 'pro-popup')).toMatchObject({ modal: false, setup: true });
    expect(await page.evaluate(() => document.getElementById('game-screen').inert)).toBe(true);
    await cycle(page, 'pro-popup', 6);
    await page.keyboard.press('Escape'); // ferme la fenêtre Pro, la modale de reset reste ouverte
    await expect(page.locator('#pro-popup')).toBeHidden();
    await expect(page.locator('#reset-modal')).toBeVisible();
    expect(await inertState(page, 'reset-modal')).toMatchObject({ modal: false, game: true });
    await expect.poll(() => inModal(page, 'reset-modal')).toBe(true);
    await cycle(page, 'reset-modal', 6);
    await page.keyboard.press('Escape');
    await expect(page.locator('#reset-modal')).toBeHidden();
    expect((await inertState(page, 'reset-modal')).count).toBe(0);
  });
});
