// Modales de jeu : ouverture/fermeture avec piège de focus, pavé numérique (tactile ET clavier
// physique), confirmation d'élimination, célébration du vainqueur, feuille joueur.
//
// Toutes les modales sont des `role="dialog" aria-modal="true"` : `trapFocus` cycle la tabulation,
// Échap ferme et rend le focus au déclencheur. Le pavé se ferme aussi par un glissement vers le bas.
import { KEYPAD_BACK, KEYPAD_KEYS } from '../core/constants.js';
import { fmtNum } from '../core/format.js';
import { trapFocus } from './a11y.js';
import { byId, el, hide, icon, show } from './dom.js';

/** Identifiants des surcouches fermées lors d'un reset de partie. */
export const GAME_OVERLAYS = [
  'reset-modal',
  'winner-modal',
  'recap',
  'score-modal',
  'elim-modal',
  'player-modal',
  'jump-modal',
];

/** Distance (px) d'un glissement vers le bas qui ferme une feuille. */
const SWIPE_CLOSE = 64;
/**
 * Fenêtre (ms) pendant laquelle une modale qui vient de s'ouvrir n'accepte aucun geste.
 * Une modale ouverte par un APPUI LONG apparaît alors que le doigt est encore posé : au
 * relâchement, le navigateur émet un `click` de compatibilité aux coordonnées du doigt, qui
 * atterrit sur la modale toute neuve (une touche du pavé, « Éliminer »…). Ce délai le neutralise.
 */
const ARM_DELAY = 320;

/** Libérations du piège de focus, par identifiant de modale. */
const traps = new Map();

/** Vrai si la modale est affichée. */
export const isModalOpen = (id) => {
  const node = byId(id);
  return Boolean(node) && !node.classList.contains('hidden');
};

/** Ouvre une modale et y piège le focus. */
export function openModal(id, { onEscape, initialFocus } = {}) {
  const node = byId(id);
  if (!node || !node.classList.contains('hidden')) return;
  show(node);
  node.style.pointerEvents = 'none';
  setTimeout(() => {
    node.style.pointerEvents = '';
  }, ARM_DELAY);
  const release = trapFocus(node, {
    onEscape: onEscape || (() => closeModal(id)),
    initialFocus,
  });
  traps.set(id, release);
}

/** Ferme une modale et libère le piège de focus. */
export function closeModal(id) {
  const node = byId(id);
  if (!node) return;
  const release = traps.get(id);
  traps.delete(id);
  node.style.pointerEvents = '';
  hide(node);
  if (release) release();
}

export const closeGameOverlays = () => GAME_OVERLAYS.forEach(closeModal);

/** Glissement vers le bas sur une feuille (hors boutons et champs) = fermeture. */
function enableSwipeClose(overlayId) {
  const overlay = byId(overlayId);
  const box = overlay && overlay.querySelector('.modal-box');
  if (!box) return;
  let startY = null;
  box.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, input, textarea')) return;
    startY = e.clientY;
  });
  box.addEventListener('pointerup', (e) => {
    if (startY === null) return;
    const dy = e.clientY - startY;
    startY = null;
    if (dy > SWIPE_CLOSE) closeModal(overlayId);
  });
  box.addEventListener('pointercancel', () => {
    startY = null;
  });
}

// ── Modale de score manuel (pavé) ───────────────────────────────────

const MAX_DIGITS = 7;
let modalPlayerIdx = -1;
let modalValue = '0';
let modalSign = 1;
let onScoreConfirm = () => {};

function updateModalDisplay() {
  const v = parseInt(modalValue, 10) || 0;
  const display = byId('score-modal-display');
  display.textContent = (modalSign === 1 ? '+' : '-') + fmtNum(v);
  display.className = 'modal-score-display' + (modalSign === 1 ? ' pos' : ' neg');
}

function pressKey(k) {
  if (k === KEYPAD_BACK) modalValue = modalValue.length > 1 ? modalValue.slice(0, -1) : '0';
  else if (k === '00') modalValue = modalValue === '0' ? '0' : modalValue + '00';
  else modalValue = modalValue === '0' ? String(k) : modalValue + k;
  if (modalValue.length > MAX_DIGITS) modalValue = modalValue.slice(0, MAX_DIGITS);
  updateModalDisplay();
}

/** Ouvre le pavé pour un joueur (indice + objet joueur). */
export function openScoreModal(pi, player) {
  modalPlayerIdx = pi;
  modalValue = '0';
  modalSign = 1;
  byId('score-modal-player').textContent =
    (player.playerName || `Joueur ${pi + 1}`) + ' — ' + fmtNum(player.score);
  updateModalDisplay();
  byId('sign-plus').classList.add('active');
  byId('sign-plus').setAttribute('aria-pressed', 'true');
  byId('sign-minus').classList.remove('active');
  byId('sign-minus').setAttribute('aria-pressed', 'false');
  openModal('score-modal', { onEscape: closeScoreModal });
}

export function closeScoreModal() {
  closeModal('score-modal');
}

