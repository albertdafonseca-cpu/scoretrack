// Aides communes aux tests de bout en bout (parcours d'entrée, accessibilité).
import { expect } from '@playwright/test';

/** Erreurs console/page à ignorer : uniquement les échecs réseau de polices en environnement à proxy TLS. */
const IGNORED = /ERR_CERT_AUTHORITY_INVALID/;

/** Collecte les erreurs de page et de console ; renvoie le tableau (vide attendu en fin de test). */
export function collectErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  return errors;
}

/**
 * Ouvre l'application à froid et attend la disparition du splash.
 * Le service worker est neutralisé par défaut : sa bannière « nouvelle version » recouvre le bas
 * de l'écran et appartient aux tests PWA, pas au parcours d'entrée.
 */
export async function openApp(page, { clearStorage = true, serviceWorker = false } = {}) {
  if (!serviceWorker) {
    await page.addInitScript(() => {
      if (!navigator.serviceWorker) return;
      navigator.serviceWorker.register = () => new Promise(() => {});
      navigator.serviceWorker.getRegistrations = () => Promise.resolve([]);
    });
  }
  await page.goto('/');
  if (clearStorage) {
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  }
  await expect(page.locator('#splash')).toHaveCount(0);
  await expect(page.locator('#setup-page')).toBeVisible();
}

/**
 * Écarte la bannière système « nouvelle version » si le service worker en affiche une : elle
 * recouvre le bas de l'écran de jeu et n'a rien à voir avec le parcours d'entrée testé ici.
 */
export async function dismissUpdateBanner(page) {
  const later = page.locator('#update-banner button', { hasText: /Plus tard|Ignorer/ });
  if (await later.isVisible().catch(() => false)) await later.click();
}

/** Tap « + » ou « − » sur une carte : demi-zones explicites de l'écran de jeu. */
export async function tapCard(page, cardId, side) {
  await dismissUpdateBanner(page);
  await page.locator(`#${cardId} .tap-half.${side}`).tap();
}

/**
 * Rectangles des cibles interactives visibles d'un conteneur, avec leur libellé.
 * Renvoie la liste de celles dont la largeur ou la hauteur est < `min` (vide attendu).
 */
export async function undersizedTargets(page, rootSelector, min = 44) {
  return page.evaluate(
    ({ rootSelector, min }) => {
      const root = document.querySelector(rootSelector);
      const sel = 'button, [role="button"], [role="switch"], input, a[href], [tabindex="0"]';
      return Array.from(root.querySelectorAll(sel))
        .filter((n) => {
          const cs = getComputedStyle(n);
          return cs.display !== 'none' && cs.visibility !== 'hidden' && n.offsetParent !== null;
        })
        .map((n) => {
          const r = n.getBoundingClientRect();
          return {
            label: (n.getAttribute('aria-label') || n.textContent || n.id || n.className)
              .trim()
              .slice(0, 40),
            w: Math.round(r.width),
            h: Math.round(r.height),
          };
        })
        .filter((t) => t.w < min || t.h < min);
    },
    { rootSelector, min },
  );
}

/**
 * Tailles de police calculées (px) des textes visibles d'un conteneur, sous le plancher `min`
 * (D10 : 12 px). Renvoie un nœud par sélecteur fautif, avec sa taille mesurée.
 */
