const { test, expect, APP, seedStorage, storage, json, startGame, acceptPrivacyIfAsked } = require('./helpers');

const validSave = (over = {}) => ({
  app: 'test', saveVersion: 33,
  players: [{ playerName: 'Ana', score: 7 }, { playerName: 'Léo', score: 3 }],
  seatOrder: [0, 1], history: [], actionCounter: 0, numPlayers: 2, startPoints: 20, maxPoints: null, allowNeg: false,
  elimPoints: null, winPoints: null, objectifMode: 'none', bloquerMode: 'none', rankCounter: 0, singleWinner: false, lastLoser: false, lastGameConfig: null, ts: 1, ...over,
});
const tooMany = () => Array.from({ length: 13 }, (_, i) => ({ playerName: 'P' + i, score: 10 }));

test.describe('Stockage isolé', () => {
  test('une partie n\'écrit que des clés st:test:*', async ({ page }) => {
    await startGame(page, { players: 2, names: ['Ana', 'Léo'] });
    await page.locator('#card-1').focus();
    await page.keyboard.press('+');
    await expect.poll(async () => Object.keys(await storage(page))).toEqual(expect.arrayContaining(['st:test:save']));
    const st = await storage(page);
    expect(Object.keys(st).every((k) => k.startsWith('st:test:'))).toBe(true);
    expect(Object.keys(st)).toEqual(expect.arrayContaining(['st:test:privacy', 'st:test:migrated']));
    expect(json(st['st:test:save']).app).toBe('test');
  });

  test('premier lancement : confidentialité dans une clé isolée, ancienne clé ignorée', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#privacy-modal')).toHaveClass(/active/);
    await page.click('#btn-privacy-accept');
    await expect(page.locator('#setup-page')).toHaveClass(/active/);
    const st = await storage(page);
    expect(st['st:test:privacy']).toBe('1');
    expect(st).not.toHaveProperty('st_privacy_accepted');
    // L'acceptation d'une autre app (clé isolée) n'évite pas l'écran ici
    await page.evaluate(() => { localStorage.removeItem('st:test:privacy'); localStorage.setItem('st:main:privacy', '1'); });
    await page.reload();
    await expect(page.locator('#privacy-modal')).toHaveClass(/active/);
  });

  test('migration des anciennes clés partagées, sans les supprimer', async ({ page }) => {
    await seedStorage(page, {
      scoretrack_save: validSave({ app: undefined }),
      scoretrack_settings: { lang: 'de' },
      scoretrack_profiles: ['Zoé'],
      st_privacy_accepted: '1',
    });
    await page.goto('/');
    // L'app reprend automatiquement la partie en cours
    await expect(page.locator('.pcard')).toHaveCount(2);
    const st = await storage(page);
    expect(st['st:test:migrated']).toBe('1');
    expect(json(st['st:test:save']).players[0].playerName).toBe('Ana');
    expect(json(st['st:test:settings']).lang).toBe('de');
    expect(json(st['st:test:profiles'])).toEqual(['Zoé']);
    expect(st['st:test:privacy']).toBe('1');
    for (const old of ['scoretrack_save', 'scoretrack_settings', 'scoretrack_profiles', 'st_privacy_accepted']) expect(st).toHaveProperty(old);
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  });

  test('une sauvegarde héritée hors limites (13 joueurs) est migrée puis rejetée sans crash', async ({ page }) => {
    await seedStorage(page, {
      scoretrack_save: validSave({ app: undefined, players: tooMany(), seatOrder: [...Array(13).keys()] }),
      scoretrack_profiles: ['Zoé'],
      st_privacy_accepted: '1',
    });
    await page.goto('/');
    await expect(page.locator('#setup-page')).toHaveClass(/active/);
    await expect(page.locator('#restore-banner')).toBeHidden();
    const st = await storage(page);
    expect(st).not.toHaveProperty('st:test:save');
    expect(st['st:test:profiles']).toBe('["Zoé"]');
    expect(st).toHaveProperty('scoretrack_save');
    expect(page.problems).toEqual([]);
  });

  test('la migration n\'écrase pas une clé isolée existante et ne se rejoue pas', async ({ page }) => {
    await seedStorage(page, { 'st:test:profiles': ['Nouveau'], 'st:test:privacy': '1', scoretrack_profiles: ['Ancien'] });
    await page.goto('/');
    expect(json((await storage(page))['st:test:profiles'])).toEqual(['Nouveau']);
    await page.evaluate(() => { localStorage.removeItem('st:test:profiles'); localStorage.setItem('scoretrack_profiles', '["Tard"]'); });
    await page.reload();
    expect((await storage(page))['st:test:profiles']).toBeUndefined();
  });

  test('clearAllData n\'efface que les clés de l\'app (après confirmation)', async ({ page }) => {
    await seedStorage(page, { 'st:autre:save': 'X', 'st:main:profiles': '["L"]', 'st:sib:settings': '{}', hors_app: 'Y', scoretrack_save: 'old' });
    await startGame(page, { players: 2 });
    await page.evaluate(() => clearAllData());
    expect(page.dialogs.some((d) => d.startsWith('confirm:'))).toBe(true);
    const st = await storage(page);
    expect(Object.keys(st).filter((k) => k.startsWith('st:test:'))).toEqual(['st:test:migrated']);
    expect(st['st:autre:save']).toBe('X');
    expect(st['st:main:profiles']).toBe('["L"]');
    expect(st['st:sib:settings']).toBe('{}');
    expect(st.hors_app).toBe('Y');
    expect(st.scoretrack_save).toBe('old');
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
    await page.locator('#card-0').focus();
    await page.keyboard.press('+');
    await page.evaluate(() => rotatePlayers());
    await page.evaluate(() => confirmReset());
    const st = await storage(page);
    for (const [k, v] of Object.entries(sister)) expect(st[k]).toBe(v);
  });

  const invalids = {
    'players pas un tableau': { players: 'x' },
    'liste de joueurs vide': { players: [], seatOrder: [] },
    'trop de joueurs (14)': { players: Array.from({ length: 14 }, () => ({ score: 0 })), seatOrder: [...Array(14).keys()] },
    'score non numérique': { players: [{ score: 'abc' }, { score: 1 }] },
    'seatOrder incohérent': { seatOrder: [0, 0] },
    'seatOrder absent': { seatOrder: undefined },
    'history absent': { history: undefined },
    'version de sauvegarde trop ancienne': { saveVersion: 1 },
    'sauvegarde d\'une autre app': { app: 'main' },
  };
  for (const [name, over] of Object.entries(invalids)) {
    test(`sauvegarde invalide rejetée : ${name}`, async ({ page }) => {
      await seedStorage(page, { 'st:test:save': validSave(over), 'st:test:migrated': '1', 'st:test:privacy': '1' });
      await page.goto('/');
      await expect(page.locator('#setup-page')).toHaveClass(/active/);
      await expect(page.locator('#restore-banner')).toBeHidden();
      await expect(page.locator('#game-screen')).not.toHaveCSS('display', 'flex');
      expect((await storage(page))['st:test:save']).toBeUndefined();
      expect(page.problems).toEqual([]);
    });
  }

  test('JSON corrompu rejeté sans erreur', async ({ page }) => {
    await seedStorage(page, { 'st:test:save': 'pas du json', 'st:test:migrated': '1', 'st:test:privacy': '1' });
    await page.goto('/');
    await expect(page.locator('#setup-page')).toHaveClass(/active/);
    await expect(page.locator('#restore-banner')).toBeHidden();
    expect(page.problems).toEqual([]);
  });

  test('une sauvegarde valide est reprise automatiquement', async ({ page }) => {
    await seedStorage(page, { 'st:test:save': validSave(), 'st:test:migrated': '1', 'st:test:privacy': '1' });
    await page.goto('/');
    await expect(page.locator('.pcard')).toHaveCount(2);
    await expect(page.locator('#sc-0')).toHaveText('7');
    await expect(page.locator('#sc-1')).toHaveText('3');
    await expect(page.locator('#restore-banner')).toBeHidden();
    await expect(page.locator('#game-screen')).toHaveCSS('display', 'flex');
  });
});
