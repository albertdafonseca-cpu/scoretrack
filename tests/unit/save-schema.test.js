import { describe, expect, it } from 'vitest';
import {
  applyEntry,
  canUndo,
  createLog,
  groups,
  recordScore,
  redo,
  undo,
} from '../../js/core/history.js';
import { MAX_PLAYERS } from '../../js/core/layout.js';
import {
  DEFAULT_SETTINGS,
  KEYS,
  SCHEMA_VERSION,
  SETTINGS_VERSION,
  addProfiles,
  checksum,
  parseGame,
  parseGameOrNull,
  parseProfiles,
  parseSettings,
  serializeGame,
  serializeProfiles,
  serializeSettings,
  verifyChecksum,
} from '../../js/core/save-schema.js';
import { fixture, fixtureText, identity, makePlayers, randInt, rng } from './helpers.js';

// Gabarits RÉELS : écrits dans localStorage par l'ancien index.html (commit 3452b66) piloté dans
// Chromium (v0-*), et par le sérialiseur v1 du commit suivant (v1-save).
const LEGACY = ['v0-fresh-4p', 'v0-advanced-4p', 'v0-12p-neg', 'v0-solo', 'v1-save'];

/** Défait toutes les actions d'une partie parsée, puis les rétablit. */
function rewind(game) {
  const g = { players: game.players.map((p) => ({ ...p })), seatOrder: game.seatOrder.slice() };
  let e;
  while ((e = undo(game.log))) applyEntry(g, e);
  const initial = g.players.map((p) => p.score);
  while ((e = redo(game.log))) applyEntry(g, e);
  return { initial, final: g.players.map((p) => p.score) };
}

/** Sauvegarde v2 minimale et cohérente, pour bâtir des cas limites. */
function v2save(over = {}) {
  const log = createLog();
  recordScore(log, 0, 40, 41, 'tap', 10);
  recordScore(log, 0, 41, 42, 'tap', 20);
  recordScore(log, 0, 42, 43, 'tap', 30);
  recordScore(log, 1, 40, 25, 'keypad', 5000);
  return serializeGame(
    {
      players: makePlayers([43, 25], ['Alice', 'Bob']),
      seatOrder: [0, 1],
      log,
      config: { startPoints: 40, maxPoints: Infinity, allowNeg: false },
      ...over,
    },
    999,
  );
}

describe('clés et versions', () => {
  it('conserve les clés localStorage historiques', () => {
    expect(KEYS).toEqual({
      settings: 'scoretrack_settings',
      save: 'scoretrack_save',
      profiles: 'scoretrack_profiles',
    });
    expect(SCHEMA_VERSION).toBe(2);
    expect(SETTINGS_VERSION).toBe(1);
  });
});

describe('somme de contrôle FNV-1a', () => {
  it('produit 8 caractères hexadécimaux, déterministes, aux valeurs de référence', () => {
    expect(checksum('')).toBe('811c9dc5');
    expect(checksum('a')).toBe('e40c292c');
    expect(checksum('foobar')).toBe('bf9cf968');
    expect(checksum('été ☃')).toMatch(/^[0-9a-f]{8}$/);
    expect(checksum('x')).toBe(checksum('x'));
    expect(checksum('x')).not.toBe(checksum('y'));
  });
  it('verifyChecksum accepte un objet sans somme et détecte une altération', () => {
    const out = v2save();
    expect(verifyChecksum(out)).toBe(true);
    expect(verifyChecksum({ ...out, players: makePlayers([2, 2]) })).toBe(false);
    expect(verifyChecksum({ ...out, sum: undefined })).toBe(true);
    expect(verifyChecksum(JSON.parse(JSON.stringify(out)))).toBe(true);
  });
});

describe('migration v0/v1 → v2 sur des sauvegardes réelles', () => {
  for (const name of LEGACY) {
    const raw = fixture(name);
    it(`${name} : lue sans perte ni réparation (joueurs, sièges, configuration)`, () => {
      const res = parseGame(fixtureText(name));
      expect(res.ok).toBe(true);
      expect(res.repaired).toBe(false);
      const { game } = res;
      expect(game.players).toEqual(raw.players);
      expect(game.seatOrder).toEqual(raw.seatOrder);
      expect(game.config).toEqual({
        numPlayers: raw.numPlayers,
        startPoints: raw.startPoints,
        maxPoints: raw.maxPoints === null ? Infinity : raw.maxPoints,
        allowNeg: raw.allowNeg,
      });
      expect(game.ts).toBe(raw.ts);
    });

    it(`${name} : le journal reconstitué remonte au score de départ puis au score final`, () => {
      const { game } = parseGame(raw);
      const deltas = raw.history.flatMap((g) => g.entries.map((e) => e.delta));
      expect(game.log.entries).toHaveLength(deltas.length);
      expect(game.log.cursor).toBe(deltas.length);
      expect(game.log.floor).toBe(0);
      expect(game.log.entries.map((e) => e.delta)).toEqual(
        raw.history
          .slice()
          .sort((a, b) => a.rank - b.rank)
          .flatMap((g) => g.entries.map((e) => e.delta)),
      );
      expect(game.log.entries.every((e) => e.approx === true && e.t === raw.ts)).toBe(true);
      const { initial, final } = rewind(game);
      expect(initial).toEqual(raw.players.map(() => raw.startPoints));
      expect(final).toEqual(raw.players.map((p) => p.score));
    });

    it(`${name} : aller-retour v2 stable (sérialiser puis relire)`, () => {
      const once = parseGame(raw).game;
      const text = JSON.stringify(serializeGame(once, 123));
      const twice = parseGame(text);
      expect(twice.ok).toBe(true);
      expect(twice.repaired).toBe(false);
      expect(twice.game).toEqual({ ...once, ts: 123 });
      expect(JSON.parse(text).v).toBe(2);
    });
  }

  it("un groupe encore ouvert dans l'ancienne sauvegarde est clos au chargement", () => {
    const { game } = parseGame(fixture('v0-advanced-4p'));
    const last = game.log.entries[game.log.entries.length - 1];
    expect(last).toMatchObject({ playerIdx: 3, via: 'tap', closed: true });
    recordScore(game.log, 3, 38, 37, 'tap', last.t + 10);
    expect(game.log.entries[game.log.entries.length - 1].groupId).not.toBe(last.groupId);
  });

  it('12 joueurs, négatifs et 7 chiffres : deltas et moyens reconstitués', () => {
    const { game } = parseGame(fixture('v0-12p-neg'));
    expect(game.players[0].score).toBe(-1234567);
    expect(game.players[5].score).toBe(9999999);
    expect(game.log.entries.map((e) => e.via)).toEqual(['tap', 'tap', 'tap', 'keypad', 'keypad']);
    // L'ancienne app ne sauvegardait pas après une rotation : l'ordre du gabarit est l'ordre initial.
    expect(game.seatOrder).toEqual(identity(12));
    expect(game.config.allowNeg).toBe(true);
  });

  it('un joueur seul : partie valide, journal de deux taps', () => {
    const { game } = parseGame(fixture('v0-solo'));
    expect(game.players).toHaveLength(1);
    expect(game.log.entries.map((e) => [e.from, e.to])).toEqual([
      [0, 1],
      [1, 2],
    ]);
  });
});

