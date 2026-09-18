// Icônes SVG inline — tracés maison (grille 24 × 24, trait 2 px, coins et extrémités arrondis,
// `currentColor`), dans l'esprit Lucide/Feather. Aucune requête réseau : les tracés vivent ici,
// `assets/icons/sprite.svg` en est la projection (voir tests/unit/themes.test.js pour la synchronisation).
//
// Notation des tracés : chaîne SVG `d`, ou préfixe `circle:cx,cy,r`, `rect:x,y,w,h,rx`, `dot:cx,cy`
// (point plein de rayon 1,25). Une entrée peut être un objet `{ d, sw }` pour un trait spécifique.
//
// Taille optique — une icône se juge à la quantité d'encre qu'elle pose, pas à sa grille. Mesurées
// au pixel (scripts/audit-icons.mjs), les boîtes d'encre allaient de 14,3 u (`close`) à 23 u
// (`warning`) : dans une même barre, la croix ne pesait que 70 % de la rotation. Chaque icône porte
// donc un facteur `k` (et au besoin un décalage `dx`/`dy`) qui la ramène à ~20 u, appliqué comme
// une transformation autour du centre de la grille. L'épaisseur du trait est divisée par ce même
// facteur sur le groupe transformé : après mise à l'échelle, elle revaut exactement 2 unités, si
// bien que toutes les icônes gardent le même trait quel que soit leur facteur.

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Marque ScoreTrack (assets/brand/logo-mono.svg) : anneau à 4 sièges + bâtons de comptage. */
const BRAND = {
  vb: '0 0 512 512',
  d: [
    { d: 'M172 110.51A168 168 0 0 1 340 110.51', sw: 40 },
    { d: 'M401.49 172A168 168 0 0 1 401.49 340', sw: 40 },
    { d: 'M340 401.49A168 168 0 0 1 172 401.49', sw: 40 },
    { d: 'M110.51 340A168 168 0 0 1 110.51 172', sw: 40 },
    { d: 'M200 192v128', sw: 30 },
    { d: 'M256 192v128', sw: 30 },
    { d: 'M312 192v128', sw: 30 },
    { d: 'M166 322 346 190', sw: 30 },
  ],
};

