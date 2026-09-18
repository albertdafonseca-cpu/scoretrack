// PWA et résilience : hors-ligne réel (serveur arrêté), mise à jour signalée et appliquée sans perdre la
// partie, migration depuis les anciens caches, raccourcis du manifeste, précache tout-ou-rien, stockage
// en échec, sauvegarde corrompue, export/import, haptique, bannière d'erreur.
// Serveur statique dédié (port libre) : il peut être coupé, bloquer un fichier et servir un SW modifié.
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './helpers/static-server.js';
import { collectFiles, computeVersion } from '../../scripts/build-sw.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHOTS = process.env.PWA_SHOTS_DIR || join(ROOT, 'test-results', 'pwa');
/** Bruit d'environnement uniquement (proxy TLS du bac à sable), jamais un défaut de l'application. */
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

/** Erreurs ET avertissements console + exceptions de page (exigence 7.2 : zéro des deux). */
function collectErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    const type = m.type();
    if ((type === 'error' || type === 'warning') && !IGNORED.test(m.text())) {
      errors.push(`console.${type}: ${m.text()}`);
    }
  });
  return errors;
}

async function openApp(page, search = '') {
  await page.goto(server.url + search);
  await expect(page.locator('#splash')).toHaveCount(0);
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

/** Tap « + » ou « − » sur une carte (demi-zones explicites de l'écran de jeu). */
async function tapCard(page, cardId, side) {
  await page.locator(`#${cardId} .tap-half.${side}`).tap();
}

/** Scores affichés, sans séparateurs de milliers (l'ordre suit les indices de joueur). */
const domScores = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[id^="sc-"]')].map((n) => n.textContent.replace(/\s/g, '')),
  );

/** Sauvegarde persistée, relue par le schéma courant (indépendante de l'écran de reprise). */
const parsedSave = (page) =>
  page.evaluate(async () => {
    const s = await import('./js/core/save-schema.js');
    return s.parseGameOrNull(localStorage.getItem('scoretrack_save'));
  });

/** Scores persistés, sous la même forme que `domScores` : ce qui est affiché doit être ce qui est écrit. */
async function savedScores(page) {
  const save = await parsedSave(page);
  return save === null ? null : save.players.map((p) => String(p.score));
}

/**
 * Tape une fois et renvoie les scores affichés puis persistés. Le pas de comptage appartient à
 * l'écran de jeu ; ce qui est vérifié ici est que l'affichage et la sauvegarde ne divergent jamais.
 */
async function tapAndSync(page, cardId, side = 'plus') {
  const before = await domScores(page);
  await tapCard(page, cardId, side);
  await expect.poll(() => domScores(page)).not.toEqual(before);
  const dom = await domScores(page);
  await expect.poll(() => savedScores(page)).toEqual(dom);
  return dom;
}

/** Identifiant de la carte dont le bas est le plus près de la barre (celle que la bannière menace). */
const bottomCardId = (page) =>
  page.evaluate(() => {
    const cards = [...document.querySelectorAll('.pcard')];
    return cards.reduce((a, b) =>
      b.getBoundingClientRect().bottom > a.getBoundingClientRect().bottom ? b : a,
    ).id;
  });

