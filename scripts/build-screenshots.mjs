// Génère les captures du manifeste (assets/screenshots/*.png, 390×844 réels, DPR 1) avec Playwright.
// Usage : node scripts/build-screenshots.mjs   (Chromium de Playwright requis, aucun serveur externe)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from '../tests/e2e/helpers/static-server.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets', 'screenshots');
const VIEWPORT = { width: 390, height: 844 };

mkdirSync(OUT, { recursive: true });
const server = await startStaticServer({ root: ROOT });
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    locale: 'fr-FR',
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  await page.goto(server.url);
  await page.locator('#splash').waitFor({ state: 'detached' });
  await page.locator('#setup-page').waitFor({ state: 'visible' });
  await page.locator('#players-grid .player-chip', { hasText: /^4$/ }).click();
  await page.locator('#start-presets .points-chip[data-val="0"]').click();
  await page.screenshot({ path: join(OUT, 'setup-390x844.png') });

  await page.locator('#names-btn').click();
  const inputs = page.locator('.name-input');
  await inputs.first().waitFor();
  const names = ['Alice', 'Bruno', 'Chloé', 'David'];
  for (let i = 0; i < names.length; i++) await inputs.nth(i).fill(names[i]);
  await page.getByRole('button', { name: /Lancer/ }).click();
  await page.locator('.pcard').nth(3).waitFor();
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, 'game-390x844.png') });
  console.log(`Captures écrites dans ${OUT}`);
} finally {
  await browser.close();
  await server.stop();
}
