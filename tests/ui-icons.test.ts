// Élément H (round 4, post-clôture) — remplacement des émojis système
// utilisés comme icônes fonctionnelles (🏆 victoire, 🏁 fin de manche /
// dernier perdant, 💀 élimination, 🔒 confidentialité — P1 #7 du constat
// initial) par de vraies icônes SVG inline (src/ui-icons.ts).
//
// `src/ui-icons.ts` est un module pur (aucun DOM, aucune dépendance) : ces
// tests l'importent directement, sans passer par la façade de
// `tests/support/loadGame.{js,d.ts}` (contrairement aux tests de l'élément
// B) — rien dans ce fichier ne déclenche le conflit de types
// `tsconfig.test.json` documenté dans docs/audit/DECISIONS-B.md §4.
//
// Chaque test ci-dessous a été mutation-testé manuellement lors de la
// construction du correctif (règle cassée puis restaurée, échec confirmé
// avant restauration — voir docs/audit/DECISIONS-H.md §2 pour le détail
// exact de chaque mutation).
import { describe, expect, it } from 'vitest';
import {
  ICON_FLAG, ICON_LOCK, ICON_SKULL, ICON_TROPHY,
  _circleSubpath, _roundedRectSubpath, victoryIcon,
} from '../src/ui-icons';

/** Analyse un fragment SVG comme un vrai DOM (jsdom, environnement de test
 *  déjà configuré pour Vitest) plutôt que par des expressions régulières
 *  fragiles sur la chaîne — cohérent avec l'usage du DOM ailleurs dans les
 *  tests de ce dépôt (ex. tests/game.injection.test.ts). */
function parseIcon(svgString: string): SVGSVGElement {
  const div = document.createElement('div');
  div.innerHTML = svgString;
  const svg = div.querySelector('svg');
  if (!svg) throw new Error('icône SVG introuvable dans : ' + svgString);
  return svg as unknown as SVGSVGElement;
}

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

describe('src/ui-icons.ts — enveloppe commune des 4 icônes', () => {
  it.each([
    ['ICON_TROPHY', ICON_TROPHY],
    ['ICON_FLAG', ICON_FLAG],
    ['ICON_SKULL', ICON_SKULL],
    ['ICON_LOCK', ICON_LOCK],
  ])('%s : un seul <svg>, viewBox 24×24, classe ui-icon, décoratif (aria-hidden)', (_name, icon) => {
    const svg = parseIcon(icon);
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg.getAttribute('class')).toBe('ui-icon');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    // `focusable="false"` : ancienne convention IE/Edge encore utile sur les
    // lecteurs d'écran qui traitent <svg> comme focusable par défaut.
    expect(svg.getAttribute('focusable')).toBe('false');
  });

  it.each([
    ['ICON_TROPHY', ICON_TROPHY],
    ['ICON_FLAG', ICON_FLAG],
    ['ICON_SKULL', ICON_SKULL],
    ['ICON_LOCK', ICON_LOCK],
  ])('%s : aucun caractère émoji dans la chaîne générée (le remplacement est réel, pas cosmétique)', (_name, icon) => {
    expect(icon).not.toMatch(EMOJI_RE);
  });

  it('les 4 icônes ont des signatures structurelles toutes différentes (D-CLAUDE-2/D-PREF-1)', () => {
    // Preuve mécanique que la distinction ne repose PAS sur la couleur :
    // chaque icône est construite avec une combinaison différente de
    // primitives SVG (nombre de <path>/<rect>, présence de trous
    // `fill-rule="evenodd"`, présence de traits `stroke`) — c'est très
    // exactement ce qu'un daltonien perçoit (la forme), indépendamment de
    // `currentColor`. Voir aussi la preuve visuelle (capture + désaturation
    // `filter:grayscale(100%)`) décrite dans docs/audit/DECISIONS-H.md §3.
    function fingerprint(svg: string): string {
      const paths = (svg.match(/<path/g) || []).length;
      const rects = (svg.match(/<rect/g) || []).length;
      const evenodd = (svg.match(/fill-rule="evenodd"/g) || []).length;
      const strokedPaths = (svg.match(/stroke="currentColor"/g) || []).length;
      return `paths=${paths};rects=${rects};evenodd=${evenodd};strokes=${strokedPaths}`;
    }
    const icons = { trophy: ICON_TROPHY, flag: ICON_FLAG, skull: ICON_SKULL, lock: ICON_LOCK };
    const prints = Object.entries(icons).map(([k, v]) => [k, fingerprint(v)] as const);
    const uniquePrints = new Set(prints.map(([, p]) => p));
    expect(uniquePrints.size, `signatures : ${JSON.stringify(prints)}`).toBe(4);
  });
});

describe('src/ui-icons.ts — victoryIcon (distinction champion / finisher)', () => {
  it('victoryIcon(true) renvoie EXACTEMENT ICON_TROPHY', () => {
    expect(victoryIcon(true)).toBe(ICON_TROPHY);
  });
  it('victoryIcon(false) renvoie EXACTEMENT ICON_FLAG', () => {
    expect(victoryIcon(false)).toBe(ICON_FLAG);
  });
  it('les deux branches ne renvoient jamais la même icône (mutation type : polarité inversée)', () => {
    // Une mutation réaliste et sournoise sur ce genre de fonction est
    // d'inverser silencieusement la condition ternaire (`isChampion ?
    // ICON_FLAG : ICON_TROPHY`) : les deux tests ci-dessus la détecteraient
    // déjà indépendamment, mais cette 3e assertion vérifie explicitement
    // l'invariant qui rend cette mutation détectable par construction (si
    // les deux branches renvoyaient un jour la même chaîne par erreur, ce
    // test échouerait même si un seul des deux tests précédents restait
    // vert par coïncidence).
    expect(victoryIcon(true)).not.toBe(victoryIcon(false));
  });
});

describe('src/ui-icons.ts — helpers géométriques purs (trous evenodd)', () => {
  it('_circleSubpath : sous-chemin fermé, 2 arcs, rayon respecté (extrémités à cx±r)', () => {
    const d = _circleSubpath(10, 5, 2);
    expect(d.startsWith('M12 5')).toBe(true); // cx+r
    expect(d).toContain('A2 2 0 1 0 8 5'); // cx-r, rayon 2
    expect(d.endsWith('Z')).toBe(true);
  });

  it('_roundedRectSubpath : sous-chemin fermé passant par les 4 coins arrondis attendus', () => {
    const d = _roundedRectSubpath(0, 0, 10, 10, 2);
    expect(d.startsWith('M2 0')).toBe(true); // x+r, y
    expect(d).toContain('H8'); // x2-r
    expect(d.endsWith('Z')).toBe(true);
    // 4 arcs de coin (commande "A") : un de moins que 4 serait un rectangle
    // avec un coin droit resté carré — régression facile à introduire par
    // erreur d'index en modifiant la formule.
    expect((d.match(/A/g) || []).length).toBe(4);
  });

  it('les deux helpers sont bien ceux utilisés par ICON_SKULL/ICON_LOCK (pas dupliqués ailleurs)', () => {
    // Non-régression légère : si `_circleSubpath`/`_roundedRectSubpath`
    // étaient un jour dupliqués localement dans ICON_SKULL/ICON_LOCK plutôt
    // que réutilisés, une correction de bug dans le helper ne se
    // propagerait plus aux icônes qui en dépendent réellement.
    expect(ICON_SKULL).toContain(_circleSubpath(9.2, 9.6, 1.7));
    expect(ICON_LOCK).toContain(_roundedRectSubpath(5, 10, 14, 11, 2.5));
  });
});
