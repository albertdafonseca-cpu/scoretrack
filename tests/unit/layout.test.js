import { describe, expect, it } from 'vitest';
import {
  BAR_H,
  HEADER_H,
  computeFit,
  computeLayout,
  nameMaxLength,
  rotateSeats,
} from '../../js/core/layout.js';

const identity = (n) => Array.from({ length: n }, (_, i) => i);

describe('computeLayout', () => {
  for (let n = 1; n <= 12; n++) {
    it(`${n} joueur(s) : chacun placé une fois, grille cohérente`, () => {
      const { cols, rows, placements } = computeLayout(n, identity(n));
      const seated = placements.filter((p) => p.i !== -1);
      const empties = placements.filter((p) => p.i === -1);
      expect(seated.map((p) => p.i).sort((a, b) => a - b)).toEqual(identity(n));
      seated.forEach((p) => expect(['rot-0', 'rot-180', 'rot-l', 'rot-r']).toContain(p.rot));
      empties.forEach((p) => expect(p.rot).toBeUndefined());

      // Chaque cellule de la grille est couverte exactement une fois
      const grid = Array.from({ length: rows }, () => Array(cols).fill(0));
      placements.forEach(({ c, r, cs, rs }) => {
        expect(c).toBeGreaterThanOrEqual(1);
        expect(r).toBeGreaterThanOrEqual(1);
        expect(c + cs - 1).toBeLessThanOrEqual(cols);
        expect(r + rs - 1).toBeLessThanOrEqual(rows);
        for (let y = r - 1; y < r - 1 + rs; y++)
          for (let x = c - 1; x < c - 1 + cs; x++) grid[y][x]++;
      });
      expect(grid.flat().every((v) => v === 1)).toBe(true);
    });
  }

  it("respecte l'ordre des sièges", () => {
    const { placements } = computeLayout(4, [3, 2, 1, 0]);
    // siège 0 = bas-gauche (col 1, ligne 2) → joueur 3
    const bottomLeft = placements.find((p) => p.c === 1 && p.r === 2);
    expect(bottomLeft.i).toBe(3);
  });

  it('disposition 2 joueurs : face à face', () => {
    const { placements } = computeLayout(2, [0, 1]);
    expect(placements.find((p) => p.i === 1).rot).toBe('rot-180');
    expect(placements.find((p) => p.i === 0).rot).toBe('rot-0');
  });

  it('disposition 3 joueurs : J1 en bas pleine largeur', () => {
    const { cols, placements } = computeLayout(3, [0, 1, 2]);
    const j1 = placements.find((p) => p.i === 0);
    expect(j1).toMatchObject({ rot: 'rot-0', c: 1, r: 3, cs: cols, rs: 1 });
  });

  it('cellules vides uniquement au centre pour 7, 9, 11 et 12 joueurs', () => {
    expect(computeLayout(7, identity(7)).placements.filter((p) => p.i === -1)).toHaveLength(2);
    expect(computeLayout(8, identity(8)).placements.filter((p) => p.i === -1)).toHaveLength(1);
    expect(computeLayout(12, identity(12)).placements.filter((p) => p.i === -1)).toHaveLength(3);
    expect(computeLayout(6, identity(6)).placements.filter((p) => p.i === -1)).toHaveLength(0);
  });

  it('retombe sur 1 carte pour un nombre inconnu', () => {
    expect(computeLayout(0, [])).toMatchObject({ cols: 1, rows: 1 });
  });
});

describe('rotateSeats', () => {
  it('fait passer le dernier siège en tête', () => {
    expect(rotateSeats([0, 1, 2, 3])).toEqual([3, 0, 1, 2]);
    expect(rotateSeats([0])).toEqual([0]);
  });
});

describe('nameMaxLength', () => {
  it("reste borné entre 3 et 18 quel que soit l'écran", () => {
    expect(HEADER_H).toBe(44);
    expect(BAR_H).toBe(68);
    for (const n of [1, 2, 3, 4, 6, 7, 12]) {
      for (const [w, h] of [
        [320, 568],
        [390, 844],
        [1024, 1366],
      ]) {
        const len = nameMaxLength(n, w, h);
        expect(len).toBeGreaterThanOrEqual(3);
        expect(len).toBeLessThanOrEqual(18);
      }
    }
  });
  it('vaut 12 sur iPhone 13 pour 4 joueurs (valeur historique)', () => {
    // La formule est invariante d'échelle (largeur de glyphe proportionnelle à la carte) : 1/(0.13·0.62) ≈ 12,4.
    expect(nameMaxLength(4, 390, 844)).toBe(12);
    expect(nameMaxLength(1, 390, 844)).toBe(12);
  });
});

describe('computeFit', () => {
  it('produit des tailles bornées et cohérentes', () => {
    const f = computeFit(300, 180, '40');
    expect(f.scoreSz).toBeGreaterThanOrEqual(12);
    expect(f.scoreSz).toBeLessThanOrEqual(180);
    expect(f.nameSz).toBeLessThanOrEqual(32);
    expect(f.signSz).toBeGreaterThanOrEqual(10);
    expect(f.ghostH).toBe(Math.max(8, f.nameSz));
    expect(f.deltaSz).toBeCloseTo(Math.max(8, f.scoreSz * 0.42));
  });
  it('réduit la taille quand le score a plus de chiffres', () => {
    expect(computeFit(300, 180, '1 234 567').scoreSz).toBeLessThan(
      computeFit(300, 180, '40').scoreSz,
    );
  });
  it('ne descend jamais sous les minimums', () => {
    expect(computeFit(12, 12, '9999999')).toMatchObject({
      scoreSz: 12,
      signSz: 10,
      nameSz: 8,
      ghostH: 8,
    });
  });
});
