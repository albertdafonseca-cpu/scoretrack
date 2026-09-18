// Disposition des cartes autour de la table et tailles de texte — logique pure, sans DOM.
//
// Principe (identique pour tout n) : le joueur 1 (siège 0) est en bas ; les sièges suivants se
// succèdent dans le sens horaire autour de la table : colonne gauche de bas en haut (cartes
// `rot-l`, tournées vers leur joueur), haut de table (`rot-180`), colonne droite de haut en bas
// (`rot-r`). Aucune cellule vide, quel que soit n (1 à 12) :
//   - 1 : une carte ; 2 : face à face ;
//   - n impair ≥ 3 : joueur 1 en bandeau pleine largeur, (n−1)/2 cartes latérales par côté ;
//   - 4 et 6 : deux colonnes latérales (deux joueurs par grand côté de table) ;
//   - 8, 10, 12 : trois colonnes ; la colonne centrale est partagée entre le joueur 1 (bas,
//     `rot-0`) et le joueur d'en face (haut, `rot-180`), fusionnés en hauteur.
//
// Arbitrage n = 6 (proposition « 3 colonnes, 6 cellules égales, joueur 1 droit ») : REFUSÉE, mesures
// à l'appui sur 390×844. En 2 colonnes, la plus petite carte fait 195×244 px et `computeFit` y pose
// un score de 143 px ; en 3 colonnes elle ferait 130×366 px pour un score de 96 px, soit −33 % de
// hauteur de chiffre. La lisibilité à 1 m (D8) prime sur l'uniformité d'orientation du joueur 1,
// d'autant qu'à 4 et 6 joueurs on s'assoit par paires sur les grands côtés de la table.
//
// Marge du critère « plus petite cellule » : à n = 12, la grille 3×5 donne 15 unités pour 12 cartes,
// soit un rapport de 0,80 à l'aire idéale — c'est l'optimum d'un anneau périmétrique sans cellule
// vide (une grille 3×4 égaliserait tout mais placerait 2 joueurs AU CENTRE de la table, et une 4×4
// laisserait 25 % de vide). Le seuil testé est donc 0,75, avec la table exacte des 12 valeurs
// verrouillée par un test : toute évolution de disposition se voit immédiatement.

/** Hauteur (px) de l'en-tête de l'écran de jeu. */
export const HEADER_H = 44;
/** Hauteur (px) de la barre d'actions. */
export const BAR_H = 68;
/** Nombre maximal de joueurs pris en charge par les dispositions. */
export const MAX_PLAYERS = 12;

/** Plancher typographique (px) du score et du nom (décision D10 : aucun texte sous 12 px). */
export const MIN_SCORE_PX = 14;
export const MIN_NAME_PX = 12;
/** Plafonds au-delà desquels agrandir n'apporte plus rien. */
export const MAX_SCORE_PX = 240;
export const MAX_NAME_PX = 34;
/** Hauteur de chiffre en deçà de laquelle on préfère supprimer les séparateurs de milliers. */
export const READABLE_SCORE_PX = 30;

const L = 'rot-l';
const R = 'rot-r';
const T = 'rot-180';
const B = 'rot-0';

/** Cellule = [siège, rotation, colonne, ligne, étendue colonnes, étendue lignes]. */
const cell = (seat, rot, c, r, cs = 1, rs = 1) => [seat, rot, c, r, cs, rs];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Disposition « deux colonnes latérales », avec ou sans bandeau bas pour le joueur 1. */
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
  if (!Number.isInteger(n) || n < 1 || n > MAX_PLAYERS) {
    return { cols: 1, rows: 1, cells: [cell(0, B, 1, 1)] };
  }
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

/** Vrai si cette rotation couche la carte (le texte court alors sur la hauteur de la cellule). */
const isLateral = (rot) => rot === L || rot === R;

/**
 * Repère lisible d'une carte, APRÈS rotation : `{ w, h }` = largeur et hauteur vues par le joueur
 * assis en face d'elle (pour une carte latérale, largeur et hauteur de la cellule sont échangées).
 * C'est le repère attendu par `computeFit`.
 * @param {{rot:string,cs:number,rs:number}} placement cellule issue de `computeLayout`
 * @param {{cols:number,rows:number,width:number,height:number}} grid grille et écran (px)
 */
export function cardBox(placement, { cols, rows, width, height }) {
  const areaH = height - HEADER_H - BAR_H;
  const w = (width / cols) * placement.cs;
  const h = (areaH / rows) * placement.rs;
  return isLateral(placement.rot) ? { w: h, h: w } : { w, h };
}

