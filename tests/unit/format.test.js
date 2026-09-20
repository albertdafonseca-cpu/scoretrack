import { describe, expect, it } from 'vitest';
import {
  COLORS,
  DEFAULT_THEME,
  GAME_PRESETS,
  KEYPAD_KEYS,
  THEMES,
} from '../../js/core/constants.js';
import { fmtNum } from '../../js/core/format.js';

describe('fmtNum', () => {
  it('laisse les nombres sous 1000 tels quels', () => {
    expect(fmtNum(0)).toBe('0');
    expect(fmtNum(999)).toBe('999');
    expect(fmtNum(-999)).toBe('-999');
  });
  it('sépare les milliers à la française (espace insécable fine) au-delà', () => {
    expect(fmtNum(1000)).toBe((1000).toLocaleString('fr-FR'));
    expect(fmtNum(1234567).replace(/\s/g, ' ')).toBe('1 234 567');
    expect(fmtNum(-1234567).replace(/\s/g, ' ')).toBe('-1 234 567');
  });
  it('ne contient que des chiffres, un signe et des espaces (7 chiffres compris)', () => {
    expect(fmtNum(9999999)).toMatch(/^-?[\d\s]+$/u);
    expect(fmtNum(9999999).replace(/\s/g, '')).toBe('9999999');
  });
});

describe('constantes', () => {
  it('thèmes aux identifiants uniques, couleurs hexadécimales, thème par défaut présent', () => {
    // Le nombre de thèmes appartient à la table elle-même : on vérifie sa cohérence, pas un compte.
    expect(THEMES.length).toBeGreaterThanOrEqual(14);
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length);
    THEMES.forEach((t) => {
      expect(t.name.length).toBeGreaterThan(0);
      [t.bg, t.a, t.b].forEach((c) => expect(c).toMatch(/^#[0-9a-f]{6}$/i));
    });
    expect(THEMES.some((t) => t.id === DEFAULT_THEME)).toBe(true);
  });
  it('palette joueurs : 12 couleurs Tol uniques', () => {
    expect(COLORS).toHaveLength(12);
    expect(new Set(COLORS).size).toBe(12);
    COLORS.forEach((c) => expect(c).toMatch(/^#[0-9A-F]{6}$/));
  });
  it('préréglages cohérents (1 à 12 joueurs, max ≥ départ ou 0)', () => {
    GAME_PRESETS.forEach((p) => {
      expect(p.players).toBeGreaterThanOrEqual(1);
      expect(p.players).toBeLessThanOrEqual(12);
      expect(p.max === 0 || p.max >= p.start).toBe(true);
      expect(typeof p.neg).toBe('boolean');
    });
    expect(GAME_PRESETS.find((p) => p.name === 'Loi du Milieu')).toMatchObject({
      start: 40,
      max: 40,
    });
  });
  it('pavé numérique : 10 chiffres, effacement et « 00 »', () => {
    expect(KEYPAD_KEYS).toHaveLength(12);
    expect(KEYPAD_KEYS.filter((k) => Number.isInteger(k))).toHaveLength(10);
    expect(KEYPAD_KEYS).toContain('00');
  });
});
