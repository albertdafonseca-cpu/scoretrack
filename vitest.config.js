// Tests unitaires : logique pure de js/core, environnement Node (pas de DOM requis).
// La couverture (V8) est toujours calculée et son seuil bloque `npm run check`.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.js'],
    exclude: ['node_modules/**', 'tests/e2e/**'],
    coverage: {
      enabled: true,
      provider: 'v8',
      include: ['js/core/**/*.js', 'js/store.js'],
      reporter: ['text-summary', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      thresholds: { lines: 95, statements: 95, functions: 95, branches: 90 },
    },
  },
});