const cacheNames = (page) => page.evaluate(() => caches.keys());
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
  const beforeOffline = await tapAndSync(page, 'card-0', 'plus');

  // Vrai hors-ligne : le serveur est arrêté et le contexte déclaré hors ligne.
  await server.stop();
  try {
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#splash')).toHaveCount(0);
    expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
    await expect(page.locator('#restore-banner')).toBeVisible();
    expect(await savedScores(page)).toEqual(beforeOffline);
    const save = await parsedSave(page);
    expect(save.players.map((p) => p.playerName)).toEqual(['Alice', 'Bruno', '', '']);

    // Partie complète jouée hors ligne : accueil → noms → jeu → taps → annulation → récap.
    await startGame(page, { players: 3, start: 0, names: ['Chloé'] });
    await expect(page.locator('#card-0 .pplayer')).toHaveText('Chloé');
    const afterTap = await tapAndSync(page, 'card-1', 'plus');
    await page.locator('#undo-btn').tap();
    await expect.poll(() => domScores(page)).not.toEqual(afterTap);
    await expect.poll(() => savedScores(page)).toEqual(await domScores(page));
    await page.getByRole('button', { name: /Récap/ }).click();
    await expect(page.locator('#recap')).toBeVisible();
    await page.locator('#recap-close-btn').click();

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

test('raccourcis du manifeste : ?action=resume ouvre la partie, ?action=new masque la reprise', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openApp(page);
  await startGame(page, { players: 2, start: 10, names: ['Alice', 'Bruno'] });
  const scores = await tapAndSync(page, 'card-0', 'plus');

  // Référence : une ouverture normale reste sur l'accueil avec la bannière de reprise.
  await openApp(page);
  await expect(page.locator('#setup-page')).toBeVisible();
  await expect(page.locator('#restore-banner')).toBeVisible();
  await expect(page.locator('#game-screen')).toBeHidden();

  // ?action=resume : l'écran de jeu directement, scores intacts, sans passer par la bannière.
  await openApp(page, '?action=resume');
  await expect(page.locator('#game-screen')).toBeVisible();
  await expect(page.locator('.pcard')).toHaveCount(2);
  expect(await domScores(page)).toEqual(scores);
  await expect(page.locator('#card-1 .pplayer')).toHaveText('Bruno');
  await expect(page.locator('#restore-banner')).toBeHidden();
  // Le paramètre est retiré : un rechargement ne rejoue pas le raccourci.
  expect(await page.evaluate(() => location.search)).toBe('');
  await page.reload();
  await expect(page.locator('#setup-page')).toBeVisible();
  await expect(page.locator('#game-screen')).toBeHidden();

  // ?action=new : accueil sans proposition de reprise, la sauvegarde restant intacte.
  await openApp(page, '?action=new');
  await expect(page.locator('#setup-page')).toBeVisible();
  await expect(page.locator('#restore-banner')).toBeHidden();
  expect(await savedScores(page)).toEqual(scores);
  expect(await page.evaluate(() => location.search)).toBe('');

  // ?action=resume sans sauvegarde : message explicite, aucune page de jeu vide.
  await page.evaluate(() => localStorage.removeItem('scoretrack_save'));
  await openApp(page, '?action=resume');
  await expect(page.locator('#setup-page')).toBeVisible();
  await expect(page.locator('#game-screen')).toBeHidden();
  await expect(page.locator('#sys-toast')).toHaveText('Aucune partie à reprendre.');
  expect(errors).toEqual([]);
});

test('mise à jour : bannière, application sur action, partie intacte, caches précédents supprimés', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openApp(page);
  await waitForController(page);
  await startGame(page, { players: 2, start: 10, names: ['Alice', 'Bruno'] });
  await tapAndSync(page, 'card-0', 'plus');
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

  // La bannière réserve sa hauteur : elle ne recouvre aucune carte et n'absorbe aucun tap.
  const card = await bottomCardId(page);
  const reserved = await page.evaluate(() => ({
    open: document.documentElement.classList.contains('sys-banner-open'),
    height: parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--sys-banner-h'),
    ),
  }));
  expect(reserved.open).toBe(true);
  expect(reserved.height).toBeGreaterThan(0);
  const [cardBox, bannerBox] = await Promise.all([
    page.locator(`#${card}`).boundingBox(),
    banner.boundingBox(),
  ]);
  expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(bannerBox.y + 1);
  // La partie reste jouable pendant que la version attend : le tap sur la carte du bas compte.
  await tapAndSync(page, card, 'plus');

  // « Plus tard » masque la bannière ; on la ré-affiche pour appliquer (nouvelle page = nouvelle session).
  await banner.getByRole('button', { name: 'Plus tard' }).click();
  await expect(banner).toBeHidden();
  // La place réservée est rendue à la grille dès que la bannière disparaît.
  await expect
    .poll(() => page.evaluate(() => document.documentElement.classList.contains('sys-banner-open')))
    .toBe(false);
  const grownBox = await page.locator(`#${card}`).boundingBox();
  expect(grownBox.y + grownBox.height).toBeGreaterThan(cardBox.y + cardBox.height);
  const scores = await tapAndSync(page, card, 'plus');
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
  expect(await savedScores(page)).toEqual(scores);
  server.setSwVersion(null);
  expect(errors).toEqual([]);
});

