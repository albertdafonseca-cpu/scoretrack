// Écran de jeu (élément A) : identité du DOM, gestes aux frontières, appui long, pavé au clavier,
// victoire par plafond, annulation/rétablissement, retour à un point, copie du résultat, 12 joueurs.
import { expect, test } from '@playwright/test';
import { collectErrors, openApp as openBase } from './helpers.js';

/**
 * Ouvre l'application sans service worker : la bannière « nouvelle version » de l'élément E
 * recouvre sinon la barre d'actions et rend ces tests instables. Le cycle de vie du SW est
 * couvert par tests/e2e/pwa.spec.js.
 */
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

/** Prénom de 18 caractères (longueur maximale imposée). */
const LONG = 'Wxxxxxxxxxxxxxxxxx';

/** Sélectionne une valeur de points : puce du préréglage si elle existe, sinon champ libre. */
async function setPoints(page, group, input, value) {
  const chip = page.locator(`#${group} .points-chip[data-val="${value}"]`);
  if (await chip.count()) await chip.click();
  else await page.locator(`#${input}`).fill(String(value));
}

/** Lance une partie : n joueurs, points de départ, plafond éventuel, prénoms optionnels. */
async function startGame(page, { players, start = 0, max = 0, names = [] } = {}) {
  await page
    .locator('#players-grid .player-chip', { hasText: new RegExp(`^\\s*${players}\\s*$`) })
    .click();
  await setPoints(page, 'start-presets', 'points-custom', start);
  if (max) await setPoints(page, 'max-presets', 'max-custom', max);
  await page.locator('#names-btn').click();
  const inputs = page.locator('.name-input');
  await expect(inputs).toHaveCount(players);
  for (let i = 0; i < names.length; i++) await inputs.nth(i).fill(names[i]);
  await page.locator('[data-action="start-game"]').first().click();
  await expect(page.locator('.pcard')).toHaveCount(players);
  await page.waitForTimeout(150);
}

