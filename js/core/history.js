// Journal des actions de la partie — logique pure, sans DOM.
//
// v2 : un journal chronologique `log = { entries, cursor }` où chaque entrée décrit UNE modification
// atomique de l'état (un tap, une saisie au pavé, une rotation des sièges, une élimination, un
// renommage). L'annulation et le rétablissement se font par inversion de l'entrée (jamais par
// instantané) : `undo(log)` recule le curseur d'une ACTION (un groupe de taps rapprochés = une
// action) et renvoie l'entrée inversée que l'interface applique avec `applyEntry(game, entry)`.
// Les entrées situées après le curseur sont rétablissables (`redo`) jusqu'à la prochaine `record`,
// qui les tronque.
//
// Entrée : `{ id, t, playerIdx, delta, from, to, via, groupId }`
//   - `via` ∈ 'tap' | 'keypad' | 'rotate' | 'elim' | 'unelim' | 'rename'
//   - tap/keypad : `from`/`to` = score avant/après, `delta = to - from`
//   - rotate     : `playerIdx = -1`, `from`/`to` = seatOrder avant/après, `delta = 0`
//   - elim/unelim: `from`/`to` = drapeau `eliminated` avant/après, `delta = 0`
//   - rename     : `from`/`to` = prénom avant/après, `delta = 0`
//   - `closed` (optionnel) : aucun tap ultérieur ne peut rejoindre ce groupe
//   - `approx` (optionnel) : horodatage reconstitué lors d'une migration (heure de la sauvegarde)
// Une entrée inversée porte de plus `inverse: true` ; l'interface n'a besoin que de `to`.
//
// La section « API v1 » (groupes + pile d'instantanés) reste exportée pour l'interface actuelle
// et sera retirée quand plus aucun module UI ne l'importera.

/** Délai (ms) pendant lequel des taps successifs sur un même joueur forment une seule action. */
export const GROUP_DELAY = 1500;
/** Profondeur maximale de la pile d'annulation v1 (instantanés). @deprecated */
export const UNDO_LIMIT = 40;
/** Moyens d'action reconnus. */
export const VIAS = Object.freeze(['tap', 'keypad', 'rotate', 'elim', 'unelim', 'rename']);
/** Moyens qui modifient un score (les seuls comptés dans les bilans). */
export const SCORE_VIAS = Object.freeze(['tap', 'keypad']);

const INVERSE_VIA = Object.freeze({ elim: 'unelim', unelim: 'elim' });

const isInt = Number.isInteger;
const isNum = Number.isFinite;

// ── Journal v2 ──────────────────────────────────────────────────────

/**
 * Crée un journal vide.
 * @returns {{ entries: object[], cursor: number }}
 */
export function createLog() {
  return { entries: [], cursor: 0 };
}

/** Vrai si `log` a la forme minimale d'un journal. */
export function isLog(log) {
  return (
    log !== null &&
    typeof log === 'object' &&
    Array.isArray(log.entries) &&
    isInt(log.cursor) &&
    log.cursor >= 0 &&
    log.cursor <= log.entries.length
  );
}

/** Lève une erreur descriptive si `entry` n'est pas une entrée valide pour son `via`. */
function validate(entry) {
  if (entry === null || typeof entry !== 'object') throw new TypeError('history: entrée invalide');
  const { via, playerIdx, from, to } = entry;
  if (!VIAS.includes(via)) throw new RangeError(`history: via inconnu « ${via} »`);
  if (via === 'rotate') {
    if (!Array.isArray(from) || !Array.isArray(to) || from.length !== to.length) {
      throw new TypeError('history: rotate exige from/to = ordres de sièges');
    }
    return;
  }
  if (!isInt(playerIdx) || playerIdx < 0) {
    throw new RangeError('history: playerIdx doit être un entier ≥ 0');
  }
  if (SCORE_VIAS.includes(via)) {
    if (!isNum(from) || !isNum(to)) throw new TypeError('history: from/to doivent être des scores');
    if (from === to) throw new RangeError('history: une entrée de score doit changer le score');
  } else if (via === 'rename') {
    if (typeof from !== 'string' || typeof to !== 'string') {
      throw new TypeError('history: rename exige from/to = prénoms');
    }
  }
}

/** Vrai si un tap `next` (à l'instant `t`) peut rejoindre le groupe de l'entrée `prev`. */
function joinsGroup(prev, next, t) {
  return (
    prev !== undefined &&
    prev.via === 'tap' &&
    next.via === 'tap' &&
    prev.playerIdx === next.playerIdx &&
    prev.closed !== true &&
    t >= prev.t &&
    t - prev.t <= GROUP_DELAY
  );
}

