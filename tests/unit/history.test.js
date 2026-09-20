import { describe, expect, it } from 'vitest';
import {
  GROUP_DELAY,
  MAX_GROUP_TAPS,
  MAX_LOG_ENTRIES,
  SCORE_VIAS,
  VIAS,
  appliedState,
  applyEntry,
  canRedo,
  canUndo,
  closeGroup,
  createLog,
  groups,
  invert,
  isLog,
  jumpTo,
  logFromGroups,
  playerRecap,
  record,
  recordElim,
  recordRename,
  recordRotate,
  recordScore,
  redo,
  timeline,
  undo,
} from '../../js/core/history.js';
import { identity, makePlayers, randInt, rng } from './helpers.js';

const T0 = 1_700_000_000_000;

/** Journal avec trois taps rapprochés du joueur 0 (une action), puis un pavé du joueur 1. */
function sample() {
  const log = createLog();
  recordScore(log, 0, 40, 41, 'tap', T0);
  recordScore(log, 0, 41, 42, 'tap', T0 + 300);
  recordScore(log, 0, 42, 43, 'tap', T0 + 600);
  recordScore(log, 1, 40, 25, 'keypad', T0 + 5000);
  return log;
}

/** Rejoue toutes les entrées appliquées d'un journal sur un état. */
function replay(log, game) {
  log.entries.slice(0, log.cursor).forEach((e) => applyEntry(game, e));
  return game;
}

describe('constantes', () => {
  it('conserve les délais historiques et expose les moyens reconnus', () => {
    expect(GROUP_DELAY).toBe(1500);
    expect(MAX_LOG_ENTRIES).toBe(2000);
    expect(MAX_GROUP_TAPS).toBe(500);
    expect(VIAS).toEqual(['tap', 'keypad', 'rotate', 'elim', 'unelim', 'rename']);
    expect(SCORE_VIAS).toEqual(['tap', 'keypad']);
    expect(Object.isFrozen(VIAS)).toBe(true);
  });
});

describe('createLog / isLog', () => {
  it('crée un journal vide avec curseur et plancher', () => {
    expect(createLog()).toEqual({ entries: [], cursor: 0, floor: 0 });
  });
  it('reconnaît un journal valide et rejette les formes fausses', () => {
    expect(isLog(createLog())).toBe(true);
    expect(isLog(sample())).toBe(true);
    expect(isLog({ entries: [], cursor: 0 })).toBe(true);
    expect(isLog(null)).toBe(false);
    expect(isLog({ entries: [] })).toBe(false);
    expect(isLog({ entries: [], cursor: 1 })).toBe(false);
    expect(isLog({ entries: [], cursor: -1 })).toBe(false);
    expect(isLog({ entries: {}, cursor: 0 })).toBe(false);
    expect(isLog({ entries: [], cursor: 0, floor: 1 })).toBe(false);
    expect(isLog({ entries: [], cursor: 0, floor: -1 })).toBe(false);
    expect(isLog([])).toBe(false);
  });
});

describe('journal mal formé : assainissement plutôt que tableau creux', () => {
  it('record sur un curseur hors bornes ne crée aucun trou', () => {
    const log = { entries: [], cursor: 3 };
    record(log, { playerIdx: 0, from: 0, to: 1, via: 'tap', t: T0 });
    expect(log.entries).toHaveLength(1);
    expect(log.entries.every((e) => e !== undefined)).toBe(true);
    expect(log.cursor).toBe(1);
    expect(() => groups(log)).not.toThrow();
    expect(groups(log)).toHaveLength(1);
  });

  it('undo, redo, groups et timeline tolèrent un curseur absent ou aberrant', () => {
    const base = sample();
    const cases = [undefined, -5, 99, 1.5, 'x', null];
    for (const cursor of cases) {
      const log = { entries: base.entries.map((e) => ({ ...e })), cursor };
      expect(() => groups(log)).not.toThrow();
      expect(log.cursor).toBeGreaterThanOrEqual(0);
      expect(log.cursor).toBeLessThanOrEqual(log.entries.length);
      expect(() => timeline(log)).not.toThrow();
      expect(() => undo(log)).not.toThrow();
      expect(() => redo(log)).not.toThrow();
      expect(() => jumpTo(log, 1)).not.toThrow();
    }
  });

  it('un plancher aberrant est ramené entre 0 et le curseur', () => {
    const log = sample();
    log.floor = 99;
    expect(canUndo(log)).toBe(false);
    expect(log.floor).toBe(log.cursor);
    log.floor = -3;
    expect(canUndo(log)).toBe(true);
    expect(log.floor).toBe(0);
  });

  it('lève si entries n’est pas un tableau', () => {
    expect(() => groups({ entries: 'x', cursor: 0 })).toThrow(TypeError);
    expect(() => record(null, { playerIdx: 0, from: 0, to: 1, via: 'tap' })).toThrow(TypeError);
  });
});

