// Point d'entrée : effets de bord au chargement, puis exposition des gestionnaires
// appelés depuis les attributs onclick du HTML.
import './sw';
import './icons';
import { drawSplashIcon } from './splash';
import * as i18nTranslations from './i18n/translations';
import * as i18n from './i18n';
import * as game from './game';
import * as recapPdf from './recap-pdf';
import * as animations from './animations';
import * as diceUi from './dice-ui';
import * as dice3dCube from './dice3d/cube';
import * as dice3dPolyhedra from './dice3d/polyhedra';
import * as dice3dDie from './dice3d/die';

const handlers = {
  acceptPrivacy: game.acceptPrivacy,
  backFromTheme: game.backFromTheme,
  cancelElim: game.cancelElim,
  cancelEndgame: game.cancelEndgame,
  clearAll: game.clearAll,
  clearAllData: game.clearAllData,
  clearNames: game.clearNames,
  clearPresetSelection: game.clearPresetSelection,
  clearSavedDefaults: game.clearSavedDefaults,
  closePrivacy: game.closePrivacy,
  closeScoreModal: game.closeScoreModal,
  confirmElim: game.confirmElim,
  confirmEndgame: game.confirmEndgame,
  confirmReset: game.confirmReset,
  confirmScoreModal: game.confirmScoreModal,
  deleteProfile: game.deleteProfile,
  discardSave: game.discardSave,
  restoreGame: game.restoreGame,
  restoreSavedDefaults: game.restoreSavedDefaults,
  rotatePlayers: game.rotatePlayers,
  saveAsDefault: game.saveAsDefault,
  saveProfiles: game.saveProfiles,
  selectObjectif: game.selectObjectif,
  selectObjectifPreset: game.selectObjectifPreset,
  setSign: game.setSign,
  showNamesScreen: game.showNamesScreen,
  showPrivacy: game.showPrivacy,
  showRecap: game.showRecap,
  showSetup: game.showSetup,
  showThemeFromGame: game.showThemeFromGame,
  showThemeFromSetup: game.showThemeFromSetup,
  shufflePlayers: game.shufflePlayers,
  startGame: game.startGame,
  startNewGameSameSetup: game.startNewGameSameSetup,
  toggleLastLoser: game.toggleLastLoser,
  toggleSingleWinner: game.toggleSingleWinner,
  closeDice: diceUi.closeDice,
  diceCancelPick: diceUi.diceCancelPick,
  diceCountStep: diceUi.diceCountStep,
  diceFacesStep: diceUi.diceFacesStep,
  dicePickPlayer: diceUi.dicePickPlayer,
  diceToggleConfig: diceUi.diceToggleConfig,
  openDice: diceUi.openDice,
  rollDice: diceUi.rollDice,
  exportRecapPDF: recapPdf.exportRecapPDF,
  stopElimAnim: animations.stopElimAnim,
  stopFinAnim: animations.stopFinAnim,
  stopWinAnim: animations.stopWinAnim,
  toggleLangDropdown: i18n.toggleLangDropdown,
  toggleLangDropdownPrivacy: i18n.toggleLangDropdownPrivacy,
};
Object.assign(window, handlers);
// Espace de noms pour les tests et le débogage (modules exposés).
window.ScoreTrack = { i18nTranslations, i18n, game, recapPdf, animations, diceUi, dice3dCube, dice3dPolyhedra, dice3dDie };

drawSplashIcon();