export async function undersizedTexts(page, rootSelector, min = 12) {
  return page.evaluate(
    ({ rootSelector, min }) => {
      const root = document.querySelector(rootSelector);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const out = [];
      let node;
      while ((node = walker.nextNode())) {
        if (!node.textContent.trim()) continue;
        const el = node.parentElement;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || el.offsetParent === null)
          continue;
        if (el.closest('.sr-only')) continue;
        const px = parseFloat(cs.fontSize);
        if (px < min - 0.01) {
          const id = el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}.${el.className}`;
          out.push({ sel: id.slice(0, 48), text: node.textContent.trim().slice(0, 24), px });
        }
      }
      return out;
    },
    { rootSelector, min },
  );
}

/** Applique un thème (le thème par défaut n'a pas d'attribut) et attend le recalcul du style. */
export async function useTheme(page, id) {
  await page.evaluate(async (theme) => {
    document.documentElement.setAttribute('data-theme', theme === 'cyber' ? '' : theme);
    // Les puces transitionnent leur couleur sur --dur-1 (120 ms) : sans attendre la fin, une
    // mesure de contraste peut lire une couleur intermédiaire et signaler une fausse régression.
    await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {})));
  }, id);
}

/** Identifiants des 14 thèmes, lus depuis la source unique js/core/constants.js. */
export async function themeIds(page) {
  return page.evaluate(async () => {
    const mod = await import('/js/core/constants.js');
    return mod.THEMES.map((t) => t.id);
  });
}

/**
 * Contraste d'un texte : couleur de premier plan DÉCLARÉE (`getComputedStyle().color` — c'est ce
 * que WCAG 1.4.3 évalue) contre fond RÉELLEMENT RENDU (D16), échantillonné SANS AUCUN GLYPHE dessus.
 *
 * MÉTHODE (alignée sur `scripts/audit-contrast.mjs`, qui fait foi en intégration continue) : les
 * boîtes d'encre sont relevées AVANT de rien masquer (union des `getClientRects()` des nœuds de
 * texte propres de l'élément, via `Range` — c'est la zone où un glyphe est réellement peint, ni
 * plus, ni moins) ; tous les premiers plans sont ensuite rendus transparents (`color: transparent`
 * partout, transitions coupées) et UNE SEULE capture est prise dans cet état : les glyphes ont
 * disparu, mais la composition du fond — moitiés tactiles teintées, texture, liseré d'état — reste
 * peinte à l'identique. Le fond mesuré n'est donc jamais un mélange de glyphe et de fond.
 *
 * DEUX défauts d'une version antérieure (mode/moyenne sur une capture AVEC le texte visible),
 * tous deux relevés par l'agent B sur pixels réels, disparaissent avec cette méthode :
 *   1. le mode de l'histogramme sur toute la boîte REMBOURRÉE ne pouvait pas voir un fond
 *      DÉCENTRÉ — une bande de 8 px à la jointure des deux moitiés (liseré pressé/butée/flash)
 *      passait sous le prénom à 1,2–1,8:1 pendant que le reste de la boîte, majoritaire en
 *      pixels, restait à plus de 9:1 et emportait le mode ;
 *   2. quadranter la boîte encore visible, même réduite à l'encre, restait CONTAMINÉ par les
 *      pixels du glyphe lui-même dans les cellules où il est dense (le numéro de siège ne fait que
 *      quelques pixels de haut) — masquer le texte avant de photographier retire ce mélange à la
 *      racine plutôt que d'essayer de l'estimer.
 * La boîte d'encre est découpée en 2 × 2 quadrants (même grille que le script de référence) et
 * c'est le PIRE quadrant (moyenne de ses pixels, désormais tous des pixels de fond) qui fait foi.
 * Un élément sans texte propre (icône, pastille) retombe sur sa boîte de rembourrage, bordure
 * exclue.
 * Renvoie `{ sel, ratio, fontSize, large }` ou `{ sel, skipped }` pour un nœud non mesurable.
 */
export async function renderedContrast(page, selectors) {
  // Une capture prise avant la fin du chargement des polices mesurerait une police de secours.
  await page.evaluate(() => document.fonts.ready);
  // 1. Couleur déclarée + boîte d'encre de chaque sélecteur, PENDANT que le texte est encore là.
  const meta = await page.evaluate((selectors) => {
    const parseColor = (css) => {
      const n = css.match(/[\d.]+/g);
      if (!n) return null;
      const v = n.slice(0, 3).map(Number);
      const alpha = n.length > 3 ? Number(n[3]) : 1;
      if (alpha < 1) return null; // couleur translucide : le fond échantillonné suffit mal
      return css.startsWith('color(') ? v.map((x) => x * 255) : v;
    };
    return selectors.map((sel) => {
      const el = document.querySelector(sel);
      if (!el || el.offsetParent === null) return { sel, skipped: 'invisible' };
      if (el.closest('[disabled], [aria-disabled="true"]')) return { sel, skipped: 'désactivé' };
      const cs = getComputedStyle(el);
      const fg = parseColor(cs.color);
      if (!fg) return { sel, skipped: 'couleur non résolue' };
      // Boîte d'ENCRE réelle du texte propre de l'élément (union des rects de ses nœuds de texte
      // directs, via Range) : elle délimite où un glyphe est effectivement peint, ni plus (la
      // boîte rembourrée déborde souvent dans des marges sans encre) ni moins (elle couvre les
      // plusieurs lignes d'un score coupé, pas seulement la première).
      let ink = null;
      const range = document.createRange();
      for (const node of el.childNodes) {
        if (node.nodeType !== 3 || !node.textContent.trim()) continue;
        range.selectNodeContents(node);
        for (const cr of range.getClientRects()) {
          if (cr.width < 0.5 || cr.height < 0.5) continue;
          ink = ink
            ? {
                left: Math.min(ink.left, cr.left),
                top: Math.min(ink.top, cr.top),
                right: Math.max(ink.right, cr.right),
                bottom: Math.max(ink.bottom, cr.bottom),
              }
            : { left: cr.left, top: cr.top, right: cr.right, bottom: cr.bottom };
        }
      }
      const dpr = window.devicePixelRatio || 1;
      let box;
      if (ink) {
        box = ink;
      } else {
        // Pas de nœud de texte propre (icône, pastille de couleur) : repli sur la boîte de
        // REMBOURRAGE, bordure exclue — sur un élément petit et cerclé (le numéro de siège fait
        // 20 px de côté), les pixels lissés de la bordure dominaient l'histogramme et faisaient
        // lire un « fond » à mi-chemin entre le trait et la carte, un faux défaut à 1,7:1.
        const r = el.getBoundingClientRect();
        const bt = parseFloat(cs.borderTopWidth) || 0;
        const br = parseFloat(cs.borderRightWidth) || 0;
        const bb = parseFloat(cs.borderBottomWidth) || 0;
        const bl = parseFloat(cs.borderLeftWidth) || 0;
        const inset = r.width - bl - br >= 4 && r.height - bt - bb >= 4;
        box = {
          left: r.left + (inset ? bl : 0),
          top: r.top + (inset ? bt : 0),
          right: r.right - (inset ? br : 0),
          bottom: r.bottom - (inset ? bb : 0),
        };
      }
      const x = Math.max(0, Math.round((box.left + window.scrollX) * dpr));
      const y = Math.max(0, Math.round((box.top + window.scrollY) * dpr));
      const w = Math.round((box.right - box.left) * dpr);
      const h = Math.round((box.bottom - box.top) * dpr);
      if (w < 2 || h < 2) return { sel, skipped: 'boîte trop petite' };
      const fontSize = parseFloat(cs.fontSize);
      const weight = Number(cs.fontWeight) || 400;
      return {
        sel,
        fg,
        x,
        y,
        w,
        h,
        fontSize,
        large: fontSize >= 24 || (fontSize >= 18.66 && weight >= 700),
      };
    });
  }, selectors);
  // 2. Premier plan transparent PARTOUT (glyphes et icônes), transitions coupées pour ne pas
  //    capturer un fondu à mi-chemin, puis DEUX trames avant la photo pour que ce soit peint.
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.id = '__contrast-hide';
    style.textContent = `
      *, *::before, *::after {
        color: transparent !important;
        text-shadow: none !important;
        transition: none !important;
        animation: none !important;
      }
      svg * { stroke: transparent !important; fill: transparent !important; }
    `;
    document.head.appendChild(style);
    return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  const shot = (await page.screenshot({ scale: 'device', fullPage: true })).toString('base64');
  await page.evaluate(() => document.getElementById('__contrast-hide')?.remove());
  // 3. Fond composé, texte absent : le PIRE quadrant de la boîte d'encre fait foi.
  return page.evaluate(
    ({ shot, meta }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${shot}`;
      return new Promise((resolve) => {
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0);
          const chan = (v) => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          };
          const lum = (r, g, b) => 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
          resolve(
            meta.map((m) => {
              if (m.skipped) return m;
              const { sel, fg, x, y, w, h, fontSize, large } = m;
              if (x + w > canvas.width || y + h > canvas.height) {
                return { sel, skipped: 'hors capture' };
              }
              // 2 × 2, comme scripts/audit-contrast.mjs : c'est la grille de référence.
              const fgLum = lum(fg[0], fg[1], fg[2]);
              let worst = null;
              for (let cy = 0; cy < 2; cy++) {
                for (let cx = 0; cx < 2; cx++) {
                  const cw = Math.max(1, Math.floor(w / 2));
                  const ch = Math.max(1, Math.floor(h / 2));
                  const ox = x + cx * cw;
                  const oy = y + cy * ch;
                  if (ox + cw > canvas.width || oy + ch > canvas.height) continue;
                  const px = ctx.getImageData(ox, oy, cw, ch).data;
                  let sr = 0;
                  let sg = 0;
                  let sb = 0;
                  let n = 0;
                  for (let i = 0; i < px.length; i += 4) {
                    sr += px[i];
                    sg += px[i + 1];
                    sb += px[i + 2];
                    n++;
                  }
                  if (n === 0) continue;
                  const bgLum = lum(sr / n, sg / n, sb / n);
                  const [hi, lo] = [fgLum, bgLum].sort((a, b) => b - a);
                  const ratio = (hi + 0.05) / (lo + 0.05);
                  if (worst === null || ratio < worst) worst = ratio;
                }
              }
              if (worst === null) return { sel, skipped: 'fond indiscernable du texte' };
              return { sel, fontSize, large, ratio: Number(worst.toFixed(2)) };
            }),
          );
        };
      });
    },
    { shot, meta },
  );
}
/**
 * Cibles recouvertes : pour chaque contrôle visible, le point central doit appartenir au contrôle
 * lui-même (WCAG 2.5.8 / 2.4.11). Un panneau surplombant ferait échouer ce contrôle, là où une
 * comparaison de bords ne voit rien.
 */
