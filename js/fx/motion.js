// Socle du mouvement : préférence « mouvement réduit », lecture des jetons de durée/courbe et
// enveloppe sûre autour de la Web Animations API (aucune animation n'est jamais bloquante).
//
// Règle : sous `prefers-reduced-motion: reduce`, `animate()` n'anime rien et applique directement
// l'état final (dernière image-clé) — aucune animation infinie, aucun transform résiduel.

const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';

/** Vrai si l'utilisateur demande un mouvement réduit (D7). */
export function reducedMotion() {
  return typeof matchMedia === 'function' && matchMedia(REDUCE_QUERY).matches;
}

/** Valeur d'un jeton CSS (`--dur-2`, `--ease-spring`…) lue sur `:root`, avec repli. */
export function token(name, fallback = '') {
  if (typeof getComputedStyle !== 'function') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** Courbe de ressort du thème (`--ease-spring`), repli cubic-bezier si `linear()` est absent. */
export function spring() {
  return token('--ease-spring', 'cubic-bezier(.34,1.56,.64,1)');
}

/** Courbe de sortie du thème (`--ease-out`). */
export function easeOut() {
  return token('--ease-out', 'cubic-bezier(.2,.8,.2,1)');
}

/**
 * Anime un élément avec la Web Animations API.
 * Sous mouvement réduit (ou sans `Element.animate`), applique la dernière image-clé et renvoie null.
 * @param {Element} node
 * @param {Keyframe[]} keyframes
 * @param {KeyframeAnimationOptions} options
 * @returns {Animation|null}
 */
export function animate(node, keyframes, options = {}) {
  if (!node) return null;
  if (reducedMotion() || typeof node.animate !== 'function') {
    applyFinal(node, keyframes[keyframes.length - 1]);
    return null;
  }
  try {
    return node.animate(keyframes, options);
  } catch {
    applyFinal(node, keyframes[keyframes.length - 1]);
    return null;
  }
}

/** Applique une image-clé comme style inline (repli sans animation). */
function applyFinal(node, frame) {
  if (!frame || !node.style) return;
  for (const [prop, value] of Object.entries(frame)) {
    if (prop === 'offset' || prop === 'easing') continue;
    node.style.setProperty(cssName(prop), String(value));
  }
}

const cssName = (prop) => prop.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** Annule proprement une animation (ignore les animations déjà terminées). */
export function cancel(anim) {
  if (!anim) return;
  try {
    anim.cancel();
  } catch {
    /* animation déjà retirée */
  }
}

/** Promesse résolue à la fin de l'animation (immédiatement si elle n'existe pas). */
export function finished(anim) {
  if (!anim || !anim.finished) return Promise.resolve();
  return anim.finished.catch(() => {});
}
