// Disposition des cartes autour de la table et calculs de tailles — logique pure, sans DOM.

/** Hauteur (px) de l'en-tête de l'écran de jeu. */
export const HEADER_H = 44;
/** Hauteur (px) de la barre d'actions. */
export const BAR_H = 68;

const L = 'rot-l';
const R = 'rot-r';
const T = 'rot-180';
const B = 'rot-0';

/** Cellule vide (centre de table). */
const EMPTY = -1;

/**
 * Tables de placement : pour n joueurs, { cols, rows, cells }.
 * Chaque cellule = [seat, rot, col, row, colSpan, rowSpan] ; seat = indice dans seatOrder (-1 = vide).
 */
const TABLES = {
  1: { cols: 1, rows: 1, cells: [[0, B, 1, 1, 1, 1]] },
  2: {
    cols: 1,
    rows: 2,
    cells: [
      [1, T, 1, 1, 1, 1],
      [0, B, 1, 2, 1, 1],
    ],
  },
  // J1 = bas pleine largeur (1/3 hauteur), J2 = gauche-haut, J3 = droite-haut (2/3 hauteur)
  3: {
    cols: 2,
    rows: 3,
    cells: [
      [1, L, 1, 1, 1, 2],
      [2, R, 2, 1, 1, 2],
      [0, B, 1, 3, 2, 1],
    ],
  },
  4: {
    cols: 2,
    rows: 2,
    cells: [
      [1, L, 1, 1, 1, 1],
      [2, R, 2, 1, 1, 1],
      [0, L, 1, 2, 1, 1],
      [3, R, 2, 2, 1, 1],
    ],
  },
  5: {
    cols: 2,
    rows: 3,
    cells: [
      [2, L, 1, 1, 1, 1],
      [3, R, 2, 1, 1, 1],
      [1, L, 1, 2, 1, 1],
      [4, R, 2, 2, 1, 1],
      [0, B, 1, 3, 2, 1],
    ],
  },
  6: {
    cols: 2,
    rows: 3,
    cells: [
      [2, L, 1, 1, 1, 1],
      [3, R, 2, 1, 1, 1],
      [1, L, 1, 2, 1, 1],
      [4, R, 2, 2, 1, 1],
      [0, L, 1, 3, 1, 1],
      [5, R, 2, 3, 1, 1],
    ],
  },
  7: {
    cols: 3,
    rows: 3,
    cells: [
      [3, L, 1, 1, 1, 1],
      [EMPTY, null, 2, 1, 1, 1],
      [4, R, 3, 1, 1, 1],
      [2, L, 1, 2, 1, 1],
      [EMPTY, null, 2, 2, 1, 1],
      [5, R, 3, 2, 1, 1],
      [1, L, 1, 3, 1, 1],
      [0, B, 2, 3, 1, 1],
      [6, R, 3, 3, 1, 1],
    ],
  },
  8: {
    cols: 3,
    rows: 3,
    cells: [
      [3, L, 1, 1, 1, 1],
      [4, T, 2, 1, 1, 1],
      [5, R, 3, 1, 1, 1],
      [2, L, 1, 2, 1, 1],
      [EMPTY, null, 2, 2, 1, 1],
      [6, R, 3, 2, 1, 1],
      [1, L, 1, 3, 1, 1],
      [0, B, 2, 3, 1, 1],
      [7, R, 3, 3, 1, 1],
    ],
  },
  9: {
    cols: 3,
    rows: 4,
    cells: [
      [4, L, 1, 1, 1, 1],
      [EMPTY, null, 2, 1, 1, 1],
      [5, R, 3, 1, 1, 1],
      [3, L, 1, 2, 1, 1],
      [EMPTY, null, 2, 2, 1, 1],
      [6, R, 3, 2, 1, 1],
      [2, L, 1, 3, 1, 1],
      [EMPTY, null, 2, 3, 1, 1],
      [7, R, 3, 3, 1, 1],
      [1, L, 1, 4, 1, 1],
      [0, B, 2, 4, 1, 1],
      [8, R, 3, 4, 1, 1],
    ],
  },
  10: {
    cols: 3,
    rows: 4,
    cells: [
      [4, L, 1, 1, 1, 1],
      [5, T, 2, 1, 1, 1],
      [6, R, 3, 1, 1, 1],
      [3, L, 1, 2, 1, 1],
      [EMPTY, null, 2, 2, 1, 1],
      [7, R, 3, 2, 1, 1],
      [2, L, 1, 3, 1, 1],
      [EMPTY, null, 2, 3, 1, 1],
      [8, R, 3, 3, 1, 1],
      [1, L, 1, 4, 1, 1],
      [0, B, 2, 4, 1, 1],
      [9, R, 3, 4, 1, 1],
    ],
  },
  11: {
    cols: 3,
    rows: 5,
    cells: [
      [5, L, 1, 1, 1, 1],
      [EMPTY, null, 2, 1, 1, 1],
      [6, R, 3, 1, 1, 1],
      [4, L, 1, 2, 1, 1],
      [EMPTY, null, 2, 2, 1, 1],
      [7, R, 3, 2, 1, 1],
      [3, L, 1, 3, 1, 1],
      [EMPTY, null, 2, 3, 1, 1],
      [8, R, 3, 3, 1, 1],
      [2, L, 1, 4, 1, 1],
      [EMPTY, null, 2, 4, 1, 1],
      [9, R, 3, 4, 1, 1],
      [1, L, 1, 5, 1, 1],
      [0, B, 2, 5, 1, 1],
      [10, R, 3, 5, 1, 1],
    ],
  },
  12: {
    cols: 3,
    rows: 5,
    cells: [
      [5, L, 1, 1, 1, 1],
      [6, T, 2, 1, 1, 1],
      [7, R, 3, 1, 1, 1],
      [4, L, 1, 2, 1, 1],
      [EMPTY, null, 2, 2, 1, 1],
      [8, R, 3, 2, 1, 1],
      [3, L, 1, 3, 1, 1],
      [EMPTY, null, 2, 3, 1, 1],
      [9, R, 3, 3, 1, 1],
      [2, L, 1, 4, 1, 1],
      [EMPTY, null, 2, 4, 1, 1],
      [10, R, 3, 4, 1, 1],
      [1, L, 1, 5, 1, 1],
      [0, B, 2, 5, 1, 1],
      [11, R, 3, 5, 1, 1],
    ],
  },
};

