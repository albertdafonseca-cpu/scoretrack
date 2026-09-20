// Accessibilité des écrans d'entrée : axe-core (jeu complet de règles par état, contraste sur les
// 14 thèmes), contraste mesuré sur les pixels réellement rendus, cibles ≥ 44 px, textes ≥ 12 px,
// absence de débordement ET de recouvrement sur quatre conditions d'affichage, navigation clavier,
// isolation de la modale.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import {
  collectErrors,
  obstructedTargets,
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

/** Conditions d'affichage couvertes, dont le texte système à 200 % exigé par D19. */
const CONDITIONS = [
  ['390x844', { width: 390, height: 844 }, 16],
  ['768x1024', { width: 768, height: 1024 }, 16],
  ['320x568', { width: 320, height: 568 }, 16],
  ['390x844 · texte système 200 %', { width: 390, height: 844 }, 32],
];

/** Applique une condition d'affichage : taille de fenêtre et taille de police du système. */
async function applyCondition(page, viewport, fontPx) {
  await page.setViewportSize(viewport);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Page.enable');
  await cdp.send('Page.setFontSizes', { fontSizes: { standard: fontPx, fixed: fontPx } });
}

/** Violations axe de l'écran, toutes gravités (`moderate` compris), jeu de règles complet. */
async function auditScreen(page, include, rules = null) {
  const builder = rules
    ? new AxeBuilder({ page }).withRules(rules)
    : new AxeBuilder({ page }).withTags(TAGS);
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
  await expect(page.locator('#setup-page')).toBeVisible();
  await fn('accueil', '#setup-page');

  // Accueil en erreur (maximum < points de départ)
  await page.locator('#start-presets .points-chip[data-val="40"]').click();
  await page.locator('#max-custom').fill('20');
  await expect(page.locator('#max-error')).toBeVisible();
  await fn('erreur', '#setup-page');
  await page.locator('#max-custom').fill('');
  await page.locator('#start-presets .points-chip[data-val="0"]').click();

  // Bannière de reprise (partie sauvegardée)
  await page.evaluate(() => {
    localStorage.setItem(
      'scoretrack_save',
      JSON.stringify({
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
      }),
    );
  });
  await page.reload();
  await expect(page.locator('#setup-page')).toBeVisible();
  // D17 : l'état est audité, jamais sauté silencieusement.
  await expect(page.locator('#restore-banner')).toBeVisible();
  await fn('bannière', '#setup-page');

  // Page Joueurs, avec des prénoms mémorisés
  await page.evaluate(() =>
    localStorage.setItem('scoretrack_profiles', JSON.stringify({ v: 1, names: ['Alice', 'Bob'] })),
  );
  await page.locator('#names-btn').click();
  await expect(page.locator('#names-page')).toBeVisible();
  await fn('noms', '#names-page');
  await page.getByRole('button', { name: /Retour/ }).click();

  // Réglages
  await page.locator('.logo-gear').click();
  await expect(page.locator('#settings-page')).toBeVisible();
  await fn('réglages', '#settings-page');

  // Modale de confidentialité
  await page.locator('[data-action="show-privacy"]').click();
  await expect(page.locator('#privacy-modal')).toBeVisible();
  await fn('confidentialité', '#privacy-modal');
  await page.keyboard.press('Escape');
  await page.locator('[data-action="back-from-settings"]').click();
}

