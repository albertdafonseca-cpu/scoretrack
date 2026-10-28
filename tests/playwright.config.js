// @ts-check
const { defineConfig, devices } = require('@playwright/test');
const { generateKeyPairSync } = require('node:crypto');

// Suite testée : VARIANT=gratuit (site principal sans licence, par défaut), pro (même site avec
// licence) ou test (pré-production, avec licence)
const VARIANT = process.env.VARIANT || 'gratuit';
const SUITES = { gratuit: { build: 'pro', port: 4172 }, pro: { build: 'pro', port: 4171 }, test: { build: 'test', port: 4173 } };
if (!SUITES[VARIANT]) throw new Error(`VARIANT inconnue : ${VARIANT}`);
const { build: BUILD, port: PORT } = SUITES[VARIANT];

// Clé de licence jetable : le site de test est construit avec sa clé publique, les tests signent
// leurs licences avec la clé privée. Générée une fois (les workers héritent de l'environnement).
if (!process.env.TEST_LICENCE_PRIVKEY) {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  process.env.TEST_LICENCE_PRIVKEY = privateKey.export({ type: 'pkcs8', format: 'pem' });
  process.env.SCORETRACK_TEST_LICENCE_PUBKEY = jwk.x + '.' + jwk.y;
}
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

module.exports = defineConfig({
  testDir: `./e2e/${VARIANT}`,
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
    command: `node tools/build.mjs ${BUILD} && python3 -m http.server ${PORT} --bind 127.0.0.1 --directory dist/${BUILD}`,
    cwd: '..',
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: false, // clé de licence de test différente à chaque exécution : toujours reconstruire
    timeout: 30_000,
  },
});
