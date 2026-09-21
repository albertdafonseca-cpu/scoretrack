// Élément G (audit AAA, round 3) — vérification réelle du resserrement de
// la CSP de `vercel.json` : retrait de `'unsafe-inline'` de `script-src`,
// rendu possible une fois les 65 attributs `onclick="..."` remplacés par
// `addEventListener` (src/main.ts) — c'était la seule raison documentée
// (DECISIONS-F.md §4, D7) de garder `'unsafe-inline'` dans `script-src`.
//
// Complété ensuite (fermeture de dette post-audit) pour `style-src` : le
// `<style>` inline d'`index.html` a été extrait vers `css/app.css` (un vrai
// fichier, servi par un `<link>`), ce qui a permis de découvrir — en testant
// réellement, pas en supposant — qu'une CSP `style-src` sans
// `'unsafe-inline'` bloque aussi les innombrables mutations `.style.xxx=`
// (CSSOM) faites en JS dans tout le projet (dice-ui.ts, animations.ts,
// game.ts), contrairement à une hypothèse initiale répandue selon laquelle
// seuls les attributs `style=""` écrits en HTML et les `<style>` inline
// seraient concernés. Retenu à la place : les directives CSP de niveau 3
// `style-src-elem 'self'` (bloque tout `<style>`/`<link>` injecté, y
// compris par un futur bug d'injection HTML) et `style-src-attr
// 'unsafe-inline'` (autorise les mutations `.style.xxx=` légitimes, qui ne
// dépendent d'aucune donnée utilisateur non échappée). Voir la preuve du
// blocage réel plus bas (« un `<style>` injecté est bien bloqué »).
//
// Sert `dist/` en HTTP avec EXACTEMENT les en-têtes de `vercel.json` (lus
// dynamiquement depuis ce fichier, jamais dupliqués en dur ici, pour que ce
// test suive automatiquement tout futur changement de la CSP plutôt que de
// tester une copie figée) — les en-têtes ne s'appliquent jamais en `file://`
// ni via un serveur HTTP qui ne les pose pas explicitement. Un écouteur
// `securitypolicyviolation` posé par `addInitScript` (donc actif dès le tout
// premier script de la page, avant même `dist/app.js`) capture toute
// violation réelle sur un parcours complet : démarrage -> partie -> modal de
// score -> récapitulatif -> export PDF -> lanceur de dés -> dés lancés.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path, { extname } from 'node:path';
import { expect, test } from '@playwright/test';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
};

interface VercelHeaderRule {
  source: string;
  headers: Array<{ key: string; value: string }>;
}

async function loadVercelHeaders(): Promise<Array<[string, string]>> {
  const raw = await readFile(path.join(ROOT, 'vercel.json'), 'utf-8');
  const conf = JSON.parse(raw) as { headers: VercelHeaderRule[] };
  const rule = conf.headers.find(r => r.source === '/(.*)');
  if (!rule) throw new Error('vercel.json : règle d\'en-têtes "/(.*)" introuvable');
  return rule.headers.map(h => [h.key, h.value]);
}

