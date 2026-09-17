// Schéma de sauvegarde localStorage — sérialisation, validation et migration, logique pure.
//
// Partie en cours (clé `scoretrack_save`), schéma v2 :
//   { v: 2, players, seatOrder, log: { entries, cursor }, config: { numPlayers, startPoints,
//     maxPoints (null = sans plafond), allowNeg }, ts, sum }
// `sum` = somme de contrôle FNV-1a (hexadécimal, 8 caractères) du JSON de l'objet sans `sum` :
// elle détecte une sauvegarde tronquée ou altérée.
//
// Migrations : v0 (ancien index.html, sans `v`) et v1 (même forme + `v: 1`) portent un historique
// en groupes `{ playerIdx, who, entries:[{delta}], open, rank }` ; il devient un journal v2
// (`logFromGroups`), les scores intermédiaires étant reconstitués à rebours depuis les scores
// actuels. La pile d'annulation v1 n'était jamais persistée : rien à migrer de ce côté.
// Règle absolue (D5) : une sauvegarde lisible n'est jamais perdue ; les champs douteux sont réparés.
//
// Réglages (`scoretrack_settings`) et profils (`scoretrack_profiles`) gardent leur schéma v1.

import { closeGroup, createLog, groupsFromLog, isLog, logFromGroups, VIAS } from './history.js';

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
  return {
    v: SETTINGS_VERSION,
    theme: typeof settings.theme === 'string' ? settings.theme : DEFAULT_SETTINGS.theme,
    defPlayers: int(settings.defPlayers, 0),
    defStart: num(settings.defStart, 0),
    defMax: num(settings.defMax, 0),
    defNeg: Boolean(settings.defNeg),
  };
}

/** Réglages normalisés à partir du JSON brut (v0 ou v1) ; valeurs par défaut si absent ou invalide. */
export function parseSettings(raw) {
  const s = isObj(raw) ? raw : {};
  return {
    theme: typeof s.theme === 'string' && s.theme ? s.theme : DEFAULT_SETTINGS.theme,
    defPlayers: int(s.defPlayers, 0) > 0 ? s.defPlayers : 0,
    defStart: num(s.defStart, 0) >= 0 ? num(s.defStart, 0) : -1,
    defMax: num(s.defMax, 0) > 0 ? s.defMax : 0,
    defNeg: Boolean(s.defNeg),
  };
}

// ── Partie en cours ─────────────────────────────────────────────────

function parsePlayer(p) {
  if (!isObj(p)) return null;
  const score = num(p.score, null);
  if (score === null) return null;
  return {
    playerName: typeof p.playerName === 'string' ? p.playerName : '',
    score,
    eliminated: Boolean(p.eliminated),
  };
}

function parseSeatOrder(raw, n) {
  const seatOrder = Array.isArray(raw) ? raw : [];
  const valid =
    seatOrder.length === n &&
    seatOrder.every((i) => Number.isInteger(i) && i >= 0 && i < n) &&
    new Set(seatOrder).size === n;
  return valid ? seatOrder.slice() : Array.from({ length: n }, (_, i) => i);
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
    startPoints: num(src.startPoints, 0),
    maxPoints:
      src.maxPoints === null || src.maxPoints === undefined
        ? Infinity
        : num(src.maxPoints, Infinity),
    allowNeg: Boolean(src.allowNeg),
  };
}

/** Entrée de journal assainie, ou null si inexploitable. */
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
    const okSeats = (s) => Array.isArray(s) && s.length === n;
    if (!okSeats(e.from) || !okSeats(e.to)) return null;
    out.from = parseSeatOrder(e.from, n);
    out.to = parseSeatOrder(e.to, n);
    return out;
  }
  if (!Number.isInteger(e.playerIdx) || e.playerIdx < 0 || e.playerIdx >= n) return null;
  if (e.via === 'tap' || e.via === 'keypad') {
    if (!Number.isFinite(e.from) || !Number.isFinite(e.to) || e.from === e.to) return null;
    out.delta = e.to - e.from;
  } else if (e.via === 'elim' || e.via === 'unelim') {
    out.from = e.via === 'unelim';
    out.to = e.via === 'elim';
  } else if (typeof e.from !== 'string' || typeof e.to !== 'string') {
    return null;
  }
  return out;
}

