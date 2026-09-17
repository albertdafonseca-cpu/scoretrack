import { describe, expect, it } from 'vitest';
import { applyEntry, createLog, recordScore, redo, undo } from '../../js/core/history.js';
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
import { fixture, fixtureText, identity, makePlayers } from './helpers.js';

// Gabarits RÉELS : écrits dans localStorage par l'ancien index.html (commit 3452b66) piloté dans
// Chromium (v0-*), et par le sérialiseur v1 du commit suivant (v1-save).
const LEGACY = ['v0-fresh-4p', 'v0-advanced-4p', 'v0-12p-neg', 'v0-solo', 'v1-save'];

/** Défait toutes les actions d'une partie parsée et renvoie les scores obtenus, puis les rétablit. */
function rewind(game) {
  const g = { players: game.players.map((p) => ({ ...p })), seatOrder: game.seatOrder.slice() };
  let e;
  while ((e = undo(game.log))) applyEntry(g, e);
  const initial = g.players.map((p) => p.score);
  while ((e = redo(game.log))) applyEntry(g, e);
  return { initial, final: g.players.map((p) => p.score) };
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
    const out = serializeGame({ players: makePlayers([1]), seatOrder: [0], log: createLog() }, 1);
    expect(verifyChecksum(out)).toBe(true);
    expect(verifyChecksum({ ...out, players: makePlayers([2]) })).toBe(false);
    expect(verifyChecksum({ ...out, sum: undefined })).toBe(true);
    expect(verifyChecksum(JSON.parse(JSON.stringify(out)))).toBe(true);
  });
});

