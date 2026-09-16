// Écran de jeu : rendu des cartes, taps, appui long, annulation, rotation, élimination, sauvegarde.
import { fmtNum } from '../core/format.js';
import {
  applyDelta,
  createPlayers,
  findWinner,
  isAtFloor,
  needsElimination,
  scoreClass,
} from '../core/rules.js';
import {
  GROUP_DELAY,
  addGroupedDelta,
  addManualDelta,
  closeOpenGroup,
  popUndo,
  pushUndo,
} from '../core/history.js';
import { BAR_H, computeFit, computeLayout, rotateSeats } from '../core/layout.js';
import { KEYS, parseGame, serializeGame } from '../core/save-schema.js';
import { readJSON, remove, writeJSON } from '../platform/storage.js';
import { PATTERN_BLOCKED, PATTERN_ELIM, vibrate } from '../platform/haptics.js';
import { setGame, store } from '../store.js';
import { byId, el, hideAllPages, icon, qsa } from './dom.js';
import { closeModal, openElimModal, openScoreModal, openWinnerModal } from './modals.js';
import { setRestoreBannerVisible } from './setup.js';

/** Durée (ms) de l'appui long ouvrant le pavé numérique. */
const HOLD_DELAY = 450;
/** Durée (ms) du flash de fond après un tap. */
const FLASH_MS = 200;
/** Délai (ms) avant re-rendu après confirmation d'élimination. */
const ELIM_RENDER_DELAY = 300;
/** Répétition de l'annulation : délai initial puis intervalle (ms). */
const UNDO_REPEAT_DELAY = 500;
const UNDO_REPEAT_INTERVAL = 120;

let fitCache = {};

const gameScreen = () => byId('game-screen');
const bar = () => byId('bar');

// ── Sauvegarde ─────────────────────────────────────────────────────

