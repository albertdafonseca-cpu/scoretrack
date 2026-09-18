// Écran de jeu : construction des cartes, gestes, mise à jour différentielle, historique v2,
// rotation animée, élimination, sauvegarde.
//
// Principes :
//   - le DOM de la grille est construit UNE fois par partie ; tap, annulation, rétablissement,
//     rotation et élimination ne font que muter les nœuds existants (les `.pcard` gardent leur
//     identité, aucune animation n'est coupée par un re-rendu) ;
//   - les deux moitiés d'une carte sont deux <button> côte à côte DANS le repère tourné : le côté
//     touché découle du nœud atteint, plus aucune géométrie à recalculer par rotation ;
//   - un seul jeu d'écouteurs Pointer Events sur la grille (aucun doublon touch/click) ; les clics
//     synthétiques du clavier sont reconnus à `detail === 0` ;
//   - l'ajustement des tailles est déclenché par un ResizeObserver et mesuré en deux passes
//     déterministes (aucun sondage, aucune trame masquée).
import { fmtNum } from '../core/format.js';
import {
  applyDelta,
  createPlayers,
  findWinner,
  isAtFloor,
  isMaxReached,
  needsElimination,
  scoreClass,
} from '../core/rules.js';
import {
  applyEntry,
  canRedo,
  canUndo,
  closeGroup,
  jumpTo,
  recordElim,
  recordRename,
  recordRotate,
  recordScore,
  redo,
  undo,
} from '../core/history.js';
import {
  BAR_H,
  HEADER_H,
  cardBox,
  computeFit,
  computeLayout,
  rotateSeats,
} from '../core/layout.js';
import { KEYS, parseGame, serializeGame } from '../core/save-schema.js';
import { readJSON, remove, scheduleWrite } from '../platform/storage.js';
import { haptic } from '../platform/haptics.js';
import { setGame, store } from '../store.js';
import { byId, el, hideAllPages, icon } from './dom.js';
import { announce } from './a11y.js';
import { showToast } from './toast.js';
import {
  closeModal,
  openElimModal,
  openPlayerSheet,
  openScoreModal,
  openWinnerModal,
} from './modals.js';
import { setRestoreBannerVisible } from './setup.js';
import { fitCard } from '../fx/layout-fit.js';
import { captureRects, playFlip } from '../fx/flip.js';
import { flashHalf, hideDeltaBubble, setScoreText, showDeltaBubble } from '../fx/score.js';
import { createRing, startRing } from '../fx/hold-ring.js';
import { celebrate, stopConfetti } from '../fx/confetti.js';

/** Durée (ms) de l'appui long ouvrant le pavé numérique. */
export const HOLD_DELAY = 450;
/** Distance (px) au-delà de laquelle un appui devient un glissement et n'applique rien. */
const SLIDE_CANCEL = 26;
/** Répétition de l'annulation maintenue : délai initial puis intervalle (ms). */
const UNDO_REPEAT_DELAY = 500;
const UNDO_REPEAT_INTERVAL = 140;
/** Longueur maximale d'un prénom saisi en cours de partie. */
export const NAME_MAX = 18;

/** Messages de reprise impossible, par raison renvoyée par `parseGame`. */
const RESTORE_MESSAGES = {
  empty: 'Aucune partie à reprendre.',
  corrupt: 'Sauvegarde illisible : la partie n’a pas pu être reprise.',
  unsupported: 'Sauvegarde créée par une version plus récente de ScoreTrack.',
};

/** Cartes par indice de joueur. */
const cards = [];
/** Références internes d'une carte (score, nom, bulle…), par élément de carte. */
const parts = new WeakMap();
/** Sens du dernier tap par joueur : un changement de sens ouvre une nouvelle action. */
const lastTapDir = new Map();
/** Nombre de caractères du score affiché, par joueur (ré-ajustement seulement s'il change). */
const scoreLen = [];
/** Repère lisible de chaque carte (`cardBox`), recalculé à chaque mesure. */
const boxes = [];
/** Dernière disposition appliquée (pour recalculer les repères à chaque redimensionnement). */
let layout = null;
/** Score affiché sans séparateurs de milliers (drapeau `compact` de `computeFit`). */
const compact = [];

