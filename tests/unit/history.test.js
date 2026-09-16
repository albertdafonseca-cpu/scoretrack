import { describe, expect, it } from 'vitest';
import {
  GROUP_DELAY,
  UNDO_LIMIT,
  addGroupedDelta,
  addManualDelta,
  closeAllGroups,
  closeOpenGroup,
  findOpenGroup,
  groupSum,
  playerRecap,
  popUndo,
  pushUndo,
} from '../../js/core/history.js';

const newGame = () => ({
  players: [
    { playerName: 'Alice', score: 40, eliminated: false },
    { playerName: 'Bob', score: 40, eliminated: false },
  ],
  seatOrder: [0, 1],
  history: [],
  actionCounter: 0,
});

describe('constantes', () => {
  it('conserve les délais historiques', () => {
    expect(GROUP_DELAY).toBe(1500);
    expect(UNDO_LIMIT).toBe(40);
  });
});

describe('groupement des taps', () => {
  it("regroupe les taps successifs d'un même joueur dans une seule action", () => {
    const g = newGame();
    const a = addGroupedDelta(g, 0, +1);
    const b = addGroupedDelta(g, 0, +1);
    const c = addGroupedDelta(g, 0, -1);
    expect(a.group).toBe(b.group);
    expect(c.sum).toBe(1);
    expect(g.history).toHaveLength(1);
    expect(g.actionCounter).toBe(1);
    expect(g.history[0]).toMatchObject({ playerIdx: 0, who: 'Alice', open: true, rank: 1 });
    expect(g.history[0].entries).toEqual([{ delta: 1 }, { delta: 1 }, { delta: -1 }]);
  });

  it('ouvre un groupe distinct par joueur, le plus récent en tête', () => {
    const g = newGame();
    addGroupedDelta(g, 0, +1);
    addGroupedDelta(g, 1, -2);
    expect(g.history.map((h) => h.playerIdx)).toEqual([1, 0]);
    expect(g.history.map((h) => h.rank)).toEqual([2, 1]);
  });

  it('ferme un groupe et en ouvre un nouveau ensuite', () => {
    const g = newGame();
    addGroupedDelta(g, 0, +1);
    expect(closeOpenGroup(g.history, 0)).toBe(true);
    expect(closeOpenGroup(g.history, 0)).toBe(false);
    expect(findOpenGroup(g.history, 0)).toBeUndefined();
    addGroupedDelta(g, 0, +1);
    expect(g.history).toHaveLength(2);
    expect(g.history[0].rank).toBe(2);
  });

  it('la saisie manuelle crée un groupe fermé et séparé', () => {
    const g = newGame();
    addGroupedDelta(g, 0, +1);
    const manual = addManualDelta(g, 0, -15);
    expect(manual).toMatchObject({ playerIdx: 0, open: false, rank: 2, entries: [{ delta: -15 }] });
    expect(g.history[0]).toBe(manual);
    expect(groupSum(manual)).toBe(-15);
  });

  it('closeAllGroups ferme tout', () => {
    const g = newGame();
    addGroupedDelta(g, 0, +1);
    addGroupedDelta(g, 1, +1);
    closeAllGroups(g.history);
    expect(g.history.every((h) => !h.open)).toBe(true);
  });

  it('playerRecap trie par rang et totalise', () => {
    const g = newGame();
    addGroupedDelta(g, 0, +3);
    closeOpenGroup(g.history, 0);
    addManualDelta(g, 1, +10);
    addManualDelta(g, 0, -5);
    const r = playerRecap(g.history, 0);
    expect(r.groups.map((x) => x.rank)).toEqual([1, 3]);
    expect(r.total).toBe(-2);
    expect(playerRecap(g.history, 1).total).toBe(10);
  });
});

describe("pile d'annulation", () => {
  it('empile un instantané indépendant et le restitue', () => {
    const g = newGame();
    const stack = [];
    pushUndo(stack, g);
    g.players[0].score = 41;
    addGroupedDelta(g, 0, +1);
    const prev = popUndo(stack);
    expect(prev.players[0].score).toBe(40);
    expect(prev.history).toEqual([]);
    expect(prev.actionCounter).toBe(0);
    expect(prev.seatOrder).toEqual([0, 1]);
    expect(popUndo(stack)).toBeNull();
  });

  it('est bornée à 40 niveaux (les plus anciens sortent)', () => {
    const g = newGame();
    const stack = [];
    for (let i = 0; i < 45; i++) {
      g.players[0].score = i;
      pushUndo(stack, g);
    }
    expect(stack).toHaveLength(UNDO_LIMIT);
    expect(popUndo(stack).players[0].score).toBe(44);
    let last;
    while (stack.length) last = popUndo(stack);
    expect(last.players[0].score).toBe(5);
  });
});