async function startStaticServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const extraHeaders = await loadVercelHeaders();
  const cspHeader = extraHeaders.find(([k]) => k === 'Content-Security-Policy');
  if (!cspHeader) throw new Error('vercel.json : en-tête Content-Security-Policy introuvable');
  // Garde-fou : ce test n'a de sens que si `script-src` ne contient plus
  // 'unsafe-inline' — sinon il ne prouverait rien (une CSP qui autorise tout
  // ne peut pas être violée). Échoue bruyamment si la CSP a été relâchée.
  expect(cspHeader[1]).toMatch(/script-src[^;]*'self'[^;]*;/);
  expect(cspHeader[1].match(/script-src[^;]*/)?.[0]).not.toContain('unsafe-inline');

  const server = createServer((req, res) => {
    (async () => {
      const reqPath = (req.url || '/').split('?')[0];
      const filePath = path.join(DIST, reqPath === '/' ? 'index.html' : reqPath);
      if (!filePath.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
      try {
        const body = await readFile(filePath);
        const headers: Record<string, string> = { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' };
        for (const [k, v] of extraHeaders) headers[k] = v;
        res.writeHead(200, headers);
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

test('CSP resserrée (script-src sans unsafe-inline) : parcours complet sans aucune violation', async ({ page }) => {
  const server = await startStaticServer();
  try {
    const violations: string[] = [];
    const pageErrors: string[] = [];
    page.on('pageerror', err => pageErrors.push(String(err)));
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (e) => {
        (window as unknown as { __cspViolations: string[] }).__cspViolations ??= [];
        (window as unknown as { __cspViolations: string[] }).__cspViolations.push(
          `${e.violatedDirective} :: ${e.blockedURI} :: ${e.sourceFile}:${e.lineNumber}`,
        );
      });
    });

    await page.goto(server.url);
    await page.locator('#btn-privacy-accept').click();
    await expect(page.locator('.preset-card').first()).toBeVisible();

    // Écran de démarrage : quelques-uns des boutons re-câblés (élément G).
    await page.locator('#theme-gear-btn').click();
    await page.locator('#theme-back-btn').click();
    await page.locator('#lang-flag-btn').click();
    await page.locator('#lang-flag-btn').click();

    await page.locator('.preset-card').first().click();
    await page.locator('#go-btn').click();
    await page.locator('#names-go-btn').click();
    await expect(page.locator('.pcard .score').first()).toBeVisible();

    // Modal de score.
    await page.evaluate(() => (window as unknown as { ScoreTrack: { game: { openScoreModal: (i: number) => void } } }).ScoreTrack.game.openScoreModal(0));
    await page.locator('.key-btn', { hasText: /^5$/ }).click();
    await page.locator('#score-modal-confirm-btn').click();

    // Récapitulatif + export PDF (jsPDF bundlé, aucun <script> externe).
    await page.locator('#bar-recap-btn').click();
    await expect(page.locator('#recap')).not.toHaveClass(/\bhidden\b/);
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#btn-pdf-dl').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
    await page.locator('#recap').evaluate(el => el.classList.add('hidden'));

    // Lanceur de dés : ouverture, config, lancer, choix du joueur, fermeture.
    await page.locator('#dice-fab').click();
    await page.locator('#dice-faces-plus').click();
    await page.locator('#dice-faces-minus').click();
    await page.locator('#dice-roll-btn').click();
    await expect(page.locator('#dice-post')).toBeVisible({ timeout: 10000 });
    await page.locator('#dice-add-btn').click();
    await page.locator('#dice-pick-back').click();
    await page.locator('#dice-close-btn').click();

    const collected = await page.evaluate(() => (window as unknown as { __cspViolations?: string[] }).__cspViolations || []);
    violations.push(...collected);

    expect(violations, `violations CSP relevées : ${JSON.stringify(violations, null, 2)}`).toEqual([]);
    expect(pageErrors, `erreurs JS relevées : ${JSON.stringify(pageErrors, null, 2)}`).toEqual([]);
  } finally {
    await server.close();
  }
});

// P2-3 relevé par le critique de l'élément G (docs/audit/G-critique-round1.md) :
// aucun test committé n'exerçait le geste de fermeture par glissement tactile
// du lanceur de dés (seuils 120px / 0,3px·ms, CLAUDE.md) sous la CSP
// resserrée — vérifié manuellement par le critique (0 violation), mais sans
// protection contre une régression future. Playwright n'a pas d'API haut
// niveau pour un glissement tactile multi-étapes (seulement des taps) : les
// vrais évènements `touchstart`/`touchmove`/`touchend` de src/dice-ui.ts
// (`initDiceDrag`) sont donc synthétisés via le protocole CDP
// (`Input.dispatchTouchEvent`), comme l'a fait le critique pour sa propre
// vérification.
async function dispatchTouch(
  cdp: import('@playwright/test').CDPSession,
  type: 'touchStart' | 'touchMove' | 'touchEnd',
  x: number,
  y: number,
): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
  });
}

test('CSP resserrée : fermeture du lanceur de dés par glissement tactile, sans violation', async ({ page }) => {
  const server = await startStaticServer();
  try {
    const violations: string[] = [];
    const pageErrors: string[] = [];
    page.on('pageerror', err => pageErrors.push(String(err)));
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (e) => {
        (window as unknown as { __cspViolations: string[] }).__cspViolations ??= [];
        (window as unknown as { __cspViolations: string[] }).__cspViolations.push(
          `${e.violatedDirective} :: ${e.blockedURI}`,
        );
      });
    });

    await page.goto(server.url);
    await page.locator('#btn-privacy-accept').click();
    await page.locator('.preset-card').first().click();
    await page.locator('#go-btn').click();
    await page.locator('#names-go-btn').click();
    await expect(page.locator('.pcard .score').first()).toBeVisible();

    await page.locator('#dice-fab').click();
    await expect(page.locator('#dice-overlay')).not.toHaveClass(/\bhidden\b/);

    const cdp = await page.context().newCDPSession(page);
    const top = page.locator('#dice-sheet-top');
    const box = await top.boundingBox();
    if (!box) throw new Error('dice-sheet-top introuvable');
    const x = box.x + box.width / 2;
    const y0 = box.y + 8; // proche du haut, hors des boutons de configuration

    // 1. Glissement court et lent (< 120px, vitesse < 0,3 px/ms) : ne doit PAS fermer.
    await dispatchTouch(cdp, 'touchStart', x, y0);
    await dispatchTouch(cdp, 'touchMove', x, y0 + 30);
    await page.waitForTimeout(150);
    await dispatchTouch(cdp, 'touchMove', x, y0 + 60);
    await page.waitForTimeout(150);
    await dispatchTouch(cdp, 'touchEnd', x, y0 + 60);
    await page.waitForTimeout(350); // laisse la transition de rebond se terminer
    await expect(page.locator('#dice-overlay')).not.toHaveClass(/\bhidden\b/);

    // 2. Glissement long et rapide (> 120px, vitesse > 0,3 px/ms) : doit fermer.
    await dispatchTouch(cdp, 'touchStart', x, y0);
    await dispatchTouch(cdp, 'touchMove', x, y0 + 60);
    await dispatchTouch(cdp, 'touchMove', x, y0 + 180); // +120px en une frame : vitesse élevée
    await dispatchTouch(cdp, 'touchEnd', x, y0 + 180);
    await expect(page.locator('#dice-overlay')).toHaveClass(/\bhidden\b/, { timeout: 1000 });

    const collected = await page.evaluate(() => (window as unknown as { __cspViolations?: string[] }).__cspViolations || []);
    violations.push(...collected);

    expect(violations, `violations CSP relevées : ${JSON.stringify(violations, null, 2)}`).toEqual([]);
    expect(pageErrors, `erreurs JS relevées : ${JSON.stringify(pageErrors, null, 2)}`).toEqual([]);
  } finally {
    await server.close();
  }
});

