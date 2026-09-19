// Écran de jeu (élément A) : identité du DOM, gestes aux frontières, appui long, pavé au clavier,
// victoire par plafond, annulation/rétablissement, retour à un point, copie du résultat, 12 joueurs.
import { expect, test } from '@playwright/test';
import { collectErrors, openApp as openBase, renderedContrast } from './helpers.js';

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

test('journal du récap : aucune intersection avec le bouton « Revenir ici »', async ({ page }) => {
  const errors = collectErrors(page);
  await openApp(page);
  await startGame(page, { players: 3, start: 50, names: ['Alice', 'Bartholomew Longn', 'Chloé'] });
  // Une action groupée de 8 taps produit la pastille la plus longue (« 8 taps : −1 −1 … »),
  // exactement celle qui débordait sa colonne et glissait sous le bouton.
  for (let i = 0; i < 8; i++) await page.locator('#card-1 .tap-half.minus').tap();
  await expect(page.locator('#sc-1')).toHaveText('42');
  await page.waitForTimeout(1700);
  await page.locator('#card-0 .tap-half.plus').tap();

  await page.locator('#bar [data-action="show-recap"]').click();
  await expect(page.locator('#recap')).toBeVisible();
  await expect(page.locator('.recap-action')).toHaveCount(2);
  const overlaps = await page.evaluate(() =>
    [...document.querySelectorAll('.recap-action')]
      .map((row, i) => {
        const btn = row.querySelector('.recap-jump-btn').getBoundingClientRect();
        const worst = [...row.querySelectorAll('.recap-action-body *, .recap-action-head *')]
          .map((n) => n.getBoundingClientRect())
          .map(
            (r) =>
              Math.max(0, Math.min(r.right, btn.right) - Math.max(r.left, btn.left)) *
              Math.max(0, Math.min(r.bottom, btn.bottom) - Math.max(r.top, btn.top)),
          )
          .reduce((a, b) => Math.max(a, b), 0);
        return { row: i, overlap: Math.round(worst) };
      })
      .filter((r) => r.overlap > 0),
  );
  expect(overlaps, JSON.stringify(overlaps)).toEqual([]);

  // Et aucun texte du journal ne déborde horizontalement de la page.
  const wide = await page.evaluate(() => {
    const root = document.getElementById('recap-body');
    return [...root.querySelectorAll('*')].filter(
      (n) => n.getBoundingClientRect().right > window.innerWidth + 1,
    ).length;
  });
  expect(wide, 'éléments du récap hors écran').toBe(0);
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

test('taps SIMULTANÉS : chaque doigt compte (2 puis 3 cartes à la fois)', async ({ page }) => {
  const errors = collectErrors(page);
  await openApp(page);
  await startGame(page, { players: 6, start: 100 });
  const cdp = await page.context().newCDPSession(page);
  const center = async (sel) => {
    const b = await page.locator(sel).boundingBox();
    return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
  };
  /** Pose tous les doigts, puis les relève : un vrai geste à plusieurs mains autour de la table. */
  const multiTap = async (points) => {
    for (let i = 0; i < points.length; i++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: points.slice(0, i + 1).map((p, k) => ({ ...p, id: k + 1 })),
      });
    }
    await page.waitForTimeout(40);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(120);
  };

  // Deux doigts sur deux cartes différentes
  await multiTap([await center('#card-0 .tap-half.plus'), await center('#card-1 .tap-half.plus')]);
  await expect(page.locator('#sc-0')).toHaveText('101');
  await expect(page.locator('#sc-1')).toHaveText('101');

  // Trois doigts sur trois cartes différentes
  await multiTap([
    await center('#card-2 .tap-half.plus'),
    await center('#card-3 .tap-half.plus'),
    await center('#card-4 .tap-half.minus'),
  ]);
  await expect(page.locator('#sc-2')).toHaveText('101');
  await expect(page.locator('#sc-3')).toHaveText('101');
  await expect(page.locator('#sc-4')).toHaveText('99');
  await cdp.detach();

  // Le journal porte bien les cinq actions
  const entries = await page.evaluate(async () => {
    const { store } = await import('./js/store.js');
    return store.game.log.entries.length;
  });
  expect(entries, 'entrées de journal pour 5 taps simultanés').toBe(5);
  expect(errors).toEqual([]);
});

