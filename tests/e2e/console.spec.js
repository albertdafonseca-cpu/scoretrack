const { test, expect, startGame, openBar, applyDelta, focusCard } = require('./helpers');

test('aucune erreur console, aucune réponse HTTP >= 400, aucune requête tierce sur un parcours complet', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startGame(page, { players: 3, names: ['A', 'B', 'C'] });
  // Les cartes peuvent être redessinées juste après le démarrage (focus perdu) : on réessaie
  await expect(async () => {
    await focusCard(page, 1);
    await page.keyboard.press('ArrowUp'); // bloqué au score de départ (aucun effet attendu)
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#undo-btn')).toBeEnabled({ timeout: 500 });
  }).toPass({ timeout: 7000 });
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
