// Notification discrète non modale (« toast ») annoncée aux lecteurs d'écran (role="status").
import { el } from './dom.js';

const DEFAULT_DURATION_MS = 6000;
let host = null;
let hideTimer = 0;

function ensureHost() {
  if (host && host.isConnected) return host;
  host = el('div', {
    id: 'sys-toast',
    className: 'sys-toast hidden',
    role: 'status',
    'aria-live': 'polite',
  });
  document.body.appendChild(host);
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
  node.classList.remove('hidden');
  clearTimeout(hideTimer);
  if (duration > 0) hideTimer = setTimeout(hideToast, duration);
  return node;
}
