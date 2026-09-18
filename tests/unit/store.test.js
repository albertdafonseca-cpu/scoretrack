import { describe, expect, it } from 'vitest';
import { canUndo, createLog, groups, recordScore, undo } from '../../js/core/history.js';
import { DEFAULT_SETTINGS } from '../../js/core/save-schema.js';
import { emptyGame, setGame, store } from '../../js/store.js';

describe('store', () => {
  it('expose une seule représentation de la partie : players, seatOrder et journal', () => {
    expect(store.config).toEqual({
      numPlayers: 0,
      startPoints: 0,
      maxPoints: Infinity,
      allowNeg: false,
    });
    expect(store.settings).toEqual({ ...DEFAULT_SETTINGS });
    expect(emptyGame()).toEqual({ players: [], seatOrder: [], log: createLog() });
    expect(Object.keys(store.game).sort()).toEqual(['log', 'players', 'seatOrder']);
    expect(store.groupTimers).toEqual({});
    expect(store.elimPending).toBe(-1);
    // Plus aucune structure v1 en parallèle du journal
    expect(store.undoStack).toBeUndefined();
    expect(store.redoStack).toBeUndefined();
    expect(store.game.history).toBeUndefined();
    expect(store.game.actionCounter).toBeUndefined();
  });

  it('emptyGame renvoie un journal neuf à chaque appel', () => {
    expect(emptyGame().log).not.toBe(emptyGame().log);
  });

  it('setGame remplace la partie, purge les minuteries et la confirmation en attente', () => {
    store.elimPending = 2;
    let fired = false;
    store.groupTimers[0] = setTimeout(() => {
      fired = true;
    }, 0);
    setGame({ players: [{ playerName: 'A', score: 1, eliminated: false }], seatOrder: [0] });
    expect(store.game.log).toEqual(createLog());
    expect(store.game.players).toHaveLength(1);
    expect(store.groupTimers).toEqual({});
    expect(store.elimPending).toBe(-1);
    return new Promise((resolve) =>
      setTimeout(() => {
        expect(fired).toBe(false);
        resolve();
      }, 5),
    );
  });

  it('setGame conserve un journal valide tel quel', () => {
    const log = createLog();
    recordScore(log, 0, 0, 1);
    setGame({ players: [], seatOrder: [], log });
    expect(store.game.log).toBe(log);
    expect(canUndo(store.game.log)).toBe(true);
  });

  it('setGame remplace un journal absent ou mal formé plutôt que de le propager', () => {
    for (const bad of [
      undefined,
      null,
      'x',
      {},
      { entries: 'x', cursor: 0 },
      { entries: [], cursor: 3 },
    ]) {
      setGame({
        players: [{ playerName: 'A', score: 5, eliminated: false }],
        seatOrder: [0],
        log: bad,
      });
      expect(store.game.log).toEqual(createLog());
      expect(() => groups(store.game.log)).not.toThrow();
      expect(undo(store.game.log)).toBeNull();
    }
  });
});