describe('record', () => {
  it('complète id, t, delta et groupId', () => {
    const log = createLog();
    const before = Date.now();
    const e = record(log, { playerIdx: 2, from: 10, to: 12, via: 'keypad' });
    expect(e.id).toBe(1);
    expect(e.groupId).toBe(1);
    expect(e.delta).toBe(2);
    expect(e.t).toBeGreaterThanOrEqual(before);
    expect(e.t).toBeLessThanOrEqual(Date.now());
    expect(log.entries).toEqual([e]);
    expect(log.cursor).toBe(1);
  });

  it('recalcule toujours delta, même si un delta faux est fourni', () => {
    const log = createLog();
    const e = record(log, { playerIdx: 0, from: 10, to: 12, via: 'keypad', delta: 999 });
    expect(e.delta).toBe(2);
  });

  it('regroupe les taps rapprochés du même joueur en une action', () => {
    const log = sample();
    expect(log.entries.map((e) => e.groupId)).toEqual([1, 1, 1, 4]);
    expect(log.entries.map((e) => e.id)).toEqual([1, 2, 3, 4]);
  });

  it('ne regroupe pas au-delà de GROUP_DELAY (limite incluse)', () => {
    const log = createLog();
    recordScore(log, 0, 0, 1, 'tap', T0);
    recordScore(log, 0, 1, 2, 'tap', T0 + GROUP_DELAY);
    recordScore(log, 0, 2, 3, 'tap', T0 + GROUP_DELAY + GROUP_DELAY + 1);
    expect(log.entries.map((e) => e.groupId)).toEqual([1, 1, 3]);
  });

  it("ne regroupe pas deux joueurs différents ni un tap intercalé d'un autre joueur", () => {
    const log = createLog();
    recordScore(log, 0, 0, 1, 'tap', T0);
    recordScore(log, 1, 0, 1, 'tap', T0 + 10);
    recordScore(log, 0, 1, 2, 'tap', T0 + 20);
    expect(log.entries.map((e) => e.groupId)).toEqual([1, 2, 3]);
  });

  it('ne regroupe jamais une saisie au pavé', () => {
    const log = createLog();
    recordScore(log, 0, 0, 1, 'tap', T0);
    recordScore(log, 0, 1, 6, 'keypad', T0 + 10);
    recordScore(log, 0, 6, 7, 'tap', T0 + 20);
    expect(log.entries.map((e) => e.groupId)).toEqual([1, 2, 3]);
  });

  it("ne regroupe pas si l'horloge recule", () => {
    const log = createLog();
    recordScore(log, 0, 0, 1, 'tap', T0);
    recordScore(log, 0, 1, 2, 'tap', T0 - 1);
    expect(log.entries[1].groupId).toBe(2);
  });

  it('respecte un groupId explicite', () => {
    const log = createLog();
    record(log, { playerIdx: 0, from: 0, to: 5, via: 'keypad', groupId: 77, t: T0 });
    expect(log.entries[0].groupId).toBe(77);
  });

  it('tronque les entrées rétablissables', () => {
    const log = sample();
    undo(log);
    expect(canRedo(log)).toBe(true);
    recordScore(log, 2, 40, 39, 'tap', T0 + 9000);
    expect(canRedo(log)).toBe(false);
    expect(log.entries.map((e) => e.id)).toEqual([1, 2, 3, 4]);
    expect(log.entries[3]).toMatchObject({ playerIdx: 2, delta: -1, via: 'tap' });
  });

  it("copie les ordres de sièges d'une rotation et force playerIdx = -1", () => {
    const log = createLog();
    const before = [0, 1, 2];
    const after = [2, 0, 1];
    const e = record(log, { via: 'rotate', from: before, to: after, playerIdx: 5, t: T0 });
    before.push(9);
    expect(e).toMatchObject({ playerIdx: -1, delta: 0, from: [0, 1, 2], to: [2, 0, 1] });
  });

  it('normalise from/to des éliminations en booléens', () => {
    const log = createLog();
    expect(record(log, { via: 'elim', playerIdx: 1, t: T0 })).toMatchObject({
      from: false,
      to: true,
      delta: 0,
    });
    expect(record(log, { via: 'unelim', playerIdx: 1, t: T0 })).toMatchObject({
      from: true,
      to: false,
    });
  });

  it('accepte un renommage', () => {
    const log = createLog();
    expect(recordRename(log, 0, 'Al', 'Alice', T0)).toMatchObject({
      via: 'rename',
      from: 'Al',
      to: 'Alice',
      delta: 0,
    });
  });

  it('refuse les entrées invalides sans modifier le journal', () => {
    const log = createLog();
    expect(() => record(log, null)).toThrow(TypeError);
    expect(() => record(log, { via: 'magic', playerIdx: 0, from: 0, to: 1 })).toThrow(TypeError);
    expect(() => record(log, { via: 'tap', playerIdx: -1, from: 0, to: 1 })).toThrow(RangeError);
    expect(() => record(log, { via: 'tap', playerIdx: 1.5, from: 0, to: 1 })).toThrow(RangeError);
    expect(() => record(log, { via: 'tap', playerIdx: 0, from: 3, to: 3 })).toThrow(RangeError);
    expect(() => record(log, { via: 'tap', playerIdx: 0, from: '3', to: 4 })).toThrow(TypeError);
    expect(() => record(log, { via: 'keypad', playerIdx: 0, from: 0, to: NaN })).toThrow(TypeError);
    expect(() => record(log, { via: 'rotate', from: [0], to: [0, 1] })).toThrow(TypeError);
    expect(() => record(log, { via: 'rotate', from: null, to: [0] })).toThrow(TypeError);
    expect(() => record(log, { via: 'rename', playerIdx: 0, from: 1, to: 'x' })).toThrow(TypeError);
    expect(log).toEqual(createLog());
  });

  it('accepte des scores à 7 chiffres et négatifs', () => {
    const log = createLog();
    const e = recordScore(log, 11, -1234567, 9999999, 'keypad', T0);
    expect(e.delta).toBe(11234566);
  });

  it('oublie les plus vieux groupes au-delà de MAX_LOG_ENTRIES sans couper une action (tailles 3, 5, 7)', () => {
    // Groupes de tailles variées, chacun clos explicitement, avec des identifiants de groupe connus.
    const sizes = [3, 5, 7];
    const log = createLog();
    const expected = new Map(); // groupId → taille d'origine
    let score = 0;
    let t = T0;
    let k = 0;
    let recorded = 0;
    // On enregistre bien plus que la borne : le bornage doit avoir joué plusieurs fois.
    while (recorded + sizes[k % 3] <= MAX_LOG_ENTRIES + 40) {
      const size = sizes[k % 3];
      recorded += size;
      const gid = 1000 + k;
      for (let j = 0; j < size; j++) {
        record(log, { via: 'tap', playerIdx: 0, from: score, to: score + 1, t, groupId: gid });
        score++;
        t += 10;
      }
      expected.set(gid, size);
      k++;
    }
    expect(log.entries.length).toBeLessThanOrEqual(MAX_LOG_ENTRIES);
    // Chaque groupe restant a exactement sa taille d'origine : aucune action coupée.
    const counts = new Map();
    log.entries.forEach((e) => counts.set(e.groupId, (counts.get(e.groupId) || 0) + 1));
    for (const [gid, n] of counts) expect(`${gid}:${n}`).toBe(`${gid}:${expected.get(gid)}`);
    // Les groupes retirés sont les plus anciens, et le premier restant ouvre bien son groupe.
    const removed = [...expected.keys()].filter((g) => !counts.has(g));
    expect(removed.length).toBeGreaterThan(0);
    expect(Math.max(...removed)).toBeLessThan(Math.min(...counts.keys()));
    expect(log.cursor).toBe(log.entries.length);
    expect(canUndo(log)).toBe(true);
    // Les identifiants restent uniques et croissants, y compris après un nouvel enregistrement.
    recordScore(log, 1, 0, 5, 'keypad', t + 10_000_000);
    const ids = log.entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(ids[0]).toBeGreaterThan(1);
  });

  it('un groupe géant ne vide jamais le journal : la dernière action survit toujours au bornage', () => {
    for (const taps of [
      MAX_LOG_ENTRIES,
      MAX_LOG_ENTRIES + 1,
      MAX_LOG_ENTRIES + 500,
      3 * MAX_LOG_ENTRIES,
    ]) {
      const log = createLog();
      recordScore(log, 0, 0, 5, 'keypad', T0);
      for (let i = 0; i < taps; i++) recordScore(log, 0, 5 + i, 6 + i, 'tap', T0 + 10 + i);
      expect(log.entries.length).toBeGreaterThan(0);
      expect(log.entries.length).toBeLessThanOrEqual(MAX_LOG_ENTRIES);
      expect(canUndo(log)).toBe(true);
      const last = undo(log);
      expect(last.to).toBe(5 + taps - last.count);
      expect(last.count).toBeLessThanOrEqual(MAX_GROUP_TAPS);
    }
  });

  it('une action ne dépasse jamais MAX_GROUP_TAPS taps : le suivant ouvre une nouvelle action', () => {
    const log = createLog();
    for (let i = 0; i < MAX_GROUP_TAPS + 1; i++) recordScore(log, 0, i, i + 1, 'tap', T0 + i);
    const g = groups(log);
    expect(g.map((a) => a.count)).toEqual([MAX_GROUP_TAPS, 1]);
    expect(undo(log)).toMatchObject({ count: 1, delta: -1 });
    expect(undo(log)).toMatchObject({ count: MAX_GROUP_TAPS, delta: -MAX_GROUP_TAPS });
  });

  it('la dernière action prime sur la borne : un journal réduit à une action géante n’est jamais vidé', () => {
    const log = createLog();
    for (let i = 0; i < MAX_LOG_ENTRIES + 5; i++) {
      log.entries.push({
        id: i + 1,
        t: T0 + i,
        playerIdx: 0,
        delta: 1,
        from: i,
        to: i + 1,
        via: 'tap',
        groupId: 1,
      });
    }
    log.cursor = log.entries.length;
    // Le nouveau tap rejoint explicitement l'action géante : elle est la dernière, rien n'est retiré.
    record(log, { via: 'tap', playerIdx: 0, from: 2005, to: 2006, t: T0 + 99_999, groupId: 1 });
    expect(log.entries).toHaveLength(MAX_LOG_ENTRIES + 6);
    expect(canUndo(log)).toBe(true);
    expect(groups(log)).toHaveLength(1);
  });

  it('le plafond de MAX_GROUP_TAPS arrête le regroupement par lui-même, sans identifiant explicite', () => {
    // Tous les taps se suivent à 1 ms : seule la taille du groupe peut le clore.
    const log = createLog();
    for (let i = 0; i < 2 * MAX_GROUP_TAPS + 3; i++) recordScore(log, 0, i, i + 1, 'tap', T0 + i);
    expect(groups(log).map((a) => a.count)).toEqual([MAX_GROUP_TAPS, MAX_GROUP_TAPS, 3]);
    const ids = new Set(log.entries.map((e) => e.groupId));
    expect(ids.size).toBe(3);
  });

  it('le bornage décale le plancher d’annulation d’autant que le curseur', () => {
    const log = createLog();
    for (let i = 0; i < MAX_LOG_ENTRIES; i++) recordScore(log, 0, i, i + 1, 'keypad', T0 + i);
    log.floor = 10; // les 10 premières actions sont de l'historique en lecture seule
    recordScore(log, 0, MAX_LOG_ENTRIES, MAX_LOG_ENTRIES + 1, 'keypad', T0 + MAX_LOG_ENTRIES);
    expect(log.entries).toHaveLength(MAX_LOG_ENTRIES);
    expect(log.floor).toBe(9);
    expect(log.entries[0].id).toBe(2);
    // Le plancher ne remonte jamais au-dessus du curseur et ne devient jamais négatif.
    for (let i = 0; i < 20; i++) {
      recordScore(
        log,
        0,
        MAX_LOG_ENTRIES + 1 + i,
        MAX_LOG_ENTRIES + 2 + i,
        'keypad',
        T0 + 9000 + i,
      );
    }
    expect(log.floor).toBe(0);
    expect(canUndo(log)).toBe(true);
  });

  it('le bornage ne retire jamais la dernière action même quand elle est la seule', () => {
    const log = createLog();
    const entries = Array.from({ length: MAX_LOG_ENTRIES + 10 }, (_, i) => ({
      id: i + 1,
      t: T0 + i,
      playerIdx: 0,
      delta: 1,
      from: i,
      to: i + 1,
      via: 'tap',
      groupId: 1,
    }));
    log.entries.push(...entries);
    log.cursor = entries.length;
    recordScore(log, 1, 0, 3, 'keypad', T0 + 99_999);
    // Le groupe géant précède l'action nouvelle : il est retiré en entier, l'action nouvelle reste.
    expect(log.entries.map((e) => e.via)).toEqual(['keypad']);
    expect(canUndo(log)).toBe(true);
  });
});