/**
 * Enregistre une entrée à la position du curseur (les entrées rétablissables sont tronquées).
 * Complète `id`, `t` (Date.now() par défaut) et `groupId` : un tap rejoint le groupe du tap
 * précédent du même joueur s'il survient dans les GROUP_DELAY ms et que ce groupe n'est pas clos.
 * @param {{entries:object[],cursor:number}} log
 * @param {{playerIdx?:number,delta?:number,from:any,to:any,via:string,t?:number,groupId?:number}} entry
 * @returns {object} l'entrée telle que stockée
 */
export function record(log, entry) {
  validate(entry);
  log.entries.length = log.cursor;
  const prev = log.entries[log.cursor - 1];
  const t = isNum(entry.t) ? entry.t : Date.now();
  const id = prev ? prev.id + 1 : 1;
  const isScore = SCORE_VIAS.includes(entry.via);
  const stored = {
    id,
    t,
    playerIdx: entry.via === 'rotate' ? -1 : entry.playerIdx,
    delta: isScore ? entry.to - entry.from : 0,
    from: entry.via === 'rotate' ? entry.from.slice() : entry.from,
    to: entry.via === 'rotate' ? entry.to.slice() : entry.to,
    via: entry.via,
    groupId: isInt(entry.groupId) ? entry.groupId : joinsGroup(prev, entry, t) ? prev.groupId : id,
  };
  if (entry.via === 'elim' || entry.via === 'unelim') {
    stored.from = entry.via === 'unelim';
    stored.to = entry.via === 'elim';
  }
  log.entries.push(stored);
  log.cursor = log.entries.length;
  return stored;
}

/** Raccourci : changement de score d'un joueur (`via` = 'tap' ou 'keypad'). */
export function recordScore(log, playerIdx, from, to, via = 'tap', t) {
  return record(log, { playerIdx, from, to, via, t });
}

/** Raccourci : rotation des sièges (`before` et `after` sont copiés). */
export function recordRotate(log, before, after, t) {
  return record(log, { via: 'rotate', from: before, to: after, t });
}

/** Raccourci : élimination (`eliminated = true`) ou réintégration (`false`) d'un joueur. */
export function recordElim(log, playerIdx, eliminated = true, t) {
  return record(log, {
    via: eliminated ? 'elim' : 'unelim',
    playerIdx,
    from: !eliminated,
    to: eliminated,
    t,
  });
}

/** Raccourci : renommage d'un joueur. */
export function recordRename(log, playerIdx, from, to, t) {
  return record(log, { via: 'rename', playerIdx, from, to, t });
}

/**
 * Clôt le groupe de taps courant (celui que le prochain tap pourrait rejoindre).
 * @param {object} log
 * @param {number} [playerIdx] ne clore que si le groupe appartient à ce joueur
 * @returns {boolean} true si un groupe a été clos
 */
export function closeGroup(log, playerIdx) {
  const last = log.entries[log.cursor - 1];
  if (!last || last.via !== 'tap' || last.closed === true) return false;
  if (playerIdx !== undefined && last.playerIdx !== playerIdx) return false;
  last.closed = true;
  return true;
}

/**
 * Entrée inverse : mêmes identifiants, `from`/`to` permutés, delta opposé, via elim ↔ unelim.
 * L'appliquer (`applyEntry`) ramène l'état à ce qu'il était avant l'entrée d'origine.
 */
export function invert(entry) {
  return {
    ...entry,
    delta: -entry.delta,
    from: entry.to,
    to: entry.from,
    via: INVERSE_VIA[entry.via] || entry.via,
    inverse: entry.inverse !== true,
  };
}

/**
 * Applique une entrée (directe ou inversée) à un état `game = { players, seatOrder }` : seul `to`
 * est utilisé. Renvoie `game` (muté). Les indices hors limites sont ignorés sans erreur.
 */
export function applyEntry(game, entry) {
  if (entry.via === 'rotate') {
    game.seatOrder = entry.to.slice();
    return game;
  }
  const p = game.players[entry.playerIdx];
  if (!p) return game;
  if (SCORE_VIAS.includes(entry.via)) p.score = entry.to;
  else if (entry.via === 'elim' || entry.via === 'unelim') p.eliminated = entry.to === true;
  else if (entry.via === 'rename') p.playerName = entry.to;
  return game;
}

/** Indice de début (inclus) du groupe contenant l'entrée d'indice `i`. */
function groupStart(entries, i) {
  let s = i;
  while (s > 0 && entries[s - 1].groupId === entries[i].groupId) s--;
  return s;
}

/** Indice de fin (exclu) du groupe contenant l'entrée d'indice `i`. */
function groupEnd(entries, i) {
  let e = i + 1;
  while (e < entries.length && entries[e].groupId === entries[i].groupId) e++;
  return e;
}

