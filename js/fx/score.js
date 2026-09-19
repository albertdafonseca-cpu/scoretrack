// Animations du chiffre et bulle de delta cumulé.
//
// Le chiffre n'est jamais remplacé sèchement : il roule verticalement (sens du gain/de la perte)
// avec un léger dépassement à ressort, 220 ms — dans la fourchette 150–350 ms de la grille.
// La bulle de delta reste visible exactement tant que le groupe d'annulation est ouvert
// (GROUP_DELAY), puis se fond ; le signe (+/−) porte l'information autant que la couleur (D1).
import { GROUP_DELAY } from '../core/history.js';
import { fmtNum } from '../core/format.js';
import { animate, cancel, easeOut, reducedMotion, spring } from './motion.js';

/** Durée (ms) de l'animation du chiffre. */
export const SCORE_ANIM_MS = 220;
/** Durée (ms) du fondu de la bulle de delta, après la fermeture du groupe. */
export const BUBBLE_FADE_MS = 240;
/** Durée (ms) du flash de la moitié touchée. */
export const FLASH_MS = 160;

const running = new WeakMap();

/**
 * Met le score à jour en l'animant (rouleau vertical + ressort).
 * @param {HTMLElement} node élément `.score`
 * @param {string} text nouveau texte
 * @param {number} direction +1 (gain), -1 (perte), 0 (aucune animation)
 */
export function setScoreText(node, text, direction = 0) {
  if (!node) return;
  const changed = node.textContent !== text;
  node.textContent = text;
  if (!changed || direction === 0) return;
  cancel(running.get(node));
  // Gain : le nouveau chiffre monte depuis le bas ; perte : il descend depuis le haut.
  const from = direction > 0 ? '0.36em' : '-0.36em';
  const anim = animate(
    node,
    [
      { transform: `translateY(${from}) scale(0.84)`, opacity: 0.35 },
      { transform: 'translateY(0) scale(1)', opacity: 1 },
    ],
    { duration: SCORE_ANIM_MS, easing: spring(), fill: 'none' },
  );
  if (anim) running.set(node, anim);
}

/** Flash bref de la moitié touchée (gain = éclaircie, perte = assombrie). */
export function flashHalf(half, positive) {
  if (!half) return;
  const cls = positive ? 'flash-pos' : 'flash-neg';
  half.classList.add(cls);
  setTimeout(() => half.classList.remove(cls), FLASH_MS);
}

const bubbleTimers = new WeakMap();

/**
 * Affiche la bulle de delta cumulé d'un joueur. Elle reste pleinement visible `GROUP_DELAY` ms
 * (durée du groupe d'annulation) puis se fond ; `onClose` est appelé à la fermeture du groupe.
 * @param {HTMLElement} node élément `.delta-bubble`
 * @param {number} sum somme du groupe
 * @param {() => void} [onClose]
 */
export function showDeltaBubble(node, sum, onClose) {
  if (!node) return;
  const prev = bubbleTimers.get(node);
  if (prev) {
    clearTimeout(prev.timer);
    cancel(prev.anim);
  }
  clearFade(node);
  node.textContent = (sum > 0 ? '+' : '') + fmtNum(sum);
  node.classList.toggle('gain', sum > 0);
  node.classList.toggle('loss', sum <= 0);
  // La bulle n'apparaît en fanfare qu'à l'OUVERTURE du groupe : pendant une salve de taps elle se
  // contente de changer de valeur. Rejouer l'entrée à chaque tap coûtait un recalcul de style par
  // tap et faisait « sauter » le chiffre au lieu de le laisser filer.
  const wasHidden = node.hidden;
  if (wasHidden) node.hidden = false;
  node.style.opacity = '1';
  if (wasHidden && !reducedMotion()) {
    // `translate`/`scale` indépendants plutôt que `transform` : le centrage horizontal de la bulle
    // est porté par `transform: translateX(-50%)` en CSS, qu'une animation écraserait.
    animate(
      node,
      [
        { translate: '0 0.3em', scale: '0.7', opacity: 0 },
        { translate: '0 0', scale: '1', opacity: 1 },
      ],
      { duration: 160, easing: spring() },
    );
  }
  const timer = setTimeout(() => {
    bubbleTimers.delete(node);
    if (onClose) onClose();
    hideDeltaBubble(node, true);
  }, GROUP_DELAY);
  bubbleTimers.set(node, { timer, anim: null });
}

/**
 * Annule toute animation de fondu encore attachée à la bulle.
 * Une animation terminée en `fill: forwards` PRIME sur le style en ligne : sans cette purge, le
 * `opacity = 1` de la bulle suivante n'aurait plus aucun effet et la bulle resterait invisible dès
 * la deuxième action du même joueur.
 */
function clearFade(node) {
  if (typeof node.getAnimations !== 'function') return;
  for (const anim of node.getAnimations()) cancel(anim);
}

/** Masque la bulle (avec fondu si `fade`). */
export function hideDeltaBubble(node, fade = false) {
  if (!node) return;
  const prev = bubbleTimers.get(node);
  if (prev) {
    clearTimeout(prev.timer);
    cancel(prev.anim);
    bubbleTimers.delete(node);
  }
  clearFade(node);
  if (!fade || reducedMotion()) {
    node.style.opacity = '0';
    node.hidden = true;
    return;
  }
  // `fill: 'none'` : l'état final est déjà porté par le style en ligne ci-dessous. Une animation
  // remplissante survivrait à sa propre fin et figerait la bulle pour toutes les actions suivantes.
  const anim = animate(node, [{ opacity: 1 }, { opacity: 0 }], {
    duration: BUBBLE_FADE_MS,
    easing: easeOut(),
    fill: 'none',
  });
  node.style.opacity = '0';
  if (anim) {
    bubbleTimers.set(node, { timer: 0, anim });
    anim.addEventListener('finish', () => {
      bubbleTimers.delete(node);
      node.hidden = true;
    });
  } else {
    node.hidden = true;
  }
}
