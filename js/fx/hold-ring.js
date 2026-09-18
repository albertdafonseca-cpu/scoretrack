// Anneau de progression de l'appui long : SVG `stroke-dashoffset`, visible dès 120 ms, plein à
// 450 ms (ouverture du pavé). Relâcher avant la fin annule l'anneau et vaut un tap normal.
//
// Sous `prefers-reduced-motion`, la progression est rendue par paliers (minuterie) plutôt que par
// une animation : le retour reste présent sans animation continue.
import { cancel, reducedMotion } from './motion.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Rayon du cercle dans le repère 0 0 48 48. */
const R = 20;
const CIRC = 2 * Math.PI * R;
/** Délai (ms) avant l'apparition de l'anneau. */
export const RING_DELAY = 120;
/** Nombre de paliers sous mouvement réduit. */
const STEPS = 8;

/** Crée l'anneau (caché) à insérer dans une moitié de carte. */
export function createRing() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'hold-ring');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const track = document.createElementNS(SVG_NS, 'circle');
  track.setAttribute('class', 'hold-ring-track');
  track.setAttribute('cx', '24');
  track.setAttribute('cy', '24');
  track.setAttribute('r', String(R));
  const arc = document.createElementNS(SVG_NS, 'circle');
  arc.setAttribute('class', 'hold-ring-arc');
  arc.setAttribute('cx', '24');
  arc.setAttribute('cy', '24');
  arc.setAttribute('r', String(R));
  arc.setAttribute('stroke-dasharray', String(CIRC));
  arc.setAttribute('stroke-dashoffset', String(CIRC));
  svg.append(track, arc);
  // SVGElement n'expose pas la propriété `hidden` : on passe par l'attribut.
  svg.setAttribute('hidden', '');
  return svg;
}

/**
 * Démarre la progression d'un anneau. `total` = durée totale de l'appui long (ms).
 * Renvoie une fonction d'arrêt à appeler au relâchement (ou à l'ouverture du pavé).
 */
export function startRing(svg, total) {
  if (!svg) return () => {};
  const arc = svg.querySelector('.hold-ring-arc');
  let anim = null;
  let stepTimer = 0;
  const show = setTimeout(() => {
    svg.removeAttribute('hidden');
    const duration = Math.max(1, total - RING_DELAY);
    if (reducedMotion() || typeof arc.animate !== 'function') {
      let i = 0;
      const tick = () => {
        i++;
        arc.setAttribute('stroke-dashoffset', String(CIRC * (1 - i / STEPS)));
        if (i < STEPS) stepTimer = setTimeout(tick, duration / STEPS);
      };
      stepTimer = setTimeout(tick, duration / STEPS);
      return;
    }
    anim = arc.animate([{ strokeDashoffset: CIRC }, { strokeDashoffset: 0 }], {
      duration,
      easing: 'linear',
      fill: 'forwards',
    });
  }, RING_DELAY);
  return () => {
    clearTimeout(show);
    clearTimeout(stepTimer);
    cancel(anim);
    svg.setAttribute('hidden', '');
    arc.setAttribute('stroke-dashoffset', String(CIRC));
  };
}
