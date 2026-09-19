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
  // Hiérarchie typographique : au plus deux familles par écran, et aucun texte sous le plancher
  // de 12 px fixé par D10 — le même seuil que celui gardé par tests/e2e/a11y.spec.js.
  {
    for (const r of report) {
      expect(
        r.families.length,
        `${r.theme}/${r.screen} : ${r.families.join(', ')}`,
      ).toBeLessThanOrEqual(2);
      if (r.minFont)
        expect(r.minFont, `${r.theme}/${r.screen} : police < 12 px`).toBeGreaterThanOrEqual(12);
    }
  }
});

test("taille de police système à 200 % : rien n'est tronqué ni rétréci (D19)", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await blockExternal(page);

  /** Relève, sur l'écran courant : débordement horizontal, textes coupés, cibles sous 44 px. */
  const audit = (screen) =>
    page.evaluate((screenName) => {
      const doc = document.documentElement;
      const clipped = [];
      const small = {};
      for (const el of document.querySelectorAll('body *')) {
        if (!el.checkVisibility?.()) continue;
        const cs = getComputedStyle(el);
        // Les libellés réservés aux lecteurs d'écran sont découpés exprès : ce n'est pas un défaut.
        if (cs.clipPath !== 'none' || cs.clip !== 'auto') continue;
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (own && cs.overflow !== 'visible') {
          const hidden =
            el.scrollWidth - el.clientWidth > 1 || el.scrollHeight - el.clientHeight > 1;
          const scrollable = /auto|scroll/.test(cs.overflowX + cs.overflowY);
          const ellipsis = cs.textOverflow === 'ellipsis';
          if (hidden && !scrollable && !ellipsis) {
            clipped.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`);
          }
        }
        if (el.matches('button, [role="button"], a[href], input, select') && !el.disabled) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && (r.width < 44 || r.height < 44)) {
            const key = `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`;
            small[key] = `${Math.round(r.width)}×${Math.round(r.height)}`;
          }
        }
      }
      return {
        screen: screenName,
        base: getComputedStyle(doc).fontSize,
        overflow: doc.scrollWidth - doc.clientWidth,
        clipped,
        small,
      };
    }, screen);

  /** Parcourt les trois écrans et relève tout, à la base de police demandée. */
  const sweep = async () => {
    await openApp(page);
    const out = [await audit('setup')];
    await page.locator('[data-action="show-settings"]').first().click();
    await page.waitForTimeout(200);
    out.push(await audit('réglages'));
    await page.locator('[data-action="back-from-settings"]').first().click();
    await startGame(page, 4);
    out.push(await audit('jeu 4 joueurs'));
    const playable = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.pcard')];
      const scores = [...document.querySelectorAll('.score')];
      return {
        cards: cards.length,
        minCard: Math.min(
          ...cards.map((c) =>
            Math.min(c.getBoundingClientRect().width, c.getBoundingClientRect().height),
          ),
        ),
        scoresVisibles: scores.filter((sc) => sc.checkVisibility?.() && sc.textContent.trim())
          .length,
        minScorePx: Math.min(...scores.map((sc) => parseFloat(getComputedStyle(sc).fontSize))),
        minTextPx: Math.min(
          ...[...document.querySelectorAll('body *')]
            .filter(
              (el) =>
                el.checkVisibility?.() &&
                [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()),
            )
            .map((el) => parseFloat(getComputedStyle(el).fontSize)),
        ),
      };
    });
    return { out, playable };
  };

  const ref = await sweep();
  // Le réglage « taille du texte » du système agit sur la taille de base du document. On le
  // reproduit en portant la base de 16 à 32 px dès le premier rendu : c'est exactement ce que
  // voit une feuille de style, et c'est ce que les jetons --fs-* en rem doivent suivre.
  await page.addInitScript(() => {
    const apply = () => {
      const st = document.createElement('style');
      st.textContent = 'html { font-size: 32px; }';
      document.head.append(st);
    };
    if (document.head) apply();
    else document.addEventListener('DOMContentLoaded', apply, { once: true });
  });
  const big = await sweep();
  await page.screenshot({ path: join(OUT, 'zoom-200-jeu.png') });
  await testInfo.attach('mesures-100-vs-200-pourcent', {
    body: JSON.stringify({ base16: ref, base32: big }, null, 2),
    contentType: 'application/json',
  });

  // 1. L'échelle suit réellement le réglage : sans cela, agrandir le texte du système ne fait rien.
  expect(big.out[0].base).toBe('32px');
  expect(big.playable.minTextPx).toBeGreaterThan(ref.playable.minTextPx);
  expect(ref.playable.minTextPx).toBeGreaterThanOrEqual(12);

  // 2. À 200 %, rien ne déborde, rien n'est coupé, et la partie reste jouable.
  for (const r of big.out) {
    expect(r.overflow, `${r.screen} : débordement horizontal à 200 %`).toBeLessThanOrEqual(1);
    expect(r.clipped, `${r.screen} : texte coupé à 200 %`).toEqual([]);
  }
  expect(big.playable.cards).toBe(4);
  expect(big.playable.scoresVisibles).toBe(4);
  expect(big.playable.minCard).toBeGreaterThanOrEqual(44);

  // 3. Agrandir le texte ne doit RÉTRÉCIR aucune cible ni en faire apparaître de nouvelles sous
  //    44 px. La taille absolue des cibles, elle, est vérifiée par tests/e2e/a11y.spec.js (C) :
  //    les deux relevés sont joints à ce test pour que l'écart soit lisible sans le rejouer.
  for (const [i, r] of big.out.entries()) {
    const before = ref.out[i].small;
    for (const [sel, size] of Object.entries(r.small)) {
      expect(
        before,
        `${r.screen} : ${sel} passe sous 44 px seulement à 200 % (${size})`,
        // Clé passée en tableau : elle contient un point, qui serait sinon lu comme un chemin.
      ).toHaveProperty([sel]);
    }
  }
});