let resizeObserver = null;
let pressed = null;
let gameReadyMarked = false;
let winnerFor = -1;

const gameScreen = () => byId('game-screen');
const bar = () => byId('bar');

// ── Sauvegarde ─────────────────────────────────────────────────────

/** Écrit la partie en cours (coalescée : au plus une écriture par trame). */
export function saveGame() {
  const { game, config } = store;
  scheduleWrite(
    KEYS.save,
    serializeGame({
      players: game.players,
      seatOrder: game.seatOrder,
      log: game.log,
      config,
    }),
  );
}

/** Efface la sauvegarde et la bannière de reprise. */
export function discardSave() {
  remove(KEYS.save);
  setRestoreBannerVisible(false);
}

function showGameScreen() {
  hideAllPages();
  gameScreen().style.display = 'flex';
  bar().style.display = 'flex';
}

/** Reprend la partie sauvegardée ; false (avec message) si elle est inexploitable. */
export function restoreGame() {
  const result = parseGame(readJSON(KEYS.save, null));
  if (!result.ok) {
    showToast(RESTORE_MESSAGES[result.reason] || RESTORE_MESSAGES.corrupt);
    setRestoreBannerVisible(false);
    return false;
  }
  const { players, seatOrder, log, config } = result.game;
  if (result.repaired) {
    showToast('Sauvegarde incomplète : la partie a été réparée au mieux avant d’être reprise.');
  }
  setGame({ players, seatOrder, log });
  Object.assign(store.config, config);
  setRestoreBannerVisible(false);
  showGameScreen();
  buildGrid();
  return true;
}

/** Démarre une nouvelle partie avec les prénoms saisis. */
export function startGame(names) {
  const { config } = store;
  const players = createPlayers(config.numPlayers, names, config.startPoints);
  setGame({ players, seatOrder: players.map((_, i) => i) });
  showGameScreen();
  buildGrid();
  saveGame();
}

/** Quitte l'écran de jeu et supprime la sauvegarde (reset). */
export function leaveGame() {
  stopConfetti();
  if (resizeObserver) resizeObserver.disconnect();
  gameScreen().style.display = 'none';
  bar().style.display = 'none';
  byId('players-wrap').replaceChildren();
  cards.length = 0;
  scoreLen.length = 0;
  boxes.length = 0;
  compact.length = 0;
  lastTapDir.clear();
  winnerFor = -1;
  remove(KEYS.save);
  store.elimPending = -1;
}

// ── Construction de la grille (une fois par partie) ─────────────────

function buildHalf(pi, dir) {
  const half = el('button', {
    type: 'button',
    className: `tap-half ${dir > 0 ? 'plus' : 'minus'}`,
    dataset: { pi: String(pi), dir: String(dir) },
  });
  const sign = icon(dir > 0 ? 'plus' : 'minus');
  sign.classList.add('tap-sign');
  half.append(sign, createRing());
  return half;
}

function buildElimTag() {
  const mark = icon('skull');
  mark.classList.add('elim-icon');
  return el(
    'div',
    { className: 'elim-tag', hidden: true },
    mark,
    el('div', { className: 'elim-label', text: 'Éliminé' }),
  );
}

function buildCard(pi) {
  const p = store.game.players[pi];
  const card = el('div', { className: `pcard color-${(pi % 10) + 1}`, id: `card-${pi}` });
  const inner = el('div', { className: 'card-inner', id: `inner-${pi}` });
  const zone = el('div', { className: 'tap-zone' });
  const minus = buildHalf(pi, -1);
  const plus = buildHalf(pi, 1);
  const nameBtn = el('button', {
    type: 'button',
    className: 'pname',
    dataset: { pi: String(pi) },
  });
  const score = el('span', {
    className: `score ${scoreClass(p.score, store.config.startPoints)}`.trim(),
    id: `sc-${pi}`,
    text: fmtNum(p.score),
    'aria-live': 'polite',
  });
  const bubble = el('span', { className: 'delta-bubble', id: `df-${pi}`, hidden: true });
  const face = el(
    'div',
    { className: 'card-face' },
    nameBtn,
    el('div', { className: 'score-wrap' }, score, bubble),
  );
  const elimTag = buildElimTag();
  zone.append(minus, plus, face, elimTag);
  inner.append(zone);
  card.append(inner);
  parts.set(card, { pi, inner, zone, minus, plus, nameBtn, score, bubble, elimTag });
  renderName(pi, card);
  refreshElim(pi, card);
  return card;
}

