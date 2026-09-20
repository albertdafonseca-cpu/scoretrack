// Élément D — garde-fous d'accessibilité de base (audit AAA, défaut P1 #4 du
// constat initial : accessibilité quasi nulle, un seul attribut aria/role
// dans tout `index.html`, textes jusqu'à 4/7/8/9px).
//
// Ce test ne remplace pas un audit axe-core complet : l'ajout de
// `@axe-core/playwright` nécessiterait une dépendance npm dans
// `package.json`, hors du périmètre exclusif de l'élément D (propriété de
// l'élément A) — voir docs/audit/DECISIONS-D.md pour la recommandation de
// coordination. En attendant, ce test vérifie mécaniquement, sur le vrai
// DOM rendu (pas une valeur théorique), les trois garanties concrètes de ce
// tour : (1) tout bouton/lien visible a un nom accessible (texte ou
// aria-label), (2) les boîtes de dialogue principales portent un rôle ARIA
// adapté, (3) plus aucun texte visible ne descend sous le plancher de
// lisibilité retenu (9px) — mutation testing : en repassant une des règles
// CSS corrigées à son ancienne valeur (ex. `.bar-btn` à 7px), ce test
// échoue (vérifié manuellement lors de la construction du correctif).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path, { extname } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const DIST = path.resolve(import.meta.dirname, '..', 'dist');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
};

async function startStaticServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    (async () => {
      const reqPath = (req.url || '/').split('?')[0];
      const filePath = path.join(DIST, reqPath === '/' ? 'index.html' : reqPath);
      if (!filePath.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
      try {
        const body = await readFile(filePath);
        res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
        res.end(body);
      } catch {
        res.writeHead(404);
        res.end('not found');
      }
    })();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  };
}

/** Nom accessible minimal : texte visible, aria-label, ou aria-labelledby
 *  résolu vers un texte non vide. Ne prétend pas réimplémenter l'algorithme
 *  complet du nom accessible (rôle ARIA, alt, title…) : suffisant pour
 *  détecter la régression réaliste (bouton icône-seule sans libellé). */
async function elementsWithoutAccessibleName(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const bad: string[] = [];
    const els = document.querySelectorAll('button, a[href]');
    els.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const visible = rect.width > 0 && rect.height > 0 && (el as HTMLElement).offsetParent !== null;
      if (!visible) return;
      const ariaLabel = el.getAttribute('aria-label');
      const labelledby = el.getAttribute('aria-labelledby');
      let labelledText = '';
      if (labelledby) {
        labelledText = labelledby.split(/\s+/).map(id => document.getElementById(id)?.textContent?.trim() || '').join(' ').trim();
      }
      const text = (el.textContent || '').trim();
      if (!ariaLabel?.trim() && !labelledText && !text) {
        bad.push(el.outerHTML.slice(0, 120));
      }
    });
    return bad;
  });
}

/** Plus petite taille de police (px) parmi les éléments de texte réellement
 *  visibles (exclut les nœuds display:none/visibility:hidden/hors-écran et
 *  ceux sans texte propre). */
async function minVisibleFontSizePx(page: Page): Promise<{ min: number; sample: string }> {
  return page.evaluate(() => {
    let min = Infinity;
    let sample = '';
    const all = document.querySelectorAll('body *');
    all.forEach((el) => {
      const hasOwnText = Array.from(el.childNodes).some(n => n.nodeType === Node.TEXT_NODE && (n.textContent || '').trim().length > 0);
      if (!hasOwnText) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const style = getComputedStyle(el as Element);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return;
      if ((el as HTMLElement).offsetParent === null) return;
      const size = parseFloat(style.fontSize);
      if (!Number.isNaN(size) && size < min) {
        min = size;
        sample = `${el.tagName}.${(el as HTMLElement).className} "${(el.textContent || '').trim().slice(0, 30)}"`;
      }
    });
    return { min, sample };
  });
}

// Boutons ne portant qu'un symbole/emoji (aucun mot lisible) : leur
// `textContent` n'est jamais vide (l'emoji EST un caractère), donc un test
// générique « a du texte » ne détecterait pas la régression réaliste
// (suppression de l'aria-label ajouté par ce tour). On vérifie donc
// explicitement, par id, que chacun porte un aria-label non vide.
const ICON_ONLY_BUTTON_IDS = [
  'theme-gear-btn', 'lang-flag-btn', 'lang-flag-btn-privacy',
  'theme-back-btn', 'privacy-back-btn',
  'dice-faces-minus', 'dice-faces-plus', 'dice-count-minus', 'dice-count-plus',
  'score-modal-confirm-btn', 'score-modal-cancel-btn', 'recap-close-btn',
];

