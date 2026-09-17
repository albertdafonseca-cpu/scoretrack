// Helpers DOM sûrs : sélection, création d'éléments, texte échappé, navigation entre pages.
import { icon as svgIcon } from './icons.js';

export const byId = (id) => document.getElementById(id);
export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Échappe une chaîne pour insertion dans du HTML (à n'utiliser que si innerHTML est inévitable). */
export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Crée un élément. `attrs` : className, id, style (texte CSS), dataset {…}, text, title, type…
 * Les enfants peuvent être des nœuds, des chaînes (→ nœuds texte) ou null/false (ignorés).
 */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'className') node.className = v;
    else if (k === 'style') node.style.cssText = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'text') node.textContent = v;
    else if (k in node && typeof v !== 'string') node[k] = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c);
  }
  return node;
}

/**
 * Icône SVG inline (js/ui/icons.js). Le second argument (ancien glyphe de secours) n'est
 * utilisé que si le nom est inconnu : on rend alors l'ancien <span class="icon">.
 */
export function icon(name, glyph) {
  return svgIcon(name) || el('span', { className: 'icon', dataset: { icon: name }, text: glyph });
}

export const show = (node) => node.classList.remove('hidden');
export const hide = (node) => node.classList.add('hidden');

/** Active une page (.page) par id et désactive les autres. */
export function showPage(id) {
  qsa('.page').forEach((p) => p.classList.remove('active'));
  byId(id).classList.add('active');
}

/** Masque toutes les pages (passage à l'écran de jeu, qui n'est pas une .page). */
export function hideAllPages() {
  qsa('.page').forEach((p) => p.classList.remove('active'));
}
