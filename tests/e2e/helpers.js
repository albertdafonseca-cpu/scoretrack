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
 * Contraste approché sur les PIXELS RÉELLEMENT RENDUS (D16), pour les nœuds qu'axe laisse
 * indéterminés (halos `text-shadow`, fonds en dégradé). Une capture de la page est décodée dans
 * un canevas, puis, pour chaque sélecteur, la luminance des pixels de sa boîte est triée : le
 * 1ᵉʳ et le 99ᵉ centile approchent le cœur des glyphes et le fond. La valeur est indicative à
 * ±0,3 sur du texte fin ; elle sert à détecter un vrai échec, pas à certifier une réussite au 1/100.
 */
export async function renderedContrast(page, selectors) {
  // Une capture prise avant la fin du chargement des polices mesurerait une police de secours :
  // la valeur changerait d'une exécution à l'autre.
  await page.evaluate(() => document.fonts.ready);
  // Capture pleine page à la résolution de l'appareil : réduire l'image ferait fondre le cœur des
  // glyphes fins dans le fond et sous-estimerait le contraste.
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
      const channel = (v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return selectors.map((sel) => {
        const el = document.querySelector(sel);
        if (!el || el.offsetParent === null) return { sel, skipped: 'invisible' };
        // Les contrôles désactivés sont exemptés du critère de contraste (WCAG 1.4.3).
        if (el.closest('[disabled], [aria-disabled="true"]')) return { sel, skipped: 'désactivé' };
        const r = el.getBoundingClientRect();
        // Le pourtour (coins arrondis, halo, ombre portée) est ignoré : seule la zone intérieure,
        // où le texte repose sur son propre fond, est échantillonnée. Coordonnées document.
        const dpr = window.devicePixelRatio || 1;
        const inset = Math.ceil(Math.min(r.width, r.height) * 0.12 * dpr);
        const x = Math.max(0, Math.round((r.left + window.scrollX) * dpr) + inset);
        const y = Math.max(0, Math.round((r.top + window.scrollY) * dpr) + inset);
        const w = Math.min(Math.round(r.width * dpr) - 2 * inset, canvas.width - x);
        const h = Math.min(Math.round(r.height * dpr) - 2 * inset, canvas.height - y);
        if (w < 4 || h < 4) return { sel, skipped: 'hors cadre' };
        if (x + w > canvas.width || y + h > canvas.height) return { sel, skipped: 'hors capture' };
        const data = ctx.getImageData(x, y, w, h).data;
        const lums = [];
        for (let i = 0; i < data.length; i += 4) {
          lums.push(
            0.2126 * channel(data[i]) +
              0.7152 * channel(data[i + 1]) +
              0.0722 * channel(data[i + 2]),
          );
        }
        lums.sort((a, b) => a - b);
        const at = (p) => lums[Math.min(lums.length - 1, Math.floor(p * (lums.length - 1)))];
        const dark = at(0.01);
        const light = at(0.99);
        const fontSize = parseFloat(getComputedStyle(el).fontSize);
        const weight = Number(getComputedStyle(el).fontWeight) || 400;
        const large = fontSize >= 24 || (fontSize >= 18.66 && weight >= 700);
        return {
          sel,
          fontSize,
          large,
          ratio: Number(((light + 0.05) / (dark + 0.05)).toFixed(2)),
        };
      });
    },
    { shot, selectors },
  );
}
