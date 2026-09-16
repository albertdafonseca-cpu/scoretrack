// Retour haptique — no-op si l'API Vibration est absente.

/** Motif « limite atteinte » (impossible de descendre sous 0). */
export const PATTERN_BLOCKED = [30, 20, 30];
/** Motif « élimination à confirmer ». */
export const PATTERN_ELIM = [50, 30, 80];

/** Déclenche une vibration si disponible ; renvoie true si l'appel a été fait. */
export function vibrate(pattern) {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
  try {
    navigator.vibrate(pattern);
    return true;
  } catch {
    return false;
  }
}
