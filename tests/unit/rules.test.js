import { describe, expect, it } from 'vitest';
import {
  applyDelta,
  clampScore,
  createPlayers,
  findWinner,
  isAtFloor,
  isMaxReached,
  needsElimination,
  ranking,
  scoreClass,
} from '../../js/core/rules.js';
import { makePlayers } from './helpers.js';

const p = (score, eliminated = false) => ({ playerName: '', score, eliminated });

describe('clampScore', () => {
  it('ne descend pas sous 0 sans scores négatifs', () => {
    expect(clampScore(-5, { allowNeg: false, maxPoints: Infinity })).toBe(0);
    expect(clampScore(0, { allowNeg: false })).toBe(0);
    expect(clampScore(-1, {})).toBe(0);
    expect(clampScore(-1)).toBe(0);
  });
  it('autorise les négatifs quand demandé', () => {
    expect(clampScore(-5, { allowNeg: true, maxPoints: Infinity })).toBe(-5);
    expect(clampScore(-1234567, { allowNeg: true })).toBe(-1234567);
  });
  it('respecte le plafond (Infinity et null = sans plafond)', () => {
    expect(clampScore(45, { allowNeg: false, maxPoints: 40 })).toBe(40);
    expect(clampScore(45, { allowNeg: false, maxPoints: Infinity })).toBe(45);
    expect(clampScore(45, { allowNeg: false, maxPoints: null })).toBe(45);
    expect(clampScore(40, { maxPoints: 40 })).toBe(40);
  });
  it('accepte les scores à 7 chiffres', () => {
    expect(clampScore(9999999, {})).toBe(9999999);
    expect(clampScore(9999999, { maxPoints: 1000000 })).toBe(1000000);
  });
});

describe('applyDelta', () => {
  it('renvoie le delta réellement appliqué', () => {
    expect(applyDelta(40, +1, { maxPoints: 40 })).toEqual({ newScore: 40, realDelta: 0 });
    expect(applyDelta(39, +5, { maxPoints: 40 })).toEqual({ newScore: 40, realDelta: 1 });
    expect(applyDelta(2, -5, { allowNeg: false })).toEqual({ newScore: 0, realDelta: -2 });
    expect(applyDelta(2, -5, { allowNeg: true })).toEqual({ newScore: -3, realDelta: -5 });
  });
  it('fonctionne sans configuration et avec de grands nombres', () => {
    expect(applyDelta(0, 1)).toEqual({ newScore: 1, realDelta: 1 });
    expect(applyDelta(1234567, 8765432, { allowNeg: true })).toEqual({
      newScore: 9999999,
      realDelta: 8765432,
    });
  });
});

describe('isAtFloor', () => {
  it('signale le plancher 0 uniquement sans négatifs', () => {
    expect(isAtFloor(0, { allowNeg: false })).toBe(true);
    expect(isAtFloor(1, { allowNeg: false })).toBe(false);
    expect(isAtFloor(0, { allowNeg: true })).toBe(false);
    expect(isAtFloor(0)).toBe(true);
  });
});

describe('isMaxReached', () => {
  it('vrai à partir du plafond fini', () => {
    expect(isMaxReached(40, 40)).toBe(true);
    expect(isMaxReached(41, 40)).toBe(true);
    expect(isMaxReached(39, 40)).toBe(false);
    expect(isMaxReached(9999999, 9999999)).toBe(true);
  });
  it('faux sans plafond (Infinity, null, undefined, 0, négatif)', () => {
    expect(isMaxReached(100, Infinity)).toBe(false);
    expect(isMaxReached(100, null)).toBe(false);
    expect(isMaxReached(100, undefined)).toBe(false);
    expect(isMaxReached(100, 0)).toBe(false);
    expect(isMaxReached(100, -5)).toBe(false);
    expect(isMaxReached(100, NaN)).toBe(false);
    expect(isMaxReached(100, '40')).toBe(false);
  });
});

describe('scoreClass', () => {
  it('avec points de départ : crit à 0, low sous 25 %', () => {
    expect(scoreClass(0, 40)).toBe('crit');
    expect(scoreClass(-3, 40)).toBe('crit');
    expect(scoreClass(10, 40)).toBe('low');
    expect(scoreClass(11, 40)).toBe('');
    expect(scoreClass(40, 40)).toBe('');
  });
  it('sans points de départ : crit seulement sous 0', () => {
    expect(scoreClass(0, 0)).toBe('');
    expect(scoreClass(-1, 0)).toBe('crit');
    expect(scoreClass(5, 0)).toBe('');
  });
  it('arrondit le seuil 25 % vers le bas', () => {
    expect(scoreClass(2, 11)).toBe('low');
    expect(scoreClass(3, 11)).toBe('');
  });
});

