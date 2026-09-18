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
  await page.evaluate((theme) => {
    document.documentElement.setAttribute('data-theme', theme === 'cyber' ? '' : theme);
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
 * que WCAG 1.4.3 évalue) contre fond RÉELLEMENT RENDU (D16) : une capture de la page est décodée
 * dans un canevas et le fond est la couleur dominante (mode de l'histogramme) de la boîte de
 * l'élément, ce qui reste juste sous un dégradé, une texture ou un halo. Aucune approximation sur
 * le texte : les pixels de glyphe ne servent plus à estimer le premier plan.
 * Renvoie `{ sel, ratio, fontSize, large }` ou `{ sel, skipped }` pour un nœud non mesurable.
 */
export async function renderedContrast(page, selectors) {
  // Une capture prise avant la fin du chargement des polices mesurerait une police de secours.
  await page.evaluate(() => document.fonts.ready);
  const shot = (await page.screenshot({ scale: 'device', fullPage: true })).toString('base64');
  return page.evaluate(
    async ({ shot, selectors }) => {
      const img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = `data:image/png;base64,${shot}`;
      });
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
        const r = el.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const x = Math.max(0, Math.round((r.left + window.scrollX) * dpr));
        const y = Math.max(0, Math.round((r.top + window.scrollY) * dpr));
        const w = Math.round(r.width * dpr);
        const h = Math.round(r.height * dpr);
        if (w < 4 || h < 4) return { sel, skipped: 'boîte trop petite' };
        if (x + w > canvas.width || y + h > canvas.height) return { sel, skipped: 'hors capture' };
        const data = ctx.getImageData(x, y, w, h).data;
        // Fond = couleur la plus fréquente de la boîte, PIXELS DE GLYPHE EXCLUS : sur un grand
        // titre au halo, le texte peut occuper la majorité de la boîte et fausserait le mode.
        const hist = new Map();
        for (let i = 0; i < data.length; i += 4) {
          const d =
            (data[i] - fg[0]) ** 2 + (data[i + 1] - fg[1]) ** 2 + (data[i + 2] - fg[2]) ** 2;
          if (d < 60 * 60) continue; // proche de la couleur du texte : c'est un glyphe
          const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
          const cur = hist.get(key);
          if (cur) {
            cur.n++;
            cur.r += data[i];
            cur.g += data[i + 1];
            cur.b += data[i + 2];
          } else hist.set(key, { n: 1, r: data[i], g: data[i + 1], b: data[i + 2] });
        }
        let best = null;
        for (const bucket of hist.values()) if (!best || bucket.n > best.n) best = bucket;
        if (!best) return { sel, skipped: 'fond indiscernable du texte' };
        const bg = [best.r / best.n, best.g / best.n, best.b / best.n];
        const [hi, lo] = [lum(fg[0], fg[1], fg[2]), lum(bg[0], bg[1], bg[2])].sort((a, b) => b - a);
        const fontSize = parseFloat(cs.fontSize);
        const weight = Number(cs.fontWeight) || 400;
        return {
          sel,
          fontSize,
          large: fontSize >= 24 || (fontSize >= 18.66 && weight >= 700),
          ratio: Number(((hi + 0.05) / (lo + 0.05)).toFixed(2)),
        };
      });
    },
    { shot, selectors },
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