/** (Re)construit la grille : appelé au démarrage et à la reprise, jamais sur un tap. */
function buildGrid() {
  const wrap = byId('players-wrap');
  wrap.replaceChildren();
  cards.length = 0;
  scoreLen.length = 0;
  boxes.length = 0;
  compact.length = 0;
  lastTapDir.clear();
  winnerFor = -1;
  wrap.style.paddingBottom = `${BAR_H}px`;
  store.game.players.forEach((_, i) => {
    const card = buildCard(i);
    cards[i] = card;
    wrap.append(card);
  });
  applyLayout();
  observeSize();
  refreshHistoryButtons();
  markGameReady();
}

/** Compatibilité : reconstruit tout (utilisé si un appelant externe force un rendu complet). */
export function renderGame() {
  buildGrid();
}

/** Place les cartes selon la disposition calculée ; `flip` anime le déplacement (rotation). */
function applyLayout({ flip = false } = {}) {
  const { game } = store;
  const before = flip ? captureRects(cards.filter(Boolean)) : null;
  const { cols, rows, placements } = computeLayout(game.players.length, game.seatOrder);
  layout = { cols, rows, placements };
  placements.forEach((placement) => {
    const { i, rot, c, r, cs, rs } = placement;
    const card = cards[i];
    if (!card) return;
    card.style.gridColumn = `${c}/span ${cs}`;
    card.style.gridRow = `${r}/span ${rs}`;
    card.classList.remove('rot-0', 'rot-180', 'rot-l', 'rot-r');
    card.classList.add(rot);
    card.dataset.rot = rot;
  });
  measureAll();
  if (before) playFlip(before);
}

/** Texte du score d'un joueur, séparateurs de milliers compris sauf en mode compact. */
function scoreText(pi) {
  const { score } = store.game.players[pi];
  return compact[pi] ? String(score) : fmtNum(score);
}

/**
 * Mesure une carte et applique les tailles calculées par le cœur.
 * Le repère vient de `cardBox` ; `computeFit` décide notamment de retirer les séparateurs de
 * milliers (`compact`) plutôt que de rendre un score à 7 chiffres illisible.
 */
function measureCard(card) {
  if (!card || !card.isConnected) return;
  const ref = parts.get(card);
  if (!ref) return;
  const pi = ref.pi;
  const w = card.clientWidth;
  const h = card.clientHeight;
  if (w < 8 || h < 8) return;
  const lateral = card.dataset.rot === 'rot-l' || card.dataset.rot === 'rot-r';
  ref.inner.style.width = `${lateral ? h : w}px`;
  ref.inner.style.height = `${lateral ? w : h}px`;
  const box = boxes[pi] || (lateral ? { w: h, h: w } : { w, h });
  const p = store.game.players[pi];
  // Le mode compact est décidé sur le score AVEC séparateurs ; si `computeFit` le réclame, la
  // taille est recalculée sur la chaîne réellement affichée (sans séparateurs). Idempotent.
  let fit = computeFit(box, fmtNum(p.score));
  compact[pi] = fit.compact;
  if (fit.compact) fit = computeFit(box, String(p.score));
  ref.score.textContent = scoreText(pi);
  const ghost = ref.nameBtn.querySelector('.pplayer-ghost');
  const label = ref.nameBtn.querySelector('.pplayer');
  fitCard(
    { score: ref.score, name: ref.nameBtn, label, ghost, bubble: ref.bubble, signs: signsOf(card) },
    box,
    fit,
  );
  scoreLen[pi] = ref.score.textContent.length;
}

const signsOf = (card) => Array.from(card.querySelectorAll('.tap-sign'));