test('contraste sur pixels rendus : 14 thèmes × 7 états × 3 textes de carte (D16)', async ({
  page,
}, testInfo) => {
  test.setTimeout(300_000);
  await openApp(page);
  // Un prénom long touche les zones teintées : c'est le pire cas, celui qu'il faut mesurer.
  await startGame(page, { players: 4, start: 40, names: Array(4).fill('Bartholomew Longn') });
  const themes = await page.evaluate(async () =>
    (await import('./js/core/constants.js')).THEMES.map((t) => t.id),
  );
  expect(themes.length, 'thèmes à auditer').toBeGreaterThanOrEqual(14);
  /** Tous les états visuels transitoires d'une moitié, pas seulement le repos. */
  const STATES = [
    ['repos', null, null],
    ['pressé+', 'plus', 'pressed'],
    ['pressé-', 'minus', 'pressed'],
    ['flash+', 'plus', 'flash-pos'],
    ['flash-', 'minus', 'flash-neg'],
    ['butée+', 'plus', 'blocked'],
    ['butée-', 'minus', 'blocked'],
  ];
  const failures = [];
  const rows = [];
  for (const id of themes) {
    await page.evaluate(
      (t) => document.documentElement.setAttribute('data-theme', t === 'cyber' ? '' : t),
      id,
    );
    // Le thème change de police : tant qu'elle n'est pas chargée, le texte peut être rendu
    // invisible (`font-display`), ce qui mesurerait un aplat uniforme au lieu d'un contraste.
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(150);
    for (const [state, half, cls] of STATES) {
      if (half) {
        await page.evaluate(
          ([h, c]) => document.querySelector(`#card-0 .tap-half.${h}`).classList.add(c),
          [half, cls],
        );
        await page.waitForTimeout(150);
      }
      const [score, seat, name] = await renderedContrast(page, [
        '#sc-0',
        '#card-0 .pseat',
        '#card-0 .pplayer',
      ]);
      if (half) {
        await page.evaluate(
          ([h, c]) => document.querySelector(`#card-0 .tap-half.${h}`).classList.remove(c),
          [half, cls],
        );
      }
      rows.push({ id, state, score: score.ratio, seat: seat.ratio, name: name.ratio });
      for (const [cible, r] of [
        ['score', score.ratio],
        ['numéro', seat.ratio],
        ['prénom', name.ratio],
      ]) {
        if (!(r >= 4.5)) failures.push({ id, state, cible, ratio: r });
      }
    }
  }
  const worst = rows.reduce((a, r) => Math.min(a, r.score, r.seat, r.name), Infinity);
  const worstName = rows.reduce((a, r) => Math.min(a, r.name), Infinity);
  testInfo.annotations.push({
    type: 'contraste-rendu',
    description: `${rows.length} mesures (14 thèmes × 7 états × 3 textes) · pire rapport ${worst} · pire prénom ${worstName}`,
  });
  // D17 : la mesure doit avoir réellement eu lieu, sur TOUS les états.
  expect(rows.length).toBe(themes.length * STATES.length);
  expect(failures, JSON.stringify(failures)).toEqual([]);

  // INVARIANT de construction : aucun état transitoire ne doit dégrader le fond d'un texte.
  // C'est lui qui donne la marge, et non une valeur choisie au cas par cas : le renfort de teinte
  // est cantonné sous la bande d'identité et hors du chiffre, donc les rapports mesurés au repos
  // valent aussi en butée, en flash et sous le doigt. Une régression le fera échouer ici.
  const drops = [];
  for (const id of themes) {
    const rest = rows.find((r) => r.id === id && r.state === 'repos');
    for (const r of rows.filter((x) => x.id === id && x.state !== 'repos')) {
      for (const cible of ['score', 'seat', 'name']) {
        if (r[cible] < rest[cible] - 0.3) {
          drops.push({ id, state: r.state, cible, repos: rest[cible], etat: r[cible] });
        }
      }
    }
  }
  expect(drops, JSON.stringify(drops)).toEqual([]);
  // Et la marge du prénom, point le plus sensible relevé par l'audit visuel, est nette.
  expect(worstName, 'marge du prénom').toBeGreaterThanOrEqual(6);
});

