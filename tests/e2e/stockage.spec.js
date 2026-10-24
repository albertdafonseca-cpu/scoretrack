const { test, expect, APP, seedStorage, storage, json, startGame, focusCard } = require('./helpers');

const validSave = (over = {}) => ({
  app: 'main', players: [{ playerName: 'Ana', score: 7, eliminated: false }, { playerName: 'Léo', score: 3, eliminated: false }],
  seatOrder: [0, 1], history: [], actionCounter: 0, numPlayers: 2, startPoints: 5, maxPoints: null, allowNeg: false, ts: 1, ...over,
});

test.describe('Stockage isolé', () => {
  test('une partie n\'écrit que des clés st:main:*', async ({ page }) => {
    await startGame(page, { players: 2, names: ['Ana', 'Léo'] });
    await focusCard(page, 1);
    await page.keyboard.press('+');
    const st = await storage(page);
    const keys = Object.keys(st);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((k) => k.startsWith('st:main:'))).toBe(true);
    expect(keys).toEqual(expect.arrayContaining(['st:main:save', 'st:main:migrated']));
    expect(json(st['st:main:save']).app).toBe('main');
  });

  test('migration des anciennes clés partagées, sans les supprimer', async ({ page }) => {
    await seedStorage(page, {
      scoretrack_save: validSave({ app: undefined }),
      scoretrack_settings: { theme: 'ocean' },
      scoretrack_profiles: ['Zoé'],
      st_privacy_accepted: '1',
    });
    await page.goto('/');
    await expect(page.locator('#restore-banner')).toBeVisible();
    const st = await storage(page);
    expect(st['st:main:migrated']).toBe('1');
    expect(json(st['st:main:save']).players[0].playerName).toBe('Ana');
    expect(json(st['st:main:settings']).theme).toBe('ocean');
    expect(json(st['st:main:profiles'])).toEqual(['Zoé']);
    expect(st['st:main:privacy']).toBe('1');
    for (const old of ['scoretrack_save', 'scoretrack_settings', 'scoretrack_profiles', 'st_privacy_accepted']) expect(st).toHaveProperty(old);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'ocean');
  });

  test('la migration n\'écrase pas une clé isolée existante et ne se rejoue pas', async ({ page }) => {
    await seedStorage(page, { 'st:main:profiles': ['Nouveau'], scoretrack_profiles: ['Ancien'] });
    await page.goto('/');
    expect(json((await storage(page))['st:main:profiles'])).toEqual(['Nouveau']);
    // Une fois « migrated » posé, une ancienne clé ajoutée plus tard n'est pas importée
    await page.evaluate(() => { localStorage.removeItem('st:main:profiles'); localStorage.setItem('scoretrack_profiles', '["Tard"]'); });
    await page.reload();
    expect((await storage(page))['st:main:profiles']).toBeUndefined();
  });

  test('clearAllData n\'efface que les clés de l\'app (après confirmation)', async ({ page }) => {
    await seedStorage(page, { 'st:autre:save': 'X', 'st:light:profiles': '["L"]', 'st:test:settings': '{}', hors_app: 'Y', scoretrack_save: 'old' });
    await startGame(page, { players: 2 });
    await page.evaluate(() => clearAllData());
    expect(page.dialogs.some((d) => d.startsWith('confirm:'))).toBe(true);
    const st = await storage(page);
    const own = Object.keys(st).filter((k) => k.startsWith('st:main:'));
    expect(own).toEqual(['st:main:migrated']);
    expect(st['st:autre:save']).toBe('X');
    expect(st['st:light:profiles']).toBe('["L"]');
    expect(st['st:test:settings']).toBe('{}');
    expect(st.hors_app).toBe('Y');
    expect(st.scoretrack_save).toBe('old');
    await expect(page.locator('#setup-page')).toHaveClass(/active/);
  });

  test('clearAllData annulé ne supprime rien', async ({ page }) => {
    await startGame(page, { players: 2 });
    const before = await storage(page);
    await page.evaluate(() => { window.confirm = () => false; clearAllData(); });
    expect(await storage(page)).toEqual(before);
  });

  test('l\'app ne touche pas aux clés d\'une app sœur', async ({ page }) => {
    const sister = { 'st:autre:save': '{"a":1}', 'st:autre:settings': '{"theme":"gold"}', 'st:autre:profiles': '["S"]', 'st:autre:privacy': '1', 'st:autre:migrated': '1' };
    await seedStorage(page, sister);
    await startGame(page, { players: 3, names: ['A', 'B', 'C'] });
    await focusCard(page, 0);
    await page.keyboard.press('+');
    await page.locator('.bar-btn.accent-btn').click();
    await page.locator('.bar-btn.danger').click();
    await page.locator('#reset-modal .modal-btn.primary').click();
    const st = await storage(page);
    for (const [k, v] of Object.entries(sister)) expect(st[k]).toBe(v);
  });

  const invalids = {
    'players pas un tableau': { players: 'x' },
    'liste de joueurs vide': { players: [], seatOrder: [] },
    'trop de joueurs': { players: Array.from({ length: 13 }, () => ({ score: 0 })), seatOrder: [...Array(13).keys()] },
    'score non numérique': { players: [{ score: 'abc' }], seatOrder: [0] },
    'seatOrder dupliqué': { seatOrder: [0, 0] },
    'seatOrder absent': { seatOrder: undefined },
    'history absent': { history: undefined },
    'sauvegarde d\'une autre app': { app: 'light' },
  };
  for (const [name, over] of Object.entries(invalids)) {
    test(`sauvegarde invalide rejetée : ${name}`, async ({ page }) => {
      await seedStorage(page, { 'st:main:save': validSave(over), 'st:main:migrated': '1' });
      await page.goto('/');
      await expect(page.locator('#setup-page')).toHaveClass(/active/);
      await expect(page.locator('#restore-banner')).toBeHidden();
      await expect(page.locator('#game-screen')).not.toHaveCSS('display', 'flex');
      expect((await storage(page))['st:main:save']).toBeUndefined();
      expect(page.problems).toEqual([]);
    });
  }

  test('JSON corrompu rejeté sans erreur', async ({ page }) => {
    await seedStorage(page, { 'st:main:save': 'pas du json', 'st:main:migrated': '1' });
    await page.goto('/');
    await expect(page.locator('#setup-page')).toHaveClass(/active/);
    await expect(page.locator('#restore-banner')).toBeHidden();
    expect(page.problems).toEqual([]);
  });

  test('une sauvegarde valide est proposée puis reprise', async ({ page }) => {
    await seedStorage(page, { 'st:main:save': validSave(), 'st:main:migrated': '1' });
    await page.goto('/');
    await expect(page.locator('#restore-banner')).toBeVisible();
    await page.locator('.restore-btn.yes').click();
    await expect(page.locator('.pcard')).toHaveCount(2);
    await expect(page.locator('#sc-0')).toHaveText('7');
    await expect(page.locator('#restore-banner')).toBeHidden();
  });

  test('« Effacer » supprime la sauvegarde proposée', async ({ page }) => {
    await seedStorage(page, { 'st:main:save': validSave(), 'st:main:migrated': '1' });
    await page.goto('/');
    await page.locator('.restore-btn.no').click();
    await expect(page.locator('#restore-banner')).toBeHidden();
    expect((await storage(page))['st:main:save']).toBeUndefined();
  });
});