test('axe-core : jeu de règles complet par état, contraste sur les 14 thèmes, sans filtre', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await openApp(page);
  const themes = await themeIds(page);
  // La liste vient de js/core/constants.js ; le test suit l'ajout d'un thème sans être réécrit.
  expect(themes.length).toBeGreaterThanOrEqual(14);

  const failures = [];
  let audits = 0;
  // Une seule règle dépend du thème : le jeu de règles complet tourne une fois par état, puis
  // seule la règle de contraste est rejouée sur les autres thèmes — sans refaire la navigation,
  // qui est le vrai coût. Même pouvoir de détection, cinq fois moins de temps.
  await forEachState(page, async (state, sel) => {
    audits++;
    const full = await auditScreen(page, sel);
    if (full.length) failures.push({ theme: themes[0], state, violations: full });
    for (const theme of themes.slice(1)) {
      await useTheme(page, theme);
      audits++;
      const v = await auditScreen(page, sel, ['color-contrast']);
      if (v.length) failures.push({ theme, state, violations: v });
    }
    await useTheme(page, themes[0]);
  });
  expect(audits).toBe(themes.length * 6);
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
  const skipped = [];
  let measured = 0;

  for (const [screen, open] of [
    ['accueil', null],
    ['noms', async () => page.locator('#names-btn').click()],
    ['réglages', async () => page.locator('.logo-gear').click()],
  ]) {
    await openApp(page);
    if (open) await open();
    const sel =
      screen === 'noms' ? '#names-page' : screen === 'réglages' ? '#settings-page' : '#setup-page';
    for (const theme of themes) {
      await useTheme(page, theme);
      // La liste est recalculée POUR CHAQUE THÈME : un nœud qu'un seul thème rend indéterminé
      // (halo, dégradé propre à ce thème) doit entrer dans la mesure. Les pastilles de siège sont
      // ajoutées d'office (axe ne les juge pas et leur contraste a déjà régressé une fois).
      const targets = [
        ...new Set([
          ...(await undecidedContrastNodes(page, sel)),
          ...(screen === 'noms'
            ? ['.name-row:first-child .name-avatar', '.name-row:nth-child(4) .name-avatar']
            : []),
        ]),
      ];
      for (const r of await renderedContrast(page, targets)) {
        if (r.ratio === undefined) {
          skipped.push({ theme, screen, ...r });
          continue;
        }
        measured++;
        const min = r.large ? 3 : 4.5;
        if (r.ratio < min) failures.push({ theme, screen, ...r, min });
      }
    }
  }

  // D17 : la mesure doit réellement avoir eu lieu, et le seuil colle au périmètre réel (≈ 300).
  expect(measured).toBeGreaterThanOrEqual(300);
  // Un nœud non mesurable est compté et affiché : rien n'est écarté en silence.
  expect(skipped.length, JSON.stringify(skipped.slice(0, 10), null, 2)).toBeLessThanOrEqual(10);
  expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
});

test('la hiérarchie typographique tient à 100 % comme à 200 % de texte système', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const readSizes = () =>
    page.evaluate(() => {
      const px = (sel) => {
        const el = document.querySelector(sel);
        return el ? parseFloat(getComputedStyle(el).fontSize) : null;
      };
      return {
        appTitle: px('#app-title'),
        sectionLabel: px('#lbl-presets'),
        cta: px('#go-btn'),
        ghost: px('.setup-btn-row .ghost-btn .btn-text'),
      };
    });

  const ordered = (s, name) => {
    // Un titre doit rester plus grand qu'un libellé de bouton : c'est l'intention de D19, que la
    // seule absence de troncature ne garantit pas.
    expect(s.appTitle, `${name} : titre > libellé secondaire`).toBeGreaterThan(s.ghost);
    expect(s.appTitle, `${name} : titre > action principale`).toBeGreaterThan(s.cta);
    expect(s.cta, `${name} : action principale ≥ intitulé de section`).toBeGreaterThanOrEqual(
      s.sectionLabel,
    );
  };

  await applyCondition(page, { width: 390, height: 844 }, 16);
  await openApp(page);
  const base = await readSizes();
  ordered(base, '100 %');

  await applyCondition(page, { width: 390, height: 844 }, 32);
  await page.reload();
  await expect(page.locator('#setup-page')).toBeVisible();
  const doubled = await readSizes();
  ordered(doubled, '200 %');

  // Chaque niveau grandit réellement avec le texte système : un plafond qui figerait les titres
  // inverserait la hiérarchie sans rien tronquer.
  for (const key of Object.keys(base)) {
    expect(doubled[key] / base[key], `${key} suit l'échelle`).toBeGreaterThan(1.5);
  }

  // Et le titre de la page Joueurs reste plus grand que ses boutons d'action.
  await page.locator('#names-btn').click();
  const names = await page.evaluate(() => ({
    title: parseFloat(getComputedStyle(document.querySelector('#names-title')).fontSize),
    action: parseFloat(
      getComputedStyle(document.querySelector('.names-action-btn .btn-text')).fontSize,
    ),
  }));
  expect(names.title).toBeGreaterThan(names.action);
});

