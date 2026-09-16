// Tests unitaires : logique pure de js/core, environnement Node (pas de DOM requis).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.js'],
    exclude: ['node_modules/**', 'tests/e2e/**'],
  },
});
