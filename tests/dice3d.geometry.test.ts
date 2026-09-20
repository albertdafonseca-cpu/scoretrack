// src/dice3d/die.ts + src/dice3d/polyhedra.ts — fonctions géométriques pures
// (calcul sur des THREE.BufferGeometry/Vector3 en CPU ; aucun contexte WebGL,
// aucun canvas requis). Elles portent une vraie logique métier (extraction des
// faces, appariement des valeurs opposées, rayon d'arrondi plafonné, projection
// sur une sphère englobante) et sont donc testables sans DOM ni rendu — exactement
// le type de fonction que le brief demande de couvrir en priorité (§ mission,
// point 1). Zéro assertion sur l'esthétique (angle/couleur/taille) : uniquement
// sur des invariants géométriques et numériques.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { _normalizeGeoRadius, _roundRadiusFor, dieAssignValues, dieExtractFaces, ROUND_R } from '../src/dice3d/die';
import { allPerms, archIcosidodecahedron, archRhombicuboctahedron, catalanDie, dedupe, evenPerms } from '../src/dice3d/polyhedra';

describe('src/dice3d/die.ts — dieExtractFaces (cube de référence, 6 faces connues)', () => {
  const faces = dieExtractFaces(new THREE.BoxGeometry(2, 2, 2));

  it('fusionne les 2 triangles de chaque face du cube en 6 faces (pas 12)', () => {
    expect(faces).toHaveLength(6);
  });

  it('chaque face est un quadrilatère (4 sommets uniques)', () => {
    faces.forEach((f) => expect(f.poly).toHaveLength(4));
  });

  it('rayon inscrit = 1 pour un cube de côté 2 (moitié du côté, exact)', () => {
    faces.forEach((f) => expect(f.inradius).toBeCloseTo(1, 4));
  });

  it('circonrayon = √2 (demi-diagonale d\'une face carrée de côté 2)', () => {
    faces.forEach((f) => expect(f.circum).toBeCloseTo(Math.SQRT2, 4));
  });

  it('les 6 normales couvrent bien les 6 directions axiales ±X/±Y/±Z, sans doublon', () => {
    const axes = new Set(
      faces.map((f) => {
        const n = f.normal;
        const axis = ['x', 'y', 'z'][[Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)].indexOf(1)];
        const sign = (n.x + n.y + n.z) > 0 ? '+' : '-';
        return sign + axis;
      }),
    );
    expect(axes).toEqual(new Set(['+x', '-x', '+y', '-y', '+z', '-z']));
  });
});

describe('src/dice3d/die.ts — dieAssignValues (appariement des faces opposées, comme un vrai dé)', () => {
  it('sur un cube (N=6) : chaque paire de faces opposées somme à 7, exactement comme un d6 réel', () => {
    const faces = dieExtractFaces(new THREE.BoxGeometry(2, 2, 2));
    dieAssignValues(faces, 6);
    const values = faces.map((f) => f.value).sort((a, b) => a - b);
    expect(values).toEqual([1, 2, 3, 4, 5, 6]);
    faces.forEach((f) => {
      const opposite = faces.find((g) => g.normal.dot(f.normal) < -0.99);
      expect(opposite).toBeDefined();
      expect(f.value + (opposite as typeof f).value).toBe(7);
    });
  });

  it('sur un octaèdre (N=8) : les 4 paires de faces opposées somment aussi à N+1=9', () => {
    const faces = dieExtractFaces(new THREE.OctahedronGeometry(1.4));
    dieAssignValues(faces, 8);
    faces.forEach((f) => {
      const opposite = faces.find((g) => g.normal.dot(f.normal) < -0.99);
      if (opposite) expect(f.value + (opposite as typeof f).value).toBe(9);
    });
  });
});