describe('raccourcis recordX', () => {
  it('recordScore utilise tap par défaut', () => {
    const log = createLog();
    expect(recordScore(log, 0, 1, 2).via).toBe('tap');
  });
  it('recordRotate / recordElim', () => {
    const log = createLog();
    expect(recordRotate(log, [0, 1], [1, 0], T0)).toMatchObject({ via: 'rotate', t: T0 });
    expect(recordElim(log, 3)).toMatchObject({ via: 'elim', playerIdx: 3, to: true });
    expect(recordElim(log, 3, false)).toMatchObject({ via: 'unelim', to: false });
  });
});

describe('closeGroup', () => {
  it('clôt le groupe courant et empêche tout regroupement ultérieur', () => {
    const log = createLog();
    recordScore(log, 0, 0, 1, 'tap', T0);
    expect(closeGroup(log)).toBe(true);
    expect(closeGroup(log)).toBe(false);
    recordScore(log, 0, 1, 2, 'tap', T0 + 10);
    expect(log.entries.map((e) => e.groupId)).toEqual([1, 2]);
  });
  it("ne clôt que le groupe du joueur demandé, jamais une entrée qui n'est pas un tap", () => {
    const log = createLog();
    expect(closeGroup(log)).toBe(false);
    recordScore(log, 0, 0, 1, 'tap', T0);
    expect(closeGroup(log, 1)).toBe(false);
    expect(closeGroup(log, 0)).toBe(true);
    recordScore(log, 0, 1, 9, 'keypad', T0);
    expect(closeGroup(log)).toBe(false);
  });
});

