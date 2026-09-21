// Politique de confidentialité : le numéro de version doit y figurer
// systématiquement (demande explicite), et rester exact à chaque build sans
// entretien manuel. Couvre les deux moitiés du mécanisme : la table de
// traduction (chaque langue porte bien le jeton `{v}`, sinon la version
// n'apparaîtrait que dans certaines langues) et l'interpolation réelle dans
// le DOM par `applyLang()` (src/i18n.ts), à partir du vrai `index.html` (même
// source que `<meta name="app-version">` lu par `build.mjs` pour le service
// worker : une seule source de vérité).
import { beforeEach, describe, expect, it } from 'vitest';
import { loadAppHtml } from './support/appHtml';
import { loadI18n } from './support/loadI18n';
import type { I18nTestFacade } from './support/loadI18n';
import { T } from '../src/i18n/translations';

describe('politique de confidentialité — numéro de version', () => {
  it('chaque langue porte le jeton {v} dans privacyDate', () => {
    for (const [code, table] of Object.entries(T)) {
      expect(table.privacyDate, `${code}.privacyDate`).toContain('{v}');
    }
  });

  describe('interpolation réelle (DOM)', () => {
    let i18n: I18nTestFacade;

    beforeEach(async () => {
      loadAppHtml();
      i18n = await loadI18n();
    });

    it('remplace {v} par le contenu de <meta name="app-version">', () => {
      const meta = document.querySelector('meta[name="app-version"]');
      const version = meta?.getAttribute('content') || '';
      expect(version.length).toBeGreaterThan(0); // sinon le test ne prouverait rien

      i18n.applyLang('en');
      const text = document.getElementById('privacy-date')?.textContent || '';
      expect(text).toContain(version);
      expect(text).not.toContain('{v}');
    });

    it('suit un changement de version sans autre modification', () => {
      const meta = document.querySelector('meta[name="app-version"]') as HTMLMetaElement;
      meta.setAttribute('content', '999');

      i18n.applyLang('fr');
      const text = document.getElementById('privacy-date')?.textContent || '';
      expect(text).toContain('999');
    });
  });
});
