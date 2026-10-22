const { test, expect, startGame, score, contrastByTheme } = require('./helpers');

test.describe('Accessibilité', () => {
  test('carte joueur : focusable, role=group, aria-label mis à jour au clavier', async ({ page }) => {
    await startGame(page, { players: 3, names: ['Alice', 'Bob', 'Chloé'] });
    const card = page.locator('#card-1');
    await expect(card).toHaveAttribute('tabindex', '0');
    await expect(card).toHaveAttribute('role', 'group');
    await expect(card).toHaveAttribute('aria-label', 'Bob, 20 points');
    await card.focus();
    for (const k of ['+', 'ArrowUp', 'ArrowDown', '-', '-']) await page.keyboard.press(k);
    await expect(page.locator('#sc-1')).toHaveText('19');
    await expect(card).toHaveAttribute('aria-label', 'Bob, 19 points');
    await expect(page.locator('#sr-status')).toContainText('Bob');
    await expect(page.locator('#sr-status')).toContainText('total 19');
  });

  test('Entrée ouvre la saisie (focus dans la modale), Échap la ferme et rend le focus', async ({ page }) => {
    await startGame(page, { players: 2 });
    await page.locator('#card-1').focus();
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

  test('Échap ferme la modale de reset et rend le focus au déclencheur', async ({ page }) => {
    await startGame(page, { players: 2 });
    const trigger = page.locator('.bar-btn.danger');
    await trigger.focus();
    await page.keyboard.press('Enter');
    const modal = page.locator('#reset-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute('role', 'alertdialog');
    await expect.poll(() => page.evaluate(() => document.getElementById('reset-modal').contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('les modales portent role, aria-modal et un nom accessible', async ({ page }) => {
    await page.goto('/');
    const info = await page.evaluate(() => [...document.querySelectorAll('.modal-overlay, .fullpage')].map((m) => ({
      id: m.id, role: m.getAttribute('role'), modal: m.getAttribute('aria-modal'),
      name: (document.getElementById(m.getAttribute('aria-labelledby')) || {}).id,
    })));
    expect(info.length).toBeGreaterThanOrEqual(5);
    for (const m of info) {
      expect(['dialog', 'alertdialog'], m.id).toContain(m.role);
      expect(m.modal, m.id).toBe('true');
      expect(m.name, m.id).toBeTruthy();
    }
  });

  test('tous les boutons et champs ont un nom accessible', async ({ page }) => {
    await startGame(page, { players: 3, names: ['A', 'B', 'C'] });
    await page.goto('/');
    await page.locator('#players-grid .player-chip', { hasText: /^3$/ }).click();
    await page.locator('#start-presets .points-chip[data-val="20"]').click();
    await page.click('#go-btn');
    const nameless = await page.evaluate(() => [...document.querySelectorAll('button, input')]
      .filter((e) => e.type !== 'hidden' && e.offsetParent !== null || e.closest('#bar'))
      .filter((e) => !(e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || (e.textContent || '').trim() || (e.labels && e.labels.length)))
      .map((e) => e.outerHTML.slice(0, 80)));
    expect(nameless).toEqual([]);
  });

  test('l\'interrupteur « scores négatifs » est un switch synchronisé', async ({ page }) => {
    await page.goto('/');
    const sw = page.locator('#neg-toggle');
    await expect(sw).toHaveAttribute('role', 'switch');
    await expect(sw).toHaveAttribute('aria-checked', 'false');
    await sw.click();
    await expect(sw).toHaveAttribute('aria-checked', 'true');
    await sw.focus();
    await page.keyboard.press('Enter');
    await expect(sw).toHaveAttribute('aria-checked', 'false');
  });

  test('les puces de nombre de joueurs sont des boutons clavier avec état', async ({ page }) => {
    await page.goto('/');
    const chip = page.locator('#players-grid .player-chip', { hasText: /^4$/ });
    await expect(chip).toHaveAttribute('role', 'button');
    await expect(chip).toHaveAttribute('tabindex', '0');
    await chip.focus();
    await page.keyboard.press('Enter');
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
  });

  test('erreur de saisie : message texte + aria-invalid', async ({ page }) => {
    await page.goto('/');
    await page.locator('#start-presets .points-chip[data-val="40"]').click();
    await page.locator('#max-custom').fill('5');
    await expect(page.locator('#max-custom')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#max-error')).not.toBeEmpty();
  });

  test('champs de nom étiquetés « Nom du joueur N »', async ({ page }) => {
    await page.goto('/');
    await page.locator('#players-grid .player-chip', { hasText: /^3$/ }).click();
    await page.locator('#start-presets .points-chip[data-val="20"]').click();
    await page.click('#go-btn');
    await expect(page.locator('.name-input')).toHaveCount(3);
    await expect(page.locator('.name-input').nth(2)).toHaveAttribute('aria-label', 'Nom du joueur 3');
  });

  test('indicateurs non chromatiques : forme par joueur et glyphes ▲/▼', async ({ page }) => {
    await startGame(page, { players: 8 });
    const shapes = await page.locator('.pcard .pshape').allTextContents();
    expect(new Set(shapes).size).toBe(8);
    await expect(page.locator('.pcard .pshape').first()).toHaveAttribute('aria-hidden', 'true');
    await page.locator('#card-1').focus();
    await page.keyboard.press('+');
    await expect(page.locator('#df-1')).toContainText('▲');
    await page.keyboard.press('-');
    await page.keyboard.press('-');
    await expect(page.locator('#df-1')).toContainText('▼');
  });

  test('contraste du texte des cartes >= 4.5:1 dans les 14 thèmes (8 joueurs)', async ({ page }) => {
    await startGame(page, { players: 8, points: 40 });
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
    await page.keyboard.press('Tab');
    const outline = await page.evaluate(() => { const e = document.activeElement; const s = getComputedStyle(e); return { w: parseFloat(s.outlineWidth), st: s.outlineStyle }; });
    expect(outline.st).not.toBe('none');
    expect(outline.w).toBeGreaterThanOrEqual(2);
  });

  test('les cibles de réglages et de retour font au moins 44px', async ({ page }) => {
    await page.goto('/');
    const gear = await page.locator('.logo-gear').boundingBox();
    expect(gear.width).toBeGreaterThanOrEqual(44);
    expect(gear.height).toBeGreaterThanOrEqual(44);
    await page.locator('.logo-gear').click();
    const back = await page.locator('.back-btn').boundingBox();
    expect(back.width).toBeGreaterThanOrEqual(44);
    expect(back.height).toBeGreaterThanOrEqual(44);
  });
});
