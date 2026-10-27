// @ts-check
const { defineConfig, devices } = require('@playwright/test');

// Variante testée : VARIANT=light (par défaut), test, ou pro (page de Test produite depuis src/)
const VARIANT = process.env.VARIANT || 'light';
const PORTS = { light: 4172, test: 4173, pro: 4174 }; // main (dépôt figé) : 4171
const SUITES = { light: 'light', test: 'test', pro: 'pro' }; // e2e/pro : suite de Test adaptée (remplace e2e/test à l'étape 5)
if (!PORTS[VARIANT]) throw new Error(`VARIANT inconnue : ${VARIANT}`);
const PORT = PORTS[VARIANT];
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

module.exports = defineConfig({
  testDir: `./e2e/${SUITES[VARIANT]}`,
  retries: 0,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 390, height: 844 },
    locale: 'fr-FR', // l'app choisit sa langue d'après le navigateur
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        launchOptions: executablePath ? { executablePath } : {},
      },
    },
    // Moteur de Safari (iPhone, iPad, Mac) et Firefox : même taille d'écran que Chromium
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 390, height: 844 } } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 390, height: 844 } } },
  ],
  // Construit la variante puis sert dist/<variante> en statique (comme Vercel)
  webServer: {
    command: `node tools/build.mjs ${VARIANT} && python3 -m http.server ${PORT} --bind 127.0.0.1 --directory dist/${VARIANT}`,
    cwd: '..',
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
