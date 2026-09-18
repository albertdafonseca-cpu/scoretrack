// Schéma de sauvegarde localStorage — sérialisation, validation et migration, logique pure.
//
// Partie en cours (clé `scoretrack_save`), schéma v2 :
//   { v: 2, players, seatOrder, log: { entries, cursor, floor }, config: { numPlayers, startPoints,
//     maxPoints (null = sans plafond), allowNeg }, ts, sum }
// `sum` = somme de contrôle FNV-1a (hexadécimal, 8 caractères) du JSON de l'objet sans `sum` :
// elle détecte une sauvegarde tronquée ou altérée.
//
// Deux familles de défauts, deux traitements (D5 : une sauvegarde lisible n'est JAMAIS perdue) :
//   - RÉPARABLE (la partie est rendue, `repaired: true`) : score en chaîne ou absent (converti, à
//     défaut ramené au score de départ), prénom non textuel, drapeau d'élimination approximatif,
//     ordre des sièges incohérent, entrées de journal illisibles, curseur hors bornes ou au milieu
//     d'une action, journal en désaccord avec les scores (le journal devient alors de l'historique
//     en lecture seule : voir `floor` dans history.js — on ne propose pas une annulation qui
//     téléporterait un score) ;
//   - CORROMPU / NON PRIS EN CHARGE (`{ ok: false, reason }`) : JSON invalide ou tronqué, somme de
//     contrôle fausse, racine ou liste de joueurs inexploitable ('corrupt') ; numéro de schéma
//     inconnu ou plus de MAX_PLAYERS joueurs ('unsupported' — mieux vaut refuser que rendre une
//     partie silencieusement amputée) ; rien à restaurer ('empty').
//
// Migrations : v0 (ancien index.html, sans `v`) et v1 portent un historique en groupes
// `{ playerIdx, who, entries:[{delta}], open, rank }` ; il devient un journal v2 (`logFromGroups`),
// les scores intermédiaires étant reconstitués à rebours. La pile d'annulation v1 n'était jamais
// persistée : rien à migrer de ce côté.
//
// Réglages (`scoretrack_settings`) et profils (`scoretrack_profiles`) gardent leur schéma v1.

import { appliedState, closeGroup, createLog, isLog, logFromGroups, VIAS } from './history.js';
import { MAX_PLAYERS } from './layout.js';

/** Version du schéma de la partie sauvegardée. */
export const SCHEMA_VERSION = 2;
/** Version du schéma des réglages et des profils (inchangé). */
export const SETTINGS_VERSION = 1;

export const KEYS = Object.freeze({
  settings: 'scoretrack_settings',
  save: 'scoretrack_save',
  profiles: 'scoretrack_profiles',
});

export const DEFAULT_SETTINGS = Object.freeze({
  theme: 'cyber',
  defPlayers: 0,
  defStart: 0,
  defMax: 0,
  defNeg: false,
});

const MAX_PROFILES = 30;

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const num = (x, fallback) => (typeof x === 'number' && Number.isFinite(x) ? x : fallback);
const int = (x, fallback) => (Number.isInteger(x) ? x : fallback);

/** Nombre fini à partir d'un nombre OU d'une chaîne numérique (« 40 ») ; sinon `fallback`. */
function loose(x, fallback) {
  if (typeof x === 'number' && Number.isFinite(x)) return x;
  if (typeof x === 'string' && x.trim() !== '') {
    const v = Number(x);
    if (Number.isFinite(v)) return v;
  }
  return fallback;
}

/** Booléen strict : seuls `true`, 1, '1' et 'true' valent vrai (« non » ne vaut pas vrai). */
function bool(x) {
  return x === true || x === 1 || x === '1' || x === 'true';
}

// ── Somme de contrôle ───────────────────────────────────────────────

/**
 * FNV-1a 32 bits d'une chaîne (unités de code UTF-16), en hexadécimal sur 8 caractères.
 * @param {string} text
 * @returns {string}
 */
