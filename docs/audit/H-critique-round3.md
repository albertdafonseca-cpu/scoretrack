# H-critique-round3 — Vérification indépendante de l'élément H, round 3

Agent critique indépendant, isolé dans un `git worktree --detach` sur
`7e1f7ca` (`/tmp/claude-0/.../scratchpad/wt3`, supprimé en fin de mission —
`git worktree remove --force` confirmé, `git worktree list` ne montre plus
que le dépôt principal). Toutes les commandes, captures et mutations
ci-dessous ont été réellement exécutées/générées/inspectées dans ce
worktree. Les rounds précédents (`H-critique-round1.md`,
`H-critique-round2.md`) n'ont pas été modifiés.

## Verdict

**AAA : non.** La question la plus importante de ce round (item 1) avait
une réponse : **oui, j'ai trouvé un nouveau contournement**, d'une famille
différente de celle explorée au round 2, et je l'ai appliqué réellement
dans `src/ui-icons.ts` pour le prouver sur le vrai test committé, pas
seulement sur un script de calcul séparé. Les 3 autres points de la
mission (fragments canvas, voiture du finisher, flakiness Playwright) sont
en revanche tous positifs pour le constructeur — je le documente aussi
complètement que le défaut trouvé, ce n'est pas symétriquement négatif.

---

## 1. Le point le plus important : un nouveau contournement d'`icon-shape-metrics.spec.ts`

### 1.1 Ce qui a été essayé d'abord et n'a PAS marché (documenté par honnêteté)

Sur la suggestion du round 2 (« cadenas très allongé »), j'ai d'abord
cherché une géométrie de cadenas étiré (corps rectangulaire haut et étroit
+ petite anse, sans trou de serrure) visant le trophée (paire d'origine la
plus proche : `trophy↔skull=58`, marge de seulement 10 avant le seuil de
48 — plus fragile en apparence que `skull↔lock=64`). Recherche numérique
par balayage de paramètres (`ahash-search4.mjs`/`5.mjs`), meilleur résultat
trouvé : distance de Hamming trophée↔cadenas = 46.

**Appliqué réellement dans `src/ui-icons.ts`, testé sur le vrai
`e2e/icon-shape-metrics.spec.ts`** :
```
trophy↔lock = 46   (< 48)
✘ ÉCHEC — le test DÉTECTE correctement cette géométrie.
```
**Ce n'est donc pas un contournement : c'est une confirmation
supplémentaire, sur une paire et une famille de silhouette que ni le
constructeur ni moi n'avions testées explicitement, que le correctif du
round 3 fonctionne.** Je le documente pour être honnête sur la méthode
(cohérent avec ce que le constructeur rapporte lui-même en `DECISIONS-H.md`
§12 sur sa première piste écartée) — restauré, `git diff --stat
src/ui-icons.ts` vide confirmé.

### 1.2 Le contournement qui fonctionne : cadenas « visage » en CONTOUR (pas en corps plein)

Le round 2 attaquait avec un corps **plein** (`fill`, `fill-rule=evenodd`).
J'ai changé de famille : un cadenas dessiné en **traits fins** (`stroke`,
sans remplissage) — un cercle-tête, deux petits cercles-yeux, un trait
vertical-nez, une petite anse — qui exploite une propriété différente de
l'average hash : le seuil de l'empreinte est la **luminance MOYENNE de
l'image elle-même**, pas un seuil fixe. Un dessin à faible taux d'encre
(traits fins sur fond blanc) a une moyenne très différente d'un dessin
plein (comme `ICON_SKULL`), ce qui déplace le comportement du seuillage
d'une façon que le round 2 n'avait pas explorée (il n'avait testé que des
variantes à corps plein).

Recherche numérique (`ahash-search6.mjs`, même mesure exacte que le test :
canvas réel du navigateur, average hash 16×16, distance de Hamming) :

```
thin3_small (cercle r=4, 2 yeux r=0.8, nez, petite anse, tout en stroke)
  d_skull  = 52   (>= 48 → PASSERAIT le test)
  d_trophy = 66
  d_flag   = 71
  d_lock   = 68
```

### 1.3 Appliqué réellement dans le code, vérifié sur le vrai test committé