export const ICONS = {
  target: BRAND,
  gear: {
    k: 0.9,
    d: [
      'circle:12,12,3',
      'circle:12,12,7',
      'M12 2v3M12 19v3M2 12h3M19 12h3',
      'M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12',
    ],
  },
  gamepad: {
    k: 0.9,
    d: [
      'M7 7h10a5 5 0 0 1 5 5v1a4 4 0 0 1-7 2.6l-.6-.6H9.6l-.6.6A4 4 0 0 1 2 13v-1a5 5 0 0 1 5-5z',
      'M6 11h4M8 9v4',
      'dot:15,12',
      'dot:17.5,9.5',
    ],
  },
  save: {
    d: [
      'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z',
      'M17 21v-8H7v8',
      'M7 3v5h8',
    ],
  },
  lock: { d: ['rect:4,11,16,10,2', 'M8 11V7a4 4 0 0 1 8 0v4'] },
  trash: {
    k: 0.95,
    dy: -0.5,
    d: [
      'M3 6h18',
      'M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2',
      'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6',
      'M10 11v6M14 11v6',
    ],
  },
  shuffle: {
    k: 0.98,
    dx: -0.5,
    d: ['M16 3h5v5', 'M4 20L21 3', 'M21 16v5h-5', 'M15 15l6 6', 'M4 4l5 5'],
  },
  rotate: { k: 0.98, d: ['M21 12a9 9 0 1 1-3-6.7', 'M21 3v6h-6'] },
  list: { k: 1.01, d: ['M8 6h13M8 12h13M8 18h13', 'dot:3.5,6', 'dot:3.5,12', 'dot:3.5,18'] },
  trophy: {
    k: 1.0,
    dy: -0.5,
    d: [
      'M8 21h8M12 17v4',
      'M7 4h10v6a5 5 0 0 1-10 0z',
      'M7 6H4a1 1 0 0 0-1 1v1a3 3 0 0 0 3 3h1',
      'M17 6h3a1 1 0 0 1 1 1v1a3 3 0 0 1-3 3h-1',
    ],
  },
  skull: {
    k: 0.95,
    dy: 0.5,
    d: [
      'M12 2a8 8 0 0 0-8 8c0 2.6 1.2 4.9 3 6.4V19a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2.6c1.8-1.5 3-3.8 3-6.4a8 8 0 0 0-8-8z',
      'circle:9,11,1.5',
      'circle:15,11,1.5',
      'M10 21v-3M14 21v-3',
      'M11 16h2',
    ],
  },
  check: { k: 1.1, dy: -0.2, d: ['M4 12.5l5 5L20 7'] },
  close: { k: 1.46, d: ['M18 6L6 18', 'M6 6l12 12'] },
  undo: { k: 1.1, d: ['M9 14L4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11'] },
  redo: { k: 1.1, d: ['M15 14l5-5-5-5', 'M20 9H9.5a5.5 5.5 0 0 0 0 11H13'] },
  plus: { k: 1.29, d: ['M12 5v14', 'M5 12h14'] },
  minus: { k: 1.29, d: ['M5 12h14'] },
  back: { k: 1.26, d: ['M19 12H5', 'M12 19l-7-7 7-7'] },
  play: {
    k: 1.06,
    dx: -1.9,
    d: ['M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z'],
  },
  dice: { d: ['rect:3,3,18,18,3', 'dot:8,8', 'dot:16,8', 'dot:12,12', 'dot:8,16', 'dot:16,16'] },
  clock: { d: ['circle:12,12,9', 'M12 7v5l3 2'] },
  edit: { k: 1.0, dy: 0.6, d: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'] },
  download: { d: ['M12 3v12', 'M7 10l5 5 5-5', 'M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2'] },
  upload: { k: 0.98, d: ['M12 15V3', 'M7 8l5-5 5 5', 'M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2'] },
  info: { d: ['circle:12,12,9', 'M12 11v5', 'dot:12,8'] },
  warning: {
    k: 0.86,
    dy: 0.1,
    d: [
      'M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
      'M12 9v4',
      'dot:12,17',
    ],
  },
  refresh: {
    k: 0.97,
    d: [
      'M3 12a9 9 0 0 1 15.5-6.3L21 8',
      'M21 3v5h-5',
      'M21 12a9 9 0 0 1-15.5 6.3L3 16',
      'M3 21v-5h5',
    ],
  },
  share: {
    k: 0.95,
    d: [
      'circle:18,5,2.5',
      'circle:6,12,2.5',
      'circle:18,19,2.5',
      'M8.2 13.2l7.6 4.6',
      'M15.8 6.2L8.2 10.8',
    ],
  },
  copy: {
    k: 0.95,
    dx: 0.5,
    dy: 0.5,
    d: ['rect:9,9,12,12,2', 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'],
  },
  users: {
    k: 0.9,
    dy: -0.2,
    d: [
      'circle:9,7,3.5',
      'M2 21v-1.5A4.5 4.5 0 0 1 6.5 15h5a4.5 4.5 0 0 1 4.5 4.5V21',
      'M16 3.6a3.5 3.5 0 0 1 0 6.8',
      'M22 21v-1.5a4.5 4.5 0 0 0-3-4.2',
    ],
  },
  palette: {
    k: 0.95,
    dx: -0.5,
    d: [
      'M12 3a9 9 0 0 0 0 18h1.5a2.5 2.5 0 0 0 1.8-4.2 1.5 1.5 0 0 1 1.1-2.6H18a4 4 0 0 0 4-4c0-4.4-4.5-7.2-10-7.2z',
      'dot:7.5,12',
      'dot:9.5,8',
      'dot:14,7',
      'dot:17.5,10',
    ],
  },
};

export const ICON_NAMES = Object.keys(ICONS);

/**
 * Décrit une entrée de tracé en élément SVG (nom + attributs), sans toucher au DOM :
 * partagé par icon() et par la génération du sprite.
 */
/** Transformation d'harmonisation optique d'une icône, ou null si elle est déjà à la bonne taille. */
export function opticalTransform(def) {
  const k = def.k || 1;
  const dx = def.dx || 0;
  const dy = def.dy || 0;
  if (k === 1 && !dx && !dy) return null;
  // Mise à l'échelle autour du centre de la grille 24 × 24, puis recentrage optique.
  return `translate(${12 + dx} ${12 + dy}) scale(${k}) translate(-12 -12)`;
}

export function shapeOf(entry) {
  const spec = typeof entry === 'string' ? { d: entry } : entry;
  const s = spec.d;
  const attrs = spec.sw ? { 'stroke-width': String(spec.sw) } : {};
  if (s.startsWith('circle:')) {
    const [cx, cy, r] = s.slice(7).split(',');
    return { tag: 'circle', attrs: { ...attrs, cx, cy, r } };
  }
  if (s.startsWith('rect:')) {
    const [x, y, width, height, rx] = s.slice(5).split(',');
    return { tag: 'rect', attrs: { ...attrs, x, y, width, height, rx } };
  }
  if (s.startsWith('dot:')) {
    const [cx, cy] = s.slice(4).split(',');
    return { tag: 'circle', attrs: { cx, cy, r: '1.25', fill: 'currentColor', stroke: 'none' } };
  }
  return { tag: 'path', attrs: { ...attrs, d: s } };
}

/**
 * Crée l'icône `name` : <svg class="icon" data-icon="name"> 24 × 24 en `currentColor`,
 * décorative par défaut (aria-hidden). Renvoie null si le nom est inconnu.
 */
export function icon(name) {
  const def = ICONS[name];
  if (!def) return null;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('viewBox', def.vb || '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.dataset.icon = name;
  const transform = opticalTransform(def);
  let parent = svg;
  if (transform) {
    parent = document.createElementNS(SVG_NS, 'g');
    parent.setAttribute('transform', transform);
    parent.setAttribute('stroke-width', String(+(2 / (def.k || 1)).toFixed(3)));
    svg.appendChild(parent);
  }
  for (const entry of def.d) {
    const { tag, attrs } = shapeOf(entry);
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, v] of Object.entries(attrs)) node.setAttribute(key, v);
    parent.appendChild(node);
  }
  return svg;
}

/**
 * Remplace chaque <span class="icon" data-icon="…">glyphe de secours</span> de `root`
 * par son SVG. Les classes supplémentaires et l'éventuel aria-label sont conservés ;
 * un nom inconnu laisse le glyphe de secours en place. Idempotent.
 */
export function hydrateIcons(root = document) {
  const nodes = root.querySelectorAll('.icon[data-icon]');
  let count = 0;
  for (const node of nodes) {
    if (node instanceof SVGElement) continue;
    const svg = icon(node.dataset.icon);
    if (!svg) continue;
    for (const cls of node.classList) if (cls !== 'icon') svg.classList.add(cls);
    const label = node.getAttribute('aria-label');
    if (label) {
      svg.setAttribute('aria-label', label);
      svg.setAttribute('role', 'img');
      svg.removeAttribute('aria-hidden');
    }
    if (node.title) svg.setAttribute('title', node.title);
    node.replaceWith(svg);
    count++;
  }
  return count;
}