describe('needsElimination', () => {
  it('à 0, non éliminé, sans négatifs', () => {
    expect(needsElimination(p(0), { allowNeg: false })).toBe(true);
    expect(needsElimination(p(0, true), { allowNeg: false })).toBe(false);
    expect(needsElimination(p(0), { allowNeg: true })).toBe(false);
    expect(needsElimination(p(1), { allowNeg: false })).toBe(false);
    expect(needsElimination(p(-2))).toBe(true);
  });
});

describe('findWinner', () => {
  it("'last-alive' quand un seul joueur reste en lice (de 2 à 12 joueurs)", () => {
    for (let n = 2; n <= 12; n++) {
      const players = Array.from({ length: n }, (_, i) => p(i, i !== n - 1));
      expect(findWinner(players, { maxPoints: Infinity, allowNeg: false })).toMatchObject({
        index: n - 1,
        reason: 'last-alive',
      });
    }
  });
  it('null tant que deux joueurs ou plus sont en lice, ou si tous sont éliminés', () => {
    expect(findWinner([p(3), p(2), p(0, true)], { maxPoints: Infinity })).toBeNull();
    expect(findWinner([p(0, true), p(0, true)], {})).toBeNull();
    expect(findWinner([p(3), p(2)])).toBeNull();
  });
  it("à 1 joueur seul, jamais de vainqueur par 'last-alive'", () => {
    expect(findWinner([p(3)], { maxPoints: Infinity })).toBeNull();
    expect(findWinner([p(0, true)], {})).toBeNull();
  });
  it('sans startPoints, AUCUNE victoire par plafond (repli sûr du contrat)', () => {
    // Appel conforme à CONTRACTS.md, préréglage Loi du Milieu au lancement : 40/40/40, max 40.
    const ldm = [p(40), p(40), p(40)];
    expect(findWinner(ldm, { maxPoints: 40, allowNeg: false })).toBeNull();
    expect(findWinner(ldm, { maxPoints: 40 })).toBeNull();
    expect(findWinner(ldm, { maxPoints: 40, startPoints: undefined })).toBeNull();
    expect(findWinner(ldm, { maxPoints: 40, startPoints: 'x' })).toBeNull();
    expect(findWinner(ldm, { maxPoints: 40, startPoints: Infinity })).toBeNull();
    expect(findWinner([p(500), p(10)], { maxPoints: 500, allowNeg: true })).toBeNull();
    // Le même appel avec le point de départ réel décide correctement.
    expect(findWinner([p(500), p(10)], { maxPoints: 500, startPoints: 0 })).toEqual({
      index: 0,
      reason: 'max-reached',
    });
  });

  it("'max-reached' quand un joueur atteint un plafond fini supérieur au départ", () => {
    expect(findWinner([p(499), p(500)], { maxPoints: 500, startPoints: 0 })).toMatchObject({
      index: 1,
      reason: 'max-reached',
    });
    expect(findWinner([p(501)], { maxPoints: 500, startPoints: 0 })).toMatchObject({
      index: 0,
      reason: 'max-reached',
    });
    expect(findWinner([p(499), p(250)], { maxPoints: 500, startPoints: 0 })).toBeNull();
  });
  it('pas de victoire par plafond quand max = départ (butée, ex. Loi du Milieu) ou max < départ', () => {
    const players = [p(40), p(40), p(40)];
    expect(findWinner(players, { maxPoints: 40, startPoints: 40, allowNeg: false })).toBeNull();
    expect(findWinner(players, { maxPoints: 30, startPoints: 40 })).toBeNull();
  });
  it('pas de victoire par plafond sans plafond fini', () => {
    expect(findWinner([p(9999999), p(1)], { maxPoints: Infinity, startPoints: 0 })).toBeNull();
    expect(findWinner([p(9999999), p(1)], { maxPoints: null, startPoints: 0 })).toBeNull();
    expect(findWinner([p(9999999), p(1)])).toBeNull();
  });
  it('ignore un joueur éliminé même au-dessus du plafond', () => {
    expect(findWinner([p(600, true), p(10), p(20)], { maxPoints: 500, startPoints: 0 })).toBeNull();
  });
  it('départage : plus haut score, puis plus petit indice', () => {
    expect(findWinner([p(500), p(510), p(510)], { maxPoints: 500, startPoints: 0 })).toMatchObject({
      index: 1,
      reason: 'max-reached',
    });
    expect(findWinner([p(500), p(500)], { maxPoints: 500, startPoints: 0 })).toMatchObject({
      index: 0,
      reason: 'max-reached',
    });
  });
  it("'last-alive' prime sur 'max-reached'", () => {
    expect(findWinner([p(600), p(700, true)], { maxPoints: 500, startPoints: 0 })).toMatchObject({
      index: 0,
      reason: 'last-alive',
    });
  });
  it('tolère une liste vide ou invalide', () => {
    expect(findWinner([], { maxPoints: 10 })).toBeNull();
    expect(findWinner(null, {})).toBeNull();
    expect(findWinner(undefined)).toBeNull();
  });
});