/** Choisit le signe (+1 gain, -1 perte). */
export function setSign(s) {
  modalSign = s;
  byId('sign-plus').classList.toggle('active', s === 1);
  byId('sign-plus').setAttribute('aria-pressed', String(s === 1));
  byId('sign-minus').classList.toggle('active', s === -1);
  byId('sign-minus').setAttribute('aria-pressed', String(s === -1));
  updateModalDisplay();
}

/** Valide la saisie : transmet (joueur, delta signé) au gestionnaire puis ferme. */
export function confirmScoreModal() {
  const v = parseInt(modalValue, 10) || 0;
  if (v === 0) {
    closeScoreModal();
    return;
  }
  const pi = modalPlayerIdx;
  const delta = modalSign * v;
  closeScoreModal();
  onScoreConfirm(pi, delta);
}

/** Clavier physique pendant que le pavé est ouvert : chiffres, Retour arrière, Entrée, +/−. */
function onKeypadKey(e) {
  if (!isModalOpen('score-modal')) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key >= '0' && e.key <= '9') pressKey(Number(e.key));
  else if (e.key === 'Backspace') pressKey(KEYPAD_BACK);
  else if (e.key === 'Enter') confirmScoreModal();
  else if (e.key === '+' || e.key === '=') setSign(1);
  else if (e.key === '-' || e.key === '_') setSign(-1);
  else return;
  e.preventDefault();
}

/** Étiquette accessible d'une touche du pavé. */
const keyLabel = (k) => (k === KEYPAD_BACK ? 'Effacer le dernier chiffre' : `Chiffre ${k}`);

/** Construit le pavé numérique et enregistre le gestionnaire de validation. */
export function initScoreModal({ onConfirm }) {
  onScoreConfirm = onConfirm;
  const kp = byId('modal-keypad');
  kp.replaceChildren();
  KEYPAD_KEYS.forEach((k) => {
    const isBack = k === KEYPAD_BACK;
    const b = el('button', {
      type: 'button',
      className: 'key-btn' + (isBack ? ' del' : ''),
      'aria-label': keyLabel(k),
    });
    if (isBack) b.append(icon('back'));
    else b.textContent = String(k);
    b.addEventListener('click', () => pressKey(k));
    kp.append(b);
  });
  document.addEventListener('keydown', onKeypadKey);
  enableSwipeClose('score-modal');
  enableSwipeClose('player-modal');
}

// ── Élimination et vainqueur ────────────────────────────────────────

/** Demande confirmation d'élimination pour un nom affiché. */
export function openElimModal(name) {
  byId('elim-confirm-name').textContent = name;
  openModal('elim-modal');
}

/**
 * Affiche le vainqueur. `reason` = 'max-reached' (objectif) ou 'last-alive' (dernier survivant) ;
 * le titre le dit en toutes lettres, en plus du sous-titre chiffré.
 */
export function openWinnerModal(name, sub, reason = 'last-alive') {
  byId('winner-title').textContent =
    reason === 'max-reached' ? 'Objectif atteint' : 'Dernier survivant';
  byId('winner-name').textContent = name;
  byId('winner-sub').textContent = sub;
  openModal('winner-modal');
}

// ── Feuille joueur ──────────────────────────────────────────────────

let sheetIdx = -1;
let sheetHandlers = { onRename: () => {}, onToggleElim: () => {} };

/** Enregistre les gestionnaires de la feuille joueur (renommage, élimination). */
export function initPlayerSheet(handlers) {
  sheetHandlers = { ...sheetHandlers, ...handlers };
}

/** Ouvre la feuille d'un joueur : renommer (18 caractères) et éliminer/réintégrer. */
export function openPlayerSheet(pi, player) {
  sheetIdx = pi;
  const name = player.playerName || '';
  byId('player-modal-title').textContent = name || `Joueur ${pi + 1}`;
  byId('player-modal-sub').textContent =
    `${fmtNum(player.score)} pts${player.eliminated ? ' · éliminé' : ''}`;
  const input = byId('player-name-input');
  input.value = name;
  input.placeholder = `Joueur ${pi + 1}`;
  const elimBtn = byId('player-elim-btn');
  elimBtn.replaceChildren(
    icon(player.eliminated ? 'refresh' : 'skull'),
    el('span', { className: 'btn-text', text: player.eliminated ? 'Réintégrer' : 'Éliminer' }),
  );
  openModal('player-modal', { onEscape: closePlayerSheet, initialFocus: input });
}

export function closePlayerSheet() {
  sheetIdx = -1;
  closeModal('player-modal');
}

/** Valide le renommage saisi dans la feuille joueur. */
export function confirmPlayerSheet() {
  if (sheetIdx < 0) return;
  const value = byId('player-name-input').value;
  const pi = sheetIdx;
  closePlayerSheet();
  sheetHandlers.onRename(pi, value);
}

/** Élimine ou réintègre le joueur de la feuille ouverte. */
export function togglePlayerElim() {
  if (sheetIdx < 0) return;
  const pi = sheetIdx;
  closePlayerSheet();
  sheetHandlers.onToggleElim(pi);
}