// Fermeture de dette style-src (post-audit) : l'animation d'élimination
// (src/animations.ts) est le code qui a révélé le besoin de style-src-attr
// — elle mutait `skull.style.cssText=...` (attribut style entier, restreint)
// à chaque frame. Corrigée pour muter des propriétés CSSOM individuelles
// (`.style.fontSize=`, `.opacity=`, `.filter=`, `.transform=`), autorisées
// par `style-src-attr 'unsafe-inline'`. Ce test la laisse jouer JUSQU'AU
// BOUT (pas d'arrêt anticipé) pour couvrir réellement chaque mutation de
// chaque frame, contrairement aux tests fonctionnels existants qui arrêtent
// l'animation immédiatement (`stopElimAnim`) pour ne pas dépendre de sa durée.
test("CSP resserrée : l'animation d'élimination (mutations de style par frame) ne déclenche aucune violation", async ({ page }) => {
  const server = await startStaticServer();
  try {
    const violations: string[] = [];
    const pageErrors: string[] = [];
    page.on('pageerror', err => pageErrors.push(String(err)));
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (e) => {
        (window as unknown as { __cspViolations: string[] }).__cspViolations ??= [];
        (window as unknown as { __cspViolations: string[] }).__cspViolations.push(
          `${e.violatedDirective} :: ${e.blockedURI}`,
        );
      });
    });

    await page.goto(server.url);
    await page.locator('#btn-privacy-accept').click();

    // Configure une partie en mode élimination (comme
    // e2e/onclick-wiring.spec.ts::configureCustomGame) : 2 joueurs, 0 point
    // de départ, objectif "Défaite" à 0 -> le premier ajustement négatif
    // déclenche #elim-modal, exactement comme un vrai coup joué.
    await page.locator('#players-grid .player-chip', { hasText: /^2$/ }).click();
    await page.locator('#start-presets .points-chip[data-val="0"]').click();
    await page.locator('#obj-elim').click();
    await page.locator('#objectif-presets .points-chip[data-oval="0"]').click();
    await expect(page.locator('#go-btn')).toBeEnabled();
    await page.locator('#go-btn').click();
    await page.locator('#names-go-btn').click();
    await expect(page.locator('.pcard .score').first()).toBeVisible();

    // Déclenche l'élimination réelle via l'API exposée (comme
    // e2e/onclick-wiring.spec.ts), puis laisse l'animation jouer entièrement
    // (T_TOTAL ~1.8s + marge) au lieu de l'interrompre.
    await page.evaluate(() => (window as unknown as { ScoreTrack: { game: { adjust: (i: number, d: number) => void } } }).ScoreTrack.game.adjust(0, -1));
    await expect(page.locator('#elim-modal')).not.toHaveClass(/\bhidden\b/, { timeout: 5000 });
    await page.locator('#btn-elim-confirm-txt').click();
    await expect(page.locator('#elim-anim-overlay')).toHaveCSS('display', 'flex');
    await page.waitForTimeout(2500); // laisse l'animation (fragments + flash + fondu) jouer entièrement

    const collected = await page.evaluate(() => (window as unknown as { __cspViolations?: string[] }).__cspViolations || []);
    violations.push(...collected);

    expect(violations, `violations CSP relevées : ${JSON.stringify(violations, null, 2)}`).toEqual([]);
    expect(pageErrors, `erreurs JS relevées : ${JSON.stringify(pageErrors, null, 2)}`).toEqual([]);
  } finally {
    await server.close();
  }
});

