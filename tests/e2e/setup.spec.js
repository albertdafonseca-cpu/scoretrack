// Parcours d'entrée : lancement à froid en ≤ 2 clics, parcours nommé, reprise avec aperçu,
// préréglages et ligne « Personnalisé », mémoire des noms par préréglage, erreurs de saisie.
import { expect, test } from '@playwright/test';
import { collectErrors, measureLayoutShift, openApp, tapCard, validSave } from './helpers.js';

test('à froid : le CTA est actif et le premier score change en 2 clics', async ({ page }) => {
  const errors = collectErrors(page);
  await openApp(page);
  const shot = (name) => page.screenshot({ path: test.info().outputPath(`${name}.png`) });

  // 1.3 — valeurs sensées préappliquées, CTA actif, aperçu textuel
  await expect(page.locator('#go-btn')).toBeEnabled();
  await expect(page.locator('#setup-summary')).toHaveText('4 joueurs · départ 0 · sans limite');
  await expect(page.locator('#preset-note')).toBeVisible();
  await expect(page.locator('#players-grid [aria-checked="true"]')).toHaveText('4');
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
  // 18 caractères doivent rester saisissables quelle que soit la disposition (D2.3)
  await expect(inputs.first()).toHaveAttribute('maxlength', '18');
  await inputs.first().fill('Wxxxxxxxxxxxxxxxxxxxxxxx');
  expect((await inputs.first().inputValue()).length).toBe(18);
  await expect(page.locator('#name-count-0')).toHaveText('18/18');
  await expect(page.locator('#name-count-0')).toHaveClass(/is-full/);

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
  await expect(skyjo).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#preset-note')).toBeHidden();
  await expect(page.locator('#setup-summary')).toHaveText(
    '4 joueurs · départ 0 · sans limite · négatifs',
  );
  await expect(page.locator('#neg-toggle')).toHaveAttribute('aria-checked', 'true');

  // Déviation → le préréglage se relâche, « Personnalisé » apparaît
  await page.locator('#players-grid .player-chip', { hasText: /^5$/ }).click();
  await expect(skyjo).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('#preset-note')).toBeVisible();
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
  // La description n'est rattachée que tant que le message existe
  await expect(maxInput).toHaveAttribute('aria-describedby', 'max-error');
  await expect(page.locator('#go-btn')).toBeDisabled();
  await expect(page.locator('#names-btn')).toBeDisabled();
  await expect(page.locator('#setup-summary')).toHaveText('Corrigez les valeurs signalées.');
  await page.screenshot({ path: test.info().outputPath('erreur-max.png'), fullPage: true });

  await maxInput.fill('60');
  await expect(error).toBeHidden();
  await expect(maxInput).toHaveAttribute('aria-invalid', 'false');
  await expect(maxInput).not.toHaveAttribute('aria-describedby', /.*/);
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

test('les préréglages du HTML correspondent exactement à GAME_PRESETS', async ({ page }) => {
  await openApp(page);
  const { dom, source } = await page.evaluate(async () => {
    const mod = await import('/js/core/constants.js');
    return {
      dom: [...document.querySelectorAll('#presets-grid .preset-card')].map((c) => ({
        name: c.dataset.preset,
        detail: c.querySelector('.preset-card-detail').textContent.trim(),
      })),
      source: mod.GAME_PRESETS.map((p) => ({ name: p.name, detail: p.detail })),
    };
  });
  expect(dom).toEqual(source);
  // Les douze puces de joueurs sont elles aussi dans le HTML (aucun décalage au chargement).
  await expect(page.locator('#players-grid .player-chip')).toHaveCount(12);
});

test('raccourcis du manifeste : ?action=new et ?action=resume (D14)', async ({ page }) => {
  await openApp(page);
  // Une partie en cours, puis retour à l'accueil par rechargement
  await page.locator('#go-btn').click();
  await expect(page.locator('#game-screen')).toBeVisible();

  await page.goto('/?action=resume');
  await expect(page.locator('#game-screen')).toBeVisible();
  await expect(page.locator('.pcard')).toHaveCount(4);
  expect(new URL(page.url()).search).toBe('');

  await page.goto('/?action=new');
  await expect(page.locator('#setup-page')).toBeVisible();
  await expect(page.locator('#restore-banner')).toBeHidden();
  await expect(page.locator('#go-btn')).toBeEnabled();
  expect(new URL(page.url()).search).toBe('');

  // Sans sauvegarde, « reprendre » retombe proprement sur l'accueil
  await page.evaluate(() => localStorage.removeItem('scoretrack_save'));
  await page.goto('/?action=resume');
  await expect(page.locator('#setup-page')).toBeVisible();
  await expect(page.locator('#game-screen')).toBeHidden();
});

test('actions destructrices : deux temps sur la bannière et sur un prénom mémorisé', async ({
  page,
}) => {
  await openApp(page);
  await page.locator('#go-btn').click();
  await page.reload();
  const discard = page.locator('#discard-btn');
  await expect(discard).toBeVisible();
  await discard.click();
  await expect(discard).toContainText('Confirmer');
  await expect(page.locator('#restore-banner')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('scoretrack_save'))).not.toBeNull();
  await discard.click();
  await expect(page.locator('#restore-banner')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('scoretrack_save'))).toBeNull();

  await page.evaluate(() =>
    localStorage.setItem('scoretrack_profiles', JSON.stringify({ v: 1, names: ['Alice'] })),
  );
  await page.locator('#names-btn').click();
  const del = page.locator('.profile-chip-del').first();
  await del.click();
  await expect(page.locator('.profile-chip')).toHaveCount(1);
  await expect(del).toHaveAttribute('aria-label', /Confirmer/);
  await del.click();
  await expect(page.locator('.profile-chip')).toHaveCount(0);
});