describe('invert / applyEntry', () => {
  it("l'inverse permute from/to, oppose delta, bascule elim ↔ unelim", () => {
    const e = { id: 1, playerIdx: 0, delta: 3, from: 1, to: 4, via: 'keypad', groupId: 1 };
    expect(invert(e)).toMatchObject({ delta: -3, from: 4, to: 1, via: 'keypad', inverse: true });
    expect(invert({ via: 'elim', from: false, to: true, delta: 0 })).toMatchObject({
      via: 'unelim',
      to: false,
    });
    expect(invert({ via: 'unelim', from: true, to: false, delta: 0 }).via).toBe('elim');
  });
  it("l'inverse de l'inverse est l'entrée d'origine", () => {
    const e = { id: 1, playerIdx: 0, delta: 3, from: 1, to: 4, via: 'tap', groupId: 1 };
    expect(invert(invert(e))).toEqual({ ...e, inverse: false });
  });
  it('applique chaque type sur un état', () => {
    const game = { players: makePlayers([10, 20]), seatOrder: [0, 1] };
    applyEntry(game, { via: 'tap', playerIdx: 0, to: 11 });
    applyEntry(game, { via: 'keypad', playerIdx: 1, to: -5 });
    applyEntry(game, { via: 'elim', playerIdx: 1, to: true });
    applyEntry(game, { via: 'rename', playerIdx: 0, to: 'Zoé' });
    const seats = [1, 0];
    applyEntry(game, { via: 'rotate', to: seats });
    seats.push(9);
    expect(game.players).toEqual([
      { playerName: 'Zoé', score: 11, eliminated: false },
      { playerName: 'J2', score: -5, eliminated: true },
    ]);
    expect(game.seatOrder).toEqual([1, 0]);
    applyEntry(game, { via: 'unelim', playerIdx: 1, to: false });
    expect(game.players[1].eliminated).toBe(false);
  });
  it('ignore un via inconnu sans rien changer', () => {
    const game = { players: makePlayers([10]), seatOrder: [0] };
    const before = JSON.stringify(game);
    expect(() => applyEntry(game, { via: 'zzz', playerIdx: 0, to: 99 })).not.toThrow();
    expect(JSON.stringify(game)).toBe(before);
  });

  it('ignore une entrée visant un joueur absent, sans erreur ni effet de bord', () => {
    const game = { players: makePlayers([10, 20]), seatOrder: [0, 1] };
    const before = JSON.stringify(game);
    for (const idx of [7, -1, 2, 99]) {
      expect(() => applyEntry(game, { via: 'tap', playerIdx: idx, to: 999 })).not.toThrow();
      expect(() => applyEntry(game, { via: 'elim', playerIdx: idx, to: true })).not.toThrow();
      expect(() => applyEntry(game, { via: 'rename', playerIdx: idx, to: 'X' })).not.toThrow();
    }
    expect(JSON.stringify(game)).toBe(before);
  });
});

