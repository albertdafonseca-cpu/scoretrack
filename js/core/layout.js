// Disposition des cartes autour de la table et calculs de tailles — logique pure, sans DOM.
//
// Principe (identique pour tout n) : le joueur 1 (siège 0) est en bas, tourné vers le bas de
// l'écran ; les sièges suivants se succèdent dans le sens horaire autour de la table : colonne
// gauche de bas en haut (cartes `rot-l`, tournées vers leur joueur), haut de table (`rot-180`),
// colonne droite de haut en bas (`rot-r`). Aucune cellule vide, quel que soit n (1 à 12) :
//   - 1 : une carte ; 2 : face à face ;
//   - n impair ≥ 3 : joueur 1 en bandeau pleine largeur, (n−1)/2 cartes latérales par côté ;
//   - 4 et 6 : deux colonnes latérales (le joueur 1 est en bas à gauche, comme historiquement) ;
//   - 8, 10, 12 : trois colonnes ; la colonne centrale est partagée entre le joueur 1 (bas,
//     `rot-0`) et le joueur d'en face (haut, `rot-180`), fusionnés en hauteur.
// La grille est décrite en cellules CSS Grid 1-indexées : { i (indice joueur), rot, c, r, cs, rs }.

/** Hauteur (px) de l'en-tête de l'écran de jeu. */
export const HEADER_H = 44;
/** Hauteur (px) de la barre d'actions. */
export const BAR_H = 68;
/** Nombre maximal de joueurs pris en charge par les dispositions. */
export const MAX_PLAYERS = 12;

const L = 'rot-l';
const R = 'rot-r';
const T = 'rot-180';
const B = 'rot-0';

/** Cellule = [siège, rotation, colonne, ligne, étendue colonnes, étendue lignes]. */
const cell = (seat, rot, c, r, cs = 1, rs = 1) => [seat, rot, c, r, cs, rs];

/** Disposition « deux colonnes latérales » : `left` sièges à gauche (de bas en haut) puis la droite. */
function twoColumns(n, withBand) {
  const k = withBand ? (n - 1) / 2 : n / 2;
  const first = withBand ? 1 : 0;
  const cells = [];
  for (let j = 0; j < k; j++) {
    cells.push(cell(first + j, L, 1, k - j));
    cells.push(cell(first + k + j, R, 2, j + 1));
  }
  if (withBand) cells.push(cell(0, B, 1, k + 1, 2, 1));
  return { cols: 2, rows: withBand ? k + 1 : k, cells };
}

/** Disposition « trois colonnes », colonne centrale partagée bas (joueur 1) / haut (vis-à-vis). */
function threeColumns(n) {
  const k = (n - 2) / 2;
  const topRows = Math.floor(k / 2);
  const cells = [];
  for (let j = 0; j < k; j++) {
    cells.push(cell(1 + j, L, 1, k - j));
    cells.push(cell(k + 2 + j, R, 3, j + 1));
  }
  cells.push(cell(k + 1, T, 2, 1, 1, topRows));
  cells.push(cell(0, B, 2, topRows + 1, 1, k - topRows));
  return { cols: 3, rows: k, cells };
}

/** Table de placement pour n joueurs : { cols, rows, cells }. */
function table(n) {
  if (!Number.isInteger(n) || n < 1 || n > MAX_PLAYERS)
    return { cols: 1, rows: 1, cells: [cell(0, B, 1, 1)] };
  if (n === 1) return { cols: 1, rows: 1, cells: [cell(0, B, 1, 1)] };
  if (n === 2) return { cols: 1, rows: 2, cells: [cell(1, T, 1, 1), cell(0, B, 1, 2)] };
  if (n === 3) {
    return {
      cols: 2,
      rows: 3,
      cells: [cell(1, L, 1, 1, 1, 2), cell(2, R, 2, 1, 1, 2), cell(0, B, 1, 3, 2, 1)],
    };
  }
  if (n % 2 === 1) return twoColumns(n, true);
  if (n <= 6) return twoColumns(n, false);
  return threeColumns(n);
}

