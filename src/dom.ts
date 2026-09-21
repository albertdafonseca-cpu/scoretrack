// Accès DOM typés. Les éléments de l'app sont statiques dans index.html : un id
// absent est un bug de structure, pas un cas à gérer -> `$` renvoie l'élément
// sans nullabilité (même comportement qu'avant : une erreur si l'id manque).

/** Élément par id, typé (par défaut HTMLElement). */
export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

/** Élément par id, ou null s'il n'existe pas (éléments optionnels). */
export function $opt<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

/** Tous les éléments d'un sélecteur, en tableau typé. */
export function $$<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T[] {
  return Array.from(root.querySelectorAll<T>(selector));
}

/** Premier élément d'un sélecteur, typé, ou null. */
export function $q<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T | null {
  return root.querySelector<T>(selector);
}

/**
 * Neutralise `& < > " '` pour une interpolation sûre dans du HTML construit en
 * chaîne (innerHTML). Toute donnée qui n'est pas un littéral fixe du code (nom
 * de joueur, texte saisi par l'utilisateur...) doit passer par ici avant d'être
 * concaténée dans un template `innerHTML` — sinon un nom contenant `<script>`,
 * `"`, `'` ou `</span>` peut casser la structure du DOM ou exécuter du code
 * (voir docs/audit/DECISIONS-B.md).
 */
export function escapeHtml(s: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(s).replace(/[&<>"']/g, c => map[c]);
}
