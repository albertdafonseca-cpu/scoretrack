// Application au DOM des tailles calculées par `computeFit` (js/core/layout.js).
//
// Le CALCUL appartient au cœur : `cardBox` donne le repère lisible d'une carte (après rotation) et
// `computeFit` en déduit les tailles du score, du nom, des signes et de la bulle, avec le plancher
// typographique de 12 px et le drapeau `compact` (score sans séparateurs de milliers). Ce module
// n'ajoute qu'une chose, impossible à calculer hors du DOM : une CORRECTION par la largeur
// réellement rendue. Les 14 thèmes vont de « Press Start 2P » (chasse 1 em) à « Inter » (0,55 em) ;
// aucune chasse moyenne ne peut couvrir cet écart, donc on mesure et on réduit si nécessaire.
//
// Trois passes au plus, toutes déterministes : aucune minuterie, aucun sondage.
import { LINE_GAP, MAX_NAME_PX, MAX_SCORE_PX, MIN_NAME_PX, MIN_SCORE_PX } from '../core/layout.js';

/** Fraction de la largeur du repère réellement utilisable (identique à `computeFit`). */
const USABLE_W = 0.9;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Rapport entre la taille de police de la racine et sa valeur de référence (16 px).
 *
 * D19 : l'échelle typographique suit la préférence système. Sur l'écran de jeu, le SCORE est déjà
 * maximal — il occupe toute la place de sa carte, on ne peut pas l'agrandir. Le BLOC D'IDENTITÉ
 * (numéro + prénom), lui, ne l'est pas : on lui applique donc la préférence, jusqu'à la limite
 * géométrique, la réduction par mesure garantissant qu'aucun prénom n'est tronqué pour autant.
 * Borné à 2 : au-delà, la carte ne contiendrait plus que le prénom.
 */
function rootScale() {
  if (typeof getComputedStyle !== 'function') return 1;
  const px = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(px) && px > 0 ? clamp(px / 16, 1, 2) : 1;
}

/** Contexte de mesure partagé (une seule allocation pour toute la partie). */
let inkCtx = null;
function measureContext() {
  if (inkCtx === null && typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    inkCtx = canvas.getContext ? canvas.getContext('2d') : false;
  }
  return inkCtx || null;
}

/**
 * Métriques de TRACÉ d'un score, à une taille donnée, pour la police effectivement rendue.
 *
 * Tout le dimensionnement vertical du chiffre en dépend, et il ne peut pas se déduire du corps :
 * les quatorze thèmes vont de chiffres alignés sans jambage (« Share Tech Mono ») à des chiffres
 * elzéviriens qui descendent sous la ligne de base (« Cinzel »).
 *
 * `lh` est l'INTERLIGNE posé sur l'élément quand le score est rendu sur deux lignes : juste de quoi
 * séparer le jambage d'une ligne du sommet de la suivante, plus 8 % de respiration. L'interligne
 * générique `LINE_GAP` du cœur (1,02) est un repère de calcul prudent ; l'appliquer tel quel
 * coûtait 9 % de hauteur de capitale sur la plus petite carte, pour du blanc entre deux rangées de
 * chiffres qui n'en ont pas besoin.
 *
 * @returns {{asc:number, desc:number, lh:number, span:number}|null} `span` = hauteur totale du
 *   tracé des `rows` lignes ; `null` si la mesure est indisponible
 */
function inkMetrics(node, size, text, rows) {
  const ctx = measureContext();
  if (!ctx) return null;
  const cs = getComputedStyle(node);
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${size}px ${cs.fontFamily}`;
  let asc = 0;
  let desc = 0;
  for (const line of String(text).split('\n')) {
    const m = ctx.measureText(line || '0');
    asc = Math.max(asc, m.actualBoundingBoxAscent || 0);
    desc = Math.max(desc, m.actualBoundingBoxDescent || 0);
  }
  if (!(asc + desc > 0)) return null;
  const lh = rows > 1 ? asc + desc + size * 0.08 : size * LINE_GAP;
  return { asc, desc, lh, span: (rows - 1) * lh + asc + desc };
}

/**
 * Décalage vertical à appliquer au bloc du score pour que son TRACÉ soit centré dans sa fenêtre,
 * et non sa boîte de ligne.
 *
 * Les chiffres n'ont pas de jambage : leur tracé occupe le haut du cadratin. Centrer la boîte
 * (ce que fait `align-items: center`) laisse donc systématiquement trop de place sous le chiffre et
 * pas assez au-dessus — mesuré à 5 px de tracé rogné en haut à quatre joueurs, thème par défaut.
 * @returns {number} décalage en px (positif = vers le bas), 0 si la mesure est indisponible
 */
function inkOffset(node, size, text, rows) {
  const ctx = measureContext();
  const metrics = inkMetrics(node, size, text, rows);
  if (!ctx || !metrics) return 0;
  const cs = getComputedStyle(node);
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${size}px ${cs.fontFamily}`;
  const first = ctx.measureText(String(text).split('\n')[0] || '0');
  const fAsc = first.fontBoundingBoxAscent;
  const fDesc = first.fontBoundingBoxDescent;
  if (!(fAsc >= 0) || !(fDesc >= 0)) return 0;
  // Position de la première ligne de base dans la boîte du bloc, telle que la pose le navigateur.
  const base = (metrics.lh - (fAsc + fDesc)) / 2 + fAsc;
  const top = base - metrics.asc;
  const bottom = base + (rows - 1) * metrics.lh + metrics.desc;
  return (rows * metrics.lh) / 2 - (top + bottom) / 2;
}