/** Centre géométrique d'un sélecteur. */
async function center(page, selector) {
  const b = await page.locator(selector).boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** Appui long réel (touchStart… touchEnd) via CDP. */
async function hold(page, selector, ms) {
  const point = await center(page, selector);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await page.waitForTimeout(ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

test('le DOM des cartes survit aux taps, à l’annulation, au rétablissement et à la rotation', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openApp(page);
  await startGame(page, { players: 4, start: 10, names: ['Alice', 'Bruno', 'Chloé', 'David'] });

  const handle = await page.evaluateHandle(() => document.getElementById('card-0'));
  const same = () =>
    page.evaluate((node) => node.isSameNode(document.getElementById('card-0')), handle);
  // Compteur de nœuds ajoutés/retirés directement sous la grille
  await page.evaluate(() => {
    window.__grid = 0;
    new MutationObserver((records) => {
      for (const r of records) window.__grid += r.addedNodes.length + r.removedNodes.length;
    }).observe(document.getElementById('players-wrap'), { childList: true });
  });

  await page.locator('#card-0 .tap-half.plus').tap();
  await expect(page.locator('#sc-0')).toHaveText('11');
  expect(await same(), 'tap').toBe(true);

  await page.locator('#undo-btn').tap();
  await expect(page.locator('#sc-0')).toHaveText('10');
  expect(await same(), 'annulation').toBe(true);

  await page.locator('#redo-btn').tap();
  await expect(page.locator('#sc-0')).toHaveText('11');
  expect(await same(), 'rétablissement').toBe(true);

  await page.getByRole('button', { name: /Rotation/ }).click();
  await expect(page.locator('#card-3')).toHaveCSS('grid-row-start', '2');
  expect(await same(), 'rotation').toBe(true);

  expect(await page.evaluate(() => window.__grid), 'nœuds ajoutés/retirés dans la grille').toBe(0);
  expect(errors).toEqual([]);
});

test('taps à ±4 px de la frontière : le bon côté répond sur les 4 rotations', async ({ page }) => {
  const errors = collectErrors(page);
  await openApp(page);
  // 8 joueurs : la disposition contient les quatre orientations (rot-0, rot-180, rot-l, rot-r)
  await startGame(page, { players: 8, start: 50 });
  const rots = await page.evaluate(() =>
    [...document.querySelectorAll('.pcard')].map((c) => [c.id, c.dataset.rot]),
  );
  const seen = new Set(rots.map((r) => r[1]));
  expect([...seen].sort()).toEqual(['rot-0', 'rot-180', 'rot-l', 'rot-r']);

  for (const [id, rot] of rots) {
    const pi = Number(id.split('-')[1]);
    const box = await page.locator(`#${id}`).boundingBox();
    // Frontière = médiane de la carte, dans l'axe imposé par l'orientation
    const horizontal = rot === 'rot-0' || rot === 'rot-180';
    const mid = horizontal ? box.x + box.width / 2 : box.y + box.height / 2;
    // Côté « + » : après la médiane pour rot-0, avant pour rot-180 ; bas pour rot-l, haut pour rot-r
    const plusAfter = rot === 'rot-0' || rot === 'rot-l';
    const before = horizontal
      ? { x: mid - 4, y: box.y + box.height / 2 }
      : { x: box.x + box.width / 2, y: mid - 4 };
    const after = horizontal
      ? { x: mid + 4, y: box.y + box.height / 2 }
      : { x: box.x + box.width / 2, y: mid + 4 };
    const score = page.locator(`#sc-${pi}`);

    await page.touchscreen.tap(after.x, after.y);
    await expect(score, `${id} (${rot}) à +4 px`).toHaveText(plusAfter ? '51' : '49');
    await page.touchscreen.tap(before.x, before.y);
    await expect(score, `${id} (${rot}) à −4 px`).toHaveText('50');
  }
  expect(errors).toEqual([]);
});

test('appui long : 200 ms = tap normal, 600 ms = pavé numérique', async ({ page }) => {
  const errors = collectErrors(page);
  await openApp(page);
  await startGame(page, { players: 2, start: 20, names: ['Alice', 'Bruno'] });

  await hold(page, '#card-0 .tap-half.plus', 200);
  await expect(page.locator('#score-modal')).toBeHidden();
  await expect(page.locator('#sc-0')).toHaveText('21');

  await hold(page, '#card-0 .tap-half.plus', 600);
  await expect(page.locator('#score-modal')).toBeVisible();
  // Le maintien n'a pas appliqué de tap
  await expect(page.locator('#score-modal-player')).toHaveText('Alice — 21');
  await page.locator('[data-action="close-score-modal"]').click();
  await expect(page.locator('#sc-0')).toHaveText('21');
  expect(errors).toEqual([]);
});

test('pavé : clavier physique (chiffres, Retour arrière, signe, Entrée) et Échap', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openApp(page);
  await startGame(page, { players: 2, start: 50, names: ['Alice', 'Bruno'] });

  await hold(page, '#card-0 .tap-half.minus', 600);
  await expect(page.locator('#score-modal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#score-modal')).toBeHidden();

  await hold(page, '#card-0 .tap-half.minus', 600);
  await page.keyboard.press('1');
  await page.keyboard.press('7');
  await page.keyboard.press('9');
  await expect(page.locator('#score-modal-display')).toHaveText('+179');
  await page.keyboard.press('Backspace');
  await expect(page.locator('#score-modal-display')).toHaveText('+17');
  await page.keyboard.press('-');
  await expect(page.locator('#score-modal-display')).toHaveText('-17');
  await page.keyboard.press('Enter');
  await expect(page.locator('#score-modal')).toBeHidden();
  await expect(page.locator('#sc-0')).toHaveText('33');

  // Toutes les touches du pavé mesurent au moins 44 px
  await hold(page, '#card-0 .tap-half.minus', 600);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('#modal-keypad .key-btn, .sign-btn, #score-modal .modal-btn')]
      .map((b) => ({
        l: b.textContent.trim() || b.getAttribute('aria-label'),
        ...b.getBoundingClientRect().toJSON(),
      }))
      .filter((r) => r.width < 44 || r.height < 44)
      .map((r) => `${r.l} ${Math.round(r.width)}×${Math.round(r.height)}`),
  );
  expect(small).toEqual([]);
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test('victoire par plafond : modale « Objectif atteint », et aucune victoire si plafond = départ', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openApp(page);
  // Plafond = départ (Loi du Milieu) : le plafond est une butée, pas un objectif
  await startGame(page, { players: 3, start: 40, max: 40, names: ['Alice', 'Bruno', 'Chloé'] });
  await expect(page.locator('#winner-modal')).toBeHidden();
  await page.locator('#card-0 .tap-half.plus').tap();
  await expect(page.locator('#winner-modal')).toBeHidden();
  await expect(page.locator('#sc-0')).toHaveText('40');

  // Objectif : départ 0, plafond 10
  await openApp(page);
  await startGame(page, { players: 2, start: 0, max: 10, names: ['Alice', 'Bruno'] });
  await hold(page, '#card-0 .tap-half.plus', 600);
  await page.keyboard.press('1');
  await page.keyboard.press('0');
  await page.keyboard.press('Enter');
  await expect(page.locator('#winner-modal')).toBeVisible();
  await expect(page.locator('#winner-title')).toHaveText('Objectif atteint');
  await expect(page.locator('#winner-name')).toHaveText('Alice');
  await expect(page.locator('#winner-sub')).toContainText('10 / 10');

  // Annuler referme la modale et rend la partie jouable (bouton de la modale : la barre est
  // volontairement recouverte tant que la surcouche est ouverte)
  await page.locator('#winner-modal [data-action="undo-action"]').click();
  await expect(page.locator('#winner-modal')).toBeHidden();
  await expect(page.locator('#sc-0')).toHaveText('0');
  expect(errors).toEqual([]);
});

