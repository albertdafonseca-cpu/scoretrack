// Récapitulatif plein écran : classement, mini-courbes, journal chronologique, retour à un point
// de l'historique et copie du résultat.
//
// Tout est dérivé du journal v2 (js/core/history.js) et du classement (js/core/rules.js) : aucun
// état propre au récap, donc aucune divergence possible avec la partie en cours. Tous les joueurs
// figurent au classement, y compris ceux qui n'ont encore fait aucune action.
import { COLORS } from '../core/constants.js';
import { fmtNum } from '../core/format.js';
import { groups, playerRecap, timeline } from '../core/history.js';
import { ranking } from '../core/rules.js';
import { store } from '../store.js';
import { byId, el, hide, icon, show } from './dom.js';
import { trapFocus } from './a11y.js';
import { showToast } from './toast.js';
import { closeAllOpenGroups, jumpToEntry } from './game.js';

/** Libellé du moyen d'action affiché dans le journal. */
const VIA_LABEL = {
  tap: 'Taps',
  keypad: 'Pavé',
  rotate: 'Rotation',
  elim: 'Élimination',
  unelim: 'Réintégration',
  rename: 'Renommage',
};

/** Dimensions du tracé des mini-courbes (repère SVG). */
const SPARK_W = 120;
const SPARK_H = 32;

let releaseFocus = null;
let pendingJump = null;

const nameOf = (pi) => store.game.players[pi]?.playerName || `Joueur ${pi + 1}`;

const timeOf = (t) =>
  t > 0 ? new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '--:--';

// ── Mini-courbe ─────────────────────────────────────────────────────

/** Courbe d'évolution d'un joueur, à l'ÉCHELLE COMMUNE `scale` (sinon +25 et −5 auraient la même
 * pente, ce qui est trompeur) ; un trait plat si le joueur n'a encore rien marqué. */
