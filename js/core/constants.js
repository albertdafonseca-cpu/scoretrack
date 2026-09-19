// Données statiques de l'application : thèmes, palette joueurs, préréglages.

/* Les trois couleurs de chaque entrée servent l'aperçu de la grille de thèmes : elles doivent
   rester égales à --bg, --accent et --accent2 du thème correspondant, sinon l'aperçu ment sur ce
   que l'utilisateur va obtenir — et le nom de la carte, peint avec, tombe à 4,58:1 au lieu de
   dépasser le seuil avec marge. Verrouillé index par index par tests/unit/themes.test.js. */
export const THEMES = [
  { id: 'cyber', name: 'Cyberpunk', bg: '#020d12', a: '#00ffe0', b: '#00bfff' },
  { id: 'dark', name: 'Dark', bg: '#0a0a0f', a: '#8A83FF', b: '#B5A6FF' },
  { id: 'neon-pink', name: 'Néon Rose', bg: '#0d0010', a: '#FF33D6', b: '#D966FF' },
  { id: 'arcade', name: 'Arcade', bg: '#0a0800', a: '#ffdc00', b: '#FFA033' },
  { id: 'nature', name: 'Nature', bg: '#051208', a: '#50c850', b: '#88dd44' },
  { id: 'sunset', name: 'Sunset', bg: '#120508', a: '#FF7050', b: '#ffaa00' },
  { id: 'ocean', name: 'Océan', bg: '#020810', a: '#33A6FF', b: '#33D6FF' },
  { id: 'gold', name: 'Or', bg: '#0a0800', a: '#ddb800', b: '#ffee44' },
  { id: 'sobre', name: 'Sobre', bg: '#1c1c1e', a: '#e8e8e8', b: '#B0B0B5' },
  { id: 'mono', name: 'Mono sombre', bg: '#080808', a: '#ffffff', b: '#BBBBBB' },
  { id: 'light', name: 'Clair', bg: '#f0f4ff', a: '#2B48B4', b: '#2743A6' },
  { id: 'mono-light', name: 'Mono clair', bg: '#F4F4F4', a: '#000000', b: '#333333' },
  { id: 'ldm', name: 'Loi du Milieu · Nuit', bg: '#2e2418', a: '#f0c040', b: '#ffe070' },
  { id: 'ldm-day', name: 'Loi du Milieu · Jour', bg: '#f5f0e8', a: '#664600', b: '#5E4000' },
];

/** Thème par défaut : aucun attribut data-theme n'est posé pour lui. */
export const DEFAULT_THEME = 'cyber';

// Palette Paul Tol — daltonien-safe. Les teintes sont celles de Tol ; c'est leur ORDRE
// D'ATTRIBUTION qui est optimisé : à n joueurs, seules les n premières couleurs sont en jeu, donc
// l'ordre décide de la séparabilité réelle. Ordre mesuré par l'audit daltonisme
// (`npm run audit:cvd`, matrices Machado 2009) : l'écart minimal ΔE2000 sous les trois
// dichromaties passe de 8,6 à 15,1 à 6 joueurs, soit la porte « ≥ 14 » tenue jusqu'à 6 joueurs
// au lieu de 4 (2 j. 40,2 · 3 j. 29,9 · 4 j. 20,1 · 5 j. 15,7 · 6 j. 15,1 · 7 j. 11,2).
// L'indigo #332288 remplace #0077BB, trop proche de #4477AA (ΔE2000 4,4 en vision normale, 2,0 en
// tritanopie : c'était le minimum de la palette) ; la paire passe à 27,5 / 20,1.
// L'ordre DOIT rester identique à celui des jetons --tol-1…12 (css/tokens.css), dont dérivent les
// fonds de carte --card-N : tests/unit/themes.test.js le vérifie index par index.
export const COLORS = [
  '#EE6677',
  '#332288',
  '#66CCEE',
  '#4477AA',
  '#DDCC77',
  '#BBBBBB',
  '#AA3377',
  '#44AA99',
  '#228833',
  '#EE3377',
  '#CCBB44',
  '#EE7733',
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
