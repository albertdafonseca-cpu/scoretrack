// Déclaration typée mais volontairement DÉCOUPLÉE de `src/i18n.ts` — même
// raison que `loadGame.d.ts` : même un `import type` depuis `src/i18n.ts`
// forcerait `tsc -p tsconfig.test.json` à type-vérifier ce module, qui déclare
// un minuteur en `number` (lib DOM) alors que ce tsconfig ajoute les types
// Node (`NodeJS.Timeout`) pour les besoins de `e2e/` — conflit préexistant,
// documenté dans `docs/audit/DECISIONS-B.md`, hors du périmètre de ce module.
//
// Ce fichier ne décrit donc que le sous-ensemble de l'API de `i18n.ts` utilisé
// par les tests de la politique de confidentialité — recopié à la main.
import type { LangCode } from '../../src/i18n/translations';

export interface I18nTestFacade {
  applyLang(code: LangCode): void;
  appVersion(): string;
}

/** Charge le vrai `src/i18n.ts` au runtime (voir `loadI18n.js`). */
export function loadI18n(): Promise<I18nTestFacade>;
