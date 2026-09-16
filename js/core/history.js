// Historique des actions (groupes de taps) et pile d'annulation — logique pure, sans DOM.
// Un « groupe » = { playerIdx, who, entries:[{delta}], open, rank }.
// `game` = { players, seatOrder, history, actionCounter } ; les fonctions mutent `game` en place.

/** Délai (ms) pendant lequel des taps successifs sur un même joueur forment une seule action. */
export const GROUP_DELAY = 1500;
/** Profondeur maximale de la pile d'annulation. */
export const UNDO_LIMIT = 40;

/** Somme des deltas d'un groupe. */
export function groupSum(group) {
  return group.entries.reduce((s, e) => s + e.delta, 0);
}

/** Groupe encore ouvert pour ce joueur, ou undefined. */
export function findOpenGroup(history, playerIdx) {
  return history.find((h) => h.playerIdx === playerIdx && h.open);
}

/** Ferme le groupe ouvert d'un joueur ; renvoie true si un groupe a été fermé. */
export function closeOpenGroup(history, playerIdx) {
  const group = findOpenGroup(history, playerIdx);
  if (!group) return false;
  group.open = false;
  return true;
}

/** Ferme tous les groupes (avant récapitulatif). */
export function closeAllGroups(history) {
  history.forEach((h) => {
    h.open = false;
  });
}

/**
 * Ajoute un delta au groupe ouvert du joueur (ou en crée un nouveau, en tête).
 * Renvoie { group, sum } — `sum` est le total courant du groupe.
 */
export function addGroupedDelta(game, playerIdx, delta) {
  let group = findOpenGroup(game.history, playerIdx);
  if (!group) {
    game.actionCounter++;
    group = {
      playerIdx,
      who: game.players[playerIdx].playerName,
      entries: [],
      open: true,
      rank: game.actionCounter,
    };
    game.history.unshift(group);
  }
  group.entries.push({ delta });
  return { group, sum: groupSum(group) };
}

/** Ajoute une action manuelle (pavé numérique) : groupe distinct, déjà fermé. */
export function addManualDelta(game, playerIdx, delta) {
  game.actionCounter++;
  const group = {
    playerIdx,
    who: game.players[playerIdx].playerName,
    entries: [{ delta }],
    open: false,
    rank: game.actionCounter,
  };
  game.history.unshift(group);
  return group;
}

/** Groupes d'un joueur triés par ordre d'action, avec le total. */
export function playerRecap(history, playerIdx) {
  const groups = history.filter((h) => h.playerIdx === playerIdx).sort((a, b) => a.rank - b.rank);
  const total = groups.reduce((s, g) => s + groupSum(g), 0);
  return { groups, total };
}

/** Instantané sérialisé de l'état (players, history, seatOrder, actionCounter). */
export function snapshot(game) {
  return JSON.stringify({
    players: game.players,
    history: game.history,
    seatOrder: game.seatOrder,
    actionCounter: game.actionCounter,
  });
}

/** Empile un instantané ; la pile est bornée à UNDO_LIMIT (les plus anciens sortent). */
export function pushUndo(undoStack, game) {
  undoStack.push(snapshot(game));
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  return undoStack;
}

/** Dépile et renvoie l'état précédent (objet), ou null si la pile est vide. */
export function popUndo(undoStack) {
  if (!undoStack.length) return null;
  return JSON.parse(undoStack.pop());
}