test('deux onglets : celui qui n’a pas appliqué la mise à jour est averti, pas silencieusement masqué', async ({
  context,
}) => {
  const page1 = await context.newPage();
  const page2 = await context.newPage();
  const errors = [...[page1, page2].map(collectErrors)].flat();
  for (const p of [page1, page2]) {
    await p.goto(server.url);
    await expect(p.locator('#splash')).toHaveCount(0);
  }
  await waitForController(page1);
  await waitForController(page2);

  server.setSwVersion('e2e-multi');
  await page1.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
  // Les deux onglets signalent la version en attente.
  await expect(page1.locator('#update-banner')).toContainText('Nouvelle version disponible');
  await expect(page2.locator('#update-banner')).toContainText('Nouvelle version disponible');

  // L'onglet 1 applique : il se recharge sur la nouvelle version.
  await page1.getByRole('button', { name: 'Mettre à jour' }).click();
  await page1.waitForFunction(
    () => performance.getEntriesByType('navigation')[0]?.type === 'reload',
    null,
    { timeout: 15_000 },
  );
  await expect(page1.locator('#splash')).toHaveCount(0);
  await expect.poll(() => cacheNames(page1)).toEqual(['st-e2e-multi']);

  // L'onglet 2 tourne encore sur les anciens modules : il doit le dire, pas masquer la bannière.
  const banner2 = page2.locator('#update-banner');
  await expect(banner2).toBeVisible();
  await expect(banner2).toContainText('Nouvelle version active — rechargez');
  await page2.screenshot({ path: join(SHOTS, 'update-banner-second-tab.png') });
  await page2.getByRole('button', { name: 'Recharger' }).click();
  await page2.waitForFunction(
    () => performance.getEntriesByType('navigation')[0]?.type === 'reload',
    null,
    { timeout: 15_000 },
  );
  await expect(page2.locator('#splash')).toHaveCount(0);
  const version2 = await page2.evaluate(() =>
    import('./js/platform/sw-client.js').then((m) => m.getServiceWorkerVersion()),
  );
  expect(version2).toBe('e2e-multi');
  server.setSwVersion(null);
  expect(errors).toEqual([]);
  await page1.close();
  await page2.close();
});

