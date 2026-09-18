// Point d'entrée : amorçage, câblage des actions déclaratives (data-action) et initialisation.
import './platform/boot.js';
import { installErrorJournal } from './platform/errors.js';
import { registerServiceWorker } from './platform/sw-client.js';
import { clearAll, has } from './platform/storage.js';
import { KEYS } from './core/save-schema.js';
import { byId, showPage } from './ui/dom.js';
import { announce, armConfirm } from './ui/a11y.js';
import { hydrateIcons } from './ui/icons.js';
import {
  armClearAll,
  closePrivacy,
  exportData,
  importData,
  initSettings,
  loadSettings,
  openPrivacy,
  showSettings,
} from './ui/settings.js';
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
  collectNamesAndRemember,
  quickStartNames,
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
  redoLast,
  renamePlayer,
  restoreGame,
  rotatePlayers,
  startGame,
  togglePlayerElimination,
  undoLast,
} from './ui/game.js';
import {
  closeGameOverlays,
  closeModal,
  closePlayerSheet,
  closeScoreModal,
  confirmPlayerSheet,
  confirmScoreModal,
  initPlayerSheet,
  initScoreModal,
  openModal,
  setSign,
  togglePlayerElim,
} from './ui/modals.js';
import { cancelJump, confirmJump, copyResult, hideRecap, showRecap } from './ui/recap.js';
import './ui/update-banner.js';
import { applyLaunchAction } from './platform/shortcuts.js';

/** Délai (ms) avant le fondu du splash, puis durée du fondu. */
const SPLASH_DELAY = 150;
const SPLASH_FADE = 200;

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
  closePrivacy();
  confirmReset();
  // Le focus ne doit jamais retomber sur <body> après une action destructrice.
  byId('app-title').focus({ preventScroll: true });
  announce('Toutes les données ont été supprimées', 'assertive');
}

/** Table des actions déclarées dans le HTML via data-action. Chaque gestionnaire reçoit (bouton, événement). */
const ACTIONS = {
  'show-settings': showSettings,
  'back-from-settings': () => showPage('setup-page'),
  'show-setup': () => showPage('setup-page'),
  'show-privacy': openPrivacy,
  'close-privacy': closePrivacy,
  'clear-all-data': (btn) => {
    if (armClearAll(btn)) clearAllData();
  },
  'export-data': exportData,
  'import-data': importData,
  'open-modal': (btn) => openModal(btn.dataset.modal),
  'close-modal': (btn) => closeModal(btn.dataset.modal),
  'restore-game': restoreGame,
  'discard-save': (btn) => {
    // Effacer une partie en cours est destructeur : confirmation en deux temps.
    if (
      armConfirm(btn, {
        label: 'Confirmer',
        message: 'Appuyez de nouveau pour effacer la partie sauvegardée',
      })
    )
      discardSave();
  },
  'toggle-negative': toggleNegative,
  'show-names': showNamesScreen,
  'apply-defaults': applyDefaults,
  'save-as-default': (btn) => saveAsDefault(btn),
  'shuffle-players': shufflePlayers,
  'save-profiles': saveProfiles,
  'clear-saved-names': (btn) => clearSavedNames(btn),
  'clear-names': clearNames,
  'quick-start': () => startGame(quickStartNames()),
  'start-game': () => startGame(collectNamesAndRemember()),
  'rotate-players': rotatePlayers,
  'show-recap': showRecap,
  'close-recap': hideRecap,
  'set-sign': (btn) => setSign(Number(btn.dataset.sign)),
  'close-score-modal': closeScoreModal,
  'confirm-score-modal': confirmScoreModal,
  'confirm-reset': confirmReset,
  'cancel-elim': cancelElimination,
  'confirm-elim': confirmElimination,
  'undo-action': undoLast,
  'redo-action': redoLast,
  'close-player-sheet': closePlayerSheet,
  'confirm-player-sheet': confirmPlayerSheet,
  'toggle-player-elim': togglePlayerElim,
  'copy-result': copyResult,
  'confirm-jump': confirmJump,
  'cancel-jump': cancelJump,
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
  hydrateIcons();
  registerServiceWorker();
  wireActions();
  initSetup();
  initSettings();
  initScoreModal({ onConfirm: applyManualDelta });
  initPlayerSheet({ onRename: renamePlayer, onToggleElim: togglePlayerElimination });
  initGame();
  loadSettings();
  setRestoreBannerVisible(has(KEYS.save));
  applyDefaults();
  // Raccourcis du manifeste (D14, implémentés par js/platform/shortcuts.js) :
  // « Nouvelle partie » doit aussi repartir d'un formulaire neuf.
  if (applyLaunchAction() === 'new') resetSetupForm();
  hideSplash();
}

init();