/**
 * Pistes de grille en pixels ENTIERS : `1fr` laisse des bords fractionnaires (liserés flous et
 * cartes de largeurs inégales au sous-pixel). On répartit ici le reste de la division, une piste
 * recevant 1 px de plus que les autres au besoin.
 */
function integerTracks(total, count) {
  const base = Math.floor(total / count);
  const extra = total - base * count;
  return Array.from({ length: count }, (_, i) => `${base + (i < extra ? 1 : 0)}px`).join(' ');
}

function measureAll() {
  const wrap = byId('players-wrap');
  if (!layout) return;
  const { cols, rows, placements } = layout;
  const w = Math.round(wrap.clientWidth);
  const h = Math.round(wrap.clientHeight) - BAR_H;
  if (cols > 0 && rows > 0 && w > 0 && h > 0) {
    wrap.style.gridTemplateColumns = integerTracks(w, cols);
    wrap.style.gridTemplateRows = integerTracks(h, rows);
    // `cardBox` attend la hauteur de la FENÊTRE (il en retire l'en-tête et la barre) : on lui rend
    // la hauteur de grille mesurée augmentée de ces deux hauteurs. Une seule source de vérité.
    const viewport = { cols, rows, width: w, height: h + HEADER_H + BAR_H };
    placements.forEach((placement) => {
      boxes[placement.i] = cardBox(placement, viewport);
    });
  }
  for (const card of cards) measureCard(card);
}

/** Ajustement piloté par la taille réelle de la zone de jeu (aucun sondage). */
function observeSize() {
  const wrap = byId('players-wrap');
  if (typeof ResizeObserver !== 'function') {
    window.addEventListener('resize', measureAll);
    return;
  }
  if (resizeObserver) resizeObserver.disconnect();
  resizeObserver = new ResizeObserver(() => measureAll());
  resizeObserver.observe(wrap);
}

function markGameReady() {
  if (gameReadyMarked) return;
  gameReadyMarked = true;
  try {
    performance.mark('scoretrack:game-ready');
  } catch {
    /* API Performance indisponible */
  }
}

// ── Libellés et états dérivés ──────────────────────────────────────

const displayName = (pi) => store.game.players[pi].playerName || `Joueur ${pi + 1}`;

/**
 * (Re)pose l'identité de la carte : NUMÉRO DE JOUEUR (toujours affiché) puis prénom, ou son
 * emplacement fantôme. Le numéro est l'identifiant non chromatique exigé par D18 : même en
 * achromatopsie, ou sans prénom saisi, chaque carte reste rattachée à un joueur précis.
 */
function renderName(pi, card = cards[pi]) {
  const ref = parts.get(card);
  if (!ref) return;
  const p = store.game.players[pi];
  ref.nameBtn.replaceChildren(
    el('span', { className: 'pseat', text: String(pi + 1), 'aria-hidden': 'true' }),
    p.playerName
      ? el('span', { className: 'pplayer', text: p.playerName })
      : el('span', { className: 'pplayer-ghost' }),
  );
  ref.nameBtn.setAttribute('aria-label', `Fiche de ${displayName(pi)}`);
  refreshLabels(pi, card);
}

function refreshLabels(pi, card = cards[pi]) {
  const ref = parts.get(card);
  if (!ref) return;
  const who = displayName(pi);
  ref.minus.setAttribute('aria-label', `Retirer 1 point à ${who}`);
  ref.plus.setAttribute('aria-label', `Ajouter 1 point à ${who}`);
  ref.score.setAttribute('aria-label', `${who} : ${fmtNum(store.game.players[pi].score)} points`);
}

/** Applique l'état « éliminé » d'un joueur à sa carte, sans reconstruire quoi que ce soit. */
function refreshElim(pi, card = cards[pi]) {
  const ref = parts.get(card);
  if (!ref) return;
  const out = Boolean(store.game.players[pi].eliminated);
  card.classList.toggle('elim', out);
  ref.elimTag.hidden = !out;
  ref.minus.disabled = out;
  ref.plus.disabled = out;
  refreshLabels(pi, card);
}

