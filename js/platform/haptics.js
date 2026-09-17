// Retour haptique — motifs distincts par événement, no-op silencieux sans API Vibration.
// La préférence « vibrations » est lue dans `scoretrack_settings` (`vibrations: false` pour désactiver) ;
// ce module ne l'écrit jamais (le réglage est branché par l'interface).
import { KEYS } from '../core/save-schema.js';
import { STORAGE_EVENT, readJSON } from './storage.js';

/** Motifs (ms) : un nombre = vibration simple, un tableau = alternance vibration/pause. */
export const PATTERNS = Object.freeze({
  tap: 10,
  floor: [30, 20, 30],
  ceiling: [30, 20, 30],
  elim: [50, 30, 80],
  win: [40, 60, 40, 60, 120],
  undo: [15, 30, 15],
  longpress: 20,
});

/** @deprecated Motif « limite atteinte » : utiliser `haptic('floor')` / `haptic('ceiling')`. */
export const PATTERN_BLOCKED = PATTERNS.floor;
/** @deprecated Motif « élimination » : utiliser `haptic('elim')`. */
export const PATTERN_ELIM = PATTERNS.elim;

let enabledCache = null;

if (typeof window !== 'undefined') {
  window.addEventListener(STORAGE_EVENT, (e) => {
    if (!e.detail || e.detail.key === null || e.detail.key === KEYS.settings) enabledCache = null;
  });
  window.addEventListener('storage', (e) => {
    if (e.key === null || e.key === KEYS.settings) enabledCache = null;
  });
}

/** Vrai si l'utilisateur n'a pas désactivé les vibrations (activées par défaut). */
export function hapticsEnabled() {
  if (enabledCache === null) {
    const settings = readJSON(KEYS.settings, null);
    enabledCache = !(settings && settings.vibrations === false);
  }
  return enabledCache;
}

/** Vrai si l'appareil expose l'API Vibration. */
export function hapticsSupported() {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

/** Déclenche un motif brut (préférence respectée) ; renvoie true si l'appel a été fait. */
export function vibrate(pattern) {
  if (!hapticsSupported() || !hapticsEnabled()) return false;
  try {
    return navigator.vibrate(pattern) !== false;
  } catch {
    return false;
  }
}

/**
 * Retour haptique nommé : 'tap' | 'floor' | 'ceiling' | 'elim' | 'win' | 'undo' | 'longpress'.
 * Le dédoublonnage souris/tactile est à la charge de l'appelant (un seul appel par changement de score).
 */
export function haptic(kind) {
  const pattern = PATTERNS[kind];
  return pattern === undefined ? false : vibrate(pattern);
}
