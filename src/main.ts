// Point d'entrée : effets de bord au chargement, puis câblage des évènements
// des éléments statiques d'`index.html` par `addEventListener` (élément G de
// l'audit AAA, round 3 : remplace les 65 attributs `onclick="..."` inline
// qui obligeaient `vercel.json` à garder `'unsafe-inline'` dans `script-src`
// de sa Content-Security-Policy — voir docs/audit/DECISIONS-G.md).
//
// `index.html` est une page unique : tous les écrans (démarrage, thème,
// confidentialité, noms, jeu, lanceur de dés, modales) existent dès le
// chargement initial, seulement masqués/affichés par des classes CSS
// (`.hidden`/`.active`) — jamais créés dynamiquement. `dist/app.js` est
// chargé avec `defer`, donc ce module s'exécute après le parsing complet du
// DOM : le câblage ci-dessous peut se faire une seule fois, au chargement,
// sans attendre `DOMContentLoaded` (vérifié en lisant `index.html` : aucun
// des ids ciblés n'est injecté après coup par un autre module).
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

// Compatibilité : certains tests e2e existants (élément E,
// `e2e/pdf-export-offline.spec.ts`, hors du périmètre édition de cet
// élément) déclenchent encore un gestionnaire via `window.showRecap()`
// plutôt que `window.ScoreTrack.game.showRecap()`. Cette exposition globale
// n'est plus utilisée par `index.html` (plus aucun attribut `onclick`) mais
// reste sans incidence sur la CSP : une simple affectation de propriété par
// un script externe déjà chargé n'est pas un attribut d'évènement inline et
// ne requiert donc pas `'unsafe-inline'` dans `script-src` (revérifié au
// §4 de docs/audit/DECISIONS-G.md). Conservée pour ne rien casser de
// déjà-vert, sur le même principe que `deleteProfile` déjà exposé ici tout
// en étant câblé par `addEventListener` ailleurs (élément B).
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

// Espace de noms pour les tests et le débogage (modules exposés) — inchangé
// par ce chantier, toujours utilisé par les tests unitaires/e2e existants.
window.ScoreTrack = { i18nTranslations, i18n, game, recapPdf, animations, diceUi, dice3dCube, dice3dPolyhedra, dice3dDie };

/** Raccourci local : élément requis par id, lève une erreur explicite s'il manque
 *  (plutôt qu'un plantage silencieux sur `addEventListener` d'un `null`). */
function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`main.ts: élément #${id} introuvable pour le câblage des évènements`);
  return el as T;
}

/** Câble une liste de paires (id, gestionnaire) sur l'évènement 'click'. */
function onClick(pairs: Array<[string, (e: MouseEvent) => void]>): void {
  for (const [id, handler] of pairs) byId(id).addEventListener('click', handler);
}

