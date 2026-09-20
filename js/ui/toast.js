// Notification discrète non modale (« toast ») annoncée aux lecteurs d'écran (role="status").
import { byId, el } from './dom.js';

const DEFAULT_DURATION_MS = 6000;
let host = null;
let hideTimer = 0;

/** Place le toast au-dessus de la barre d'action quand celle-ci est affichée : il ne doit masquer aucun libellé. */
function syncAboveBar() {
  const bar = byId('bar');
  if (!host) return;
  host.classList.toggle('above-bar', Boolean(bar && getComputedStyle(bar).display !== 'none'));
}

function ensureHost() {
  if (host && host.isConnected) return host;
  host = el('div', {
    id: 'sys-toast',
    className: 'sys-toast hidden',
    role: 'status',
    'aria-live': 'polite',
  });
  document.body.appendChild(host);
  const bar = byId('bar');
  if (bar && typeof MutationObserver === 'function') {
    new MutationObserver(syncAboveBar).observe(bar, {
      attributes: true,
      attributeFilter: ['style', 'class'],
    });
  }
  return host;
}

/** Masque le toast courant. */
export function hideToast() {
  clearTimeout(hideTimer);
  hideTimer = 0;
  if (host) host.classList.add('hidden');
}

/**
 * Affiche un message discret en bas de l'écran ; `duration` ms puis disparition (0 = persistant).
 * Un nouvel appel remplace le message précédent.
 */
export function showToast(text, { duration = DEFAULT_DURATION_MS } = {}) {
  const node = ensureHost();
  node.textContent = text;
  syncAboveBar();
  node.classList.remove('hidden');
  clearTimeout(hideTimer);
  if (duration > 0) hideTimer = setTimeout(hideToast, duration);
  return node;
}