test('annulation : réintègre un éliminé, ferme les modales et met à jour la sauvegarde', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openApp(page);
  await startGame(page, { players: 2, start: 5, names: ['Alice', 'Bruno'] });

  await hold(page, '#card-1 .tap-half.minus', 600);
  await page.keyboard.press('-');
  await page.keyboard.press('5');
  await page.keyboard.press('Enter');
  await expect(page.locator('#elim-modal')).toBeVisible();
  await page.locator('#elim-modal [data-action="confirm-elim"]').click();
  await expect(page.locator('#card-1')).toHaveClass(/elim/);
  await expect(page.locator('#winner-modal')).toBeVisible();

  await page.locator('#winner-modal [data-action="undo-action"]').click();
  await expect(page.locator('#winner-modal')).toBeHidden();
  await expect(page.locator('#elim-modal')).toBeHidden();
  await expect(page.locator('#card-1')).not.toHaveClass(/elim/);
  await expect(page.locator('#card-1 .tap-half.plus')).toBeEnabled();
  await page.waitForTimeout(80);
  const saved = await page.evaluate(async () => {
    const s = await import('./js/core/save-schema.js');
    return s.parseGameOrNull(localStorage.getItem('scoretrack_save'));
  });
  expect(saved.players[1].eliminated).toBe(false);
  expect(saved.players[1].score).toBe(0);
  expect(errors).toEqual([]);
});