describe('undo / redo', () => {
  it('renvoie null sur un journal vide et signale canUndo/canRedo', () => {
    const log = createLog();
    expect(undo(log)).toBeNull();
    expect(redo(log)).toBeNull();
    expect(canUndo(log)).toBe(false);
    expect(canRedo(log)).toBe(false);
  });

  it('annule un groupe de taps comme une seule action, avec le delta cumulé inversé', () => {
    const log = sample();
    const a = undo(log);
    expect(a).toMatchObject({ playerIdx: 1, delta: 15, from: 25, to: 40, inverse: true });
    const b = undo(log);
    expect(b).toMatchObject({
      playerIdx: 0,
      delta: -3,
      from: 43,
      to: 40,
      count: 3,
      ids: [1, 2, 3],
    });
    expect(log.cursor).toBe(0);
    expect(canUndo(log)).toBe(false);
    expect(canRedo(log)).toBe(true);
    expect(undo(log)).toBeNull();
  });

  it("rétablit l'action suivante en entier", () => {
    const log = sample();
    undo(log);
    undo(log);
    const r = redo(log);
    expect(r).toMatchObject({ playerIdx: 0, delta: 3, from: 40, to: 43, count: 3 });
    expect(r.inverse).toBeUndefined();
    expect(log.cursor).toBe(3);
    expect(redo(log)).toMatchObject({ playerIdx: 1, delta: -15 });
    expect(redo(log)).toBeNull();
  });

  it('le plancher interdit d’annuler les entrées historiques mais pas les nouvelles', () => {
    const log = sample();
    log.floor = log.cursor;
    expect(canUndo(log)).toBe(false);
    expect(undo(log)).toBeNull();
    recordScore(log, 2, 40, 41, 'tap', T0 + 20_000);
    expect(canUndo(log)).toBe(true);
    expect(undo(log)).toMatchObject({ playerIdx: 2, delta: -1 });
    expect(canUndo(log)).toBe(false);
  });

  it('undo(redo(x)) = x et redo(undo(x)) = x sur des séquences aléatoires (graine fixe)', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const next = rng(seed);
      const n = randInt(next, 1, 12);
      const start = Array.from({ length: n }, () => 40);
      const log = createLog();
      const game = { players: makePlayers(start), seatOrder: identity(n) };
      let t = T0;
      for (let k = 0; k < 60; k++) {
        t += randInt(next, 0, 3000);
        const pi = randInt(next, 0, n - 1);
        const p = game.players[pi];
        const kind = next();
        if (kind < 0.55) {
          const to = p.score + (next() < 0.5 ? 1 : -1);
          recordScore(log, pi, p.score, to, 'tap', t);
          p.score = to;
        } else if (kind < 0.8) {
          const to = p.score + (randInt(next, -500, 500) || 1);
          recordScore(log, pi, p.score, to, 'keypad', t);
          p.score = to;
        } else if (kind < 0.9 && n > 1) {
          const before = game.seatOrder.slice();
          game.seatOrder.unshift(game.seatOrder.pop());
          recordRotate(log, before, game.seatOrder, t);
        } else {
          recordElim(log, pi, !p.eliminated, t);
          p.eliminated = !p.eliminated;
        }
      }
      const final = JSON.stringify(game);
      let e;
      let undone = 0;
      while ((e = undo(log))) {
        applyEntry(game, e);
        undone++;
      }
      expect(undone).toBe(groups(log).length);
      expect(game.players.map((p) => p.score)).toEqual(start);
      expect(game.players.every((p) => !p.eliminated)).toBe(true);
      expect(game.seatOrder).toEqual(identity(n));
      while ((e = redo(log))) applyEntry(game, e);
      expect(JSON.stringify(game)).toBe(final);
    }
  });

  it('undo ×40 puis redo ×40 → état identique (et curseur cohérent)', () => {
    const log = createLog();
    const game = { players: makePlayers([0]), seatOrder: [0] };
    for (let i = 0; i < 40; i++) {
      recordScore(log, 0, i, i + 1, 'keypad', T0 + i * 10_000);
      game.players[0].score = i + 1;
    }
    for (let i = 0; i < 40; i++) applyEntry(game, undo(log));
    expect(game.players[0].score).toBe(0);
    expect(undo(log)).toBeNull();
    for (let i = 0; i < 40; i++) applyEntry(game, redo(log));
    expect(game.players[0].score).toBe(40);
    expect(log.cursor).toBe(40);
    expect(redo(log)).toBeNull();
  });
});