/**
 * Fusionne des entrées contiguës d'un même groupe en une « action » : `delta` = somme,
 * `from` = état initial, `to` = état final, `ids` = identifiants des entrées, `count` = nombre.
 */
function mergeAction(entries) {
  const first = entries[0];
  const last = entries[entries.length - 1];
  return {
    id: first.id,
    ids: entries.map((e) => e.id),
    groupId: first.groupId,
    playerIdx: first.playerIdx,
    via: first.via,
    t: first.t,
    tEnd: last.t,
    delta: entries.reduce((s, e) => s + e.delta, 0),
    from: first.from,
    to: last.to,
    count: entries.length,
    approx: first.approx === true,
  };
}

/** Vrai si une action est annulable. */
export function canUndo(log) {
  return log.cursor > 0;
}

/** Vrai si une action est rétablissable. */
export function canRedo(log) {
  return log.cursor < log.entries.length;
}

/**
 * Annule la dernière action (un groupe de taps = une action) : recule le curseur et renvoie
 * l'action inversée à appliquer (`applyEntry`), ou null s'il n'y a rien à annuler.
 */
export function undo(log) {
  if (!canUndo(log)) return null;
  const start = groupStart(log.entries, log.cursor - 1);
  const action = mergeAction(log.entries.slice(start, log.cursor));
  log.cursor = start;
  return invert(action);
}

/**
 * Rétablit l'action suivante : avance le curseur et renvoie l'action à appliquer, ou null.
 */
export function redo(log) {
  if (!canRedo(log)) return null;
  const end = groupEnd(log.entries, log.cursor);
  const action = mergeAction(log.entries.slice(log.cursor, end));
  log.cursor = end;
  return action;
}

/**
 * Place le curseur juste après l'action contenant l'entrée `entryId` (0 = avant toute action)
 * et renvoie, dans l'ordre d'application, les entrées à appliquer pour y parvenir : inversées
 * si l'on recule, directes si l'on avance. Renvoie null si l'identifiant est inconnu.
 * Les actions dépassées restent rétablissables.
 * @returns {object[]|null}
 */
export function jumpTo(log, entryId) {
  let target = 0;
  if (entryId !== 0 && entryId !== null && entryId !== undefined) {
    const i = log.entries.findIndex((e) => e.id === entryId);
    if (i < 0) return null;
    target = groupEnd(log.entries, i);
  }
  const from = log.cursor;
  log.cursor = target;
  if (target < from) return log.entries.slice(target, from).reverse().map(invert);
  return log.entries.slice(from, target).map((e) => ({ ...e }));
}

/**
 * Actions numérotées, dans l'ordre chronologique (toutes, y compris celles annulées : `undone`).
 * @returns {Array<{n:number,id:number,ids:number[],groupId:number,playerIdx:number,via:string,t:number,tEnd:number,delta:number,from:any,to:any,count:number,undone:boolean}>}
 */
export function groups(log) {
  const out = [];
  const { entries, cursor } = log;
  for (let i = 0; i < entries.length;) {
    const end = groupEnd(entries, i);
    const action = mergeAction(entries.slice(i, end));
    action.n = out.length + 1;
    action.undone = i >= cursor;
    out.push(action);
    i = end;
  }
  return out;
}

/**
 * Chronologie entrée par entrée, chacune complétée du numéro d'action `n` et de `undone`.
 * @returns {object[]}
 */
export function timeline(log) {
  const out = [];
  groups(log).forEach((action) => {
    action.ids.forEach((id) => {
      const entry = log.entries.find((e) => e.id === id);
      out.push({ ...entry, n: action.n, undone: action.undone });
    });
  });
  return out;
}

/**
 * Bilan d'un joueur : ses actions de score en vigueur (non annulées), leur total et la courbe
 * `points = [{ t, score }]` (score initial puis score après chaque action ; vide sans action).
 * Accepte aussi un historique v1 (tableau de groupes) : voir la section dépréciée.
 */
export function playerRecap(log, playerIdx) {
  if (Array.isArray(log)) return playerRecapV1(log, playerIdx);
  const actions = groups(log).filter(
    (a) => !a.undone && a.playerIdx === playerIdx && SCORE_VIAS.includes(a.via),
  );
  const total = actions.reduce((s, a) => s + a.delta, 0);
  const points = actions.length ? [{ t: actions[0].t, score: actions[0].from }] : [];
  actions.forEach((a) => points.push({ t: a.tEnd, score: a.to }));
  return { actions, total, points };
}

// ── Passerelles v1 ↔ v2 (migration des sauvegardes) ─────────────────

/**
 * Construit un journal v2 à partir d'un historique v1 (groupes `{ playerIdx, entries:[{delta}],
 * rank }`, du plus récent au plus ancien) et des scores ACTUELS des joueurs : les scores
 * intermédiaires sont reconstitués à rebours. Les entrées reçoivent l'horodatage `t` (heure de la
 * sauvegarde) et `approx: true` ; |delta| = 1 ⇒ 'tap', sinon 'keypad'.
 */
