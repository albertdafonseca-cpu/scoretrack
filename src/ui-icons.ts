// ── Icônes fonctionnelles SVG (remplacement des émojis système) ────────────
// Contexte : docs/audit/BRIEF.md §9 (élément H), docs/audit/DECISIONS-H.md.
// Émojis remplacés : 🏆 (victoire), 🏁 (fin de manche / dernier perdant),
// 💀 (élimination), 🔒 (confidentialité). Rendu non maîtrisé selon la police
// système de la plateforme (P1 #7 du constat initial) et incohérent avec la
// charte visuelle sombre/nette du reste de l'app (moteur de dés notamment).
//
// Séparé de `icons.ts` : ce fichier fournit des icônes d'INTERFACE (SVG inline,
// insérées dans le DOM applicatif), alors que `icons.ts` génère l'icône
// d'application/favicon/manifest (canvas -> PNG/data URI), une responsabilité
// différente (voir CLAUDE.md).
//
// Contrainte D-CLAUDE-2 / D-PREF-1 (non négociable) : chaque icône doit rester
// identifiable par sa SILHOUETTE seule, pas seulement par sa couleur — un
// daltonien doit pouvoir distinguer trophée/drapeau/crâne/cadenas même en
// vision totalement achromatique. D'où 4 formes structurellement différentes
// (coupe à anses/socle, drapeau à damier, crâne à orbites/nez/dents, cadenas
// à anse/trou de serrure) plutôt que 4 pastilles de la même forme recolorées.
// Vérifié par capture Playwright + désaturation (voir DECISIONS-H.md §3).
//
// Toutes les icônes utilisent `fill="currentColor"` (sauf le damier du drapeau,
// volontairement achromatique blanc/transparent — un vrai drapeau à damier est
// noir et blanc par convention, ce qui renforce la contrainte daltonienne au
// lieu de la contourner) : la couleur suit celle du texte environnant (thème),
// jamais fixée en dur, pour rester cohérente dans les 22 thèmes de l'app.

/** Arrondit à 4 décimales et retire les zéros superflus : les coordonnées
 *  calculées ci-dessous (soustractions/divisions) produisent sinon des
 *  flottants à 17 chiffres (ex. `9.2-1.7` -> `7.499999999999999`) qu'un
 *  navigateur peut re-sérialiser différemment de Node à la relecture du DOM
 *  (`innerHTML`) — source de faux diffs dans les tests plutôt qu'un vrai
 *  problème de rendu (voir `e2e/functional-icons.spec.ts`, comparaison faite
 *  côté navigateur des deux côtés pour rester robuste dans tous les cas). */
function _fmt(n: number): string {
  return String(Math.round(n*10000)/10000);
}

/** Construit le sous-chemin (`d`) d'un cercle plein, réutilisable comme trou
 *  dans un path en `fill-rule="evenodd"` (orbites du crâne, trou de serrure). */
export function _circleSubpath(cx: number, cy: number, r: number): string {
  return `M${_fmt(cx+r)} ${_fmt(cy)} A${_fmt(r)} ${_fmt(r)} 0 1 0 ${_fmt(cx-r)} ${_fmt(cy)} A${_fmt(r)} ${_fmt(r)} 0 1 0 ${_fmt(cx+r)} ${_fmt(cy)} Z`;
}

/** Construit le sous-chemin (`d`) d'un rectangle à coins arrondis, en un seul
 *  contour fermé (utilisé pour le corps du cadenas). */
export function _roundedRectSubpath(x: number, y: number, w: number, h: number, r: number): string {
  const x2=x+w, y2=y+h;
  return `M${_fmt(x+r)} ${_fmt(y)} H${_fmt(x2-r)} A${_fmt(r)} ${_fmt(r)} 0 0 1 ${_fmt(x2)} ${_fmt(y+r)} V${_fmt(y2-r)} A${_fmt(r)} ${_fmt(r)} 0 0 1 ${_fmt(x2-r)} ${_fmt(y2)} H${_fmt(x+r)} A${_fmt(r)} ${_fmt(r)} 0 0 1 ${_fmt(x)} ${_fmt(y2-r)} V${_fmt(y+r)} A${_fmt(r)} ${_fmt(r)} 0 0 1 ${_fmt(x+r)} ${_fmt(y)} Z`;
}

/** Enveloppe commune : viewBox fixe 24×24, décorative (jamais annoncée seule
 *  par un lecteur d'écran — le texte adjacent porte déjà le sens, comme pour
 *  les émojis qu'elle remplace, déjà `aria-hidden` côté conteneur HTML). */
