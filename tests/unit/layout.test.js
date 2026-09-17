import { describe, expect, it } from 'vitest';
import {
  BAR_H,
  HEADER_H,
  MAX_PLAYERS,
  computeFit,
  computeLayout,
  layoutStats,
  nameMaxLength,
  rotateSeats,
} from '../../js/core/layout.js';
import { identity, randInt, rng } from './helpers.js';

const ROTS = ['rot-0', 'rot-180', 'rot-l', 'rot-r'];
const byIndex = (placements, i) => placements.find((p) => p.i === i);

describe('computeLayout : propriétés pour n = 1..12', () => {
  for (let n = 1; n <= 12; n++) {
    const { cols, rows, placements } = computeLayout(n, identity(n));

    it(`${n} joueur(s) : chaque joueur placé exactement une fois, aucune cellule vide`, () => {
      expect(placements).toHaveLength(n);
      expect(placements.map((p) => p.i).sort((a, b) => a - b)).toEqual(identity(n));
      expect(placements.some((p) => p.i === -1)).toBe(false);
      placements.forEach((p) => expect(ROTS).toContain(p.rot));
    });

    it(`${n} joueur(s) : la grille ${cols}×${rows} est couverte exactement une fois`, () => {
      const grid = Array.from({ length: rows }, () => Array(cols).fill(0));
      placements.forEach(({ c, r, cs, rs }) => {
        expect(c).toBeGreaterThanOrEqual(1);
        expect(r).toBeGreaterThanOrEqual(1);
        expect(cs).toBeGreaterThanOrEqual(1);
        expect(rs).toBeGreaterThanOrEqual(1);
        expect(c + cs - 1).toBeLessThanOrEqual(cols);
        expect(r + rs - 1).toBeLessThanOrEqual(rows);
        for (let y = r - 1; y < r - 1 + rs; y++)
          for (let x = c - 1; x < c - 1 + cs; x++) grid[y][x]++;
      });
      expect(grid.flat().every((v) => v === 1)).toBe(true);
    });

    it(`${n} joueur(s) : aire vide ≤ 10 % (ici 0) et plus petite cellule ≥ 80 % de l'aire idéale`, () => {
      const s = layoutStats(n);
      expect(s.emptyArea).toBe(0);
      expect(s.emptyPct).toBeLessThanOrEqual(10);
      expect(s.minRatio).toBeGreaterThanOrEqual(0.8);
      expect(s.cells).toBe(n);
      expect(s.minCellArea).toBeLessThanOrEqual(s.maxCellArea);
      expect(s.idealArea).toBeCloseTo(1 / n);
    });

    it(`${n} joueur(s) : le joueur 1 touche le bas de l'écran`, () => {
      const j1 = byIndex(placements, 0);
      expect(j1.r + j1.rs - 1).toBe(rows);
      if (n !== 4 && n !== 6) expect(j1.rot).toBe('rot-0');
    });

    if (n >= 3) {
      it(`${n} joueur(s) : sens horaire — gauche de bas en haut, droite de haut en bas, latéraux tournés vers leur joueur`, () => {
        const left = placements.filter((p) => p.c === 1 && p.rot === 'rot-l');
        const right = placements.filter((p) => p.c === cols && p.rot === 'rot-r');
        expect(left.length).toBeGreaterThan(0);
        expect(right.length).toBe(left.length);
        const leftBottomUp = left.slice().sort((a, b) => b.r - a.r);
        const rightTopDown = right.slice().sort((a, b) => a.r - b.r);
        const seq = [...leftBottomUp.map((p) => p.i), ...rightTopDown.map((p) => p.i)];
        const expected = seq.slice().sort((a, b) => a - b);
        expect(seq).toEqual(expected);
        // Aucune carte latérale mal orientée
        expect(
          placements.filter((p) => p.c === 1 && p.cs === 1).every((p) => p.rot === 'rot-l'),
        ).toBe(true);
        expect(
          placements.filter((p) => p.c === cols && p.cs === 1).every((p) => p.rot === 'rot-r'),
        ).toBe(true);
      });
    }

    it(`${n} joueur(s) : les cartes du haut de table sont à 180° et touchent le haut`, () => {
      placements
        .filter((p) => p.rot === 'rot-180')
        .forEach((p) => {
          expect(p.r).toBe(1);
        });
      if (n === 2 || n >= 8) {
        if (n % 2 === 0) expect(placements.filter((p) => p.rot === 'rot-180')).toHaveLength(1);
      }
    });
  }
});

