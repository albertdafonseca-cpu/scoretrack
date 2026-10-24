const { test, expect, XSS_NAME, seedStorage, startGame, focusCard } = require('./helpers');

test.describe('Sécurité', () => {
  test('un prénom <img onerror> n\'est jamais exécuté (cartes, récap, profils)', async ({ page }) => {
    await seedStorage(page, { 'st:main:profiles': [XSS_NAME, 'O\'Brien"><b>x'], 'st:main:migrated': '1' });
    await page.goto('/');
    await page.locator('#players-grid .player-chip', { hasText: /^3$/ }).click();
    await page.locator('#start-presets .points-chip[data-val="20"]').click();
    await page.click('#go-btn');

    // Chips de profil : texte brut, aucun gestionnaire inline
    const chips = page.locator('.profile-chip-name');
    await expect(chips).toHaveText([XSS_NAME, 'O\'Brien"><b>x']);
    await expect(page.locator('#profiles-list img, #profiles-list b')).toHaveCount(0);
    await expect(page.locator('#profiles-list [onclick]')).toHaveCount(0);

    // Saisie directe d'un nom hostile dans le champ
    await page.locator('.name-input').nth(0).click();
    await chips.nth(0).click();
    await page.locator('.name-input').nth(1).fill('Bob');
    await page.click('.names-go-btn');
    await expect(page.locator('.pcard')).toHaveCount(3);
    await expect(page.locator('#card-0 .pplayer')).toContainText('<img src=x');
    await expect(page.locator('#players-wrap img')).toHaveCount(0);

    await focusCard(page, 0);
    await page.keyboard.press('+');
    await page.locator('.bar-btn >> nth=2').click();
    await expect(page.locator('#recap')).toBeVisible();
    await expect(page.locator('#recap img')).toHaveCount(0);
    expect(await page.locator('#recap-body').innerHTML()).toContain('&lt;img');
    expect(page.dialogs.filter((d) => d.startsWith('alert'))).toEqual([]);
  });

  test('un nom hostile restauré depuis le stockage est échappé', async ({ page }) => {
    await seedStorage(page, {
      'st:main:migrated': '1',
      'st:main:save': { app: 'main', players: [{ playerName: XSS_NAME, score: 1 }, { playerName: '<script>alert(2)</script>', score: 2 }], seatOrder: [0, 1], history: [], startPoints: 0, maxPoints: null },
    });
    await page.goto('/');
    await page.locator('.restore-btn.yes').click();
    await expect(page.locator('.pcard')).toHaveCount(2);
    await expect(page.locator('#players-wrap img, #players-wrap script')).toHaveCount(0);
    await expect(page.locator('#card-1 .pplayer')).toContainText('<script>');
    expect(page.dialogs).toEqual([]);
  });

  test('aucune requête vers un tiers pendant un parcours complet', async ({ page }) => {
    await startGame(page, { players: 2, names: ['A', 'B'] });
    await focusCard(page, 0);
    await page.keyboard.press('+');
    await page.locator('.bar-btn >> nth=2').click();
    await expect(page.locator('#recap')).toBeVisible();
    await page.goto('/');
    await page.locator('.logo-gear').click();
    await expect(page.locator('#settings-page')).toHaveClass(/active/);
    expect(page.external).toEqual([]);
  });

  test('aucune référence à un CDN ou à Google Fonts dans la page', async ({ page, request }) => {
    const html = await (await request.get('/index.html')).text();
    expect(html).not.toMatch(/fonts\.googleapis|fonts\.gstatic|cdnjs|unpkg|jsdelivr/);
  });
});
