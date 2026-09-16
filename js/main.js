// Point d'entrée : amorçage, câblage des actions déclaratives (data-action) et initialisation.
import './platform/boot.js';
import { installErrorJournal } from './platform/errors.js';
import { registerServiceWorker } from './platform/sw-client.js';
import { clearAll, has } from './platform/storage.js';
import { KEYS } from './core/save-schema.js';
import { byId, showPage } from './ui/dom.js';
import { loadSettings, showSettings } from './ui/settings.js';
import {
  applyDefaults,
  initSetup,
  resetSetupForm,
  saveAsDefault,
  setRestoreBannerVisible,
  toggleNegative,
} from './ui/setup.js';
import {
  clearNames,
  clearSavedNames,
  collectNames,
  saveProfiles,
  showNamesScreen,
  shufflePlayers,
} from './ui/names.js';
import {
  applyManualDelta,
  cancelElimination,
  confirmElimination,
  discardSave,
  initGame,
  leaveGame,
  restoreGame,
  rotatePlayers,
  startGame,
} from './ui/game.js';
import {
  closeGameOverlays,
  closeModal,
  closeScoreModal,
  confirmScoreModal,
  initScoreModal,
  openModal,
  setSign,
} from './ui/modals.js';
import { hideRecap, showRecap } from './ui/recap.js';

/** Délai (ms) avant le fondu du splash, puis durée du fondu. */
const SPLASH_DELAY = 400;
const SPLASH_FADE = 500;

/** Reset complet : ferme les surcouches, quitte le jeu, remet le setup à zéro. */
function confirmReset() {
  closeGameOverlays();
  leaveGame();
  resetSetupForm();
  showPage('setup-page');
}

/** Efface toutes les données locales (politique de confidentialité). */
function clearAllData() {
  clearAll();
  closeModal('privacy-modal');
  confirmReset();
}

/** Table des actions déclarées dans le HTML via data-action. Chaque gestionnaire reçoit (bouton, événement). */
const ACTIONS = {
  'show-settings': showSettings,
  'back-from-settings': () => showPage('setup-page'),
  'show-setup': () => showPage('setup-page'),
  'show-privacy': () => openModal('privacy-modal'),
  'clear-all-data': clearAllData,
  'open-modal': (btn) => openModal(btn.dataset.modal),
  'close-modal': (btn) => closeModal(btn.dataset.modal),
  'restore-game': restoreGame,
  'discard-save': discardSave,
  'toggle-negative': toggleNegative,
  'show-names': showNamesScreen,
  'apply-defaults': applyDefaults,
  'save-as-default': (btn) => saveAsDefault(btn),
  'shuffle-players': shufflePlayers,
  'save-profiles': saveProfiles,
  'clear-saved-names': clearSavedNames,
  'clear-names': clearNames,
  'start-game': () => startGame(collectNames()),
  'rotate-players': rotatePlayers,
  'show-recap': showRecap,
  'close-recap': hideRecap,
  'set-sign': (btn) => setSign(Number(btn.dataset.sign)),
  'close-score-modal': closeScoreModal,
  'confirm-score-modal': confirmScoreModal,
  'confirm-reset': confirmReset,
  'cancel-elim': cancelElimination,
  'confirm-elim': confirmElimination,
};

function wireActions() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn || btn.disabled) return;
    const handler = ACTIONS[btn.dataset.action];
    if (handler) handler(btn, e);
  });
}

function hideSplash() {
  setTimeout(() => {
    const s = byId('splash');
    s.classList.add('hidden');
    setTimeout(() => s.remove(), SPLASH_FADE);
  }, SPLASH_DELAY);
}

function init() {
  installErrorJournal();
  registerServiceWorker();
  wireActions();
  initSetup();
  initScoreModal({ onConfirm: applyManualDelta });
  initGame();
  loadSettings();
  setRestoreBannerVisible(has(KEYS.save));
  applyDefaults();
  hideSplash();
}

init();
