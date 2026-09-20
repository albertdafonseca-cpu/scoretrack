// Déclaration typée mais volontairement DÉCOUPLÉE de `src/game.ts` : même un
// `import type { ... } from '../../src/game'` purement typé forcerait
// `tsc -p tsconfig.test.json` à type-vérifier tout `src/game.ts` — qui importe
// `src/i18n.ts`, lequel déclenche sous CE tsconfig précis (qui ajoute
// `"types": ["node"]` à côté de la lib DOM, pour les besoins de `e2e/`) un
// conflit de types PRÉEXISTANT et non lié à cet agent : le `setTimeout` du
// navigateur (retourne `number`, lib DOM) contre celui de Node
// (`NodeJS.Timeout`, `@types/node`) — `i18n.ts:160` type un minuteur en
// `number`. Détail complet, reproduction et correctif proposé dans
// docs/audit/DECISIONS-B.md (hors du périmètre de cet agent : `tsconfig.test.json`
// appartient à l'élément A, `src/i18n.ts` à l'élément D).
//
// Ce fichier ne décrit donc QUE le sous-ensemble de l'API de `game.ts` utilisé
// par les tests de cet agent — recopié à la main depuis `src/types.ts` (qui,
// lui, n'importe rien et ne pose donc aucun problème), jamais généré.
// `loadGame.js` (implémentation réelle, en .js : hors de la vérification de
// types de `tsc -p tsconfig.test.json`, qui ne matche que `**/*.ts`) fait le
// vrai `import()` de `src/game.ts`, exécuté par Vitest/esbuild au runtime.
import type { BloquerMode, CardRot, HistoryGroup, ObjectifMode, Player } from '../../src/types';

/** Cf. `ScoreLimits` dans `src/game.ts` — dupliqué ici à l'identique. */
export interface ScoreLimits {
  bloquerMode: BloquerMode;
  startPoints: number;
  allowNeg: boolean;
  objectifMode: ObjectifMode;
  winPoints: number | null;
  maxPoints: number;
}
/** Cf. `ClampedAdjustment` dans `src/game.ts` — dupliqué ici à l'identique. */
export interface ClampedAdjustment {
  rawScore: number;
  newScore: number;
  realDelta: number;
  rawDelta: number;
}

/** Sous-ensemble de `window.ScoreTrack.game` (voir `src/main.ts`) exercé par les tests de l'élément B. */
export interface GameTestFacade {
  players: Player[];
  history: HistoryGroup[];
  objectifMode: ObjectifMode;
  elimPoints: number | null;
  startPoints: number;
  buildCard(pi: number, rot: CardRot): HTMLElement;
  renderProfileChips(): void;
  showRecap(): void;
  computeClampedScore(prevScore: number, delta: number, limits: ScoreLimits): ClampedAdjustment;
  scoreClass(score: number): string;
  applyPreset(idx: number): void;
  applyObjectif(): void;
  selectObjectif(mode: ObjectifMode): void;
}

/** Charge le vrai `src/game.ts` au runtime (voir `loadGame.js`). */
export function loadGame(): Promise<GameTestFacade>;