describe('réparations : une sauvegarde lisible n’est jamais perdue (D5)', () => {
  const base = {
    players: [{ playerName: 'Alice', score: 40 }],
    seatOrder: [0],
    startPoints: 40,
    maxPoints: 40,
    allowNeg: false,
    ts: 5,
  };
  const withPlayers = (players, over = {}) => ({ ...base, players, seatOrder: undefined, ...over });

  it('matrice complète des champs douteux : tout est réparé, rien n’est perdu', () => {
    const cases = [
      ['score en chaîne', withPlayers([{ playerName: 'A', score: '40' }]), 40],
      ['score en chaîne espacée', withPlayers([{ playerName: 'A', score: ' 40 ' }]), 40],
      ['score absent', withPlayers([{ playerName: 'A' }]), 40],
      ['score null', withPlayers([{ playerName: 'A', score: null }]), 40],
      ['score NaN', withPlayers([{ playerName: 'A', score: NaN }]), 40],
      ['score Infinity', withPlayers([{ playerName: 'A', score: Infinity }]), 40],
      ['score booléen', withPlayers([{ playerName: 'A', score: true }]), 40],
      ['score objet', withPlayers([{ playerName: 'A', score: {} }]), 40],
      ['joueur null', withPlayers([null]), 40],
      ['joueur en chaîne', withPlayers(['Alice']), 40],
      ['score négatif conservé', withPlayers([{ playerName: 'A', score: -7 }]), -7],
      ['score à 7 chiffres conservé', withPlayers([{ playerName: 'A', score: 9999999 }]), 9999999],
    ];
    for (const [label, save, expected] of cases) {
      const res = parseGame(save);
      expect(`${label}: ${res.ok}`).toBe(`${label}: true`);
      expect(`${label}: ${res.game.players[0].score}`).toBe(`${label}: ${expected}`);
      expect(res.game.players).toHaveLength(1);
    }
  });

  it('sans score de départ connu, un score illisible retombe sur 0', () => {
    const res = parseGame({ players: [{ playerName: 'A', score: 'x' }] });
    expect(res.ok).toBe(true);
    expect(res.game.players[0].score).toBe(0);
    expect(res.repaired).toBe(true);
  });

  it('un joueur illisible n’est jamais retiré (les indices du journal resteraient faux)', () => {
    const res = parseGame(withPlayers([{ score: 10 }, null, { playerName: 'C', score: '30' }]));
    expect(res.game.players).toEqual([
      { playerName: '', score: 10, eliminated: false },
      { playerName: '', score: 40, eliminated: false },
      { playerName: 'C', score: 30, eliminated: false },
    ]);
    expect(res.game.seatOrder).toEqual([0, 1, 2]);
    expect(res.repaired).toBe(true);
  });

  it('prénom non textuel, drapeau d’élimination approximatif, ordre des sièges incohérent', () => {
    const res = parseGame({
      ...base,
      players: [
        { playerName: 7, score: 3, eliminated: 'oui' },
        { playerName: 'B', score: 4, eliminated: 1 },
        { playerName: 'C', score: 5, eliminated: true },
      ],
      seatOrder: [2, 2, 0],
    });
    expect(res.ok).toBe(true);
    expect(res.game.players.map((p) => [p.playerName, p.eliminated])).toEqual([
      ['', false],
      ['B', true],
      ['C', true],
    ]);
    expect(res.game.seatOrder).toEqual([0, 1, 2]);
    expect(res.repaired).toBe(true);
  });

  it('le gabarit pervers du critique est intégralement récupéré', () => {
    const pervers = {
      players: [
        { playerName: 'Alice', score: '40' },
        { playerName: 'Bob', score: 12, eliminated: 'non' },
        { playerName: 'Chloé', score: 7 },
      ],
      seatOrder: [2, 2, 0],
      history: [
        { playerIdx: 1, who: 'Bob', entries: [{ delta: -28 }], open: true, rank: 2 },
        null,
        { playerIdx: 9, entries: [{ delta: 3 }], rank: 5 },
      ],
      actionCounter: 'trois',
      numPlayers: 9,
      startPoints: '40',
      maxPoints: '40',
      allowNeg: 'non',
      ts: 1758000000000,
    };
    const res = parseGame(pervers);
    expect(res.ok).toBe(true);
    expect(res.repaired).toBe(true);
    expect(res.game.players.map((p) => p.score)).toEqual([40, 12, 7]);
    expect(res.game.players[1].eliminated).toBe(false);
    expect(res.game.seatOrder).toEqual([0, 1, 2]);
    expect(res.game.config).toEqual({
      numPlayers: 3,
      startPoints: 40,
      maxPoints: 40,
      allowNeg: false,
    });
    // L'unique groupe exploitable est conservé et reste annulable.
    expect(res.game.log.entries.map((e) => [e.playerIdx, e.from, e.to])).toEqual([[1, 40, 12]]);
    expect(canUndo(res.game.log)).toBe(true);
  });

  it('toute valeur non relue telle quelle est signalée : conversion comprise (D15)', () => {
    const one = (over) =>
      parseGame({ players: [{ playerName: 'A', score: 1, eliminated: false }], ...over });
    expect(one({ players: [{ playerName: 'A', score: '40', eliminated: false }] }).repaired).toBe(
      true,
    );
    expect(one({ startPoints: '40' }).repaired).toBe(true);
    expect(one({ maxPoints: '40' }).repaired).toBe(true);
    expect(one({ allowNeg: 'true' }).repaired).toBe(true);
    expect(one({ allowNeg: 'true' }).game.config.allowNeg).toBe(true);
    expect(one({ ts: 'hier' }).repaired).toBe(true);
    expect(one({ players: [{ playerName: 'A', score: 1, eliminated: 'true' }] }).repaired).toBe(
      true,
    );
    // Les encodages légitimes ne comptent pas : maxPoints null (= sans plafond), champs absents.
    expect(one({ maxPoints: null }).repaired).toBe(false);
    expect(one({}).repaired).toBe(false);
  });

  it('les sauvegardes saines ne sont jamais marquées réparées', () => {
    expect(parseGame(v2save()).repaired).toBe(false);
    expect(parseGame(JSON.stringify(v2save())).repaired).toBe(false);
    expect(
      parseGame({ players: [{ playerName: 'A', score: 1, eliminated: false }], seatOrder: [0] })
        .repaired,
    ).toBe(false);
  });
});