/**
 * Mesures d'une disposition (tests et audit) : aire vide, plus petite cellule, repère de la carte
 * la plus contrainte. Les aires sont des fractions de la zone de jeu ; avec `{ width, height }`
 * (px de l'écran), `minCellPx` donne la plus petite cellule et `minCard` son repère lisible.
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
    minRatio: minCellArea * n,
  };
  if (width && height) {
    const areaH = height - HEADER_H - BAR_H;
    let minRef = Infinity;
    let minCellPx = null;
    let minCard = null;
    placements.forEach((p) => {
      const w = (width / cols) * p.cs;
      const h = (areaH / rows) * p.rs;
      const ref = Math.min(w, h);
      const smallerArea = minCellPx && w * h < minCellPx.w * minCellPx.h;
      if (ref < minRef || (ref === minRef && smallerArea)) {
        minRef = ref;
        minCellPx = { w: Math.round(w), h: Math.round(h) };
        minCard = cardBox(p, { cols, rows, width, height });
      }
    });
    stats.minCellPx = minCellPx;
    stats.minCard = minCard;
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

// ── Tailles de texte ────────────────────────────────────────────────

/** Fractions de la carte réellement disponibles pour le texte (marges intérieures). */
const USABLE_W = 0.9;
const USABLE_H = 0.88;
/** Chasse moyenne, en em : chiffre (police tabulaire), séparateur de milliers, signe, lettre. */
const ADV_DIGIT = 0.6;
const ADV_SEP = 0.28;
const ADV_SIGN = 0.45;
const ADV_LETTER = 0.62;

/** Largeur (en em) d'une chaîne de score : chiffres, séparateurs de milliers et signe. */
function scoreAdvance(str, withSeparators) {
  let adv = 0;
  for (const ch of str) {
    if (ch >= '0' && ch <= '9') adv += ADV_DIGIT;
    else if (ch === '-' || ch === '−' || ch === '+') adv += ADV_SIGN;
    else if (withSeparators) adv += ADV_SEP;
  }
  return adv || ADV_DIGIT;
}

/**
 * Tailles de texte (px) d'une carte à partir de son repère lisible et du score affiché.
 *
 * Le score est contraint par les DEUX dimensions du repère : sa hauteur de glyphe par la hauteur
 * restante sous le nom, sa largeur par la largeur disponible (une carte latérale est large et
 * basse : c'est ce que l'ancienne formule, fondée sur la seule plus petite dimension, ratait).
 * Quand les séparateurs de milliers font tomber le score sous `READABLE_SCORE_PX`, la fonction
 * demande à l'interface de les retirer (`compact: true`) plutôt que de rapetisser le nombre.
 *
 * @param {{w:number,h:number}} box repère APRÈS rotation (voir `cardBox`) : largeur × hauteur
 *   vues par le joueur assis en face de la carte
 * @param {string} scoreStr score tel qu'il serait affiché (`fmtNum`, séparateurs compris)
 * @returns {{scoreSz:number, nameSz:number, signSz:number, deltaSz:number, ghostH:number,
 *   compact:boolean}} tailles en px ; `compact` = afficher le score sans séparateurs de milliers
 */
export function computeFit(box, scoreStr) {
  const w = box && box.w > 0 ? box.w : 0;
  const h = box && box.h > 0 ? box.h : 0;
  const usableW = w * USABLE_W;
  const usableH = h * USABLE_H;

  const nameSz = clamp(h * 0.12, MIN_NAME_PX, MAX_NAME_PX);
  const scoreH = usableH - nameSz * 1.2;

  const str = String(
    scoreStr === undefined || scoreStr === null || scoreStr === '' ? '0' : scoreStr,
  );
  const full = scoreAdvance(str, true);
  const compactAdv = scoreAdvance(str, false);
  const sizeFull = Math.min(scoreH, usableW / full);
  const sizeCompact = Math.min(scoreH, usableW / compactAdv);
  const compact = compactAdv < full && sizeFull < READABLE_SCORE_PX;
  const scoreSz = clamp(compact ? sizeCompact : sizeFull, MIN_SCORE_PX, MAX_SCORE_PX);

  return {
    scoreSz,
    nameSz,
    signSz: clamp(Math.min(w, h) * 0.18, 24, 72),
    deltaSz: clamp(scoreSz * 0.34, MIN_NAME_PX, 44),
    ghostH: Math.round(nameSz * 1.15),
    compact,
  };
}

/**
 * Longueur maximale d'un prénom pour qu'il tienne en entier sur la carte la PLUS PETITE de la
 * disposition, à cette taille d'écran : la taille du nom vient de la hauteur du repère lisible
 * (comme `computeFit`), sa longueur de la largeur disponible. Bornée entre 3 et 18 caractères
 * (18 = maximum de saisie de l'écran des prénoms, atteint sur les grandes cartes).
 * @param {number} numPlayers 1 à 12
 * @param {number} viewportW largeur d'écran (px)
 * @param {number} viewportH hauteur d'écran (px)
 * @returns {number} nombre de caractères
 */
export function nameMaxLength(numPlayers, viewportW, viewportH) {
  const { minCard } = layoutStats(numPlayers, { width: viewportW, height: viewportH });
  if (!minCard) return 3;
  const { nameSz } = computeFit(minCard, '0');
  const chars = Math.floor((minCard.w * USABLE_W) / (nameSz * ADV_LETTER));
  return clamp(chars, 3, 18);
}
