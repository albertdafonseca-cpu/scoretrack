// Modales : ouverture/fermeture génériques, modale de saisie de score (pavé), élimination, vainqueur.
import { KEYPAD_KEYS } from '../core/constants.js';
import { fmtNum } from '../core/format.js';
import { byId, el, show, hide } from './dom.js';

/** Identifiants des surcouches fermées lors d'un reset de partie. */
export const GAME_OVERLAYS = ['reset-modal', 'winner-modal', 'recap', 'score-modal', 'elim-modal'];

export const openModal = (id) => show(byId(id));
export const closeModal = (id) => hide(byId(id));
export const closeGameOverlays = () => GAME_OVERLAYS.forEach(closeModal);

// ── Modale de score manuel ──────────────────────────────────────────
const MAX_DIGITS = 7;
let modalPlayerIdx = -1;
let modalValue = '0';
let modalSign = 1;
let onScoreConfirm = () => {};

function updateModalDisplay() {
  const v = parseInt(modalValue) || 0;
  const display = byId('score-modal-display');
  display.textContent = (modalSign === 1 ? '+' : '-') + fmtNum(v);
  display.className = 'modal-score-display' + (modalSign === 1 ? ' pos' : ' neg');
}

function pressKey(k) {
  if (k === '⌫') modalValue = modalValue.length > 1 ? modalValue.slice(0, -1) : '0';
  else if (k === '00') modalValue = modalValue === '0' ? '0' : modalValue + '00';
  else modalValue = modalValue === '0' ? String(k) : modalValue + k;
  if (modalValue.length > MAX_DIGITS) modalValue = modalValue.slice(0, MAX_DIGITS);
  updateModalDisplay();
}

/** Ouvre la modale pour un joueur (indice + objet joueur). */
export function openScoreModal(pi, player) {
  modalPlayerIdx = pi;
  modalValue = '0';
  modalSign = 1;
  byId('score-modal-player').textContent =
    (player.playerName || `Joueur ${pi + 1}`) + ' — ' + fmtNum(player.score);
  updateModalDisplay();
  byId('sign-plus').classList.add('active');
  byId('sign-minus').classList.remove('active');
  openModal('score-modal');
}

export function closeScoreModal() {
  closeModal('score-modal');
}

/** Choisit le signe (+1 gain, -1 perte). */
export function setSign(s) {
  modalSign = s;
  byId('sign-plus').classList.toggle('active', s === 1);
  byId('sign-minus').classList.toggle('active', s === -1);
  updateModalDisplay();
}

/** Valide la saisie : transmet (joueur, delta signé) au gestionnaire puis ferme. */
export function confirmScoreModal() {
  const v = parseInt(modalValue) || 0;
  if (v === 0) {
    closeScoreModal();
    return;
  }
  onScoreConfirm(modalPlayerIdx, modalSign * v);
  closeScoreModal();
}

/** Construit le pavé numérique et enregistre le gestionnaire de validation. */
export function initScoreModal({ onConfirm }) {
  onScoreConfirm = onConfirm;
  const kp = byId('modal-keypad');
  kp.replaceChildren();
  KEYPAD_KEYS.forEach((k) => {
    const b = el('button', { className: 'key-btn' + (k === '⌫' ? ' del' : ''), text: String(k) });
    b.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        pressKey(k);
      },
      { passive: false },
    );
    b.addEventListener('click', () => pressKey(k));
    kp.appendChild(b);
  });
}

// ── Élimination et vainqueur ────────────────────────────────────────

/** Demande confirmation d'élimination pour un nom affiché. */
export function openElimModal(name) {
  byId('elim-confirm-name').textContent = name;
  openModal('elim-modal');
}

/** Affiche le vainqueur. */
export function openWinnerModal(name, sub) {
  byId('winner-name').textContent = name;
  byId('winner-sub').textContent = sub;
  openModal('winner-modal');
}