/** Écrit la partie en cours (partie + paramètres). */
export function saveGame() {
  const { game, config } = store;
  writeJSON(
    KEYS.save,
    serializeGame({
      players: game.players,
      seatOrder: game.seatOrder,
      history: game.history,
      actionCounter: game.actionCounter,
      numPlayers: config.numPlayers,
      startPoints: config.startPoints,
      maxPoints: config.maxPoints,
      allowNeg: config.allowNeg,
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

/** Reprend la partie sauvegardée ; renvoie false (et efface la sauvegarde) si elle est inexploitable. */
export function restoreGame() {
  const parsed = parseGame(readJSON(KEYS.save, null));
  if (!parsed) {
    discardSave();
    return false;
  }
  const { players, seatOrder, history, actionCounter } = parsed;
  setGame({ players, seatOrder, history, actionCounter });
  Object.assign(store.config, {
    numPlayers: parsed.numPlayers,
    startPoints: parsed.startPoints,
    maxPoints: parsed.maxPoints,
    allowNeg: parsed.allowNeg,
  });
  setRestoreBannerVisible(false);
  showGameScreen();
  renderGame();
  return true;
}

/** Démarre une nouvelle partie avec les prénoms saisis. */
export function startGame(names) {
  const { config } = store;
  const players = createPlayers(config.numPlayers, names, config.startPoints);
  setGame({ players, seatOrder: players.map((_, i) => i), history: [], actionCounter: 0 });
  showGameScreen();
  renderGame();
  saveGame();
}

/** Quitte l'écran de jeu et supprime la sauvegarde (reset). */
export function leaveGame() {
  gameScreen().style.display = 'none';
  bar().style.display = 'none';
  remove(KEYS.save);
  store.elimPending = -1;
}

// ── Rendu ───────────────────────────────────────────────────────────

/** Attend que les cartes aient une taille mesurable puis ajuste les textes. */
function fitWhenReady(wrap) {
  let tries = 0;
  const tryFit = () => {
    const ready = qsa('.pcard', wrap).every((c) => {
      const inner = c.querySelector('.card-inner');
      return inner && inner.offsetWidth > 0 && inner.offsetHeight > 0;
    });
    if (ready || tries++ >= 10) {
      fitTexts();
      wrap.style.visibility = '';
    } else {
      setTimeout(tryFit, 20);
    }
  };
  tryFit();
}

/** (Re)construit la grille de cartes selon la disposition calculée. */
export function renderGame() {
  const { game } = store;
  const wrap = byId('players-wrap');
  wrap.replaceChildren();
  wrap.style.visibility = 'hidden';
  wrap.style.paddingBottom = `${BAR_H}px`;

  const { cols, rows, placements } = computeLayout(game.players.length, game.seatOrder);
  wrap.style.gridTemplateColumns = `repeat(${cols},minmax(0,1fr))`;
  wrap.style.gridTemplateRows = `repeat(${rows},minmax(0,1fr))`;

  placements.forEach(({ i, rot, c, r, cs, rs }) => {
    const cell =
      i === -1
        ? el('div', { style: 'background:var(--bg2);overflow:hidden;min-width:0;min-height:0;' })
        : buildCard(i, rot);
    cell.style.gridColumn = `${c}/span ${cs}`;
    cell.style.gridRow = `${r}/span ${rs}`;
    wrap.appendChild(cell);
  });

  // Ajustement après rendu (deux trames pour laisser la grille se poser)
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      fixLateral();
      fitWhenReady(wrap);
    }),
  );
}

/** Côté « + » de la zone selon l'orientation de la carte et le point touché. */
function isPlusSide(card, rot, clientX, clientY) {
  const rect = card.getBoundingClientRect();
  if (rot === 'rot-l') return clientY - rect.top >= rect.height / 2;
  if (rot === 'rot-r') return clientY - rect.top < rect.height / 2;
  if (rot === 'rot-180') return clientX - rect.left < rect.width / 2;
  return clientX - rect.left >= rect.width / 2;
}

function buildTapZone(pi, p, card, rot) {
  const zone = el(
    'div',
    { className: 'tap-zone' },
    p.playerName
      ? el('div', { className: 'pplayer', text: p.playerName })
      : el('span', { className: 'pplayer-ghost' }),
    el(
      'div',
      { className: 'score-wrap' },
      el('span', {
        className: `score ${scoreClass(p.score, store.config.startPoints)}`,
        id: `sc-${pi}`,
        text: fmtNum(p.score),
      }),
      el('span', { className: 'delta-flash', id: `df-${pi}` }),
    ),
    el('span', { className: 'tap-sign-minus', text: '－' }),
    el('span', { className: 'tap-sign-plus', text: '＋' }),
  );

  let holdTimer = null;
  let didHold = false;
  zone.addEventListener(
    'touchstart',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      didHold = false;
      holdTimer = setTimeout(() => {
        didHold = true;
        holdTimer = null;
        openManualEntry(pi);
      }, HOLD_DELAY);
    },
    { passive: false },
  );
  zone.addEventListener('touchend', (e) => {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    if (!didHold) {
      const t = e.changedTouches[0];
      adjust(pi, isPlusSide(card, rot, t.clientX, t.clientY) ? +1 : -1, zone);
    }
  });
  zone.addEventListener('touchcancel', () => {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
  });
  zone.addEventListener('click', (e) =>
    adjust(pi, isPlusSide(card, rot, e.clientX, e.clientY) ? +1 : -1, zone),
  );
  return zone;
}

function buildElimTag(p) {
  return el(
    'div',
    { className: 'elim-tag' },
    el('div', { className: 'elim-icon' }, icon('skull', '💀')),
    el('div', { className: 'elim-label', text: 'Éliminé' }),
    p.playerName ? el('div', { className: 'elim-name', text: p.playerName }) : null,
  );
}

function buildCard(pi, rot) {
  const p = store.game.players[pi];
  if (pi === undefined || pi === null || !p) return el('div');
  const card = el('div', {
    className: `pcard color-${(pi % 10) + 1} ${rot}${p.eliminated ? ' elim' : ''}`,
    id: `card-${pi}`,
  });
  const inner = el('div', { className: 'card-inner', id: `inner-${pi}` });
  const zone = buildTapZone(pi, p, card, rot);
  inner.appendChild(zone);
  if (p.eliminated) {
    // Masquer le score et les signes
    zone.querySelector('.score-wrap').style.display = 'none';
    zone.querySelector('.tap-sign-minus').style.display = 'none';
    zone.querySelector('.tap-sign-plus').style.display = 'none';
    inner.appendChild(buildElimTag(p));
  }
  card.appendChild(inner);
  return card;
}