export function checksum(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Somme de contrôle d'un objet de sauvegarde (calculée sur son JSON sans le champ `sum`). */
function sumOf(obj) {
  const rest = { ...obj };
  delete rest.sum;
  return checksum(JSON.stringify(rest));
}

/** Vrai si `obj` ne porte pas de `sum` ou si sa `sum` correspond à son contenu. */
export function verifyChecksum(obj) {
  return typeof obj.sum !== 'string' || sumOf(obj) === obj.sum;
}

// ── Réglages ────────────────────────────────────────────────────────

/** Objet prêt à être écrit sous KEYS.settings. */
export function serializeSettings(settings) {
  const clean = parseSettings(settings);
  return { v: SETTINGS_VERSION, ...clean };
}

/**
 * Réglages normalisés à partir du JSON brut (v0 ou v1). Les nombres écrits en chaîne sont
 * convertis (« 40 » → 40) au lieu d'être écrasés ; `defPlayers` est borné à 1..MAX_PLAYERS
 * (0 = aucun défaut) ; `defStart` et `defMax` ne peuvent pas être négatifs (0 = sans plafond).
 * @returns {{theme:string, defPlayers:number, defStart:number, defMax:number, defNeg:boolean}}
 */
export function parseSettings(raw) {
  const s = isObj(raw) ? raw : {};
  const players = Math.round(loose(s.defPlayers, 0));
  const start = loose(s.defStart, 0);
  const max = loose(s.defMax, 0);
  return {
    theme: typeof s.theme === 'string' && s.theme ? s.theme : DEFAULT_SETTINGS.theme,
    defPlayers: players >= 1 && players <= MAX_PLAYERS ? players : 0,
    defStart: start >= 0 ? start : 0,
    defMax: max > 0 ? max : 0,
    defNeg: bool(s.defNeg),
  };
}

// ── Partie en cours ─────────────────────────────────────────────────

/**
 * Joueur normalisé. Un score non numérique est converti s'il le peut (« 40 » → 40), sinon ramené
 * au score de départ : un joueur n'est jamais retiré de la partie (les indices du journal et de
 * l'ordre des sièges resteraient sinon faux).
 */
function parsePlayer(p, fallbackScore, rep) {
  const src = isObj(p) ? p : {};
  if (!isObj(p)) rep.n++;
  const score = loose(src.score, null);
  if (score === null) rep.n++;
  if (typeof src.playerName !== 'string' && src.playerName !== undefined) rep.n++;
  return {
    playerName: typeof src.playerName === 'string' ? src.playerName : '',
    score: score === null ? fallbackScore : score,
    eliminated: bool(src.eliminated),
  };
}

/** Vrai si `list` est une permutation complète de 0..n-1. */
function isSeatOrder(list, n) {
  return (
    Array.isArray(list) &&
    list.length === n &&
    list.every((i) => Number.isInteger(i) && i >= 0 && i < n) &&
    new Set(list).size === n
  );
}

function parseSeatOrder(raw, n, rep) {
  if (isSeatOrder(raw, n)) return raw.slice();
  if (raw !== undefined) rep.n++;
  return Array.from({ length: n }, (_, i) => i);
}

function parseGroup(g) {
  if (!isObj(g) || !Number.isInteger(g.playerIdx) || !Array.isArray(g.entries)) return null;
  return {
    playerIdx: g.playerIdx,
    who: typeof g.who === 'string' ? g.who : '',
    entries: g.entries
      .filter((e) => isObj(e) && Number.isFinite(e.delta))
      .map((e) => ({ delta: e.delta })),
    open: Boolean(g.open),
    rank: int(g.rank, 0),
  };
}

/** Configuration normalisée ; `maxPoints` null/absent ⇒ Infinity. */
function parseConfig(c, n) {
  const src = isObj(c) ? c : {};
  return {
    numPlayers: n,
    startPoints: loose(src.startPoints, 0),
    maxPoints:
      src.maxPoints === null || src.maxPoints === undefined
        ? Infinity
        : loose(src.maxPoints, Infinity),
    allowNeg: bool(src.allowNeg),
  };
}

/** Entrée de journal assainie, ou null si inexploitable (elle est alors écartée). */
function parseEntry(e, n) {
  if (!isObj(e) || !VIAS.includes(e.via) || !Number.isInteger(e.id)) return null;
  const out = {
    id: e.id,
    t: num(e.t, 0),
    playerIdx: e.via === 'rotate' ? -1 : e.playerIdx,
    delta: 0,
    from: e.from,
    to: e.to,
    via: e.via,
    groupId: int(e.groupId, e.id),
  };
  if (e.closed === true) out.closed = true;
  if (e.approx === true) out.approx = true;
  if (e.via === 'rotate') {
    // Un ordre de sièges illisible ne se « répare » pas : réparé des deux côtés, l'entrée
    // deviendrait une rotation fantôme dans l'historique. On l'écarte.
    if (!isSeatOrder(e.from, n) || !isSeatOrder(e.to, n)) return null;
    out.from = e.from.slice();
    out.to = e.to.slice();
    return out;
  }
  if (!Number.isInteger(e.playerIdx) || e.playerIdx < 0 || e.playerIdx >= n) return null;
  if (e.via === 'tap' || e.via === 'keypad') {
    if (!Number.isFinite(e.from) || !Number.isFinite(e.to) || e.from === e.to) return null;
    // `delta` est toujours recalculé : une valeur enregistrée incohérente ne peut pas fausser undo.
    out.delta = e.to - e.from;
  } else if (e.via === 'elim' || e.via === 'unelim') {
    out.from = e.via === 'unelim';
    out.to = e.via === 'elim';
  } else if (typeof e.from !== 'string' || typeof e.to !== 'string') {
    return null;
  }
  return out;
}

/**
 * Journal assaini : entrées invalides écartées, identifiants triés puis RENUMÉROTÉS 1..k (les
 * groupes sont reconstruits par contiguïté, si bien que `record` ne peut plus produire de doublon
 * d'identifiant après relecture), curseur borné puis calé sur une frontière d'action.
 */
function parseLog(raw, n, rep) {
  const log = createLog();
  if (!isObj(raw) || !Array.isArray(raw.entries)) {
    if (raw !== undefined) rep.n++;
    return log;
  }
  const kept = [];
  raw.entries.forEach((e, idx) => {
    const entry = parseEntry(e, n);
    if (entry) kept.push({ entry, idx });
    else rep.n++;
  });
  kept.sort((a, b) => a.entry.id - b.entry.id || a.idx - b.idx);

  let prevOldGroup = null;
  let prevNewGroup = 0;
  kept.forEach(({ entry }, i) => {
    const oldGroup = entry.groupId;
    entry.id = i + 1;
    entry.groupId = prevOldGroup !== null && oldGroup === prevOldGroup ? prevNewGroup : entry.id;
    prevOldGroup = oldGroup;
    prevNewGroup = entry.groupId;
    log.entries.push(entry);
  });

  const total = log.entries.length;
  const dropped = kept.length !== raw.entries.length;
  // Des entrées écartées décalent tout : le curseur enregistré ne veut plus rien dire.
  let cursor = dropped ? total : Math.max(0, Math.min(total, int(raw.cursor, total)));
  if (!dropped && !Number.isInteger(raw.cursor)) rep.n++;
  // Un curseur au milieu d'une action rendrait « annuler puis rétablir » non neutre : on le cale
  // sur la fin de l'action en cours.
  while (
    cursor > 0 &&
    cursor < total &&
    log.entries[cursor].groupId === log.entries[cursor - 1].groupId
  ) {
    cursor++;
    rep.n++;
  }
  log.cursor = cursor;
  log.floor = Math.max(0, Math.min(cursor, int(raw.floor, 0)));
  return log;
}

/** Vrai si les entrées appliquées du journal mènent bien aux scores et sièges enregistrés. */
function isCoherent(log, players, seatOrder) {
  const { scores, seats } = appliedState(log);
  for (const [idx, score] of scores) {
    if (!players[idx] || players[idx].score !== score) return false;
  }
  return (
    seats === null ||
    (seats.length === seatOrder.length && seats.every((s, i) => s === seatOrder[i]))
  );
}

/**
 * Objet prêt à être écrit sous KEYS.save (schéma v2, avec somme de contrôle).
 * `state` = `{ players, seatOrder, log, config }` ; `maxPoints` Infinity est stocké null.
 * @param {{players:object[],seatOrder:number[],log?:object,config?:object}} state
 * @param {number} [now] horodatage (Date.now() par défaut)
 */
export function serializeGame(state, now = Date.now()) {
  const players = state.players.map((p) => ({
    playerName: typeof p.playerName === 'string' ? p.playerName : '',
    score: num(p.score, 0),
    eliminated: Boolean(p.eliminated),
  }));
  const n = players.length;
  const cfg = isObj(state.config) ? state.config : {};
  const log = isLog(state.log)
    ? {
        entries: state.log.entries.map((e) => ({ ...e })),
        cursor: state.log.cursor,
        floor: Number.isInteger(state.log.floor) ? state.log.floor : 0,
      }
    : createLog();
  const out = {
    v: SCHEMA_VERSION,
    players,
    seatOrder: isSeatOrder(state.seatOrder, n)
      ? state.seatOrder.slice()
      : Array.from({ length: n }, (_, i) => i),
    log,
    config: {
      numPlayers: n,
      startPoints: num(cfg.startPoints, 0),
      maxPoints:
        cfg.maxPoints === Infinity || cfg.maxPoints === null || cfg.maxPoints === undefined
          ? null
          : num(cfg.maxPoints, null),
      allowNeg: Boolean(cfg.allowNeg),
    },
    ts: now,
  };
  out.sum = sumOf(out);
  return out;
}

/**
 * Lit une sauvegarde (texte JSON brut ou objet déjà parsé) et renvoie l'état v2 normalisé.
 * @param {string|object|null|undefined} raw
 * @returns {{ok:true, game:{players:object[],seatOrder:number[],log:object,config:object,ts:number},
 *   repaired:boolean} | {ok:false, reason:'corrupt'|'unsupported'|'empty'}}
 */
export function parseGame(raw) {
  let data = raw;
  if (typeof raw === 'string') {
    if (raw.trim() === '') return { ok: false, reason: 'empty' };
    try {
      data = JSON.parse(raw);
    } catch {
      return { ok: false, reason: 'corrupt' };
    }
  }
  if (data === null || data === undefined) return { ok: false, reason: 'empty' };
  if (!isObj(data)) return { ok: false, reason: 'corrupt' };
  const v = data.v === undefined ? 0 : data.v;
  if (![0, 1, 2].includes(v)) return { ok: false, reason: 'unsupported' };
  if (v === 2 && !verifyChecksum(data)) return { ok: false, reason: 'corrupt' };
  if (!Array.isArray(data.players) || data.players.length === 0) {
    return { ok: false, reason: 'corrupt' };
  }
  if (data.players.length > MAX_PLAYERS) return { ok: false, reason: 'unsupported' };

  const rep = { n: 0 };
  const rawConfig = v === 2 ? data.config : data;
  const config = parseConfig(rawConfig, data.players.length);
  const players = data.players.map((p) => parsePlayer(p, config.startPoints, rep));
  const n = players.length;
  const seatOrder = parseSeatOrder(data.seatOrder, n, rep);
  const ts = num(data.ts, 0);

  let log;
  if (v === 2) {
    log = parseLog(data.log, n, rep);
  } else {
    const history = Array.isArray(data.history)
      ? data.history.map(parseGroup).filter((g) => g && g.playerIdx < n)
      : [];
    log = logFromGroups(history, players, ts);
  }
  closeGroup(log);

  // Journal en désaccord avec l'état enregistré : les scores font foi. Le journal reste consultable
  // mais devient inannulable (plancher), et les actions « rétablissables » sont abandonnées.
  if (!isCoherent(log, players, seatOrder)) {
    log.entries.length = log.cursor;
    log.floor = log.cursor;
    rep.n++;
  }

  return { ok: true, game: { players, seatOrder, log, config, ts }, repaired: rep.n > 0 };
}

/**
 * Forme plate de la partie (`{ players, seatOrder, log, numPlayers, startPoints, maxPoints,
 * allowNeg, ts }`), ou null si la sauvegarde est inexploitable — pratique pour un aperçu.
 */
export function parseGameOrNull(raw) {
  const res = parseGame(raw);
  if (!res.ok) return null;
  const { players, seatOrder, log, config, ts } = res.game;
  return { players, seatOrder, log, ...config, ts };
}

// ── Profils (prénoms mémorisés) ─────────────────────────────────────

/** Objet prêt à être écrit sous KEYS.profiles (v1 : { v, names }). */
export function serializeProfiles(names) {
  return { v: SETTINGS_VERSION, names: names.slice(-MAX_PROFILES) };
}

/** Liste de prénoms à partir du JSON brut : tableau (v0) ou { names } (v1). */
export function parseProfiles(raw) {
  const list = Array.isArray(raw) ? raw : isObj(raw) && Array.isArray(raw.names) ? raw.names : [];
  return list.filter((n) => typeof n === 'string' && n.length > 0);
}

/** Ajoute des prénoms (uniques) à la liste ; conserve les 30 derniers. */
export function addProfiles(existing, names) {
  const profiles = existing.slice();
  names.forEach((n) => {
    if (!profiles.includes(n)) profiles.push(n);
  });
  return profiles.length > MAX_PROFILES ? profiles.slice(-MAX_PROFILES) : profiles;
}
