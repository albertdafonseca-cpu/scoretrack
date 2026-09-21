# H-critique-round2 — Vérification indépendante de l'élément H, round 2

Agent critique indépendant, isolé dans un `git worktree --detach` sur
`a19cf25` (`/tmp/claude-0/.../scratchpad/wt2`, supprimé en fin de mission —
`git worktree remove --force` confirmé, `git worktree list` ne montre plus
que le dépôt principal, resté sur sa branche sans modification locale).
Toutes les commandes, captures, PDF et mutations ci-dessous ont été
réellement exécutés/générés/inspectés dans ce worktree.

## Verdict

**AAA : non**, mais pour une raison différente des 4 défauts du round 1 —
**les 4 défauts du round 1 sont corrigés et je le confirme moi-même avec
des preuves reproduites** (sections 1 à 4). Le nouveau motif de blocage
est une découverte faite en creusant précisément ce que le round 2 me
demandait de creuser en priorité (item 2, « le point le plus important de
ce round ») : **j'ai construit, avec la même méthode que celle qu'utilise
le nouveau test `icon-shape-metrics.spec.ts`, une géométrie de cadenas qui
reste au-dessus du seuil de 0,20 (0,220 mesuré) tout en étant, à l'écran
réel de l'application, visuellement quasiment indiscernable du crâne**
(section 6 — P1 nouveau). En creusant plus loin sur la demande de
jugement de l'item 5, j'ai aussi trouvé, en plus des deux occurrences déjà
documentées par le constructeur, une **troisième occurrence d'emoji non
inventoriée par personne** (🏎️, voiture de course, dans l'animation du
finisher) qui est, elle, réellement visible à l'écran (section 8).

---

## 1. P1-1 (recap-pdf.ts) — reproduction de ma mutation exacte du round 1

`statusIconKind()` extrait en fonction pure + `tests/recap-pdf.icons.test.ts`
espionne réellement `doc.circle`/`doc.triangle` d'une vraie instance jsPDF.

**Mutation A — dispatch inversé (exactement ma mutation du round 1)** :

```ts
if(iconKind==='trophy'){...drawSkullIcon...}
else if(iconKind==='skull'){...drawTrophyIcon...}
```

```
$ npm run test -- tests/recap-pdf.icons.test.ts
 ❯ joueur vainqueur : le PDF dessine le trophée (1 triangle, 0 cercle) — jamais le crâne
   expected 0 circles, got 3
 ❯ joueur éliminé : le PDF dessine le crâne (3 cercles, 1 triangle)
   expected 3 circles, got 0
 Tests  2 failed | 3 passed (5)
```

Confirmé aussi par un vrai PDF régénéré et converti en image
(`pdftoppm -r 96`) : badge « Winner #1 » en crâne vert, joueur éliminé en
trophée gris — inversion visible, exactement comme au round 1.

**Mutation B — différente de la mienne du round 1 : priorité inversée DANS
`statusIconKind` elle-même** (`if(p.eliminated) return 'trophy'; if(p.winner)
return 'skull';`) :

```
$ npm run test -- tests/recap-pdf.icons.test.ts
 Tests  3 failed | 2 passed (5)
```

Les deux mutations sont détectées, aux deux niveaux (fonction pure ET
dispatch réel). Restauré, `git diff --stat src/recap-pdf.ts` vide confirmé
à chaque fois, 118/118 et 37/37 re-verts après chaque restauration.

**P1-1 : corrigé, confirmé.**

## 2. P1-3 (`#elim-anim-skull`) — animation vérifiée en mouvement, pas à un instant figé

`git diff fe90c26 a19cf25 -- index.html` : exactement 2 lignes changées
(`color:#fff` ajouté à la règle CSS, le `☠️` remplacé par le HTML exact
d'`ICON_SKULL`). `src/animations.ts` : diff vide confirmé.

Capture à 11 instants réels de l'animation (`playElimAnim(0)` appelé
directement, timing mesuré depuis `performance.now()` interne à la page —
pas une estimation par `waitForTimeout` côté test, qui sous-estime le temps
réel écoulé à cause du coût des allers-retours Playwright, piège que j'ai
rencontré puis corrigé pendant cette vérification) :

```
t=100ms   opacity=1   fontSize≈45px    (croissance)
t=500ms   opacity=1   fontSize≈107px
t=900ms   opacity=1   fontSize≈217px
t=1300ms  opacity=1   fontSize≈323px
t=1700ms  opacity=1   fontSize≈288px   (léger rebond de la courbe, prévu par buildCurve)
t=1850ms  opacity=0.64 fontSize≈691px  (flash, ft en cours)
t=1950ms+ opacity=0   fontSize≈721px   (invisible, comme prévu par le code)
```

