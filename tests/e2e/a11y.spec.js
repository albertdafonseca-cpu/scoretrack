// Accessibilité des écrans d'entrée : axe-core sur les 14 thèmes, trois formats d'écran et tous
// les états (accueil, erreur de saisie, bannière de reprise, noms, réglages, modale), plus la
// navigation clavier, le piège de focus, les cibles ≥ 44 px et le plancher typographique (D10).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import {
  collectErrors,
  openApp,
  renderedContrast,
  themeIds,
  undersizedTargets,
  undersizedTexts,
  useTheme,
} from './helpers.js';

/** Plancher typographique imposé par D10. */
const MIN_FONT_PX = 12;

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];

/**
 * Toutes les violations axe de l'écran (aucun filtre de gravité : `moderate` compte aussi),
 * résumées pour un message d'échec lisible.
 */
async function auditScreen(page, include) {
  const builder = new AxeBuilder({ page }).withTags(TAGS);
  if (include) builder.include(include);
  const { violations } = await builder.analyze();
  return violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 3),
  }));
}

/** Sélecteurs dont axe ne SAIT PAS juger le contraste (halo, dégradé) : à mesurer autrement. */
async function undecidedContrastNodes(page, include) {
  const builder = new AxeBuilder({ page }).withTags(TAGS);
  if (include) builder.include(include);
  const { incomplete } = await builder.analyze();
  const rule = incomplete.find((v) => v.id === 'color-contrast');
  return rule ? rule.nodes.map((n) => n.target.join(' ')) : [];
}

/**
 * Parcourt les six états auditables des écrans de C et appelle `fn(nom, sélecteur)` sur chacun.
 * L'application revient à l'accueil en fin de parcours.
 */
async function forEachState(page, fn) {
  // 1. Accueil à froid
  await expect(page.locator('#setup-page')).toBeVisible();
  await fn('accueil', '#setup-page');

  // 2. Accueil en erreur (maximum < points de départ)
  await page.locator('#start-presets .points-chip[data-val="40"]').click();
  await page.locator('#max-custom').fill('20');
  await expect(page.locator('#max-error')).toBeVisible();
  await fn('erreur', '#setup-page');
  await page.locator('#max-custom').fill('');
  await page.locator('#start-presets .points-chip[data-val="0"]').click();

  // 3. Bannière de reprise (partie sauvegardée)
  await page.evaluate(() => {
    const save = {
      v: 2,
      players: [
        { playerName: 'Alice', score: 12, eliminated: false },
        { playerName: 'Bob', score: 8, eliminated: false },
      ],
      seatOrder: [0, 1],
      log: { entries: [], cursor: 0 },
      numPlayers: 2,
      startPoints: 10,
      maxPoints: null,
      allowNeg: false,
      ts: Date.now(),
    };
    localStorage.setItem('scoretrack_save', JSON.stringify(save));
  });
  await page.reload();
  await expect(page.locator('#setup-page')).toBeVisible();
  // D17 : l'état est audité, jamais sauté silencieusement.
  await expect(page.locator('#restore-banner')).toBeVisible();
  await fn('bannière', '#setup-page');

  // 4. Page Joueurs, avec des prénoms mémorisés
  await page.evaluate(() =>
    localStorage.setItem('scoretrack_profiles', JSON.stringify({ v: 1, names: ['Alice', 'Bob'] })),
  );
  await page.locator('#names-btn').click();
  await expect(page.locator('#names-page')).toBeVisible();
  await fn('noms', '#names-page');
  await page.getByRole('button', { name: /Retour/ }).click();

  // 5. Réglages
  await page.locator('.logo-gear').click();
  await expect(page.locator('#settings-page')).toBeVisible();
  await fn('réglages', '#settings-page');

  // 6. Modale de confidentialité
  await page.locator('[data-action="show-privacy"]').click();
  await expect(page.locator('#privacy-modal')).toBeVisible();
  await fn('confidentialité', '#privacy-modal');
  await page.keyboard.press('Escape');
  await page.locator('[data-action="back-from-settings"]').click();
}

test('axe-core : 0 violation sur les 14 thèmes × 6 états (WCAG AA + bonnes pratiques)', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await openApp(page);
  const themes = await themeIds(page);
  // La liste vient de js/core/constants.js ; le test suit l'ajout d'un thème sans être réécrit.
  expect(themes.length).toBeGreaterThanOrEqual(14);

  const failures = [];
  for (const theme of themes) {
    await openApp(page);
    await useTheme(page, theme);
    await forEachState(page, async (state, sel) => {
      await useTheme(page, theme); // le rechargement de l'état « bannière » réapplique le thème
      const violations = await auditScreen(page, sel);
      if (violations.length) failures.push({ theme, state, violations });
    });
  }
  expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
});