/** Met à jour le score affiché (animé dans le sens du delta) et sa classe d'alerte. */
function updateScore(pi, direction) {
  const ref = parts.get(cards[pi]);
  if (!ref) return;
  const text = scoreText(pi);
  const p = store.game.players[pi];
  setScoreText(ref.score, text, direction);
  ref.score.className = `score ${scoreClass(p.score, store.config.startPoints)}`.trim();
  if (text.length !== scoreLen[pi]) measureCard(cards[pi]);
  refreshLabels(pi);
}

/** Active/désactive Annuler et Rétablir selon le journal. */
function refreshHistoryButtons() {
  const u = byId('undo-btn');
  const r = byId('redo-btn');
  if (u) u.disabled = !canUndo(store.game.log);
  if (r) r.disabled = !canRedo(store.game.log);
}

// ── Gestes (Pointer Events unifiés) ────────────────────────────────

function endPress({ apply = false } = {}) {
  if (!pressed) return;
  const { half, pi, dir, timer, stopRing, held } = pressed;
  clearTimeout(timer);
  stopRing();
  half.classList.remove('pressed');
  pressed = null;
  if (apply && !held) adjust(pi, dir, half);
}

function onPointerDown(e) {
  const half = e.target.closest('.tap-half');
  if (!half || half.disabled || e.button > 0) return;
  // Empêche les événements souris de compatibilité (le clic clavier reste reconnu à detail === 0).
  e.preventDefault();
  endPress();
  const pi = Number(half.dataset.pi);
  const dir = Number(half.dataset.dir);
  // Retour visuel immédiat : classe posée dans le gestionnaire, donc avant la trame suivante.
  half.classList.add('pressed');
  const stopRing = startRing(half.querySelector('.hold-ring'), HOLD_DELAY);
  const timer = setTimeout(() => {
    if (!pressed) return;
    pressed.held = true;
    endPress();
    haptic('longpress');
    swallowNextClick();
    openManualEntry(pi);
  }, HOLD_DELAY);
  pressed = {
    half,
    pi,
    dir,
    timer,
    stopRing,
    held: false,
    id: e.pointerId,
    x: e.clientX,
    y: e.clientY,
  };
  try {
    half.setPointerCapture(e.pointerId);
  } catch {
    /* capture non prise en charge */
  }
}

function onPointerMove(e) {
  if (!pressed || e.pointerId !== pressed.id) return;
  const dx = e.clientX - pressed.x;
  const dy = e.clientY - pressed.y;
  if (dx * dx + dy * dy > SLIDE_CANCEL * SLIDE_CANCEL) endPress();
}

function onPointerUp(e) {
  if (!pressed || e.pointerId !== pressed.id) return;
  endPress({ apply: true });
}

/**
 * Vrai si ce clic vient du CLAVIER (Entrée/Espace sur un bouton focalisé) et non d'un geste.
 * Chrome émet les clics sous forme de `PointerEvent` : `pointerType` vaut 'touch'/'mouse'/'pen'
 * pour un geste et '' pour un clic synthétisé au clavier. Les navigateurs qui émettent encore un
 * `MouseEvent` sont couverts par `detail === 0` (aucun clic de souris n'a un compteur nul).
 * Attention : sous Chrome mobile, un clic issu d'un tap a bien `detail === 0` — `detail` seul ne
 * suffit donc PAS, et s'y fier dédoublerait chaque tap.
 */
const isKeyboardClick = (e) => !e.pointerType && e.detail === 0;

/**
 * Clics de la grille. Le nom ouvre la feuille joueur quel que soit le moyen ; les moitiés +/−
 * sont déjà servies par `pointerup`, donc seul le clic clavier y est traité : aucun doublon
 * souris/tactile n'est possible.
 */
function onClick(e) {
  const nameBtn = e.target.closest('.pname');
  if (nameBtn) {
    openSheet(Number(nameBtn.dataset.pi));
    return;
  }
  if (!isKeyboardClick(e)) return;
  const half = e.target.closest('.tap-half');
  if (half && !half.disabled) adjust(Number(half.dataset.pi), Number(half.dataset.dir), half);
}