test('la coche des cartes de thème contraste sur le fond qu’elle marque, sur tous les thèmes', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openApp(page);
  await page.locator('.logo-gear').click();
  const themes = await themeIds(page);
  const failures = [];
  for (const id of themes) {
    // Sélectionner la carte applique son thème ET affiche sa coche : c'est l'état réel où la
    // coche du thème prévisualisé doit rester lisible (elle empruntait l'accent du thème actif).
    // Le thème « Automatique » est mesuré sous les deux schémas système.
    const schemes = id === 'auto' ? ['light', 'dark'] : ['dark'];
    for (const colorScheme of schemes) {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.locator(`#themes-grid .theme-card[data-theme="${id}"]`).click();
      const sel = `#themes-grid .theme-card[data-theme="${id}"] .theme-check`;
      const [r] = await renderedContrast(page, [sel]);
      if (r.ratio === undefined || r.ratio < 4.5) failures.push({ theme: id, colorScheme, ...r });
    }
  }
  expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
});

test('thème « Automatique » : sous-titre lisible et annoncé, préférence système réellement suivie', async ({
  page,
}) => {
  await openApp(page);
  await page.locator('.logo-gear').click();
  const card = page.locator('#themes-grid .theme-card[data-theme="auto"]');
  await expect(card).toHaveCount(1);
  // Le sous-titre est un texte visible, et il entre dans le nom accessible du bouton radio.
  await expect(card.locator('.theme-card-hint')).toBeVisible();
  await expect(card.locator('.theme-card-hint')).toHaveText(/clair ou sombre/);
  await expect(page.getByRole('radio', { name: /Automatique.*clair ou sombre/ })).toHaveCount(1);
  // La grille reste alignée : toutes les cartes de la même rangée ont la même hauteur.
  const rows = await page.evaluate(() => {
    const byTop = new Map();
    for (const c of document.querySelectorAll('#themes-grid .theme-card')) {
      const r = c.getBoundingClientRect();
      const key = Math.round(r.top);
      byTop.set(key, [...(byTop.get(key) || []), Math.round(r.height)]);
    }
    return [...byTop.values()];
  });
  for (const heights of rows) expect(new Set(heights).size, `rangée ${heights}`).toBe(1);

  // Sélectionner « Automatique » puis émuler chaque schéma : le fond de page doit changer.
  await card.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'auto');
  // Couleurs RÉSOLUES (le fond de page est un dégradé et une propriété personnalisée en
  // `light-dark()` se lit telle quelle) : fond d'un bouton et couleur du titre.
  const paletteUnder = async (colorScheme) => {
    await page.emulateMedia({ colorScheme });
    return page.evaluate(() => ({
      surface: getComputedStyle(document.querySelector('.ghost-btn')).backgroundColor,
      accent: getComputedStyle(document.querySelector('#settings-title')).color,
    }));
  };
  const dark = await paletteUnder('dark');
  const light = await paletteUnder('light');
  expect(dark.surface).not.toBe(light.surface);
  expect(dark.accent).not.toBe(light.accent);
  // Persistance : après rechargement, le réglage tient et le pré-rendu le pose avant main.js.
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'auto');
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('scoretrack_settings')).theme),
  ).toBe('auto');
});

