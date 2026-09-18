// Transition FLIP (First-Last-Invert-Play) : les cartes gardent leur identité DOM et glissent de
// leur ancienne place à la nouvelle. Utilisée par la rotation des sièges, où seules les propriétés
// de grille changent ; aucune reconstruction, aucune animation coupée par un re-rendu.
import { animate, cancel, token } from './motion.js';

const playing = new WeakMap();

/** Photographie la position/taille actuelle de chaque nœud. */
export function captureRects(nodes) {
  const map = new Map();
  for (const node of nodes) map.set(node, node.getBoundingClientRect());
  return map;
}

/**
 * Joue la transition depuis les rectangles capturés vers la position courante.
 * @param {Map<Element, DOMRect>} first rectangles avant le changement de disposition
 * @param {{duration?:number, easing?:string}} [options]
 * @returns {Animation[]} animations réellement lancées (vide sous mouvement réduit)
 */
export function playFlip(first, { duration, easing } = {}) {
  const ms = duration || parseFloat(token('--dur-3', '360ms')) || 360;
  const curve = easing || token('--ease-out', 'cubic-bezier(.2,.8,.2,1)');
  const anims = [];
  for (const [node, before] of first) {
    if (!node.isConnected) continue;
    const after = node.getBoundingClientRect();
    const dx = before.left - after.left;
    const dy = before.top - after.top;
    const sx = after.width > 0 ? before.width / after.width : 1;
    const sy = after.height > 0 ? before.height / after.height : 1;
    const moved = Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5;
    const resized = Math.abs(sx - 1) > 0.01 || Math.abs(sy - 1) > 0.01;
    if (!moved && !resized) continue;
    cancel(playing.get(node));
    const anim = animate(
      node,
      [
        {
          transformOrigin: 'top left',
          transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
        },
        { transformOrigin: 'top left', transform: 'translate(0, 0) scale(1, 1)' },
      ],
      { duration: ms, easing: curve, fill: 'none' },
    );
    if (anim) {
      playing.set(node, anim);
      anims.push(anim);
    } else {
      // Repli mouvement réduit : `animate` a posé la dernière image-clé en style inline.
      node.style.removeProperty('transform');
      node.style.removeProperty('transform-origin');
    }
  }
  return anims;
}