test('classes d’alerte du score : « low » sous 25 % du départ, « crit » à 0', async ({ page }) => {
  const errors = collectErrors(page);
  await openApp(page);
  await startGame(page, { players: 3, start: 40, names: ['Alice', 'Bruno', 'Chloé'] });
  const score = page.locator('#sc-0');
  await expect(score).not.toHaveClass(/low|crit/);

  // −30 → 10, soit 25 % du départ : alerte « bas »
  await hold(page, '#card-0 .tap-half.minus', 600);
  await page.keyboard.press('-');
  await page.keyboard.press('3');
  await page.keyboard.press('0');
  await page.keyboard.press('Enter');
  await expect(score).toHaveText('10');
  await expect(score).toHaveClass(/low/);
  // La couleur d'alerte est réellement appliquée (jeton --score-low), pas seulement la classe
  const colors = await page.evaluate(() => {
    const el = document.getElementById('sc-0');
    const cs = getComputedStyle(document.documentElement);
    return { applied: getComputedStyle(el).color, low: cs.getPropertyValue('--score-low').trim() };
  });
  expect(colors.applied).not.toBe('');

  // −10 → 0 : alerte critique, et confirmation d'élimination
  await hold(page, '#card-0 .tap-half.minus', 600);
  await page.keyboard.press('-');
  await page.keyboard.press('1');
  await page.keyboard.press('0');
  await page.keyboard.press('Enter');
  await expect(score).toHaveText('0');
  await expect(score).toHaveClass(/crit/);
  await expect(page.locator('#elim-modal')).toBeVisible();
  await page.locator('#elim-modal [data-action="cancel-elim"]').click();
  await expect(score).toHaveText('10');
  await expect(score).toHaveClass(/low/);
  expect(errors).toEqual([]);
});

test('chaque carte porte un identifiant non chromatique : numéro de joueur et prénom', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openApp(page);
  // Aucun prénom saisi : le numéro doit malgré tout identifier chaque carte (D18)
  await startGame(page, { players: 12, start: 40 });
  const seats = await page.evaluate(() =>
    [...document.querySelectorAll('.pcard')].map((c) => {
      const n = c.querySelector('.pseat');
      const r = n.getBoundingClientRect();
      return {
        id: c.id,
        text: n.textContent,
        fs: Math.round(parseFloat(getComputedStyle(n).fontSize)),
        visible: r.width > 0 && r.height > 0,
      };
    }),
  );
  expect(seats.map((s) => s.text)).toEqual(Array.from({ length: 12 }, (_, i) => String(i + 1)));
  expect(seats.filter((s) => !s.visible)).toEqual([]);
  expect(Math.min(...seats.map((s) => s.fs)), 'taille du numéro de joueur').toBeGreaterThanOrEqual(
    12,
  );
  expect(errors).toEqual([]);
});

