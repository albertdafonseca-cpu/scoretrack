import { describe, expect, it } from 'vitest';
import {
  applyDelta,
  clampScore,
  createPlayers,
  findWinner,
  isAtFloor,
  needsElimination,
  scoreClass,
} from '../../js/core/rules.js';

describe('clampScore', () => {
  it('ne descend pas sous 0 sans scores négatifs', () => {
    expect(clampScore(-5, { allowNeg: false, maxPoints: Infinity })).toBe(0);
    expect(clampScore(0, { allowNeg: false })).toBe(0);
  });
  it('autorise les négatifs quand demandé', () => {
    expect(clampScore(-5, { allowNeg: true, maxPoints: Infinity })).toBe(-5);
    expect(clampScore(-1234567, { allowNeg: true })).toBe(-1234567);
  });
  it('respecte le plafond', () => {
    expect(clampScore(45, { allowNeg: false, maxPoints: 40 })).toBe(40);
    expect(clampScore(45, { allowNeg: false, maxPoints: Infinity })).toBe(45);
    expect(clampScore(45, { allowNeg: false, maxPoints: null })).toBe(45);
  });
  it('accepte les scores à 7 chiffres', () => {
    expect(clampScore(9999999, {})).toBe(9999999);
  });
});

describe('applyDelta', () => {
  it('renvoie le delta réellement appliqué', () => {
    expect(applyDelta(40, +1, { maxPoints: 40 })).toEqual({ newScore: 40, realDelta: 0 });
    expect(applyDelta(39, +5, { maxPoints: 40 })).toEqual({ newScore: 40, realDelta: 1 });
    expect(applyDelta(2, -5, { allowNeg: false })).toEqual({ newScore: 0, realDelta: -2 });
    expect(applyDelta(2, -5, { allowNeg: true })).toEqual({ newScore: -3, realDelta: -5 });
  });
});

describe('isAtFloor', () => {
  it('signale le plancher 0 uniquement sans négatifs', () => {
    expect(isAtFloor(0, { allowNeg: false })).toBe(true);
    expect(isAtFloor(1, { allowNeg: false })).toBe(false);
    expect(isAtFloor(0, { allowNeg: true })).toBe(false);
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

describe('élimination et vainqueur', () => {
  const p = (score, eliminated = false) => ({ playerName: '', score, eliminated });
  it('needsElimination : à 0, non éliminé, sans négatifs', () => {
    expect(needsElimination(p(0), { allowNeg: false })).toBe(true);
    expect(needsElimination(p(0, true), { allowNeg: false })).toBe(false);
    expect(needsElimination(p(0), { allowNeg: true })).toBe(false);
    expect(needsElimination(p(1), { allowNeg: false })).toBe(false);
  });
  it('findWinner : uniquement quand il reste un seul survivant', () => {
    expect(findWinner([p(3), p(0, true), p(0, true)])).toEqual(p(3));
    expect(findWinner([p(3), p(2), p(0, true)])).toBeNull();
    expect(findWinner([p(0, true)])).toBeNull();
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
  it('gère 1 et 12 joueurs', () => {
    expect(createPlayers(1, [], 0)).toHaveLength(1);
    expect(createPlayers(12, [], 100)).toHaveLength(12);
  });
});
