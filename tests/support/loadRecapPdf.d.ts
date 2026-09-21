// Déclaration typée mais DÉCOUPLÉE de `src/recap-pdf.ts`, même principe et
// même raison que `tests/support/loadGame.d.ts` (voir ce fichier pour le
// détail complet) : `src/recap-pdf.ts` importe `src/game.ts`, qui importe
// `src/i18n.ts`, lequel déclenche sous `tsconfig.test.json` (qui ajoute
// `"types":["node"]` pour les besoins d'`e2e/`) le conflit de types
// préexistant `number`/`NodeJS.Timeout` documenté dans
// docs/audit/DECISIONS-B.md §4. Un simple `import type` depuis
// `../../src/recap-pdf` forcerait `tsc -p tsconfig.test.json` à
// type-vérifier toute la chaîne transitive et échouerait pour cette raison
// sans rapport avec ce test. `loadRecapPdf.js` (implémentation réelle,
// `.js`, hors du filtre `**/*.ts` de `tsconfig.test.json`) fait le vrai
// `import()`, exécuté normalement par Vitest/esbuild au runtime.
//
// Sous-ensemble minimal utilisé par tests/recap-pdf.icons.test.ts (élément
// H, round 2 — docs/audit/H-critique-round1.md, P1-1).
export type StatusIconKind = 'trophy' | 'skull' | null;

export interface RecapPdfTestFacade {
  exportRecapPDF(): void;
  statusIconKind(p: { winner?: boolean; eliminated?: boolean }): StatusIconKind;
}

/** Charge le vrai `src/recap-pdf.ts` au runtime (voir `loadRecapPdf.js`). */
export function loadRecapPdf(): Promise<RecapPdfTestFacade>;
