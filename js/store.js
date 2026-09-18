// État partagé de l'application (mutable, un seul exemplaire). Aucune logique ici.
//
// Une seule représentation de la partie : `game = { players, seatOrder, log }`, où `log` est le
// journal (js/core/history.js). L'annulation ET le rétablissement sont portés par le curseur du
// journal (`undo(game.log)` / `redo(game.log)`) : il n'y a plus ni pile d'instantanés, ni
// historique en groupes, ni compteur d'actions à tenir à jour en parallèle.
import { createLog, isLog } from './core/history.js';
import { DEFAULT_SETTINGS } from './core/save-schema.js';

/** Partie vide (aucun joueur), journal neuf. */
export function emptyGame() {
  return { players: [], seatOrder: [], log: createLog() };
}

export const store = {
  /** Paramètres de la partie (choisis au setup, utilisés en jeu). */
  config: { numPlayers: 0, startPoints: 0, maxPoints: Infinity, allowNeg: false },
  /** Réglages persistants (thème, défauts). */
  settings: { ...DEFAULT_SETTINGS },
  /** Partie en cours : { players, seatOrder, log }. */
  game: emptyGame(),
  /** Minuteries de fermeture de groupe, par indice joueur. */
  groupTimers: {},
  /** Indice du joueur en attente de confirmation d'élimination (-1 = aucun). */
  elimPending: -1,
};

/**
 * Remplace la partie en cours et remet à zéro les minuteries. Un journal absent ou mal formé est
 * remplacé par un journal neuf : aucune fonction du cœur ne reçoit jamais de curseur hors bornes.
 */
export function setGame(game) {
  store.game = { ...game, log: isLog(game.log) ? game.log : createLog() };
  Object.values(store.groupTimers).forEach(clearTimeout);
  store.groupTimers = {};
  store.elimPending = -1;
}