```ts
export const ICON_LOCK: string = _svg(
  '<circle cx="12" cy="13" r="4" fill="none" stroke="currentColor" stroke-width="1.1"/>'
  +'<circle cx="10.3" cy="12.6" r="0.8" fill="none" stroke="currentColor" stroke-width="0.77"/>'
  +'<circle cx="13.7" cy="12.6" r="0.8" fill="none" stroke="currentColor" stroke-width="0.77"/>'
  +'<line x1="12" y1="14.2" x2="12" y2="15.7" stroke="currentColor" stroke-width="0.77" stroke-linecap="round"/>'
  +'<path fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" d="M11 9V6.5a1 1 0 0 1 2 0V9"/>'
);
```

```
$ npm run build
$ npx playwright test e2e/icon-shape-metrics.spec.ts e2e/functional-icons.spec.ts --workers=1
  ✓ les 4 icônes ont des métriques globales de forme séparées par une marge réelle (round 2)
  ✓ les 4 icônes restent perceptuellement distinctes (average hash, structure locale, round 3)
  ✓ les 4 icônes restent 4 silhouettes structurellement distinctes (D-CLAUDE-2/D-PREF-1)
  ✓ (7 autres tests de functional-icons.spec.ts)
  10 passed (13.5s)

$ npm run test
 ❯ tests/ui-icons.test.ts › les deux helpers sont bien ceux utilisés par ICON_SKULL/ICON_LOCK
   (échec — coïncidence, ce test vérifie la réutilisation de `_roundedRectSubpath`,
   que ma mutation n'utilise plus du tout ; sans rapport avec la distinguabilité —
   exactement le même schéma qu'aux rounds 1 et 2)
 Tests  1 failed | 121 passed (122)
```

**Les 2 tests spécifiquement conçus pour empêcher ce genre de régression —
`icon-shape-metrics.spec.ts` (les deux, global ET average hash) et « 4
silhouettes structurellement distinctes » — passent tous les trois malgré
la mutation.** Seul l'échec accidentel habituel (sans rapport avec la
distinguabilité) se déclenche, pour la troisième fois consécutive sur trois
rounds différents.

### 1.4 Preuve visuelle réelle, dans l'application construite

Capture réelle (page confidentialité, bouton « PRIVACY », build complet,
pas un script de mesure isolé) :

À l'échelle réelle d'usage (24 px, en couleur violette du thème par défaut
et en niveaux de gris), l'icône se lit comme **un petit visage rond avec
deux points et un nez** — la même lecture que le crâne à côté, à un niveau
de détail près (pas de mâchoire). L'anse résiduelle en haut est visible
mais fine et facilement ignorée à cette taille. Restauré (`git diff --stat
src/ui-icons.ts` vide confirmé), 122/122 et 40/40 re-verts.

### 1.5 Ce que cela signifie

Ce n'est pas une critique du principe de l'average hash lui-même (bon
réflexe, le constructeur a d'ailleurs déjà démontré, en le testant
lui-même, que ce n'est pas une preuve d'impossibilité absolue). C'est la
confirmation de ce que le constructeur écrit honnêtement dans
`DECISIONS-H.md` §12 : sa propre tentative a montré qu'une approche
antérieure (grille fine 12×12) donnait un résultat moins bon qu'espéré, et
il ne revendique qu'une « amélioration mesurée », pas une garantie. J'ai
trouvé la famille suivante
à laquelle il n'avait pas encore pensé (contour fin plutôt que corps plein)
— il y en a probablement d'autres. **Une mesure perceptuelle grossière à
256 bits reste un résumé, pas une preuve géométrique ; elle réduit la
surface d'attaque de façon réelle et mesurable (round 2 : contournable à
0,220 sur une échelle 0–1 sans marge claire ; round 3 : il faut maintenant
changer de famille de dessin entièrement, pas juste ajuster des
paramètres, ce qui est un vrai progrès) mais ne l'élimine pas.**

---

## 2. Fragments canvas (`spawnFragments`/`drawFragSkull`) — vérifiés à plusieurs instants réels

`git diff a19cf25 7e1f7ca -- src/animations.ts` : `drawFragSkull` (chemins
canvas natifs — arc pour la tête, rect pour la mâchoire, 2 arcs sombres
pour les orbites, triangle pour le nez) remplace exactement
`fillText('☠️',...)`. Capturé à 6 instants réels
(`playElimAnim(0)` réellement joué, timing mesuré côté navigateur via
`performance.now()`, pas `waitForTimeout`) :