// Preuve que `style-src-elem 'self'` bloque réellement un `<style>` injecté
// (par exemple par un futur bug d'injection HTML) — sans cette preuve,
// retirer 'unsafe-inline' de style-src-elem pourrait sembler correct alors
// qu'il n'aurait aucun effet réel (mesuré, pas supposé — même principe que
// la preuve équivalente pour script-src plus haut dans ce fichier).
test("CSP resserrée : un <style> injecté est bien bloqué par style-src-elem", async ({ page }) => {
  const server = await startStaticServer();
  try {
    await page.goto(server.url);
    const result = await page.evaluate(() => new Promise<{ blocked: boolean; violatedDirective: string | null }>((resolve) => {
      let violatedDirective: string | null = null;
      document.addEventListener('securitypolicyviolation', (e) => { violatedDirective = e.violatedDirective; }, { once: true });
      const marker = '__csp_style_injection_probe__';
      const style = document.createElement('style');
      style.textContent = `body::before{content:'${marker}';}`;
      document.head.appendChild(style);
      // Un `<style>` bloqué n'a aucun effet observable : son contenu ne
      // s'applique jamais, contrairement à une simple lecture du DOM (qui
      // verrait l'élément présent même bloqué).
      setTimeout(() => {
        const applied = getComputedStyle(document.body, '::before').content.includes(marker);
        resolve({ blocked: !applied, violatedDirective });
      }, 200);
    }));
    expect(result.violatedDirective).toBe('style-src-elem');
    expect(result.blocked, 'le <style> injecté a été appliqué : style-src-elem ne bloque rien').toBe(true);
  } finally {
    await server.close();
  }
});
