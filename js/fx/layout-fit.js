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
 * Hauteur d'ENCRE réelle d'une ligne de texte, en pixels, pour la police effectivement rendue.
 *
 * La boîte de ligne (`line-height`) ne borne PAS l'encre : les chiffres de « Cinzel » ou
 * d'« Orbitron » débordent de leur cadratin, et `overflow: hidden` les tranchait alors haut et bas
 * — le « 0 » se lisait comme une ellipse écrasée. On mesure donc le tracé, police comprise, au lieu
 * de supposer un rapport constant entre corps et hauteur de capitale.
 * @returns {number} hauteur d'encre, ou 0 si la mesure est indisponible
 */
function inkHeight(node, size, text) {
  const ctx = measureContext();
  if (!ctx) return 0;
  const cs = getComputedStyle(node);
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${size}px ${cs.fontFamily}`;
  let tallest = 0;
  for (const line of String(text).split('\n')) {
    const m = ctx.measureText(line || '0');
    const h = (m.actualBoundingBoxAscent || 0) + (m.actualBoundingBoxDescent || 0);
    if (h > tallest) tallest = h;
  }
  return tallest;
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
  // Un score rendu sur deux lignes occupe deux interlignes : le plafond de hauteur est divisé
  // d'autant, faute de quoi la seconde ligne déborderait sur le nom.
  const rows = (score.textContent.match(/\n/g) || []).length + 1;
  const space = wrap && wrap.clientHeight > 0 ? wrap.clientHeight : fit.scoreSz;
  const roof = space / (rows * LINE_GAP);
  let scoreSz = shrinkToWidth(
    score,
    Math.min(fit.scoreSz, roof),
    availW,
    MIN_SCORE_PX,
    MAX_SCORE_PX,
  );

  // Correction par la HAUTEUR D'ENCRE réellement tracée : sans elle, une police dont les chiffres
  // débordent du cadratin se faisait rogner en haut et en bas par `overflow: hidden`.
  const budget = space > 0 ? space : Infinity;
  for (let pass = 0; pass < 3 && Number.isFinite(budget); pass++) {
    const ink = inkHeight(score, scoreSz, score.textContent) * rows + (rows - 1) * scoreSz * 0.06;
    if (ink <= budget || ink === 0) break;
    const next = clamp((scoreSz * budget) / ink - 0.5, MIN_SCORE_PX, MAX_SCORE_PX);
    if (next >= scoreSz) break;
    scoreSz = next;
    score.style.fontSize = `${scoreSz}px`;
  }
  // Garde-fou de cohérence entre le cœur et le rendu : si l'écart dépasse 20 %, c'est que la
  // géométrie réelle de la carte contredit le calcul de `computeFit` (rembourrure, police).
  // Le signaler plutôt que de le masquer silencieusement (leçon du padding en pourcentage).
  lastGap = fit.scoreSz > 0 ? Math.abs(scoreSz - fit.scoreSz) / fit.scoreSz : 0;

  // 3. Signes +/− (≥ 24 px, grille D1.4) et bulle de delta.
  for (const s of signs) {
    s.style.width = `${fit.signSz}px`;
    s.style.height = `${fit.signSz}px`;
  }
  if (bubble) bubble.style.fontSize = `${fit.deltaSz}px`;
  return { scoreSz, nameSz, signSz: fit.signSz };
}
