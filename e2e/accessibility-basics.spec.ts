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

  test('anneau de focus réellement rendu (round 2) sur les boutons d\'action principaux', async ({ page }) => {
    // Round 1 (critique indépendant) : `:focus-visible` matchait bien
    // l'élément mais `getComputedStyle(el).outlineWidth` valait 0px à
    // l'écran sur #btn-privacy-accept/#go-btn (classe .go-btn). Cause
    // diagnostiquée : `.go-btn{transition:all 0.18s}` s'applique aussi à
    // `outline`/`box-shadow`, qui ne se peignaient donc qu'au terme d'un
    // fondu de 180 ms — invisible sur une capture prise juste après Tab.
    // Corrigé par `transition-duration:0s` dans la règle `:focus-visible`
    // elle-même (la spec CSS Transitions résout la durée depuis le style
    // calculé APRÈS le changement d'état). Ce test lit `outlineWidth`
    // immédiatement après le focus, sans délai, pour ne jamais retomber
    // dans le même piège de mesure que le round 1.
    const server = await startStaticServer();
    try {
      await page.goto(server.url);

      // #btn-privacy-accept : quelques Tab depuis le tout premier chargement
      // (le sélecteur de langue de la page de confidentialité le précède
      // dans l'ordre de tabulation).
      let privacyLanded = '';
      for (let i = 0; i < 10 && privacyLanded !== 'btn-privacy-accept'; i++) {
        await page.keyboard.press('Tab');
        privacyLanded = (await page.evaluate(() => document.activeElement?.id)) || '';
      }
      const privacyInfo = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return {
          id: el?.id,
          matchesFocusVisible: el ? el.matches(':focus-visible') : false,
          outlineWidth: el ? getComputedStyle(el).outlineWidth : '0px',
        };
      });
      expect(privacyInfo.id).toBe('btn-privacy-accept');
      expect(privacyInfo.matchesFocusVisible).toBe(true);
      expect(parseFloat(privacyInfo.outlineWidth)).toBeGreaterThan(0);

      // #go-btn : après un clic souris (sélection du préréglage), de vraies
      // pressions Tab clavier (pas .focus() programmatique, qui ne restaure
      // pas la modalité clavier de :focus-visible après un clic souris).
      await page.locator('#btn-privacy-accept').click();
      await page.locator('.preset-card').first().click();
      await expect(page.locator('#go-btn')).toBeEnabled();
      let landedId = '';
      for (let i = 0; i < 40 && landedId !== 'go-btn'; i++) {
        await page.keyboard.press('Tab');
        landedId = (await page.evaluate(() => document.activeElement?.id)) || '';
      }
      expect(landedId).toBe('go-btn');
      const goInfo = await page.evaluate(() => {
        const el = document.getElementById('go-btn') as HTMLElement;
        return {
          matchesFocusVisible: el.matches(':focus-visible'),
          outlineWidth: getComputedStyle(el).outlineWidth,
        };
      });
      expect(goInfo.matchesFocusVisible).toBe(true);
      expect(parseFloat(goInfo.outlineWidth)).toBeGreaterThan(0);
    } finally {
      await server.close();
    }
  });

  test('#score-modal : focus déplacé à l\'ouverture, piège de focus, Échap ferme', async ({ page }) => {
    // Round 1 (critique indépendant) : role="dialog" posé sans aucune
    // gestion clavier (patron ARIA APG « Dialog (Modal) » non respecté).
    // Corrigé dans src/animations.ts (initDialogA11y), sans toucher
    // game.ts (closeScoreModal y est importé et réutilisé tel quel).
    const server = await startStaticServer();
    try {
      await page.goto(server.url);
      await page.locator('#btn-privacy-accept').click();
      await page.locator('.preset-card').first().click();
      await page.locator('#go-btn').click();
      await page.locator('#names-go-btn').click();
      await page.locator('.pcard .score').first().waitFor();
      await page.evaluate(() => {
        (window as unknown as { ScoreTrack: { game: { openScoreModal: (i: number) => void } } })
          .ScoreTrack.game.openScoreModal(0);
      });
      await page.waitForTimeout(150);

      const focusedInside = await page.evaluate(() => document.getElementById('score-modal')!.contains(document.activeElement));
      expect(focusedInside, 'le focus devrait se déplacer dans #score-modal à son ouverture').toBe(true);

      let everLeftDuringTab = false;
      for (let i = 0; i < 20; i++) {
        await page.keyboard.press('Tab');
        const inside = await page.evaluate(() => document.getElementById('score-modal')!.contains(document.activeElement));
        if (!inside) { everLeftDuringTab = true; break; }
      }
      expect(everLeftDuringTab, 'Tab ne devrait jamais faire sortir le focus de #score-modal tant qu\'il est ouvert').toBe(false);

      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
      const closed = await page.evaluate(() => document.getElementById('score-modal')!.classList.contains('hidden'));
      expect(closed, 'Échap devrait fermer #score-modal').toBe(true);
    } finally {
      await server.close();
    }
  });

  test('#dice-overlay : focus déplacé à l\'ouverture, piège de focus, Échap ferme', async ({ page }) => {
    const server = await startStaticServer();
    try {
      await page.goto(server.url);
      await page.locator('#btn-privacy-accept').click();
      await page.locator('.preset-card').first().click();
      await page.locator('#go-btn').click();
      await page.locator('#names-go-btn').click();
      await page.locator('.pcard .score').first().waitFor();
      await page.evaluate(() => {
        (window as unknown as { ScoreTrack: { diceUi: { openDice: () => void } } })
          .ScoreTrack.diceUi.openDice();
      });
      await page.waitForTimeout(150);

      const focusedInside = await page.evaluate(() => document.getElementById('dice-overlay')!.contains(document.activeElement));
      expect(focusedInside, 'le focus devrait se déplacer dans #dice-overlay à son ouverture').toBe(true);

      let everLeftDuringTab = false;
      for (let i = 0; i < 20; i++) {
        await page.keyboard.press('Tab');
        const inside = await page.evaluate(() => document.getElementById('dice-overlay')!.contains(document.activeElement));
        if (!inside) { everLeftDuringTab = true; break; }
      }
      expect(everLeftDuringTab, 'Tab ne devrait jamais faire sortir le focus de #dice-overlay tant qu\'il est ouvert').toBe(false);

      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
      const closed = await page.evaluate(() => document.getElementById('dice-overlay')!.classList.contains('hidden'));
      expect(closed, 'Échap devrait fermer #dice-overlay').toBe(true);
    } finally {
      await server.close();
    }
  });

  test('contraste chip off/on du thème mono-light >= 3:1 (WCAG 1.4.11)', async ({ page }) => {
    // Round 1 (critique indépendant) : mesuré à 2.93:1 sur les pixels
    // réellement rendus (chip sélectionnée/non sélectionnée du thème
    // "mono-light", seule information non textuelle du réglage). Corrigé
    // en réutilisant --accent du thème (#0050d0, déjà utilisé ailleurs
    // dans ce thème) comme --chip-on. Mesuré ici sur le DOM réellement
    // rendu (luminance relative WCAG à partir de getComputedStyle), pas
    // une valeur théorique lue dans le CSS source.
    const server = await startStaticServer();
    try {
      await page.goto(server.url);
      await page.locator('#btn-privacy-accept').click();
      await page.evaluate(() => {
        (window as unknown as { ScoreTrack: { game: { applyTheme: (id: string) => void } } })
          .ScoreTrack.game.applyTheme('mono-light');
      });
      await page.waitForTimeout(100);

      // `.objectif-chip{transition:all 0.15s}` : les deux sondes doivent
      // porter leur classe finale dès leur création (pas un ajout de
      // `.on` après coup dans le même tick), sans quoi la lecture de
      // `background-color` intercepte l'état de départ de la transition
      // au lieu de la couleur réellement affichée à l'écran — même piège
      // de mesure que le focus visible (round 1, P1-1) sur `.go-btn`.
      const ratio = await page.evaluate(async () => {
        function relLum(rgb: string): number {
          const m = rgb.match(/\d+(\.\d+)?/g);
          if (!m) return 0;
          const [r, g, b] = m.slice(0, 3).map(Number).map((c) => {
            const s = c / 255;
            return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        }
        function makeProbe(cls: string): HTMLDivElement {
          const probe = document.createElement('div');
          probe.className = cls;
          probe.style.position = 'fixed';
          probe.style.top = '-999px';
          document.body.appendChild(probe);
          return probe;
        }
        const off = makeProbe('objectif-chip');
        const on = makeProbe('objectif-chip on');
        await new Promise((r) => setTimeout(r, 200)); // laisse la transition CSS se terminer
        const bgColor = getComputedStyle(off).backgroundColor;
        const onColor = getComputedStyle(on).backgroundColor;
        off.remove(); on.remove();
        const l1 = relLum(bgColor), l2 = relLum(onColor);
        const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
        return (hi + 0.05) / (lo + 0.05);
      });
      expect(ratio, `contraste chip off/on mono-light mesuré : ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
    } finally {
      await server.close();
    }
  });
});