```
t=1900-3000ms : ~28 petits crânes vectoriels blancs (tête ronde, orbites et
                nez sombres) qui explosent, tournent et s'estompent — plus
                aucun glyphe emoji, à aucun des 6 instants observés.
```

Comparé à ma propre capture du round 2 (émojis ☠️ système, rendu
dépendant de la plateforme) : différence nette et confirmée. **Corrigé.**

## 3. Animation finisher (`_FIN_RACERS`) — vérifiée à plusieurs instants réels

`_finEmojiOk` et la branche `fillText('🏎️',...)` retirées ; le rendu
vectoriel F1 (déjà présent avant ce round comme filet de secours) est
désormais la seule voie. Capturé à 5 instants réels
(`playWinAnim(0)` avec `winRank=2`, timing mesuré côté navigateur) :

```
t=150-2000ms : 7 bolides dessinés en formes vectorielles (carrosserie
               colorée + roues rondes sombres), plus aucun glyphe emoji,
               drapeau à damier déjà vectoriel (`_finDrawFlag`) inchangé.
```

**Corrigé.** `python3` (comptage Unicode direct, plus fiable qu'un grep
shell sur ce fichier) confirme 0 occurrence de `🏎️` (U+1F3CE) dans
`src/animations.ts`.

## 4. `win-anim-trophy-canvas` (`🏁`, ligne ~837) — toujours du code mort, sans changement

`grep`/lecture directe : la ligne `_ctx.fillText('🏁',...)`
existe toujours (round 3 n'y touche pas, hors des deux zones autorisées).
Revérifié empiriquement (comme au round 2) : `playWinAnim(0)` avec
`winRank=2` donne toujours `winOverlayDisplay:"none"` et
`winCanvasOpacity:"0"` — **toujours sans impact visuel réel**, cohérent
avec mon constat du round 2 (P2, pas P1). Le constructeur ne l'a pas
touché, ce qui est correct : ce n'était pas dans les deux zones
explicitement autorisées par `docs/audit/BRIEF.md` (élargissement round 3).

## 5. Flakiness Playwright sous parallélisme par défaut — jugement

Reproduction indépendante : `npx playwright test` (parallélisme par
défaut) exécuté **7 fois** dans mon environnement (4 cœurs disponibles),
dont 2 exécutions à `--workers=4` explicitement : **40/40 verts les 7
fois, aucune instabilité observée.** `npx playwright test --workers=1` :
40/40 également.

Je n'ai donc pas pu reproduire l'instabilité que le constructeur et
l'orchestrateur ont observée sous 2 workers sur leur machine — ce qui est
cohérent avec un défaut d'infrastructure sensible aux ressources
disponibles (nombre de cœurs, charge machine au moment du test), pas avec
une régression déterministe dans le code livré. Éléments qui soutiennent
cette lecture :
- `CLAUDE.md` (racine du dépôt, instructions projet) documente déjà
  explicitement cette classe de problème : « au-delà d'une quinzaine de
  contextes WebGL simultanés, Chromium blanchit les canvases » — une
  limite connue et acceptée de l'environnement de test de ce projet,
  antérieure à l'élément H.
- Le test qui échoue change à chaque exécution rapportée par le
  constructeur (`fonts-self-hosted.spec.ts` au round 2,
  `functional-icons.spec.ts` puis `onclick-wiring.spec.ts` au round 3) —
  aucun des tests eux-mêmes du round 3 n'est le point commun, ce qui
  exclut un défaut logique localisé dans le nouveau code.
- `--workers=1` est déterministe et vert dans les deux camps (3/3 pour le
  constructeur, 1/1 pour moi).

**Jugement : limite acceptable de l'environnement à documenter, pas un
défaut de test à corriger dans ce chantier.** Je ne recommande pas de
bloquer le verdict pour ce point. Une amélioration future raisonnable
(hors périmètre de cet audit) serait de réduire le nombre de contextes
WebGL simultanés dans la config Playwright (`workers` plus bas par défaut
dans `playwright.config.ts`), mais ce n'est pas une régression introduite
par l'élément H.

## 6. Dernière passe exhaustive — aucun émoji fonctionnel manqué dans le périmètre P1 #7

Recherche par point de code Unicode exact (Python, plus fiable qu'un grep
shell sur de l'UTF-8 mêlé à du code), sur tout le dépôt (hors
`node_modules`/`.git`/`dist`/résultats de test), pour 🏆 🏁 💀 🔒 ☠ :

```
src/ui-icons.ts        : dans des COMMENTAIRES uniquement (« remplace 🏆 »...)
src/i18n/translations.ts : 36 (18 langues × 2 clés) — dette déjà documentée, hors périmètre
tests/*.test.ts, e2e/*.spec.ts : dans des regex de détection (EMOJI_RE) ou
                                  des chaînes de comparaison, jamais affichés
docs/*.md               : narratif d'audit, attendu
```

**Aucune nouvelle occurrence fonctionnelle/affichée trouvée.** 🏎️
(round 2) : confirmé à 0 dans `src/animations.ts`.

**Constat hors périmètre, à signaler sans le confondre avec le mandat
d'élément H** : `index.html` utilise encore une bonne vingtaine d'autres
émojis fonctionnels sans rapport avec les 4 ciblés par le P1 #7
(`⚙️` réglages, `🎨` thème, `🎮` partie en cours, `💾` mémoriser, `🗑`
supprimer, `🌙`/`☀️` thème sombre/clair, `🔀` mélanger, `✕` effacer/fermer,
`🔄` rotation, `📋` presse-papier, `🎲` lanceur de dés, `✅`/`❌`
valider/annuler, `📄` PDF). Aucun de ces cas ne relève de la contrainte
D-PREF-1 (deux états opposés distingués UNIQUEMENT par couleur) — ce sont
des symboles isolés, pas des paires chromatiques — donc ce n'est **pas**
une régression de ce que l'audit visait à corriger (P1 #7 nommait
explicitement 🏆/🏁/💀/🔒). Je le note pour la complétude demandée par la
mission (item 4 : « aucun autre émoji fonctionnel visible »), mais je ne le
compte pas comme un défaut de l'élément H : ni le brief, ni D21, ni aucun
round précédent n'a jamais inclus ces occurrences dans le périmètre.

