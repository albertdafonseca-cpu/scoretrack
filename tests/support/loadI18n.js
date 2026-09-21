// Implémentation réelle du chargement de src/i18n.ts.
//
// Charge d'abord src/game.ts (comme loadGame.js) : src/game.ts et src/i18n.ts
// s'importent mutuellement (game.ts pour `applyLang`/`t`/..., i18n.ts pour
// `settings`/`renderPresets`/...). Sous Vitest, chaque module ES est évalué
// séparément (contrairement au bundle esbuild de production, où tout finit
// dans un seul scope IIFE) : si `src/i18n.ts` est le POINT D'ENTRÉE du graphe
// de test, son propre `import` de `game.ts` déclenche l'exécution immédiate
// de l'IIFE de `game.ts` (`loadSettings()` -> `setCurrentLang()`) avant que la
// ligne `export let currentLang = 'en'` de `i18n.ts` n'ait encore été
// exécutée — `ReferenceError: Cannot access 'currentLang' before
// initialization` (TDZ), repérable seulement à l'exécution des tests, jamais
// au typecheck ni au build. En entrant systématiquement par `game.ts` (comme
// le fait déjà `loadGame.js`), le cycle est parcouru dans l'autre sens et
// `i18n.ts` finit son initialisation avant que quoi que ce soit n'y écrive.
export function loadI18n() {
  return import('../../src/game').then(() => import('../../src/i18n'));
}