describe('jumpTo', () => {
  it('renvoie null pour un identifiant inconnu sans bouger le curseur', () => {
    const log = sample();
    expect(jumpTo(log, 999)).toBeNull();
    expect(log.cursor).toBe(4);
  });

  it("revient avant toute action avec 0 et renvoie les entrées inversées dans l'ordre", () => {
    const log = sample();
    const steps = jumpTo(log, 0);
    expect(steps.map((s) => s.id)).toEqual([4, 3, 2, 1]);
    expect(steps.every((s) => s.inverse)).toBe(true);
    expect(log.cursor).toBe(0);
    const game = replay(sample(), { players: makePlayers([40, 40]), seatOrder: [0, 1] });
    steps.forEach((s) => applyEntry(game, s));
    expect(game.players.map((p) => p.score)).toEqual([40, 40]);
  });

  it("se cale à la fin de l'action contenant l'entrée visée, sans perdre le rétablissement", () => {
    const log = sample();
    const steps = jumpTo(log, 2);
    expect(steps.map((s) => s.id)).toEqual([4]);
    expect(log.cursor).toBe(3);
    expect(canRedo(log)).toBe(true);
    expect(redo(log)).toMatchObject({ playerIdx: 1 });
  });

  it('avance avec des entrées directes (copies) et est cohérent avec le rejeu', () => {
    const log = sample();
    jumpTo(log, 0);
    const forward = jumpTo(log, 3);
    expect(forward.map((s) => s.id)).toEqual([1, 2, 3]);
    expect(forward.every((s) => !s.inverse)).toBe(true);
    expect(forward[0]).not.toBe(log.entries[0]);
    const game = { players: makePlayers([40, 40]), seatOrder: [0, 1] };
    forward.forEach((s) => applyEntry(game, s));
    expect(game.players[0].score).toBe(43);
    expect(jumpTo(log, 3)).toEqual([]);
  });

  it('refuse une cible sous le plancher, autorise les frontières au-dessus', () => {
    const log = sample();
    log.floor = 3;
    expect(jumpTo(log, 0)).toBeNull();
    expect(log.cursor).toBe(4);
    // L'action 1 se termine à l'indice 3 = le plancher lui-même : le retour y est légitime.
    expect(jumpTo(log, 1).map((s) => s.id)).toEqual([4]);
    expect(log.cursor).toBe(3);
    expect(jumpTo(log, 0)).toBeNull();
    expect(log.cursor).toBe(3);
  });

  it('sur des journaux aléatoires, jumpTo(x) puis jumpTo(fin) redonne l’état final', () => {
    for (let seed = 100; seed < 110; seed++) {
      const next = rng(seed);
      const log = createLog();
      const game = { players: makePlayers([50, 50, 50]), seatOrder: [0, 1, 2] };
      for (let k = 0; k < 30; k++) {
        const pi = randInt(next, 0, 2);
        const to = game.players[pi].score + randInt(next, 1, 9) * (next() < 0.5 ? 1 : -1);
        recordScore(
          log,
          pi,
          game.players[pi].score,
          to,
          next() < 0.5 ? 'tap' : 'keypad',
          T0 + k * 100,
        );
        game.players[pi].score = to;
      }
      const final = JSON.stringify(game.players);
      const lastId = log.entries[log.entries.length - 1].id;
      for (let round = 0; round < 5; round++) {
        const target = log.entries[randInt(next, 0, log.entries.length - 1)].id;
        jumpTo(log, target).forEach((s) => applyEntry(game, s));
        const check = replay(
          { entries: log.entries, cursor: log.cursor },
          { players: makePlayers([50, 50, 50]), seatOrder: [0, 1, 2] },
        );
        expect(game.players.map((p) => p.score)).toEqual(check.players.map((p) => p.score));
      }
      jumpTo(log, lastId).forEach((s) => applyEntry(game, s));
      expect(JSON.stringify(game.players)).toBe(final);
    }
  });
});