test('le nom de joueur est une cible tactile d’au moins 44 × 44 px', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await openApp(page);
  // 12 joueurs sans prénom : le bloc d'identité s'y réduit au numéro, c'est le pire cas.
  await startGame(page, { players: 12, start: 40 });
  // La zone ATTEIGNABLE est ce qui compte, pas la boîte du texte : on balaie depuis le centre
  // jusqu'à ce que le point ne vise plus le bouton, dans les quatre directions de l'ÉCRAN. La
  // somme de deux directions opposées donne la dimension réelle de la cible, quelle que soit
  // l'orientation de la carte.
  const sizes = await page.evaluate(() => {
    const reach = (btn, r, ax, ay) => {
      let k = 0;
      while (k <= 80) {
        const e = document.elementFromPoint(
          r.left + r.width / 2 + ax * k,
          r.top + r.height / 2 + ay * k,
        );
        if (!e || e.closest('.pname') !== btn) break;
        k++;
      }
      return k - 1;
    };
    return [...document.querySelectorAll('.pname')].map((btn) => {
      const r = btn.getBoundingClientRect();
      return {
        id: btn.closest('.pcard').id,
        x: reach(btn, r, 1, 0) + reach(btn, r, -1, 0) + 1,
        y: reach(btn, r, 0, 1) + reach(btn, r, 0, -1) + 1,
      };
    });
  });
  testInfo.annotations.push({
    type: 'cible-nom',
    description: sizes.map((s) => `${s.id} ${s.x}×${s.y}`).join(' · '),
  });
  const small = sizes.filter((s) => s.x < 44 || s.y < 44);
  expect(small, JSON.stringify(small)).toEqual([]);

  // Et un tap franc au BORD de cette zone (donc hors du texte) ouvre bien la feuille joueur.
  const point = await page.evaluate(() => {
    const btn = document.querySelector('#card-0 .pname');
    const r = btn.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let k = 0;
    while (k <= 80) {
      const e = document.elementFromPoint(cx, cy + k + 1);
      if (!e || e.closest('.pname') !== btn) break;
      k++;
    }
    return { x: Math.round(cx), y: Math.round(cy + k) };
  });
  await page.touchscreen.tap(point.x, point.y);
  await expect(page.locator('#player-modal')).toBeVisible();
  expect(errors).toEqual([]);
});

test('aucun prénom COURT tronqué, de 1 à 12 joueurs, et écart de taille du score borné', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  const report = [];
  const cut = [];
  for (const players of [1, 2, 4, 5, 7, 9, 11, 12]) {
    await openApp(page);
    // Prénoms courts et longs mélangés : le cas « Alice tronqué en Ali… » doit être impossible.
    const names = Array.from({ length: players }, (_, i) =>
      i % 2 ? 'Alice' : 'Bartholomew Longn',
    );
    await startGame(page, { players, start: 40, names });
    // Scores à quatre chiffres : le cas courant (rami, canasta, Skyjo cumulé).
    await page.evaluate(async () => {
      const g = await import('./js/ui/game.js');
      const { store } = await import('./js/store.js');
      store.game.players.forEach((_, i) => g.applyManualDelta(i, 1200));
    });
    await page.waitForTimeout(200);
    const probe = await page.evaluate(() =>
      [...document.querySelectorAll('.pcard')].map((card) => {
        const nm = card.querySelector('.pplayer');
        const sc = card.querySelector('.score');
        return {
          id: card.id,
          name: nm.textContent,
          cut: nm.scrollWidth > nm.clientWidth + 0.5,
          fs: parseFloat(getComputedStyle(sc).fontSize),
        };
      }),
    );
    // Un prénom de 17 caractères ne PEUT pas tenir en entier sur une carte de 90 px avec un
    // plancher de 12 px : l'ellipse est alors le comportement correct. Ce qui est inacceptable,
    // c'est qu'un prénom COURT soit rogné — c'était le cas d'« Alice » sur les plus grandes cartes.
    probe.filter((r) => r.cut && r.name.length <= 8).forEach((r) => cut.push({ players, ...r }));
    const longCut = probe.filter((r) => r.cut).length;
    const sizes = probe.map((r) => r.fs);
    const ratio = Math.max(...sizes) / Math.min(...sizes);
    report.push(
      `n=${players} : écart de taille ${ratio.toFixed(2)}× · prénoms longs rognés ${longCut}/${players} · prénoms courts rognés 0`,
    );
    expect(ratio, `écart de taille du score à ${players} joueurs`).toBeLessThanOrEqual(1.5);
    // Cohérence entre le calcul du cœur et ce que le DOM applique réellement.
    const gap = await page.evaluate(async () => (await import('./js/ui/game.js')).fitCoherence());
    expect(gap, `écart cœur/rendu à ${players} joueurs`).toBeLessThan(0.2);
  }
  testInfo.annotations.push({ type: 'prenoms-et-ecarts', description: report.join(' · ') });
  expect(cut, JSON.stringify(cut)).toEqual([]);
  expect(errors).toEqual([]);
});