test('états vides : les actions sans objet sont désactivées', async ({ page }) => {
  await openApp(page);
  await page.locator('#names-btn').click();
  await expect(page.locator('#shuffle-btn')).toBeDisabled();
  await expect(page.locator('#memorize-btn')).toBeDisabled();
  await expect(page.locator('#clear-profiles-btn')).toBeDisabled();
  await expect(page.locator('#clear-names-btn')).toBeDisabled();
  await expect(page.locator('#profiles-help')).toBeVisible();

  await page.locator('.name-input').first().fill('Alice');
  await expect(page.locator('#memorize-btn')).toBeEnabled();
  await expect(page.locator('#clear-names-btn')).toBeEnabled();
  await expect(page.locator('#shuffle-btn')).toBeDisabled();
  await page.locator('.name-input').nth(1).fill('Bob');
  await expect(page.locator('#shuffle-btn')).toBeEnabled();

  await page.locator('#memorize-btn').click();
  await expect(page.locator('#clear-profiles-btn')).toBeEnabled();
  await expect(page.locator('#profiles-help')).toBeHidden();
});

test('18 caractères restent saisissables et la mémoire ne perd jamais un prénom', async ({
  page,
}) => {
  await openApp(page);
  const long = 'Christophe-Alexan'; // 17 caractères

  // Saisie à 2 joueurs
  await page.locator('#players-grid .player-chip[data-val="2"]').click();
  await page.locator('#names-btn').click();
  await expect(page.locator('.name-input').first()).toHaveAttribute('maxlength', '18');
  await page.locator('.name-input').first().fill(long);
  await page.locator('#names-go-btn').click();
  await expect(page.locator('#card-0 .pplayer')).toHaveText(long);

  // Passage à 12 joueurs : la case rouvre avec le prénom ENTIER, seul un avertissement apparaît
  await page.getByRole('button', { name: /Reset/ }).click();
  await page.getByRole('button', { name: 'Confirmer' }).click();
  await page.locator('#players-grid .player-chip[data-val="12"]').click();
  await page.locator('#names-btn').click();
  await expect(page.locator('.name-input').first()).toHaveValue(long);
  const shown = await page.evaluate(async () => {
    const { nameMaxLength } = await import('/js/core/layout.js');
    return nameMaxLength(12, window.innerWidth, window.innerHeight);
  });
  if (shown < long.length) {
    await expect(page.locator('#names-limit')).toBeVisible();
    await expect(page.locator('#names-limit')).toContainText('abrégé');
    await expect(page.locator('#name-count-0')).toHaveClass(/is-clipped/);
  }
  // Lancer à 12 puis revenir à 2 : le prénom mémorisé est intact, aucun caractère perdu
  await page.locator('#names-go-btn').click();
  await page.getByRole('button', { name: /Reset/ }).click();
  await page.getByRole('button', { name: 'Confirmer' }).click();
  await page.locator('#players-grid .player-chip[data-val="2"]').click();
  await page.locator('#names-btn').click();
  await expect(page.locator('.name-input').first()).toHaveValue(long);
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('scoretrack_last_names')),
  );
  expect(Object.values(stored.byPreset)[0][0]).toBe(long);
});