function _svg(inner: string): string {
  return `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${inner}</svg>`;
}

/** Trophée (victoire, remplace 🏆) : coupe à deux anses sur un socle à deux
 *  étages. Silhouette « objet posé », bien distincte du drapeau et du crâne. */
export const ICON_TROPHY: string = _svg(
  '<path fill="currentColor" d="M6 3H18V6C18 9.87 15.31 13 12 13C8.69 13 6 9.87 6 6V3Z"/>'
  +'<path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" d="M6 4.6C2.5 4.6 2.5 9.4 6.35 10"/>'
  +'<path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" d="M18 4.6C21.5 4.6 21.5 9.4 17.65 10"/>'
  +'<rect fill="currentColor" x="11" y="13" width="2" height="3"/>'
  +'<rect fill="currentColor" x="9" y="16.2" width="6" height="1.6" rx="0.8"/>'
  +'<rect fill="currentColor" x="7" y="18.2" width="10" height="2.3" rx="1.15"/>'
);

/** Drapeau à damier (fin de manche / dernier perdant, remplace 🏁) : hampe +
 *  drapeau quadrillé. Le damier est volontairement noir/blanc (achromatique,
 *  pas `currentColor`) — motif conventionnel du drapeau à damier, silhouette
 *  immédiatement différente de la coupe et du crâne. */
export const ICON_FLAG: string = (function build(){
  const cols=4, rows=3, x0=6.6, y0=3, w=12, h=8;
  const cw=w/cols, ch=h/rows;
  let cells='';
  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      const dark=(r+c)%2===0;
      const cx=x0+c*cw, cy=y0+r*ch;
      cells+=`<rect x="${_fmt(cx)}" y="${_fmt(cy)}" width="${_fmt(cw)}" height="${_fmt(ch)}" fill="${dark?'currentColor':'none'}" stroke="currentColor" stroke-width="0.25"/>`;
    }
  }
  return _svg(
    '<rect fill="currentColor" x="5" y="2" width="1.6" height="20" rx="0.8"/>'
    +`<g>${cells}</g>`
  );
})();

/** Crâne (élimination, remplace 💀) : crâne arrondi, deux orbites et un nez en
 *  creux (vrais trous transparents via `fill-rule="evenodd"`, pas une couleur
 *  plaquée — fonctionne sur n'importe quel fond), mâchoire dentée. Silhouette
 *  ronde bien distincte du drapeau (rectiligne) et du trophée (anses). */
export const ICON_SKULL: string = _svg(
  '<path fill="currentColor" fill-rule="evenodd" d="'
  +'M12 2.4C7.6 2.4 4.9 5.6 4.9 9.5C4.9 12 5.9 13.5 6.7 14.3L6.7 16.1'
  +'C6.7 16.8 7.2 17.3 7.8 17.3L7.8 18.6L9.2 18.6L9.2 17.3L10.5 17.3L10.5 18.6L13.5 18.6L13.5 17.3'
  +'L14.8 17.3L14.8 18.6L16.2 18.6L16.2 17.3C16.8 17.3 17.3 16.8 17.3 16.1L17.3 14.3'
  +'C18.1 13.5 19.1 12 19.1 9.5C19.1 5.6 16.4 2.4 12 2.4Z'
  +' '+_circleSubpath(9.2,9.6,1.7)
  +' '+_circleSubpath(14.8,9.6,1.7)
  +' M12 11.3L10.85 13.7L13.15 13.7Z'
  +'"/>'
);

/** Cadenas (confidentialité, remplace 🔒) : anse en arc + corps arrondi percé
 *  d'un trou de serrure (même technique de trou transparent que le crâne).
 *  Silhouette verticale à anse, la seule des quatre avec un arc ouvert en
 *  haut — aucune confusion possible avec les trois autres. */
export const ICON_LOCK: string = _svg(
  '<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M8.2 10V7.4a3.8 3.8 0 0 1 7.6 0V10"/>'
  +'<path fill="currentColor" fill-rule="evenodd" d="'
  +_roundedRectSubpath(5,10,14,11,2.5)
  +' '+_circleSubpath(12,14.5,1.5)
  +' M11 15.7L13 15.7L13.7 18.6L10.3 18.6Z'
  +'"/>'
);

/** Icône de victoire selon le rôle : champion unique (trophée) ou finisher /
 *  dernier perdant désigné (drapeau) — reflète la même distinction que
 *  `winIcon`/`isChampCard` dans `src/game.ts` (aucune notion de couleur). */
export function victoryIcon(isChampion: boolean): string {
  return isChampion ? ICON_TROPHY : ICON_FLAG;
}