describe('computeLayout : dispositions particulières', () => {
  it('1 joueur : une carte pleine page', () => {
    expect(computeLayout(1, [0])).toEqual({
      cols: 1,
      rows: 1,
      placements: [{ i: 0, rot: 'rot-0', c: 1, r: 1, cs: 1, rs: 1 }],
    });
  });
  it('2 joueurs : face à face', () => {
    const { placements } = computeLayout(2, [0, 1]);
    expect(byIndex(placements, 1)).toMatchObject({ rot: 'rot-180', r: 1 });
    expect(byIndex(placements, 0)).toMatchObject({ rot: 'rot-0', r: 2 });
  });
  it('3 joueurs : J1 en bas pleine largeur, latéraux sur 2 lignes', () => {
    const { cols, rows, placements } = computeLayout(3, [0, 1, 2]);
    expect([cols, rows]).toEqual([2, 3]);
    expect(byIndex(placements, 0)).toMatchObject({ rot: 'rot-0', c: 1, r: 3, cs: 2, rs: 1 });
    expect(byIndex(placements, 1)).toMatchObject({ rot: 'rot-l', c: 1, r: 1, rs: 2 });
    expect(byIndex(placements, 2)).toMatchObject({ rot: 'rot-r', c: 2, r: 1, rs: 2 });
  });
  it('4 et 6 joueurs : deux colonnes latérales (disposition historique)', () => {
    const four = computeLayout(4, identity(4));
    expect([four.cols, four.rows]).toEqual([2, 2]);
    expect(byIndex(four.placements, 0)).toMatchObject({ rot: 'rot-l', c: 1, r: 2 });
    expect(byIndex(four.placements, 1)).toMatchObject({ rot: 'rot-l', c: 1, r: 1 });
    expect(byIndex(four.placements, 2)).toMatchObject({ rot: 'rot-r', c: 2, r: 1 });
    expect(byIndex(four.placements, 3)).toMatchObject({ rot: 'rot-r', c: 2, r: 2 });
    const six = computeLayout(6, identity(6));
    expect([six.cols, six.rows]).toEqual([2, 3]);
    expect(six.placements.map((p) => [p.i, p.c, p.r])).toEqual([
      [0, 1, 3],
      [1, 1, 2],
      [2, 1, 1],
      [3, 2, 1],
      [4, 2, 2],
      [5, 2, 3],
    ]);
  });
  it('5, 7, 9, 11 joueurs : bandeau J1 + (n−1)/2 latéraux par côté, sans colonne centrale vide', () => {
    for (const n of [5, 7, 9, 11]) {
      const { cols, rows, placements } = computeLayout(n, identity(n));
      const k = (n - 1) / 2;
      expect([cols, rows]).toEqual([2, k + 1]);
      expect(byIndex(placements, 0)).toMatchObject({ rot: 'rot-0', c: 1, r: k + 1, cs: 2, rs: 1 });
      expect(placements.filter((p) => p.rot === 'rot-l')).toHaveLength(k);
      expect(placements.filter((p) => p.rot === 'rot-r')).toHaveLength(k);
      expect(byIndex(placements, k)).toMatchObject({ rot: 'rot-l', r: 1 });
      expect(byIndex(placements, k + 1)).toMatchObject({ rot: 'rot-r', r: 1 });
    }
  });
  it('8, 10, 12 joueurs : trois colonnes, colonne centrale partagée J1 (bas) / vis-à-vis (haut)', () => {
    for (const n of [8, 10, 12]) {
      const { cols, rows, placements } = computeLayout(n, identity(n));
      const k = (n - 2) / 2;
      expect([cols, rows]).toEqual([3, k]);
      const j1 = byIndex(placements, 0);
      const top = byIndex(placements, k + 1);
      expect(top).toMatchObject({ rot: 'rot-180', c: 2, r: 1 });
      expect(j1).toMatchObject({ rot: 'rot-0', c: 2 });
      expect(top.rs + j1.rs).toBe(k);
      expect(j1.rs).toBeGreaterThanOrEqual(top.rs);
      expect(j1.r).toBe(top.rs + 1);
      expect(byIndex(placements, 1)).toMatchObject({ rot: 'rot-l', c: 1, r: k });
      expect(byIndex(placements, k)).toMatchObject({ rot: 'rot-l', c: 1, r: 1 });
      expect(byIndex(placements, k + 2)).toMatchObject({ rot: 'rot-r', c: 3, r: 1 });
      expect(byIndex(placements, n - 1)).toMatchObject({ rot: 'rot-r', c: 3, r: k });
    }
  });
  it('12 joueurs : la disposition est 3×5, J1 sur 3 lignes, vis-à-vis sur 2', () => {
    const { placements } = computeLayout(12, identity(12));
    expect(byIndex(placements, 0)).toMatchObject({ c: 2, r: 3, rs: 3 });
    expect(byIndex(placements, 6)).toMatchObject({ c: 2, r: 1, rs: 2 });
  });
});

