// État partagé de l'application (mutable, un seul exemplaire). Aucune logique ici.
import { DEFAULT_SETTINGS } from './core/save-schema.js';

export const store = {
  /** Paramètres de la partie (choisis au setup, utilisés en jeu). */
  config: { numPlayers: 0, startPoints: 0, maxPoints: Infinity, allowNeg: false },
  /** Réglages persistants (thème, défauts). */
  settings: { ...DEFAULT_SETTINGS },
  /** Partie en cours. */
  game: { players: [], seatOrder: [], history: [], actionCounter: 0 },
  /** Pile d'annulation (instantanés JSON). */
  undoStack: [],
  /** Minuteries de fermeture de groupe, par indice joueur. */
  groupTimers: {},
  /** Indice du joueur en attente de confirmation d'élimination (-1 = aucun). */
  elimPending: -1,
};

/** Remplace la partie en cours et remet à zéro l'annulation et les minuteries. */
export function setGame(game) {
  store.game = game;
  store.undoStack = [];
  Object.values(store.groupTimers).forEach(clearTimeout);
  store.groupTimers = {};
  store.elimPending = -1;
}
