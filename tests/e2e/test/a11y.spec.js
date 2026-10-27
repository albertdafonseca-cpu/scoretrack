const { test, expect, startGame, openBar, applyDelta, acceptPrivacyIfAsked, contrastByTheme, focusCard } = require('./helpers');

test.describe('Accessibilité', () => {
  test('carte joueur : focusable, role=group, aria-label mis à jour au clavier', async ({ page }) => {
    await startGame(page, { players: 3, names: ['Alice', 'Bob', 'Chloé'] });
    const card = page.locator('#card-1');
    await expect(card).toHaveAttribute('tabindex', '0');
    await expect(card).toHaveAttribute('role', 'group');
    await expect(card).toHaveAttribute('aria-label', /^Bob, 20/);
    // Indication des raccourcis clavier, lue après le nom de la carte
    await expect(card).toHaveAttribute('aria-description', /Entrée/);
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

  test('l\'option « dernier perdant » est un switch clavier synchronisé', async ({ page }) => {
    await page.goto('/');
    await acceptPrivacyIfAsked(page);
    await page.click('#obj-win');
    const sw = page.locator('#row-last-loser');
    await expect(sw).toHaveAttribute('role', 'switch');
    await expect(sw).toHaveAttribute('tabindex', '0');
    await expect(sw).toHaveAttribute('aria-checked', 'false');
    await sw.focus();
    await page.keyboard.press('Enter');
    await expect(sw).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Space');
    await expect(sw).toHaveAttribute('aria-checked', 'false');
  });

  test('puces : boutons clavier avec état', async ({ page }) => {
    await page.goto('/');
    await acceptPrivacyIfAsked(page);
    const chip = page.locator('#players-grid .player-chip', { hasText: /^4$/ });
    await expect(chip).toHaveAttribute('role', 'button');
    await expect(chip).toHaveAttribute('tabindex', '0');
    await chip.focus();
    await page.keyboard.press('Enter');
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => numPlayers)).toBe(4);
    await page.locator('#players-grid .player-chip', { hasText: /^12$/ }).focus();
    await page.keyboard.press('Space');
    expect(await page.evaluate(() => numPlayers)).toBe(12);
    await expect(chip).toHaveAttribute('aria-pressed', 'false');
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

  test('indicateurs non chromatiques : une forme par joueur (12) et glyphes ▲/▼', async ({ page }) => {
    await startGame(page, { players: 12 });
    const shapes = await page.locator('.pcard .pshape').allTextContents();
    expect(new Set(shapes).size).toBe(12);
    await expect(page.locator('.pcard .pshape').first()).toHaveAttribute('aria-hidden', 'true');
    await focusCard(page, 1);
    await page.keyboard.press('+');
    await expect(page.locator('#df-1')).toContainText('▲');
    await page.keyboard.press('-');
    await page.keyboard.press('-');
    await expect(page.locator('#df-1')).toContainText('▼');
  });

  test('contraste du texte des cartes >= 4.5:1 dans les 14 thèmes (12 joueurs)', async ({ page }) => {
    await startGame(page, { players: 12, points: 40 });
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
    const gear = await page.locator('.logo-gear').boundingBox();
    expect(gear.width).toBeGreaterThanOrEqual(44);
    expect(gear.height).toBeGreaterThanOrEqual(44);
    await page.locator('.logo-gear').click();
    await expect(page.locator('#settings-page')).toHaveClass(/active/);
    const back = await page.locator('#settings-page .back-btn').boundingBox();
    expect(back.width).toBeGreaterThanOrEqual(44);
    expect(back.height).toBeGreaterThanOrEqual(44);
  });

  test('fin de partie : le focus passe dans la modale de fin et l\'annonce est faite', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await startGame(page, { players: 2, names: ['A', 'B'] });
    await applyDelta(page, 0, -20);
    await page.click('#btn-elim-confirm-txt');
    await expect(page.locator('#winner-modal')).toBeVisible();
    await expect(page.locator('#winner-modal')).toHaveAttribute('role', 'dialog');
    await expect.poll(() => page.evaluate(() => document.getElementById('winner-modal').contains(document.activeElement))).toBe(true);
  });

  // ── Piège de focus des modales ──
  /** Appuie N fois sur Tab (ou Maj+Tab) et vérifie à chaque pas que le focus reste dans la modale. */
  async function tabStaysIn(page, id, key, n = 25) {
    const seen = new Set();
    for (let i = 0; i < n; i++) {
      await page.keyboard.press(key);
      const r = await page.evaluate((id) => {
        const a = document.activeElement;
        return { inside: document.getElementById(id).contains(a), tag: a && (a.id || a.className || a.tagName) };
      }, id);
      expect(r.inside, `${key} n°${i + 1} : focus sur ${r.tag}`).toBe(true);
      seen.add(r.tag);
    }
    return seen;
  }
  const inertState = (page, id) => page.evaluate((id) => {
    const m = document.getElementById(id);
    return {
      // les modales sont dans #game-screen (ancêtre jamais inert) : ce sont les cartes et la barre qui le deviennent
      bg: !!document.getElementById('card-0').closest('[inert]') && !!document.getElementById('setup-page').closest('[inert]'),
      ancestor: !!document.getElementById('game-screen').closest('[inert]'),
      bar: !!document.getElementById('bar').closest('[inert]'),
      modal: !!m.closest('[inert]'),
      count: document.querySelectorAll('[inert]').length,
    };
  }, id);

  test('piège de focus : modale de saisie (Tab / Maj+Tab bouclent, arrière-plan inert, focus rendu)', async ({ page }) => {
    await startGame(page, { players: 3 });
    // comme applyDelta : l'ouverture peut être ignorée juste après le premier rendu
    await expect(async () => {
      await focusCard(page, 1);
      await page.keyboard.press('Enter');
      await expect(page.locator('#score-modal')).toBeVisible({ timeout: 800 });
    }).toPass({ timeout: 10_000 });
    await expect.poll(() => page.evaluate(() => document.getElementById('score-modal').contains(document.activeElement))).toBe(true);
    expect(await inertState(page, 'score-modal')).toMatchObject({ bg: true, bar: true, modal: false, ancestor: false });
    // le pavé compte plus de 10 boutons : 25 pressions font au moins un tour complet dans chaque sens
    const fwd = await tabStaysIn(page, 'score-modal', 'Tab');
    expect(fwd.size).toBeGreaterThan(5);
    await tabStaysIn(page, 'score-modal', 'Shift+Tab');
    await page.keyboard.press('Escape');
    await expect(page.locator('#score-modal')).toBeHidden();
    expect(await inertState(page, 'score-modal')).toMatchObject({ bg: false, bar: false, count: 0 });
    await expect(page.locator('#card-1')).toBeFocused();
  });

  test('piège de focus : modale de reset (boucle premier ↔ dernier, inert levé à la fermeture)', async ({ page }) => {
    await startGame(page, { players: 2 });
    await openBar(page);
    const opener = page.locator('.bar-btn.danger');
    await opener.focus();
    await page.keyboard.press('Enter');
    const modal = page.locator('#reset-modal');
    await expect(modal).toBeVisible();
    await expect(page.locator('#btn-back-reset')).toBeFocused();
    expect(await inertState(page, 'reset-modal')).toMatchObject({ bg: true, bar: true, modal: false, ancestor: false });
    const btns = modal.locator('button:visible');
    const n = await btns.count();
    expect(n).toBeGreaterThanOrEqual(2);
    // depuis le dernier bouton, Tab revient au premier ; depuis le premier, Maj+Tab va au dernier
    await btns.nth(n - 1).focus();
    await page.keyboard.press('Tab');
    await expect(btns.first()).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(btns.nth(n - 1)).toBeFocused();
    await tabStaysIn(page, 'reset-modal', 'Tab', 3 * n);
    await tabStaysIn(page, 'reset-modal', 'Shift+Tab', 3 * n);
    // le déclencheur (arrière-plan) est inert tant que la modale est ouverte
    expect(await page.evaluate(() => { const b = document.querySelector('.bar-btn.danger'); return b.closest('[inert]') !== null; })).toBe(true);
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
    expect(await inertState(page, 'reset-modal')).toMatchObject({ bg: false, bar: false, count: 0 });
    await expect(opener).toBeFocused();
  });

  test('piège de focus : modales successives (élimination → fin), seule la dernière compte', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await startGame(page, { players: 2, names: ['A', 'B'] });
    await applyDelta(page, 0, -20);
    await expect(page.locator('#elim-modal')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.getElementById('elim-modal').contains(document.activeElement))).toBe(true);
    await tabStaysIn(page, 'elim-modal', 'Tab', 6);
    await tabStaysIn(page, 'elim-modal', 'Shift+Tab', 6);
    await page.click('#btn-elim-confirm-txt');
    await expect(page.locator('#winner-modal')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.getElementById('winner-modal').contains(document.activeElement))).toBe(true);
    expect(await inertState(page, 'winner-modal')).toMatchObject({ bg: true, modal: false, ancestor: false });
    await tabStaysIn(page, 'winner-modal', 'Tab', 8);
    await tabStaysIn(page, 'winner-modal', 'Shift+Tab', 8);
  });
});
