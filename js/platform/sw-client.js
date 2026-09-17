// Client du service worker : enregistrement, détection des mises à jour, application sur décision de
// l'utilisateur (SKIP_WAITING → controllerchange → sauvegarde forcée → rechargement), vérifications
// périodiques. Le nom `sw-st.js` est figé (D3).
import { flushWrites } from './storage.js';

/** Intervalle entre deux vérifications automatiques de mise à jour. */
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
/** Délai minimal entre deux vérifications (retour au premier plan). */
const CHECK_THROTTLE_MS = 60 * 1000;
/** Délai de sécurité : si `controllerchange` ne vient pas, on recharge quand même. */
const APPLY_TIMEOUT_MS = 4000;

const listeners = new Set();
let registrationPromise = null;
let registrationRef = null;
let waitingWorker = null;
let applying = false;
let lastCheck = 0;
let listenersInstalled = false;

function announce(worker) {
  waitingWorker = worker;
  listeners.forEach((cb) => {
    try {
      cb(worker);
    } catch {
      /* un observateur défaillant n'empêche pas les autres */
    }
  });
}

function watchInstalling(reg) {
  const worker = reg.installing;
  if (!worker) return;
  worker.addEventListener('statechange', () => {
    // `installed` avec un contrôleur existant = nouvelle version en attente (sinon : première installation).
    if (worker.state === 'installed' && navigator.serviceWorker.controller) announce(worker);
    // Activée sans action de l'utilisateur (migration depuis les anciens caches) : plus rien à appliquer.
    if (worker.state === 'activated' && waitingWorker === worker && !applying) announce(null);
  });
}

function watch(reg) {
  registrationRef = reg;
  if (reg.waiting && navigator.serviceWorker.controller) announce(reg.waiting);
  if (reg.installing) watchInstalling(reg);
  reg.addEventListener('updatefound', () => watchInstalling(reg));
}

function reloadAfterUpdate() {
  if (!applying) return;
  applying = false;
  flushWrites();
  location.reload();
}

function installGlobalListeners() {
  if (listenersInstalled) return;
  listenersInstalled = true;
  navigator.serviceWorker.addEventListener('controllerchange', reloadAfterUpdate);
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