describe('ranking', () => {
  it('trie par score décroissant avec ex æquo au même rang (1, 2, 2, 4) et écart au premier', () => {
    const rows = ranking(makePlayers([10, 30, 30, 5]));
    expect(rows.map((r) => [r.index, r.rank, r.gap])).toEqual([
      [1, 1, 0],
      [2, 1, 0],
      [0, 3, 20],
      [3, 4, 25],
    ]);
    expect(rows[0].score).toBe(30);
    expect(rows[0].eliminated).toBe(false);
  });
  it('place les éliminés en fin, eux aussi classés entre eux', () => {
    const players = makePlayers([50, 0, 3, 0]);
    players[1].eliminated = true;
    players[3].eliminated = true;
    const rows = ranking(players);
    expect(rows.map((r) => r.index)).toEqual([0, 2, 1, 3]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 3]);
    expect(rows.map((r) => r.gap)).toEqual([0, 47, 50, 50]);
    expect(rows[2].eliminated).toBe(true);
  });
  it("un éliminé mieux placé qu'un survivant passe quand même après lui", () => {
    const players = makePlayers([100, 1]);
    players[0].eliminated = true;
    expect(ranking(players).map((r) => r.index)).toEqual([1, 0]);
    expect(ranking(players)[1].gap).toBe(-99);
  });
  it('gère les scores négatifs, 7 chiffres, 1 joueur, 12 joueurs et une liste vide', () => {
    expect(ranking(makePlayers([-5, -1234567, 9999999])).map((r) => r.index)).toEqual([2, 0, 1]);
    expect(ranking(makePlayers([7]))).toMatchObject([{ index: 0, rank: 1, gap: 0 }]);
    const twelve = ranking(makePlayers(Array.from({ length: 12 }, (_, i) => 12 - i)));
    expect(twelve.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(twelve[11].gap).toBe(11);
    expect(ranking([])).toEqual([]);
  });
  it('tous ex æquo : tous premiers, écart nul, ordre des indices conservé', () => {
    const rows = ranking(makePlayers([40, 40, 40, 40]));
    expect(rows.map((r) => r.index)).toEqual([0, 1, 2, 3]);
    expect(rows.every((r) => r.rank === 1 && r.gap === 0)).toBe(true);
  });
  it('ne modifie pas la liste fournie', () => {
    const players = makePlayers([1, 2]);
    ranking(players);
    expect(players.map((x) => x.score)).toEqual([1, 2]);
  });
});

describe('createPlayers', () => {
  it('crée n joueurs au score de départ, prénoms nettoyés', () => {
    const players = createPlayers(3, [' Alice ', '', undefined], 40);
    expect(players).toEqual([
      { playerName: 'Alice', score: 40, eliminated: false },
      { playerName: '', score: 40, eliminated: false },
      { playerName: '', score: 40, eliminated: false },
    ]);
  });
  it('gère 1 et 12 joueurs, prénoms de 18 caractères et départ négatif', () => {
    expect(createPlayers(1, [], 0)).toHaveLength(1);
    expect(createPlayers(12, [], 100)).toHaveLength(12);
    const long = 'Anne-Charlotte Dup';
    expect(createPlayers(1, [long], -10)[0]).toEqual({
      playerName: long,
      score: -10,
      eliminated: false,
    });
  });
});
