// Mesures de réactivité et de fluidité de l'écran de jeu — projet Playwright ISOLÉ.
//
// Pourquoi un projet à part : une mesure de trames perturbée par un autre test qui s'exécute en
// parallèle n'est pas une mesure. Ce fichier tourne seul (`workers: 1`, projet `perf`), et tous les
// gestes sont de VRAIS événements d'entrée envoyés par le protocole du navigateur
// (`Input.dispatchTouchEvent`) : ils traversent le pipeline d'entrée, le test de survol et le
// compositeur, contrairement à un `dispatchEvent` émis depuis la page qui court-circuite tout.
import { expect, test } from '@playwright/test';
import { collectErrors, openApp as openBase } from '../e2e/helpers.js';

/** Période nominale d'une trame à 60 Hz. */
const FRAME_MS = 1000 / 60;

async function openApp(page) {
  await page.addInitScript(() => {
    if (navigator.serviceWorker) navigator.serviceWorker.register = () => new Promise(() => {});
  });
  await openBase(page);
  await page.evaluate(async () => {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  });
}

async function startGame(page, { players, start = 0 } = {}) {
  await page
    .locator('#players-grid .player-chip', { hasText: new RegExp(`^\\s*${players}\\s*$`) })
    .click();
  await page.locator(`#start-presets .points-chip[data-val="${start}"]`).click();
  await page.locator('#go-btn').click();
  await expect(page.locator('.pcard')).toHaveCount(players);
  await page.waitForTimeout(200);
}

/** Centre d'un élément, en coordonnées de la fenêtre. */
async function centerOf(page, selector) {
  const box = await page.locator(selector).boundingBox();
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}

/** Tap tactile RÉEL (protocole navigateur), avec un temps de contact court. */
async function realTap(cdp, point) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test.describe.configure({ mode: 'serial' });

// Mesure de référence (scratchpad/A/m4-frames.mjs) : à 12 joueurs, 20 taps réels donnent 0 trame
// perdue sur 100 AVEC la sauvegarde active, et 1 sur 98 avec l'écriture localStorage neutralisée.
// La sauvegarde n'est donc pas un coût de rendu ; les trames perdues observées viennent de la
// machine hôte, d'où le TÉMOIN mesuré dans la même exécution.

test('réactivité : du pointerdown matériel à la trame peinte, p95 < 100 ms', async ({
  page,
}, testInfo) => {
  const errors = collectErrors(page);
  await openApp(page);
  await startGame(page, { players: 4, start: 100 });
  const cdp = await page.context().newCDPSession(page);

  // La page horodate chaque `pointerdown` DE CONFIANCE (timestamp matériel, même horloge que
  // performance.now()) et relève l'instant de la trame suivante, celle qui peint l'état pressé.
  await page.evaluate(() => {
    window.__lat = [];
    document.getElementById('players-wrap').addEventListener(
      'pointerdown',
      (e) => {
        if (!e.isTrusted) return;
        const hardware = e.timeStamp;
        requestAnimationFrame(() => window.__lat.push(performance.now() - hardware));
      },
      true,
    );
  });

  const point = await centerOf(page, '#card-0 .tap-half.plus');
  for (let i = 0; i < 20; i++) {
    await realTap(cdp, point);
    await page.waitForTimeout(60);
  }
  const lat = await page.evaluate(() => window.__lat.slice());
  await cdp.detach();
  expect(lat.length, 'aucun pointerdown de confiance mesuré').toBeGreaterThanOrEqual(18);
  lat.sort((a, b) => a - b);
  const p95 = lat[Math.min(lat.length - 1, Math.ceil(lat.length * 0.95) - 1)];
  testInfo.annotations.push({
    type: 'latence-pointerdown',
    description: `médiane ${lat[Math.floor(lat.length / 2)].toFixed(1)} ms · p95 ${p95.toFixed(1)} ms · max ${lat[lat.length - 1].toFixed(1)} ms sur ${lat.length} appuis`,
  });
  expect(p95, 'p95 du retour visuel').toBeLessThan(100);
  expect(errors).toEqual([]);
});

/**
 * Compte les deltas de trame pendant `count` taps réels sur `selector`.
 * `selector` peut désigner une zone SANS gestionnaire (en-tête) : c'est le témoin qui sépare le
 * coût de l'application du bruit de l'environnement.
 */
