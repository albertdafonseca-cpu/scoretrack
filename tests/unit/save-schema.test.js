import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  KEYS,
  SCHEMA_VERSION,
  addProfiles,
  parseGame,
  parseProfiles,
  parseSettings,
  serializeGame,
  serializeProfiles,
  serializeSettings,
} from '../../js/core/save-schema.js';

// Sauvegarde v0 telle que produite par l'ancien index.html (fonction saveGame, sans champ `v`).
const V0_SAVE = {
  players: [
    { playerName: 'Alice', score: 25, eliminated: false },
    { playerName: '', score: 0, eliminated: true },
    { playerName: 'Chloé', score: 41, eliminated: false },
    { playerName: 'David', score: 40, eliminated: false },
  ],
  seatOrder: [3, 0, 1, 2],
  history: [
    { playerIdx: 0, who: 'Alice', entries: [{ delta: -15 }], open: false, rank: 3 },
    { playerIdx: 2, who: 'Chloé', entries: [{ delta: 1 }], open: true, rank: 2 },
    { playerIdx: 1, who: '', entries: [{ delta: -1 }, { delta: -1 }], open: false, rank: 1 },
  ],
  actionCounter: 3,
  numPlayers: 4,
  startPoints: 40,
  maxPoints: null,
  allowNeg: false,
  ts: 1758000000000,
};

describe('clés et version', () => {
  it('conserve les clés localStorage historiques', () => {
    expect(KEYS).toEqual({
      settings: 'scoretrack_settings',
      save: 'scoretrack_save',
      profiles: 'scoretrack_profiles',
    });
    expect(SCHEMA_VERSION).toBe(1);
  });
});

describe('partie : migration v0 → mémoire', () => {
  it('relit une sauvegarde v0 réelle sans perte', () => {
    const g = parseGame(V0_SAVE);
    expect(g).not.toBeNull();
    expect(g.players).toEqual(V0_SAVE.players);
    expect(g.seatOrder).toEqual([3, 0, 1, 2]);
    expect(g.history).toEqual(V0_SAVE.history);
    expect(g.actionCounter).toBe(3);
    expect(g.numPlayers).toBe(4);
    expect(g.startPoints).toBe(40);
    expect(g.maxPoints).toBe(Infinity);
    expect(g.allowNeg).toBe(false);
  });

  it('convertit maxPoints null ↔ Infinity dans les deux sens', () => {
    expect(parseGame({ ...V0_SAVE, maxPoints: 40 }).maxPoints).toBe(40);
    const out = serializeGame(parseGame(V0_SAVE), 123);
    expect(out.maxPoints).toBeNull();
    expect(out.v).toBe(1);
    expect(out.ts).toBe(123);
    expect(serializeGame({ ...parseGame(V0_SAVE), maxPoints: 40 }).maxPoints).toBe(40);
  });

  it('un aller-retour v1 est stable', () => {
    const once = parseGame(serializeGame(parseGame(V0_SAVE)));
    const twice = parseGame(serializeGame(once));
    expect(twice).toEqual(once);
  });

  it('rejette les sauvegardes inexploitables', () => {
    expect(parseGame(null)).toBeNull();
    expect(parseGame('texte')).toBeNull();
    expect(parseGame({})).toBeNull();
    expect(parseGame({ players: [] })).toBeNull();
    expect(parseGame({ players: [{ playerName: 'x', score: 'NaN' }] })).toBeNull();
  });

  it('répare un ordre de sièges incohérent et un historique partiel', () => {
    const g = parseGame({
      ...V0_SAVE,
      seatOrder: [0, 0, 1],
      history: [null, { playerIdx: 9, entries: [] }],
    });
    expect(g.seatOrder).toEqual([0, 1, 2, 3]);
    expect(g.history).toEqual([]);
  });

  it('ne laisse jamais actionCounter sous le rang maximal', () => {
    const g = parseGame({ ...V0_SAVE, actionCounter: undefined });
    expect(g.actionCounter).toBe(3);
  });
});

describe('réglages', () => {
  it('relit les réglages v0 et complète les valeurs manquantes', () => {
    expect(
      parseSettings({ theme: 'ldm', defPlayers: 6, defStart: 40, defMax: 40, defNeg: false }),
    ).toEqual({
      theme: 'ldm',
      defPlayers: 6,
      defStart: 40,
      defMax: 40,
      defNeg: false,
    });
    expect(parseSettings({})).toEqual({ ...DEFAULT_SETTINGS });
    expect(parseSettings(null)).toEqual({ ...DEFAULT_SETTINGS });
    expect(parseSettings({ theme: '', defPlayers: '4', defMax: -1, defNeg: 1 })).toEqual({
      ...DEFAULT_SETTINGS,
      defNeg: true,
    });
  });
  it('sérialise en v1', () => {
    expect(
      serializeSettings({ theme: 'sobre', defPlayers: 4, defStart: 0, defMax: 0, defNeg: true }),
    ).toEqual({
      v: 1,
      theme: 'sobre',
      defPlayers: 4,
      defStart: 0,
      defMax: 0,
      defNeg: true,
    });
  });
});

describe('profils', () => {
  it('relit un tableau v0 et un objet v1', () => {
    expect(parseProfiles(['Alice', 'Bob'])).toEqual(['Alice', 'Bob']);
    expect(parseProfiles({ v: 1, names: ['Alice'] })).toEqual(['Alice']);
    expect(parseProfiles(null)).toEqual([]);
    expect(parseProfiles(['ok', 3, '', null])).toEqual(['ok']);
  });
  it('sérialise en v1 et borne à 30 entrées', () => {
    const many = Array.from({ length: 35 }, (_, i) => `J${i}`);
    const out = serializeProfiles(many);
    expect(out.v).toBe(1);
    expect(out.names).toHaveLength(30);
    expect(out.names[0]).toBe('J5');
  });
  it('addProfiles ajoute sans doublon et garde les 30 derniers', () => {
    expect(addProfiles(['Alice'], ['Bob', 'Alice'])).toEqual(['Alice', 'Bob']);
    const many = Array.from({ length: 30 }, (_, i) => `J${i}`);
    expect(addProfiles(many, ['Zoé'])).toHaveLength(30);
    expect(addProfiles(many, ['Zoé']).at(-1)).toBe('Zoé');
  });
});
