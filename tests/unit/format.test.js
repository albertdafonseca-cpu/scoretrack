import { describe, expect, it } from 'vitest';
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
  it('ne contient que des chiffres, un signe et des espaces', () => {
    expect(fmtNum(9999999)).toMatch(/^-?[\d\s]+$/u);
  });
});