test.describe('conditions d’affichage', () => {
  for (const [name, viewport, fontPx] of CONDITIONS) {
    test(`axe, cibles ≥ 44 px, textes ≥ 12 px, ni débordement ni recouvrement — ${name}`, async ({
      page,
    }) => {
      test.setTimeout(180_000);
      await applyCondition(page, viewport, fontPx);
      await openApp(page);

      const axeFailures = [];
      const smallTargets = [];
      const smallTexts = [];
      const overflows = [];
      const obstructed = [];
      await forEachState(page, async (state, sel) => {
        axeFailures.push(...(await auditScreen(page, sel)).map((v) => ({ state, ...v })));
        smallTargets.push(
          ...(await undersizedTargets(page, sel, 44)).map((t) => ({ state, ...t })),
        );
        smallTexts.push(
          ...(await undersizedTexts(page, sel, MIN_FONT_PX)).map((t) => ({ state, ...t })),
        );
        // WCAG 1.4.10 Reflow : aucun contenu hors du cadre, quel que soit l'élément.
        overflows.push(
          ...(await page.evaluate(
            ({ sel, state }) => {
              const root = document.querySelector(sel);
              const w = document.documentElement.clientWidth;
              return Array.from(root.querySelectorAll('*'))
                .filter((n) => n.offsetParent !== null || n === root)
                .map((n) => ({ n, r: n.getBoundingClientRect() }))
                .filter(({ r }) => r.width > 0 && (r.right > w + 0.5 || r.left < -0.5))
                .map(({ n, r }) => ({
                  state,
                  el: n.id || n.className || n.nodeName,
                  right: Math.round(r.right),
                  clientWidth: w,
                }));
            },
            { sel, state },
          )),
        );
        // WCAG 2.4.11 / 2.5.8 : à quatre positions de défilement, le centre de chaque cible
        // doit lui appartenir — un panneau surplombant ferait échouer ce contrôle.
        for (const ratio of [0, 0.35, 0.7, 1]) {
          await page.evaluate((r) => {
            const max = document.documentElement.scrollHeight - window.innerHeight;
            window.scrollTo(0, Math.max(0, Math.round(max * r)));
          }, ratio);
          obstructed.push(
            ...(await obstructedTargets(page, sel)).map((o) => ({ state, scroll: ratio, ...o })),
          );
        }
        await page.evaluate(() => window.scrollTo(0, 0));
      });

      expect(axeFailures, JSON.stringify(axeFailures, null, 2)).toEqual([]);
      expect(smallTargets, JSON.stringify(smallTargets)).toEqual([]);
      expect(smallTexts, JSON.stringify(smallTexts)).toEqual([]);
      expect(overflows, JSON.stringify(overflows)).toEqual([]);
      expect(obstructed, JSON.stringify(obstructed, null, 2)).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
        'aucun défilement horizontal',
      ).toBe(true);
      await page.screenshot({
        path: test.info().outputPath(`${name.replace(/[^\w]+/g, '-')}.png`),
        fullPage: true,
      });
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

  // Groupe radio « joueurs » : les flèches déplacent le focus ET sélectionnent (APG radiogroup).
  const players = page.locator('#players-grid');
  await expect(players).toHaveAttribute('role', 'radiogroup');
  await players.locator('[tabindex="0"]').focus();
  // Parcours réel : douze flèches doivent atteindre douze puces distinctes et revenir à la première.
  const visited = [];
  for (let i = 0; i < 12; i++) {
    visited.push(await page.evaluate(() => document.activeElement.dataset.val));
    await page.keyboard.press('ArrowRight');
  }
  expect(new Set(visited).size).toBe(12);
  expect(await page.evaluate(() => document.activeElement.dataset.val)).toBe(visited[0]);
  // Le focus sélectionne au passage : le résumé suit la puce active.
  await page.keyboard.press('End');
  await expect(page.locator('#players-grid .player-chip[data-val="12"]')).toBeFocused();
  await expect(page.locator('#setup-summary')).toHaveText('12 joueurs · départ 0 · sans limite');
  await page.screenshot({ path: test.info().outputPath('focus-chip.png') });

  // Interrupteur : Espace bascule aria-checked
  await page.locator('#neg-toggle').focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#neg-toggle')).toHaveAttribute('aria-checked', 'true');

  // Grille des thèmes : une carte par thème déclaré, chacune atteignable aux flèches.
  await page.locator('.logo-gear').click();
  const themes = await themeIds(page);
  const cards = page.locator('#themes-grid .theme-card');
  await expect(cards).toHaveCount(themes.length);
  await page.locator('#themes-grid [tabindex="0"]').focus();
  const seen = new Set();
  for (let i = 0; i < themes.length; i++) {
    seen.add(await page.evaluate(() => document.activeElement.dataset.theme));
    await page.keyboard.press('ArrowRight');
  }
  expect(seen.size).toBe(themes.length);
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