/** Écart relatif entre la taille calculée par le cœur et celle réellement posée (dernier appel). */
let lastGap = 0;

/**
 * Écart relatif du dernier ajustement (0 = le rendu applique exactement ce que `computeFit` a
 * calculé). Au-delà de 0,2, la géométrie de la carte contredit le cœur : c'est un défaut, et les
 * tests le vérifient (tests/e2e/game.spec.js).
 */
export function lastFitGap() {
  return lastGap;
}

/**
 * Pose `size` sur `node` puis le réduit jusqu'à ce que sa largeur RENDUE tienne dans `avail`.
 * @returns {number} taille retenue (px)
 */
function shrinkToWidth(node, size, avail, min, max) {
  let current = clamp(size, min, max);
  node.style.fontSize = `${current}px`;
  for (let pass = 0; pass < 4; pass++) {
    const rendered = node.scrollWidth;
    if (rendered <= avail || rendered === 0) break;
    const next = clamp((current * avail) / rendered - 0.5, min, max);
    if (next >= current) break;
    current = next;
    node.style.fontSize = `${current}px`;
  }
  return current;
}

/**
 * Réduit le bloc d'identité (`row` = numéro + prénom) jusqu'à ce que le PRÉNOM cesse de déborder
 * de la place que la mise en page lui laisse réellement.
 *
 * Mesurer la largeur du bloc entier ne suffisait pas : `.pplayer` est un élément flexible, borné
 * par la boîte de contenu de la carte, et la boucle s'arrêtait quelques pixels trop tôt — l'ellipse
 * tombait alors même sur des prénoms de cinq lettres. On compare donc directement la largeur
 * naturelle du prénom (`scrollWidth`) à la largeur qui lui est accordée (`clientWidth`).
 * @returns {number} taille retenue (px)
 */
function shrinkLabel(row, label, size, avail, min, max) {
  if (!label) return shrinkToWidth(row, size, avail, min, max);
  let current = clamp(size, min, max);
  row.style.fontSize = `${current}px`;
  for (let pass = 0; pass < 5; pass++) {
    const natural = label.scrollWidth;
    const room = label.clientWidth;
    if (natural <= room + 0.5 || natural === 0 || room === 0) break;
    const next = clamp((current * room) / natural - 0.5, min, max);
    if (next >= current) break;
    current = next;
    row.style.fontSize = `${current}px`;
  }
  return current;
}

/**
 * Applique à une carte les tailles calculées par le cœur, corrigées au rendu réel.
 * @param {{score:HTMLElement, name:HTMLElement|null, label:HTMLElement|null,
 *          ghost:HTMLElement|null, bubble:HTMLElement|null, signs:HTMLElement[]}} parts
 *   `name` = bloc d'identité (numéro + prénom), `label` = le prénom seul
 * @param {{w:number,h:number}} box repère lisible (cardBox)
 * @param {{scoreSz:number,nameSz:number,signSz:number,deltaSz:number,ghostH:number}} fit
 *   résultat de `computeFit(box, scoreStr)`
 * @returns {{scoreSz:number, nameSz:number, signSz:number}} tailles effectivement posées
 */