test('récap : classement complet, retour à un point, copie du résultat', async ({
  page,
  context,
}) => {
  const errors = collectErrors(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openApp(page);
  await startGame(page, { players: 3, start: 20, names: ['Alice', 'Bruno', 'Chloé'] });
  // Trois actions : Alice +1, Bruno −1 (après pause pour ne pas grouper), Alice +1
  await page.locator('#card-0 .tap-half.plus').tap();
  await page.waitForTimeout(1600);
  await page.locator('#card-1 .tap-half.minus').tap();
  await page.waitForTimeout(1600);
  await page.locator('#card-0 .tap-half.plus').tap();
  await expect(page.locator('#sc-0')).toHaveText('22');

  await page.locator('#bar [data-action="show-recap"]').click();
  await expect(page.locator('#recap')).toBeVisible();
  // Tous les joueurs figurent au classement, y compris Chloé qui n'a rien fait
  await expect(page.locator('.recap-rank-row')).toHaveCount(3);
  await expect(page.locator('#recap-body')).toContainText('Chloé');
  await expect(page.locator('.recap-action')).toHaveCount(3);
  await expect(page.locator('.recap-action').first()).toContainText('n°1');

  // Copie du résultat (presse-papiers réel du contexte)
  await page.locator('[data-action="copy-result"]').click();
  await expect(page.locator('#sys-toast')).toContainText('copié');
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain('ScoreTrack');
  expect(clip).toContain('Alice : 22');
  expect(clip).toContain('Chloé : 20');

  // Retour à l'action n°1 : Alice revient à 21, Bruno à 20 ; le rétablissement reste possible
  await page.locator('.recap-action').first().locator('.recap-jump-btn').click();
  await expect(page.locator('#jump-modal')).toBeVisible();
  await page.getByRole('button', { name: 'Revenir', exact: true }).click();
  await expect(page.locator('#jump-modal')).toBeHidden();
  await expect(page.locator('.recap-action.undone')).toHaveCount(2);
  await page.locator('#recap-close-btn').click();
  await expect(page.locator('#sc-0')).toHaveText('21');
  await expect(page.locator('#sc-1')).toHaveText('20');
  await expect(page.locator('#redo-btn')).toBeEnabled();
  await page.locator('#redo-btn').tap();
  await expect(page.locator('#sc-1')).toHaveText('19');
  expect(errors).toEqual([]);
});

test('feuille joueur : renommer (18 caractères) et réintégrer', async ({ page }) => {
  const errors = collectErrors(page);
  await openApp(page);
  await startGame(page, { players: 3, start: 10, names: ['Alice', 'Bruno', 'Chloé'] });
  await page.locator('#card-1 .pname').click();
  const sheet = page.locator('#player-modal');
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute('role', 'dialog');
  await expect(sheet).toHaveAttribute('aria-modal', 'true');
  // Piège de focus : la tabulation ne quitte jamais la feuille
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(() =>
        document.getElementById('player-modal').contains(document.activeElement),
      ),
      `Tab n°${i + 1}`,
    ).toBe(true);
  }
  await page.locator('#player-name-input').fill(LONG);
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('#card-1 .pplayer')).toHaveText(LONG);

  // Élimination puis réintégration depuis la feuille
  await page.locator('#card-1 .pname').click();
  await page.locator('#player-elim-btn').click();
  await expect(page.locator('#card-1')).toHaveClass(/elim/);
  await page.locator('#card-1 .pname').click();
  await page.locator('#player-elim-btn').click();
  await expect(page.locator('#card-1')).not.toHaveClass(/elim/);
  expect(errors).toEqual([]);
});

test('12 joueurs, prénoms de 18 caractères : aucun chevauchement, scores lisibles', async ({
  page,
}, testInfo) => {
  const errors = collectErrors(page);
  await openApp(page);
  await startGame(page, { players: 12, start: 40, names: Array(12).fill(LONG) });

  const probe = () =>
    [...document.querySelectorAll('.pcard')].map((card) => {
      const sc = card.querySelector('.score');
      const nm = card.querySelector('.pplayer');
      const cs = getComputedStyle(sc);
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.font = `${cs.fontSize} ${cs.fontFamily}`;
      const m = ctx.measureText(sc.textContent);
      const a = sc.getBoundingClientRect();
      const b = nm.getBoundingClientRect();
      const inter =
        Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
        Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      const cr = card.getBoundingClientRect();
      return {
        id: card.id,
        cap: Math.round(m.actualBoundingBoxAscent),
        fs: Math.round(parseFloat(cs.fontSize)),
        nameFs: Math.round(parseFloat(getComputedStyle(nm).fontSize)),
        inter: Math.round(inter),
        overflow: Math.round(
          Math.max(0, cr.left - a.left) +
            Math.max(0, a.right - cr.right) +
            Math.max(0, cr.top - a.top) +
            Math.max(0, a.bottom - cr.bottom),
        ),
      };
    });

  const rows = await page.evaluate(probe);
  testInfo.annotations.push({ type: 'mesure-12j', description: JSON.stringify(rows) });
  expect(
    rows.filter((r) => r.inter > 0),
    'intersection nom/score',
  ).toEqual([]);
  expect(
    rows.filter((r) => r.overflow > 1),
    'score hors carte',
  ).toEqual([]);
  expect(
    Math.min(...rows.map((r) => r.cap)),
    'hauteur de capitale à 12 joueurs',
  ).toBeGreaterThanOrEqual(30);
  expect(Math.min(...rows.map((r) => r.nameFs)), 'taille du prénom').toBeGreaterThanOrEqual(12);

  // Les quatre rotations doivent rester correctes après une rotation des sièges
  await page.getByRole('button', { name: /Rotation/ }).click();
  await page.waitForTimeout(450);
  const after = await page.evaluate(probe);
  expect(
    after.filter((r) => r.inter > 0),
    'intersection après rotation',
  ).toEqual([]);
  expect(errors).toEqual([]);
});