test('migration depuis st-v1 : prise de main sans attendre, purge des anciens caches, onglet averti', async ({
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
  // La prise de main est automatique (purge garantie) mais la page, restée sur d'anciens modules,
  // est invitée à se recharger plutôt que laissée sans signal.
  await expect(page.locator('#update-banner')).toContainText('Nouvelle version active — rechargez');
  server.setSwVersion(null);
  expect(errors).toEqual([]);
});

test('précache tout-ou-rien : une police manquante annule l’installation et prévient l’utilisateur', async ({
  page,
}) => {
  const errors = collectErrors(page);
  const font = PRECACHE.find((p) => p.endsWith('.woff2')).replace(/^\./, '');
  server.setBlocked([font]);
  try {
    await openApp(page);
    // Aucune installation « à moitié hors ligne » : pas de cache partiel, et l'utilisateur est averti.
    await expect(page.locator('#sys-toast')).toContainText('Installation hors ligne incomplète');
    await page.screenshot({ path: join(SHOTS, 'install-failed-toast.png') });
    await expect.poll(() => cacheNames(page)).toEqual([]);
    expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
    // L'application reste utilisable en ligne malgré l'échec d'installation.
    await startGame(page, { players: 2, start: 0 });
    await tapAndSync(page, 'card-0', 'plus');
  } finally {
    server.setBlocked([]);
  }

  // Réseau rétabli : l'installation se répare d'elle-même au rechargement.
  await page.reload();
  await waitForController(page);
  await expect.poll(() => cacheNames(page)).toEqual([`st-${SW_VERSION}`]);
  expect(errors).toEqual([]);
});

test('mise à jour du seul service worker : version recalculée, cache hors-ligne jamais détruit', async ({
  page,
}) => {
  const errors = collectErrors(page);
  // 1. La version est bien fonction de la logique du SW : sans cela, une correction du SW seule
  //    s'installerait dans le cache que le SW actif dessert encore.
  const logicChanged = swSource.replace(
    '// ── Installation',
    '// correctif de logique\n// ── Installation',
  );
  // (La fraîcheur du bloc généré est garantie par `npm run check:sw` ; ici c'est la propriété qui compte.)
  const files = collectFiles();
  expect(computeVersion(files, logicChanged)).not.toBe(computeVersion(files, swSource));

  // 2. Installation saine, puis preuve que l'application fonctionne hors ligne.
  await openApp(page);
  await waitForController(page);
  await expect.poll(() => cacheNames(page)).toEqual([`st-${SW_VERSION}`]);
  const entriesBefore = await page.evaluate(
    async (name) => (await (await caches.open(name)).keys()).length,
    `st-${SW_VERSION}`,
  );
  expect(entriesBefore).toBe(PRECACHE.length);
  await server.stop();
  await page.reload();
  await expect(page.locator('#setup-page')).toBeVisible();
  await server.start();

  // 3. Déploiement de maintenance : la logique du SW change, la version servie reste la même
  //    (cas le plus défavorable), et une requête réseau échoue pendant le nouveau précache.
  server.setSwPatch((src) =>
    src.replace('// ── Installation', '// correctif de logique\n// ── Installation'),
  );
  const font = PRECACHE.find((p) => p.endsWith('.woff2')).replace(/^\./, '');
  server.setBlocked([font]);
  try {
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
    await expect(page.locator('#sys-toast')).toContainText('incomplète');
    // Le cache installé est intact : l'échec n'a touché que le cache de travail.
    await expect.poll(() => cacheNames(page)).toEqual([`st-${SW_VERSION}`]);
    expect(
      await page.evaluate(
        async (name) => (await (await caches.open(name)).keys()).length,
        `st-${SW_VERSION}`,
      ),
    ).toBe(entriesBefore);
  } finally {
    server.setBlocked([]);
    server.setSwPatch(null);
  }

  // 4. Test décisif : l'utilisateur garde son application hors ligne.
  await server.stop();
  try {
    await page.goto('about:blank');
    await page.goto(server.url);
    await expect(page.locator('#setup-page')).toBeVisible();
    expect(await page.evaluate(() => document.body.innerText)).not.toContain(
      'ScoreTrack est hors ligne',
    );
  } finally {
    await server.start();
  }
  expect(errors).toEqual([]);
});

test('stockage en échec (quota, navigation privée) : la partie continue mais l’utilisateur est averti', async ({
  page,
  context,
}) => {
  const errors = collectErrors(page);
  await context.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key, value) {
      if (String(key).startsWith('scoretrack')) {
        throw new DOMException('quota atteint', 'QuotaExceededError');
      }
      return original.call(this, key, value);
    };
  });
  await openApp(page);
  await startGame(page, { players: 2, start: 0 });
  await tapCard(page, 'card-0', 'plus');

  await expect(page.locator('#sys-toast')).toContainText(
    'Sauvegarde impossible : espace insuffisant. La partie continue en mémoire.',
  );
  await page.screenshot({ path: join(SHOTS, 'storage-quota-toast.png') });
  // Le jeu continue en mémoire, sans exception ni sauvegarde fantôme.
  await expect(page.locator('#sc-0')).not.toHaveText('');
  expect(await page.evaluate(() => localStorage.getItem('scoretrack_save'))).toBeNull();
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
  const first = await tapAndSync(page, 'card-0', 'plus');
  const second = await tapAndSync(page, 'card-0', 'plus');
  expect(second).not.toEqual(first);
  const snap = await storageSnapshot(page);
  expect(JSON.parse(snap['scoretrack_save.prev']).players.map((p) => String(p.score))).toEqual(
    first,
  );
  expect(snap['scoretrack_save.tmp']).toBeUndefined();

  // Écriture interrompue : seul .tmp existe → finalisé au chargement suivant.
  await page.evaluate(() => {
    localStorage.setItem('scoretrack_save.tmp', localStorage.getItem('scoretrack_save'));
    localStorage.removeItem('scoretrack_save');
  });
  await page.reload();
  await expect(page.locator('#restore-banner')).toBeVisible();
  expect(await savedScores(page)).toEqual(second);
  const after = await storageSnapshot(page);
  expect(after['scoretrack_save.tmp']).toBeUndefined();
  expect(errors).toEqual([]);
});

test('export puis import : données identiques, import invalide refusé, aucune clé étrangère persistée', async ({
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
  const scores = await tapAndSync(page, 'card-0', 'plus');

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

  // Liste blanche stricte : une clé inconnue d'un fichier importé n'est jamais persistée.
  const hostile = await page.evaluate(async () => {
    const b = await import('./js/platform/backup.js');
    const res = b.importData(
      JSON.stringify({
        app: 'scoretrack',
        v: 2,
        settings: {
          theme: 'light',
          constructor: { prototype: { pollué: 'oui' } },
          __proto__: { pollué: 'oui' },
          defPlayers: 4,
        },
      }),
    );
    return {
      ok: res.ok,
      stored: JSON.parse(localStorage.getItem('scoretrack_settings')),
      polluted: {}.pollué ?? null,
    };
  });
  expect(hostile.ok).toBe(true);
  expect(hostile.polluted).toBeNull();
  expect(Object.keys(hostile.stored).sort()).toEqual(
    ['defMax', 'defNeg', 'defPlayers', 'defStart', 'theme', 'v'].sort(),
  );
  expect(hostile.stored.theme).toBe('light');

  // Téléchargement : nom de fichier daté.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.evaluate(() => import('./js/platform/backup.js').then((b) => b.downloadExport())),
  ]);
  expect(download.suggestedFilename()).toMatch(/^scoretrack-\d{4}-\d{2}-\d{2}\.json$/);
  expect(scores).not.toEqual(null);
  expect(errors).toEqual([]);
});

