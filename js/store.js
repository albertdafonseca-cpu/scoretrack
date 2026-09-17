// État partagé de l'application (mutable, un seul exemplaire). Aucune logique ici.
//
// `game.log` est le journal v2 (js/core/history.js) : annulation ET rétablissement y sont portés
// par le curseur (`undo(game.log)` / `redo(game.log)`). `game.history`, `game.actionCounter` et
// `undoStack` sont les structures v1 encore consommées par l'interface actuelle ; `redoStack`
// leur fait pendant pour une éventuelle transition douce. Ils disparaîtront avec l'API v1.
import { createLog } from './core/history.js';
import { DEFAULT_SETTINGS } from './core/save-schema.js';

/** Partie vide (aucun joueur), journal neuf. */
export function emptyGame() {
  return { players: [], seatOrder: [], log: createLog(), history: [], actionCounter: 0 };
}

export const store = {
  /** Paramètres de la partie (choisis au setup, utilisés en jeu). */
  config: { numPlayers: 0, startPoints: 0, maxPoints: Infinity, allowNeg: false },
  /** Réglages persistants (thème, défauts). */
  settings: { ...DEFAULT_SETTINGS },
  /** Partie en cours : { players, seatOrder, log, history (v1), actionCounter (v1) }. */
  game: emptyGame(),
  /** Pile d'annulation v1 (instantanés JSON). @deprecated → game.log */
  undoStack: [],
  /** Pile de rétablissement v1 (instantanés JSON). @deprecated → game.log */
  redoStack: [],
  /** Minuteries de fermeture de groupe, par indice joueur. */
  groupTimers: {},
  /** Indice du joueur en attente de confirmation d'élimination (-1 = aucun). */
  elimPending: -1,
};

/**
 * Remplace la partie en cours et remet à zéro les piles v1 et les minuteries.
 * Garantit la présence d'un journal (`log`) et des champs v1.
 */
export function setGame(game) {
  store.game = {
    ...game,
    log: game.log || createLog(),
    history: Array.isArray(game.history) ? game.history : [],
    actionCounter: Number.isInteger(game.actionCounter) ? game.actionCounter : 0,
  };
  store.undoStack = [];
  store.redoStack = [];
  Object.values(store.groupTimers).forEach(clearTimeout);
  store.groupTimers = {};
  store.elimPending = -1;
}