test('la bannière système réduit la zone de jeu : aucun recouvrement des cartes', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openApp(page);
  await startGame(page, { players: 4, start: 40 });
  const before = await page.locator('#card-0').boundingBox();

  // La bannière de l'élément E réserve sa hauteur (`--sys-banner-h` + `sys-banner-open`) : la zone
  // de jeu rétrécit et l'observateur de redimensionnement réajuste les cartes.
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--sys-banner-h', '56px');
    document.documentElement.classList.add('sys-banner-open');
  });
  await page.waitForTimeout(200);
  const after = await page.locator('#card-0').boundingBox();
  const wrap = await page.locator('#players-wrap').boundingBox();
  expect(after.height, 'les cartes doivent rétrécir').toBeLessThan(before.height);
  expect(
    after.y + after.height,
    'aucune carte ne doit dépasser sous la zone de jeu',
  ).toBeLessThanOrEqual(wrap.y + wrap.height + 1);

  // Les textes ont bien été réajustés à la nouvelle taille (pas de débordement)
  const overflow = await page.evaluate(
    () =>
      [...document.querySelectorAll('.pcard')].filter((c) => {
        const sc = c.querySelector('.score').getBoundingClientRect();
        const cr = c.getBoundingClientRect();
        return sc.width > cr.width + 1 && sc.height > cr.height + 1;
      }).length,
  );
  expect(overflow).toBe(0);
  expect(errors).toEqual([]);
});

test('hauteur de capitale du score : ≥ 96 px à 4 joueurs, ≥ 30 px à 12', async ({
  page,
}, testInfo) => {
  const measure = () =>
    [...document.querySelectorAll('.score')].map((sc) => {
      const cs = getComputedStyle(sc);
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.font = `${cs.fontSize} ${cs.fontFamily}`;
      return Math.round(ctx.measureText(sc.textContent).actualBoundingBoxAscent);
    });
  await openApp(page);
  await startGame(page, { players: 4, start: 40 });
  const caps4 = await page.evaluate(measure);
  await openApp(page);
  await startGame(page, { players: 12, start: 40 });
  const caps12 = await page.evaluate(measure);
  testInfo.annotations.push({
    type: 'hauteur-de-capitale',
    description: `4 joueurs : ${caps4.join(', ')} px · 12 joueurs : ${caps12.join(', ')} px`,
  });
  expect(Math.min(...caps4)).toBeGreaterThanOrEqual(96);
  expect(Math.min(...caps12)).toBeGreaterThanOrEqual(30);
});

test('un tap réel = UN seul changement de score (tactile, souris, clavier)', async ({ page }) => {
  const errors = collectErrors(page);
  await openApp(page);
  await startGame(page, { players: 2, start: 10, names: ['Alice', 'Bruno'] });
  const score = page.locator('#sc-0');

  // Tactile : touchstart/touchend + le `click` synthétique qui suit ne doivent compter qu'une fois
  await page.locator('#card-0 .tap-half.plus').tap();
  await expect(score).toHaveText('11');
  await page.locator('#card-0 .tap-half.plus').tap();
  await expect(score).toHaveText('12');

  // Souris : pointerdown/pointerup + click
  await page.locator('#card-0 .tap-half.plus').click();
  await expect(score).toHaveText('13');

  // Clavier : Entrée puis Espace sur la moitié focalisée (un clic synthétique chacun)
  await page.locator('#card-0 .tap-half.minus').focus();
  await page.keyboard.press('Enter');
  await expect(score).toHaveText('12');
  await page.keyboard.press('Space');
  await expect(score).toHaveText('11');

  // Un seul groupe d'annulation par salve : le journal compte exactement 5 entrées
  const entries = await page.evaluate(async () => {
    const { store } = await import('./js/store.js');
    return store.game.log.entries.length;
  });
  expect(entries, 'entrées de journal pour 5 taps').toBe(5);
  expect(errors).toEqual([]);
});

