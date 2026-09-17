// PWA et résilience : hors-ligne réel (serveur arrêté), mise à jour signalée et appliquée sans perdre la
// partie, migration depuis les anciens caches, sauvegarde corrompue, export/import, manifeste, haptique,
// bannière d'erreur. Serveur statique dédié (port libre) pour pouvoir le couper et servir un SW modifié.
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './helpers/static-server.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHOTS = process.env.PWA_SHOTS_DIR || join(ROOT, 'test-results', 'pwa');
const IGNORED = /ERR_CERT_AUTHORITY_INVALID/;

const swSource = readFileSync(join(ROOT, 'sw-st.js'), 'utf8');
const SW_VERSION = swSource.match(/const VERSION = '([^']+)';/)[1];
const PRECACHE = [...swSource.matchAll(/^ {2}'(\.\/[^']*)',$/gm)].map((m) => m[1]);

let server;
test.beforeAll(async () => {
  server = await startStaticServer({ root: ROOT });
});
test.afterAll(async () => {
  await server.stop();
});

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  return errors;
}

async function openApp(page) {
  await page.goto(server.url);
  await expect(page.locator('#splash')).toHaveCount(0);
  await expect(page.locator('#setup-page')).toBeVisible();
}

/** Attend que le SW contrôle la page (première installation : activation + clients.claim). */
async function waitForController(page) {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
    timeout: 20_000,
  });
}

async function startGame(page, { players, start, names = [] }) {
  await page.locator('#players-grid .player-chip', { hasText: new RegExp(`^${players}$`) }).click();
  await page.locator(`#start-presets .points-chip[data-val="${start}"]`).click();
  await page.locator('#names-btn').click();
  await expect(page.locator('.name-input')).toHaveCount(players);
  for (let i = 0; i < names.length; i++) await page.locator('.name-input').nth(i).fill(names[i]);
  await page.getByRole('button', { name: /Lancer/ }).click();
  await expect(page.locator('.pcard')).toHaveCount(players);
}

/** Tap « + » ou « − » sur une carte selon son orientation. */
async function tapCard(page, cardId, side) {
  const card = page.locator(`#${cardId}`);
  const rot = await card.evaluate((c) => [...c.classList].find((k) => k.startsWith('rot-')));
  const box = await card.boundingBox();
  const far = side === 'plus' ? 0.8 : 0.2;
  const near = 1 - far;
  let x = box.x + box.width / 2;
  let y = box.y + box.height / 2;
  if (rot === 'rot-l') y = box.y + box.height * far;
  else if (rot === 'rot-r') y = box.y + box.height * near;
  else if (rot === 'rot-180') x = box.x + box.width * near;
  else x = box.x + box.width * far;
  await page.touchscreen.tap(x, y);
}

async function tapTimes(page, cardId, side, n, scoreId, expected) {
  for (let i = 0; i < n; i++) await tapCard(page, cardId, side);
  await expect(page.locator(scoreId)).toHaveText(expected);
}

const cacheNames = (page) => page.evaluate(() => caches.keys());
/** Sauvegarde persistée, normalisée par le schéma courant (indépendant de l'écran de reprise). */
const parsedSave = (page) =>
  page.evaluate(async () => {
    const s = await import('./js/core/save-schema.js');
    return s.parseGameOrNull(localStorage.getItem('scoretrack_save'));
  });
const storageSnapshot = (page) =>
  page.evaluate(() =>
    Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])),
  );

