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

test('bulle de delta : pleine visibilité pendant tout le groupe, à la 1re COMME à la 10e action', async ({
  page,
}, testInfo) => {
  const errors = collectErrors(page);
  await openApp(page);
  await startGame(page, { players: 4, start: 100 });
  const opacity = () =>
    page.evaluate(() => {
      const n = document.getElementById('df-0');
      return n.hidden ? 0 : parseFloat(getComputedStyle(n).opacity);
    });
  const trace = [];

  // Dix ACTIONS successives sur le même joueur, séparées par plus que la durée d'un groupe : la
  // deuxième et les suivantes empruntent le chemin où une animation de fondu remplissante figeait
  // la bulle à l'opacité 0 pour le reste de la partie.
  for (const action of [1, 2, 10]) {
    for (let k = 0; k < (action === 10 ? 8 : 1); k++) {
      if (k > 0) await page.waitForTimeout(1700);
      await page.locator('#card-0 .tap-half.minus').tap();
    }
    const start = Date.now();
    await expect(page.locator('#df-0')).toHaveText('-1');
    // Trois relevés chronométrés depuis le DERNIER tap : à 0,3 s, à 1,2 s et à 1,8 s.
    const at = async (ms) => {
      const wait = ms - (Date.now() - start);
      if (wait > 0) await page.waitForTimeout(wait);
      return opacity();
    };
    const o300 = await at(300);
    const o1200 = await at(1200);
    const o1800 = await at(1800);
    trace.push(`action ${action} : 0,3 s → ${o300} · 1,2 s → ${o1200} · 1,8 s → ${o1800}`);
    expect(o300, `action ${action} à 0,3 s`).toBeGreaterThan(0.9);
    expect(o1200, `action ${action} à 1,2 s`).toBeGreaterThan(0.9);
    expect(o1800, `action ${action} à 1,8 s`).toBe(0);
  }
  testInfo.annotations.push({ type: 'bulle-de-delta', description: trace.join(' | ') });
  expect(errors).toEqual([]);
});
test('bulle de delta : la minuterie de l’ancienne partie ne ferme pas le groupe de la nouvelle', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openApp(page);
  await startGame(page, { players: 2, start: 100 });
  // Un tap ouvre un groupe (minuterie de 1,5 s), puis reset immédiat et nouvelle partie : le
  // premier tap de la nouvelle partie survient bien avant l'échéance de l'ancienne minuterie.
  await page.locator('#card-0 .tap-half.plus').tap();
  await expect(page.locator('#df-0')).toHaveText('+1');
  await page.getByRole('button', { name: /Reset/ }).click();
  await page.getByRole('button', { name: 'Confirmer' }).click();
  await expect(page.locator('#setup-page')).toBeVisible();
  await startGame(page, { players: 2, start: 100 });
  const start = Date.now();
  await page.locator('#card-0 .tap-half.plus').tap();
  await expect(page.locator('#df-0')).toHaveText('+1');
  const opacity = () =>
    page.evaluate(() => {
      const n = document.getElementById('df-0');
      return n.hidden ? 0 : parseFloat(getComputedStyle(n).opacity);
    });
  const at = async (ms) => {
    const wait = ms - (Date.now() - start);
    if (wait > 0) await page.waitForTimeout(wait);
    return opacity();
  };
  // Défaut d'origine : la bulle disparaissait à 0,9 s (échéance de la partie précédente).
  expect(await at(1100), 'bulle à 1,1 s après le tap de la nouvelle partie').toBeGreaterThan(0.9);
  expect(await at(1400), 'bulle à 1,4 s').toBeGreaterThan(0.9);
  expect(await at(1900), 'bulle à 1,9 s').toBe(0);
  // Et le groupe n'a pas été fermé prématurément : un second tap à 1,2 s du premier aurait été
  // regroupé ; ici on vérifie simplement que le journal n'a qu'une entrée et qu'elle est intacte.
  const entries = await page.evaluate(async () => {
    const { store } = await import('./js/store.js');
    return store.game.log.entries.length;
  });
  expect(entries).toBe(1);
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
