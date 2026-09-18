// Mouvement (élément A) : animation du chiffre, bulle de delta liée au groupe d'annulation,
// respect de `prefers-reduced-motion`, réactivité au `pointerdown` et fluidité (p95 des trames).
import { expect, test } from '@playwright/test';
import { collectErrors, openApp as openBase } from './helpers.js';

/** Ouvre l'application sans service worker (sa bannière fausserait les mesures de mouvement). */
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

async function startGame(page, { players, start = 40 } = {}) {
  await page
    .locator('#players-grid .player-chip', { hasText: new RegExp(`^\\s*${players}\\s*$`) })
    .click();
  await page.locator(`#start-presets .points-chip[data-val="${start}"]`).click();
  await page.locator('#go-btn').click();
  await expect(page.locator('.pcard')).toHaveCount(players);
  await page.waitForTimeout(150);
}

/** Animations en cours sur le score d'un joueur (durée et courbe). */
const scoreAnimations = (page, id) =>
  page.evaluate(
    (sel) =>
      document
        .querySelector(sel)
        .getAnimations()
        .map((a) => ({
          duration: a.effect.getTiming().duration,
          easing: a.effect.getTiming().easing,
        })),
    id,
  );

test('le chiffre s’anime à chaque changement (150–350 ms, courbe non linéaire)', async ({
  page,
}, testInfo) => {
  const errors = collectErrors(page);
  await openApp(page);
  await startGame(page, { players: 4 });
  await page.locator('#card-0 .tap-half.minus').tap();
  const anims = await scoreAnimations(page, '#sc-0');
  testInfo.annotations.push({ type: 'animation-score', description: JSON.stringify(anims) });
  expect(anims.length, 'aucune animation sur le score').toBeGreaterThan(0);
  for (const a of anims) {
    expect(a.duration).toBeGreaterThanOrEqual(150);
    expect(a.duration).toBeLessThanOrEqual(350);
    expect(a.easing, 'courbe linéaire').not.toBe('linear');
  }
  expect(errors).toEqual([]);
});

test('mouvement réduit : aucune animation non triviale, aucune boucle infinie', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openApp(page);
  await startGame(page, { players: 4, start: 0 });
  await page.locator('#card-0 .tap-half.plus').tap();
  await expect(page.locator('#sc-0')).toHaveText('1');
  await page.waitForTimeout(120);
  const running = await page.evaluate(() =>
    document
      .getAnimations()
      .map((a) => ({
        name: a.animationName || 'waapi',
        duration: a.effect ? a.effect.getTiming().duration : 0,
        iterations: a.effect ? a.effect.getTiming().iterations : 1,
        state: a.playState,
      }))
      .filter((a) => a.state === 'running' && (a.duration > 1 || a.iterations === Infinity)),
  );
  expect(running, 'animations résiduelles sous mouvement réduit').toEqual([]);
  // Le score critique ne clignote pas (la pose de la classe par l'interface est couverte par
  // game.spec.js ; ici on éprouve la RÈGLE CSS, qui est la seule à pouvoir animer en boucle).
  await page.evaluate(() => document.getElementById('sc-0').classList.add('crit'));
  await page.waitForTimeout(80);
  const blink = await page.evaluate(
    () =>
      document
        .getElementById('sc-0')
        .getAnimations()
        .filter((a) => a.playState === 'running').length,
  );
  expect(blink).toBe(0);
  expect(errors).toEqual([]);
});

test('bulle de delta : visible pendant toute la durée du groupe puis disparue', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openApp(page);
  await startGame(page, { players: 4, start: 40 });
  const opacity = () =>
    page.evaluate(() => {
      const n = document.getElementById('df-0');
      return n.hidden ? 0 : parseFloat(getComputedStyle(n).opacity);
    });
  await page.locator('#card-0 .tap-half.minus').tap();
  await page.locator('#card-0 .tap-half.minus').tap();
  await page.locator('#card-0 .tap-half.minus').tap();
  await expect(page.locator('#df-0')).toHaveText('-3');
  await page.waitForTimeout(300);
  expect(await opacity(), 'à 0,3 s').toBeGreaterThan(0.9);
  await page.waitForTimeout(900);
  expect(await opacity(), 'à 1,2 s').toBeGreaterThan(0.9);
  await page.waitForTimeout(600);
  expect(await opacity(), 'à 1,8 s').toBe(0);
  // Le signe porte l'information autant que la couleur (D1)
  expect(errors).toEqual([]);
});

test('retour visuel : la moitié touchée change d’état en moins de 100 ms', async ({
  page,
}, testInfo) => {
  const errors = collectErrors(page);
  await openApp(page);
  await startGame(page, { players: 4, start: 40 });
  const delays = await page.evaluate(async () => {
    const half = document.querySelector('#card-0 .tap-half.plus');
    const out = [];
    for (let i = 0; i < 20; i++) {
      const start = performance.now();
      let mark = null;
      const obs = new MutationObserver(() => {
        if (mark === null) mark = performance.now();
      });
      obs.observe(half, { attributes: true, attributeFilter: ['class'] });
      const box = half.getBoundingClientRect();
      const opts = {
        pointerId: 1,
        bubbles: true,
        cancelable: true,
        clientX: box.x + box.width / 2,
        clientY: box.y + box.height / 2,
        pointerType: 'touch',
        isPrimary: true,
      };
      half.dispatchEvent(new PointerEvent('pointerdown', opts));
      obs.disconnect();
      out.push((mark === null ? performance.now() : mark) - start);
      half.dispatchEvent(new PointerEvent('pointerup', opts));
      await new Promise((r) => requestAnimationFrame(r));
    }
    return out;
  });
  delays.sort((a, b) => a - b);
  const p95 = delays[Math.floor(delays.length * 0.95) - 1];
  testInfo.annotations.push({
    type: 'pointerdown-retour',
    description: `p95 = ${p95.toFixed(2)} ms · max = ${delays[delays.length - 1].toFixed(2)} ms`,
  });
  expect(p95).toBeLessThan(100);
  expect(errors).toEqual([]);
});