test('hors ligne : partie complète jouable serveur coupé, précache sans 404, anciens caches purgés', async ({
  page,
  context,
}) => {
  const errors = collectErrors(page);
  // Caches d'une ancienne installation, présents avant le premier enregistrement du SW.
  await context.addInitScript(() => {
    if (!sessionStorage.getItem('legacy-seeded')) {
      sessionStorage.setItem('legacy-seeded', '1');
      caches.open('st-v1');
      caches.open('st-fonts-v1');
    }
  });
  await openApp(page);
  await waitForController(page);

  // Précache complet : un seul cache, versionné, contenant exactement la liste générée ; aucun 404 côté serveur.
  await expect.poll(() => cacheNames(page)).toEqual([`st-${SW_VERSION}`]);
  const cachedCount = await page.evaluate(
    async (name) => (await (await caches.open(name)).keys()).length,
    `st-${SW_VERSION}`,
  );
  expect(cachedCount).toBe(PRECACHE.length);
  const precachePaths = new Set(
    PRECACHE.map((p) => p.replace(/^\./, '').replace(/\/$/, '/index.html')),
  );
  expect(server.requests.filter((r) => r.status === 404 && precachePaths.has(r.path))).toEqual([]);

  await startGame(page, { players: 4, start: 0, names: ['Alice', 'Bruno'] });
  await tapTimes(page, 'card-0', 'plus', 3, '#sc-0', '3');
  await page.waitForTimeout(50);

  // Vrai hors-ligne : le serveur est arrêté et le contexte déclaré hors ligne.
  await server.stop();
  try {
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#splash')).toHaveCount(0);
    expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
    await expect(page.locator('#restore-banner')).toBeVisible();
    const saved = await parsedSave(page);
    expect(saved.players.map((p) => [p.playerName, p.score])).toEqual([
      ['Alice', 3],
      ['Bruno', 0],
      ['', 0],
      ['', 0],
    ]);
    // Partie complète jouée hors ligne : setup → noms → jeu → taps → annulation → récap.
    await startGame(page, { players: 3, start: 0, names: ['Chloé'] });
    await expect(page.locator('#card-0 .pplayer')).toHaveText('Chloé');
    await tapTimes(page, 'card-1', 'plus', 2, '#sc-1', '2');
    await tapTimes(page, 'card-1', 'minus', 1, '#sc-1', '1');
    await page.locator('#undo-btn').tap();
    await expect(page.locator('#sc-1')).toHaveText('2');
    await page.getByRole('button', { name: /Récap/ }).click();
    await expect(page.locator('#recap')).toBeVisible();
    await page.locator('#recap-close-btn').click();
    // Une navigation hors ligne vers une URL de raccourci est servie depuis le cache.
    const res = await page.goto(`${server.url}?action=resume`);
    expect(res.status()).toBe(200);
    await expect(page.locator('#setup-page')).toBeVisible();
    await expect(page.locator('#restore-banner')).toBeVisible();
    // Les polices auto-hébergées sont bien servies hors ligne (aucun échec de chargement).
    const fontFail = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts].filter((f) => f.status === 'error').map((f) => f.family);
    });
    expect(fontFail).toEqual([]);
  } finally {
    await context.setOffline(false);
    await server.start();
  }
  expect(errors).toEqual([]);
});

