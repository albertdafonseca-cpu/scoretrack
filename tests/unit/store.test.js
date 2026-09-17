import { describe, expect, it } from 'vitest';
import { createLog, recordScore } from '../../js/core/history.js';
import { DEFAULT_SETTINGS } from '../../js/core/save-schema.js';
import { emptyGame, setGame, store } from '../../js/store.js';

describe('store', () => {
  it('expose les champs historiques plus le journal v2 et la pile de rétablissement', () => {
    expect(store.config).toEqual({
      numPlayers: 0,
      startPoints: 0,
      maxPoints: Infinity,
      allowNeg: false,
    });
    expect(store.settings).toEqual({ ...DEFAULT_SETTINGS });
    expect(store.game).toEqual(emptyGame());
    expect(store.game.log).toEqual(createLog());
    expect(store.undoStack).toEqual([]);
    expect(store.redoStack).toEqual([]);
    expect(store.groupTimers).toEqual({});
    expect(store.elimPending).toBe(-1);
  });

  it('setGame remplace la partie, garantit log/history/actionCounter et purge piles et minuteries', () => {
    store.undoStack.push('x');
    store.redoStack.push('y');
    store.elimPending = 2;
    let fired = false;
    store.groupTimers[0] = setTimeout(() => {
      fired = true;
    }, 0);
    setGame({ players: [{ playerName: 'A', score: 1, eliminated: false }], seatOrder: [0] });
    expect(store.game.log).toEqual(createLog());
    expect(store.game.history).toEqual([]);
    expect(store.game.actionCounter).toBe(0);
    expect(store.undoStack).toEqual([]);
    expect(store.redoStack).toEqual([]);
    expect(store.groupTimers).toEqual({});
    expect(store.elimPending).toBe(-1);
    return new Promise((resolve) =>
      setTimeout(() => {
        expect(fired).toBe(false);
        resolve();
      }, 5),
    );
  });

  it('setGame conserve un journal fourni', () => {
    const log = createLog();
    recordScore(log, 0, 0, 1);
    setGame({ players: [], seatOrder: [], log, history: [{}], actionCounter: 3 });
    expect(store.game.log).toBe(log);
    expect(store.game.history).toEqual([{}]);
    expect(store.game.actionCounter).toBe(3);
  });
});