/** Raccourcis clavier de la carte focalisée : + et − (D6.3). */
function onGridKey(e) {
  if (e.key !== '+' && e.key !== '-') return;
  const card = e.target.closest('.pcard');
  if (!card) return;
  const ref = parts.get(card);
  if (!ref) return;
  const half = e.key === '+' ? ref.plus : ref.minus;
  if (half.disabled) return;
  e.preventDefault();
  adjust(ref.pi, e.key === '+' ? 1 : -1, half);
}

// ── Modifications de score ─────────────────────────────────────────

/** Ferme le groupe d'annulation ouvert d'un joueur et masque sa bulle. */
function closeGroupFor(pi) {
  closeGroup(store.game.log, pi);
  lastTapDir.delete(pi);
  hideDeltaBubble(byId(`df-${pi}`));
}

/** Somme du groupe encore ouvert au curseur (pour la bulle de delta cumulé). */
function openGroupSum() {
  const { entries, cursor } = store.game.log;
  const last = entries[cursor - 1];
  if (!last) return 0;
  let sum = 0;
  for (let i = cursor - 1; i >= 0 && entries[i].groupId === last.groupId; i--)
    sum += entries[i].delta;
  return sum;
}

/** Tap +1 / −1 sur une moitié de carte. */
function adjust(pi, dir, half) {
  const { config } = store;
  const p = store.game.players[pi];
  if (p.eliminated) return;
  const { newScore, realDelta } = applyDelta(p.score, dir, config);
  if (realDelta === 0) {
    // Butée : retour IDENTIQUE en haut (plafond) et en bas (plancher), motif haptique distinct.
    const ceiling = isMaxReached(p.score, config.maxPoints);
    const floor = isAtFloor(p.score, config);
    half.classList.add('blocked');
    setTimeout(() => half.classList.remove('blocked'), 240);
    haptic(ceiling ? 'ceiling' : 'floor');
    announce(
      ceiling
        ? `${displayName(pi)} est au plafond de ${fmtNum(config.maxPoints)}`
        : floor
          ? `${displayName(pi)} est déjà à 0`
          : `${displayName(pi)} ne peut pas bouger`,
    );
    return;
  }
  const sign = Math.sign(realDelta);
  // Changer de sens ouvre une nouvelle action : « +3 puis −1 » s'annule en deux fois.
  if (lastTapDir.get(pi) !== undefined && lastTapDir.get(pi) !== sign) closeGroupFor(pi);
  lastTapDir.set(pi, sign);
  const from = p.score;
  p.score = newScore;
  recordScore(store.game.log, pi, from, newScore, 'tap');
  haptic('tap');
  flashHalf(half, realDelta > 0);
  updateScore(pi, sign);
  showDeltaBubble(byId(`df-${pi}`), openGroupSum(), () => closeGroupFor(pi));
  afterScoreChange(pi);
}

/**
 * Avale le prochain `click` (au plus une fois, dans la fenêtre donnée).
 * Une modale ouverte pendant que le doigt est encore posé reçoit, au relâchement, le `click` de
 * compatibilité émis par le navigateur aux coordonnées du doigt : sans cette garde, il presse une
 * touche du pavé au hasard (« +730 » au lieu de « +30 »).
 */
function swallowNextClick(ms = 1500) {
  const onCapture = (e) => {
    e.stopPropagation();
    e.preventDefault();
    done();
  };
  const timer = setTimeout(() => done(), ms);
  const done = () => {
    clearTimeout(timer);
    document.removeEventListener('click', onCapture, true);
  };
  document.addEventListener('click', onCapture, true);
}

/** Appui long : clôt le groupe ouvert et ouvre le pavé numérique. */
function openManualEntry(pi) {
  if (store.game.players[pi].eliminated) return;
  closeGroupFor(pi);
  openScoreModal(pi, store.game.players[pi]);
}

