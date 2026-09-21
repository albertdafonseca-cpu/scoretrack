// Implémentation réelle du chargement de src/game.ts — volontairement en .js
// et non .ts (voir loadGame.d.ts pour la raison) : tsc ne la voit jamais
// (tsconfig.test.json n'inclut que **/*.ts), mais Vitest (esbuild) l'exécute
// normalement, exactement comme n'importe quel autre import de test.
export function loadGame() {
  return import('../../src/game');
}