function wireHandlers(): void {
  // ── Cas 1 : appels simples (aucun argument) ────────────────────────
  onClick([
    ['theme-gear-btn', () => game.showThemeFromSetup()],
    ['lang-flag-btn', () => i18n.toggleLangDropdown()],
    ['restore-btn-yes', () => game.restoreGame()],
    ['restore-btn-no', () => game.discardSave()],
    ['row-last-loser', () => game.toggleLastLoser()],
    ['row-single-winner', () => game.toggleSingleWinner()],
    ['go-btn', () => game.showNamesScreen()],
    ['theme-back-btn', () => game.backFromTheme()],
    ['btn-privacy-txt', () => game.showPrivacy()],
    ['privacy-back-btn', () => game.closePrivacy()],
    ['lang-flag-btn-privacy', () => i18n.toggleLangDropdownPrivacy()],
    ['btn-cleardata', () => game.clearAllData()],
    ['btn-privacy-accept', () => game.acceptPrivacy()],
    ['btn-shuffle', () => game.shufflePlayers()],
    ['btn-memorize', () => game.saveProfiles()],
    ['btn-clearfields', () => game.clearNames()],
    ['btn-clearnames', () => game.clearAll()],
    ['names-go-btn', () => game.startGame()],
    ['btn-back-names', () => game.showSetup()],
    ['bar-rotate-btn', () => game.rotatePlayers()],
    ['bar-recap-btn', () => game.showRecap()],
    ['bar-theme-btn', () => game.showThemeFromGame()],
    ['dice-fab', () => diceUi.openDice()],
    ['dice-config-toggle', () => diceUi.diceToggleConfig()],
    ['dice-roll-btn', () => diceUi.rollDice()],
    ['dice-pick-back', () => diceUi.diceCancelPick()],
    ['dice-close-btn', () => diceUi.closeDice()],
    ['score-modal-confirm-btn', () => game.confirmScoreModal()],
    ['score-modal-cancel-btn', () => game.closeScoreModal()],
    ['btn-seerecap', () => game.showRecap()],
    ['btn-newgame', () => game.startNewGameSameSetup()],
    ['btn-returnmenu', () => game.confirmReset()],
    ['btn-newgame-reset', () => game.startNewGameSameSetup()],
    ['btn-menu-reset', () => game.confirmReset()],
    ['btn-elim-confirm-txt', () => game.confirmElim()],
    ['btn-cancel-elim', () => game.cancelElim()],
    ['endgame-modal-confirm-btn', () => game.confirmEndgame()],
    ['endgame-btn-cancel', () => game.cancelEndgame()],
    ['btn-pdf-dl', () => recapPdf.exportRecapPDF()],
    ['fin-anim-overlay', () => animations.stopFinAnim()],
    ['win-anim-overlay', () => animations.stopWinAnim()],
    ['elim-anim-overlay', () => animations.stopElimAnim()],
  ]);

  // ── Cas 2 : appels avec argument littéral capturé dans la closure ──
  onClick([
    ['dice-faces-minus', () => diceUi.diceFacesStep(-1)],
    ['dice-faces-plus', () => diceUi.diceFacesStep(1)],
    ['dice-count-minus', () => diceUi.diceCountStep(-1)],
    ['dice-count-plus', () => diceUi.diceCountStep(1)],
    ['dice-add-btn', () => diceUi.dicePickPlayer('add')],
    ['dice-sub-btn', () => diceUi.dicePickPlayer('sub')],
    ['sign-minus', () => game.setSign(-1)],
    ['sign-plus', () => game.setSign(1)],
  ]);

  // ── Cas 3 : appels transmettant le véritable évènement de clic
  // (`saveAsDefault`/`restoreSavedDefaults`/`clearSavedDefaults` lisent
  // `event.currentTarget` via `_getFooterBtn` dans src/i18n.ts pour flasher
  // le libellé du bouton cliqué — non modifié, seul l'appel change). ────
  byId('btn-savedefault').addEventListener('click', (e) => game.saveAsDefault(e));
  byId('btn-restoredefault').addEventListener('click', (e) => game.restoreSavedDefaults(e));
  byId('btn-cleardefault').addEventListener('click', (e) => game.clearSavedDefaults(e));

  // ── Cas 4 : appels composés (deux appels dans le même ordre) ───────
  onClick([
    ['obj-win', () => { game.clearPresetSelection(); game.selectObjectif('win'); }],
    ['obj-elim', () => { game.clearPresetSelection(); game.selectObjectif('elim'); }],
    ['obj-none', () => { game.clearPresetSelection(); game.selectObjectif('none'); }],
  ]);

  // ── Cas 5 : condition sur la cible du clic (fermeture en cliquant sur
  // le fond flouté, jamais sur la feuille elle-même) ─────────────────
  byId('dice-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) diceUi.closeDice();
  });

  // ── Cas 6 : manipulation DOM inline (toggle de classe simple, pas de
  // fonction dédiée dans game.ts pour l'ouverture/fermeture de reset-modal
  // par ce chemin précis — reproduit tel quel, sans créer de nouvelle
  // fonction dans un module hors périmètre) ──────────────────────────
  byId('bar-reset-btn').addEventListener('click', () => {
    byId('reset-modal').classList.remove('hidden');
  });
  byId('btn-back-reset').addEventListener('click', () => {
    byId('reset-modal').classList.add('hidden');
  });

  // ── Cas 7 : groupe d'éléments similaires ciblés par sélecteur + data-*
  // (chips de points d'objectif — même paire d'appels composés que le
  // cas 4, un par valeur portée par `data-oval`) ─────────────────────
  document.querySelectorAll<HTMLElement>('#objectif-presets .points-chip[data-oval]').forEach((chip) => {
    const val = Number(chip.dataset.oval);
    chip.addEventListener('click', () => {
      game.clearPresetSelection();
      game.selectObjectifPreset(val);
    });
  });
}

wireHandlers();

drawSplashIcon();