describe('groups / timeline', () => {
  it('numérote les actions chronologiquement et marque celles annulées', () => {
    const log = sample();
    undo(log);
    const g = groups(log);
    expect(g).toHaveLength(2);
    expect(g[0]).toMatchObject({
      n: 1,
      id: 1,
      ids: [1, 2, 3],
      playerIdx: 0,
      via: 'tap',
      delta: 3,
      from: 40,
      to: 43,
      count: 3,
      t: T0,
      tEnd: T0 + 600,
      undone: false,
      locked: false,
      approx: false,
    });
    expect(g[1]).toMatchObject({ n: 2, playerIdx: 1, delta: -15, undone: true });
  });

  it('marque locked les actions sous le plancher', () => {
    const log = sample();
    log.floor = 3;
    const g = groups(log);
    expect(g.map((a) => a.locked)).toEqual([true, false]);
  });

  it("timeline : après 3 actions sur 2 joueurs, l'ordre affiché est l'ordre réel", () => {
    const log = createLog();
    recordScore(log, 1, 0, 1, 'tap', T0);
    recordScore(log, 0, 0, 5, 'keypad', T0 + 2000);
    recordScore(log, 1, 1, 2, 'tap', T0 + 4000);
    const tl = timeline(log);
    expect(tl.map((e) => [e.n, e.playerIdx, e.delta])).toEqual([
      [1, 1, 1],
      [2, 0, 5],
      [3, 1, 1],
    ]);
    expect(tl.every((e) => e.undone === false)).toBe(true);
  });

  it('timeline marque undone les entrées au-delà du curseur', () => {
    const log = sample();
    undo(log);
    undo(log);
    const tl = timeline(log);
    expect(tl.map((e) => e.undone)).toEqual([true, true, true, true]);
    redo(log);
    expect(timeline(log).map((e) => e.undone)).toEqual([false, false, false, true]);
    expect(timeline(log).map((e) => e.n)).toEqual([1, 1, 1, 2]);
  });

  it('groups regroupe par contiguïté : un même groupId non contigu donne deux actions', () => {
    const log = createLog();
    record(log, { via: 'keypad', playerIdx: 0, from: 0, to: 1, groupId: 1, t: T0 });
    record(log, { via: 'keypad', playerIdx: 1, from: 0, to: 1, groupId: 2, t: T0 });
    record(log, { via: 'keypad', playerIdx: 0, from: 1, to: 2, groupId: 1, t: T0 });
    expect(groups(log).map((g) => g.n)).toEqual([1, 2, 3]);
  });

  it('timeline et groups restent linéaires : tous les accès comptés, tailles de groupe variées', () => {
    // Un mandataire compte CHAQUE lecture : indices du tableau et tous les champs des entrées.
    // Une boucle quadratique, sur `id` comme sur `groupId`, ferait exploser le compte (n²/2).
    const build = (n, size) => {
      let reads = 0;
      const entries = Array.from({ length: n }, (_, i) => {
        const raw = {
          id: i + 1,
          t: T0 + i,
          playerIdx: 0,
          delta: 1,
          from: i,
          to: i + 1,
          via: 'keypad',
          groupId: Math.floor(i / size) + 1,
        };
        return new Proxy(raw, {
          get(o, k) {
            reads++;
            return o[k];
          },
        });
      });
      const arr = new Proxy(entries, {
        get(o, k) {
          if (typeof k === 'string' && /^\d+$/.test(k)) reads++;
          return o[k];
        },
      });
      return { log: { entries: arr, cursor: n, floor: 0 }, reads: () => reads };
    };
    for (const size of [1, 3, 7, 50]) {
      const counts = [1000, 2000].map((n) => {
        const b = build(n, size);
        expect(timeline(b.log)).toHaveLength(n);
        expect(groups(b.log)).toHaveLength(Math.ceil(n / size));
        return b.reads();
      });
      // Mesuré : 20 à 29 accès par entrée. Quadratique : > 500 par entrée dès n = 1 000.
      expect(counts[0]).toBeLessThanOrEqual(40 * 1000);
      expect(counts[1]).toBeLessThanOrEqual(40 * 2000);
      const ratio = counts[1] / counts[0];
      expect(ratio).toBeGreaterThan(1.5);
      expect(ratio).toBeLessThan(2.5);
    }
  });
});

