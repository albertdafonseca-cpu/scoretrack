// Schéma de sauvegarde localStorage — sérialisation et migration v0 → v1, logique pure.
// v0 = format historique sans numéro de version ; v1 ajoute `v: 1` et normalise les types.

export const SCHEMA_VERSION = 1;

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

// ── Réglages ────────────────────────────────────────────────────────

/** Objet prêt à être écrit sous KEYS.settings. */
export function serializeSettings(settings) {
  return {
    v: SCHEMA_VERSION,
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

/**
 * Objet prêt à être écrit sous KEYS.save.
 * `state` = { players, seatOrder, history, actionCounter, numPlayers, startPoints, maxPoints, allowNeg }.
 * `maxPoints` Infinity est stocké null (JSON ne connaît pas Infinity).
 */
export function serializeGame(state, now = Date.now()) {
  return {
    v: SCHEMA_VERSION,
    players: state.players,
    seatOrder: state.seatOrder,
    history: state.history,
    actionCounter: state.actionCounter,
    numPlayers: state.numPlayers,
    startPoints: state.startPoints,
    maxPoints: state.maxPoints === Infinity ? null : state.maxPoints,
    allowNeg: state.allowNeg,
    ts: now,
  };
}

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

/**
 * État de partie normalisé à partir du JSON brut (v0 ou v1), ou null si la sauvegarde est inexploitable.
 * Une sauvegarde v0 (sans `v`) est acceptée telle quelle : mêmes champs, seuls les types sont assainis.
 */
export function parseGame(raw) {
  if (!isObj(raw) || !Array.isArray(raw.players) || raw.players.length === 0) return null;
  const players = raw.players.map(parsePlayer);
  if (players.some((p) => p === null)) return null;
  const n = players.length;

  let seatOrder = Array.isArray(raw.seatOrder) ? raw.seatOrder : [];
  const validSeats =
    seatOrder.length === n &&
    seatOrder.every((i) => Number.isInteger(i) && i >= 0 && i < n) &&
    new Set(seatOrder).size === n;
  if (!validSeats) seatOrder = players.map((_, i) => i);

  const history = Array.isArray(raw.history)
    ? raw.history.map(parseGroup).filter((g) => g && g.playerIdx < n)
    : [];
  const maxRank = history.reduce((m, g) => Math.max(m, g.rank), 0);

  return {
    players,
    seatOrder,
    history,
    actionCounter: Math.max(int(raw.actionCounter, 0), maxRank),
    numPlayers: n,
    startPoints: num(raw.startPoints, 0),
    maxPoints:
      raw.maxPoints === null || raw.maxPoints === undefined
        ? Infinity
        : num(raw.maxPoints, Infinity),
    allowNeg: Boolean(raw.allowNeg),
  };
}

// ── Profils (prénoms mémorisés) ─────────────────────────────────────

/** Objet prêt à être écrit sous KEYS.profiles (v1 : { v, names }). */
export function serializeProfiles(names) {
  return { v: SCHEMA_VERSION, names: names.slice(-MAX_PROFILES) };
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