export async function obstructedTargets(page, rootSelector = 'body') {
  return page.evaluate((rootSelector) => {
    const root = document.querySelector(rootSelector);
    const sel = 'button, [role="button"], [role="switch"], [role="radio"], input, a[href]';
    return Array.from(root.querySelectorAll(sel))
      .filter((n) => {
        const cs = getComputedStyle(n);
        return cs.visibility !== 'hidden' && cs.display !== 'none' && n.offsetParent !== null;
      })
      .map((n) => {
        const r = n.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const vw = document.documentElement.clientWidth;
        const vh = document.documentElement.clientHeight;
        if (cx < 0 || cy < 0 || cx > vw || cy > vh) return null; // hors écran : non concerné
        const hit = document.elementFromPoint(cx, cy);
        if (hit && (hit === n || n.contains(hit) || hit.contains(n))) return null;
        return {
          el: n.id || n.getAttribute('aria-label') || n.className,
          covertBy: hit ? hit.id || hit.className || hit.nodeName : 'rien',
        };
      })
      .filter(Boolean);
  }, rootSelector);
}

/** Sauvegarde minimale valide, pour les scénarios de reprise. */
export function validSave(players = 2) {
  return JSON.stringify({
    v: 2,
    players: Array.from({ length: players }, (_, i) => ({
      playerName: `Joueur ${i + 1}`,
      score: 10 + i,
      eliminated: false,
    })),
    seatOrder: Array.from({ length: players }, (_, i) => i),
    log: { entries: [], cursor: 0 },
    numPlayers: players,
    startPoints: 10,
    maxPoints: null,
    allowNeg: false,
    ts: Date.now(),
  });
}