async function frameDeltas(page, cdp, selector, count) {
  const point = await centerOf(page, selector);
  await page.evaluate(() => {
    window.__d = [];
    window.__stop = false;
    let last = performance.now();
    const loop = (now) => {
      window.__d.push(now - last);
      last = now;
      if (!window.__stop) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  for (let i = 0; i < count; i++) {
    await realTap(cdp, point);
    await page.waitForTimeout(50);
  }
  return page.evaluate(() => {
    window.__stop = true;
    // Les deux premières trames couvrent l'amorçage de la boucle : elles ne mesurent rien.
    const d = window.__d.slice(2).sort((a, b) => a - b);
    const at = (q) => d[Math.min(d.length - 1, Math.floor(d.length * q))];
    return {
      frames: d.length,
      p50: at(0.5),
      p95: at(0.95),
      p99: at(0.99),
      max: d[d.length - 1],
      lost: d.filter((x) => x > 1000 / 60 + 4).length,
    };
  });
}

for (const players of [4, 12]) {
  test(`fluidité : 30 taps réels à ${players} joueurs ne coûtent aucune trame de plus que le témoin`, async ({
    page,
  }, testInfo) => {
    const errors = collectErrors(page);
    await openApp(page);
    await startGame(page, { players, start: 100 });
    const cdp = await page.context().newCDPSession(page);
    // Témoin : mêmes taps, même cadence, sur l'en-tête qui ne porte aucun gestionnaire.
    // 30 taps : un échantillon de ~90 trames rend le 95e centile signifiant. Sur 30 trames, une
    // seule trame sautée par l'ordonnanceur de la machine hôte suffisait à le faire basculer.
    const control = await frameDeltas(page, cdp, '.game-header', 30);
    const taps = await frameDeltas(page, cdp, '#card-0 .tap-half.plus', 30);
    await cdp.detach();
    testInfo.annotations.push({
      type: `trames-${players}j`,
      description:
        `témoin (en-tête) : p50 ${control.p50.toFixed(1)} · p95 ${control.p95.toFixed(1)} · p99 ${control.p99.toFixed(1)} · max ${control.max.toFixed(1)} ms, ${control.lost}/${control.frames} trames perdues — ` +
        `cartes : p50 ${taps.p50.toFixed(1)} · p95 ${taps.p95.toFixed(1)} · p99 ${taps.p99.toFixed(1)} · max ${taps.max.toFixed(1)} ms, ${taps.lost}/${taps.frames} trames perdues`,
    });
    expect(
      taps.frames,
      'trames mesurées (échantillon suffisant pour un 95e centile)',
    ).toBeGreaterThan(60);
    expect(control.frames, 'trames du témoin').toBeGreaterThan(60);
    // Assertions ABSOLUES, sans tolérance construite : la cadence médiane doit rester celle de
    // l'écran, le 95e centile ne doit pas dépasser une trame et demie, le 99e pas trois trames.
    // Le PIRE cas n'est volontairement pas asserté : sur ~180 trames mesurées dans une machine
    // partagée, une seule interruption de l'ordonnanceur hôte le fait bondir sans rien dire de
    // l'application (mesuré : p99 16,8 ms et max 66,7 ms dans la même série). Il reste consigné
    // en annotation à chaque exécution — jamais masqué. Deux trames longues, elles, échouent.
    expect(taps.p50, 'cadence médiane').toBeLessThanOrEqual(FRAME_MS + 1);
    expect(taps.p95, '95e centile').toBeLessThanOrEqual(FRAME_MS * 1.5);
    expect(taps.p99, '99e centile').toBeLessThanOrEqual(FRAME_MS * 3);
    // Taux de trames livrées à l'heure : au moins 95 % pendant 30 taps réels. Une régression qui
    // coûterait une trame par tap donnerait 30 trames perdues sur ~90, soit 33 %.
    const rate = taps.lost / taps.frames;
    expect(
      rate,
      `taux de trames perdues (témoin : ${control.lost}/${control.frames})`,
    ).toBeLessThanOrEqual(0.05);
    // Le témoin atteste que la machine hôte était saine pendant la mesure : s'il décroche lui aussi,
    // la mesure ne vaut rien et le test le dit au lieu de se taire.
    expect(
      control.lost / control.frames,
      'témoin : la machine hôte a décroché',
    ).toBeLessThanOrEqual(0.05);
    expect(errors).toEqual([]);
  });
}
