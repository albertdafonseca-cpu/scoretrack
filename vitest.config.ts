// Configuration Vitest : tests unitaires purs (tests/**/*.test.ts), transformés
// directement par esbuild (comme le build de prod), sans passer par tsc — le
// typage reste vérifié séparément par `npm run typecheck`. Environnement DOM
// (jsdom) pour les quelques utilitaires qui touchent le DOM (src/dom.ts).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    restoreMocks: true,
  },
});