/** Ajuste les tailles de texte de chaque carte à sa surface visible (mémoïsé par taille). */
function fitTexts() {
  qsa('.pcard').forEach((card) => {
    const isLat = card.classList.contains('rot-l') || card.classList.contains('rot-r');
    const inner = card.querySelector('.card-inner');
    let visH;
    let visW;
    if (isLat && inner && inner.offsetWidth > 0 && inner.offsetHeight > 0) {
      visH = inner.offsetWidth;
      visW = inner.offsetHeight;
    } else {
      visH = card.offsetHeight;
      visW = card.offsetWidth;
    }
    if (!visH || !visW || visH < 10 || visW < 10) return;
    const cacheKey = `${visH}x${visW}`;
    if (fitCache[card.id] === cacheKey) return;
    fitCache[card.id] = cacheKey;

    const pl = card.querySelector('.pplayer');
    const sc = card.querySelector('.score');
    const df = card.querySelector('.delta-flash');
    const sm = card.querySelector('.tap-sign-minus');
    const sp = card.querySelector('.tap-sign-plus');
    const ghost = card.querySelector('.pplayer-ghost');

    const fit = computeFit(visH, visW, sc ? sc.textContent || '0' : '0');
    if (sc) sc.style.fontSize = fit.scoreSz + 'px';
    if (df) df.style.fontSize = fit.deltaSz + 'px';
    if (sm) sm.style.fontSize = fit.signSz + 'px';
    if (sp) sp.style.fontSize = fit.signSz + 'px';
    if (pl) {
      pl.style.fontSize = fit.nameSz + 'px';
      pl.style.whiteSpace = 'nowrap';
      // Cartes latérales : le nom s'étend sur la grande dimension (visH)
      const w = isLat ? Math.round(visH * 0.82) + 'px' : '90%';
      pl.style.maxWidth = w;
      pl.style.width = w;
    }
    if (ghost) ghost.style.height = fit.ghostH + 'px';
  });
}

/** Donne aux cartes tournées les dimensions inversées de leur cellule. */
function fixLateral() {
  fitCache = {};
  qsa('.rot-0 .card-inner,.rot-180 .card-inner').forEach((inner) => {
    const pc = inner.parentElement;
    const w = pc.offsetWidth;
    const h = pc.offsetHeight;
    if (!w || !h) return;
    inner.style.width = w + 'px';
    inner.style.height = h + 'px';
  });
  qsa('.rot-l .card-inner,.rot-r .card-inner').forEach((inner) => {
    const pc = inner.parentElement;
    const w = pc.offsetWidth;
    const h = pc.offsetHeight;
    if (!w || !h) return;
    inner.style.width = h + 'px';
    inner.style.height = w + 'px';
  });
}

function onResize() {
  if (gameScreen().style.display === 'flex') {
    fixLateral();
    setTimeout(fitTexts, 50);
  }
}

// ── Modifications de score ──────────────────────────────────────────

function flashZone(z, cls) {
  z.classList.add(cls);
  setTimeout(() => z.classList.remove(cls), FLASH_MS);
}

function flashDelta(i, groupSum) {
  const df = byId(`df-${i}`);
  if (!df) return;
  df.textContent = (groupSum > 0 ? '+' : '') + fmtNum(groupSum);
  // Gain = vert, perte = rouge
  df.style.color = groupSum > 0 ? 'var(--green)' : 'var(--red)';
  df.style.textShadow = groupSum > 0 ? '0 0 8px var(--green)' : '0 0 8px var(--red)';
  df.classList.remove('go');
  void df.offsetWidth;
  df.classList.add('go');
}

function saveUndo() {
  pushUndo(store.undoStack, store.game);
  byId('undo-btn').disabled = false;
}

/** Met à jour l'affichage du score d'un joueur et déclenche la confirmation d'élimination si besoin. */
function updateDisplay(i) {
  const p = store.game.players[i];
  const sc = byId(`sc-${i}`);
  if (!sc) return;
  sc.textContent = fmtNum(p.score);
  sc.className = 'score ' + scoreClass(p.score, store.config.startPoints);

  // Élimination : confirmation requise à 0 (si pas de scores négatifs)
  if (needsElimination(p, store.config)) {
    vibrate(PATTERN_ELIM);
    store.elimPending = i;
    openElimModal(p.playerName || `Joueur ${i + 1}`);
  }
}