/**
 * Décalage cumulé de mise en page (CLS) d'un chargement, mesuré comme le fait un outil de terrain :
 * `PerformanceObserver({type:'layout-shift'})`, décalages consécutifs à un geste exclus, CPU bridé
 * pour que le JavaScript s'exécute après le premier rendu (sans bridage, le défaut reste invisible).
 * `storage` est écrit avant le chargement mesuré ; `query` s'ajoute à l'URL.
 */
export async function measureLayoutShift(page, { storage = {}, query = '', cpu = 4 } = {}) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  await page.goto('/');
  // La mesure doit porter sur la version courante : un service worker déjà actif servirait la
  // version précédente et fausserait le résultat dans les deux sens.
  await page.evaluate(async () => {
    if (navigator.serviceWorker) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  });
  await page.addInitScript(() => {
    if (!navigator.serviceWorker) return;
    navigator.serviceWorker.register = () => new Promise(() => {});
    navigator.serviceWorker.getRegistrations = () => Promise.resolve([]);
  });
  await page.evaluate((entries) => {
    localStorage.clear();
    for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
  }, storage);
  // Idempotent : `addInitScript` s'accumule sur une même page, et deux observateurs compteraient
  // chaque décalage deux fois (défaut qui gonflait la mesure d'un facteur égal au nombre d'appels).
  await page.addInitScript(() => {
    if (window.__clsObserver) return;
    window.__shifts = [];
    window.__clsObserver = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (!e.hadRecentInput) window.__shifts.push(e.value);
    });
    window.__clsObserver.observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto(`/${query}`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const shifts = await page.evaluate(() => window.__shifts);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  return Number(shifts.reduce((a, b) => a + b, 0).toFixed(4));
}
