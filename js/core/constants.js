// Données statiques de l'application : thèmes, palette joueurs, préréglages.

export const THEMES = [
  { id: 'cyber', name: 'Cyberpunk', bg: '#020d12', a: '#00ffe0', b: '#00bfff' },
  { id: 'dark', name: 'Dark', bg: '#0a0a0f', a: '#6c63ff', b: '#a78bfa' },
  { id: 'neon-pink', name: 'Néon Rose', bg: '#0d0010', a: '#ff00cc', b: '#cc00ff' },
  { id: 'arcade', name: 'Arcade', bg: '#0a0800', a: '#ffdc00', b: '#ff8800' },
  { id: 'nature', name: 'Nature', bg: '#051208', a: '#50c850', b: '#88dd44' },
  { id: 'sunset', name: 'Sunset', bg: '#120508', a: '#ff6040', b: '#ffaa00' },
  { id: 'ocean', name: 'Océan', bg: '#020810', a: '#0096ff', b: '#00ccff' },
  { id: 'gold', name: 'Or', bg: '#0a0800', a: '#ddb800', b: '#ffee44' },
  { id: 'sobre', name: 'Sobre', bg: '#1c1c1e', a: '#e8e8e8', b: '#a0a0a0' },
  { id: 'mono', name: 'Mono sombre', bg: '#080808', a: '#ffffff', b: '#aaaaaa' },
  { id: 'light', name: 'Clair', bg: '#f0f4ff', a: '#3355cc', b: '#5577ee' },
  { id: 'mono-light', name: 'Mono clair', bg: '#ffffff', a: '#000000', b: '#444444' },
  { id: 'ldm', name: 'Loi du Milieu · Nuit', bg: '#2e2418', a: '#f0c040', b: '#ffe070' },
  { id: 'ldm-day', name: 'Loi du Milieu · Jour', bg: '#f5f0e8', a: '#7a5500', b: '#9e7000' },
];

/** Thème par défaut : aucun attribut data-theme n'est posé pour lui. */
export const DEFAULT_THEME = 'cyber';

// Palette Paul Tol — daltonien-safe
export const COLORS = [
  '#4477AA',
  '#EE6677',
  '#CCBB44',
  '#AA3377',
  '#228833',
  '#66CCEE',
  '#BBBBBB',
  '#EE7733',
  // Indigo Tol « muted ». Remplace #0077BB, trop proche de #4477AA (ΔE2000 4,4 en vision normale,
  // 2,0 en tritanopie : c'était le minimum de toute la palette). La paire passe à 27,5 / 20,1.
  // Doit rester identique à --tol-9 (css/tokens.css) : tests/unit/themes.test.js le vérifie.
  '#332288',
  '#EE3377',
  '#44AA99',
  '#DDCC77',
];

// Préréglages de jeux
export const GAME_PRESETS = [
  {
    name: 'Loi du Milieu',
    detail: '6j · 40pts · élim à 0',
    players: 6,
    start: 40,
    max: 40,
    neg: false,
  },
  { name: 'Poker', detail: '6j · 1000 jetons', players: 6, start: 1000, max: 0, neg: false },
  { name: 'Uno', detail: '4j · 500pts', players: 4, start: 500, max: 0, neg: false },
  { name: 'Bohnanza', detail: '4j · 0 départ', players: 4, start: 0, max: 0, neg: false },
  { name: 'Magic', detail: '4j · 20 PV · élim à 0', players: 4, start: 20, max: 0, neg: false },
  { name: 'Skyjo', detail: '4j · scores négatifs', players: 4, start: 0, max: 0, neg: true },
];

/** Touche symbolique « effacer » du pavé : rendue par l'icône SVG `back` (aucun glyphe système). */
export const KEYPAD_BACK = 'back';

/** Touches du pavé numérique de la modale de score. */
export const KEYPAD_KEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9, KEYPAD_BACK, 0, '00'];