describe('src/dice3d/die.ts — _normalizeGeoRadius (mise à l\'échelle commune des solides)', () => {
  it('le rayon englobant de la géométrie normalisée vaut exactement la cible demandée', () => {
    const geo = new THREE.IcosahedronGeometry(1.3);
    const targetR = 1.42; // DICE_TARGET_R réel du moteur
    _normalizeGeoRadius(geo, targetR);
    geo.computeBoundingSphere();
    expect(geo.boundingSphere?.radius).toBeCloseTo(targetR, 4);
  });

  it('robuste à une cible différente (proportionnalité respectée, pas de valeur codée en dur)', () => {
    const geo = new THREE.OctahedronGeometry(1.4);
    _normalizeGeoRadius(geo, 3);
    geo.computeBoundingSphere();
    expect(geo.boundingSphere?.radius).toBeCloseTo(3, 4);
  });
});

describe('src/dice3d/die.ts — _roundRadiusFor (D-CLAUDE-1 : rayon d\'arrondi plafonné à 30% du plus petit rayon inscrit)', () => {
  it('sur un cube de côté 2 (inradius=1), le rayon d\'arrondi générique ROUND_R (0.18) tient sous le plafond (30% = 0.3) : il est repris tel quel', () => {
    const r = _roundRadiusFor(new THREE.BoxGeometry(2, 2, 2));
    expect(r).toBeCloseTo(ROUND_R, 6);
  });

  it('sur un solide plus petit (inradius sous le seuil), le rayon est bien PLAFONNÉ à 30% de l\'inradius minimal, jamais laissé à ROUND_R brut', () => {
    // cube de côté 0.4 -> inradius=0.2 -> plafond = 0.2*0.30 = 0.06, très en dessous de ROUND_R=0.18
    const r = _roundRadiusFor(new THREE.BoxGeometry(0.4, 0.4, 0.4));
    expect(r).toBeCloseTo(0.06, 4);
    expect(r).toBeLessThan(ROUND_R);
  });
});

describe('src/dice3d/polyhedra.ts — allPerms / evenPerms / dedupe (sommets des solides d\'Archimède)', () => {
  it('allPerms(1,1,1) déduplique les 6 permutations × 8 signes en 8 sommets uniques (les 8 coins d\'un cube)', () => {
    expect(allPerms(1, 1, 1)).toHaveLength(8);
  });

  it('evenPerms(1,1,1) déduplique les 3 permutations cycliques × 8 signes en 8 sommets uniques également', () => {
    expect(evenPerms(1, 1, 1)).toHaveLength(8);
  });

  it('allPerms distingue bien 3 valeurs différentes : 6 permutations × 8 signes = 48 sommets uniques (aucun coïncide)', () => {
    expect(allPerms(1, 2, 3)).toHaveLength(48);
  });

  it('dedupe supprime les points strictement identiques (à 1e-4 près) et conserve les autres', () => {
    const v = new THREE.Vector3(1, 2, 3);
    const out = dedupe([v, v.clone(), new THREE.Vector3(4, 5, 6)]);
    expect(out).toHaveLength(2);
  });
});

describe('src/dice3d/polyhedra.ts — catalanDie (dual des solides d\'Archimède -> vrais dés)', () => {
  it('met à l\'échelle le solide dual pour que son rayon englobant vaille exactement `radius`', () => {
    // même construction que le d24 réel (dieGeometryFor(24))
    const geo = catalanDie(archRhombicuboctahedron, 1.35);
    geo.computeBoundingSphere();
    expect(geo.boundingSphere?.radius).toBeCloseTo(1.35, 3);
  });

  it('aucune coordonnée NaN/Infinity produite (garde-fou division par zéro de la mise à l\'échelle)', () => {
    const geo = catalanDie(archIcosidodecahedron, 1.35);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      expect(Number.isFinite(pos.getX(i))).toBe(true);
      expect(Number.isFinite(pos.getY(i))).toBe(true);
      expect(Number.isFinite(pos.getZ(i))).toBe(true);
    }
  });
});
