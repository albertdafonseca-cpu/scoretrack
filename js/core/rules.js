// Règles de jeu — logique pure, sans DOM.
// `config` = { startPoints, maxPoints (nombre ou Infinity), allowNeg }.

/** Borne un score entre le plancher (0 ou -∞ si négatifs permis) et le plafond. */
export function clampScore(value, { allowNeg = false, maxPoints = Infinity } = {}) {
  const minVal = allowNeg ? -Infinity : 0;
  const maxVal = maxPoints === Infinity || maxPoints === null ? Infinity : maxPoints;
  return Math.min(maxVal, Math.max(minVal, value));
}

/** Applique un delta à un score en respectant les bornes ; renvoie le nouveau score et le delta réel. */
export function applyDelta(score, delta, config) {
  const newScore = clampScore(score + delta, config);
  return { newScore, realDelta: newScore - score };
}

/** Vrai si le score est bloqué au plancher 0 (retour tactile « impossible de descendre »). */
export function isAtFloor(score, { allowNeg = false } = {}) {
  return !allowNeg && score <= 0;
}

/** Classe d'alerte du score : 'crit' (à 0 ou sous 0), 'low' (≤ 25 % du départ) ou ''. */
export function scoreClass(score, startPoints) {
  if (startPoints > 0) {
    if (score <= 0) return 'crit';
    if (score <= Math.floor(startPoints * 0.25)) return 'low';
  } else if (score < 0) {
    return 'crit';
  }
  return '';
}

/** Vrai si une confirmation d'élimination doit être demandée pour ce joueur. */
export function needsElimination(player, { allowNeg = false } = {}) {
  return !allowNeg && player.score <= 0 && !player.eliminated;
}

/** Renvoie l'unique survivant, ou null s'il n'y a pas exactement un joueur en lice. */
export function findWinner(players) {
  const alive = players.filter((p) => !p.eliminated);
  return alive.length === 1 ? alive[0] : null;
}

/** Crée la liste des joueurs pour une nouvelle partie. */
export function createPlayers(numPlayers, names, startPoints) {
  return Array.from({ length: numPlayers }, (_, i) => ({
    playerName: (names[i] || '').trim(),
    score: startPoints,
    eliminated: false,
  }));
}