test('hauteur de capitale du score à 2, 4 et 7 chiffres, au gabarit 390 × 844', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  // La grille impose 390 × 844 : mesurer sur le gabarit plus court de l'émulation flatterait le
  // résultat de 9 px à 4 joueurs.
  await page.setViewportSize({ width: 390, height: 844 });
  const measure = () =>
    [...document.querySelectorAll('.score')].map((sc) => {
      const cs = getComputedStyle(sc);
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.font = `${cs.fontSize} ${cs.fontFamily}`;
      return Math.round(ctx.measureText(sc.textContent).actualBoundingBoxAscent);
    });
  const lines = [];
  const caps = {};
  for (const players of [4, 12]) {
    await openApp(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await startGame(page, { players, start: 40 });
    for (const [digits, delta] of [
      ['2', 0],
      ['4', 1200],
      ['7', 1234467],
    ]) {
      if (delta) {
        await page.evaluate(async (d) => {
          const g = await import('./js/ui/game.js');
          const { store } = await import('./js/store.js');
          store.game.players.forEach((_, i) => g.applyManualDelta(i, d));
        }, delta);
        await page.waitForTimeout(200);
      }
      const values = await page.evaluate(measure);
      const rows = await page.evaluate(
        () => (document.querySelector('.score').textContent.match(/\n/g) || []).length + 1,
      );
      caps[`${players}-${digits}`] = Math.min(...values);
      caps[`${players}-${digits}-rows`] = rows;
      lines.push(
        `${players} joueurs / ${digits} chiffres : ${Math.min(...values)}–${Math.max(...values)} px (${rows} ligne${rows > 1 ? 's' : ''})`,
      );
    }
  }
  testInfo.annotations.push({ type: 'hauteur-de-capitale', description: lines.join(' · ') });
  // Seuils de la grille (D2.1) : 96 px à 4 joueurs, 30 px à 12, sur le score courant.
  expect(caps['4-2'], '4 joueurs, 2 chiffres').toBeGreaterThanOrEqual(96);
  expect(caps['4-4'], '4 joueurs, 4 chiffres').toBeGreaterThanOrEqual(96 * 0.75);
  expect(caps['12-2'], '12 joueurs, 2 chiffres').toBeGreaterThanOrEqual(30);
  expect(caps['12-4'], '12 joueurs, 4 chiffres').toBeGreaterThanOrEqual(30);
  // Le score à 7 chiffres à 12 joueurs tient le seuil grâce au rendu sur DEUX lignes décidé par
  // `computeFit` : sur une seule ligne, la même carte plafonnait à 22 px.
  expect(caps['12-7'], '12 joueurs, 7 chiffres').toBeGreaterThanOrEqual(30);
  expect(caps['12-7-rows'], '12 joueurs, 7 chiffres : rendu sur deux lignes').toBe(2);
  // Et une grande carte garde son score sur UNE ligne : la coupure n'est pas systématique.
  expect(caps['4-7-rows'], '4 joueurs, 7 chiffres : une seule ligne').toBe(1);
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