/** Journal v2 assaini : entrées invalides écartées, identifiants dédoublonnés, curseur borné. */
function parseLog(raw, n) {
  const log = createLog();
  if (!isObj(raw) || !Array.isArray(raw.entries)) return log;
  const seen = new Set();
  raw.entries.forEach((e) => {
    const entry = parseEntry(e, n);
    if (entry && !seen.has(entry.id)) {
      seen.add(entry.id);
      log.entries.push(entry);
    }
  });
  // Des entrées écartées décalent les indices : le curseur n'est alors plus fiable → tout appliqué.
  const dropped = raw.entries.length !== log.entries.length;
  const cursor = dropped ? log.entries.length : int(raw.cursor, log.entries.length);
  log.cursor = Math.max(0, Math.min(log.entries.length, cursor));
  return log;
}

/**
 * Objet prêt à être écrit sous KEYS.save (schéma v2, avec somme de contrôle).
 * Accepte l'état v2 `{ players, seatOrder, log, config }` ou l'état plat v1
 * `{ players, seatOrder, history, actionCounter, numPlayers, startPoints, maxPoints, allowNeg }`
 * (le journal est alors dérivé de l'historique). `maxPoints` Infinity est stocké null.
 * @param {object} state
 * @param {number} [now] horodatage (Date.now() par défaut)
 */
export function serializeGame(state, now = Date.now()) {
  const players = state.players.map((p) => ({
    playerName: typeof p.playerName === 'string' ? p.playerName : '',
    score: num(p.score, 0),
    eliminated: Boolean(p.eliminated),
  }));
  const n = players.length;
  const cfg = isObj(state.config) ? state.config : state;
  const log = isLog(state.log)
    ? { entries: state.log.entries.map((e) => ({ ...e })), cursor: state.log.cursor }
    : logFromGroups(Array.isArray(state.history) ? state.history : [], players, now);
  const out = {
    v: SCHEMA_VERSION,
    players,
    seatOrder: parseSeatOrder(state.seatOrder, n),
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
 * Lit une sauvegarde (texte JSON brut ou objet déjà parsé) et renvoie l'état v2 normalisé :
 * `{ ok: true, game: { players, seatOrder, log, config, ts } }` (complété, le temps de la
 * transition, des champs plats v1 de `parseGameOrNull`), ou
 * `{ ok: false, reason }` avec `reason` ∈ 'empty' (rien à restaurer), 'corrupt' (JSON invalide,
 * somme de contrôle fausse, joueurs illisibles), 'unsupported' (version de schéma inconnue).
 * Les sauvegardes v0/v1 sont migrées ; le groupe de taps encore ouvert est clos au chargement.
 * @param {string|object|null|undefined} raw
 * @returns {{ok:true,game:object}|{ok:false,reason:'corrupt'|'unsupported'|'empty'}}
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
  if (!Array.isArray(data.players) || data.players.length === 0)
    return { ok: false, reason: 'corrupt' };
  const players = data.players.map(parsePlayer);
  if (players.some((p) => p === null)) return { ok: false, reason: 'corrupt' };
  const n = players.length;
  const seatOrder = parseSeatOrder(data.seatOrder, n);
  const ts = num(data.ts, 0);

  let log;
  if (v === 2) {
    log = parseLog(data.log, n);
  } else {
    const history = Array.isArray(data.history)
      ? data.history.map(parseGroup).filter((g) => g && g.playerIdx < n)
      : [];
    log = logFromGroups(history, players, ts);
  }
  closeGroup(log);

  const config = parseConfig(v === 2 ? data.config : data, n);
  const game = { players, seatOrder, log, config, ts };
  // Transition : l'interface actuelle destructure encore la forme plate v1 sur ce résultat
  // (players, seatOrder, history, actionCounter, numPlayers, …) ; `game` est la forme de référence.
  return { ok: true, game, ...flatten(game) };
}

/**
 * Forme plate compatible avec l'interface actuelle, ou null si la sauvegarde est inexploitable :
 * `{ players, seatOrder, history, actionCounter, numPlayers, startPoints, maxPoints, allowNeg, log, ts }`
 * (`history`/`actionCounter` = projection v1 du journal).
 */
export function parseGameOrNull(raw) {
  const res = parseGame(raw);
  return res.ok ? flatten(res.game) : null;
}

/** Forme plate v1 d'un état v2 (historique et compteur projetés depuis le journal). */
function flatten({ players, seatOrder, log, config, ts }) {
  const { history, actionCounter } = groupsFromLog(log, players);
  return { players, seatOrder, history, actionCounter, ...config, log, ts };
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