/**
 * Calcule la grille pour `n` joueurs et l'ordre des sièges (`seatOrder[siège]` = indice joueur).
 * Les cellules sont renvoyées dans l'ordre des sièges (le joueur 1 en premier).
 * @param {number} n nombre de joueurs (1 à 12 ; toute autre valeur retombe sur une carte)
 * @param {number[]} seatOrder permutation des indices joueurs
 * @returns {{cols:number, rows:number, placements:Array<{i:number,rot:string,c:number,r:number,cs:number,rs:number}>}}
 */
export function computeLayout(n, seatOrder) {
  const t = table(n);
  const placements = t.cells
    .slice()
    .sort((a, b) => a[0] - b[0])
    .map(([seat, rot, c, r, cs, rs]) => ({
      i: seatOrder[seat] === undefined ? seat : seatOrder[seat],
      rot,
      c,
      r,
      cs,
      rs,
    }));
  return { cols: t.cols, rows: t.rows, placements };
}

/**
 * Mesures d'une disposition (pour les tests et l'audit) : aire vide, plus petite cellule.
 * Les aires sont des fractions de la zone de jeu ; avec `{ width, height }` (px de l'écran),
 * `minCellPx` donne la plus petite cellule en pixels et `minRef` la plus petite dimension utile.
 * @param {number} n
 * @param {{width?:number,height?:number}} [viewport]
 */
export function layoutStats(n, { width, height } = {}) {
  const { cols, rows, placements } = computeLayout(n, identity(n));
  const unit = 1 / (cols * rows);
  const areas = placements.map((p) => p.cs * p.rs * unit);
  // Arrondi à 1e-9 : la somme de fractions flottantes ne tombe pas exactement sur 1.
  const covered = Math.round(areas.reduce((s, a) => s + a, 0) * 1e9) / 1e9;
  const minCellArea = Math.min(...areas);
  const stats = {
    n,
    cols,
    rows,
    cells: placements.length,
    emptyArea: Math.max(0, 1 - covered),
    emptyPct: Math.round(Math.max(0, 1 - covered) * 1000) / 10,
    minCellArea,
    maxCellArea: Math.max(...areas),
    idealArea: 1 / n,
    minRatio: minCellArea * n,
  };
  if (width && height) {
    const areaH = height - HEADER_H - BAR_H;
    let minRef = Infinity;
    let minCellPx = null;
    placements.forEach((p) => {
      const w = (width / cols) * p.cs;
      const h = (areaH / rows) * p.rs;
      const ref = Math.min(w, h);
      const smallerArea = minCellPx && w * h < minCellPx.w * minCellPx.h;
      if (ref < minRef || (ref === minRef && smallerArea)) {
        minRef = ref;
        minCellPx = { w: Math.round(w), h: Math.round(h) };
      }
    });
    stats.minCellPx = minCellPx;
    stats.minRef = Math.round(minRef);
  }
  return stats;
}

function identity(n) {
  return Array.from({ length: Math.max(1, n | 0) }, (_, i) => i);
}

/** Rotation des sièges d'un cran : le dernier passe en tête (mute et renvoie le tableau). */
export function rotateSeats(seatOrder) {
  if (seatOrder.length < 2) return seatOrder;
  seatOrder.unshift(seatOrder.pop());
  return seatOrder;
}

/**
 * Longueur maximale d'un prénom pour qu'il tienne sur la plus petite carte de la disposition.
 * Dérivée de `computeLayout` : largeur utile d'une carte latérale = plus petite dimension de sa
 * cellule ; toujours bornée entre 3 et 18 caractères.
 */
export function nameMaxLength(numPlayers, viewportW, viewportH) {
  const { cols, rows, placements } = computeLayout(numPlayers, identity(numPlayers));
  const areaH = viewportH - HEADER_H - BAR_H;
  let effectiveW = Infinity;
  placements.forEach((p) => {
    const w = (viewportW / cols) * p.cs;
    const h = (areaH / rows) * p.rs;
    const isLateral = p.rot === L || p.rot === R;
    effectiveW = Math.min(effectiveW, isLateral ? Math.min(w, h) : w);
  });
  const fontSize = effectiveW * 0.13 * 0.84;
  const charWidth = fontSize * 0.62;
  return Math.max(3, Math.min(18, Math.floor((effectiveW * 0.84) / charWidth)));
}

/**
 * Tailles de texte (px) d'une carte à partir de sa zone visible (visH × visW) et du score affiché.
 * @returns {{scoreSz:number,deltaSz:number,signSz:number,nameSz:number,ghostH:number}}
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
