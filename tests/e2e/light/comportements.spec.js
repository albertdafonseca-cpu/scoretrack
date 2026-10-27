const { test, expect, startGame, score, focusCard, acceptPrivacyIfAsked } = require('./helpers');

// Comportements unifiés entre les sites (étape 6, voir docs/ARCHITECTURE.md) — même fichier dans chaque suite
async function openScoreModal(page, i) {
  await expect(async () => {
    await focusCard(page, i);
    await page.keyboard.press('Enter');
    await expect(page.locator('#score-modal')).toBeVisible({ timeout: 800 });
  }).toPass({ timeout: 10_000 });
}

test.describe('Comportements communs', () => {
  test('barre d\'état : couleur = fond du thème, pour les 14 thèmes', async ({ page }) => {
    await page.goto('/');
    const res = await page.evaluate(() => THEMES.map((th) => {
      applyTheme(th.id);
      return [th.id, document.getElementById('meta-theme-color').content, getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()];
    }));
    expect(res).toHaveLength(14);
    for (const [id, meta, bg] of res) {
      expect(meta, id).toMatch(/^#[0-9a-f]{6}$/i);
      expect(meta, id).toBe(bg);
    }
    // Les thèmes clairs ont une barre claire (avant : sombre par défaut)
    for (const id of ['light', 'mono-light', 'ldm-day']) {
      const [, meta] = res.find((r) => r[0] === id);
      const n = parseInt(meta.slice(1), 16);
      expect(((n >> 16) + ((n >> 8) & 255) + (n & 255)) / 3, id).toBeGreaterThan(200);
    }
  });

  test('pavé numérique : la souris fonctionne sur un PC à écran tactile', async ({ page }) => {
    await page.addInitScript(() => { window.ontouchstart = null; }); // « 'ontouchstart' in window » devient vrai
    await startGame(page, { players: 2, points: 20 });
    expect(await page.evaluate(() => 'ontouchstart' in window)).toBe(true);
    await openScoreModal(page, 0);
    await page.locator('#modal-keypad .key-btn', { hasText: /^7$/ }).click();
    await page.locator('#modal-keypad .key-btn', { hasText: /^3$/ }).click();
    await expect(page.locator('#score-modal-display')).toHaveText(/73/);
    await page.click('#sign-plus');
    await expect(page.locator('#score-modal')).toBeHidden();
    expect(await score(page, 0)).toBe(93);
  });

  test('saisie : les touches + et − agissent comme les boutons ±', async ({ page }) => {
    await startGame(page, { players: 2, points: 20 });
    // Frappe rapide avant que le focus passe dans la modale : la touche part de la carte et ne doit compter qu'une fois
    await page.evaluate(() => {
      const card = document.getElementById('card-1');
      card.focus();
      openScoreModal(1);
      for (const key of ['2', '-']) card.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    });
    await expect(page.locator('#score-modal')).toBeHidden();
    await expect.poll(() => score(page, 1)).toBe(18);
    await openScoreModal(page, 1);
    await page.keyboard.press('5');
    await page.keyboard.press('-');
    await expect(page.locator('#score-modal')).toBeHidden();
    await expect.poll(() => score(page, 1)).toBe(13);
    await openScoreModal(page, 1);
    await page.keyboard.press('-');
    await expect(page.locator('#score-modal-display')).toHaveText(/^▼ −/); // vrai signe moins
    await page.keyboard.press('+');
    await expect(page.locator('#score-modal-display')).toHaveText(/^▲ \+/);
    await page.keyboard.press('3');
    await page.keyboard.press('+');
    await expect(page.locator('#score-modal')).toBeHidden();
    await expect.poll(() => score(page, 1)).toBe(16); // 13 + 3
  });

  test('Échap ferme la fenêtre de victoire', async ({ page }) => {
    await startGame(page, { players: 2 });
    await page.evaluate(() => document.getElementById('winner-modal').classList.remove('hidden'));
    await expect(page.locator('#winner-modal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#winner-modal')).toBeHidden();
  });

  test('score critique : contour et ⚠ en plus de la couleur', async ({ page }) => {
    await startGame(page, { players: 2 });
    const st = await page.evaluate(() => {
      const el = document.getElementById('sc-0');
      el.classList.add('crit');
      return { after: getComputedStyle(el, '::after').content, outline: getComputedStyle(el).outlineStyle, deco: getComputedStyle(el).textDecorationLine };
    });
    expect(st.after).toContain('⚠');
    expect(st.outline).toBe('solid');
    expect(st.deco).toBe('none');
  });

  test('prénoms : jusqu\'à 12 caractères', async ({ page }) => {
    await page.goto('/');
    await acceptPrivacyIfAsked(page);
    await page.locator('#players-grid .player-chip', { hasText: /^2$/ }).click();
    await page.fill('#points-custom', '20');
    await page.click('#go-btn');
    await expect(page.locator('#names-page')).toHaveClass(/active/);
    await expect(page.locator('.name-input').first()).toHaveAttribute('maxlength', '12');
  });
});
