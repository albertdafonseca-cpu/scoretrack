// Implémentation réelle du chargement de src/recap-pdf.ts — même raison
// qu'un fichier .js séparé (pas .ts) que tests/support/loadGame.js : voir
// loadRecapPdf.d.ts pour le détail exact du conflit de types évité
// (tsconfig.test.json, `setTimeout` DOM vs Node, hérité transitivement dès
// que `src/game.ts`/`src/i18n.ts` sont importés par `src/recap-pdf.ts`).
export function loadRecapPdf() {
  return import('../../src/recap-pdf');
}
