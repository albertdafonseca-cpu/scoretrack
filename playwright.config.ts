// Configuration Playwright — un test e2e de fumée (npm run test:e2e), séparé
// des tests unitaires Vitest. Ouvre `dist/index.html` (build de prod) tel
// quel, en `file://`, comme le fait déjà la vérification visuelle manuelle
// documentée dans CLAUDE.md ; nécessite un `npm run build` préalable.
// Volontairement PAS exécuté par la CI GitHub Actions (voir
// docs/audit/DECISIONS-A.md) : un runner CI n'a pas Chromium préinstallé et
// `playwright install --with-deps` alourdirait sensiblement une CI que la
// mission veut minimale ; à ajouter plus tard si un élément en a besoin.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  use: {
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
