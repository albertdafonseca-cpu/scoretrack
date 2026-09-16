// Parcours de fumée : setup → noms → jeu → tap +/− → appui long → pavé → récap → rechargement → undo → reset.
import { expect, test } from '@playwright/test';

/** Erreurs console/page à ignorer : uniquement les échecs réseau de polices en environnement à proxy TLS. */
const IGNORED = /ERR_CERT_AUTHORITY_INVALID/;

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  return errors;
}

async function openApp(page) {
  await page.goto('/');
  await expect(page.locator('#splash')).toHaveCount(0);
  await expect(page.locator('#setup-page')).toBeVisible();
}

async function setupGame(page, { players, start, max }) {
  await page.locator('#players-grid .player-chip', { hasText: new RegExp(`^${players}$`) }).click();
  await page.locator(`#start-presets .points-chip[data-val="${start}"]`).click();
  if (max) await page.locator(`#max-presets .points-chip[data-val="${max}"]`).click();
  await expect(page.locator('#go-btn')).toHaveText(`Suivant → (${players}j · ${start}pts)`);
  await page.locator('#go-btn').click();
  await expect(page.locator('.name-input')).toHaveCount(players);
}

/** Tape sur une carte : `side` = 'plus' | 'minus' selon l'orientation de la carte. */
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

/** Appui long réel (touchStart… touchEnd) via CDP, plus long que le seuil de 450 ms. */
async function longPress(page, context, selector, holdMs = 650) {
  const box = await page.locator(selector).boundingBox();
  const cdp = await context.newCDPSession(page);
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await page.waitForTimeout(holdMs);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

test('parcours complet à 4 joueurs, restauration, annulation et reset', async ({
  page,
  context,
}) => {
  const errors = collectErrors(page);
  await openApp(page);
  await setupGame(page, { players: 4, start: 40, max: 40 });

  // Noms — dont un prénom contenant des caractères HTML/quotes (injection)
  const tricky = `Bob <b>&'"`;
  const names = ['Alice', tricky, 'Chloé', ''];
  const inputs = page.locator('.name-input');
  for (let i = 0; i < names.length; i++) await inputs.nth(i).fill(names[i]);
  await page.getByRole('button', { name: /Mémoriser/ }).click();
  await expect(page.locator('.profile-chip')).toHaveCount(3);
  await expect(page.locator('.profile-chip').nth(1).locator('span').first()).toHaveText(tricky);
  await page.getByRole('button', { name: /Lancer/ }).click();

  // Jeu
  await expect(page.locator('#game-screen')).toBeVisible();
  await expect(page.locator('.pcard')).toHaveCount(4);
  await expect(page.locator('#card-1 .pplayer')).toHaveText(tricky);
  await expect(page.locator('#card-3 .pplayer-ghost')).toHaveCount(1);
  await expect(page.locator('#sc-0')).toHaveText('40');

  // Tap + (plafond 40 → pas de mouvement) puis tap − → 39
  await tapCard(page, 'card-0', 'plus');
  await expect(page.locator('#sc-0')).toHaveText('40');
  await tapCard(page, 'card-0', 'minus');
  await expect(page.locator('#sc-0')).toHaveText('39');
  await expect(page.locator('#undo-btn')).toBeEnabled();
  await tapCard(page, 'card-0', 'plus');
  await expect(page.locator('#sc-0')).toHaveText('40');

  // Appui long → pavé numérique : −30 (→ 10, soit ≤ 25 % du départ : classe « low »)
  await longPress(page, context, '#card-0 .tap-zone');
  await expect(page.locator('#score-modal')).toBeVisible();
  await expect(page.locator('#score-modal-player')).toHaveText('Alice — 40');
  await page.locator('.key-btn', { hasText: /^3$/ }).click();
  await page.locator('.key-btn', { hasText: /^0$/ }).click();
  await expect(page.locator('#score-modal-display')).toHaveText('+30');
  await page.locator('#sign-minus').click();
  await expect(page.locator('#score-modal-display')).toHaveText('-30');
  await page.getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.locator('#score-modal')).toBeHidden();
  await expect(page.locator('#sc-0')).toHaveText('10');
  await expect(page.locator('#sc-0')).toHaveClass(/low/);

  // Récap
  await page.locator('#bar').getByRole('button', { name: /Récap/ }).click();
  await expect(page.locator('#recap')).toBeVisible();
  await expect(page.locator('#recap-body')).toContainText('Alice');
  await expect(page.locator('#recap-body')).toContainText('Perte de 30 pts');
  await expect(page.locator('#recap-body')).toContainText('Bilan · Score final');
  await page.locator('#recap-close-btn').click();
  await expect(page.locator('#recap')).toBeHidden();

  // Rotation : le joueur 3 passe en bas-gauche
  await page.getByRole('button', { name: /Rotation/ }).click();
  await expect(page.locator('#card-3')).toHaveCSS('grid-row-start', '2');

  // Rechargement → bannière → reprise avec les scores et prénoms intacts
  await page.reload();
  await expect(page.locator('#splash')).toHaveCount(0);
  await expect(page.locator('#restore-banner')).toBeVisible();
  await page.getByRole('button', { name: 'Reprendre' }).click();
  await expect(page.locator('#game-screen')).toBeVisible();
  await expect(page.locator('.pcard')).toHaveCount(4);
  await expect(page.locator('#sc-0')).toHaveText('10');
  await expect(page.locator('#card-1 .pplayer')).toHaveText(tricky);
  await expect(page.locator('#undo-btn')).toBeDisabled();

  // Undo : deux taps − (le plafond 40 interdit le +) puis deux annulations
  await tapCard(page, 'card-2', 'minus');
  await expect(page.locator('#sc-2')).toHaveText('39');
  await tapCard(page, 'card-2', 'minus');
  await expect(page.locator('#sc-2')).toHaveText('38');
  await page.locator('#undo-btn').tap();
  await expect(page.locator('#sc-2')).toHaveText('39');
  await page.locator('#undo-btn').tap();
  await expect(page.locator('#sc-2')).toHaveText('40');
  await expect(page.locator('#undo-btn')).toBeDisabled();

  // Reset → retour au setup, sauvegarde effacée
  await page.getByRole('button', { name: /Reset/ }).click();
  await expect(page.locator('#reset-modal')).toBeVisible();
  await page.getByRole('button', { name: 'Confirmer' }).click();
  await expect(page.locator('#setup-page')).toBeVisible();
  await expect(page.locator('#game-screen')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('scoretrack_save'))).toBeNull();
  await expect(page.locator('#go-btn')).toBeDisabled();

  expect(errors).toEqual([]);
});