test('contraste des pixels rendus là où axe reste indéterminé, sur tous les thèmes (D16)', async ({
  page,
}) => {
  test.setTimeout(300_000);
  // Rendu figé : sans animation ni police de secours, deux exécutions donnent le même pixel (D17).
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openApp(page);
  const themes = await themeIds(page);
  const failures = [];
  let measured = 0;

  for (const theme of themes) {
    await openApp(page);
    await useTheme(page, theme);
    for (const [screen, open] of [
      ['accueil', null],
      ['noms', async () => page.locator('#names-btn').click()],
      ['réglages', async () => page.locator('.logo-gear').click()],
    ]) {
      if (open) {
        await openApp(page);
        await useTheme(page, theme);
        await open();
      }
      const sel =
        screen === 'noms'
          ? '#names-page'
          : screen === 'réglages'
            ? '#settings-page'
            : '#setup-page';
      // Les pastilles de siège sont mesurées d'office : axe ne les juge pas et leur contraste a
      // déjà régressé une fois.
      const undecided = [
        ...new Set([
          ...(await undecidedContrastNodes(page, sel)),
          ...(screen === 'noms'
            ? ['.name-row:first-child .name-avatar', '.name-row:nth-child(4) .name-avatar']
            : []),
        ]),
      ];
      if (!undecided.length) continue;
      for (const r of await renderedContrast(page, undecided)) {
        if (r.ratio === undefined) continue;
        measured++;
        const min = r.large ? 3 : 4.5;
        if (r.ratio < min) failures.push({ theme, screen, ...r, min });
      }
    }
  }
  // D17 : la mesure doit réellement avoir eu lieu, sinon le test ne prouve rien.
  expect(measured).toBeGreaterThan(100);
  expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
});

test.describe('formats d’écran', () => {
  for (const [name, viewport] of [
    ['390x844', { width: 390, height: 844 }],
    ['768x1024', { width: 768, height: 1024 }],
    ['320x568', { width: 320, height: 568 }],
  ]) {
    test(`axe, cibles ≥ 44 px, textes ≥ 12 px et absence de débordement à ${name}`, async ({
      page,
    }) => {
      test.setTimeout(180_000);
      await page.setViewportSize(viewport);
      await openApp(page);

      const axeFailures = [];
      const smallTargets = [];
      const smallTexts = [];
      const overflows = [];
      await forEachState(page, async (state, sel) => {
        axeFailures.push(...(await auditScreen(page, sel)).map((v) => ({ state, ...v })));
        smallTargets.push(
          ...(await undersizedTargets(page, sel, 44)).map((t) => ({ state, ...t })),
        );
        smallTexts.push(
          ...(await undersizedTexts(page, sel, MIN_FONT_PX)).map((t) => ({ state, ...t })),
        );
        // WCAG 1.4.10 Reflow : aucun contenu hors du cadre, aucun défilement horizontal.
        overflows.push(
          ...(await page.evaluate(
            ({ sel, state }) => {
              const root = document.querySelector(sel);
              const w = document.documentElement.clientWidth;
              return Array.from(root.querySelectorAll('button, input, p, h1, h2'))
                .filter((n) => n.offsetParent !== null)
                .map((n) => ({ n, r: n.getBoundingClientRect() }))
                .filter(({ r }) => r.width > 0 && (r.right > w + 0.5 || r.left < -0.5))
                .map(({ n, r }) => ({
                  state,
                  el: n.id || n.className,
                  right: Math.round(r.right),
                  clientWidth: w,
                }));
            },
            { sel, state },
          )),
        );
      });

      expect(axeFailures, JSON.stringify(axeFailures, null, 2)).toEqual([]);
      expect(smallTargets, JSON.stringify(smallTargets)).toEqual([]);
      expect(smallTexts, JSON.stringify(smallTexts)).toEqual([]);
      expect(overflows, JSON.stringify(overflows)).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
        'aucun défilement horizontal',
      ).toBe(true);
      await page.screenshot({ path: test.info().outputPath(`${name}-noms.png`), fullPage: true });
    });
  }
});

