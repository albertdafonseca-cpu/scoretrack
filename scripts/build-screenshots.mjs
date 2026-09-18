// Génère les captures du manifeste (assets/screenshots/*.png, dimensions réelles, DPR 1) avec Playwright :
// deux captures étroites (390×844, téléphone) et une large (1280×800, tablette/bureau).
// Usage : node scripts/build-screenshots.mjs   (Chromium de Playwright requis, aucun serveur externe)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from '../tests/e2e/helpers/static-server.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets', 'screenshots');
const NARROW = { width: 390, height: 844 };
const WIDE = { width: 1280, height: 800 };

/** Prépare une partie à 4 joueurs et renvoie la page, prête à être capturée. */
async function openGame(browser, viewport, isMobile) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    isMobile,
    hasTouch: isMobile,
    locale: 'fr-FR',
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  await page.goto(server.url);
  await page.locator('#splash').waitFor({ state: 'detached' });
  await page.locator('#setup-page').waitFor({ state: 'visible' });
  await page.locator('#players-grid .player-chip', { hasText: /^4$/ }).click();
  await page.locator('#start-presets .points-chip[data-val="0"]').click();
  return page;
}

/** Saisit les prénoms puis lance la partie. */
async function startGame(page) {
  await page.locator('#names-btn').click();
  const inputs = page.locator('.name-input');
  await inputs.first().waitFor();
  const names = ['Alice', 'Bruno', 'Chloé', 'David'];
  for (let i = 0; i < names.length; i++) await inputs.nth(i).fill(names[i]);
  await page.getByRole('button', { name: /Lancer/ }).click();
  await page.locator('.pcard').nth(3).waitFor();
  await page.waitForTimeout(600);
}

mkdirSync(OUT, { recursive: true });
const server = await startStaticServer({ root: ROOT });
const browser = await chromium.launch();
try {
  // Téléphone : écran d'accueil puis table de jeu.
  const phone = await openGame(browser, NARROW, true);
  await phone.screenshot({ path: join(OUT, 'setup-390x844.png') });
  await startGame(phone);
  await phone.screenshot({ path: join(OUT, 'game-390x844.png') });

  // Tablette / bureau : table de jeu au format large.
  const wide = await openGame(browser, WIDE, false);
  await startGame(wide);
  await wide.screenshot({ path: join(OUT, 'game-1280x800.png') });
  console.log(`Captures écrites dans ${OUT}`);
} finally {
  await browser.close();
  await server.stop();
}