export function fitCard(parts, box, fit) {
  const { score, name, label, ghost, bubble, signs = [] } = parts;
  const availW = box.w * USABLE_W;
  if (!(availW > 4) || !(box.h > 8)) return { scoreSz: 0, nameSz: 0, signSz: 0 };

  // 1. Bloc d'identité : la taille est posée sur le CONTENEUR, ses deux enfants suivent en em.
  let nameSz = fit.nameSz;
  if (name) {
    name.style.maxWidth = `${Math.round(availW)}px`;
    const wanted = fit.nameSz * rootScale();
    nameSz = shrinkLabel(name, label, wanted, availW, MIN_NAME_PX, MAX_NAME_PX * 2);
  }
  if (ghost) ghost.style.height = `${Math.round(nameSz * 1.15)}px`;

  // 2. Score. `computeFit` donne la cible ; la hauteur RÉELLE de `.score-wrap` (indépendante de son
  //    contenu : `flex: 1 1 0` + `min-height: 0`) la borne, ce qui rend le chevauchement avec le
  //    nom géométriquement impossible quelles que soient les marges du thème.
  const wrap = score.parentElement;
  const face = wrap ? wrap.parentElement : null;
  // Mesure toujours faite bande remise à zéro, sinon la place déjà réservée au tour précédent se
  // retrancherait une seconde fois à chaque re-mesure (rotation, changement de thème, police).
  if (face) face.style.setProperty('--delta-band', '0px');
  // Un score rendu sur deux lignes occupe deux interlignes : le plafond de hauteur est divisé
  // d'autant, faute de quoi la seconde ligne déborderait sur le nom.
  const rows = (score.textContent.match(/\n/g) || []).length + 1;
  const space = wrap && wrap.clientHeight > 0 ? wrap.clientHeight : fit.scoreSz;
  // Plafond de hauteur. Ce qui doit tenir, c'est l'ENCRE, pas la boîte de ligne : le bloc du score
  // est centré dans `.score-wrap` et l'encre est centrée dans sa boîte de ligne, donc un `overflow`
  // qui rogne la boîte ne rogne pas le tracé. Borner sur `LINE_GAP` coûtait ici un tiers de la
  // hauteur de capitale (63 px au lieu de 101 à quatre joueurs) pour une protection illusoire.
  // On mesure donc le rapport encre/corps de la police rendue ; `LINE_GAP` ne sert plus que de
  // repli quand la mesure est indisponible (pas de canevas).
  const unit = inkMetrics(score, 100, score.textContent, rows);
  const roof = unit ? (space * 100) / unit.span : space / (rows * LINE_GAP);
  // L'interligne est posé AVANT la réduction : il est proportionnel au corps, donc le mesurer à
  // 100 px suffit à le rapporter à la taille finale.
  if (unit) score.style.lineHeight = rows > 1 ? `${(unit.lh / 100).toFixed(3)}` : '';
  let scoreSz = shrinkToWidth(
    score,
    Math.min(fit.scoreSz, roof),
    availW,
    MIN_SCORE_PX,
    MAX_SCORE_PX,
  );

  // Partage de la hauteur entre le CHIFFRE et la BULLE DE DELTA. Le chiffre est prioritaire : la
  // bulle ne prend que la hauteur qu'il laisse, bornée par la taille voulue par le cœur et par le
  // plancher typographique de 12 px. La bande ainsi obtenue est réservée en permanence, donc la
  // bulle apparaît et disparaît sans jamais rien déplacer ni recouvrir le chiffre.
  const metrics = inkMetrics(score, scoreSz, score.textContent, rows);
  const inkNow = metrics ? metrics.span : 0;
  const floorBand = Math.round(MIN_NAME_PX * 1.15 + 4);
  const wantBand = Math.round(fit.deltaSz * 1.15 + 4);
  const band =
    space > 0 ? Math.min(wantBand, Math.max(Math.round(space - inkNow), floorBand)) : wantBand;
  if (face) face.style.setProperty('--delta-band', `${band}px`);
  if (bubble) {
    const sz = clamp(Math.min(fit.deltaSz, (band - 4) / 1.15), MIN_NAME_PX, 44);
    bubble.style.fontSize = `${sz}px`;
  }

  // Correction par la HAUTEUR D'ENCRE réellement tracée : sans elle, une police dont les chiffres
  // débordent du cadratin se faisait rogner en haut et en bas par `overflow: hidden`.
  // 2 px de garde : la mesure du tracé et le rendu du navigateur ne tombent pas au même pixel,
  // et un tracé « juste à la taille » de sa fenêtre s'y faisait rogner d'un pixel.
  const budget = space > 0 ? space - band - 2 : Infinity;
  for (let pass = 0; pass < 3 && Number.isFinite(budget); pass++) {
    const m = inkMetrics(score, scoreSz, score.textContent, rows);
    const ink = m ? m.span : 0;
    if (ink <= budget || ink === 0) break;
    const next = clamp((scoreSz * budget) / ink - 0.5, MIN_SCORE_PX, MAX_SCORE_PX);
    if (next >= scoreSz) break;
    scoreSz = next;
    score.style.fontSize = `${scoreSz}px`;
  }
  // Recentrage sur le TRACÉ : sans lui, la boîte de ligne est centrée mais le chiffre, qui n'a pas
  // de jambage, remonte dans son cadratin et se fait rogner par `overflow: hidden`.
  score.style.top = `${inkOffset(score, scoreSz, score.textContent, rows).toFixed(2)}px`;

  // Garde-fou de cohérence entre le cœur et le rendu : si l'écart dépasse 20 %, c'est que la
  // géométrie réelle de la carte contredit le calcul de `computeFit` (rembourrure, police).
  // Le signaler plutôt que de le masquer silencieusement (leçon du padding en pourcentage).
  lastGap = fit.scoreSz > 0 ? Math.abs(scoreSz - fit.scoreSz) / fit.scoreSz : 0;

  // 3. Signes +/− (≥ 24 px, grille D1.4) et bulle de delta.
  for (const s of signs) {
    s.style.width = `${fit.signSz}px`;
    s.style.height = `${fit.signSz}px`;
  }
  return { scoreSz, nameSz, signSz: fit.signSz };
}