Captures réellement regardées à t=500/900/1850 : le crâne SVG blanc grandit
proprement avec son halo (`drop-shadow`), sans déformation, correctement
centré, avant que le flash blanc + les fragments (petites formes qui
explosent, voir section 8) ne prennent le relais. Comportement identique à
ce que ferait l'ancien glyphe texte, confirmant que le mécanisme
`fontSize`/`.ui-icon{width:1em;height:1em}` fonctionne bien pour cette
animation, comme l'affirme `DECISIONS-H.md` §10.3.

**P1-3 : corrigé, confirmé, aucune régression visuelle sur le cycle complet
de l'animation.**

## 3. P1-2 (test `icon-shape-metrics.spec.ts`) — le test lui-même est solide sur ses propres termes

```
$ npx playwright test e2e/icon-shape-metrics.spec.ts
✓ les 4 icônes ont des métriques de forme mesurées sur les pixels, séparées par une marge réelle (711ms)
```

Sur les pixels réellement rasterisés à 24×24 (taille réelle d'usage), avec
les 4 icônes non modifiées : distances mesurées identiques à celles
documentées (`lock↔skull=0.220` après le correctif P2-1, qui a changé
`ICON_SKULL` de façon marginale — voir note en section 7). Le principe du
test (mesurer une vraie géométrie sur les pixels plutôt qu'un comptage de
balises) est un progrès réel et sincère par rapport au round 1. **Mais**
voir section 6 : ce principe a une limite de fond que j'ai pu exploiter.

## 4. P2-1 (crâne PDF à l'échelle réelle) — réel progrès confirmé, même méthode qu'au round 1

PDF réellement régénéré (partie jouée jusqu'à victoire + élimination,
`recapPdf.exportRecapPDF()` réellement appelé, téléchargement intercepté),
`pdftoppm -r 96`, crop en pixels natifs sans interpolation (`Image.NEAREST`,
même méthode que ma critique round 1) :

À 96 dpi, le crâne (désormais 3,2 mm, orbites à 0,34×r) montre maintenant
**deux grands trous blancs (yeux) nettement visibles**, contre un disque
gris à deux points quasi invisibles au round 1. Amélioration réelle et
mesurable — le crâne se distingue maintenant sans ambiguïté du trophée à la
même échelle d'impression, même si le détail du nez/de la mâchoire reste
fondu (non bloquant : la paire d'orbites suffit à la lecture).

**P2-1 : corrigé, confirmé à l'échelle réelle.**

---

## 5. Mutation testing indépendant supplémentaire (item 1, 2 cas de plus)

Au-delà des 2 mutations recap-pdf.ts (section 1), j'ai rejoué la mutation
géométrique du round 1 sur `ICON_LOCK` (rayon d'arrondi à 7, anse réduite)
contre le nouveau test `icon-shape-metrics.spec.ts` pour voir si ce test la
détecte enfin :

```
lock↔skull mesuré avec cette géométrie : 0.4726  (>> 0.20, ÉLOIGNÉ)
```

Résultat inattendu et instructif : cette mutation-là s'éloigne du crâne
plutôt que de s'en rapprocher une fois mesurée par la vraie géométrie des
pixels (le rayon 7 réduit l'anse à presque rien, ce qui déplace le centre
de masse vers le bas — à l'opposé du crâne, qui a sa masse concentrée en
haut). **C'est exactement ce que `DECISIONS-H.md` §10.2 rapporte** : la
première tentative du constructeur de reproduire ma mutation du round 1
« s'est révélée géométriquement invalide... et augmentait la distance au
lieu de la diminuer ». Je confirme indépendamment ce constat, avant de
pousser plus loin (section 6).

## 6. Le point le plus important de ce round : j'ai trouvé une mutation qui contourne `icon-shape-metrics.spec.ts`

### 6.1 Méthode

Le test mesure 8 métriques globales (couverture d'encre, aspect de la
boîte englobante, centre de masse, répartition par quadrant) sur les pixels
réellement rasterisés à 24×24, et exige une distance euclidienne ≥ 0,20
entre chaque paire d'icônes. C'est une vraie amélioration par rapport au
comptage de balises du round 1, mais ce sont des moments statistiques
globaux — une déformation qui **rend le cadenas visuellement quasi
identique au crâne dans sa silhouette générale (tête ronde + 2 pastilles +
un « museau »)** peut très bien reproduire les mêmes valeurs agrégées
(couverture d'encre similaire, boîte à peu près carrée, masse concentrée en
haut) sans jamais réintroduire la structure fine (arête, angle droit, trou
de serrure) qui rendait l'original reconnaissable.

J'ai écrit un script de recherche (même mesure exacte que le test :
rasterisation sur un vrai `<canvas>` du navigateur, mêmes 8 métriques, même
formule de distance — code dupliqué à l'identique depuis
`e2e/icon-shape-metrics.spec.ts`) et j'ai itéré sur une géométrie de
cadenas alternative : corps circulaire (au lieu du rectangle arrondi), 2
trous ronds façon orbites (au lieu du trou de serrure), un « museau »
triangulaire, une anse réduite à un petit arceau presque décoratif en haut.

### 6.2 Résultat mesuré

```
lock(mutant)↔skull  = 0.2200   (>= 0.20 → le test PASSE, ne détecte rien)
lock(mutant)↔trophy = 0.5187
lock(mutant)↔flag   = 0.3478
```

### 6.3 Appliqué réellement dans `src/ui-icons.ts`, testé réellement

```ts
export const ICON_LOCK: string = _svg(
  '<path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" d="M10.9 5V2.1a1.1 1.1 0 0 1 2.2 0V5"/>'
  +'<path fill="currentColor" fill-rule="evenodd" d="'
  +_circleSubpath(12,12.7,5.3)
  +' '+_circleSubpath(10.1,12.1,1.1)
  +' '+_circleSubpath(13.9,12.1,1.1)
  +' M10.5 15.8L13.5 15.8L12 17.8Z'
  +'"/>'
);
```

```
$ npm run build && npx playwright test e2e/icon-shape-metrics.spec.ts e2e/functional-icons.spec.ts
✓ les 4 icônes ont des métriques de forme mesurées sur les pixels, séparées par une marge réelle (711ms)
✓ (les 8 autres tests de functional-icons.spec.ts, y compris « 4 silhouettes structurellement distinctes »)
  9 passed (9.7s)

$ npm run test
 ❯ tests/ui-icons.test.ts › les deux helpers sont bien ceux utilisés par ICON_SKULL/ICON_LOCK
   (échec — coïncidence, ce test vérifie la réutilisation de `_roundedRectSubpath`,
   que ma mutation n'utilise plus du tout, donc le test échoue pour une raison
   qui n'a rien à voir avec la distinguabilité visuelle)
 Tests  1 failed | 117 passed (118)
```

**9/9 tests e2e passent, y compris les deux tests spécifiquement conçus
pour empêcher ce genre de régression** (`icon-shape-metrics.spec.ts` et
« 4 silhouettes structurellement distinctes »). Le seul échec, comme au
round 1, est accidentel et sans rapport avec la distinguabilité.

### 6.4 Preuve visuelle — regardée réellement, pas seulement mesurée

Rendu à la taille réelle d'usage (24 px, capturé en `deviceScaleFactor:4`
pour rendre les pixels lisibles ici sans inventer de détail) **directement
dans l'application réelle construite** (page confidentialité, bouton
« 🔒 Privacy Policy » d'origine) :

En couleur (violet, thème par défaut) comme en niveaux de gris, l'icône du
bouton confidentialité **se lit comme une tête ronde avec deux points
sombres et un petit museau — pas comme un cadenas.** À côté du crâne
original (120 px et 24 px), les deux formes sont pratiquement les mêmes :
tête ronde, deux orbites, un repli triangulaire. La petite anse résiduelle
en haut (le seul indice qu'il s'agissait au départ d'un cadenas) est
minuscule et se perd facilement, en particulier à 24 px.

Restauré (`git diff --stat src/ui-icons.ts` vide confirmé), 118/118 et
37/37 re-verts.

### 6.5 Portée du constat

Ce n'est pas un simple « il existe un angle mort théorique » : c'est une
géométrie que j'ai réellement substituée dans le fichier livré, qui a
réellement traversé toute la suite de tests du round 2 sans un seul échec
pertinent, et qui produit, **dans l'application réelle**, une icône de
confidentialité qui ressemble à une tête de mort plutôt qu'à un cadenas —
exactement la classe de régression que ce nouveau test avait pour mission
d'empêcher (D-PREF-1/D-CLAUDE-2, non négociable). Le principe du test
(mesurer les pixels plutôt que compter des balises) est le bon réflexe,
mais 8 moments globaux ne suffisent pas à garantir qu'une silhouette reste
reconnaissable : deux formes très différentes structurellement peuvent
avoir la même couverture d'encre, le même centre de masse et la même
répartition par quadrant.

---

## 7. Vérification croisée : les icônes actuelles restent bien distinguables

Pour être clair : ceci ne remet pas en cause le travail déjà validé au
round 1 sur les 4 icônes **telles qu'elles existent aujourd'hui dans le
dépôt** — je les ai revérifiées, elles n'ont pas changé côté cadenas depuis
le round 1 (seul `ICON_SKULL` a été très légèrement modifié pour P2-1, sans
toucher `ICON_LOCK`). Le point est que **rien dans la suite de tests
actuelle n'empêcherait un futur changement, même bien intentionné, de faire
glisser silencieusement le cadenas vers une forme confondable** — ce que
`DECISIONS-H.md` §10.2 présente comme désormais résolu (« la garantie
D-PREF-1/D-CLAUDE-2 ... protégée par un test qui mesure une vraie
géométrie ») est correct en intention mais pas complet en couverture.

## 8. Jugement sur la dette annexe (item 5) — plus sérieuse que documentée, et incomplète

`DECISIONS-H.md` §10.3 documente 2 occurrences supplémentaires
d'emoji dans `src/animations.ts`, non traitées (hors mandat strict du
round 2) : `☠️` dans `spawnFragments` (particules d'explosion sur
`<canvas>`) et `🏁` dans une fonction liée à l'animation de victoire
(`fillText('🏁',...)`, ligne ~822). J'ai vérifié les deux, **et trouvé une
troisième, non documentée par personne**.

**Vérification empirique de la première (`☠️`, `spawnFragments`)** :
`playElimAnim(0)` déclenché réellement, capture pendant la phase
d'explosion (`t≈2100ms`) — **confirmé : environ 28 émojis ☠️ explosent
visiblement sur tout l'écran à chaque élimination**, rendus en glyphe
système via `fillText`. C'est loin d'être un détail marginal : c'est très
exactement le défaut d'origine (rendu non maîtrisé selon la plateforme,
P1 #7) réintroduit, sous une forme plus visible et plus fréquente (une
grosse volée d'emoji, pas une seule icône statique) que ce qui vient
d'être corrigé pour `#elim-anim-skull`.

**Vérification empirique de la deuxième (`🏁`, ligne ~822)** : contrairement
à ce que le nom laisserait supposer, **ce code est mort à l'exécution**.
Preuve : `playWinAnim(idx)` avec un joueur `winRank=2` (finisher, pas
champion) déclenché réellement — mesure des styles calculés :
```
winOverlayDisplay: "none"    (jamais affiché pour un finisher)
winCanvasOpacity:  "0"       (le canvas où l'émoji est dessiné reste invisible)
finOverlayDisplay: "flex"    (c'est fin-anim-overlay qui s'affiche réellement)
```
Le `fillText('🏁',...)` de la ligne ~822 dessine bien l'émoji sur
`win-anim-trophy-canvas`, mais la fonction retourne juste après
(`if(!isChamp){ playFinAnim(playerIdx); return; }`) **avant** que ce canvas
ne soit rendu visible — c'est un tout autre overlay (`fin-anim-overlay`,
piloté par `playFinAnim`) qui s'affiche réellement pour un finisher. Cette
occurrence n'a donc, aujourd'hui, **aucun impact visuel réel** — un défaut
de code mort, pas un défaut utilisateur. `DECISIONS-H.md` ne fait pas cette
distinction et présente les deux occurrences comme équivalentes en gravité.