describe('bornes : nombre de joueurs', () => {
  it('accepte 1 à 12 joueurs', () => {
    for (let n = 1; n <= MAX_PLAYERS; n++) {
      const res = parseGame({ players: makePlayers(Array.from({ length: n }, () => 10)) });
      expect(res.ok).toBe(true);
      expect(res.game.players).toHaveLength(n);
    }
  });
  it('refuse explicitement au-delà de 12 plutôt que d’amputer la partie', () => {
    for (const n of [13, 20, 100]) {
      const res = parseGame({ players: makePlayers(Array.from({ length: n }, () => 10)) });
      expect(res).toEqual({ ok: false, reason: 'unsupported' });
    }
    const v2 = serializeGame(
      {
        players: makePlayers(Array.from({ length: 13 }, () => 10)),
        seatOrder: identity(13),
        log: createLog(),
      },
      1,
    );
    expect(verifyChecksum(v2)).toBe(true);
    expect(parseGame(v2).reason).toBe('unsupported');
    expect(parseGameOrNull(v2)).toBeNull();
    // Une somme de contrôle fausse reste prioritaire : la sauvegarde est corrompue, pas « trop grande ».
    expect(parseGame({ ...v2, sum: 'deadbeef' }).reason).toBe('corrupt');
  });
});

