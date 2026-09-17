// Bannière « Nouvelle version disponible » (non modale, en bas, au-dessus de #bar) et notification
// discrète d'erreur non gérée. Auto-montée à l'import (une ligne dans main.js).
import { onError } from '../platform/errors.js';
import { flushWrites } from '../platform/storage.js';
import { applyUpdate, onUpdateAvailable } from '../platform/sw-client.js';
import { byId, el } from './dom.js';
import { showToast } from './toast.js';

/** Délai minimal entre deux notifications d'erreur. */
const ERROR_TOAST_THROTTLE_MS = 8000;

let banner = null;
let dismissed = false;

/** Positionne la bannière au-dessus de la barre de jeu quand celle-ci est affichée. */
function syncAboveBar() {
  const bar = byId('bar');
  if (!banner) return;
  const visible = bar && getComputedStyle(bar).display !== 'none';
  banner.classList.toggle('above-bar', Boolean(visible));
}

function buildBanner() {
  const update = el('button', {
    type: 'button',
    className: 'sys-btn primary',
    text: 'Mettre à jour',
  });
  const later = el('button', { type: 'button', className: 'sys-btn', text: 'Plus tard' });
  const node = el(
    'div',
    { id: 'update-banner', className: 'sys-banner hidden', role: 'status', 'aria-live': 'polite' },
    el('span', { className: 'sys-banner-text', text: 'Nouvelle version disponible' }),
    el('span', { className: 'sys-banner-btns' }, later, update),
  );
  update.addEventListener('click', () => {
    update.disabled = true;
    later.disabled = true;
    update.textContent = 'Mise à jour…';
    if (!applyUpdate()) {
      flushWrites();
      location.reload();
    }
  });
  later.addEventListener('click', () => {
    dismissed = true;
    node.classList.add('hidden');
  });
  return node;
}

/** Affiche la bannière si une version attend (sauf si l'utilisateur l'a différée pour cette session). */
export function showUpdateBanner(worker = true) {
  if (!worker) {
    hideUpdateBanner();
    return;
  }
  if (dismissed) return;
  if (!banner) {
    banner = buildBanner();
    document.body.appendChild(banner);
    const bar = byId('bar');
    if (bar && typeof MutationObserver === 'function') {
      new MutationObserver(syncAboveBar).observe(bar, {
        attributes: true,
        attributeFilter: ['style', 'class'],
      });
    }
  }
  syncAboveBar();
  banner.classList.remove('hidden');
}

/** Masque la bannière. */
export function hideUpdateBanner() {
  if (banner) banner.classList.add('hidden');
}

let lastErrorToast = 0;

function onUnhandledError() {
  flushWrites();
  const now = Date.now();
  if (now - lastErrorToast < ERROR_TOAST_THROTTLE_MS) return;
  lastErrorToast = now;
  showToast('Un problème est survenu, la partie a été sauvegardée');
}

function mount() {
  onUpdateAvailable(showUpdateBanner);
  onError(onUnhandledError);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
}
