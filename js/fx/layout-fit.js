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
import { MAX_NAME_PX, MAX_SCORE_PX, MIN_NAME_PX, MIN_SCORE_PX } from '../core/layout.js';

/** Fraction de la largeur du repère réellement utilisable (identique à `computeFit`). */
const USABLE_W = 0.9;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Pose `size` sur `node` puis le réduit jusqu'à ce que sa largeur RENDUE tienne dans `avail`.
 * `flexible` (le prénom) est figé le temps de la mesure, sinon il se rétrécirait au lieu de
 * déborder et `scrollWidth` serait aveugle.
 * @returns {number} taille retenue (px)
 */
function shrinkToWidth(node, size, avail, min, max, flexible) {
  let current = clamp(size, min, max);
  node.style.fontSize = `${current}px`;
  for (let pass = 0; pass < 3; pass++) {
    if (flexible) flexible.style.flexShrink = '0';
    const rendered = node.scrollWidth;
    if (flexible) flexible.style.flexShrink = '';
    if (rendered <= avail || rendered === 0) break;
    const next = clamp((current * avail) / rendered - 0.5, min, max);
    if (next >= current) break;
    current = next;
    node.style.fontSize = `${current}px`;
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
    nameSz = shrinkToWidth(name, fit.nameSz, availW, MIN_NAME_PX, MAX_NAME_PX, label);
  }
  if (ghost) ghost.style.height = `${Math.round(nameSz * 1.15)}px`;

  // 2. Score. `computeFit` donne la cible ; la hauteur RÉELLE de `.score-wrap` (indépendante de son
  //    contenu : `flex: 1 1 0` + `min-height: 0`) la borne, ce qui rend le chevauchement avec le
  //    nom géométriquement impossible quelles que soient les marges du thème.
  const wrap = score.parentElement;
  const roof = wrap && wrap.clientHeight > 0 ? wrap.clientHeight : fit.scoreSz;
  const scoreSz = shrinkToWidth(
    score,
    Math.min(fit.scoreSz, roof),
    availW,
    MIN_SCORE_PX,
    MAX_SCORE_PX,
  );

  // 3. Signes +/− (≥ 24 px, grille D1.4) et bulle de delta.
  for (const s of signs) {
    s.style.width = `${fit.signSz}px`;
    s.style.height = `${fit.signSz}px`;
  }
  if (bubble) bubble.style.fontSize = `${fit.deltaSz}px`;
  return { scoreSz, nameSz, signSz: fit.signSz };
}