describe('sérialisation v2', () => {
  it('écrit { v, players, seatOrder, log, config, ts, sum } avec maxPoints Infinity → null', () => {
    const out = v2save();
    expect(Object.keys(out)).toEqual(['v', 'players', 'seatOrder', 'log', 'config', 'ts', 'sum']);
    expect(out).toMatchObject({
      v: 2,
      seatOrder: [0, 1],
      config: { numPlayers: 2, startPoints: 40, maxPoints: null, allowNeg: false },
      ts: 999,
    });
    expect(out.log).toMatchObject({ cursor: 4, floor: 0 });
    expect(out.sum).toMatch(/^[0-9a-f]{8}$/);
    expect(verifyChecksum(out)).toBe(true);
  });

  it('conserve le curseur et le plancher à travers un aller-retour', () => {
    const log = createLog();
    recordScore(log, 0, 40, 41, 'tap', 10);
    recordScore(log, 1, 40, 30, 'keypad', 20);
    undo(log);
    const state = {
      players: makePlayers([41, 40]),
      seatOrder: [0, 1],
      log,
      config: { startPoints: 40 },
    };
    const back = parseGame(JSON.stringify(serializeGame(state, 1))).game;
    expect(back.log.cursor).toBe(1);
    expect(redo(back.log)).toMatchObject({ playerIdx: 1, delta: -10 });
    const sealed = { ...state, log: { ...log, cursor: 1, floor: 1 } };
    expect(parseGame(JSON.stringify(serializeGame(sealed, 1))).game.log.floor).toBe(1);
  });

  it('copie le journal (aucun partage de référence avec l’état)', () => {
    const log = createLog();
    recordScore(log, 0, 0, 1, 'tap', 1);
    const state = { players: makePlayers([1]), seatOrder: [0], log };
    const out = serializeGame(state, 1);
    expect(out.log.entries[0]).not.toBe(log.entries[0]);
    expect(out.log.entries).not.toBe(log.entries);
  });

  it('un journal sans plancher est sérialisé avec un plancher à 0', () => {
    const log = createLog();
    recordScore(log, 0, 0, 1, 'tap', 1);
    const out = serializeGame(
      { players: makePlayers([1]), seatOrder: [0], log: { entries: log.entries, cursor: 1 } },
      1,
    );
    expect(out.log.floor).toBe(0);
    expect(parseGame(JSON.stringify(out)).ok).toBe(true);
  });

  it('journal absent ou mal formé → journal vide, partie conservée', () => {
    const out = serializeGame({ players: makePlayers([5]), seatOrder: [0] }, 1);
    expect(out.log).toEqual(createLog());
    expect(serializeGame({ players: makePlayers([5]), seatOrder: [0], log: 'x' }, 1).log).toEqual(
      createLog(),
    );
  });

  it('assainit joueurs, sièges et configuration douteux', () => {
    const out = serializeGame(
      {
        players: [{ playerName: 7, score: 'x', eliminated: 1 }],
        seatOrder: [4],
        log: createLog(),
        config: { startPoints: 'a', maxPoints: 'b', allowNeg: 'oui' },
      },
      1,
    );
    expect(out.players).toEqual([{ playerName: '', score: 0, eliminated: true }]);
    expect(out.seatOrder).toEqual([0]);
    expect(out.config).toEqual({ numPlayers: 1, startPoints: 0, maxPoints: null, allowNeg: true });
  });

  it('numPlayers suit toujours le nombre réel de joueurs', () => {
    const out = serializeGame(
      { players: makePlayers([1, 2, 3]), seatOrder: [0, 1, 2], config: { numPlayers: 9 } },
      1,
    );
    expect(out.config.numPlayers).toBe(3);
  });
});

describe('parseGame : résultats structurés', () => {
  it("'empty' pour rien à restaurer", () => {
    expect(parseGame(null)).toEqual({ ok: false, reason: 'empty' });
    expect(parseGame(undefined)).toEqual({ ok: false, reason: 'empty' });
    expect(parseGame('')).toEqual({ ok: false, reason: 'empty' });
    expect(parseGame('   \n')).toEqual({ ok: false, reason: 'empty' });
    expect(parseGame('null')).toEqual({ ok: false, reason: 'empty' });
  });

  it("'corrupt' pour un JSON tronqué, un type faux ou une liste de joueurs inexploitable", () => {
    expect(parseGame('{"players":[')).toEqual({ ok: false, reason: 'corrupt' });
    expect(parseGame('texte')).toEqual({ ok: false, reason: 'corrupt' });
    expect(parseGame('42')).toEqual({ ok: false, reason: 'corrupt' });
    expect(parseGame('[]')).toEqual({ ok: false, reason: 'corrupt' });
    expect(parseGame([])).toEqual({ ok: false, reason: 'corrupt' });
    expect(parseGame({})).toEqual({ ok: false, reason: 'corrupt' });
    expect(parseGame({ players: [] })).toEqual({ ok: false, reason: 'corrupt' });
    expect(parseGame({ players: 'x' })).toEqual({ ok: false, reason: 'corrupt' });
  });

  it("'corrupt' quand la somme de contrôle ne correspond pas", () => {
    const out = v2save();
    const tampered = JSON.parse(JSON.stringify(out));
    tampered.players[0].score = 500;
    expect(parseGame(tampered)).toEqual({ ok: false, reason: 'corrupt' });
    expect(parseGame({ ...out, sum: 'deadbeef' })).toEqual({ ok: false, reason: 'corrupt' });
    expect(parseGame(JSON.stringify(out)).ok).toBe(true);
  });

  it("toute troncature du texte JSON d'une sauvegarde v2 est détectée comme 'corrupt'", () => {
    const text = JSON.stringify(v2save());
    for (let cut = 1; cut < text.length; cut++) {
      const res = parseGame(text.slice(0, cut));
      expect(res.ok).toBe(false);
      expect(res.reason).toBe('corrupt');
    }
  });

  it("'unsupported' pour une version de schéma inconnue", () => {
    const base = { players: makePlayers([1]) };
    expect(parseGame({ ...base, v: 3 })).toEqual({ ok: false, reason: 'unsupported' });
    expect(parseGame({ ...base, v: '2' })).toEqual({ ok: false, reason: 'unsupported' });
    expect(parseGame({ ...base, v: -1 })).toEqual({ ok: false, reason: 'unsupported' });
    expect(parseGame({ ...base, v: 1.5 })).toEqual({ ok: false, reason: 'unsupported' });
  });

  it('accepte v0 (sans v), v1 et v2 en objet comme en texte', () => {
    const base = { players: makePlayers([1]) };
    expect(parseGame(base).ok).toBe(true);
    expect(parseGame({ ...base, v: 0 }).ok).toBe(true);
    expect(parseGame({ ...base, v: 1 }).ok).toBe(true);
    expect(parseGame({ ...base, v: 2 }).ok).toBe(true);
    expect(parseGame(JSON.stringify({ ...base, v: 2 })).ok).toBe(true);
  });

  it('parseGameOrNull donne la forme plate, ou null en cas d’échec', () => {
    const flat = parseGameOrNull(fixtureText('v0-advanced-4p'));
    expect(Object.keys(flat).sort()).toEqual(
      [
        'allowNeg',
        'log',
        'maxPoints',
        'numPlayers',
        'players',
        'seatOrder',
        'startPoints',
        'ts',
      ].sort(),
    );
    expect(flat.numPlayers).toBe(4);
    expect(flat.ts).toBe(fixture('v0-advanced-4p').ts);
    expect(parseGameOrNull(null)).toBeNull();
    expect(parseGameOrNull('{')).toBeNull();
    expect(parseGameOrNull({ v: 9, players: makePlayers([1]) })).toBeNull();
    expect(parseGameOrNull({ players: [] })).toBeNull();
  });
});

