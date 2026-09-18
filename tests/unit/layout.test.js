import { describe, expect, it } from 'vitest';
import {
  BAR_H,
  HEADER_H,
  MAX_NAME_PX,
  MAX_PLAYERS,
  MAX_SCORE_PX,
  MIN_NAME_PX,
  MIN_SCORE_PX,
  CAP_RATIO,
  LINE_GAP,
  READABLE_CAP_PX,
  cardBox,
  scoreRows,
  scoreWidth,
  computeFit,
  computeLayout,
  layoutStats,
  nameMaxLength,
  rotateSeats,
} from '../../js/core/layout.js';
import { fmtNum } from '../../js/core/format.js';
import { identity, randInt, rng } from './helpers.js';

const ROTS = ['rot-0', 'rot-180', 'rot-l', 'rot-r'];
const byIndex = (placements, i) => placements.find((p) => p.i === i);
/** iPhone 13 — l'écran de référence du projet (tests e2e et captures). */
const VP = { width: 390, height: 844 };

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

    it(`${n} joueur(s) : aire vide nulle et plus petite cellule ≥ 75 % de l'aire idéale`, () => {
      const s = layoutStats(n);
      expect(s.emptyArea).toBe(0);
      expect(s.emptyPct).toBe(0);
      expect(s.minRatio).toBeGreaterThanOrEqual(0.75);
      expect(s.cells).toBe(n);
    });

    it(`${n} joueur(s) : le joueur 1 touche le bas de l'écran`, () => {
      const j1 = byIndex(placements, 0);
      expect(j1.r + j1.rs - 1).toBe(rows);
      // À 4 et 6 joueurs, deux joueurs par grand côté : le joueur 1 est latéral (arbitrage documenté).
      expect(j1.rot).toBe(n === 4 || n === 6 ? 'rot-l' : 'rot-0');
    });

    if (n >= 3) {
      it(`${n} joueur(s) : sens horaire — gauche de bas en haut, droite de haut en bas`, () => {
        const left = placements.filter((p) => p.c === 1 && p.rot === 'rot-l');
        const right = placements.filter((p) => p.c === cols && p.rot === 'rot-r');
        expect(left.length).toBeGreaterThan(0);
        expect(right.length).toBe(left.length);
        const leftBottomUp = left.slice().sort((a, b) => b.r - a.r);
        const rightTopDown = right.slice().sort((a, b) => a.r - b.r);
        const seq = [...leftBottomUp.map((p) => p.i), ...rightTopDown.map((p) => p.i)];
        expect(seq).toEqual(seq.slice().sort((a, b) => a - b));
        expect(
          placements.filter((p) => p.c === 1 && p.cs === 1).every((p) => p.rot === 'rot-l'),
        ).toBe(true);
        expect(
          placements.filter((p) => p.c === cols && p.cs === 1).every((p) => p.rot === 'rot-r'),
        ).toBe(true);
      });
    }

    it(`${n} joueur(s) : les cartes du haut de table sont à 180° et touchent le haut`, () => {
      const top = placements.filter((p) => p.rot === 'rot-180');
      top.forEach((p) => expect(p.r).toBe(1));
      // Une carte « haut de table » n'existe qu'à 2 joueurs et dans les grilles à 3 colonnes (8, 10, 12).
      expect(top.length).toBe(n === 2 || (n >= 8 && n % 2 === 0) ? 1 : 0);
    });
  }

  it('table de référence des 12 dispositions (verrou de non-régression)', () => {
    const table = {};
    for (let n = 1; n <= 12; n++) {
      const s = layoutStats(n, VP);
      table[n] = `${s.cols}x${s.rows} vide=${s.emptyPct}% min=${s.minRatio.toFixed(3)}`;
    }
    expect(table).toEqual({
      1: '1x1 vide=0% min=1.000',
      2: '1x2 vide=0% min=1.000',
      3: '2x3 vide=0% min=1.000',
      4: '2x2 vide=0% min=1.000',
      5: '2x3 vide=0% min=0.833',
      6: '2x3 vide=0% min=1.000',
      7: '2x4 vide=0% min=0.875',
      8: '3x3 vide=0% min=0.889',
      9: '2x5 vide=0% min=0.900',
      10: '3x4 vide=0% min=0.833',
      11: '2x6 vide=0% min=0.917',
      12: '3x5 vide=0% min=0.800',
    });
  });
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
  it('4 et 6 joueurs : deux colonnes latérales (deux joueurs par grand côté)', () => {
    const four = computeLayout(4, identity(4));
    expect([four.cols, four.rows]).toEqual([2, 2]);
    expect(four.placements.map((p) => [p.i, p.c, p.r])).toEqual([
      [0, 1, 2],
      [1, 1, 1],
      [2, 2, 1],
      [3, 2, 2],
    ]);
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
  it('arbitrage n = 6 : deux colonnes donnent un score nettement plus grand que trois', () => {
    const two = layoutStats(6, VP);
    const three = { w: (VP.width / 3) * 1, h: (VP.height - HEADER_H - BAR_H) / 2 };
    const scoreTwo = computeFit(two.minCard, '40').scoreSz;
    const scoreThree = computeFit({ w: three.h, h: three.w }, '40').scoreSz;
    expect(scoreTwo).toBeGreaterThan(scoreThree * 1.4);
  });
  it('5, 7, 9, 11 joueurs : bandeau J1 + (n−1)/2 latéraux par côté', () => {
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
  it('8, 10, 12 joueurs : trois colonnes, colonne centrale partagée J1 / vis-à-vis', () => {
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

describe('cardBox et layoutStats', () => {
  it('échange largeur et hauteur pour une carte latérale', () => {
    const grid = { cols: 3, rows: 5, ...VP };
    const upright = cardBox({ rot: 'rot-0', cs: 1, rs: 3 }, grid);
    const lateral = cardBox({ rot: 'rot-l', cs: 1, rs: 1 }, grid);
    expect(upright.w).toBeCloseTo(130);
    expect(upright.h).toBeCloseTo((844 - HEADER_H - BAR_H) * (3 / 5));
    expect(lateral.w).toBeCloseTo((844 - HEADER_H - BAR_H) / 5);
    expect(lateral.h).toBeCloseTo(130);
  });
  it('fournit les mesures en pixels et le repère de la carte la plus contrainte', () => {
    const s = layoutStats(12, VP);
    expect(s).toMatchObject({ n: 12, cols: 3, rows: 5, cells: 12, emptyPct: 0 });
    expect(s.minCellPx).toEqual({ w: 130, h: 146 });
    expect(s.minRef).toBe(130);
    expect(s.minCard.w).toBeCloseTo(146.4);
    expect(s.minCard.h).toBeCloseTo(130);
    expect(layoutStats(1, VP).minCard).toEqual({ w: 390, h: 844 - HEADER_H - BAR_H });
  });
  it('ne fournit pas de mesures pixels sans écran', () => {
    expect(layoutStats(4).minCellPx).toBeUndefined();
    expect(layoutStats(4).minCard).toBeUndefined();
    expect(layoutStats(4).minRatio).toBe(1);
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

describe('computeFit : seuils de lisibilité de la grille', () => {
  it('score ≥ 96 px à 4 joueurs et ≥ 30 px à 12 joueurs, 7 chiffres compris (390×844)', () => {
    const four = computeFit(layoutStats(4, VP).minCard, '40');
    expect(four.scoreSz).toBeGreaterThanOrEqual(96);
    const twelve = computeFit(layoutStats(12, VP).minCard, fmtNum(9999999));
    expect(twelve.scoreSz * CAP_RATIO).toBeGreaterThanOrEqual(READABLE_CAP_PX);
    expect(twelve.lines).toBe(2);
    expect(twelve.compact).toBe(false);
    expect(computeFit(layoutStats(12, VP).minCard, '40').scoreSz).toBeGreaterThanOrEqual(30);
  });

  it('un score court occupe vraiment la hauteur de sa carte (le score est l’élément héros)', () => {
    // La largeur n'étant pas la contrainte sur une carte large, le chiffre doit remplir la hauteur.
    for (const n of [1, 2, 3, 4, 5, 6]) {
      const { minCard } = layoutStats(n, VP);
      const fit = computeFit(minCard, '40');
      expect(fit.scoreSz).toBeGreaterThanOrEqual(Math.min(MAX_SCORE_PX, minCard.h * 0.65));
    }
  });

  it('1 à 12 joueurs × 1 à 7 chiffres : le rendu tient dans la carte ET la taille est maximale', () => {
    for (let n = 1; n <= 12; n++) {
      const { minCard } = layoutStats(n, VP);
      const scoreH = minCard.h * 0.88 - computeFit(minCard, '0').nameSz * 1.2;
      for (let d = 1; d <= 7; d++) {
        const text = fmtNum(Number('9'.repeat(d)));
        const fit = computeFit(minCard, text);
        const rows = scoreRows(fit.compact ? text.replace(/\D/g, '') : text, fit.lines);
        const label = `n=${n} ${d} chiffres`;
        expect(`${label} lignes=${rows.length}`).toBe(`${label} lignes=${fit.lines}`);

        // 1. Ça tient : largeur de la ligne la plus longue et hauteur totale.
        const widest = Math.max(...rows.map((r) => scoreWidth(r, fit.scoreSz)));
        expect(`${label} largeur`).toBe(
          widest <= minCard.w * 0.9 + 0.01 ? `${label} largeur` : label,
        );
        const usedH = fit.scoreSz * (fit.lines === 1 ? 1 : fit.lines * LINE_GAP);
        expect(`${label} hauteur`).toBe(usedH <= scoreH + 0.01 ? `${label} hauteur` : label);

        // 2. C'est maximal : 5 % de plus déborderait (sauf si le plafond absolu est atteint).
        if (fit.scoreSz < MAX_SCORE_PX - 0.01) {
          const bigger = fit.scoreSz * 1.05;
          const overflowsW = Math.max(...rows.map((r) => scoreWidth(r, bigger))) > minCard.w * 0.9;
          const overflowsH = bigger * (fit.lines === 1 ? 1 : fit.lines * LINE_GAP) > scoreH;
          expect(`${label} maximal`).toBe(overflowsW || overflowsH ? `${label} maximal` : label);
        }
      }
    }
  });

  it('deux lignes seulement en cas de gain réel, et jamais sans point de coupure', () => {
    for (let n = 1; n <= 12; n++) {
      const { minCard } = layoutStats(n, VP);
      for (let d = 1; d <= 7; d++) {
        const text = fmtNum(Number('9'.repeat(d)));
        const fit = computeFit(minCard, text);
        const label = `n=${n} ${d} chiffres`;
        if (d <= 3) {
          // Moins de deux groupes de milliers : aucune coupure possible.
          expect(`${label} lignes=${fit.lines}`).toBe(`${label} lignes=1`);
          expect(scoreRows(text, 2)).toHaveLength(1);
        }
        if (fit.lines === 2) {
          // Le gain doit être significatif : au moins 5 % de plus qu'une seule ligne.
          const oneLine = Math.min(
            minCard.h * 0.88 - fit.nameSz * 1.2,
            (minCard.w * 0.9) / (scoreWidth(text, 1) || 1),
          );
          expect(`${label} gain`).toBe(
            fit.scoreSz > oneLine * 1.05 ? `${label} gain` : `${label} sans gain`,
          );
        }
      }
    }
  });

  it('à 12 joueurs, 30 px de capitale sont atteints jusqu’à 7 chiffres', () => {
    const { minCard } = layoutStats(12, VP);
    for (let d = 1; d <= 7; d++) {
      const fit = computeFit(minCard, fmtNum(Number('9'.repeat(d))));
      const cap = fit.scoreSz * CAP_RATIO;
      expect(`${d} chiffres : ${cap >= READABLE_CAP_PX}`).toBe(`${d} chiffres : true`);
    }
    // Cas documenté où le seuil ne peut pas être tenu sur deux lignes : à 11 joueurs la grille
    // 2×6 donne la carte la plus étroite du jeu (122 px de largeur lisible contre 146 à 12).
    const eleven = computeFit(layoutStats(11, VP).minCard, fmtNum(9999999));
    expect(eleven.lines).toBe(2);
    expect(eleven.scoreSz * CAP_RATIO).toBeLessThan(READABLE_CAP_PX);
    expect(eleven.scoreSz * CAP_RATIO).toBeGreaterThan(28);
  });

  it('scoreRows coupe aux milliers, signe sur la première ligne', () => {
    expect(scoreRows(fmtNum(9999999), 2)).toEqual(['9\u202f999', '999']);
    expect(scoreRows(fmtNum(-1234567), 2)).toEqual(['-1\u202f234', '567']);
    expect(scoreRows(fmtNum(99999), 2)).toEqual(['99', '999']);
    expect(scoreRows('9999999', 2)).toEqual(['9\u202f999', '999']);
    expect(scoreRows(fmtNum(999), 2)).toEqual(['999']);
    expect(scoreRows(fmtNum(9999), 1)).toEqual([fmtNum(9999)]);
    expect(scoreRows('', 2)).toEqual(['']);
    expect(scoreRows(null, 2)).toEqual(['']);
    expect(scoreRows(fmtNum(9999999), 3)).toEqual(['9', '999', '999']);
  });

  it('tous les nombres de joueurs tiennent le plancher, même à 7 chiffres négatifs', () => {
    for (let n = 1; n <= 12; n++) {
      const { minCard } = layoutStats(n, VP);
      for (const value of [0, -7, 40, 999, -1234567, 9999999]) {
        const fit = computeFit(minCard, fmtNum(value));
        expect(fit.scoreSz).toBeGreaterThanOrEqual(MIN_SCORE_PX);
        expect(fit.nameSz).toBeGreaterThanOrEqual(MIN_NAME_PX);
        expect(fit.deltaSz).toBeGreaterThanOrEqual(MIN_NAME_PX);
        expect(fit.signSz).toBeGreaterThanOrEqual(24);
      }
    }
  });

  it('le mode compact est un dernier recours, et implique toujours une seule ligne', () => {
    for (let n = 1; n <= 12; n++) {
      const { minCard } = layoutStats(n, VP);
      for (const d of [1, 2, 3, 4, 5, 6, 7]) {
        const fit = computeFit(minCard, fmtNum(Number('9'.repeat(d))));
        if (fit.compact) {
          expect(fit.lines).toBe(1);
          // On ne retire les séparateurs que si la lisibilité n'est pas atteinte autrement.
          expect(fit.scoreSz * CAP_RATIO).toBeLessThan(READABLE_CAP_PX);
        }
      }
    }
    // Carte étroite et haute : la largeur est la contrainte, et deux lignes n'y changent rien —
    // retirer les séparateurs est alors la seule option qui agrandit le nombre.
    const narrow = computeFit({ w: 90, h: 60 }, fmtNum(1234567));
    expect(narrow.compact).toBe(true);
    expect(narrow.lines).toBe(1);
    expect(narrow.scoreSz).toBeGreaterThan(
      computeFit({ w: 90, h: 60 }, '1 234 567').scoreSz * 0.99,
    );
    // Carte large et très basse : c'est la hauteur qui borne, les séparateurs ne coûtent rien.
    expect(computeFit({ w: 120, h: 34 }, fmtNum(1234567)).compact).toBe(false);
  });

  it('tient compte des DEUX dimensions : une carte large et basse écrit plus grand', () => {
    const wide = computeFit({ w: 366, h: 195 }, '40').scoreSz;
    const narrow = computeFit({ w: 195, h: 195 }, '40').scoreSz;
    expect(wide).toBeGreaterThanOrEqual(narrow);
    // Contrainte de largeur : plus de chiffres ⇒ score plus petit, à hauteur égale
    const sizes = ['4', '44', '444', '4444', '44444', '444444', '4444444'].map(
      (s) => computeFit({ w: 200, h: 120 }, s).scoreSz,
    );
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeLessThanOrEqual(sizes[i - 1]);
    expect(sizes.at(-1)).toBeLessThan(sizes[0]);
  });

  it('respecte planchers et plafonds, et tolère un repère absurde', () => {
    const huge = computeFit({ w: 4000, h: 4000 }, '4');
    expect(huge.scoreSz).toBe(MAX_SCORE_PX);
    expect(huge.nameSz).toBe(MAX_NAME_PX);
    for (const box of [{ w: 0, h: 0 }, { w: -5, h: 10 }, undefined, null]) {
      const fit = computeFit(box, '9999999');
      expect(fit.scoreSz).toBe(MIN_SCORE_PX);
      expect(fit.nameSz).toBe(MIN_NAME_PX);
    }
    expect(computeFit({ w: 200, h: 120 }, '').scoreSz).toBe(
      computeFit({ w: 200, h: 120 }, '0').scoreSz,
    );
    expect(computeFit({ w: 200, h: 120 }, undefined).scoreSz).toBeGreaterThan(0);
    // Chaîne sans aucun chiffre : la largeur retombe sur celle d'un chiffre, jamais sur zéro.
    expect(computeFit({ w: 200, h: 120 }, 'abc').scoreSz).toBeGreaterThan(0);
  });

  it('le signe négatif coûte de la place', () => {
    expect(computeFit({ w: 200, h: 120 }, '-44444').scoreSz).toBeLessThan(
      computeFit({ w: 200, h: 120 }, '44444').scoreSz,
    );
  });

  it('ghostH suit la taille du nom', () => {
    const fit = computeFit({ w: 300, h: 200 }, '40');
    expect(fit.ghostH).toBe(Math.round(fit.nameSz * 1.15));
  });
});

describe('nameMaxLength', () => {
  it("dépend réellement de la disposition et de l'écran", () => {
    expect(nameMaxLength(12, 320, 568)).toBeLessThan(nameMaxLength(1, 1024, 1366));
    expect(nameMaxLength(12, VP.width, VP.height)).toBeLessThan(
      nameMaxLength(4, VP.width, VP.height),
    );
    expect(nameMaxLength(4, 320, 568)).toBeLessThan(nameMaxLength(4, 1024, 1366));
    // Deux dispositions différentes sur le même écran ne donnent pas la même longueur
    const lengths = new Set(
      [1, 2, 4, 6, 8, 10, 12].map((n) => nameMaxLength(n, VP.width, VP.height)),
    );
    expect(lengths.size).toBeGreaterThan(1);
  });

  it('atteint 18 caractères sur une grande carte et reste ≥ 3 sur la plus petite', () => {
    expect(nameMaxLength(1, 1024, 1366)).toBe(18);
    expect(nameMaxLength(4, VP.width, VP.height)).toBe(18);
    expect(nameMaxLength(12, 240, 400)).toBeGreaterThanOrEqual(3);
  });

  it('sans écran mesurable, renvoie le minimum', () => {
    expect(nameMaxLength(4, 0, 0)).toBe(3);
    expect(nameMaxLength(4, undefined, undefined)).toBe(3);
  });

  it('reste borné entre 3 et 18 quel que soit le contexte', () => {
    for (let n = 1; n <= 12; n++) {
      for (const [w, h] of [
        [320, 568],
        [390, 844],
        [1024, 1366],
        [100, 200],
        [2000, 2000],
      ]) {
        const len = nameMaxLength(n, w, h);
        expect(len).toBeGreaterThanOrEqual(3);
        expect(len).toBeLessThanOrEqual(18);
        expect(Number.isInteger(len)).toBe(true);
      }
    }
    expect(HEADER_H).toBe(44);
    expect(BAR_H).toBe(68);
  });

  it('un écran plus petit ne donne jamais plus de caractères', () => {
    for (let n = 1; n <= 12; n++) {
      const small = nameMaxLength(n, 320, 568);
      const large = nameMaxLength(n, 430, 932);
      expect(small).toBeLessThanOrEqual(large);
    }
  });
});
