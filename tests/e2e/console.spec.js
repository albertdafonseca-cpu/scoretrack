const { test, expect, startGame, tapCard0 } = require('./helpers');

test('aucune erreur console, aucune réponse HTTP >= 400, aucune requête tierce sur un parcours complet', async ({ page }) => {
  await page.goto('/');
  await page.locator('.logo-gear').click();
  await expect(page.locator('#settings-page')).toHaveClass(/active/);
  await page.locator('.back-btn').click();
  await startGame(page, { players: 3, names: ['A', 'B', 'C'] });
  await tapCard0(page, true);
  await page.locator('#card-1').focus();
  await page.keyboard.press('ArrowDown');
  await page.click('#undo-btn');
  await page.locator('.bar-btn.accent-btn').click();
  await page.locator('.bar-btn >> nth=2').click();
  await expect(page.locator('#recap')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.reload();
  await page.locator('.restore-btn.yes').click();
  await expect(page.locator('.pcard')).toHaveCount(3);
  await page.locator('.bar-btn.danger').click();
  await page.locator('#reset-modal .modal-btn.primary').click();
  await expect(page.locator('#setup-page')).toHaveClass(/active/);
  expect(page.problems).toEqual([]);
  expect(page.external).toEqual([]);
});