function logGrouped(pi, delta) {
  const { group, sum } = addGroupedDelta(store.game, pi, delta);
  flashDelta(pi, sum);
  if (store.groupTimers[pi]) clearTimeout(store.groupTimers[pi]);
  store.groupTimers[pi] = setTimeout(() => {
    group.open = false;
  }, GROUP_DELAY);
  saveGame();
}

/** Tap +1 / −1 sur une carte. */
function adjust(i, delta, zone) {
  const { config } = store;
  const p = store.game.players[i];
  if (p.eliminated) return;
  const { newScore, realDelta } = applyDelta(p.score, delta, config);
  // Pas de mouvement et déjà au plancher → retour tactile
  if (realDelta === 0) {
    if (isAtFloor(p.score, config)) {
      flashZone(zone, 'flash-neg');
      vibrate(PATTERN_BLOCKED);
    }
    return;
  }
  saveUndo();
  p.score = newScore;
  updateDisplay(i);
  flashZone(zone, realDelta > 0 ? 'flash-pos' : 'flash-neg');
  logGrouped(i, realDelta);
}

/** Appui long : ferme le groupe ouvert du joueur et ouvre le pavé numérique. */
function openManualEntry(pi) {
  if (closeOpenGroup(store.game.history, pi) && store.groupTimers[pi]) {
    clearTimeout(store.groupTimers[pi]);
    delete store.groupTimers[pi];
  }
  openScoreModal(pi, store.game.players[pi]);
}

/** Applique un delta saisi au pavé (action distincte, non groupée). */
export function applyManualDelta(pi, delta) {
  saveUndo();
  const p = store.game.players[pi];
  const { newScore, realDelta } = applyDelta(p.score, delta, store.config);
  p.score = newScore;
  if (realDelta === 0) return;
  updateDisplay(pi);
  flashDelta(pi, realDelta);
  addManualDelta(store.game, pi, realDelta);
  saveGame();
}

// ── Élimination ────────────────────────────────────────────────────

export function confirmElimination() {
  closeModal('elim-modal');
  if (store.elimPending < 0) return;
  const i = store.elimPending;
  store.elimPending = -1;
  store.game.players[i].eliminated = true;
  setTimeout(() => {
    renderGame();
    saveGame();
    const w = findWinner(store.game.players);
    if (w) {
      openWinnerModal(
        w.playerName || 'Dernier survivant',
        'Dernier survivant · Score : ' + fmtNum(w.score),
      );
      remove(KEYS.save);
    }
  }, ELIM_RENDER_DELAY);
}

export function cancelElimination() {
  closeModal('elim-modal');
  if (store.elimPending < 0) return;
  // Revenir au score précédent (annulation)
  undoLast();
  store.elimPending = -1;
}

// ── Annulation et rotation ─────────────────────────────────────────

export function undoLast() {
  if (!store.undoStack.length) return;
  // Fermer les modales vainqueur / élimination si ouvertes
  closeModal('winner-modal');
  closeModal('elim-modal');
  store.elimPending = -1;
  store.game = popUndo(store.undoStack);
  byId('undo-btn').disabled = store.undoStack.length === 0;
  fitCache = {};
  renderGame();
  saveGame();
}

export function rotatePlayers() {
  if (store.game.players.length < 2) return;
  saveUndo();
  rotateSeats(store.game.seatOrder);
  renderGame();
}

function initUndoButton() {
  const btn = byId('undo-btn');
  let iv = null;
  let to = null;
  const start = (e) => {
    e.preventDefault();
    undoLast();
    to = setTimeout(() => {
      iv = setInterval(undoLast, UNDO_REPEAT_INTERVAL);
    }, UNDO_REPEAT_DELAY);
  };
  const stop = () => {
    clearTimeout(to);
    clearInterval(iv);
    to = null;
    iv = null;
  };
  btn.addEventListener('touchstart', start, { passive: false });
  btn.addEventListener('touchend', stop);
  btn.addEventListener('touchcancel', stop);
  btn.addEventListener('mousedown', start);
  btn.addEventListener('mouseup', stop);
  btn.addEventListener('mouseleave', stop);
}

/** Câble le bouton Annuler (appui maintenu = répétition) et le redimensionnement. */
export function initGame() {
  initUndoButton();
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 200));
}
