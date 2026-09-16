// Récapitulatif plein écran : actions par joueur et bilan.
import { COLORS } from '../core/constants.js';
import { fmtNum } from '../core/format.js';
import { closeAllGroups, groupSum, playerRecap } from '../core/history.js';
import { store } from '../store.js';
import { byId, el, show, hide } from './dom.js';

function entryRow(g) {
  const sum = groupSum(g);
  const cls = sum > 0 ? 'pos' : 'neg';
  const sign = sum > 0 ? '+' : '';
  const detail = sum > 0 ? `Gain de ${fmtNum(sum)} pts` : `Perte de ${fmtNum(Math.abs(sum))} pts`;
  return el(
    'div',
    { className: 'recap-entry' },
    el(
      'div',
      {},
      el('div', { className: 'recap-entry-rank', text: `Action n°${g.rank}` }),
      el('div', { className: 'recap-entry-detail', text: detail }),
    ),
    el('div', { className: `recap-delta ${cls}`, text: `${sign}${fmtNum(sum)}` }),
  );
}

function playerBlock(p, pi, groups, total) {
  const color = COLORS[pi % 12];
  const scoreSign = total > 0 ? '+' : '';
  return el(
    'div',
    { className: 'recap-player' },
    el(
      'div',
      { className: 'recap-player-header' },
      el('div', {
        className: 'recap-player-dot',
        style: `background:${color};box-shadow:0 0 6px ${color}`,
      }),
      el('div', { className: 'recap-player-name', text: p.playerName || 'Joueur ' + (pi + 1) }),
    ),
    ...groups.map(entryRow),
    el(
      'div',
      { className: 'recap-total' },
      el('div', { className: 'recap-total-label', text: 'Bilan · Score final' }),
      el('div', {
        className: 'recap-total-val',
        text: `${scoreSign}${fmtNum(total)} · ${fmtNum(p.score)}`,
      }),
    ),
  );
}

/** Ferme les groupes ouverts, construit et affiche le récapitulatif. */
export function showRecap() {
  const { game } = store;
  closeAllGroups(game.history);
  Object.values(store.groupTimers).forEach(clearTimeout);
  store.groupTimers = {};
  const blocks = [];
  game.players.forEach((p, pi) => {
    const { groups, total } = playerRecap(game.history, pi);
    if (!groups.length) return;
    blocks.push(playerBlock(p, pi, groups, total));
  });
  if (!blocks.length) {
    blocks.push(
      el('div', {
        style:
          'color:var(--muted2);text-align:center;margin-top:48px;font-family:Share Tech Mono,monospace;font-size:14px;',
        text: 'Aucune action enregistrée.',
      }),
    );
  }
  byId('recap-body').replaceChildren(...blocks);
  show(byId('recap'));
}

export function hideRecap() {
  hide(byId('recap'));
}
