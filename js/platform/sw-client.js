// Client du service worker : enregistrement, détection des mises à jour, application sur décision de
// l'utilisateur (SKIP_WAITING → controllerchange → sauvegarde forcée → rechargement), vérifications
// périodiques, signalement d'une installation ratée et d'une version activée par un autre onglet.
// Le nom `sw-st.js` est figé (D3).
import { flushWrites } from './storage.js';

/** Intervalle entre deux vérifications automatiques de mise à jour. */
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
/** Délai minimal entre deux vérifications (retour au premier plan). */
const CHECK_THROTTLE_MS = 60 * 1000;
/** Délai de sécurité : si `controllerchange` ne vient pas, on recharge quand même. */
const APPLY_TIMEOUT_MS = 4000;

const listeners = new Set();
const activatedListeners = new Set();
const installFailedListeners = new Set();
let registrationPromise = null;
let registrationRef = null;
let waitingWorker = null;
let applying = false;
let lastCheck = 0;
let listenersInstalled = false;
/** Vrai si la page était déjà contrôlée par un SW : la première prise de contrôle n'est pas une mise à jour. */
let hadController = false;

/** Diffuse un événement à un ensemble d'observateurs sans qu'un défaillant n'empêche les autres. */
function emit(set, payload) {
  set.forEach((cb) => {
    try {
      cb(payload);
    } catch {
      /* un observateur défaillant n'empêche pas les autres */
    }
  });
}

function announce(worker) {
  waitingWorker = worker;
  emit(listeners, worker);
}

function watchInstalling(reg) {
  const worker = reg.installing;
  if (!worker) return;
  // Une installation qui échoue passe de `installing` à `redundant` sans jamais atteindre `installed`.
  let installed = false;
  const firstInstall = !navigator.serviceWorker.controller;
  worker.addEventListener('statechange', () => {
    if (worker.state === 'installed') {
      installed = true;
      // Avec un contrôleur existant : nouvelle version en attente (sinon : première installation).
      if (navigator.serviceWorker.controller) announce(worker);
    } else if (worker.state === 'redundant' && !installed) {
      emit(installFailedListeners, { firstInstall, reason: 'install' });
    }
  });
}

function watch(reg) {
  registrationRef = reg;
  if (reg.waiting && navigator.serviceWorker.controller) announce(reg.waiting);
  if (reg.installing) watchInstalling(reg);
  reg.addEventListener('updatefound', () => watchInstalling(reg));
}

function reloadAfterUpdate() {
  if (!applying) {
    // Première prise de contrôle (`clients.claim` à l'installation initiale) : la page a chargé ses modules
    // depuis le réseau, ils correspondent au cache. Rien à signaler.
    if (!hadController) {
      hadController = true;
      return;
    }
    // Un autre onglet (ou la migration automatique depuis un ancien cache) a activé la nouvelle version :
    // cette page tourne encore sur les anciens modules alors que le cache ne sert plus que les nouveaux.
    waitingWorker = null;
    emit(activatedListeners, { reason: 'elsewhere' });
    return;
  }
  applying = false;
  flushWrites();
  location.reload();
}

function installGlobalListeners() {
  if (listenersInstalled) return;
  listenersInstalled = true;
  hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', reloadAfterUpdate);
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'INSTALL_FAILED') {
      emit(installFailedListeners, {
        firstInstall: !navigator.serviceWorker.controller,
        reason: 'precache',
        missing: Array.isArray(e.data.missing) ? e.data.missing : [],
      });
    }
  });
  setInterval(() => checkForUpdate(), CHECK_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkForUpdate();
  });
}

/** Enregistre le SW si disponible ; renvoie la promesse d'enregistrement (ou null si non pris en charge). */
export function registerServiceWorker(url = './sw-st.js') {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  if (registrationPromise) return registrationPromise;
  installGlobalListeners();
  registrationPromise = navigator.serviceWorker
    .register(url)
    .then((reg) => {
      watch(reg);
      lastCheck = Date.now();
      return reg;
    })
    .catch(() => null);
  return registrationPromise;
}

/**
 * Abonne `cb(worker)` à la disponibilité d'une nouvelle version (appelé immédiatement si une version
 * attend déjà ; `cb(null)` si l'attente est levée sans action). Renvoie la fonction de désabonnement.
 */
export function onUpdateAvailable(cb) {
  listeners.add(cb);
  if (waitingWorker) cb(waitingWorker);
  return () => listeners.delete(cb);
}

/**
 * Abonne `cb({ reason })` à l'activation d'une nouvelle version par un autre onglet (ou par la migration
 * automatique) : cette page mélange alors anciens modules et nouveau cache, un rechargement s'impose.
 * Renvoie la fonction de désabonnement.
 */
export function onUpdateActivated(cb) {
  activatedListeners.add(cb);
  return () => activatedListeners.delete(cb);
}

/**
 * Abonne `cb({ firstInstall, reason, missing })` à l'échec d'installation du service worker (précache
 * incomplet). `firstInstall` vrai = l'application n'est pas disponible hors ligne du tout.
 * Renvoie la fonction de désabonnement.
 */
export function onInstallFailed(cb) {
  installFailedListeners.add(cb);
  return () => installFailedListeners.delete(cb);
}

/** Recharge la page après avoir vidé les écritures en attente (bannière « nouvelle version active »). */
export function reloadForUpdate() {
  flushWrites();
  location.reload();
}

/** Vrai si une nouvelle version attend d'être appliquée. */
export function isUpdateAvailable() {
  return waitingWorker !== null;
}

/** Applique la mise à jour en attente : sauvegarde, prise de contrôle, rechargement. Renvoie false si rien à faire. */
export function applyUpdate() {
  const worker = waitingWorker || (registrationRef && registrationRef.waiting);
  if (!worker || applying) return false;
  applying = true;
  flushWrites();
  worker.postMessage({ type: 'SKIP_WAITING' });
  setTimeout(reloadAfterUpdate, APPLY_TIMEOUT_MS);
  return true;
}

/** Demande au navigateur de vérifier s'il existe une nouvelle version (limité à une fois par minute). */
export function checkForUpdate(force = false) {
  if (!registrationRef) return Promise.resolve(false);
  const now = Date.now();
  if (!force && now - lastCheck < CHECK_THROTTLE_MS) return Promise.resolve(false);
  lastCheck = now;
  return registrationRef
    .update()
    .then(() => true)
    .catch(() => false);
}

/** Version du SW qui contrôle la page (hash du précache), ou null si aucun contrôleur / pas de réponse. */
export function getServiceWorkerVersion(timeoutMs = 1500) {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker?.controller) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), timeoutMs);
    channel.port1.onmessage = (e) => {
      clearTimeout(timer);
      resolve(e.data && e.data.version ? String(e.data.version) : null);
    };
    try {
      navigator.serviceWorker.controller.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}
