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

/** Ouvre l'application à froid et attend la disparition du splash. */
export async function openApp(page, { clearStorage = true } = {}) {
  await page.goto('/');
  if (clearStorage) {
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  }
  await expect(page.locator('#splash')).toHaveCount(0);
  await expect(page.locator('#setup-page')).toBeVisible();
}

/** Tape sur une carte : `side` = 'plus' | 'minus' selon l'orientation de la carte. */
export async function tapCard(page, cardId, side) {
  const card = page.locator(`#${cardId}`);
  const rot = await card.evaluate((c) => [...c.classList].find((k) => k.startsWith('rot-')));
  const box = await card.boundingBox();
  const far = side === 'plus' ? 0.8 : 0.2;
  const near = 1 - far;
  let x = box.x + box.width / 2;
  let y = box.y + box.height / 2;
  if (rot === 'rot-l') y = box.y + box.height * far;
  else if (rot === 'rot-r') y = box.y + box.height * near;
  else if (rot === 'rot-180') x = box.x + box.width * near;
  else x = box.x + box.width * far;
  await page.touchscreen.tap(x, y);
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

/** Tailles de police calculées (px) des textes visibles d'un conteneur, inférieures à `min`. */
export async function undersizedTexts(page, rootSelector, min = 11) {
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
        if (px < min) out.push({ text: node.textContent.trim().slice(0, 30), px });
      }
      return out;
    },
    { rootSelector, min },
  );
}