test('mise à jour : bannière, application sur action, partie intacte, caches précédents supprimés', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openApp(page);
  await waitForController(page);
  await startGame(page, { players: 2, start: 10, names: ['Alice', 'Bruno'] });
  await tapTimes(page, 'card-0', 'plus', 4, '#sc-0', '14');
  await tapTimes(page, 'card-1', 'minus', 2, '#sc-1', '8');
  await expect(page.locator('#update-banner')).toHaveCount(0);

  // Le serveur publie un SW dont la version diffère : la vérification trouve la nouvelle version.
  server.setSwVersion('e2e-beta');
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
  const banner = page.locator('#update-banner');
  await expect(banner).toBeVisible();
  await expect(banner).toHaveAttribute('role', 'status');
  await expect(banner).toContainText('Nouvelle version disponible');
  await expect(banner).toHaveClass(/above-bar/);
  // La bannière ne recouvre pas la barre de jeu.
  const [b, bar] = await Promise.all([banner.boundingBox(), page.locator('#bar').boundingBox()]);
  expect(b.y + b.height).toBeLessThanOrEqual(bar.y + 1);
  await page.screenshot({ path: join(SHOTS, 'update-banner-game.png') });
  // Les scores n'ont pas bougé et la partie reste jouable pendant que la version attend.
  await expect(page.locator('#sc-0')).toHaveText('14');
  await tapTimes(page, 'card-0', 'plus', 1, '#sc-0', '15');

  // « Plus tard » masque la bannière ; on la ré-affiche pour appliquer (nouvelle page = nouvelle session).
  await banner.getByRole('button', { name: 'Plus tard' }).click();
  await expect(banner).toBeHidden();
  await page.reload();
  await expect(page.locator('#splash')).toHaveCount(0);
  await expect(page.locator('#update-banner')).toBeVisible();
  await page.screenshot({ path: join(SHOTS, 'update-banner-setup.png') });
  await page.getByRole('button', { name: 'Mettre à jour' }).click();
  await page.waitForFunction(
    () => performance.getEntriesByType('navigation')[0]?.type === 'reload',
    null,
    { timeout: 15_000 },
  );
  await expect(page.locator('#splash')).toHaveCount(0);

  // Nouvelle version active, anciens caches supprimés, partie intacte.
  await expect.poll(() => cacheNames(page)).toEqual(['st-e2e-beta']);
  const version = await page.evaluate(() =>
    import('./js/platform/sw-client.js').then((m) => m.getServiceWorkerVersion()),
  );
  expect(version).toBe('e2e-beta');
  await expect(page.locator('#update-banner')).toHaveCount(0);
  await expect(page.locator('#restore-banner')).toBeVisible();
  const saved = await parsedSave(page);
  expect(saved.players.map((p) => [p.playerName, p.score])).toEqual([
    ['Alice', 15],
    ['Bruno', 8],
  ]);
  expect(saved.startPoints).toBe(10);
  server.setSwVersion(null);
  expect(errors).toEqual([]);
});

test('migration depuis st-v1 : le nouveau SW prend la main sans attendre et purge les anciens caches', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openApp(page);
  await waitForController(page);
  await page.evaluate(async () => {
    await caches.open('st-v1');
    await caches.open('st-fonts-v1');
  });
  server.setSwVersion('e2e-migr');
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
  await expect.poll(() => cacheNames(page), { timeout: 20_000 }).toEqual(['st-e2e-migr']);
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller.state))
    .toBe('activated');
  // Aucune bannière résiduelle : l'attente a été levée automatiquement.
  await expect(page.locator('#update-banner')).toBeHidden();
  server.setSwVersion(null);
  expect(errors).toEqual([]);
});

const PREV_SAVE = {
  v: 1,
  players: [
    { playerName: 'Alice', score: 7, eliminated: false },
    { playerName: 'Bruno', score: 12, eliminated: false },
  ],
  seatOrder: [1, 0],
  history: [],
  actionCounter: 0,
  numPlayers: 2,
  startPoints: 10,
  maxPoints: null,
  allowNeg: false,
  ts: 1_700_000_000_000,
};