**Troisième occurrence, non documentée par le constructeur ni par ma propre
critique du round 1** : `_FIN_RACERS` (`src/animations.ts`, l'animation
`playFinAnim` réellement affichée pour tout finisher) utilise l'émoji
`🏎️` (voiture de course) pour dessiner jusqu'à 7 « bolides » sur le
`<canvas>` de cette animation. Capture réelle (`playWinAnim` avec
`winRank=2`) : **plusieurs grosses voitures de course en emoji système sont
clairement visibles à l'écran**, à côté d'un drapeau à damier qui, lui, est
correctement dessiné en vectoriel (`_finDrawFlag`, déjà du canvas pur, pas
un émoji — bon point non signalé par personne non plus). `🏎️` ne fait pas
partie des 4 émojis originaux du P1 #7 (trophée/drapeau/crâne/cadenas),
donc c'est un défaut de nature différente (pas une régression sur le
périmètre de cet audit), mais c'est un vrai défaut visible, dans la même
famille (émoji système non maîtrisé, rendu incohérent avec la charte visuelle).

**Jugement** : je confirme que cette dette ne doit **pas** bloquer le
verdict de ce round précis sur les 4 points qui étaient son mandat — le
round 2 avait un mandat volontairement étroit (« uniquement... remplacer
`#elim-anim-skull` ») et l'a respecté à la lettre (`git diff --stat
src/animations.ts` vide, confirmé). Mais elle doit être **élevée en P1**
pour le prochain tour, pas seulement listée comme note : les particules
`☠️` sont, à l'usage réel, une régression aussi visible que celle qui vient
d'être corrigée, et `🏎️` est un défaut supplémentaire non répertorié.
`🏁` (ligne ~822) peut rester en note technique de nettoyage (P2, code
mort) plutôt qu'en P1, puisqu'il n'a aucun effet visible confirmé.

---

## Défauts trouvés

**P1 (nouveau) — `e2e/icon-shape-metrics.spec.ts` peut être contourné par
une déformation qui garde les 8 métriques globales dans la marge tout en
rendant deux icônes confondables.** Démontré par une géométrie de cadenas
réellement substituée dans `src/ui-icons.ts` (corps circulaire + 2 trous
ronds + museau triangulaire), mesurée à `lock↔skull=0.220` (au-dessus du
seuil 0,20), qui passe les 9 tests e2e concernés et 117/118 tests
unitaires, et qui, dans l'application réelle, se lit comme une tête de
mort miniature à la place du cadenas de la page confidentialité (capture
réelle produite et regardée). **Correctif suggéré** : compléter la mesure
géométrique par une métrique locale/structurelle en plus des moments
globaux — par exemple un histogramme radial (répartition de l'encre par
anneaux concentriques autour du centre de masse, qui capterait la
différence entre un trou de serrure/une anse ouverte et deux orbites
symétriques), ou une comparaison de forme par corrélation croisée
d'image (translation-invariante) entre les 4 icônes normalisées, ou plus
simplement un budget de similarité perceptuelle (SSIM/pHash) entre chaque
paire de rendus 24×24 — n'importe laquelle de ces méthodes aurait capté la
mutation ci-dessus, qui préserve les moments globaux mais pas la structure
locale.

**P1 (élevé depuis une note du constructeur) — `spawnFragments` dans
`src/animations.ts` explose ~28 émojis ☠️ à chaque élimination, sur
`<canvas>`.** Confirmé visible réellement (capture, section 8). Même
défaut que celui déjà corrigé pour `#elim-anim-skull` (P1-3 du round 1),
plus fréquent et plus massif à l'écran. Hors mandat de ce round
(confirmé), mais à traiter en priorité au prochain tour ayant mandat sur
`animations.ts` — le constructeur a déjà noté la piste (dessiner
`ICON_SKULL` sur le `<canvas>` plutôt qu'un `fillText`).

**P1 (nouveau, non documenté par personne) — `_FIN_RACERS` dans
`src/animations.ts` utilise l'émoji `🏎️` pour l'animation du finisher
(`playFinAnim`), réellement visible à l'écran (capture, section 8).** Hors
du périmètre strict des 4 émojis du P1 #7 (trophée/drapeau/crâne/cadenas),
mais même famille de défaut (rendu non maîtrisé, incohérent avec la charte
visuelle). À inventorier pour un futur tour.

**P2 — `win-anim-trophy-canvas` contient un `fillText('🏁',...)` mort
(`src/animations.ts`, ligne ~822).** Confirmé sans impact visuel réel
(l'overlay parent reste `display:none` pour tout appel où ce code
s'exécute, un autre overlay prenant le relais). Nettoyage de code
recommandé, pas un défaut utilisateur.

---

## Fichiers/preuves produits pendant cette vérification

Tout le travail a eu lieu dans un worktree détaché sur `a19cf25`
(`/tmp/claude-0/.../scratchpad/wt2`), **supprimé** en fin de mission
(`git worktree remove --force`, confirmé par `git worktree list`). Aucun
fichier de ce worktree ne subsiste. Le seul fichier ajouté au dépôt
partagé par cette critique est le présent rapport,
`docs/audit/H-critique-round2.md` — `docs/audit/H-critique-round1.md`
n'a pas été modifié.