describe('parseGame : journal v2 assaini', () => {
  const players = makePlayers([10, 20, 30]);
  const save = (log, over = {}) => ({ v: 2, players, seatOrder: [0, 1, 2], log, ...over });

  it('journal absent ou mal formé → journal vide, partie conservée', () => {
    expect(parseGame(save(undefined)).game.log).toEqual(createLog());
    expect(parseGame(save('x')).game.log).toEqual(createLog());
    expect(parseGame(save({ entries: 'x' })).game.log).toEqual(createLog());
  });

  it('entrées invalides écartées, entrée rotate à sièges illisibles écartée elle aussi', () => {
    const entries = [
      { id: 1, t: 1, playerIdx: 0, delta: 1, from: 9, to: 10, via: 'tap', groupId: 1 },
      { id: 2, t: 2, playerIdx: 7, delta: 1, from: 0, to: 1, via: 'tap', groupId: 2 },
      { id: 3, t: 3, playerIdx: 1, delta: 0, from: 5, to: 5, via: 'keypad', groupId: 3 },
      { id: 4, t: 4, playerIdx: 1, from: 'a', to: 'b', via: 'rename', groupId: 4, closed: true },
      { id: 5, t: 5, playerIdx: 1, from: 1, to: 'b', via: 'rename', groupId: 5 },
      { id: 6, t: 6, playerIdx: -1, from: [0, 1, 2], to: [2, 0, 1], via: 'rotate', groupId: 6 },
      { id: 7, t: 7, playerIdx: -1, from: [0, 0, 0], to: [2, 0, 1], via: 'rotate', groupId: 7 },
      { id: 8, t: 8, playerIdx: -1, from: [0, 1], to: [1, 0], via: 'rotate', groupId: 8 },
      { id: 9, t: 9, playerIdx: 2, via: 'elim', groupId: 9, approx: true },
      { id: 9, t: 10, playerIdx: 2, via: 'unelim', groupId: 9 },
      { id: 'x', playerIdx: 2, via: 'unelim' },
      { id: 11, playerIdx: 2, via: 'teleport' },
      'pas un objet',
    ];
    const { game, repaired } = parseGame(save({ entries, cursor: 1 }, { seatOrder: [2, 0, 1] }));
    expect(repaired).toBe(true);
    // Deux entrées portant le même identifiant sont CONSERVÉES : la renumérotation lève le conflit
    // (une entrée lisible n'est jamais jetée pour un identifiant en double).
    expect(game.log.entries.map((e) => e.via)).toEqual([
      'tap',
      'rename',
      'rotate',
      'elim',
      'unelim',
    ]);
    expect(game.log.entries.map((e) => e.id)).toEqual([1, 2, 3, 4, 5]);
    expect(game.log.entries[1]).toMatchObject({ from: 'a', to: 'b', closed: true });
    expect(game.log.entries[2]).toMatchObject({ from: [0, 1, 2], to: [2, 0, 1] });
    expect(game.log.entries[3]).toMatchObject({ from: false, to: true, approx: true, delta: 0 });
  });

  it('une entrée illisible APRÈS le curseur ne touche ni à l’annulation ni au rétablissement', () => {
    const log = createLog();
    recordScore(log, 0, 10, 11, 'tap', 1);
    recordScore(log, 0, 11, 12, 'tap', 5000);
    recordScore(log, 0, 12, 13, 'tap', 10_000);
    undo(log); // curseur 2 : la 3e entrée est rétablissable
    const entries = [...log.entries.map((e) => ({ ...e }))];
    entries.splice(2, 0, 'illisible'); // déchet inséré après le curseur
    const { game, repaired } = parseGame(
      save({ entries, cursor: 2 }, { players: makePlayers([12, 20, 30]) }),
    );
    expect(repaired).toBe(true);
    expect(game.log.cursor).toBe(2);
    expect(game.log.floor).toBe(0);
    expect(canUndo(game.log)).toBe(true);
    expect(redo(game.log)).toMatchObject({ to: 13 });
  });

  it('une entrée illisible AVANT le curseur décale le curseur d’autant, sans sceller le journal', () => {
    const log = createLog();
    recordScore(log, 0, 10, 11, 'tap', 1);
    recordScore(log, 0, 11, 12, 'tap', 5000);
    const entries = [null, ...log.entries.map((e) => ({ ...e }))];
    const { game } = parseGame(
      save({ entries, cursor: 3 }, { players: makePlayers([12, 20, 30]) }),
    );
    expect(game.log.cursor).toBe(2);
    expect(game.log.floor).toBe(0);
    expect(canUndo(game.log)).toBe(true);
  });

  it('après relecture v2, un tap à moins de GROUP_DELAY du dernier tap ouvre une nouvelle action', () => {
    const log = createLog();
    recordScore(log, 0, 40, 41, 'tap', 1000);
    recordScore(log, 0, 41, 42, 'tap', 1200);
    const saved = serializeGame(
      { players: makePlayers([42]), seatOrder: [0], log, config: { startPoints: 40 } },
      1,
    );
    const { game } = parseGame(JSON.stringify(saved));
    expect(game.log.entries.at(-1).closed).toBe(true);
    recordScore(game.log, 0, 42, 43, 'tap', 1300);
    expect(groups(game.log).map((a) => a.count)).toEqual([2, 1]);
  });

  it('identifiants triés puis renumérotés : plus jamais de doublon après un record', () => {
    const entries = [
      { id: 3, t: 30, playerIdx: 0, from: 5, to: 10, via: 'keypad', groupId: 3 },
      { id: 2, t: 20, playerIdx: 1, from: 120, to: 20, via: 'keypad', groupId: 2 },
      { id: 2, t: 21, playerIdx: 1, from: 20, to: 21, via: 'tap', groupId: 2 },
    ];
    const { game } = parseGame(
      save({ entries, cursor: 3 }, { players: makePlayers([10, 21, 30]) }),
    );
    // Tri par identifiant croissant : les deux entrées id 2 (joueur 1) précèdent l'entrée id 3.
    expect(game.log.entries.map((e) => e.playerIdx)).toEqual([1, 1, 0]);
    const ids = game.log.entries.map((e) => e.id);
    expect(ids).toEqual([1, 2, 3]);
    expect(new Set(ids).size).toBe(ids.length);
    recordScore(game.log, 2, 30, 31, 'tap', 99);
    const after = game.log.entries.map((e) => e.id);
    expect(new Set(after).size).toBe(after.length);
    expect(after).toEqual([1, 2, 3, 4]);
    // Les entrées d'un même groupe restent groupées après renumérotation
    expect(groups(game.log).map((a) => a.count)).toEqual([2, 1, 1]);
  });

  it('curseur : borné, calé sur une frontière d’action, et « annuler puis rétablir » est neutre', () => {
    const log = createLog();
    recordScore(log, 0, 40, 41, 'tap', 10);
    recordScore(log, 0, 41, 42, 'tap', 20);
    recordScore(log, 0, 42, 43, 'tap', 30);
    for (const cursor of [0, 1, 2, 3, 99, -4, 'x']) {
      const applied = Math.max(0, Math.min(3, Number.isInteger(cursor) ? cursor : 3));
      const score = 40 + (applied === 0 ? 0 : 3);
      const res = parseGame({
        v: 2,
        players: makePlayers([applied === 0 ? 40 : 43]),
        seatOrder: [0],
        log: { entries: log.entries, cursor },
        config: { startPoints: 40 },
      });
      const parsed = res.game.log;
      // Le curseur tombe toujours sur une frontière : 0 ou la fin du groupe
      expect([0, 3]).toContain(parsed.cursor);
      const state = { players: res.game.players.map((p) => ({ ...p })), seatOrder: [0] };
      const before = state.players[0].score;
      expect(before).toBe(score);
      const u = undo(parsed);
      if (u) {
        applyEntry(state, u);
        const r = redo(parsed);
        expect(r).not.toBeNull();
        applyEntry(state, r);
      }
      expect(state.players[0].score).toBe(before);
    }
  });

  it('propriété : sur un curseur aléatoire, undo puis redo redonne l’état lu (graine fixe)', () => {
    const next = rng(7);
    for (let seed = 0; seed < 30; seed++) {
      const log = createLog();
      const scores = [40, 40];
      let t = 0;
      for (let k = 0; k < 12; k++) {
        const pi = randInt(next, 0, 1);
        const to = scores[pi] + (next() < 0.5 ? 1 : -1);
        t += next() < 0.6 ? 100 : 5000;
        recordScore(log, pi, scores[pi], to, 'tap', t);
        scores[pi] = to;
      }
      const cursor = randInt(next, 0, log.entries.length);
      // État réellement enregistré à ce curseur
      const state = { players: makePlayers([40, 40]), seatOrder: [0, 1] };
      log.entries.slice(0, cursor).forEach((e) => applyEntry(state, e));
      const saved = serializeGame(
        {
          players: state.players,
          seatOrder: [0, 1],
          log: { ...log, cursor },
          config: { startPoints: 40 },
        },
        1,
      );
      const { game } = parseGame(JSON.stringify(saved));
      const live = {
        players: game.players.map((p) => ({ ...p })),
        seatOrder: game.seatOrder.slice(),
      };
      const snapshot = JSON.stringify(live.players);
      const u = undo(game.log);
      if (u) {
        applyEntry(live, u);
        const r = redo(game.log);
        expect(r).not.toBeNull();
        applyEntry(live, r);
      }
      expect(JSON.stringify(live.players)).toBe(snapshot);
    }
  });

  it('delta est recalculé depuis from/to : une valeur enregistrée fausse ne fausse pas undo', () => {
    const entries = [
      { id: 1, t: 1, playerIdx: 0, delta: 999, from: 5, to: 10, via: 'keypad', groupId: 1 },
    ];
    const { game } = parseGame(
      save({ entries, cursor: 1 }, { players: makePlayers([10, 20, 30]) }),
    );
    expect(game.log.entries[0].delta).toBe(5);
    const state = { players: game.players.map((p) => ({ ...p })), seatOrder: [0, 1, 2] };
    applyEntry(state, undo(game.log));
    expect(state.players[0].score).toBe(5);
  });
});