/** Applique un delta saisi au pavé (action distincte, jamais groupée avec les taps). */
export function applyManualDelta(pi, delta) {
  const p = store.game.players[pi];
  const { newScore, realDelta } = applyDelta(p.score, delta, store.config);
  if (realDelta === 0) {
    haptic(isMaxReached(p.score, store.config.maxPoints) ? 'ceiling' : 'floor');
    return;
  }
  closeGroupFor(pi);
  const from = p.score;
  p.score = newScore;
  recordScore(store.game.log, pi, from, newScore, 'keypad');
  haptic('tap');
  updateScore(pi, Math.sign(realDelta));
  showDeltaBubble(byId(`df-${pi}`), realDelta, () => closeGroupFor(pi));
  afterScoreChange(pi);
}

/** Suites d'un changement de score : élimination, victoire, boutons, sauvegarde. */
function afterScoreChange(pi) {
  refreshHistoryButtons();
  saveGame();
  const p = store.game.players[pi];
  if (needsElimination(p, store.config)) {
    haptic('elim');
    store.elimPending = pi;
    openElimModal(displayName(pi));
    return;
  }
  maybeWinner();
}

// ── Victoire ───────────────────────────────────────────────────────

/** Ouvre (ou referme) la modale de victoire selon l'état courant. */
function maybeWinner() {
  const w = findWinner(store.game.players, store.config);
  if (!w) {
    winnerFor = -1;
    return;
  }
  if (winnerFor === w.index) return;
  winnerFor = w.index;
  const p = store.game.players[w.index];
  const sub =
    w.reason === 'max-reached'
      ? `Objectif atteint · ${fmtNum(p.score)} / ${fmtNum(store.config.maxPoints)} pts`
      : `Score final : ${fmtNum(p.score)}`;
  openWinnerModal(displayName(w.index), sub, w.reason);
  haptic('win');
  celebrate({ container: byId('winner-modal') });
  announce(`${displayName(w.index)} remporte la partie. ${sub}`, 'assertive');
}

// ── Élimination ────────────────────────────────────────────────────

export function confirmElimination() {
  closeModal('elim-modal');
  const i = store.elimPending;
  if (i < 0) return;
  store.elimPending = -1;
  store.game.players[i].eliminated = true;
  recordElim(store.game.log, i, true);
  refreshElim(i);
  haptic('elim');
  refreshHistoryButtons();
  saveGame();
  maybeWinner();
}

export function cancelElimination() {
  closeModal('elim-modal');
  if (store.elimPending < 0) return;
  store.elimPending = -1;
  undoLast();
}

// ── Feuille joueur (renommer, éliminer, réintégrer) ─────────────────

function openSheet(pi) {
  if (!Number.isInteger(pi) || !store.game.players[pi]) return;
  openPlayerSheet(pi, store.game.players[pi]);
}

/** Renomme un joueur (≤ 18 caractères) ; journalisé, donc annulable. */
export function renamePlayer(pi, rawName) {
  const p = store.game.players[pi];
  if (!p) return;
  const to = String(rawName).slice(0, NAME_MAX).trim();
  const from = p.playerName;
  if (to === from) return;
  p.playerName = to;
  recordRename(store.game.log, pi, from, to);
  renderName(pi);
  measureCard(cards[pi]);
  refreshHistoryButtons();
  saveGame();
  announce(`${displayName(pi)} renommé`);
}

/** Élimine ou réintègre un joueur depuis la feuille joueur. */
export function togglePlayerElimination(pi) {
  const p = store.game.players[pi];
  if (!p) return;
  const next = !p.eliminated;
  p.eliminated = next;
  recordElim(store.game.log, pi, next);
  refreshElim(pi);
  haptic(next ? 'elim' : 'undo');
  refreshHistoryButtons();
  saveGame();
  maybeWinner();
  announce(next ? `${displayName(pi)} éliminé` : `${displayName(pi)} réintégré`);
}

// ── Annulation, rétablissement, retour à un point ───────────────────

/** Ferme les surcouches liées à un état de partie qui vient de changer. */
function closeVolatileOverlays() {
  closeModal('winner-modal');
  closeModal('elim-modal');
  closeModal('score-modal');
  stopConfetti();
  store.elimPending = -1;
}