/**
 * Mesure les deltas de trame, au repos puis pendant 20 taps.
 * En mode « headless » le compositeur n'est pas cadencé sur un écran : la valeur absolue n'a pas
 * de sens, seule la COMPARAISON au repos en a une. Les deux séries sont consignées brutes.
 */
async function frameStats(page, players, withTaps) {
  return page.evaluate(
    async ([n, taps]) => {
      const halves = [...document.querySelectorAll('.tap-half.plus')];
      const deltas = [];
      let last = performance.now();
      let stop = false;
      const loop = (now) => {
        deltas.push(now - last);
        last = now;
        if (!stop) requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
      for (let i = 0; i < 20; i++) {
        if (taps) {
          const half = halves[i % halves.length];
          const box = half.getBoundingClientRect();
          const opts = {
            pointerId: 1,
            bubbles: true,
            cancelable: true,
            clientX: box.x + box.width / 2,
            clientY: box.y + box.height / 2,
            pointerType: 'touch',
            isPrimary: true,
          };
          half.dispatchEvent(new PointerEvent('pointerdown', opts));
          half.dispatchEvent(new PointerEvent('pointerup', opts));
        }
        await new Promise((r) => setTimeout(r, 40));
      }
      stop = true;
      await new Promise((r) => setTimeout(r, 60));
      const sorted = deltas.slice(2).sort((a, b) => a - b);
      const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
      return {
        n,
        frames: sorted.length,
        p50: at(0.5),
        p95: at(0.95),
        p99: at(0.99),
        max: sorted[sorted.length - 1],
      };
    },
    [players, withTaps],
  );
}

test('fluidité : les taps n’ajoutent pas de trame perdue, à 4 et à 12 joueurs', async ({
  page,
}, testInfo) => {
  const errors = collectErrors(page);
  for (const players of [4, 12]) {
    await openApp(page);
    await startGame(page, { players, start: 100 });
    const idle = await frameStats(page, players, false);
    const taps = await frameStats(page, players, true);
    testInfo.annotations.push({
      type: `trames-${players}j`,
      description:
        `repos : p50 ${idle.p50.toFixed(2)} · p95 ${idle.p95.toFixed(2)} · p99 ${idle.p99.toFixed(2)} · max ${idle.max.toFixed(2)} ms (${idle.frames} trames) — ` +
        `20 taps : p50 ${taps.p50.toFixed(2)} · p95 ${taps.p95.toFixed(2)} · p99 ${taps.p99.toFixed(2)} · max ${taps.max.toFixed(2)} ms (${taps.frames} trames)`,
    });
    expect(idle.frames, 'trames mesurées au repos').toBeGreaterThan(10);
    expect(taps.frames, 'trames mesurées pendant les taps').toBeGreaterThan(10);
    // Le compositeur d'un navigateur sans écran n'est pas cadencé comme un appareil réel : seule la
    // comparaison au repos a un sens. Deux assertions, toutes deux actives par défaut (D17) :
    //   - la MÉDIANE ne doit pas bouger : aucun surcoût systématique dû aux animations ;
    //   - le 95e centile tolère au plus UNE trame sautée (2 × la période au repos), jamais deux.
    expect(taps.p50, `médiane à ${players} joueurs (repos ${idle.p50.toFixed(1)} ms)`).toBeLessThan(
      idle.p50 + 2,
    );
    expect(taps.p95, `p95 à ${players} joueurs (repos ${idle.p95.toFixed(1)} ms)`).toBeLessThan(
      idle.p95 * 2 + 2,
    );
  }
  expect(errors).toEqual([]);
});

test('célébration : confettis présents, absents sous mouvement réduit', async ({ page }) => {
  const errors = collectErrors(page);
  await openApp(page);
  await startGame(page, { players: 2, start: 0 });
  // Victoire par objectif : plafond 10 atteint au pavé
  await page.evaluate(async () => {
    const g = await import('./js/ui/game.js');
    const { store } = await import('./js/store.js');
    store.config.maxPoints = 10;
    g.applyManualDelta(0, 10);
  });
  await expect(page.locator('#winner-modal')).toBeVisible();
  await expect(page.locator('#confetti-canvas')).toHaveCount(1);
  await page.waitForTimeout(1800);
  await expect(page.locator('#confetti-canvas')).toHaveCount(0);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openApp(page);
  await startGame(page, { players: 2, start: 0 });
  await page.evaluate(async () => {
    const g = await import('./js/ui/game.js');
    const { store } = await import('./js/store.js');
    store.config.maxPoints = 10;
    g.applyManualDelta(0, 10);
  });
  await expect(page.locator('#winner-modal')).toBeVisible();
  await expect(page.locator('#confetti-canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('le premier rendu de l’écran de jeu pose performance.mark', async ({ page }) => {
  await openApp(page);
  await startGame(page, { players: 4 });
  const marks = await page.evaluate(() =>
    performance.getEntriesByType('mark').map((m) => ({ name: m.name, t: Math.round(m.startTime) })),
  );
  const ready = marks.find((m) => m.name === 'scoretrack:game-ready');
  expect(ready, 'marque scoretrack:game-ready absente').toBeTruthy();
  expect(ready.t).toBeLessThan(5000);
});
