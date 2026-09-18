// Système visuel : zéro requête externe, polices auto-hébergées effectivement chargées,
// aucun emoji dans le DOM rendu, captures des 14 thèmes (setup + jeu à 4 joueurs).
// Sortie des captures : $VISUAL_OUT (défaut test-results/visual).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const OUT = process.env.VISUAL_OUT || 'test-results/visual';
const THEME_IDS = [
  'cyber',
  'dark',
  'neon-pink',
  'arcade',
  'nature',
  'sunset',
  'ocean',
  'gold',
  'sobre',
  'mono',
  'light',
  'mono-light',
  'ldm',
  'ldm-day',
  // Thème « auto » : suit la préférence claire/sombre du système (capturé ici en sombre).
  'auto',
];
const EMOJI = new RegExp('\\p{Extended_Pictographic}|\\uFE0F|\\u200D', 'u');

/** Bloque tout hôte autre que localhost et journalise les tentatives. */
async function blockExternal(page) {
  const blocked = [];
  await page.route('**/*', (route) => {
    const host = new URL(route.request().url()).hostname;
    if (host === 'localhost' || host === '127.0.0.1') return route.continue();
    blocked.push(route.request().url());
    return route.abort();
  });
  return blocked;
}

async function openApp(page) {
  await page.goto('/');
  await expect(page.locator('#splash')).toHaveCount(0);
  await expect(page.locator('#setup-page')).toBeVisible();
}

/** Lance une partie à `n` joueurs en acceptant les deux variantes du parcours (démarrage rapide ou écran des noms). */
async function startGame(page, n) {
  await page.locator(`#players-grid .player-chip[data-val="${n}"]`).first().click();
  await page.locator('#start-presets [data-val="40"]').click();
  const namesBtn = page.locator('#names-btn');
  if (await namesBtn.count()) await namesBtn.click();
  else await page.locator('#go-btn').click();
  await page.waitForSelector('.name-input, .pcard');
  const inputs = page.locator('.name-input');
  const count = await inputs.count();
  if (count) {
    const names = [
      'Alice',
      'Bob',
      'Chloé',
      'David',
      'Émile',
      'Fatou',
      'Gaspard',
      'Hana',
      'Iris',
      'Jules',
      'Karim',
      'Léa',
    ];
    for (let i = 0; i < count; i++) await inputs.nth(i).fill(names[i]);
    await page.locator('[data-action="start-game"]').first().click();
  }
  await expect(page.locator('.pcard')).toHaveCount(n);
  await page.waitForTimeout(300);
}

const setTheme = (page, id) =>
  page.evaluate(
    (t) => document.documentElement.setAttribute('data-theme', t === 'cyber' ? '' : t),
    id,
  );

/** Familles de polices réellement utilisées par les éléments visibles (première famille de la pile). */
const usedFamilies = () =>
  [...document.querySelectorAll('body *')]
    .filter(
      (el) =>
        el.checkVisibility?.() &&
        [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()),
    )
    .map((el) => getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim())
    .filter((f, i, a) => a.indexOf(f) === i);

test('aucune requête externe et aucune ressource hors localhost', async ({ page }) => {
  const blocked = await blockExternal(page);
  await openApp(page);
  await startGame(page, 4);
  const hosts = await page.evaluate(() => [
    ...new Set(performance.getEntriesByType('resource').map((r) => new URL(r.name).hostname)),
  ]);
  expect(blocked).toEqual([]);
  expect(hosts.every((h) => h === 'localhost' || h === '127.0.0.1')).toBe(true);
});