test("élimination à 0 et vainqueur (2 joueurs), annulation de l'élimination", async ({ page }) => {
  const errors = collectErrors(page);
  await openApp(page);
  await setupGame(page, { players: 2, start: 10, max: 0 });
  await page.getByRole('button', { name: /Lancer/ }).click();
  await expect(page.locator('.pcard')).toHaveCount(2);

  // Descendre le joueur 2 (carte du haut, rot-180) à 0 par le pavé : −10
  const box = await page.locator('#card-1 .tap-zone').boundingBox();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
  });
  await page.waitForTimeout(650);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('#score-modal')).toBeVisible();
  await page.locator('#sign-minus').click();
  await page.locator('.key-btn', { hasText: /^1$/ }).click();
  await page.locator('.key-btn', { hasText: /^0$/ }).click();
  await page.getByRole('button', { name: 'Appliquer' }).click();

  // Confirmation demandée, annulée → score restauré
  await expect(page.locator('#elim-modal')).toBeVisible();
  await expect(page.locator('#elim-confirm-name')).toHaveText('Joueur 2');
  await page.locator('#elim-modal').getByRole('button', { name: 'Annuler' }).click();
  await expect(page.locator('#elim-modal')).toBeHidden();
  await expect(page.locator('#sc-1')).toHaveText('10');

  // Nouvelle descente à 0, confirmée → éliminé, vainqueur = dernier survivant
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
  });
  await page.waitForTimeout(650);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.locator('#sign-minus').click();
  await page.locator('.key-btn', { hasText: /^1$/ }).click();
  await page.locator('.key-btn', { hasText: /^0$/ }).click();
  await page.getByRole('button', { name: 'Appliquer' }).click();
  await page.getByRole('button', { name: 'Éliminer' }).click();
  await expect(page.locator('#card-1')).toHaveClass(/elim/);
  await expect(page.locator('#card-1 .elim-label')).toHaveText('Éliminé');
  await expect(page.locator('#winner-modal')).toBeVisible();
  await expect(page.locator('#winner-name')).toHaveText('Dernier survivant');
  await expect(page.locator('#winner-sub')).toHaveText('Dernier survivant · Score : 10');

  expect(errors).toEqual([]);
});