describe('computeLayout : ordre des sièges', () => {
  it("respecte l'ordre des sièges", () => {
    const { placements } = computeLayout(4, [3, 2, 1, 0]);
    const bottomLeft = placements.find((p) => p.c === 1 && p.r === 2);
    expect(bottomLeft.i).toBe(3);
  });
  it("après rotation, chaque joueur reste placé une fois et le siège 0 accueille l'ancien dernier", () => {
    for (let n = 2; n <= 12; n++) {
      const seats = rotateSeats(identity(n));
      const { placements } = computeLayout(n, seats);
      expect(placements.map((p) => p.i).sort((a, b) => a - b)).toEqual(identity(n));
      const seat0 = computeLayout(n, identity(n)).placements.find((p) => p.i === 0);
      const nowAtSeat0 = placements.find((p) => p.c === seat0.c && p.r === seat0.r);
      expect(nowAtSeat0.i).toBe(n - 1);
    }
  });
  it('permutations aléatoires (graine fixe) : bijection joueurs ↔ cellules', () => {
    const next = rng(42);
    for (let k = 0; k < 50; k++) {
      const n = randInt(next, 1, 12);
      const seats = identity(n);
      for (let i = n - 1; i > 0; i--) {
        const j = randInt(next, 0, i);
        [seats[i], seats[j]] = [seats[j], seats[i]];
      }
      const { placements } = computeLayout(n, seats);
      expect(placements.map((p) => p.i).sort((a, b) => a - b)).toEqual(identity(n));
      placements.forEach((p, idx) => expect(p.i).toBe(seats[idx]));
    }
  });
  it("retombe sur 1 carte pour un nombre inconnu et n'explose pas sans ordre de sièges", () => {
    expect(computeLayout(0, [])).toMatchObject({ cols: 1, rows: 1 });
    expect(computeLayout(13, identity(13)).placements).toHaveLength(1);
    expect(computeLayout('x', []).placements[0].i).toBe(0);
    expect(computeLayout(3, []).placements.map((p) => p.i)).toEqual([0, 1, 2]);
    expect(MAX_PLAYERS).toBe(12);
  });
});

describe('layoutStats', () => {
  it('fournit les mesures en pixels pour un écran donné', () => {
    const s = layoutStats(12, { width: 390, height: 844 });
    expect(s).toMatchObject({ n: 12, cols: 3, rows: 5, cells: 12, emptyPct: 0 });
    expect(s.minCellPx).toEqual({ w: 130, h: 146 });
    expect(s.minRef).toBe(130);
    expect(layoutStats(1, { width: 390, height: 844 }).minCellPx).toEqual({
      w: 390,
      h: 844 - HEADER_H - BAR_H,
    });
  });
  it('ne fournit pas de mesures pixels sans écran', () => {
    expect(layoutStats(4).minCellPx).toBeUndefined();
    expect(layoutStats(4).minRatio).toBe(1);
  });
  it('les nouvelles dispositions 7, 9, 11, 12 ne perdent plus 20 % de surface', () => {
    expect([7, 9, 11, 12].map((n) => layoutStats(n).emptyPct)).toEqual([0, 0, 0, 0]);
  });
});

describe('rotateSeats', () => {
  it('fait passer le dernier siège en tête, en place', () => {
    const seats = [0, 1, 2, 3];
    expect(rotateSeats(seats)).toBe(seats);
    expect(seats).toEqual([3, 0, 1, 2]);
    expect(rotateSeats([0])).toEqual([0]);
    expect(rotateSeats([])).toEqual([]);
  });
  it('n rotations reviennent au départ', () => {
    for (let n = 1; n <= 12; n++) {
      const seats = identity(n);
      for (let k = 0; k < n; k++) rotateSeats(seats);
      expect(seats).toEqual(identity(n));
    }
  });
});

describe('nameMaxLength', () => {
  it("reste borné entre 3 et 18 quel que soit l'écran et le nombre de joueurs", () => {
    expect(HEADER_H).toBe(44);
    expect(BAR_H).toBe(68);
    for (let n = 1; n <= 12; n++) {
      for (const [w, h] of [
        [320, 568],
        [390, 844],
        [1024, 1366],
        [100, 200],
      ]) {
        const len = nameMaxLength(n, w, h);
        expect(len).toBeGreaterThanOrEqual(3);
        expect(len).toBeLessThanOrEqual(18);
      }
    }
  });
  it('vaut 12 sur iPhone 13 (formule invariante d’échelle : 1/(0,13·0,62) ≈ 12,4)', () => {
    for (let n = 1; n <= 12; n++) expect(nameMaxLength(n, 390, 844)).toBe(12);
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
  it('réduit la taille quand le score a plus de chiffres (monotone)', () => {
    const sizes = ['4', '40', '400', '4000', '40 000', '400 000', '4 000 000'].map(
      (s) => computeFit(300, 180, s).scoreSz,
    );
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeLessThanOrEqual(sizes[i - 1]);
    expect(sizes[0]).toBe(sizes[1]);
  });
  it('ne descend jamais sous les minimums', () => {
    expect(computeFit(12, 12, '9999999')).toMatchObject({
      scoreSz: 12,
      signSz: 10,
      nameSz: 8,
      ghostH: 8,
    });
    expect(computeFit(0, 0, '').scoreSz).toBe(12);
  });
  it('plafonne le score à 180 px sur les très grandes cartes', () => {
    expect(computeFit(2000, 2000, '1').scoreSz).toBe(180);
    expect(computeFit(2000, 2000, '1').nameSz).toBe(32);
  });
});