test('sauvegarde corrompue : pas de plantage, réglages intacts, quarantaine et .prev proposée', async ({
  page,
  context,
}) => {
  const errors = collectErrors(page);
  await context.addInitScript((prev) => {
    if (sessionStorage.getItem('corrupt-seeded')) return;
    sessionStorage.setItem('corrupt-seeded', '1');
    localStorage.setItem('scoretrack_settings', JSON.stringify({ v: 1, theme: 'light' }));
    localStorage.setItem('scoretrack_save', '{"players":[');
    localStorage.setItem('scoretrack_save.prev', JSON.stringify(prev));
  }, PREV_SAVE);
  await openApp(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const state = await page.evaluate(async () => {
    const m = await import('./js/platform/storage.js');
    const s = m.getRecoveryState();
    return {
      status: s.status,
      prevAvailable: s.prevAvailable,
      prevTs: s.prevTs,
      prevNames: s.prev.players.map((p) => p.playerName),
      corrupt: localStorage.getItem('scoretrack_save.corrupt'),
      main: localStorage.getItem('scoretrack_save'),
      settings: localStorage.getItem('scoretrack_settings'),
    };
  });
  expect(state.status).toBe('corrupt');
  expect(state.prevAvailable).toBe(true);
  expect(state.prevTs).toBe(PREV_SAVE.ts);
  expect(state.prevNames).toEqual(['Alice', 'Bruno']);
  expect(state.corrupt).toBe('{"players":[');
  expect(state.main).toBeNull();
  expect(JSON.parse(state.settings)).toEqual({ v: 1, theme: 'light' });
  // Une partie neuve ne doit pas être proposée à la reprise tant que rien n'est restauré.
  await expect(page.locator('#restore-banner')).toBeHidden();

  // Restauration de la dernière sauvegarde valide puis reprise effective.
  const restored = await page.evaluate(async () => {
    const m = await import('./js/platform/storage.js');
    const ok = m.restorePrev();
    return {
      ok,
      state: m.getRecoveryState().status,
      corrupt: localStorage.getItem('scoretrack_save.corrupt'),
    };
  });
  expect(restored).toEqual({ ok: true, state: 'ok', corrupt: null });
  await page.reload();
  await expect(page.locator('#splash')).toHaveCount(0);
  await expect(page.locator('#restore-banner')).toBeVisible();
  const saved = await parsedSave(page);
  expect(saved.players.map((p) => [p.playerName, p.score])).toEqual([
    ['Alice', 7],
    ['Bruno', 12],
  ]);
  expect(saved.seatOrder).toEqual([1, 0]);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(errors).toEqual([]);
});

test('sauvegarde atomique : .prev suit la dernière valeur valide, écriture interrompue finalisée', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openApp(page);
  await startGame(page, { players: 2, start: 0 });
  await tapTimes(page, 'card-0', 'plus', 1, '#sc-0', '1');
  await tapTimes(page, 'card-0', 'plus', 1, '#sc-0', '2');
  const snap = await storageSnapshot(page);
  expect(JSON.parse(snap.scoretrack_save).players[0].score).toBe(2);
  expect(JSON.parse(snap['scoretrack_save.prev']).players[0].score).toBe(1);
  expect(snap['scoretrack_save.tmp']).toBeUndefined();
  // Écriture interrompue : seul .tmp existe → finalisé au chargement suivant.
  await page.evaluate(() => {
    localStorage.setItem('scoretrack_save.tmp', localStorage.getItem('scoretrack_save'));
    localStorage.removeItem('scoretrack_save');
  });
  await page.reload();
  await expect(page.locator('#restore-banner')).toBeVisible();
  const after = await storageSnapshot(page);
  expect(JSON.parse(after.scoretrack_save).players[0].score).toBe(2);
  expect(after['scoretrack_save.tmp']).toBeUndefined();
  expect(errors).toEqual([]);
});

