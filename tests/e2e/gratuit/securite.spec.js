const { eliminate, selectStart, test, expect, XSS_NAME, seedStorage, startGame, setName, openBar, applyDelta, focusCard } = require('./helpers');

test.describe('Sécurité', () => {
  test('un prénom <img onerror> n\'est jamais exécuté (profils, cartes, récap)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await seedStorage(page, { 'st:main:profiles': [XSS_NAME, 'O\'Brien"><b>x'], 'st:main:privacy': '1', 'st:main:migrated': '1' });
    await page.goto('/');
    // Modèle Loi du Milieu (Défaite à 0, seule fin de partie gratuite), 2 joueurs à 20 points
    await page.locator('.preset-card').first().click();
    await page.locator('#players-grid .player-chip', { hasText: /^2$/ }).click();
    await selectStart(page, 20);
    await page.click('#go-btn');

    const chips = page.locator('#profiles-list .profile-chip-name');
    await expect(chips).toHaveText([XSS_NAME, 'O\'Brien"><b>x']);
    await expect(page.locator('#profiles-list img, #profiles-list b')).toHaveCount(0);
    await expect(page.locator('#profiles-list [onclick]')).toHaveCount(0);

    await setName(page, 0, XSS_NAME);
    await page.locator('.name-input').nth(1).fill('Bob');
    await page.click('#names-go-btn');
    await expect(page.locator('.pcard')).toHaveCount(2);
    await expect(page.locator('#players-wrap img')).toHaveCount(0);
    expect(await page.evaluate(() => players.some((p) => p.playerName === '<img src=x onerror=alert(1)>'))).toBe(true);
    await expect(page.locator('.pplayer', { hasText: '<img src=x' })).toHaveCount(1);

    // Bob est éliminé à 0, le joueur au nom hostile reste seul et gagne : il figure au récap
    const others = await page.evaluate(() => players.map((p, i) => i).filter((i) => !players[i].playerName.startsWith('<img')));
    for (const i of others) await eliminate(page, i, -20);
    await expect.poll(() => page.evaluate(() => players.find((p) => p.playerName.startsWith('<img')).winner)).toBe(true);
    await page.evaluate(() => showRecap());
    await expect(page.locator('#recap')).toBeVisible();
    await expect(page.locator('#recap img')).toHaveCount(0);
    expect(await page.locator('#recap-body').innerHTML()).toContain('&lt;img');
    expect(page.dialogs.filter((d) => d.startsWith('alert'))).toEqual([]);
  });

  test('un nom hostile restauré depuis le stockage est échappé', async ({ page }) => {
    await seedStorage(page, {
      'st:main:migrated': '1', 'st:main:privacy': '1',
      'st:main:save': { app: 'main', saveVersion: 33, players: [{ playerName: XSS_NAME, score: 1 }, { playerName: '<script>alert(2)</script>', score: 2 }], seatOrder: [0, 1], history: [], startPoints: 20, objectifMode: 'win', winPoints: 0 },
    });
    await page.goto('/');
    await expect(page.locator('.pcard')).toHaveCount(2);
    await expect(page.locator('#players-wrap img, #players-wrap script')).toHaveCount(0);
    await expect(page.locator('.pplayer', { hasText: '<script>' })).toHaveCount(1);
    expect(page.dialogs).toEqual([]);
  });

  test('aucune requête vers un tiers pendant un parcours complet', async ({ page }) => {
    await startGame(page, { players: 2, names: ['A', 'B'] });
    await focusCard(page, 0);
    await page.keyboard.press('+');
    await page.evaluate(() => showRecap());
    await expect(page.locator('#recap')).toBeVisible();
    await page.keyboard.press('Escape');
    await openBar(page);
    await page.evaluate(() => showThemeFromGame());
    expect(page.external).toEqual([]);
  });

  test('aucune référence à un CDN ou à Google Fonts dans la page', async ({ page, request }) => {
    const html = await (await request.get('/index.html')).text();
    expect(html).not.toMatch(/fonts\.googleapis|fonts\.gstatic|cdnjs|unpkg|jsdelivr/);
  });
});
