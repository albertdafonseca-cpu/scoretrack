// src/dice3d/die.ts — fonctions pures de colorimétrie (ni DOM ni WebGL requis) :
// _hexLum, _mixHex, _hexHS, _contrastInk, _capLum. Elles portent la convention
// D-CLAUDE-2 (CLAUDE.md, « Accessibilité ») : toute distinction d'information par
// la couleur reste lisible en LUMINANCE, jamais par la teinte seule — c'est très
// exactement ce que _contrastInk doit garantir (encre du dé toujours contrastée,
// daltonien-safe). Aucun de ces tests ne touche au rendu (angles/rayons/tailles) :
// ils vérifient uniquement le calcul, jamais l'esthétique verrouillée par le brief.
import { describe, expect, it } from 'vitest';
import { _capLum, _contrastInk, _hexHS, _hexLum, _mixHex } from '../src/dice3d/die';

describe('src/dice3d/die.ts — _hexLum (luminance perçue Rec. 709)', () => {
  it('blanc pur -> luminance 1', () => {
    expect(_hexLum(0xffffff)).toBeCloseTo(1, 5);
  });
  it('noir pur -> luminance 0', () => {
    expect(_hexLum(0x000000)).toBe(0);
  });
  it('rouge pur -> pondération 0.2126 (le canal le moins lumineux des trois primaires)', () => {
    expect(_hexLum(0xff0000)).toBeCloseTo(0.2126, 4);
  });
  it('vert pur -> pondération 0.7152 (le canal le PLUS lumineux, jamais interverti avec le rouge/bleu)', () => {
    expect(_hexLum(0x00ff00)).toBeCloseTo(0.7152, 4);
  });
  it('bleu pur -> pondération 0.0722 (le canal le moins lumineux)', () => {
    expect(_hexLum(0x0000ff)).toBeCloseTo(0.0722, 4);
  });
  it('gris moyen -> luminance = la fraction de gris (les 3 canaux pèsent alors identiquement)', () => {
    expect(_hexLum(0x808080)).toBeCloseTo(128 / 255, 4);
  });
});

describe('src/dice3d/die.ts — _mixHex (interpolation linéaire par canal)', () => {
  it('t=0 renvoie la couleur de départ inchangée', () => {
    expect(_mixHex(0x336699, 0xffffff, 0)).toBe(0x336699);
  });
  it('t=1 renvoie exactement la couleur cible', () => {
    expect(_mixHex(0x336699, 0xffffff, 1)).toBe(0xffffff);
  });
  it('t=0.5 entre noir et blanc -> gris moyen (arrondi au canal près)', () => {
    expect(_mixHex(0x000000, 0xffffff, 0.5)).toBe(0x808080);
  });
  it('mélange indépendant par canal (pas de fuite rouge/vert/bleu)', () => {
    // départ tout rouge, cible tout vert : à t=1 le rouge doit avoir disparu
    expect(_mixHex(0xff0000, 0x00ff00, 1)).toBe(0x00ff00);
  });
});

describe('src/dice3d/die.ts — _hexHS (teinte 0-360°, saturation 0-1)', () => {
  it('rouge pur -> teinte 0°, saturation maximale', () => {
    const { h, s } = _hexHS(0xff0000);
    expect(h).toBeCloseTo(0, 4);
    expect(s).toBeCloseTo(1, 4);
  });
  it('vert pur -> teinte 120°', () => {
    expect(_hexHS(0x00ff00).h).toBeCloseTo(120, 4);
  });
  it('bleu pur -> teinte 240°', () => {
    expect(_hexHS(0x0000ff).h).toBeCloseTo(240, 4);
  });
  it('gris (r=g=b) -> saturation nulle, quelle que soit la teinte calculée', () => {
    expect(_hexHS(0x808080).s).toBe(0);
  });
});

describe('src/dice3d/die.ts — _contrastInk (D-CLAUDE-2 : contraste par LUMINANCE, jamais par teinte)', () => {
  it('corps très clair -> encre foncée', () => {
    expect(_contrastInk(0xffffff)).toBe(0x15181c);
  });
  it('corps très sombre -> encre ivoire/blanche', () => {
    expect(_contrastInk(0x000000)).toBe(0xffffff);
  });
  it('bascule au seuil documenté de luminance 0.58 : juste en dessous -> encre claire', () => {
    // 0x939393 a une luminance ≈ 0.5765 (< 0.58)
    expect(_hexLum(0x939393)).toBeLessThan(0.58);
    expect(_contrastInk(0x939393)).toBe(0xffffff);
  });
  it('bascule au seuil documenté de luminance 0.58 : juste au-dessus -> encre foncée', () => {
    // 0x959595 a une luminance ≈ 0.5843 (> 0.58)
    expect(_hexLum(0x959595)).toBeGreaterThan(0.58);
    expect(_contrastInk(0x959595)).toBe(0x15181c);
  });
  it('la teinte seule ne doit jamais dicter le choix : le vert pur (perçu "éclatant") est en réalité TRÈS lumineux -> encre foncée, comme le blanc', () => {
    // si la fonction se basait sur "est-ce une couleur vive/saturée" plutôt que
    // sur la luminance réelle, un vert pur saturé recevrait à tort une encre
    // claire (comme le bleu ci-dessous) au lieu d'une encre foncée.
    expect(_hexLum(0x00ff00)).toBeGreaterThan(0.58);
    expect(_contrastInk(0x00ff00)).toBe(0x15181c);
  });
  it('à l\'inverse, le bleu pur saturé est en réalité TRÈS sombre -> encre claire, comme le noir', () => {
    expect(_hexLum(0x0000ff)).toBeLessThan(0.58);
    expect(_contrastInk(0x0000ff)).toBe(0xffffff);
  });
});

describe('src/dice3d/die.ts — _capLum (plafonne la luminance, jamais le blanc pur)', () => {
  it('une couleur déjà sous le plafond est renvoyée inchangée', () => {
    expect(_capLum(0x202020, 0.5)).toBe(0x202020);
  });
  it('une couleur au-dessus du plafond est assombrie jusqu\'au plafond (à l\'arrondi près)', () => {
    const capped = _capLum(0xffffff, 0.3);
    expect(_hexLum(capped)).toBeCloseTo(0.3, 1);
  });
  it('couleur noire (luminance 0) : pas de division par zéro, renvoyée inchangée', () => {
    expect(_capLum(0x000000, 0.3)).toBe(0x000000);
  });
});