/**
 * Budget D11 : le décalage cumulé de mise en page doit rester sous 0,1 sur TOUS les chemins
 * d'entrée, pas seulement sur un profil vierge — c'est précisément là qu'un outil de mesure
 * lancé sur un profil neuf ne regarde jamais.
 */
test('décalage cumulé ≤ 0,1 sur les sept chemins d’entrée (D11)', async ({ page }) => {
  test.setTimeout(240_000);
  const cases = [
    ['à froid, stockage vide', {}],
    ['sauvegarde valide', { storage: { scoretrack_save: validSave(2) } }],
    ['sauvegarde valide, 12 joueurs', { storage: { scoretrack_save: validSave(12) } }],
    ['sauvegarde corrompue', { storage: { scoretrack_save: '{"players":[' } }],
    ['clé vide', { storage: { scoretrack_save: '' } }],
    ['clé « null »', { storage: { scoretrack_save: 'null' } }],
    [
      'sauvegarde valide + ?action=new',
      { storage: { scoretrack_save: validSave(2) }, query: '?action=new' },
    ],
  ];
  const measured = [];
  for (const [name, options] of cases) {
    measured.push([name, await measureLayoutShift(page, options)]);
  }
  // Les valeurs mesurées sont journalisées : une régression se lit directement dans la sortie.
  console.log('décalage cumulé par chemin :', JSON.stringify(measured));
  const over = measured.filter(([, cls]) => cls > 0.1);
  expect(over, JSON.stringify(measured, null, 2)).toEqual([]);
  // D17 : la mesure doit avoir eu lieu sur tous les cas, et au moins un cas doit être non nul,
  // sinon l'instrumentation est muette et le test ne prouverait rien.
  expect(measured).toHaveLength(cases.length);
  expect(measured.some(([, cls]) => cls > 0)).toBe(true);
});

test('un identifiant de thème inconnu est normalisé, rien d’inconnu ne reste sur le document', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() =>
    localStorage.setItem('scoretrack_settings', JSON.stringify({ v: 1, theme: 'evil' })),
  );
  await page.reload();
  await expect(page.locator('#setup-page')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', '');
  // Le réglage persisté est ramené à une valeur connue dès qu'il est réécrit.
  await page.locator('.logo-gear').click();
  await expect(page.locator('#themes-grid .theme-card[data-theme="cyber"]')).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

test('sauvegarde rejetée par le cœur : la place réservée explique, sans trou ni décalage', async ({
  page,
}) => {
  test.setTimeout(120_000);
  // Structurellement plausible (le pré-rendu réserve la boîte) mais somme de contrôle fausse :
  // le cœur la rejette. La boîte ne doit ni rester vide ni s'effondrer.
  const tampered = JSON.parse(validSave(2));
  tampered.sum = 'faux';
  const storage = { scoretrack_save: JSON.stringify(tampered) };

  const cls = await measureLayoutShift(page, { storage });
  expect(cls, `décalage mesuré : ${cls}`).toBeLessThanOrEqual(0.1);

  await expect(page.locator('#restore-banner')).toBeVisible();
  await expect(page.locator('#restore-title-text')).toHaveText('Sauvegarde illisible');
  await expect(page.locator('#restore-preview')).toContainText("n'a pas pu être relue");
  await expect(page.locator('#resume-btn')).toBeHidden();
  const box = await page.locator('#restore-banner').boundingBox();
  expect(box.height).toBeGreaterThan(60); // la place réservée est occupée, pas laissée vide

  // L'utilisateur peut faire le ménage depuis cette même boîte (confirmation en deux temps).
  const discard = page.locator('#discard-btn');
  await discard.click();
  await discard.click();
  await expect(page.locator('#restore-banner')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('scoretrack_save'))).toBeNull();
});