---

## Défauts trouvés

**P1 — `e2e/icon-shape-metrics.spec.ts` (average hash, round 3) reste
contournable par une famille de silhouette différente de celle déjà
neutralisée.** Démontré par une géométrie de cadenas en contour fin
(cercle-tête + 2 petits cercles-yeux + nez + anse, tout en `stroke`, sans
remplissage) réellement substituée dans `src/ui-icons.ts`, mesurée à
`lock↔skull=52` (>= 48), qui passe les 3 tests dédiés à cette protection et
121/122 tests unitaires, et qui, dans l'application réelle, se lit comme un
visage/tête miniature à la place du cadenas de la page confidentialité.
**Correctif suggéré** : ajouter une métrique invariante au taux d'encre
propre à l'image — par exemple binariser par un seuil ABSOLU fixe (une
fraction de 255, ex. luminance < 128) plutôt que par la moyenne de l'image
elle-même (ce qui neutralise justement l'exploitation démontrée ici), en
plus (pas à la place) de l'average hash déjà en place ; ou repasser sur un
budget de similarité structurelle plus robuste (SSIM local, ou pHash basé
sur une DCT plutôt qu'une simple moyenne par bloc, moins sensible au taux
d'encre global). Comme au round 2, ceci ne remet pas en cause le travail
déjà en place — c'est une amélioration incrémentale d'une mesure qui s'est
déjà améliorée deux fois de suite.

Aucun autre défaut P1/P2 nouveau trouvé ce round : fragments canvas,
animation finisher, dead code `win-anim-trophy-canvas` (déjà noté P2 au
round 2) et flakiness Playwright sont tous positifs ou déjà correctement
classés.

---

## Fichiers/preuves produits pendant cette vérification

Tout le travail a eu lieu dans un worktree détaché sur `7e1f7ca`
(`/tmp/claude-0/.../scratchpad/wt3`), **supprimé** en fin de mission
(`git worktree remove --force`, confirmé par `git worktree list`). Aucun
fichier de ce worktree ne subsiste. Le seul fichier ajouté au dépôt
partagé par cette critique est le présent rapport,
`docs/audit/H-critique-round3.md` — les rounds précédents n'ont pas été
modifiés.