describe('playerRecap', () => {
  it('ne retient que les actions de score en vigueur du joueur, avec total et courbe', () => {
    const log = sample();
    recordRotate(log, [0, 1], [1, 0], T0 + 6000);
    recordElim(log, 0, true, T0 + 7000);
    recordScore(log, 0, 43, 33, 'keypad', T0 + 8000);
    undo(log);
    const r = playerRecap(log, 0);
    expect(r.actions.map((a) => a.delta)).toEqual([3]);
    expect(r.total).toBe(3);
    expect(r.points).toEqual([
      { t: T0, score: 40 },
      { t: T0 + 600, score: 43 },
    ]);
    expect(playerRecap(log, 1)).toMatchObject({ total: -15 });
  });
  it('renvoie une courbe vide sans action', () => {
    expect(playerRecap(createLog(), 0)).toEqual({ actions: [], total: 0, points: [] });
  });
});

describe('appliedState', () => {
  it('donne le dernier score appliqué par joueur et le dernier ordre de sièges', () => {
    const log = sample();
    recordRotate(log, [0, 1], [1, 0], T0 + 6000);
    const { scores, seats } = appliedState(log);
    expect(scores.get(0)).toBe(43);
    expect(scores.get(1)).toBe(25);
    expect(seats).toEqual([1, 0]);
  });
  it('ignore les éliminations et renommages : ils ne portent ni score ni sièges', () => {
    const log = createLog();
    recordElim(log, 0, true, T0);
    recordRename(log, 1, 'B', 'Bob', T0 + 1);
    const { scores, seats } = appliedState(log);
    expect(scores.size).toBe(0);
    expect(seats).toBeNull();
  });
  it('ignore ce qui est au-delà du curseur ; pas de rotation appliquée ⇒ seats null', () => {
    const log = sample();
    undo(log);
    const { scores, seats } = appliedState(log);
    expect(scores.has(1)).toBe(false);
    expect(scores.get(0)).toBe(43);
    expect(seats).toBeNull();
  });
});

describe('migration depuis un historique v0/v1', () => {
  const players = makePlayers([39, 0, 25, 38], ['Alice', 'Bob', 'Chloé', 'J4']);
  const history = [
    { playerIdx: 3, who: 'J4', entries: [{ delta: -1 }, { delta: -1 }], open: true, rank: 4 },
    { playerIdx: 1, who: 'Bob', entries: [{ delta: -40 }], open: false, rank: 3 },
    { playerIdx: 2, who: 'Chloé', entries: [{ delta: -15 }], open: false, rank: 2 },
    { playerIdx: 0, who: 'Alice', entries: [{ delta: -1 }], open: false, rank: 1 },
  ];

  it('logFromGroups reconstitue les scores intermédiaires à rebours', () => {
    const log = logFromGroups(history, players, T0);
    expect(log.cursor).toBe(5);
    expect(log.entries.map((e) => [e.playerIdx, e.from, e.to, e.via, e.groupId])).toEqual([
      [0, 40, 39, 'tap', 1],
      [2, 40, 25, 'keypad', 2],
      [1, 40, 0, 'keypad', 3],
      [3, 40, 39, 'tap', 4],
      [3, 39, 38, 'tap', 4],
    ]);
    expect(log.entries.every((e) => e.t === T0 && e.approx === true)).toBe(true);
    expect(log.entries[4].closed).toBe(true);
    expect(log.entries.map((e) => e.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('logFromGroups ignore les groupes invalides, vides ou hors limites', () => {
    const log = logFromGroups(
      [
        null,
        { playerIdx: 9, entries: [{ delta: 1 }], rank: 1 },
        { playerIdx: 0, entries: [{ delta: 0 }, { delta: 'x' }], rank: 2 },
        { playerIdx: 0, entries: 'nope', rank: 3 },
        { playerIdx: 'x', entries: [{ delta: 1 }], rank: 5 },
        { playerIdx: 0, entries: [{ delta: 2 }], rank: 4 },
      ],
      players,
      T0,
    );
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0]).toMatchObject({ from: 37, to: 39, via: 'keypad' });
    expect(logFromGroups([], players)).toEqual(createLog());
    // Groupes sans rang : ils sont traités comme rang 0 et restent dans leur ordre d'arrivée.
    const noRank = logFromGroups(
      [
        { playerIdx: 0, entries: [{ delta: 1 }] },
        { playerIdx: 1, entries: [{ delta: 2 }] },
      ],
      players,
      T0,
    );
    expect(noRank.entries.map((e) => e.playerIdx)).toEqual([0, 1]);
  });

  it('le journal migré est cohérent avec les scores enregistrés', () => {
    const log = logFromGroups(history, players, T0);
    const { scores } = appliedState(log);
    players.forEach((p, i) => {
      if (scores.has(i)) expect(scores.get(i)).toBe(p.score);
    });
  });
});
