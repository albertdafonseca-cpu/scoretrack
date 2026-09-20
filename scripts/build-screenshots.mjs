// Génère les captures du produit avec Playwright (Chromium, DPR 1) :
//   - celles du manifeste (assets/screenshots/*.png) : accueil et table de jeu, téléphone et tablette ;
//   - celles de la documentation (docs/img/*.png) : prénoms, pavé numérique, récapitulatif, 12 joueurs,
//     thème clair — les vues annoncées dans le README.
// Le rendu est rendu déterministe (polices auto-hébergées attendues, animations désactivées, curseur
// de saisie masqué, service worker bloqué, horloge simulée pour l'heure du récapitulatif) pour que la CI puisse comparer les octets aux fichiers
// versionnés : `node scripts/build-screenshots.mjs --out <dossier>` écrit la même arborescence sous
// <dossier> ; `npm run check:screenshots` échoue si un octet diffère (ADR-19).
// Usage : node scripts/build-screenshots.mjs [--out <dossier>] [--check]   (aucun serveur externe requis)
//   --check : génère dans test-results/screenshots puis compare octet à octet aux fichiers versionnés ;
//             code 1 si une capture diffère ou manque (« régénérez avec `npm run build:screenshots` »).
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from '../tests/e2e/helpers/static-server.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const outIdx = args.indexOf('--out');
const OUT_ROOT = CHECK
  ? join(ROOT, 'test-results', 'screenshots')
  : outIdx >= 0 && args[outIdx + 1]
    ? resolve(args[outIdx + 1])
    : ROOT;
const OUT_MANIFEST = join(OUT_ROOT, 'assets', 'screenshots');
const OUT_DOCS = join(OUT_ROOT, 'docs', 'img');

const NARROW = { width: 390, height: 844 };
const WIDE = { width: 1280, height: 800 };
const NAMES = [
  'Alice',
  'Bruno',
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
/** Appui court = tap ; appui long = pavé numérique (voir tests/e2e/game.spec.js). */
const TAP_MS = 120;
const HOLD_MS = 650;
/** Fenêtre de regroupement des taps + bulle de delta : on attend qu'elles soient refermées. */
const SETTLE_MS = 1900;

const SHOT = { animations: 'disabled', caret: 'hide', type: 'png' };
/** Horloge simulée : le récapitulatif affiche l'heure des actions, qui doit être la même à chaque génération. */
const CLOCK = new Date('2026-09-19T12:00:00');

/** Ouvre l'écran d'accueil dans un contexte neuf et choisit le nombre de joueurs. */
async function openSetup(browser, viewport, isMobile, players) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    isMobile,
    hasTouch: isMobile,
    locale: 'fr-FR',
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  await page.clock.install({ time: CLOCK });
  await page.goto(server.url);
  await page.locator('#splash').waitFor({ state: 'detached' });
  await page.locator('#setup-page').waitFor({ state: 'visible' });
  await page.evaluate(() => document.fonts.ready);
  await page.locator('#players-grid .player-chip', { hasText: new RegExp(`^${players}$`) }).click();
  await page.locator('#start-presets .points-chip[data-val="0"]').click();
  return page;
}

/** Passe à l'écran des prénoms et les remplit. */
async function fillNames(page, count) {
  await page.locator('#names-btn').click();
  const inputs = page.locator('.name-input');
  await inputs.first().waitFor();
  for (let i = 0; i < count; i++) await inputs.nth(i).fill(NAMES[i]);
}

/** Lance la partie et attend que toutes les cartes soient posées. */
async function launch(page, count) {
  await page.getByRole('button', { name: /Lancer/ }).click();
  await page
    .locator('.pcard')
    .nth(count - 1)
    .waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
}

/** Toucher réel (touchStart… touchEnd) via CDP, au centre d'un élément. */
async function touch(page, locator, ms) {
  const b = await locator.boundingBox();
  const point = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await page.waitForTimeout(ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

const half = (page, card, sign) => page.locator('.pcard').nth(card).locator(`.tap-half.${sign}`);

mkdirSync(OUT_MANIFEST, { recursive: true });
mkdirSync(OUT_DOCS, { recursive: true });
const server = await startStaticServer({ root: ROOT });
const browser = await chromium.launch();
const written = [];
/** Attend un rendu stable : polices chargées (y compris celles qu'un thème vient de demander), deux trames. */
async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.fonts.status === 'loaded');
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
}

