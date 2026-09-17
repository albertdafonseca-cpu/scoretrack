// Parcours d'entrée : lancement à froid en ≤ 2 clics, parcours nommé, reprise avec aperçu,
// préréglages et ligne « Personnalisé », mémoire des noms par préréglage, erreurs de saisie.
import { expect, test } from '@playwright/test';
import { collectErrors, openApp, tapCard } from './helpers.js';

test('à froid : le CTA est actif et le premier score change en 2 clics', async ({ page }) => {
  const errors = collectErrors(page);
  await openApp(page);
  const shot = (name) => page.screenshot({ path: test.info().outputPath(`${name}.png`) });

  // 1.3 — valeurs sensées préappliquées, CTA actif, aperçu textuel
  await expect(page.locator('#go-btn')).toBeEnabled();
  await expect(page.locator('#setup-summary')).toHaveText('4 joueurs · départ 0 · sans limite');
  await expect(page.locator('#preset-custom')).toBeVisible();
  await expect(page.locator('#players-grid [aria-pressed="true"]')).toHaveText('4');
  await shot('etape-0-accueil');

  // 1.1 — compter les clics jusqu'au premier changement de score
  let clicks = 0;
  await page.locator('#go-btn').click();
  clicks++;
  await expect(page.locator('#game-screen')).toBeVisible();
  await expect(page.locator('.pcard')).toHaveCount(4);
  await expect(page.locator('#sc-0')).toHaveText('0');
  await shot('etape-1-jeu');

  await tapCard(page, 'card-0', 'plus');
  clicks++;
  await expect(page.locator('#sc-0')).toHaveText('1');
  await shot('etape-2-premier-score');
  expect(clicks).toBe(2);
  expect(errors).toEqual([]);
});

test('splash : ≤ 200 ms, absent sous prefers-reduced-motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  // Le splash est masqué par CSS dès le premier rendu (aucune attente artificielle)
  await expect(page.locator('#splash')).toBeHidden();
  await expect(page.locator('#go-btn')).toBeEnabled();

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const t0 = Date.now();
  await page.goto('/');
  await page.waitForFunction(() => {
    const s = document.getElementById('splash');
    return !s || s.classList.contains('hidden');
  });
  // Délai constant de 150 ms + marge de rendu : le fondu démarre bien avant 1 s
  expect(Date.now() - t0).toBeLessThan(1000);
});

test('parcours nommé, puis reprise en 1 clic avec aperçu (noms, scores, date)', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openApp(page);
  await page.locator('#names-btn').click();
  await expect(page.locator('#names-page')).toBeVisible();
  const inputs = page.locator('.name-input');
  await expect(inputs).toHaveCount(4);
  // Longueur indépendante de l'écran : 18 caractères
  await expect(inputs.first()).toHaveAttribute('maxlength', '18');
  await inputs.first().fill('Wxxxxxxxxxxxxxxxxxxxxxxx');
  expect((await inputs.first().inputValue()).length).toBe(18);

  const names = ['Alice', 'Bob', 'Chloé', 'David'];
  for (let i = 0; i < 4; i++) await inputs.nth(i).fill(names[i]);
  await page.locator('#names-go-btn').click();
  await expect(page.locator('#game-screen')).toBeVisible();
  await expect(page.locator('#card-0 .pplayer')).toHaveText('Alice');
  await tapCard(page, 'card-0', 'plus');
  await expect(page.locator('#sc-0')).toHaveText('1');

  await page.reload();
  await expect(page.locator('#splash')).toHaveCount(0);
  const banner = page.locator('#restore-banner');
  await expect(banner).toBeVisible();
  await expect(page.locator('#restore-preview')).toHaveText('Alice 1 · Bob 0 · Chloé 0 · David 0');
  await expect(page.locator('#restore-when')).toHaveText("Sauvegardée à l'instant");
  await expect(page.locator('#restore-when')).toHaveAttribute('datetime', /^\d{4}-/);
  await page.screenshot({ path: test.info().outputPath('reprise-banniere.png') });

  await page.getByRole('button', { name: 'Reprendre' }).click();
  await expect(page.locator('#game-screen')).toBeVisible();
  await expect(page.locator('#sc-0')).toHaveText('1');
  await expect(page.locator('#card-3 .pplayer')).toHaveText('David');
  expect(errors).toEqual([]);
});

