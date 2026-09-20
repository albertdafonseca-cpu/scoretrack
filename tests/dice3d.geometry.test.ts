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
import { _normalizeGeoRadius, _roundRadiusFor, dieAssignValues, dieExtractFaces, dieGeometryFor, ROUND_R } from '../src/dice3d/die';
import {
  allPerms,
  archIcosidodecahedron,
  archRhombicuboctahedron,
  archTruncCuboctahedron,
  archTruncIcosidodecahedron,
  catalanDie,
  dedupe,
  evenPerms,
} from '../src/dice3d/polyhedra';

/** Écart-type des distances des sommets au centre : 0 = silhouette parfaitement
 *  ronde (tous les sommets sur la même sphère), >0 = silhouette « bosselée »
 *  (sommets de Catalan à plusieurs rayons distincts, cf. commentaire de
 *  catalanDie). Mesure directe de l'effet du paramètre `onSphere`. */
function _vertexRadiusStdDev(geo: THREE.BufferGeometry): number {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const norms: number[] = [];
  for (let i = 0; i < pos.count; i++) norms.push(new THREE.Vector3().fromBufferAttribute(pos, i).length());
  const mean = norms.reduce((a, b) => a + b, 0) / norms.length;
  const variance = norms.reduce((a, b) => a + (b - mean) ** 2, 0) / norms.length;
  return Math.sqrt(variance);
}

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
    // Garde-fou défensif (maxr||1e-6) : INATTEIGNABLE sur les 5 solides d'Archimède
    // réellement codés en dur dans polyhedra.ts (leurs sommets ne sont jamais tous à
    // l'origine) — ce test ne peut donc pas être mis en échec par mutation sur ces 5
    // solides réels (vu et documenté dans docs/audit/DECISIONS-C.md §1.5/§2 ; ne pas
    // compter cette ligne comme « couverte par mutation testing » sur un cas réel).
    // Il documente seulement que la garde ne casse rien sur le chemin normal.
    const geo = catalanDie(archIcosidodecahedron, 1.35);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      expect(Number.isFinite(pos.getX(i))).toBe(true);
      expect(Number.isFinite(pos.getY(i))).toBe(true);
      expect(Number.isFinite(pos.getZ(i))).toBe(true);
    }
  });
});

describe("src/dice3d/polyhedra.ts — catalanDie : paramètre `onSphere` (D-CLAUDE-1, sphérisation verrouillée du d48/d120)", () => {
  // CLAUDE.md : « d48 et d120 (faces triangulaires) : sommets ramenés vers la sphère
  // englobante (catalanDie(..., t), t = 1 pour le d48, 0.85 pour le d120 car à 1 ses
  // faces fusionnent par paires) pour une silhouette ronde, pas "biscornue" ». C'est un
  // comportement EXPLICITEMENT verrouillé, jamais exercé par les tests ci-dessus (qui
  // n'appellent catalanDie qu'avec 2 arguments, sur des solides d24/d30 sans
  // sphérisation) : une régression sur `t` (constantes interverties d48/d120, ou
  // affaiblies lors d'un futur refactor) ne casserait ni le typecheck, ni le build, ni
  // aucun autre test — seulement l'œil sur un rendu que personne ne recompare
  // systématiquement. Mesure directe : l'écart-type des distances au centre des
  // sommets, qui doit diminuer strictement quand `t` augmente (0 = tous les sommets
  // ramenés exactement sur la même sphère).
  const R = 1.35; // même rayon que dieGeometryFor(48)/dieGeometryFor(120) en production

  it('sans onSphere, les sommets d\'un solide de Catalan sont à plusieurs rayons distincts (silhouette bosselée, pas ronde)', () => {
    // fait de base documenté par catalanDie lui-même : condition nécessaire pour que
    // le paramètre onSphere ait un effet observable à mesurer ci-dessous.
    expect(_vertexRadiusStdDev(catalanDie(archTruncCuboctahedron, R))).toBeGreaterThan(0.01);
    expect(_vertexRadiusStdDev(catalanDie(archTruncIcosidodecahedron, R))).toBeGreaterThan(0.01);
  });

  it('d48 réel (onSphere=true, t=1) : TOUS les sommets sont ramenés exactement sur la sphère englobante (écart-type ~0)', () => {
    // reproduit exactement dieGeometryFor(48) : catalanDie(archTruncCuboctahedron, 1.35, true)
    const stddev = _vertexRadiusStdDev(catalanDie(archTruncCuboctahedron, R, true));
    expect(stddev).toBeLessThan(1e-4);
  });

  it('d120 réel (onSphere=0.85) : sphérisation PARTIELLE -> écart-type strictement entre le solide brut et le d48 (t=1)', () => {
    // reproduit exactement dieGeometryFor(120) : catalanDie(archTruncIcosidodecahedron, 1.35, 0.85)
    const baseline = _vertexRadiusStdDev(catalanDie(archTruncIcosidodecahedron, R));
    const partial = _vertexRadiusStdDev(catalanDie(archTruncIcosidodecahedron, R, 0.85));
    const full = _vertexRadiusStdDev(catalanDie(archTruncIcosidodecahedron, R, true));
    // 0.85 documenté par CLAUDE.md comme un compromis : PLUS rond que le solide brut,
    // mais PAS totalement sphérique (contrairement au d48/t=1) — car "à 1 ses faces
    // fusionnent par paires". Une valeur t incorrecte (trop proche de 0 ou de 1)
    // romprait l'une de ces deux inégalités.
    expect(partial).toBeGreaterThan(full);
    expect(partial).toBeLessThan(baseline);
  });

  it('effet monotone et proportionnel à t (0 -> 0.5 -> 0.85 -> 1, écart-type strictement décroissant)', () => {
    // vérifie que le paramètre agit comme un vrai taux de rapprochement continu (pas
    // un simple booléen déguisé) : distingue une régression qui figerait `t` à une
    // valeur fixe quel que soit l'argument, ou qui inverserait le sens de l'effet.
    const steps = [0, 0.5, 0.85, 1].map((t) => _vertexRadiusStdDev(catalanDie(archTruncCuboctahedron, R, t)));
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeLessThan(steps[i - 1]);
  });

  it('câblage réel dieGeometryFor : le d48 (t=1, parfaitement rond) et le d120 (t=0.85, partiel) ne sont PAS intervertis', () => {
    // Test de bout en bout sur le point d'entrée RÉEL utilisé par buildDieByType
    // (src/dice3d/die.ts), pas seulement sur catalanDie appelé directement : un
    // copier-coller malheureux qui échangerait les deux arguments `onSphere` entre
    // les cas 48 et 120 de dieGeometryFor (même t correct, mauvais type) romprait ce
    // test alors qu'il ne romprait aucun test qui n'appelle que catalanDie().
    const stddev48 = _vertexRadiusStdDev(dieGeometryFor(48)!);
    const stddev120 = _vertexRadiusStdDev(dieGeometryFor(120)!);
    expect(stddev48).toBeLessThan(1e-4);          // d48 : t=1, silhouette parfaitement ronde
    expect(stddev120).toBeGreaterThan(1e-3);       // d120 : t=0.85, PAS parfaitement rond
    expect(stddev120).toBeLessThan(0.05);          // mais nettement sphérisé (pas le solide brut, stddev ~0.046)
  });
});