async function shoot(page, dir, name) {
  const path = join(dir, name);
  await settle(page);
  await page.screenshot({ ...SHOT, path });
  written.push(path);
}

try {
  // ── Manifeste : téléphone, accueil puis table à 4 ──────────────────────────────────
  const phone = await openSetup(browser, NARROW, true, 4);
  await shoot(phone, OUT_MANIFEST, 'setup-390x844.png');
  await fillNames(phone, 4);
  await shoot(phone, OUT_DOCS, 'names-390x844.png');
  await launch(phone, 4);
  await shoot(phone, OUT_MANIFEST, 'game-390x844.png');

  // Quelques points marqués, puis le récapitulatif (classement + journal non vides).
  await touch(phone, half(phone, 0, 'plus'), TAP_MS);
  await touch(phone, half(phone, 0, 'plus'), TAP_MS);
  await touch(phone, half(phone, 1, 'minus'), TAP_MS);
  await phone.waitForTimeout(SETTLE_MS);
  await phone.clock.setFixedTime(CLOCK); // l'heure affichée ne dépend plus du moment de la génération
  await phone.locator('#bar').getByRole('button', { name: /Récap/ }).click();
  await phone.locator('#recap').waitFor({ state: 'visible' });
  await phone.waitForTimeout(200);
  await shoot(phone, OUT_DOCS, 'recap-390x844.png');
  await phone.locator('#recap-close-btn').click();
  await phone.locator('#recap').waitFor({ state: 'hidden' });

  // Appui long : pavé numérique.
  await touch(phone, half(phone, 2, 'plus'), HOLD_MS);
  await phone.locator('#score-modal').waitFor({ state: 'visible' });
  await phone.waitForTimeout(200);
  await shoot(phone, OUT_DOCS, 'keypad-390x844.png');
  await phone.context().close();

  // ── Manifeste : tablette posée à plat, table à 4 ───────────────────────────────────
  const wide = await openSetup(browser, WIDE, false, 4);
  await fillNames(wide, 4);
  await launch(wide, 4);
  await shoot(wide, OUT_MANIFEST, 'game-1280x800.png');
  await wide.context().close();

  // ── Documentation : douze joueurs nommés ───────────────────────────────────────────
  const twelve = await openSetup(browser, NARROW, true, 12);
  await fillNames(twelve, 12);
  await launch(twelve, 12);
  await shoot(twelve, OUT_DOCS, 'game-12-390x844.png');
  await twelve.context().close();

  // ── Documentation : thème clair, choisi par le vrai parcours des réglages ──────────
  const light = await openSetup(browser, NARROW, true, 4);
  await light.locator('[data-action="show-settings"]').click();
  await light.locator('#settings-page').waitFor({ state: 'visible' });
  await light
    .locator('.theme-card', { has: light.locator('.theme-card-name', { hasText: /^Clair$/ }) })
    .click();
  await settle(light);
  await light.locator('[data-action="back-from-settings"]').click();
  await light.locator('#setup-page').waitFor({ state: 'visible' });
  await light.waitForTimeout(200);
  await shoot(light, OUT_DOCS, 'setup-light-390x844.png');
  await light.context().close();

  console.log(`${written.length} captures écrites sous ${OUT_ROOT}`);
} finally {
  await browser.close();
  await server.stop();
}

if (CHECK) {
  const stale = [];
  for (const path of written) {
    const rel = relative(OUT_ROOT, path);
    const committed = join(ROOT, rel);
    if (!existsSync(committed)) stale.push(`${rel} (absente du dépôt)`);
    else if (!readFileSync(committed).equals(readFileSync(path)))
      stale.push(`${rel} (octets différents)`);
  }
  if (stale.length) {
    console.error(`Captures en retard sur l'interface (${stale.length}) :`);
    for (const l of stale) console.error(`  ${l}`);
    console.error('Régénérez-les avec `npm run build:screenshots` et versionnez le résultat.');
    process.exit(1);
  }
  console.log(`${written.length} captures identiques aux fichiers versionnés.`);
}