test.describe('Accessibilité de base (index.html, élément D)', () => {
  test('boutons/liens visibles ont un nom accessible', async ({ page }) => {
    const server = await startStaticServer();
    try {
      await page.goto(server.url);
      await page.locator('#btn-privacy-accept').click();
      await expect(page.locator('.preset-card').first()).toBeVisible();
      const bad = await elementsWithoutAccessibleName(page);
      expect(bad, `éléments sans nom accessible : ${JSON.stringify(bad, null, 2)}`).toEqual([]);
    } finally {
      await server.close();
    }
  });

  test('les boutons icône-seule ont un aria-label non vide (traduit)', async ({ page }) => {
    const server = await startStaticServer();
    try {
      await page.goto(server.url);
      await page.locator('#btn-privacy-accept').click();
      await expect(page.locator('.preset-card').first()).toBeVisible();
      const labels: Record<string, string | null> = await page.evaluate((ids: string[]) => {
        const out: Record<string, string | null> = {};
        for (const id of ids) out[id] = document.getElementById(id)?.getAttribute('aria-label') ?? null;
        return out;
      }, ICON_ONLY_BUTTON_IDS);
      for (const [id, label] of Object.entries(labels)) {
        expect(label?.trim(), `#${id} devrait porter un aria-label non vide`).toBeTruthy();
      }
    } finally {
      await server.close();
    }
  });

  test('les aria-label des boutons icône-seule suivent le changement de langue', async ({ page }) => {
    // Preuve que l'aria-label vient bien du câblage dynamique de
    // src/i18n.ts (applyLang -> _setAriaLabel), pas seulement d'un attribut
    // statique figé en français dans index.html : on bascule vers l'anglais
    // à l'exécution (window.ScoreTrack.i18n, exposé pour les tests par
    // main.ts) et on vérifie que le texte change bien.
    const server = await startStaticServer();
    try {
      await page.goto(server.url);
      await page.locator('#btn-privacy-accept').click();
      await expect(page.locator('.preset-card').first()).toBeVisible();

      const applyLang = (code: string) => (window as unknown as {
        ScoreTrack: { i18n: { applyLang: (c: string) => void } };
      }).ScoreTrack.i18n.applyLang(code);

      await page.evaluate(applyLang, 'fr');
      const fr = await page.locator('#dice-count-minus').getAttribute('aria-label');
      expect(fr).toBe('Moins de dés');

      await page.evaluate(applyLang, 'en');
      const en = await page.locator('#dice-count-minus').getAttribute('aria-label');
      expect(en).toBe('Fewer dice');
    } finally {
      await server.close();
    }
  });

  test('aucun texte visible sous 9px sur l\'écran de démarrage / la partie', async ({ page }) => {
    const server = await startStaticServer();
    try {
      await page.goto(server.url);
      await page.locator('#btn-privacy-accept').click();
      await expect(page.locator('.preset-card').first()).toBeVisible();
      const setup = await minVisibleFontSizePx(page);
      expect(setup.min, `taille la plus petite trouvée : ${setup.sample}`).toBeGreaterThanOrEqual(9);

      await page.locator('.preset-card').first().click();
      await page.locator('#go-btn').click();
      await page.locator('#names-go-btn').click();
      await page.locator('.pcard .score').first().waitFor();
      await page.locator('#bar-handle-zone').click();
      await page.waitForTimeout(350);
      const game = await minVisibleFontSizePx(page);
      expect(game.min, `taille la plus petite trouvée : ${game.sample}`).toBeGreaterThanOrEqual(9);
    } finally {
      await server.close();
    }
  });

  test('les boîtes de dialogue principales portent un rôle ARIA', async ({ page }) => {
    const server = await startStaticServer();
    try {
      await page.goto(server.url);
      await page.locator('#btn-privacy-accept').click();
      const roles: Record<string, string | null> = await page.evaluate(() => {
        const ids = ['dice-overlay', 'score-modal', 'winner-modal', 'reset-modal', 'elim-modal', 'endgame-modal', 'recap'];
        const out: Record<string, string | null> = {};
        for (const id of ids) out[id] = document.getElementById(id)?.getAttribute('role') ?? null;
        return out;
      });
      for (const [id, role] of Object.entries(roles)) {
        expect(role, `#${id} devrait porter un rôle ARIA de dialogue`).toMatch(/dialog|alertdialog/);
      }
    } finally {
      await server.close();
    }
  });
});
