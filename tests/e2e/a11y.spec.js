// Accessibilité des écrans d'entrée : axe-core (0 violation serious/critical), clavier complet,
// piège de focus de la modale, cibles ≥ 44 px, textes ≥ 11 px.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { collectErrors, openApp, undersizedTargets, undersizedTexts } from './helpers.js';

const SCREENS = ['#setup-page', '#names-page', '#settings-page', '#privacy-modal'];

/** Violations axe de gravité serious/critical, résumées pour un message d'échec lisible. */
async function seriousViolations(page, include) {
  const builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  if (include) builder.include(include);
  const { violations } = await builder.analyze();
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 5),
    }));
}

/** Affiche chaque écran C tour à tour et appelle `fn(selector)`. */
async function forEachScreen(page, fn) {
  await fn('#setup-page');
  await page.locator('#names-btn').click();
  await expect(page.locator('#names-page')).toBeVisible();
  await fn('#names-page');
  await page.getByRole('button', { name: /Retour/ }).click();
  await page.locator('.logo-gear').click();
  await expect(page.locator('#settings-page')).toBeVisible();
  await fn('#settings-page');
  await page.locator('[data-action="show-privacy"]').click();
  await expect(page.locator('#privacy-modal')).toBeVisible();
  await fn('#privacy-modal');
  await page.keyboard.press('Escape');
}

test('axe-core : aucune violation serious/critical sur setup, noms, réglages, confidentialité', async ({
  page,
}) => {
  await openApp(page);
  // Quelques profils mémorisés pour auditer aussi les puces de profil
  await page.evaluate(() =>
    localStorage.setItem('scoretrack_profiles', JSON.stringify({ v: 1, names: ['Alice', 'Bob'] })),
  );
  const results = {};
  await forEachScreen(page, async (sel) => {
    results[sel] = await seriousViolations(page, sel === '#privacy-modal' ? sel : undefined);
  });
  for (const sel of SCREENS) expect(results[sel], sel).toEqual([]);
});

test('clavier : Tab jusqu’au lancement, flèches dans les puces, Entrée/Espace natifs', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openApp(page);
  // Tab jusqu'au CTA (ordre logique : réglages → préréglages → puces → champs → interrupteur → CTA)
  const order = [];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const id = await page.evaluate(
      () => document.activeElement.id || document.activeElement.className,
    );
    order.push(id);
    if (id === 'go-btn') break;
  }
  expect(order[order.length - 1]).toBe('go-btn');
  // Un seul arrêt par groupe de puces (tabindex tournant)
  expect(order.filter((c) => c === 'player-chip on').length).toBeLessThanOrEqual(1);
  await page.screenshot({ path: test.info().outputPath('focus-cta.png') });

  // Flèches dans le groupe « joueurs » puis Espace pour presser
  await page.locator('#players-grid [tabindex="0"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#players-grid .player-chip', { hasText: /^5$/ })).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.locator('#players-grid .player-chip', { hasText: /^12$/ })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.locator('#setup-summary')).toHaveText('12 joueurs · départ 0 · sans limite');
  await page.screenshot({ path: test.info().outputPath('focus-chip.png') });

  // Interrupteur : Espace bascule aria-checked
  await page.locator('#neg-toggle').focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#neg-toggle')).toHaveAttribute('aria-checked', 'true');

  // Entrée sur le CTA lance la partie
  await page.locator('#go-btn').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#game-screen')).toBeVisible();
  await expect(page.locator('.pcard')).toHaveCount(12);
  expect(errors).toEqual([]);
});

test('modale confidentialité : rôle dialog, piège de focus, Échap ferme et rend le focus', async ({
  page,
}) => {
  await openApp(page);
  await page.locator('.logo-gear').click();
  const trigger = page.locator('[data-action="show-privacy"]');
  await trigger.focus();
  await page.keyboard.press('Enter');
  const modal = page.locator('#privacy-modal');
  await expect(modal).toBeVisible();
  await expect(modal).toHaveAttribute('role', 'dialog');
  await expect(modal).toHaveAttribute('aria-modal', 'true');
  await expect(page.locator('#privacy-title')).toBeFocused();

  // Tab cyclique : le focus ne quitte jamais la modale
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() =>
      document.getElementById('privacy-modal').contains(document.activeElement),
    );
    expect(inside, `Tab n°${i + 1}`).toBe(true);
  }
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  expect(
    await page.evaluate(() =>
      document.getElementById('privacy-modal').contains(document.activeElement),
    ),
  ).toBe(true);

  // Suppression en deux temps : le premier appui arme seulement
  const clear = page.locator('#btn-clear-all');
  await clear.click();
  await expect(clear).toContainText('Confirmer la suppression');
  await expect(modal).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.locator('#settings-page')).toBeVisible();
});

test('cibles ≥ 44×44 px et textes ≥ 11 px sur les quatre écrans', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() =>
    localStorage.setItem('scoretrack_profiles', JSON.stringify({ v: 1, names: ['Alice', 'Bob'] })),
  );
  const targets = {};
  const texts = {};
  await forEachScreen(page, async (sel) => {
    targets[sel] = await undersizedTargets(page, sel, 44);
    texts[sel] = await undersizedTexts(page, sel, 11);
  });
  for (const sel of SCREENS) {
    expect(targets[sel], `cibles < 44 px dans ${sel}`).toEqual([]);
    expect(texts[sel], `textes < 11 px dans ${sel}`).toEqual([]);
  }
});

test('bannière de reprise : région nommée, cibles ≥ 44 px, thèmes en boutons pressés', async ({
  page,
}) => {
  await openApp(page);
  await page.locator('#go-btn').click();
  await page.reload();
  await expect(page.locator('#restore-banner')).toBeVisible();
  await expect(page.locator('#restore-banner')).toHaveAttribute('aria-labelledby', 'restore-title');
  expect(await undersizedTargets(page, '#restore-banner', 44)).toEqual([]);
  expect(await seriousViolations(page, '#restore-banner')).toEqual([]);

  await page.locator('.logo-gear').click();
  const cards = page.locator('#themes-grid .theme-card');
  await expect(cards).toHaveCount(14);
  await expect(cards.first()).toHaveAttribute('aria-pressed', 'true');
  await cards.nth(10).focus();
  await page.keyboard.press('Enter');
  await expect(cards.nth(10)).toHaveAttribute('aria-pressed', 'true');
  await expect(cards.first()).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await seriousViolations(page, '#settings-page')).toEqual([]);
});