describe('parseGame : champ cursor absent', () => {
  it('un journal sans champ cursor n’est pas une réparation : tout est appliqué', () => {
    const players = makePlayers([10, 20, 30]);
    const entries = [{ id: 1, t: 1, playerIdx: 0, from: 9, to: 10, via: 'tap' }];
    const res = parseGame({ v: 2, players, seatOrder: [0, 1, 2], log: { entries } });
    expect(res.game.log.cursor).toBe(1);
    expect(res.repaired).toBe(false);
    const bad = parseGame({ v: 2, players, seatOrder: [0, 1, 2], log: { entries, cursor: 'x' } });
    expect(bad.repaired).toBe(true);
    expect(bad.game.log.cursor).toBe(1);
  });
});

describe('parseGame : curseur et entrées illisibles', () => {
  const players3 = makePlayers([12, 20, 30]);
  it('entrée illisible AVANT le curseur ET rétablissement restant : les deux sont préservés', () => {
    const log = createLog();
    recordScore(log, 0, 10, 11, 'tap', 1);
    recordScore(log, 0, 11, 12, 'tap', 5000);
    recordScore(log, 0, 12, 13, 'tap', 10_000);
    undo(log); // curseur 2, la 3e entrée est rétablissable
    const entries = [null, ...log.entries.map((e) => ({ ...e }))];
    const { game, repaired } = parseGame({
      v: 2,
      players: players3,
      seatOrder: [0, 1, 2],
      log: { entries, cursor: 3 },
    });
    expect(repaired).toBe(true);
    expect(game.log.cursor).toBe(2);
    expect(game.log.floor).toBe(0);
    expect(canUndo(game.log)).toBe(true);
    expect(redo(game.log)).toMatchObject({ from: 12, to: 13 });
  });

  it('un curseur hors bornes est signalé comme réparation et ramené dans les bornes', () => {
    const entries = [
      { id: 1, t: 1, playerIdx: 0, from: 11, to: 12, via: 'tap' },
      { id: 2, t: 5000, playerIdx: 0, from: 12, to: 13, via: 'tap' },
    ];
    const base = { v: 2, players: players3, seatOrder: [0, 1, 2] };
    const tooFar = parseGame({
      ...base,
      players: makePlayers([13, 20, 30]),
      log: { entries, cursor: 99 },
    });
    expect(tooFar.repaired).toBe(true);
    expect(tooFar.game.log.cursor).toBe(2);
    const negative = parseGame({
      ...base,
      players: makePlayers([11, 20, 30]),
      log: { entries, cursor: -4 },
    });
    expect(negative.repaired).toBe(true);
    expect(negative.game.log.cursor).toBe(0);
    const exact = parseGame({
      ...base,
      players: makePlayers([13, 20, 30]),
      log: { entries, cursor: 2 },
    });
    expect(exact.repaired).toBe(false);
  });
});