export function logFromGroups(history, players, t = 0) {
  const log = createLog();
  const ordered = history
    .filter((g) => g && Array.isArray(g.entries) && isInt(g.playerIdx) && players[g.playerIdx])
    .slice()
    .sort((a, b) => (a.rank || 0) - (b.rank || 0));
  const flat = [];
  ordered.forEach((g) => {
    const deltas = g.entries.map((e) => e && e.delta).filter((d) => isNum(d) && d !== 0);
    if (!deltas.length) return;
    const groupId = flat.length + 1;
    deltas.forEach((delta) => flat.push({ playerIdx: g.playerIdx, delta, groupId }));
  });
  const running = players.map((p) => p.score);
  for (let i = flat.length - 1; i >= 0; i--) {
    const f = flat[i];
    f.to = running[f.playerIdx];
    f.from = f.to - f.delta;
    running[f.playerIdx] = f.from;
  }
  flat.forEach((f, i) => {
    log.entries.push({
      id: i + 1,
      t,
      playerIdx: f.playerIdx,
      delta: f.delta,
      from: f.from,
      to: f.to,
      via: Math.abs(f.delta) === 1 ? 'tap' : 'keypad',
      groupId: f.groupId,
      approx: true,
    });
  });
  log.cursor = log.entries.length;
  closeGroup(log);
  return log;
}

/**
 * Projette un journal v2 en historique v1 (`{ history, actionCounter }`) : actions de score en
 * vigueur, du plus récent au plus ancien, rangs séquentiels, groupes fermés.
 */
export function groupsFromLog(log, players) {
  const actions = groups(log).filter((a) => !a.undone && SCORE_VIAS.includes(a.via));
  const history = actions.map((a, i) => ({
    playerIdx: a.playerIdx,
    who: players[a.playerIdx] ? players[a.playerIdx].playerName : '',
    entries: a.ids.map((id) => ({ delta: log.entries.find((e) => e.id === id).delta })),
    open: false,
    rank: i + 1,
  }));
  history.reverse();
  return { history, actionCounter: actions.length };
}

// ── API v1 (groupes + instantanés) — dépréciée ──────────────────────
// `game` = { players, seatOrder, history, actionCounter } ; les fonctions mutent `game` en place.

/** Somme des deltas d'un groupe v1. @deprecated utiliser `groups(log)` (champ `delta`). */
export function groupSum(group) {
  return group.entries.reduce((s, e) => s + e.delta, 0);
}

/** Groupe v1 encore ouvert pour ce joueur, ou undefined. @deprecated */
export function findOpenGroup(history, playerIdx) {
  return history.find((h) => h.playerIdx === playerIdx && h.open);
}

/** Ferme le groupe v1 ouvert d'un joueur ; true si un groupe a été fermé. @deprecated `closeGroup` */
export function closeOpenGroup(history, playerIdx) {
  const group = findOpenGroup(history, playerIdx);
  if (!group) return false;
  group.open = false;
  return true;
}

/** Ferme tous les groupes v1. @deprecated */
export function closeAllGroups(history) {
  history.forEach((h) => {
    h.open = false;
  });
}

/**
 * Ajoute un delta au groupe v1 ouvert du joueur (ou en crée un nouveau, en tête).
 * Renvoie { group, sum }. @deprecated utiliser `record`/`recordScore`
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

/** Ajoute une action manuelle v1 (groupe distinct, fermé). @deprecated utiliser `recordScore(…, 'keypad')` */
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

/** Bilan v1 : groupes d'un joueur triés par rang, avec le total. @deprecated */
function playerRecapV1(history, playerIdx) {
  const list = history.filter((h) => h.playerIdx === playerIdx).sort((a, b) => a.rank - b.rank);
  const total = list.reduce((s, g) => s + groupSum(g), 0);
  return { groups: list, total };
}

/** Instantané sérialisé de l'état (players, history, seatOrder, actionCounter, log). @deprecated */
export function snapshot(game) {
  return JSON.stringify({
    players: game.players,
    history: game.history,
    seatOrder: game.seatOrder,
    actionCounter: game.actionCounter,
    log: game.log,
  });
}

/** Empile un instantané ; la pile est bornée à UNDO_LIMIT. @deprecated utiliser `undo(log)` */
export function pushUndo(undoStack, game) {
  undoStack.push(snapshot(game));
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  return undoStack;
}

/** Dépile et renvoie l'état précédent (objet), ou null si la pile est vide. @deprecated */
export function popUndo(undoStack) {
  if (!undoStack.length) return null;
  return JSON.parse(undoStack.pop());
}