test('manifeste valide : champs, icônes any/maskable, captures, raccourcis câblés dans le code', async ({
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
  expect(m.screenshots.filter((s) => s.form_factor === 'wide')).toHaveLength(1);
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
  // Chaque raccourci annoncé correspond à une action réellement implémentée (D14).
  const implemented = await page.evaluate(() =>
    import('./js/platform/shortcuts.js').then((s) => s.ACTIONS),
  );
  const declared = m.shortcuts.map((s) => new URL(s.url, 'https://x/').searchParams.get('action'));
  expect(declared.every((a) => implemented.includes(a))).toBe(true);
  expect(declared.sort()).toEqual([...implemented].sort());

  const linked = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(linked).toBe('manifest-st.json');
  expect(errors).toEqual([]);
});

test('service worker : requêtes Range servies en 206, aucune lecture d’un cache étranger', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openApp(page);
  await waitForController(page);
  const font = PRECACHE.find((p) => p.endsWith('.woff2')).replace(/^\.\//, '');

  // Requête Range sur un actif précaché : réponse partielle conforme, pas le fichier entier.
  const range = await page.evaluate(async (url) => {
    const r = await fetch(url, { headers: { Range: 'bytes=0-99' } });
    const body = await r.arrayBuffer();
    return {
      status: r.status,
      contentRange: r.headers.get('Content-Range'),
      bytes: body.byteLength,
    };
  }, font);
  expect(range.status).toBe(206);
  expect(range.bytes).toBe(100);
  expect(range.contentRange).toMatch(/^bytes 0-99\/\d+$/);

  // Un cache étranger contenant les mêmes URL ne doit jamais être servi.
  const served = await page.evaluate(async () => {
    const foreign = await caches.open('zz-etranger');
    await foreign.put(
      './css/system.css',
      new Response('.sys-PIRATE{}', { headers: { 'Content-Type': 'text/css' } }),
    );
    await foreign.put(
      './index.html',
      new Response('<html><body>PIRATE</body></html>', {
        headers: { 'Content-Type': 'text/html' },
      }),
    );
    const css = await (await fetch('css/system.css')).text();
    const html = await (await fetch('index.html')).text();
    await caches.delete('zz-etranger');
    return { css: css.includes('PIRATE'), html: html.includes('PIRATE') };
  });
  expect(served).toEqual({ css: false, html: false });
  // Invariant de code : plus aucune recherche globale dans tous les caches.
  expect(swSource).not.toMatch(/[^.]\bcaches\.match\(/);
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
    r.ceiling = h.haptic('ceiling');
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
  // Les deux butées sont distinctes au toucher (3.5) : deux coups en bas, trois coups brefs en haut.
  expect(out.calls).toEqual([10, [30, 20, 30], [20, 30, 20, 30, 20], [50, 30, 80]]);
  expect(out.disabled).toBe(false);
  expect(out.enabledFlag).toBe(false);
  expect(out.reenabled).toBe(true);
  expect(out.total).toBe(5);

  // Un vrai tap sur une carte déclenche bien un retour haptique (3.5), une seule fois.
  await page.evaluate(() => {
    window.__vibrations.length = 0;
  });
  await startGame(page, { players: 2, start: 0 });
  await tapCard(page, 'card-0', 'plus');
  await expect.poll(() => page.evaluate(() => window.__vibrations.length)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__vibrations[0])).toBe(10);

  // Menu contextuel : bloqué sur la page, autorisé dans un champ de saisie (coller un prénom).
  await openApp(page);
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
  const scores = await tapAndSync(page, 'card-0', 'plus');
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
    return { journal, text };
  });
  expect(diag.journal).toHaveLength(1);
  expect(diag.journal[0].message).toContain('Erreur de test');
  expect(diag.text).toContain('Service worker :');
  expect(diag.text).toContain('Erreur de test (volontaire)');
  expect(diag.text).toContain('Stockage :');
  expect(await savedScores(page)).toEqual(scores);
  expect(pageErrors).toEqual(['Erreur de test (volontaire)']);
  expect(consoleErrors).toEqual([]);
});