describe('parseGame : cohérence journal ↔ scores', () => {
  it('un journal en désaccord avec les scores devient un historique inannulable', () => {
    const out = v2save();
    out.players[0].score = 1000; // score qui ne correspond à aucune entrée
    out.sum = undefined;
    delete out.sum;
    const { game, repaired } = parseGame(out);
    expect(repaired).toBe(true);
    expect(game.players[0].score).toBe(1000);
    expect(game.log.entries.length).toBeGreaterThan(0);
    expect(game.log.floor).toBe(game.log.cursor);
    expect(canUndo(game.log)).toBe(false);
    expect(undo(game.log)).toBeNull();
    // Les actions restent consultables, et une nouvelle action redevient annulable
    expect(groups(game.log).length).toBeGreaterThan(0);
    recordScore(game.log, 0, 1000, 1001, 'tap', 10_000);
    expect(canUndo(game.log)).toBe(true);
  });

  it('un ordre de sièges en désaccord avec la dernière rotation scelle aussi le journal', () => {
    const log = createLog();
    recordScore(log, 0, 40, 41, 'tap', 1);
    log.entries.push({
      id: 2,
      t: 2,
      playerIdx: -1,
      delta: 0,
      from: [0, 1],
      to: [1, 0],
      via: 'rotate',
      groupId: 2,
    });
    log.cursor = 2;
    const saved = serializeGame(
      { players: makePlayers([41, 40]), seatOrder: [0, 1], log, config: { startPoints: 40 } },
      1,
    );
    const { game, repaired } = parseGame(JSON.stringify(saved));
    expect(repaired).toBe(true);
    expect(canUndo(game.log)).toBe(false);
  });

  it('les entrées rétablissables d’un journal scellé sont abandonnées', () => {
    const log = createLog();
    recordScore(log, 0, 40, 41, 'tap', 1);
    recordScore(log, 0, 41, 42, 'keypad', 5000);
    log.cursor = 1;
    const saved = serializeGame(
      { players: makePlayers([99]), seatOrder: [0], log, config: { startPoints: 40 } },
      1,
    );
    const { game } = parseGame(JSON.stringify(saved));
    expect(game.log.entries).toHaveLength(1);
    expect(game.log.cursor).toBe(1);
    expect(game.log.floor).toBe(1);
  });

  it('une sauvegarde normale (écrite par l’app) n’est jamais scellée', () => {
    const { game } = parseGame(JSON.stringify(v2save()));
    expect(game.log.floor).toBe(0);
    expect(canUndo(game.log)).toBe(true);
  });
});