function sparkline(points, color, scale) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'recap-spark');
  svg.setAttribute('viewBox', `0 0 ${SPARK_W} ${SPARK_H}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const make = (tag, attrs) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  };
  if (points.length < 2) {
    svg.append(
      make('line', {
        x1: 1,
        y1: SPARK_H / 2,
        x2: SPARK_W - 1,
        y2: SPARK_H / 2,
        class: 'recap-spark-flat',
      }),
    );
    return svg;
  }
  const lo = scale.lo;
  const span = scale.hi - scale.lo || 1;
  const coords = points.map((p, i) => {
    const x = 1 + (i / (points.length - 1)) * (SPARK_W - 2);
    const y = SPARK_H - 3 - ((p.score - lo) / span) * (SPARK_H - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  svg.append(
    make('polyline', { points: coords.join(' '), class: 'recap-spark-line', stroke: color }),
  );
  const last = coords[coords.length - 1].split(',');
  svg.append(
    make('circle', { cx: last[0], cy: last[1], r: 2.4, fill: color, class: 'recap-spark-dot' }),
  );
  return svg;
}

// ── Classement ──────────────────────────────────────────────────────

function rankRow(row, isWinner, scale) {
  const color = COLORS[row.index % COLORS.length];
  const { points, total } = playerRecap(store.game.log, row.index);
  const gapText = row.gap === 0 ? 'en tête' : `−${fmtNum(row.gap)}`;
  return el(
    'div',
    { className: `recap-rank-row${isWinner ? ' winner' : ''}${row.eliminated ? ' out' : ''}` },
    el(
      'div',
      { className: 'recap-rank-pos' },
      isWinner ? icon('trophy') : null,
      el('span', { className: 'recap-rank-n', text: `${row.rank}` }),
    ),
    el('span', { className: 'recap-rank-dot', style: `background:${color}` }),
    el(
      'div',
      { className: 'recap-rank-main' },
      el(
        'div',
        { className: 'recap-rank-name' },
        el('span', { text: nameOf(row.index) }),
        row.eliminated ? el('span', { className: 'recap-tag', text: 'éliminé' }) : null,
      ),
      el('div', {
        className: 'recap-rank-meta',
        text: `${gapText} · ${total > 0 ? '+' : ''}${fmtNum(total)}`,
      }),
    ),
    sparkline(points, color, scale),
    el('div', { className: 'recap-rank-score', text: fmtNum(row.score) }),
  );
}

/** Bornes communes à toutes les mini-courbes (tous les joueurs, tous les points). */
function commonScale() {
  let lo = Infinity;
  let hi = -Infinity;
  store.game.players.forEach((_, i) => {
    playerRecap(store.game.log, i).points.forEach((pt) => {
      if (pt.score < lo) lo = pt.score;
      if (pt.score > hi) hi = pt.score;
    });
  });
  return Number.isFinite(lo) ? { lo, hi } : { lo: 0, hi: 1 };
}

function rankingBlock() {
  const rows = ranking(store.game.players);
  const scale = commonScale();
  const winner = rows.find((r) => !r.eliminated);
  const alive = rows.filter((r) => !r.eliminated).length;
  const decided = alive === 1 || rows.length === 1;
  return el(
    'section',
    { className: 'recap-block' },
    el('h2', { className: 'recap-block-title', text: 'Classement' }),
    // Une grille partagée par toutes les lignes (sous-grille) : rang, pastille, mini-courbe et
    // score s'alignent en colonnes SANS largeur minimale réservée, et toute la place restante va
    // au prénom (voir css/modals.css, `.recap-rank-list`).
    el(
      'div',
      { className: 'recap-rank-list' },
      ...rows.map((r) => rankRow(r, decided && winner === r && rows.length > 1, scale)),
    ),
  );
}

// ── Journal chronologique ───────────────────────────────────────────

/** Texte de l'effet d'une action (delta et score résultant, ou état). */
function actionEffect(a) {
  if (a.via === 'rotate') return { detail: 'Les sièges avancent d’un cran', delta: '', cls: '' };
  if (a.via === 'elim') return { detail: `${nameOf(a.playerIdx)} est éliminé`, delta: '', cls: '' };
  if (a.via === 'unelim')
    return { detail: `${nameOf(a.playerIdx)} est réintégré`, delta: '', cls: '' };
  if (a.via === 'rename')
    return {
      detail: `« ${a.from || '—'} » devient « ${a.to || '—'} »`,
      delta: '',
      cls: '',
    };
  const sign = a.delta > 0 ? '+' : '';
  return {
    detail: `de ${fmtNum(a.from)} à ${fmtNum(a.to)}`,
    delta: `${sign}${fmtNum(a.delta)}`,
    cls: a.delta > 0 ? 'gain' : 'loss',
  };
}

/** Détail des taps d'une action groupée : « 3 taps : +1 +1 +1 » (issu de `timeline`). */
function groupBreakdown(entries) {
  if (entries.length < 2) return null;
  const list = entries.map((e) => (e.delta > 0 ? `+${e.delta}` : String(e.delta))).join(' ');
  return `${entries.length} taps : ${list}`;
}

function actionRow(a, entriesByAction) {
  const { detail, delta, cls } = actionEffect(a);
  const who = a.via === 'rotate' ? 'Tous les joueurs' : nameOf(a.playerIdx);
  const breakdown = groupBreakdown(entriesByAction.get(a.n) || []);
  // `locked` : action sous le plancher d'annulation du journal (historique en lecture seule).
  const jump = el(
    'button',
    {
      type: 'button',
      className: 'recap-jump-btn',
      disabled: a.locked === true,
      'aria-label': a.locked
        ? `Action n°${a.n} : retour indisponible`
        : `Revenir à l’action n°${a.n}`,
    },
    icon('undo'),
    el('span', { className: 'btn-text', text: a.locked ? 'Verrouillée' : 'Revenir ici' }),
  );
  if (!a.locked) jump.addEventListener('click', () => askJump(a));
  return el(
    'div',
    { className: `recap-action${a.undone ? ' undone' : ''}` },
    el(
      'div',
      { className: 'recap-action-head' },
      el('span', { className: 'recap-action-n', text: `n°${a.n}` }),
      el('span', { className: 'recap-action-who', text: who }),
      el('span', { className: 'recap-action-via', text: VIA_LABEL[a.via] || a.via }),
      el('time', { className: 'recap-action-time', text: timeOf(a.t) }),
    ),
    el(
      'div',
      { className: 'recap-action-body' },
      el('span', { className: 'recap-action-detail', text: detail }),
      delta ? el('span', { className: `recap-action-delta ${cls}`, text: delta }) : null,
      breakdown ? el('span', { className: 'recap-tag', text: breakdown }) : null,
      a.undone ? el('span', { className: 'recap-tag', text: 'annulée' }) : null,
    ),
    jump,
  );
}

function journalBlock(list, entriesByAction) {
  if (!list.length) {
    return el(
      'section',
      { className: 'recap-block' },
      el('h2', { className: 'recap-block-title', text: 'Journal' }),
      el('p', { className: 'recap-empty', text: 'Aucune action enregistrée pour le moment.' }),
    );
  }
  const start = el(
    'button',
    { type: 'button', className: 'recap-jump-btn wide' },
    icon('undo'),
    el('span', { className: 'btn-text', text: 'Revenir au début de la partie' }),
  );
  start.addEventListener('click', () => askJump(null));
  return el(
    'section',
    { className: 'recap-block' },
    el('h2', { className: 'recap-block-title', text: 'Journal' }),
    ...list.map((a) => actionRow(a, entriesByAction)),
    start,
  );
}

// ── Retour à un point ───────────────────────────────────────────────

function askJump(action) {
  pendingJump = action;
  byId('jump-modal-sub').textContent = action
    ? `Les actions postérieures à l’action n°${action.n} seront annulées. Elles restent rétablissables.`
    : 'Toutes les actions seront annulées. Elles restent rétablissables.';
  show(byId('jump-modal'));
}

export function cancelJump() {
  pendingJump = null;
  hide(byId('jump-modal'));
}

export function confirmJump() {
  const target = pendingJump;
  pendingJump = null;
  hide(byId('jump-modal'));
  const ok = jumpToEntry(target ? target.id : 0);
  showToast(ok ? 'Retour effectué — « Rétablir » reste disponible.' : 'Action introuvable.');
  if (ok) renderRecap();
}

// ── Copie du résultat ───────────────────────────────────────────────

/** Texte lisible du résultat, prêt à coller dans une conversation. */
export function resultText() {
  const rows = ranking(store.game.players);
  const date = new Date().toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const lines = [`ScoreTrack — ${date}`];
  rows.forEach((r) => {
    const gap = r.gap === 0 ? '' : ` (−${fmtNum(r.gap)})`;
    const out = r.eliminated ? ' — éliminé' : '';
    lines.push(`${r.rank}. ${nameOf(r.index)} : ${fmtNum(r.score)}${gap}${out}`);
  });
  const played = groups(store.game.log).filter((a) => !a.undone).length;
  lines.push(`${played} action${played > 1 ? 's' : ''} jouée${played > 1 ? 's' : ''}`);
  return lines.join('\n');
}

/** Copie le résultat dans le presse-papiers et le confirme par un toast. */
export async function copyResult() {
  const text = resultText();
  try {
    await navigator.clipboard.writeText(text);
    showToast('Résultat copié dans le presse-papiers.');
  } catch {
    showToast('Copie impossible : le presse-papiers est refusé par le navigateur.');
  }
}

// ── Rendu ───────────────────────────────────────────────────────────

function renderRecap() {
  const list = groups(store.game.log);
  // `timeline` donne la chronologie ENTRÉE PAR ENTRÉE, chacune rattachée à son numéro d'action :
  // elle sert ici à détailler les actions groupées (plusieurs taps rapprochés).
  const entriesByAction = new Map();
  timeline(store.game.log).forEach((entry) => {
    if (!entriesByAction.has(entry.n)) entriesByAction.set(entry.n, []);
    entriesByAction.get(entry.n).push(entry);
  });
  const copy = el(
    'button',
    { type: 'button', className: 'recap-copy-btn', 'data-action': 'copy-result' },
    icon('copy'),
    el('span', { className: 'btn-text', text: 'Copier le résultat' }),
  );
  byId('recap-body').replaceChildren(rankingBlock(), copy, journalBlock(list, entriesByAction));
}

/** Ferme les groupes ouverts, construit et affiche le récapitulatif. */
export function showRecap() {
  closeAllOpenGroups();
  renderRecap();
  const node = byId('recap');
  show(node);
  releaseFocus = trapFocus(node, { onEscape: hideRecap, initialFocus: byId('recap-close-btn') });
}

export function hideRecap() {
  hide(byId('jump-modal'));
  hide(byId('recap'));
  if (releaseFocus) releaseFocus();
  releaseFocus = null;
}