test('export puis import : données identiques, import invalide refusé sans écriture partielle', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openApp(page);
  await page.locator('#players-grid .player-chip', { hasText: /^3$/ }).click();
  await page.locator('#start-presets .points-chip[data-val="20"]').click();
  await page.locator('#names-btn').click();
  const inputs = page.locator('.name-input');
  await inputs.nth(0).fill('Alice');
  await inputs.nth(1).fill('Bruno');
  await page.getByRole('button', { name: /Mémoriser/ }).click();
  await page.getByRole('button', { name: /Lancer/ }).click();
  await expect(page.locator('.pcard')).toHaveCount(3);
  await tapTimes(page, 'card-0', 'plus', 2, '#sc-0', '22');

  const before = await storageSnapshot(page);
  const result = await page.evaluate(async () => {
    const b = await import('./js/platform/backup.js');
    const text = b.exportData();
    const doc = JSON.parse(text);
    localStorage.clear();
    const imported = b.importData(text);
    const bad1 = b.importData('{"app":"autre","v":2}');
    const bad2 = b.importData(JSON.stringify({ app: 'scoretrack', v: 2, save: { players: [] } }));
    const bad3 = b.importData('{"players":[');
    return { doc, imported, bad1, bad2, bad3, filename: b.exportFilename(new Date(2026, 8, 17)) };
  });
  expect(result.doc.app).toBe('scoretrack');
  expect(result.doc.v).toBe(2);
  expect(typeof result.doc.exportedAt).toBe('string');
  expect(result.imported.ok).toBe(true);
  expect(result.imported.summary).toMatch(
    /^2 prénoms, 1 partie en cours, (réglages|aucun réglage)$/,
  );
  expect(result.bad1.ok).toBe(false);
  expect(result.bad2.ok).toBe(false);
  expect(result.bad3.ok).toBe(false);
  expect(result.filename).toBe('scoretrack-2026-09-17.json');
  const after = await storageSnapshot(page);
  const parse = (raw) => (raw === undefined ? null : JSON.parse(raw));
  for (const key of ['scoretrack_settings', 'scoretrack_profiles']) {
    expect(parse(after[key])).toEqual(parse(before[key]));
  }
  // La partie ré-importée est équivalente une fois normalisée (schéma courant, somme de contrôle recalculée).
  const same = await page.evaluate(
    async ([a, b]) => {
      const s = await import('./js/core/save-schema.js');
      return JSON.stringify(s.parseGameOrNull(a)) === JSON.stringify(s.parseGameOrNull(b));
    },
    [before.scoretrack_save, after.scoretrack_save],
  );
  expect(same).toBe(true);
  // Téléchargement : nom de fichier daté.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.evaluate(() => import('./js/platform/backup.js').then((b) => b.downloadExport())),
  ]);
  expect(download.suggestedFilename()).toMatch(/^scoretrack-\d{4}-\d{2}-\d{2}\.json$/);
  // Après rechargement, la partie importée se reprend normalement.
  await page.reload();
  await expect(page.locator('#restore-banner')).toBeVisible();
  const saved = await parsedSave(page);
  expect(saved.players.map((p) => [p.playerName, p.score])).toEqual([
    ['Alice', 22],
    ['Bruno', 20],
    ['', 20],
  ]);
  expect(errors).toEqual([]);
});

