// @ts-check
const { defineConfig, devices } = require('@playwright/test');

const PORT = 4172; // port propre à ce dépôt (main : 4171, test : 4173)
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

module.exports = defineConfig({
  testDir: './e2e',
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
  // Sert la racine du dépôt en statique (comme Vercel)
  webServer: {
    command: `python3 -m http.server ${PORT} --bind 127.0.0.1`,
    cwd: '..',
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
