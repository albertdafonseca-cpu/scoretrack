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
async function frameDeltas(page, cdp, selector, count, blockMs = 0) {
  const point = await centerOf(page, selector);
  // Coût artificiel injecté pour ÉTALONNER l'instrument (voir le test de sensibilité) : une boucle
  // bloquante sur le fil principal à chaque appui, exactement ce qu'une régression produirait.
  if (blockMs > 0) {
    await page.evaluate((ms) => {
      window.__block = (e) => {
        if (!e.isTrusted) return;
        const end = performance.now() + ms;
        while (performance.now() < end);
      };
      document.addEventListener('pointerdown', window.__block, true);
    }, blockMs);
  }
  // Chauffe : 8 taps jetés avant toute mesure. Ils paient la compilation à la volée des
  // gestionnaires, la première composition des couches et le premier accès au stockage. Les
  // compter reviendrait à mesurer le démarrage, pas la fluidité en régime établi.
  for (let i = 0; i < 8; i++) {
    await realTap(cdp, point);
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    window.__d = [];
    window.__stop = false;
    window.__t0 = performance.now();
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
  const result = await page.evaluate(() => {
    window.__stop = true;
    const dur = performance.now() - window.__t0;
    // Les deux premières trames couvrent l'amorçage de la boucle : elles ne mesurent rien.
    const d = window.__d.slice(2).sort((a, b) => a - b);
    const at = (q) => d[Math.min(d.length - 1, Math.floor(d.length * q))];
    return {
      dur,
      frames: d.length,
      p50: at(0.5),
      p95: at(0.95),
      p99: at(0.99),
      max: d[d.length - 1],
      lost: d.filter((x) => x > 1000 / 60 + 4).length,
    };
  });
  if (blockMs > 0) {
    await page.evaluate(() => document.removeEventListener('pointerdown', window.__block, true));
  }
  return result;
}

/** Les cartes coûtent-elles plus que le témoin ? Une seule définition, utilisée par tous les tests. */
function regressions(taps, control) {
  const out = [];
  const add = (nom, valeur, plafond) => {
    if (!(valeur <= plafond)) out.push(`${nom} ${valeur.toFixed(2)} > ${plafond.toFixed(2)}`);
  };
  // Tous les seuils sont RELATIFS au témoin mesuré dans la même exécution : une machine hôte
  // chargée ralentit les deux séries et ne peut donc pas faire virer le test au rouge à tort,
  // tandis qu'un coût propre à l'application creuse l'écart et le fait virer.
  add('p50', taps.p50, control.p50 + 1);
  add('p95', taps.p95, control.p95 + FRAME_MS / 2);
  add('p99', taps.p99, control.p99 + FRAME_MS);
  add('taux de trames perdues', taps.lost / taps.frames, control.lost / control.frames + 0.03);
  // DURÉE de la série. C'est le critère SENSIBLE, et il comble l'angle mort des centiles : un
  // travail bloquant de l'ordre d'une trame retarde chaque tap sans jamais allonger un intervalle
  // de trame au-delà du seuil de « trame perdue ». Les deux séries envoient le même nombre de taps
  // à la même cadence : à coût nul, elles durent le même temps (mesuré : 2 499 ms contre 2 503 ms
  // à douze joueurs). Plancher de sensibilité ÉTALONNÉ par le test ci-dessous : 16 ms de calcul
  // bloquant par tap sont détectés (durée +20 %), 8 ms restent sous le bruit (+0,8 %).
  add('durée de la série', taps.dur / control.dur, 1.12);
  return out;
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
        `cartes : p50 ${taps.p50.toFixed(1)} · p95 ${taps.p95.toFixed(1)} · p99 ${taps.p99.toFixed(1)} · max ${taps.max.toFixed(1)} ms, ${taps.lost}/${taps.frames} trames perdues — ` +
        `durée ${Math.round(taps.dur)} ms contre ${Math.round(control.dur)} ms pour le témoin`,
    });
    expect(
      taps.frames,
      'trames mesurées (échantillon suffisant pour un 95e centile)',
    ).toBeGreaterThan(60);
    expect(control.frames, 'trames du témoin').toBeGreaterThan(60);
    // Le PIRE cas n'est volontairement pas asserté : sur ~180 trames mesurées dans une machine
    // partagée, une seule interruption de l'ordonnanceur hôte le fait bondir sans rien dire de
    // l'application. Il reste consigné en annotation à chaque exécution — jamais masqué.
    expect(regressions(taps, control).join(' · '), 'écart aux trames du témoin').toBe('');
    expect(errors).toEqual([]);
  });
}

/**
 * ÉTALONNAGE de l'instrument : sans lui, un test de fluidité qui passe ne prouve rien, puisqu'on
 * ignore ce qu'il est capable de voir. On injecte un coût bloquant CONNU sur le fil principal à
 * chaque appui — exactement la forme d'une régression — et on exige que la mesure le voie.
 * Le plancher mesuré est consigné à chaque exécution : c'est lui, et non une promesse de 60 fps,
 * que le test de fluidité garantit.
 */
test('sensibilité de la mesure : 16 ms de calcul bloquant par tap sont détectés', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await openApp(page);
  await startGame(page, { players: 12, start: 100 });
  const cdp = await page.context().newCDPSession(page);
  const control = await frameDeltas(page, cdp, '.game-header', 30);
  const sain = await frameDeltas(page, cdp, '#card-0 .tap-half.plus', 30);
  const bloque = await frameDeltas(page, cdp, '#card-0 .tap-half.plus', 30, 16);
  await cdp.detach();
  testInfo.annotations.push({
    type: 'plancher-de-sensibilite',
    description:
      `témoin ${Math.round(control.dur)} ms · cartes saines ${Math.round(sain.dur)} ms ` +
      `(rapport ${(sain.dur / control.dur).toFixed(3)}) · cartes + 16 ms de blocage ` +
      `${Math.round(bloque.dur)} ms (rapport ${(bloque.dur / control.dur).toFixed(3)})`,
  });
  // Le code sain passe...
  expect(regressions(sain, control).join(' · '), 'le code sain doit passer').toBe('');
  // ...et le même instrument REFUSE le code alourdi. Si cette ligne échoue, le test de fluidité
  // ci-dessus ne prouve plus rien, et c'est ici qu'on l'apprend.
  expect(
    regressions(bloque, control).join(' · '),
    '16 ms de blocage par tap doivent être détectés',
  ).not.toBe('');
});