/** Applique une action (directe ou inversée) et resynchronise l'affichage. */
function applyAction(action) {
  closeVolatileOverlays();
  applyEntry(store.game, action);
  if (action.via === 'rotate') {
    applyLayout({ flip: true });
  } else {
    const pi = action.playerIdx;
    hideDeltaBubble(byId(`df-${pi}`));
    lastTapDir.delete(pi);
    if (action.via === 'rename') {
      renderName(pi);
      measureCard(cards[pi]);
    } else if (action.via === 'elim' || action.via === 'unelim') {
      refreshElim(pi);
    } else {
      updateScore(pi, Math.sign(action.delta));
    }
  }
  refreshHistoryButtons();
  maybeWinner();
  saveGame();
}

export function undoLast() {
  const action = undo(store.game.log);
  if (!action) {
    refreshHistoryButtons();
    return;
  }
  lastTapDir.clear();
  applyAction(action);
  haptic('undo');
}

export function redoLast() {
  const action = redo(store.game.log);
  if (!action) {
    refreshHistoryButtons();
    return;
  }
  lastTapDir.clear();
  applyAction(action);
  haptic('undo');
}

/**
 * Revient à un point du journal (« revenir ici ») : applique toutes les entrées nécessaires,
 * en conservant la possibilité de rétablir. Renvoie false si l'identifiant est inconnu.
 */
export function jumpToEntry(entryId) {
  const list = jumpTo(store.game.log, entryId);
  if (!list) return false;
  closeVolatileOverlays();
  lastTapDir.clear();
  list.forEach((entry) => applyEntry(store.game, entry));
  store.game.players.forEach((_, i) => {
    hideDeltaBubble(byId(`df-${i}`));
    renderName(i);
    refreshElim(i);
    updateScore(i, 0);
  });
  applyLayout({ flip: true });
  refreshHistoryButtons();
  maybeWinner();
  saveGame();
  return true;
}

// ── Rotation des sièges ─────────────────────────────────────────────

export function rotatePlayers() {
  const { game } = store;
  if (game.players.length < 2) return;
  const before = game.seatOrder.slice();
  rotateSeats(game.seatOrder);
  recordRotate(game.log, before, game.seatOrder);
  applyLayout({ flip: true });
  refreshHistoryButtons();
  saveGame();
  haptic('tap');
  announce('Rotation des sièges');
}

// ── Câblage ─────────────────────────────────────────────────────────

/** Bouton Annuler : appui maintenu = répétition accélérée. */
function initUndoButton() {
  const btn = byId('undo-btn');
  if (!btn) return;
  let interval = 0;
  let timeout = 0;
  const stop = () => {
    clearTimeout(timeout);
    clearInterval(interval);
    timeout = 0;
    interval = 0;
  };
  btn.addEventListener('pointerdown', (e) => {
    if (btn.disabled || e.button > 0) return;
    e.preventDefault();
    stop();
    undoLast();
    timeout = setTimeout(() => {
      interval = setInterval(() => {
        if (btn.disabled) stop();
        else undoLast();
      }, UNDO_REPEAT_INTERVAL);
    }, UNDO_REPEAT_DELAY);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((type) =>
    btn.addEventListener(type, stop),
  );
  btn.addEventListener('click', (e) => {
    if (isKeyboardClick(e)) undoLast();
  });
}

/** Câble les gestes de la grille, le bouton Annuler et le suivi de taille. */
export function initGame() {
  const wrap = byId('players-wrap');
  wrap.addEventListener('pointerdown', onPointerDown);
  wrap.addEventListener('pointermove', onPointerMove);
  wrap.addEventListener('pointerup', onPointerUp);
  wrap.addEventListener('pointercancel', () => endPress());
  wrap.addEventListener('click', onClick);
  wrap.addEventListener('keydown', onGridKey);
  wrap.addEventListener('contextmenu', (e) => e.preventDefault());
  initUndoButton();
  window.addEventListener('orientationchange', () => setTimeout(measureAll, 200));
}

/** Ferme les groupes ouverts (avant l'ouverture du récapitulatif). */
export function closeAllOpenGroups() {
  store.game.players.forEach((_, i) => closeGroupFor(i));
}

/** Indices de test : état courant lisible sans dépendre du DOM. */
export const __test = { cards, parts, measureAll };