test('reprise : le journal restauré réactive Annuler', async ({ page }) => {
  const errors = collectErrors(page);
  await openApp(page);
  await startGame(page, { players: 2, start: 10, names: ['Alice', 'Bruno'] });
  await page.locator('#card-0 .tap-half.plus').tap();
  await page.waitForTimeout(1600);
  await page.locator('#card-1 .tap-half.minus').tap();
  await expect(page.locator('#sc-1')).toHaveText('9');
  await page.waitForTimeout(80);

  await page.reload();
  await expect(page.locator('#restore-banner')).toBeVisible();
  await page.getByRole('button', { name: 'Reprendre' }).click();
  await expect(page.locator('.pcard')).toHaveCount(2);
  await expect(page.locator('#sc-0')).toHaveText('11');
  await expect(page.locator('#undo-btn'), 'Annuler après reprise').toBeEnabled();
  await expect(page.locator('#redo-btn')).toBeDisabled();
  await page.locator('#undo-btn').tap();
  await expect(page.locator('#sc-1')).toHaveText('10');
  await page.locator('#undo-btn').tap();
  await expect(page.locator('#sc-0')).toHaveText('10');
  await expect(page.locator('#redo-btn')).toBeEnabled();
  expect(errors).toEqual([]);
});

test('un seul retour haptique par tap, motifs distincts aux butées', async ({ page, context }) => {
  await context.addInitScript(() => {
    window.__vibes = [];
    navigator.vibrate = (p) => {
      window.__vibes.push(p);
      return true;
    };
  });
  const errors = collectErrors(page);
  await openApp(page);
  // Départ = plafond : « + » est en butée haute dès le lancement, « − » fonctionne
  await startGame(page, { players: 2, start: 20, max: 20, names: ['Alice', 'Bruno'] });
  const vibes = () => page.evaluate(() => window.__vibes.slice());
  const reset = () => page.evaluate(() => (window.__vibes.length = 0));
  // Les motifs appartiennent à js/platform/haptics.js : on les lit plutôt que de les recopier.
  const patterns = await page.evaluate(async () => {
    const h = await import('./js/platform/haptics.js');
    return { tap: h.PATTERNS.tap, ceiling: h.PATTERNS.ceiling, floor: h.PATTERNS.floor };
  });
  expect(JSON.stringify(patterns.ceiling), 'butée et tap doivent différer').not.toBe(
    JSON.stringify(patterns.tap),
  );

  await reset();
  await page.locator('#card-0 .tap-half.minus').tap();
  await expect(page.locator('#sc-0')).toHaveText('19');
  expect(await vibes(), 'un tap tactile = une vibration').toEqual([patterns.tap]);

  // Même chose à la souris : aucun doublon pointeur/clic
  await reset();
  await page.locator('#card-0 .tap-half.plus').click();
  await expect(page.locator('#sc-0')).toHaveText('20');
  expect(await vibes(), 'un clic souris = une vibration').toEqual([patterns.tap]);

  // Butée haute (plafond atteint) : motif distinct du tap, et le score ne bouge pas
  await reset();
  await page.locator('#card-0 .tap-half.plus').tap();
  await expect(page.locator('#sc-0')).toHaveText('20');
  expect(await vibes(), 'butée haute : un seul déclenchement').toEqual([patterns.ceiling]);

  expect(errors).toEqual([]);
});
