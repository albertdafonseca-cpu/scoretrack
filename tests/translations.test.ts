// Test de démonstration sur une donnée pure sans DOM : la table de traduction
// (src/i18n/translations.ts, périmètre de l'élément D). Vérifie l'invariant
// documenté par le fichier lui-même (« vérifie qu'aucun code de LangCode ne
// manque ») étendu aux CLÉS de traduction : une régression réaliste est
// l'ajout d'une clé dans `en` sans la répercuter dans les 17 autres langues,
// ce qui ne casse ni le typecheck ni le build (repli silencieux sur `en` via
// `t()`) et ne serait donc visible qu'à l'usage sans ce test.
import { describe, expect, it } from 'vitest';
import { LANGS, T } from '../src/i18n/translations';

describe('src/i18n/translations.ts — cohérence des 18 langues', () => {
  const codes = Object.keys(T) as Array<keyof typeof T>;

  it('déclare bien 18 langues', () => {
    expect(codes).toHaveLength(18);
  });

  it('LANGS et les clés de T se correspondent exactement', () => {
    const langCodes = LANGS.map((l) => l.code).sort();
    expect([...codes].sort()).toEqual(langCodes);
  });

  it('chaque langue traduit au moins toutes les clés de la langue de référence (en)', () => {
    const referenceKeys = Object.keys(T.en);
    for (const code of codes) {
      const keys = new Set(Object.keys(T[code]));
      const missing = referenceKeys.filter((k) => !keys.has(k));
      expect(missing, `clés manquantes pour "${code}"`).toEqual([]);
    }
  });

  it('aucune traduction vide (chaîne non-vide pour chaque clé de chaque langue)', () => {
    for (const code of codes) {
      for (const [key, value] of Object.entries(T[code])) {
        expect(typeof value, `${code}.${key}`).toBe('string');
        expect((value as string).trim().length, `${code}.${key} est vide`).toBeGreaterThan(0);
      }
    }
  });
});