test('manifeste valide : champs, icônes any/maskable, captures et raccourcis servis en PNG aux bonnes tailles', async ({
  page,
  request,
}) => {
  const errors = collectErrors(page);
  await openApp(page);
  const res = await request.get(`${server.url}manifest-st.json`);
  expect(res.status()).toBe(200);
  const m = await res.json();
  expect(m).toMatchObject({
    id: 'scoretrack',
    name: 'ScoreTrack',
    lang: 'fr',
    dir: 'ltr',
    start_url: './',
    scope: './',
    display: 'standalone',
    orientation: 'portrait-primary',
  });
  expect(m.display_override).toContain('standalone');
  expect(m.categories.length).toBeGreaterThan(0);
  expect(m.theme_color).toBe(m.background_color);
  expect(m.icons.some((i) => i.purpose === 'any' && i.sizes === '512x512')).toBe(true);
  expect(m.icons.some((i) => i.purpose === 'maskable' && i.sizes === '512x512')).toBe(true);
  expect(m.icons.some((i) => i.purpose && i.purpose.includes(' '))).toBe(false);
  expect(m.screenshots.filter((s) => s.form_factor === 'narrow')).toHaveLength(2);
  expect(m.shortcuts.map((s) => s.name)).toEqual(['Nouvelle partie', 'Reprendre la partie']);

  const images = [...m.icons, ...m.screenshots, ...m.shortcuts.flatMap((s) => s.icons)];
  for (const img of images) {
    const r = await request.get(server.url + img.src);
    expect(r.status(), img.src).toBe(200);
    expect(r.headers()['content-type'], img.src).toBe('image/png');
    const buf = await r.body();
    const [w, h] = img.sizes.split('x').map(Number);
    expect(buf.readUInt32BE(16), `${img.src} largeur`).toBe(w);
    expect(buf.readUInt32BE(20), `${img.src} hauteur`).toBe(h);
  }
  for (const s of m.shortcuts) {
    const r = await request.get(server.url + s.url.replace(/^\.\//, ''));
    expect(r.status()).toBe(200);
  }
  const linked = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(linked).toBe('manifest-st.json');
  expect(errors).toEqual([]);
});

test('haptique : motifs distincts, préférence respectée ; coller un prénom reste possible', async ({
  page,
  context,
}) => {
  const errors = collectErrors(page);
  await context.addInitScript(() => {
    window.__vibrations = [];
    navigator.vibrate = (p) => {
      window.__vibrations.push(p);
      return true;
    };
  });
  await openApp(page);
  const out = await page.evaluate(async () => {
    const h = await import('./js/platform/haptics.js');
    const s = await import('./js/platform/storage.js');
    const r = {};
    r.tap = h.haptic('tap');
    r.floor = h.haptic('floor');
    r.elim = h.haptic('elim');
    r.unknown = h.haptic('nope');
    r.calls = window.__vibrations.slice();
    s.writeJSON('scoretrack_settings', { v: 1, theme: 'cyber', vibrations: false });
    r.disabled = h.haptic('tap');
    r.enabledFlag = h.hapticsEnabled();
    s.writeJSON('scoretrack_settings', { v: 1, theme: 'cyber', vibrations: true });
    r.reenabled = h.haptic('win');
    r.total = window.__vibrations.length;
    return r;
  });
  expect(out.tap).toBe(true);
  expect(out.unknown).toBe(false);
  expect(out.calls).toEqual([10, [30, 20, 30], [50, 30, 80]]);
  expect(out.disabled).toBe(false);
  expect(out.enabledFlag).toBe(false);
  expect(out.reenabled).toBe(true);
  expect(out.total).toBe(4);

  // Menu contextuel : bloqué sur la page, autorisé dans un champ de saisie (coller un prénom).
  await page.locator('#players-grid .player-chip', { hasText: /^2$/ }).click();
  await page.locator('#start-presets .points-chip[data-val="0"]').click();
  await page.locator('#names-btn').click();
  const prevented = await page.evaluate(() => {
    const fire = (el) =>
      !el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    return { input: fire(document.querySelector('.name-input')), body: fire(document.body) };
  });
  expect(prevented).toEqual({ input: false, body: true });
  expect(errors).toEqual([]);
});

test('erreur non gérée : bannière discrète, partie sauvegardée, journal local exportable', async ({
  page,
}) => {
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED.test(m.text())) consoleErrors.push(m.text());
  });
  await openApp(page);
  await startGame(page, { players: 2, start: 0 });
  await tapTimes(page, 'card-0', 'plus', 1, '#sc-0', '1');
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error('Erreur de test (volontaire)');
    }, 0);
  });
  const toast = page.locator('#sys-toast');
  await expect(toast).toBeVisible();
  await expect(toast).toHaveText('Un problème est survenu, la partie a été sauvegardée');
  await expect(toast).toHaveAttribute('role', 'status');
  await page.screenshot({ path: join(SHOTS, 'error-toast.png') });
  const diag = await page.evaluate(async () => {
    const e = await import('./js/platform/errors.js');
    const journal = e.getErrorJournal();
    const text = await e.exportDiagnostics();
    return {
      journal,
      text,
      save: JSON.parse(localStorage.getItem('scoretrack_save')).players[0].score,
    };
  });
  expect(diag.journal).toHaveLength(1);
  expect(diag.journal[0].message).toContain('Erreur de test');
  expect(diag.text).toContain('Service worker :');
  expect(diag.text).toContain('Erreur de test (volontaire)');
  expect(diag.text).toContain('Stockage :');
  expect(diag.save).toBe(1);
  expect(pageErrors).toEqual(['Erreur de test (volontaire)']);
  expect(consoleErrors).toEqual([]);
});
