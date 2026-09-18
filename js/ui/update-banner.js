// Bannière « Nouvelle version » (non modale, en bas, au-dessus de #bar) et notifications discrètes :
// échec d'installation hors ligne, échec d'écriture du stockage, erreur non gérée.
// Auto-montée à l'import (une ligne dans main.js).
import { onError } from '../platform/errors.js';
import { flushWrites, onStorageFailure } from '../platform/storage.js';
import {
  applyUpdate,
  onInstallFailed,
  onUpdateActivated,
  onUpdateAvailable,
  reloadForUpdate,
} from '../platform/sw-client.js';
import { byId, el } from './dom.js';
import { showToast } from './toast.js';

/** Délai minimal entre deux notifications d'erreur. */
const ERROR_TOAST_THROTTLE_MS = 8000;

/** Les deux états de la bannière : une version attend, ou une version est déjà active ailleurs. */
const STATES = {
  available: {
    text: 'Nouvelle version disponible',
    action: 'Mettre à jour',
    pending: 'Mise à jour…',
    run: () => applyUpdate(),
  },
  activated: {
    text: 'Nouvelle version active — rechargez',
    action: 'Recharger',
    pending: 'Rechargement…',
    run: () => false,
  },
};

let banner = null;
let parts = null;
let state = null;
let dismissed = null;
let bannerResize = null;

/**
 * Réserve dans la mise en page la hauteur occupée par la bannière (bannière + interstice jusqu'à
 * la barre), pour qu'elle ne recouvre jamais l'aire de jeu ni n'absorbe le tap destiné à une carte.
 * `visible` faux libère la place.
 */
function reserveSpace(visible) {
  const root = document.documentElement;
  if (!visible || !banner || banner.classList.contains('hidden')) {
    root.classList.remove('sys-banner-open');
    root.style.setProperty('--sys-banner-h', '0px');
    return;
  }
  // Mesure indépendante de la position courante (la bannière peut être en cours d'apparition) :
  // hauteur propre + interstice qui la sépare de la barre, tel que défini dans css/system.css.
  const gap = parseFloat(getComputedStyle(root).getPropertyValue('--sys-banner-gap')) || 12;
  const height = Math.max(0, Math.round(banner.offsetHeight + gap));
  root.style.setProperty('--sys-banner-h', `${height}px`);
  root.classList.add('sys-banner-open');
}

/** Positionne la bannière au-dessus de la barre de jeu quand celle-ci est affichée. */
function syncAboveBar() {
  const bar = byId('bar');
  if (!banner) return;
  const visible = bar && getComputedStyle(bar).display !== 'none';
  banner.classList.toggle('above-bar', Boolean(visible));
  reserveSpace(!banner.classList.contains('hidden'));
}

function buildBanner() {
  const action = el('button', { type: 'button', className: 'sys-btn primary' });
  const later = el('button', { type: 'button', className: 'sys-btn', text: 'Plus tard' });
  const text = el('span', { className: 'sys-banner-text' });
  const node = el(
    'div',
    { id: 'update-banner', className: 'sys-banner hidden', role: 'status', 'aria-live': 'polite' },
    text,
    el('span', { className: 'sys-banner-btns' }, later, action),
  );
  action.addEventListener('click', () => {
    const conf = STATES[state];
    action.disabled = true;
    later.disabled = true;
    action.textContent = conf.pending;
    // `applyUpdate` recharge via `controllerchange` ; sinon (version déjà active) on recharge directement.
    if (!conf.run()) reloadForUpdate();
  });
  later.addEventListener('click', () => {
    dismissed = state;
    node.classList.add('hidden');
    reserveSpace(false);
  });
  parts = { text, action, later };
  return node;
}

/** Affiche la bannière dans l'état demandé ('available' | 'activated'), sauf si l'utilisateur l'a différé. */
export function showUpdateBanner(next = 'available') {
  const conf = STATES[next];
  if (!conf || dismissed === next) return;
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
    // La hauteur change avec le repli du texte, la taille de police et l'orientation.
    if (typeof ResizeObserver === 'function') {
      bannerResize = new ResizeObserver(() => reserveSpace(!banner.classList.contains('hidden')));
      bannerResize.observe(banner);
    }
    window.addEventListener('resize', () => reserveSpace(!banner.classList.contains('hidden')));
  }
  state = next;
  parts.text.textContent = conf.text;
  parts.action.textContent = conf.action;
  parts.action.disabled = false;
  parts.later.disabled = false;
  banner.classList.remove('hidden');
  syncAboveBar();
}

/** Masque la bannière et libère la place réservée. */
export function hideUpdateBanner() {
  if (!banner) return;
  banner.classList.add('hidden');
  reserveSpace(false);
}

let lastErrorToast = 0;

function onUnhandledError() {
  flushWrites();
  const now = Date.now();
  if (now - lastErrorToast < ERROR_TOAST_THROTTLE_MS) return;
  lastErrorToast = now;
  showToast('Un problème est survenu, la partie a été sauvegardée');
}

const STORAGE_MESSAGES = {
  quota: 'Sauvegarde impossible : espace insuffisant. La partie continue en mémoire.',
  unavailable: 'Sauvegarde indisponible sur cet appareil. La partie continue en mémoire.',
  error: 'Sauvegarde impossible. La partie continue en mémoire.',
};

function mount() {
  onUpdateAvailable((worker) => {
    if (worker) showUpdateBanner('available');
  });
  // Une autre page (ou la migration automatique) a activé la nouvelle version : celle-ci mélange
  // désormais anciens modules et nouveau cache, il faut le dire plutôt que de masquer la bannière.
  onUpdateActivated(() => {
    dismissed = null;
    showUpdateBanner('activated');
  });
  onInstallFailed(({ firstInstall }) => {
    showToast(
      firstInstall
        ? 'Installation hors ligne incomplète : reconnectez-vous puis rouvrez l’application.'
        : 'Mise à jour incomplète : l’application continue avec la version installée.',
      { duration: 10_000 },
    );
  });
  onStorageFailure(({ reason }) => {
    showToast(STORAGE_MESSAGES[reason] || STORAGE_MESSAGES.error, { duration: 10_000 });
  });
  onError(onUnhandledError);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
}
