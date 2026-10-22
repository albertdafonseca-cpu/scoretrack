const { test, expect, startGame, openBar, applyDelta } = require('./helpers');

test('aucune erreur console, aucune réponse HTTP >= 400, aucune requête tierce sur un parcours complet', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startGame(page, { players: 3, names: ['A', 'B', 'C'] });
  await page.locator('#card-1').focus();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowDown');
  await openBar(page);
  await page.click('#undo-btn');
  await page.locator('.bar-btn.accent-btn').click();
  await applyDelta(page, 0, -20);
  await page.evaluate(() => showRecap());
  await expect(page.locator('#recap')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('.pcard')).toHaveCount(3);
  await openBar(page);
  await page.locator('.bar-btn.danger').click();
  await page.click('#btn-menu-reset');
  await expect(page.locator('#setup-page')).toHaveClass(/active/);
  expect(page.problems).toEqual([]);
  expect(page.external).toEqual([]);
});