test('clavier : chaque contrôle est atteignable, groupes radio annoncés, Entrée et Espace natifs', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openApp(page);

  // Tab atteint le CTA ; chaque groupe radio compte pour un arrêt (motif APG), les bascules « max »
  // restent toutes dans l'ordre de tabulation.
  const order = [];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const id = await page.evaluate(() => {
      const a = document.activeElement;
      return a.id || `${a.className}:${a.textContent.trim().slice(0, 6)}`;
    });
    order.push(id);
    if (id === 'go-btn') break;
  }
  expect(order[order.length - 1]).toBe('go-btn');
  // Les 6 bascules « points maximum » sont chacune un arrêt de tabulation.
  expect(order.filter((c) => c.startsWith('points-chip')).length).toBeGreaterThanOrEqual(6);
  await page.screenshot({ path: test.info().outputPath('focus-cta.png') });

  // Groupe radio « joueurs » : les flèches déplacent le focus ET sélectionnent (APG radiogroup)
  const players = page.locator('#players-grid');
  await expect(players).toHaveAttribute('role', 'radiogroup');
  await players.locator('[tabindex="0"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#players-grid .player-chip', { hasText: /^5$/ })).toBeFocused();
  await expect(page.locator('#players-grid .player-chip', { hasText: /^5$/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.locator('#setup-summary')).toHaveText('5 joueurs · départ 0 · sans limite');
  await page.keyboard.press('End');
  await expect(page.locator('#players-grid .player-chip', { hasText: /^12$/ })).toBeFocused();
  await expect(page.locator('#setup-summary')).toHaveText('12 joueurs · départ 0 · sans limite');
  await page.screenshot({ path: test.info().outputPath('focus-chip.png') });

  // Chaque puce reste atteignable au clavier à l'intérieur du groupe
  const reachable = await page.evaluate(() => {
    const items = [...document.querySelectorAll('#players-grid .player-chip')];
    return items.every((n) => n.tabIndex === 0 || n.tabIndex === -1) && items.length === 12;
  });
  expect(reachable).toBe(true);

  // Interrupteur : Espace bascule aria-checked
  await page.locator('#neg-toggle').focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#neg-toggle')).toHaveAttribute('aria-checked', 'true');

  // Grille des thèmes : une carte par thème déclaré, chacune atteignable aux flèches jusqu'à la
  // dernière, y compris après l'ajout d'un thème.
  await page.locator('.logo-gear').click();
  const themes = await themeIds(page);
  const cards = page.locator('#themes-grid .theme-card');
  await expect(cards).toHaveCount(themes.length);
  await page.locator('#themes-grid [tabindex="0"]').focus();
  for (let i = 1; i < themes.length; i++) await page.keyboard.press('ArrowRight');
  await expect(cards.last()).toBeFocused();
  await expect(cards.last()).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('html')).toHaveAttribute(
    'data-theme',
    themes[themes.length - 1] === 'cyber' ? '' : themes[themes.length - 1],
  );
  await page.keyboard.press('ArrowRight');
  await expect(cards.first()).toBeFocused();
  await page.locator('[data-action="back-from-settings"]').click();

  // Entrée sur le CTA lance la partie
  await page.locator('#go-btn').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#game-screen')).toBeVisible();
  await expect(page.locator('.pcard')).toHaveCount(12);
  expect(errors).toEqual([]);
});

test('modale : dialogue isolé (fond inerte), Échap ferme et rend le focus', async ({ page }) => {
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

  // Le reste de la page sort de l'arbre d'accessibilité
  const isolated = await page.evaluate(() => {
    const main = document.getElementById('app-main');
    return { inert: main.inert === true, hidden: main.getAttribute('aria-hidden') };
  });
  expect(isolated.inert || isolated.hidden === 'true').toBe(true);
  const snapshot = await page.accessibility.snapshot();
  expect(JSON.stringify(snapshot)).not.toContain('Exporter mes données');

  // Le texte de la politique reste sélectionnable (copie autorisée)
  expect(
    await page.evaluate(
      () => getComputedStyle(document.querySelector('.st-privacy-body')).userSelect,
    ),
  ).toBe('text');

  // Tab cyclique : le focus ne quitte jamais la modale
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() =>
      document.getElementById('privacy-modal').contains(document.activeElement),
    );
    expect(inside, `Tab n°${i + 1}`).toBe(true);
  }

  // Suppression en deux temps, puis focus rendu à un élément stable
  const clear = page.locator('#btn-clear-all');
  await clear.click();
  await expect(clear).toContainText('Confirmer la suppression');
  await expect(modal).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(
    await page.evaluate(() => {
      const main = document.getElementById('app-main');
      return main.inert === true || main.getAttribute('aria-hidden') === 'true';
    }),
  ).toBe(false);

  await page.locator('[data-action="show-privacy"]').click();
  await page.locator('#btn-clear-all').click();
  await page.locator('#btn-clear-all').click();
  await expect(page.locator('#setup-page')).toBeVisible();
  await expect(page.locator('#app-title')).toBeFocused();
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});
