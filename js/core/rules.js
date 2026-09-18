// Règles de jeu — logique pure, sans DOM.
//
// `config` = { startPoints, maxPoints (nombre fini, Infinity ou null = sans plafond), allowNeg }.
// Un joueur = { playerName, score, eliminated }.
//
// Deux notions distinctes :
//   - le PLAFOND (`clampScore`, `isMaxReached`) : un score ne dépasse jamais `maxPoints` ;
//   - la VICTOIRE (`findWinner`) : dernier survivant, ou premier joueur à ATTEINDRE un plafond
//     supérieur au score de départ (à Loi du Milieu, départ = plafond = 40 : le plafond n'est
//     qu'une butée, la victoire vient de l'élimination).

/**
 * Borne un score entre le plancher (0, ou -∞ si les négatifs sont permis) et le plafond.
 * @param {number} value score candidat
 * @param {{allowNeg?:boolean,maxPoints?:number|null}} [config]
 * @returns {number}
 */
export function clampScore(value, { allowNeg = false, maxPoints = Infinity } = {}) {
  const minVal = allowNeg ? -Infinity : 0;
  const maxVal = maxPoints === Infinity || maxPoints === null ? Infinity : maxPoints;
  return Math.min(maxVal, Math.max(minVal, value));
}

/**
 * Applique un delta à un score en respectant les bornes.
 * @param {number} score score courant
 * @param {number} delta variation demandée (peut être négative)
 * @param {{allowNeg?:boolean,maxPoints?:number|null}} [config]
 * @returns {{newScore:number, realDelta:number}} `realDelta` = variation effectivement appliquée
 *   (0 si le score était déjà à la butée : rien à journaliser dans ce cas)
 */
export function applyDelta(score, delta, config) {
  const newScore = clampScore(score + delta, config);
  return { newScore, realDelta: newScore - score };
}

/** Vrai si le score est bloqué au plancher 0 (retour tactile « impossible de descendre »). */
export function isAtFloor(score, { allowNeg = false } = {}) {
  return !allowNeg && score <= 0;
}

/**
 * Vrai si le score a atteint (ou dépassé) un plafond FINI et strictement positif.
 * Infinity, null, undefined ou 0 signifient « sans plafond » et renvoient toujours false.
 * @param {number} score
 * @param {number|null|undefined} maxPoints
 */
export function isMaxReached(score, maxPoints) {
  return Number.isFinite(maxPoints) && maxPoints > 0 && score >= maxPoints;
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

/**
 * Détermine le vainqueur.
 *   - 'last-alive'   : au moins 2 joueurs et un seul non éliminé (jamais à 1 joueur seul) ;
 *   - 'max-reached'  : un joueur non éliminé atteint un plafond FINI qui est un OBJECTIF, c'est-à-dire
 *                      strictement supérieur au score de départ (le plus haut score l'emporte, puis
 *                      le plus petit indice en cas d'égalité) ;
 *   - null sinon.
 *
 * `config` est l'objet de configuration de la partie (`store.config`) : `{ startPoints, maxPoints,
 * allowNeg }`. `startPoints` est DÉTERMINANT et fait partie du contrat : il distingue un plafond
 * « objectif » (Uno : départ 0, max 500 → atteindre 500 fait gagner) d'un plafond « butée »
 * (Loi du Milieu : départ 40, max 40 → le plafond empêche seulement de monter, la victoire vient de
 * l'élimination). Repli SÛR quand il est absent ou non fini : le plafond est traité comme une butée,
 * donc aucune victoire par plafond — un appel incomplet ne peut jamais fabriquer un faux vainqueur
 * au lancement d'une partie. `allowNeg` est accepté pour l'homogénéité de `config` mais ne change
 * pas la décision.
 * @param {Array<{score:number,eliminated:boolean}>} players
 * @param {{maxPoints?:number|null,startPoints?:number,allowNeg?:boolean}} [config]
 * @returns {{index:number, reason:'last-alive'|'max-reached'}|null} indice du vainqueur dans
 *   `players` (l'appelant lit le joueur lui-même) et raison de la victoire
 */
export function findWinner(players, config = {}) {
  if (!Array.isArray(players) || players.length === 0) return null;
  const maxPoints = config.maxPoints === undefined ? Infinity : config.maxPoints;
  // Sans point de départ connu, le plafond est une butée : `maxPoints > startPoints` sera faux.
  const startPoints = Number.isFinite(config.startPoints) ? config.startPoints : maxPoints;
  const alive = [];
  players.forEach((p, index) => {
    if (!p.eliminated) alive.push(index);
  });
  if (players.length >= 2 && alive.length === 1) return { index: alive[0], reason: 'last-alive' };
  if (Number.isFinite(maxPoints) && maxPoints > startPoints) {
    let best = -1;
    alive.forEach((i) => {
      const s = players[i].score;
      if (s >= maxPoints && (best < 0 || s > players[best].score)) best = i;
    });
    if (best >= 0) return { index: best, reason: 'max-reached' };
  }
  return null;
}

/**
 * Classement : joueurs en lice par score décroissant, puis éliminés (eux aussi par score).
 * Rang « compétition » (1, 2, 2, 4) : ex æquo au même rang parmi les joueurs de même statut.
 * `gap` = écart au premier du classement (0 pour le leader).
 * @param {Array<{playerName:string,score:number,eliminated:boolean}>} players
 * @returns {Array<{index:number,player:object,score:number,eliminated:boolean,rank:number,gap:number}>}
 */
export function ranking(players) {
  const rows = players.map((player, index) => ({
    index,
    player,
    score: player.score,
    eliminated: Boolean(player.eliminated),
  }));
  rows.sort((a, b) => {
    if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
    if (b.score !== a.score) return b.score - a.score;
    return a.index - b.index;
  });
  const top = rows.length ? rows[0].score : 0;
  rows.forEach((row, i) => {
    const prev = rows[i - 1];
    row.rank =
      prev && prev.eliminated === row.eliminated && prev.score === row.score ? prev.rank : i + 1;
    row.gap = top - row.score;
  });
  return rows;
}

/** Crée la liste des joueurs pour une nouvelle partie (prénoms nettoyés, score de départ). */
export function createPlayers(numPlayers, names, startPoints) {
  return Array.from({ length: numPlayers }, (_, i) => ({
    playerName: (names[i] || '').trim(),
    score: startPoints,
    eliminated: false,
  }));
}
