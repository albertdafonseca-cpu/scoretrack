// Formatage des nombres — logique pure, sans DOM.

/** Formate un score : brut sous 1000, séparateur de milliers fr-FR au-delà. */
export function fmtNum(n) {
  if (Math.abs(n) < 1000) return String(n);
  return n.toLocaleString('fr-FR');
}