/**
 * Calcule la grille pour `n` joueurs et l'ordre des sièges.
 * Renvoie { cols, rows, placements:[{ i, rot, c, r, cs, rs }] } ; i = indice joueur ou -1 (vide).
 */
export function computeLayout(n, seatOrder) {
  const table = TABLES[n] || TABLES[1];
  return {
    cols: table.cols,
    rows: table.rows,
    placements: table.cells.map(([seat, rot, c, r, cs, rs]) => ({
      i: seat === EMPTY ? -1 : seatOrder[seat],
      rot: seat === EMPTY ? undefined : rot,
      c,
      r,
      cs,
      rs,
    })),
  };
}

/** Rotation des sièges d'un cran : le dernier passe en tête (mute et renvoie le tableau). */
export function rotateSeats(seatOrder) {
  if (seatOrder.length < 2) return seatOrder;
  seatOrder.unshift(seatOrder.pop());
  return seatOrder;
}

/** Longueur maximale d'un prénom pour qu'il tienne sur une carte à cette taille d'écran. */
export function nameMaxLength(numPlayers, viewportW, viewportH) {
  let cardVisW;
  if (numPlayers <= 2) cardVisW = viewportW;
  else if (numPlayers <= 6) cardVisW = viewportW / 2;
  else cardVisW = viewportW / 3;
  const rows =
    numPlayers <= 2
      ? numPlayers
      : numPlayers <= 4
        ? 2
        : numPlayers <= 6
          ? 3
          : numPlayers <= 10
            ? 4
            : 5;
  const cardVisH = (viewportH - HEADER_H - BAR_H) / rows;
  const isLateral = numPlayers >= 3;
  const effectiveW = isLateral ? Math.min(cardVisW, cardVisH) : cardVisW;
  const fontSize = effectiveW * 0.13 * 0.84;
  const charWidth = fontSize * 0.62;
  return Math.max(3, Math.min(18, Math.floor((effectiveW * 0.84) / charWidth)));
}

/**
 * Tailles de texte (px) d'une carte à partir de sa zone visible (visH × visW) et du score affiché.
 * Renvoie { scoreSz, deltaSz, signSz, nameSz, ghostH }.
 */
export function computeFit(visH, visW, scoreStr) {
  const usH = visH * 0.84;
  const usW = visW * 0.84;
  // Référence = plus petite dimension utile — cohérente pour toutes les dispositions
  const ref = Math.min(usH, usW);
  // Plafond proportionnel : les grandes cartes (1-2 joueurs) affichent plus grand
  const cap = Math.min(ref * 0.55, 180);
  const nChars = (scoreStr || '0').replace(/\s/g, '').length || 1;
  const charRatio =
    nChars <= 2 ? 0.55 : nChars <= 3 ? 0.42 : nChars <= 4 ? 0.32 : nChars <= 5 ? 0.26 : 0.22;
  const scoreSz = Math.max(12, Math.min(ref * charRatio, cap));
  const deltaSz = Math.max(8, scoreSz * 0.42);
  const signSz = Math.max(10, Math.min(ref * 0.18, scoreSz * 0.55));
  const nameSz = Math.max(8, Math.min(ref * 0.13, 32));
  const ghostH = Math.max(8, nameSz);
  return { scoreSz, deltaSz, signSz, nameSz, ghostH };
}