test('les polices auto-hébergées sont chargées pour chaque thème (document.fonts)', async ({
  page,
}) => {
  await blockExternal(page);
  await openApp(page);
  for (const id of THEME_IDS) {
    await setTheme(page, id);
    const result = await page.evaluate(async () => {
      await document.fonts.ready;
      // Seuls les éléments qui PEIGNENT un glyphe comptent : un conteneur sans nœud texte propre
      // hérite d'une famille qu'aucun caractère n'utilise (faux positif « Arial »).
      const painters = [...document.querySelectorAll('body *')].filter(
        (el) =>
          el.checkVisibility?.() &&
          [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()),
      );
      const faces = [...document.fonts];
      const seen = new Map();
      for (const el of painters) {
        const f = getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim();
        if (!seen.has(f)) {
          seen.set(f, `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`);
        }
      }
      return [...seen].map(([family, sel]) => ({
        family,
        sel,
        check: document.fonts.check(`16px "${family}"`),
        loaded: faces.some(
          (face) => face.family.replace(/["']/g, '') === family && face.status === 'loaded',
        ),
        declared: faces.some((face) => face.family.replace(/["']/g, '') === family),
      }));
    });
    for (const r of result) {
      expect(
        r.declared,
        `${id} : « ${r.family} » n'est pas une police auto-hébergée de css/fonts.css (élément ${r.sel})`,
      ).toBe(true);
      expect(r.check && r.loaded, `${id} : ${r.family} non chargée`).toBe(true);
    }
  }
});

test('aucun emoji dans le DOM rendu, toutes les icônes sont des SVG', async ({ page }) => {
  await blockExternal(page);
  await openApp(page);
  const check = async (screen) => {
    const { text, spans, svgs } = await page.evaluate(() => ({
      text: document.body.textContent,
      spans: document.querySelectorAll('span.icon[data-icon]').length,
      svgs: document.querySelectorAll('svg.icon[data-icon]').length,
    }));
    const found = [...new Set([...text].filter((c) => EMOJI.test(c)))];
    expect(found, `${screen} : emoji dans le DOM rendu`).toEqual([]);
    expect(spans, `${screen} : span.icon non hydraté`).toBe(0);
    expect(svgs).toBeGreaterThan(0);
  };
  await check('setup');
  await page.locator('[data-action="show-settings"]').first().click();
  await check('réglages');
  await page.locator('[data-action="back-from-settings"]').first().click();
  await startGame(page, 4);
  await check('jeu');
  await page.locator('#bar [data-action="show-recap"]').click();
  await check('récap');
});

test('captures des 14 thèmes : écran de setup et écran de jeu à 4 joueurs', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  mkdirSync(OUT, { recursive: true });
  await blockExternal(page);
  await openApp(page);
  const report = [];
  for (const id of THEME_IDS) {
    await setTheme(page, id);
    await page.waitForTimeout(120);
    await page.screenshot({ path: join(OUT, `${id}-setup.png`) });
    const setupInfo = await page.evaluate(() => {
      const sizes = [...document.querySelectorAll('body *')]
        .filter(
          (el) =>
            el.checkVisibility?.() &&
            [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()),
        )
        .map((el) => parseFloat(getComputedStyle(el).fontSize));
      return {
        minFont: Math.min(...sizes),
        distinct: new Set(sizes.map((s) => Math.round(s))).size,
      };
    });
    report.push({
      theme: id,
      screen: 'setup',
      families: await page.evaluate(usedFamilies),
      ...setupInfo,
    });
  }
  await startGame(page, 4);
  for (const id of THEME_IDS) {
    await setTheme(page, id);
    await page.waitForTimeout(120);
    await page.screenshot({ path: join(OUT, `${id}-game.png`) });
    report.push({ theme: id, screen: 'jeu', families: await page.evaluate(usedFamilies) });
  }
  await testInfo.attach('typographie-par-theme', {
    body: JSON.stringify(report, null, 2),
    contentType: 'application/json',
  });
  // Mesures informatives (les feuilles setup/game/modals appartiennent à d'autres éléments) :
  // le mode strict impose ≤ 2 familles et ≥ 11 px sur chaque écran.
  {
    for (const r of report) {
      expect(
        r.families.length,
        `${r.theme}/${r.screen} : ${r.families.join(', ')}`,
      ).toBeLessThanOrEqual(2);
      if (r.minFont)
        expect(r.minFont, `${r.theme}/${r.screen} : police < 11 px`).toBeGreaterThanOrEqual(11);
    }
  }
});