describe('réglages', () => {
  it('relit les réglages v0 et complète les valeurs manquantes', () => {
    expect(
      parseSettings({ theme: 'ldm', defPlayers: 6, defStart: 40, defMax: 40, defNeg: false }),
    ).toEqual({ theme: 'ldm', defPlayers: 6, defStart: 40, defMax: 40, defNeg: false });
    expect(parseSettings({})).toEqual({ ...DEFAULT_SETTINGS });
    expect(parseSettings(null)).toEqual({ ...DEFAULT_SETTINGS });
    expect(parseSettings('x')).toEqual({ ...DEFAULT_SETTINGS });
  });

  it('convertit les nombres écrits en chaîne au lieu de les écraser', () => {
    expect(parseSettings({ defStart: '40', defMax: '40', defPlayers: '6' })).toMatchObject({
      defStart: 40,
      defMax: 40,
      defPlayers: 6,
    });
    expect(parseSettings({ defStart: 'x', defMax: {}, defPlayers: [] })).toMatchObject({
      defStart: 0,
      defMax: 0,
      defPlayers: 0,
    });
  });

  it('borne defPlayers à 1..12 et refuse les valeurs négatives', () => {
    expect(parseSettings({ defPlayers: 99 }).defPlayers).toBe(0);
    expect(parseSettings({ defPlayers: 13 }).defPlayers).toBe(0);
    expect(parseSettings({ defPlayers: 12 }).defPlayers).toBe(12);
    expect(parseSettings({ defPlayers: 1 }).defPlayers).toBe(1);
    expect(parseSettings({ defPlayers: 0 }).defPlayers).toBe(0);
    expect(parseSettings({ defPlayers: -4 }).defPlayers).toBe(0);
  });

  it('defStart négatif revient à 0 (aucune sentinelle cachée)', () => {
    expect(parseSettings({ defStart: -5 }).defStart).toBe(0);
    expect(parseSettings({ defStart: -0.5 }).defStart).toBe(0);
    expect(parseSettings({ defStart: 0 }).defStart).toBe(0);
    expect(parseSettings({ defStart: 9999999 }).defStart).toBe(9999999);
    expect(parseSettings({ defMax: -1 }).defMax).toBe(0);
  });

  it('defNeg n’est vrai que pour une valeur réellement vraie', () => {
    expect(parseSettings({ defNeg: true }).defNeg).toBe(true);
    expect(parseSettings({ defNeg: 1 }).defNeg).toBe(true);
    expect(parseSettings({ defNeg: 'true' }).defNeg).toBe(true);
    expect(parseSettings({ defNeg: 'non' }).defNeg).toBe(false);
    expect(parseSettings({ defNeg: 'false' }).defNeg).toBe(false);
    expect(parseSettings({ defNeg: 0 }).defNeg).toBe(false);
  });

  it('sérialise en v1 en réutilisant exactement les mêmes règles', () => {
    expect(
      serializeSettings({ theme: 'sobre', defPlayers: 4, defStart: 0, defMax: 0, defNeg: true }),
    ).toEqual({ v: 1, theme: 'sobre', defPlayers: 4, defStart: 0, defMax: 0, defNeg: true });
    expect(serializeSettings({ theme: 3, defStart: NaN, defMax: '40' })).toEqual({
      v: 1,
      theme: 'cyber',
      defPlayers: 0,
      defStart: 0,
      defMax: 40,
      defNeg: false,
    });
  });
});

describe('profils', () => {
  it('relit un tableau v0 et un objet v1', () => {
    expect(parseProfiles(['Alice', 'Bob'])).toEqual(['Alice', 'Bob']);
    expect(parseProfiles({ v: 1, names: ['Alice'] })).toEqual(['Alice']);
    expect(parseProfiles(null)).toEqual([]);
    expect(parseProfiles({ v: 1 })).toEqual([]);
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
    expect(addProfiles(many, [])).toEqual(many);
  });
});

describe('cas limites de bout en bout', () => {
  it('12 joueurs, scores à 7 chiffres et négatifs survivent à un aller-retour v2', () => {
    const log = createLog();
    const scores = identity(12).map((i) => (i % 2 ? -1234567 + i : 9999999 - i));
    const players = makePlayers(scores);
    for (let i = 0; i < 12; i++) recordScore(log, i, 0, scores[i], 'keypad', i);
    const seatOrder = identity(12).reverse();
    const out = serializeGame({ players, seatOrder, log, config: { allowNeg: true } }, 5);
    const back = parseGame(JSON.stringify(out));
    expect(back.ok).toBe(true);
    expect(back.repaired).toBe(false);
    expect(back.game.players.map((p) => p.score)).toEqual(scores);
    expect(back.game.seatOrder).toEqual(seatOrder);
    expect(back.game.log.entries).toHaveLength(12);
    expect(back.game.config.allowNeg).toBe(true);
  });

  it('une sauvegarde v0 de 40 actions reste entièrement annulable après migration', () => {
    const history = Array.from({ length: 40 }, (_, i) => ({
      playerIdx: i % 2,
      who: '',
      entries: [{ delta: 1 }],
      open: false,
      rank: i + 1,
    }));
    const { game } = parseGame({ players: makePlayers([20, 20]), history, startPoints: 0 });
    let undone = 0;
    const g = { players: game.players.map((p) => ({ ...p })), seatOrder: [0, 1] };
    let e;
    while ((e = undo(game.log))) {
      applyEntry(g, e);
      undone++;
    }
    expect(undone).toBe(40);
    expect(g.players.map((p) => p.score)).toEqual([0, 0]);
  });
});