describe('migration v0/v1 → v2 sur des sauvegardes réelles', () => {
  for (const name of LEGACY) {
    const raw = fixture(name);
    it(`${name} : lue sans perte (joueurs, sièges, configuration)`, () => {
      const res = parseGame(fixtureText(name));
      expect(res.ok).toBe(true);
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

    it(`${name} : le journal reconstitué contient un tap par delta et remonte au score de départ`, () => {
      const { game } = parseGame(raw);
      const deltas = raw.history.flatMap((g) => g.entries.map((e) => e.delta));
      expect(game.log.entries).toHaveLength(deltas.length);
      expect(game.log.cursor).toBe(deltas.length);
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

    it(`${name} : projection v1 (parseGameOrNull) équivalente à l'historique d'origine`, () => {
      const flat = parseGameOrNull(fixtureText(name));
      expect(flat.history).toEqual(
        raw.history.map((g) => ({ ...g, open: false })).sort((a, b) => b.rank - a.rank),
      );
      expect(flat.actionCounter).toBe(raw.history.length);
      expect(flat).toMatchObject({
        numPlayers: raw.numPlayers,
        startPoints: raw.startPoints,
        allowNeg: raw.allowNeg,
      });
      expect(flat.log.entries.length).toBe(raw.history.reduce((s, g) => s + g.entries.length, 0));
    });

    it(`${name} : aller-retour v2 stable (sérialiser puis relire)`, () => {
      const once = parseGame(raw).game;
      const text = JSON.stringify(serializeGame(once, 123));
      const twice = parseGame(text);
      expect(twice.ok).toBe(true);
      expect(twice.game).toEqual({ ...once, ts: 123 });
      expect(JSON.parse(text).v).toBe(2);
    });
  }

  it("un groupe encore ouvert dans l'ancienne sauvegarde est clos au chargement", () => {
    const { game } = parseGame(fixture('v0-advanced-4p'));
    const last = game.log.entries[game.log.entries.length - 1];
    expect(last).toMatchObject({ playerIdx: 3, via: 'tap', closed: true });
    // Un tap immédiat du même joueur ouvre une nouvelle action
    recordScore(game.log, 3, 38, 37, 'tap', last.t + 10);
    expect(game.log.entries[game.log.entries.length - 1].groupId).not.toBe(last.groupId);
  });

  it('12 joueurs, négatifs et 7 chiffres : deltas et moyens reconstitués', () => {
    const { game } = parseGame(fixture('v0-12p-neg'));
    expect(game.players[0].score).toBe(-1234567);
    expect(game.players[5].score).toBe(9999999);
    expect(game.log.entries.map((e) => e.via)).toEqual(['tap', 'tap', 'tap', 'keypad', 'keypad']);
    // L'ancienne app ne sauvegardait pas après une rotation : l'ordre des sièges du gabarit est
    // bien l'ordre initial, malgré les trois rotations effectuées avant l'enregistrement.
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

describe('sérialisation v2', () => {
  const v2state = () => {
    const log = createLog();
    recordScore(log, 0, 40, 41, 'tap', 10);
    recordScore(log, 1, 40, 30, 'keypad', 20);
    undo(log);
    return {
      players: makePlayers([41, 40], ['Alice', 'Bob']),
      seatOrder: [1, 0],
      log,
      config: { numPlayers: 2, startPoints: 40, maxPoints: Infinity, allowNeg: false },
    };
  };

  it('écrit { v: 2, players, seatOrder, log, config, ts, sum } avec maxPoints Infinity → null', () => {
    const out = serializeGame(v2state(), 999);
    expect(Object.keys(out)).toEqual(['v', 'players', 'seatOrder', 'log', 'config', 'ts', 'sum']);
    expect(out).toMatchObject({
      v: 2,
      seatOrder: [1, 0],
      config: { numPlayers: 2, startPoints: 40, maxPoints: null, allowNeg: false },
      ts: 999,
    });
    expect(out.log.cursor).toBe(1);
    expect(out.log.entries).toHaveLength(2);
    expect(out.sum).toMatch(/^[0-9a-f]{8}$/);
    expect(verifyChecksum(out)).toBe(true);
  });

  it('conserve le curseur (annulations rétablissables) à travers un aller-retour', () => {
    const back = parseGame(JSON.stringify(serializeGame(v2state(), 1))).game;
    expect(back.log.cursor).toBe(1);
    expect(redo(back.log)).toMatchObject({ playerIdx: 1, delta: -10 });
  });

  it('copie le journal (aucun partage de référence avec l’état)', () => {
    const state = v2state();
    const out = serializeGame(state, 1);
    expect(out.log.entries[0]).not.toBe(state.log.entries[0]);
    expect(out.log.entries).not.toBe(state.log.entries);
  });

  it("accepte l'état plat v1 de l'interface actuelle et en dérive le journal", () => {
    const out = serializeGame(
      {
        players: makePlayers([38, 40]),
        seatOrder: [0, 1],
        history: [
          { playerIdx: 0, who: 'J1', entries: [{ delta: -1 }, { delta: -1 }], open: true, rank: 1 },
        ],
        actionCounter: 1,
        numPlayers: 2,
        startPoints: 40,
        maxPoints: 40,
        allowNeg: false,
      },
      77,
    );
    expect(out.config).toEqual({ numPlayers: 2, startPoints: 40, maxPoints: 40, allowNeg: false });
    expect(out.log.entries.map((e) => [e.from, e.to, e.groupId, e.t])).toEqual([
      [40, 39, 1, 77],
      [39, 38, 1, 77],
    ]);
    const flat = parseGameOrNull(out);
    expect(flat.history).toEqual([
      { playerIdx: 0, who: 'J1', entries: [{ delta: -1 }, { delta: -1 }], open: false, rank: 1 },
    ]);
  });

  it('assainit joueurs, sièges et configuration douteux', () => {
    const out = serializeGame(
      {
        players: [{ playerName: 7, score: 'x', eliminated: 1 }],
        seatOrder: [4],
        log: { entries: [], cursor: 0 },
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

  it("'corrupt' pour un JSON tronqué, un type faux ou des joueurs illisibles", () => {
    expect(parseGame('{"players":[')).toEqual({ ok: false, reason: 'corrupt' });
    expect(parseGame('texte')).toEqual({ ok: false, reason: 'corrupt' });
    expect(parseGame('42')).toEqual({ ok: false, reason: 'corrupt' });
    expect(parseGame('[]')).toEqual({ ok: false, reason: 'corrupt' });
    expect(parseGame([])).toEqual({ ok: false, reason: 'corrupt' });
    expect(parseGame({})).toEqual({ ok: false, reason: 'corrupt' });
    expect(parseGame({ players: [] })).toEqual({ ok: false, reason: 'corrupt' });
    expect(parseGame({ players: 'x' })).toEqual({ ok: false, reason: 'corrupt' });
    expect(parseGame({ players: [{ playerName: 'x', score: 'NaN' }] })).toEqual({
      ok: false,
      reason: 'corrupt',
    });
    expect(parseGame({ players: [null] })).toEqual({ ok: false, reason: 'corrupt' });
    expect(parseGame({ v: 2, players: [{ score: Infinity }] })).toEqual({
      ok: false,
      reason: 'corrupt',
    });
  });

  it("'corrupt' quand la somme de contrôle ne correspond pas (altération, troncature « propre »)", () => {
    const out = serializeGame(
      { players: makePlayers([5, 6]), seatOrder: [0, 1], log: createLog() },
      1,
    );
    const tampered = JSON.parse(JSON.stringify(out));
    tampered.players[0].score = 500;
    expect(parseGame(tampered)).toEqual({ ok: false, reason: 'corrupt' });
    expect(parseGame({ ...out, sum: 'deadbeef' })).toEqual({ ok: false, reason: 'corrupt' });
    expect(parseGame(JSON.stringify(out)).ok).toBe(true);
  });

  it("toute troncature du texte JSON d'une sauvegarde v2 est détectée comme 'corrupt'", () => {
    const text = JSON.stringify(serializeGame(parseGame(fixture('v0-advanced-4p')).game, 1));
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

  it('parseGameOrNull renvoie null pour toute lecture en échec', () => {
    expect(parseGameOrNull(null)).toBeNull();
    expect(parseGameOrNull('{')).toBeNull();
    expect(parseGameOrNull({ v: 9, players: makePlayers([1]) })).toBeNull();
    expect(parseGameOrNull({ players: [] })).toBeNull();
  });
});

describe('parseGame : réparations sans perte (D5)', () => {
  const players = makePlayers([10, 20, 30]);

  it('répare un ordre de sièges incohérent (v0 comme v2)', () => {
    expect(parseGame({ players, seatOrder: [0, 0, 1] }).game.seatOrder).toEqual([0, 1, 2]);
    expect(parseGame({ players, seatOrder: [2, 1] }).game.seatOrder).toEqual([0, 1, 2]);
    expect(parseGame({ players, seatOrder: 'abc' }).game.seatOrder).toEqual([0, 1, 2]);
    expect(parseGame({ v: 2, players, seatOrder: [2, 0, 1] }).game.seatOrder).toEqual([2, 0, 1]);
  });

  it('écarte les groupes v0 invalides ou hors limites et garde les autres', () => {
    const { game } = parseGame({
      players,
      history: [
        null,
        { playerIdx: 9, entries: [{ delta: 1 }] },
        { playerIdx: 1, entries: [{ delta: 5 }], rank: 2 },
      ],
    });
    expect(game.log.entries).toHaveLength(1);
    expect(game.log.entries[0]).toMatchObject({ playerIdx: 1, from: 15, to: 20, via: 'keypad' });
  });

  it('journal v2 absent ou mal formé → journal vide, partie conservée', () => {
    expect(parseGame({ v: 2, players }).game.log).toEqual(createLog());
    expect(parseGame({ v: 2, players, log: 'x' }).game.log).toEqual(createLog());
    expect(parseGame({ v: 2, players, log: { entries: 'x' } }).game.log).toEqual(createLog());
  });

  it('journal v2 : entrées invalides écartées, curseur alors ramené à la fin', () => {
    const entries = [
      { id: 1, t: 1, playerIdx: 0, delta: 1, from: 9, to: 10, via: 'tap', groupId: 1 },
      { id: 2, t: 2, playerIdx: 7, delta: 1, from: 0, to: 1, via: 'tap', groupId: 2 },
      { id: 3, t: 3, playerIdx: 1, delta: 0, from: 5, to: 5, via: 'keypad', groupId: 3 },
      { id: 4, t: 4, playerIdx: 1, from: 'a', to: 'b', via: 'rename', groupId: 4, closed: true },
      { id: 5, t: 5, playerIdx: 1, from: 1, to: 'b', via: 'rename', groupId: 5 },
      { id: 6, t: 6, playerIdx: -1, from: [0, 1, 2], to: [2, 0, 1], via: 'rotate', groupId: 6 },
      { id: 7, t: 7, playerIdx: -1, from: [0, 1], to: [2, 0, 1], via: 'rotate', groupId: 7 },
      { id: 8, t: 8, playerIdx: 2, via: 'elim', groupId: 8, approx: true },
      { id: 8, t: 9, playerIdx: 2, via: 'unelim', groupId: 8 },
      { id: 'x', playerIdx: 2, via: 'unelim' },
      { id: 10, playerIdx: 2, via: 'teleport' },
      'pas un objet',
    ];
    const { game } = parseGame({ v: 2, players, log: { entries, cursor: 1 } });
    expect(game.log.entries.map((e) => e.id)).toEqual([1, 4, 6, 8]);
    expect(game.log.cursor).toBe(4);
    expect(game.log.entries[1]).toMatchObject({ via: 'rename', from: 'a', to: 'b', closed: true });
    expect(game.log.entries[2]).toMatchObject({ playerIdx: -1, from: [0, 1, 2], to: [2, 0, 1] });
    expect(game.log.entries[3]).toMatchObject({ from: false, to: true, approx: true, delta: 0 });
  });

  it('journal v2 sain : curseur conservé, borné aux limites, groupId par défaut = id', () => {
    const entries = [
      { id: 1, t: 1, playerIdx: 0, from: 9, to: 10, via: 'tap' },
      { id: 2, t: 2, playerIdx: 0, from: 10, to: 11, via: 'tap', groupId: 1 },
    ];
    expect(parseGame({ v: 2, players, log: { entries, cursor: 1 } }).game.log.cursor).toBe(1);
    expect(parseGame({ v: 2, players, log: { entries, cursor: 99 } }).game.log.cursor).toBe(2);
    expect(parseGame({ v: 2, players, log: { entries, cursor: -3 } }).game.log.cursor).toBe(0);
    expect(parseGame({ v: 2, players, log: { entries, cursor: 'x' } }).game.log.cursor).toBe(2);
    const { log } = parseGame({ v: 2, players, log: { entries } }).game;
    expect(log.entries.map((e) => e.groupId)).toEqual([1, 1]);
    expect(log.entries[0].delta).toBe(1);
    expect(log.entries[1].closed).toBe(true);
  });

  it('un rotate v2 avec un ordre de sièges incohérent est réparé', () => {
    const entries = [{ id: 1, t: 1, via: 'rotate', from: [0, 0, 0], to: [2, 1, 0] }];
    const { log } = parseGame({ v: 2, players, log: { entries } }).game;
    expect(log.entries[0]).toMatchObject({ from: [0, 1, 2], to: [2, 1, 0] });
  });

  it('configuration : maxPoints null/absent/invalide → Infinity, allowNeg booléen', () => {
    expect(parseGame({ players, maxPoints: 40 }).game.config.maxPoints).toBe(40);
    expect(parseGame({ players, maxPoints: null }).game.config.maxPoints).toBe(Infinity);
    expect(parseGame({ players }).game.config.maxPoints).toBe(Infinity);
    expect(parseGame({ players, maxPoints: 'x' }).game.config.maxPoints).toBe(Infinity);
    expect(
      parseGame({ v: 2, players, config: { maxPoints: 500, allowNeg: 1 } }).game.config,
    ).toEqual({ numPlayers: 3, startPoints: 0, maxPoints: 500, allowNeg: true });
    expect(parseGame({ v: 2, players, config: null }).game.config.numPlayers).toBe(3);
  });

  it('joueurs : prénom non textuel vidé, drapeau éliminé forcé en booléen, ts absent → 0', () => {
    const { game } = parseGame({ players: [{ playerName: 5, score: 3, eliminated: 'oui' }] });
    expect(game.players).toEqual([{ playerName: '', score: 3, eliminated: true }]);
    expect(game.ts).toBe(0);
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
    expect(parseSettings({ theme: '', defPlayers: '4', defMax: -1, defNeg: 1 })).toEqual({
      ...DEFAULT_SETTINGS,
      defNeg: true,
    });
  });
  it('sérialise en v1 (schéma inchangé) en assainissant les types', () => {
    expect(
      serializeSettings({ theme: 'sobre', defPlayers: 4, defStart: 0, defMax: 0, defNeg: true }),
    ).toEqual({ v: 1, theme: 'sobre', defPlayers: 4, defStart: 0, defMax: 0, defNeg: true });
    expect(serializeSettings({ theme: 3, defPlayers: 1.5, defStart: NaN })).toEqual({
      v: 1,
      theme: 'cyber',
      defPlayers: 0,
      defStart: 0,
      defMax: 0,
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
    const out = serializeGame(
      { players, seatOrder: identity(12).reverse(), log, config: { allowNeg: true } },
      5,
    );
    const back = parseGame(JSON.stringify(out));
    expect(back.ok).toBe(true);
    expect(back.game.players.map((p) => p.score)).toEqual(scores);
    expect(back.game.seatOrder).toEqual(identity(12).reverse());
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
