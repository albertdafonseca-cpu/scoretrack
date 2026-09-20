// Tests de bout en bout : Chromium émulant un iPhone 13 (tactile), serveur statique local.
//
// Deux projets. `mobile-chromium` couvre le fonctionnel (tests/e2e). `perf` couvre les mesures de
// trames et de latence (tests/perf) : elles sont FAUSSÉES par tout voisin qui s'exécute en même
// temps, donc ce projet tourne seul, après les autres, avec un unique ouvrier.
import { defineConfig, devices } from '@playwright/test';

const PORT = 8765;

export default defineConfig({
  testDir: 'tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    locale: 'fr-FR',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'mobile-chromium',
      testDir: 'tests/e2e',
      use: { ...devices['iPhone 13'], browserName: 'chromium', hasTouch: true },
    },
    {
      name: 'perf',
      testDir: 'tests/perf',
      // Gabarit imposé par la grille d'évaluation (390 × 844, DPR 3).
      use: {
        ...devices['iPhone 13'],
        browserName: 'chromium',
        hasTouch: true,
        viewport: { width: 390, height: 844 },
        // L'enregistreur de trace est lui-même un coût, et un coût PROPORTIONNEL à l'activité de la
        // page : il pénalisait la série « cartes » sans toucher le témoin, soit 18 % de durée en
        // trop entièrement imputables à l'instrument. On ne trace pas ce qu'on chronomètre.
        trace: 'off',
        video: 'off',
      },
      fullyParallel: false,
      // `dependencies` garantit que RIEN d'autre ne tourne pendant la mesure : le projet
      // fonctionnel est intégralement terminé avant que la première trame ne soit comptée.
      dependencies: ['mobile-chromium'],
    },
  ],
  webServer: {
    command: `npx http-server -p ${PORT} -s .`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