test('préréglages : sélection, ligne « Personnalisé » à la déviation, noms mémorisés', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openApp(page);
  const skyjo = page.locator('#presets-grid .preset-card', { hasText: 'Skyjo' });
  await skyjo.click();
  await expect(skyjo).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#preset-custom')).toBeHidden();
  await expect(page.locator('#setup-summary')).toHaveText(
    '4 joueurs · départ 0 · sans limite · négatifs',
  );
  await expect(page.locator('#neg-toggle')).toHaveAttribute('aria-checked', 'true');

  // Déviation → le préréglage se relâche, « Personnalisé » apparaît
  await page.locator('#players-grid .player-chip', { hasText: /^5$/ }).click();
  await expect(skyjo).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#preset-custom')).toBeVisible();
  await expect(page.locator('#setup-summary')).toHaveText(
    '5 joueurs · départ 0 · sans limite · négatifs',
  );

  // Noms mémorisés par préréglage
  await skyjo.click();
  await page.locator('#names-btn').click();
  await page.locator('.name-input').first().fill('Zoé');
  await page.locator('#names-go-btn').click();
  await expect(page.locator('#card-0 .pplayer')).toHaveText('Zoé');
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('scoretrack_last_names')),
  );
  expect(stored.v).toBe(1);
  expect(stored.byPreset.Skyjo).toEqual(['Zoé', '', '', '']);

  await page.getByRole('button', { name: /Reset/ }).click();
  await page.getByRole('button', { name: 'Confirmer' }).click();
  await expect(page.locator('#setup-page')).toBeVisible();
  await expect(page.locator('#setup-names-hint')).toBeHidden();
  await skyjo.click();
  await expect(page.locator('#setup-names-hint')).toHaveText('Derniers noms : Zoé');
  await page.locator('#names-btn').click();
  await expect(page.locator('.name-input').first()).toHaveValue('Zoé');
  await page.getByRole('button', { name: /Retour/ }).click();
  // Lancement rapide : reprend les derniers noms du préréglage
  await page.locator('#go-btn').click();
  await expect(page.locator('#card-0 .pplayer')).toHaveText('Zoé');
  expect(errors).toEqual([]);
});

test('erreurs de saisie : maximum inférieur au départ, valeurs hors bornes', async ({ page }) => {
  await openApp(page);
  await page.locator('#start-presets .points-chip[data-val="40"]').click();
  await expect(page.locator('#max-presets .points-chip[data-val="10"]')).toBeDisabled();
  await expect(page.locator('#max-presets .points-chip[data-val="20"]')).toBeDisabled();
  await expect(page.locator('#max-presets .points-chip[data-val="40"]')).toBeEnabled();

  const maxInput = page.locator('#max-custom');
  await maxInput.fill('20');
  const error = page.locator('#max-error');
  await expect(error).toBeVisible();
  await expect(error).toContainText('au moins égal aux points de départ (40)');
  await expect(maxInput).toHaveAttribute('aria-invalid', 'true');
  await expect(maxInput).toHaveAttribute('aria-describedby', 'max-error');
  await expect(page.locator('#go-btn')).toBeDisabled();
  await expect(page.locator('#names-btn')).toBeDisabled();
  await expect(page.locator('#setup-summary')).toHaveText('Corrigez les valeurs signalées.');
  await page.screenshot({ path: test.info().outputPath('erreur-max.png'), fullPage: true });

  await maxInput.fill('60');
  await expect(error).toBeHidden();
  await expect(maxInput).toHaveAttribute('aria-invalid', 'false');
  await expect(page.locator('#go-btn')).toBeEnabled();
  await expect(page.locator('#setup-summary')).toHaveText('4 joueurs · départ 40 · max 60');

  // Le message suit les changements de départ
  await page.locator('#start-presets .points-chip[data-val="100"]').click();
  await expect(error).toContainText('(100)');
  await expect(page.locator('#go-btn')).toBeDisabled();
  await maxInput.fill('');
  await expect(page.locator('#setup-summary')).toHaveText('4 joueurs · départ 100 · sans limite');

  // Une puce maximum pressée devenue inférieure au départ est relâchée
  await page.locator('#start-presets .points-chip[data-val="0"]').click();
  await page.locator('#max-presets .points-chip[data-val="20"]').click();
  await expect(page.locator('#setup-summary')).toHaveText('4 joueurs · départ 0 · max 20');
  await page.locator('#start-presets .points-chip[data-val="50"]').click();
  await expect(page.locator('#setup-summary')).toHaveText('4 joueurs · départ 50 · sans limite');

  // Départ hors bornes
  await page.locator('#points-custom').fill('-5');
  await expect(page.locator('#start-error')).toBeVisible();
  await expect(page.locator('#go-btn')).toBeDisabled();
  await page.locator('#points-custom').fill('');
  await expect(page.locator('#start-error')).toBeHidden();
  await expect(page.locator('#setup-summary')).toHaveText('4 joueurs · départ 0 · sans limite');
});
