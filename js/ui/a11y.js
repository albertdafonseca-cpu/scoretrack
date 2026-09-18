// Accessibilité : piège de focus pour les modales, région live d'annonces, raccourcis clavier,
// navigation par flèches (tabindex tournant) dans les groupes de puces.

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Éléments focalisables et visibles d'un conteneur, dans l'ordre du document. */
export function focusables(container) {
  return Array.from(container.querySelectorAll(FOCUSABLE)).filter(
    (n) => n.offsetParent !== null || n === document.activeElement,
  );
}

/**
 * Rend le reste de la page inopérant pour le pointeur, le clavier ET l'arbre d'accessibilité.
 * `inert` est utilisé quand il est pris en charge, sinon `aria-hidden` sert de repli.
 * Renvoie la fonction de restauration.
 */
export function inertOutside(container) {
  const supportsInert = 'inert' in HTMLElement.prototype;
  const touched = [];
  for (const node of Array.from(document.body.children)) {
    if (node === container || node.contains(container)) continue;
    if (node.getAttribute('aria-hidden') === 'true' && !supportsInert) continue;
    touched.push([node, node.inert, node.getAttribute('aria-hidden')]);
    if (supportsInert) node.inert = true;
    else node.setAttribute('aria-hidden', 'true');
  }
  return function restore() {
    for (const [node, wasInert, ariaHidden] of touched) {
      if (supportsInert) node.inert = wasInert;
      if (ariaHidden === null) node.removeAttribute('aria-hidden');
      else node.setAttribute('aria-hidden', ariaHidden);
    }
  };
}

/**
 * Piège le focus dans `container` : Tab/Maj+Tab cyclent, Échap appelle `onEscape`, et le reste
 * de la page devient inerte (retiré de l'arbre d'accessibilité).
 * Le premier élément focalisable (ou `initialFocus`) reçoit le focus ; la fonction renvoyée
 * libère le piège et rend le focus à l'élément actif au moment de l'appel.
 */
export function trapFocus(container, { onEscape, initialFocus } = {}) {
  const previous = document.activeElement;
  const restoreInert = inertOutside(container);
  const onKeydown = (e) => {
    if (e.key === 'Escape') {
      if (onEscape) {
        e.preventDefault();
        onEscape();
      }
      return;
    }
    if (e.key !== 'Tab') return;
    const items = focusables(container);
    if (!items.length) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !container.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !container.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  };
  document.addEventListener('keydown', onKeydown, true);
  const target = initialFocus || focusables(container)[0] || container;
  if (target === container && !container.hasAttribute('tabindex')) container.tabIndex = -1;
  target.focus({ preventScroll: true });
  return function release() {
    document.removeEventListener('keydown', onKeydown, true);
    restoreInert();
    if (previous && typeof previous.focus === 'function' && document.contains(previous)) {
      previous.focus({ preventScroll: true });
    }
  };
}

let liveRegion = null;

function ensureLiveRegion() {
  if (liveRegion && document.body.contains(liveRegion)) return liveRegion;
  liveRegion = document.createElement('div');
  liveRegion.id = 'a11y-live';
  liveRegion.className = 'sr-only';
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.setAttribute('aria-atomic', 'true');
  document.body.appendChild(liveRegion);
  return liveRegion;
}

/** Annonce un texte aux lecteurs d'écran (région live unique, réutilisée). */
export function announce(text, politeness = 'polite') {
  const region = ensureLiveRegion();
  region.setAttribute('aria-live', politeness === 'assertive' ? 'assertive' : 'polite');
  // Vider puis réécrire au tick suivant garantit l'annonce même si le texte est identique.
  region.textContent = '';
  setTimeout(() => {
    region.textContent = text;
  }, 30);
}

/**
 * Attache une table `{ 'Escape': fn, 'ArrowLeft': fn, … }` à `target` (document par défaut).
 * Le gestionnaire reçoit l'événement ; renvoyer `false` laisse passer l'événement.
 * Renvoie la fonction de retrait.
 */
export function onKey(map, target = document) {
  const handler = (e) => {
    const fn = map[e.key];
    if (!fn) return;
    if (fn(e) !== false) e.preventDefault();
  };
  target.addEventListener('keydown', handler);
  return () => target.removeEventListener('keydown', handler);
}

/**
 * Tabindex tournant, réservé aux widgets composites (`role="radiogroup"`) : un seul élément est
 * dans l'ordre de tabulation (celui qui est coché, sinon le premier) ; les flèches, Début et Fin
 * déplacent le focus et, pour un groupe de boutons radio (`activate`), sélectionnent au passage,
 * conformément au motif APG. `syncRovingTabs` est à rappeler après tout changement d'état.
 */
export function rovingGroup(container, selector, { activate = false } = {}) {
  container.addEventListener('keydown', (e) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    const items = Array.from(container.querySelectorAll(selector)).filter(
      (n) => !n.disabled && !n.hidden,
    );
    const i = items.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const last = items.length - 1;
    const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
    const next =
      step !== undefined ? (i + step + items.length) % items.length : e.key === 'Home' ? 0 : last;
    items[next].focus();
    if (activate) items[next].click();
  });
  syncRovingTabs(container, selector);
}

/** Met à jour les tabindex du groupe : l'élément coché (ou le premier actif) vaut 0, les autres -1. */
export function syncRovingTabs(container, selector) {
  const items = Array.from(container.querySelectorAll(selector));
  const active = items.filter((n) => !n.disabled && !n.hidden);
  const pressed =
    active.find((n) => n.getAttribute('aria-pressed') === 'true') ||
    active.find((n) => n.getAttribute('aria-checked') === 'true') ||
    active[0];
  items.forEach((n) => {
    n.tabIndex = n === pressed ? 0 : -1;
  });
}

// ── Confirmation en deux temps des actions destructrices ────────────

const armedButtons = new WeakMap();

/** Désarme un bouton (restaure son libellé) sans déclencher l'action. */
export function disarmConfirm(btn) {
  const state = armedButtons.get(btn);
  if (!state) return;
  clearTimeout(state.timer);
  armedButtons.delete(btn);
  btn.classList.remove('armed');
  delete btn.dataset.armed;
  if (state.textNode) state.textNode.textContent = state.originalText;
  if (state.originalLabel !== null) btn.setAttribute('aria-label', state.originalLabel);
}

/**
 * Arme une action destructrice : le premier appui prévient, le second (dans `timeout` ms)
 * confirme. Renvoie true quand l'action doit réellement s'exécuter.
 * `label` remplace le texte de `.btn-text` ; `ariaLabel` remplace le nom accessible d'une icône.
 */
export function armConfirm(btn, { label, ariaLabel, message, timeout = 5000 } = {}) {
  if (armedButtons.has(btn)) {
    disarmConfirm(btn);
    return true;
  }
  const textNode = label ? btn.querySelector('.btn-text') : null;
  const state = {
    textNode,
    originalText: textNode ? textNode.textContent : '',
    originalLabel: btn.getAttribute('aria-label'),
    timer: setTimeout(() => disarmConfirm(btn), timeout),
  };
  armedButtons.set(btn, state);
  btn.classList.add('armed');
  btn.dataset.armed = '1';
  if (textNode) textNode.textContent = label;
  if (ariaLabel) btn.setAttribute('aria-label', ariaLabel);
  announce(message || 'Appuyez de nouveau pour confirmer', 'assertive');
  return false;
}
