# H-critique-round4 — Vérification indépendante de l'élément H, round 4

Agent critique indépendant, isolé dans un `git worktree --detach` sur
`5bc5a27` (`/tmp/claude-0/.../scratchpad/wt4`, supprimé en fin de mission —
`git worktree remove --force` confirmé, `git worktree list` ne montre plus
que le dépôt principal). Toutes les commandes, mesures et rendus
ci-dessous ont été réellement exécutés/générés/inspectés dans ce
worktree. Les rounds précédents (`H-critique-round1/2/3.md`) n'ont pas été
modifiés.

## Verdict

**AAA : non.** Le taux d'encre absolu (round 4) corrige bien le
contournement exact du round 3 — je le confirme moi-même. Les deux cas
limites que le constructeur documente honnêtement (corps hachuré
rectangulaire/rond) ne sont, à mon propre jugement visuel indépendant sur
un rendu réel, pas des violations de D-PREF-1 — je suis d'accord avec lui
sur ces deux points précis. **Mais ma propre tentative de contournement
(item 3 de la mission) a trouvé une géométrie qui passe les TROIS tests
actuellement committés avec une marge confortable (pas de justesse), et
qui, une fois appliquée réellement dans le code et regardée sur une vraie
capture de l'application construite, à l'échelle réelle d'usage, est
indiscernable d'une tête de mort miniature — pas « limite », pas
« ambiguë », clairement un visage rond à deux yeux noirs et un nez.** Ce
n'est pas une nouvelle famille de mon invention : c'est la reproduction
indépendante d'une configuration que le constructeur lui-même avait déjà
décrite et écartée (config « E », `DECISIONS-H.md` §12, round 3) sans
jamais la rendre et la regarder — son jugement visuel sur ce cas précis
était erroné, malgré sa bonne foi et sa méthode par ailleurs rigoureuse.

---

## 1. Reproduction de ma géométrie exacte du round 3 (contour fin) — confirmée corrigée

```
$ npm run build
$ npx playwright test e2e/icon-shape-metrics.spec.ts --workers=1
  ✓ métriques globales (round 2)
  ✓ average hash (round 3)
  ✘ taux d'encre absolu (round 4)
    taux d'encre de lock hors bande [0.15, 0.45] — tous mesurés :
    trophy = 0.3403 / flag = 0.1944 / skull = 0.3229 / lock = 0.1215
    Expected: >= 0.15   Received: 0.12152777777777778
```

Valeur (`lock = 0.1215`) identique à celle rapportée par le constructeur.
Les deux tests précédents restent verts (cohérent avec `DECISIONS-H.md`
§13.1 : l'average hash seul ne suffisait pas, d'où ce troisième test).
Restauré, `git diff --stat src/ui-icons.ts` vide confirmé, 122/122 et
41/41 re-verts après restauration. **Point 1 de la mission : confirmé.**

## 2. Les deux cas limites du constructeur — reproduits et jugés indépendamment

Le constructeur ne donne que des paramètres narratifs (grille 6×5/4×3 pour
le corps rectangulaire, grille 4×4/3×3 pour le corps rond), pas de code
exact (« script non committé, jetable »). Je les ai reconstruits moi-même
à partir de sa description, mesurés avec la méthode exacte des trois
tests, puis **rendus et regardés réellement** (pas seulement mesurés) :

**Corps rectangulaire hachuré (grille 6×5) + anse pleine taille** :
`d_skull(aHash)=52` (≥48), `inkRatio=0.29` (dans la bande) → passe les
deux gardes. Rendu à 150px et à 24px réel, en couleur et en niveaux de
gris : se lit sans ambiguïté comme **un cadenas à corps rectangulaire
couvert d'un motif damier**, avec une anse ouverte bien visible en haut.
Aucune ressemblance avec un visage ou un crâne, à aucune des deux
échelles. **Je suis d'accord avec le constructeur : ce n'est pas une
violation de D-PREF-1.**

**Corps rond hachuré (grille 4×3, motif en croix) + anse pleine taille** :
`d_skull(aHash)=49` (≥48), `inkRatio=0.20` (dans la bande) → passe les
deux gardes. Rendu à 150px et 24px réel : se lit comme **un disque avec un
motif en croix/damier interne et une anse** — à 24px, un petit icône rond
avec une texture peu lisible, mais **sans trace d'yeux ni de nez
distincts** (le motif en croix n'a pas de structure « deux points +
triangle » qui évoquerait un visage). **Je suis d'accord avec le
constructeur : ce n'est pas non plus une violation de D-PREF-1**, même si
je note (nuance non bloquante) que cette géométrie est d'une lisibilité
médiocre en tant que *cadenas* à 24px — un défaut de clarté générale,
pas une confusion avec une autre icône précise, donc hors du champ de ce
test spécifique.

**Point 2 de la mission : confirmé, aucun désaccord avec le constructeur
sur ces deux cas.**

## 3. Ma propre tentative de contournement — un résultat, sérieux et net

### 3.1 Ce qui a été essayé sans succès (le contournement est bien corrigé pour cette famille)

Reprise de la piste round 3 (cadenas allongé) contre le trophée (paire
d'origine la plus proche, `trophy↔skull=58`) : la meilleure géométrie
trouvée (`trophy↔lock=46`) a été **correctement détectée** une fois
appliquée réellement (`< 48` → échec du test). Confirmation supplémentaire
que le round 3 protège aussi cette paire.

### 3.2 Ce qui a fonctionné : reproduction indépendante de la configuration « E » du constructeur (round 3, jamais rendue)

`DECISIONS-H.md` §12 (écrit par le constructeur lui-même, round 3) décrit
une configuration **jamais retenue pour un correctif ni jamais montrée en
capture** : « E — corps *gélule* (pas un cercle) + anse à sa taille
ORIGINALE (rayon 3,8) + trous/nez positionnés comme le crâne », mesurée à
l'époque à `60` (aHash vs crâne) et jugée par le constructeur comme se
lisant « aussi comme un vrai cadenas plausible, pas un contournement » —
**sans capture à l'appui de ce jugement**.

Je l'ai reconstruite moi-même à partir de cette description (corps à grand
rayon d'arrondi — 6, proche de la moitié de la largeur du corps —, anse à
rayon 3,8 identique à l'original, deux trous ronds et un nez positionnés
comme `ICON_SKULL`) et mesurée avec la méthode exacte des trois tests
committés :

```
d_skull (average hash 16×16) = 61   (>= 48 — marge confortable, pas de justesse)
inkRatio (24×24)              = 0.326 (dans la bande [0.15, 0.45] — proche
                                        de la valeur du crâne lui-même, 0.323)
```

### 3.3 Appliquée réellement dans le code, testée sur les 3 tests réellement committés

```ts
export const ICON_LOCK: string = _svg(
  '<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M8.2 9V5.8a3.8 3.8 0 0 1 7.6 0V9"/>'
  +'<path fill="currentColor" fill-rule="evenodd" d="'
  +_roundedRectSubpath(5,9,14,12.5,6)
  +' '+_circleSubpath(9.4,13,1.7)
  +' '+_circleSubpath(14.6,13,1.7)
  +' M10.7 16.2L13.3 16.2L12 18Z'
  +'"/>'
);
```

```
$ npm run build
$ npx playwright test e2e/icon-shape-metrics.spec.ts e2e/functional-icons.spec.ts --workers=1
  ✓ métriques globales (round 2)
  ✓ average hash (round 3)
  ✓ taux d'encre absolu (round 4)
  ✓ (8 autres tests de functional-icons.spec.ts, dont « 4 silhouettes
     structurellement distinctes »)
  11 passed (14.3s)

$ npm run test
 ❯ tests/ui-icons.test.ts › les deux helpers sont bien ceux utilisés par ICON_SKULL/ICON_LOCK
   (échec — coïncidence, comme aux 3 rounds précédents : ce test vérifie la
   réutilisation d'un paramètre de `_roundedRectSubpath` sans rapport avec
   la distinguabilité)
 Tests  1 failed | 121 passed (122)
```

**Les 11 tests e2e pertinents passent, y compris les 3 tests du fichier
dédié à cette protection.** Comme aux trois rounds précédents, seul
l'échec accidentel habituel se déclenche.

### 3.4 Preuve visuelle — regardée sur l'application réellement construite, pas sur un rendu isolé

Capture réelle de la page confidentialité (`dist/index.html` servi en
HTTP, build complet, couleur violette réelle du thème par défaut),
zoomée sur les seuls pixels de l'icône, sans interpolation ajoutée :

**Ce que montre la capture, sans ambiguïté aucune** : une tête ronde
violette avec deux grands yeux noirs et un petit nez triangulaire. **Rien
dans ce rendu ne se lit comme un cadenas** — pas de rectangle, pas de
distinction visible entre le « corps » et l'« anse » (l'arc du haut se
confond avec le contour de la tête plutôt que de se détacher comme une
poignée). C'est, à l'œil, la même famille de lecture que le crâne
`ICON_SKULL` à côté — en fait plus nettement confondant que les
contournements des rounds 2 et 3, dont les captures laissaient au moins
deviner un vague indice de « cadenas » (l'anse séparée du corps).

Restauré (`cp` de la sauvegarde, `git diff --stat src/ui-icons.ts` vide
confirmé), rebuild, 122/122 et 41/41 re-verts.

### 3.5 Pourquoi le jugement du constructeur sur ce point précis était optimiste

Le constructeur a mesuré cette configuration correctement (60, proche de
mes 61 — l'écart tient à des choix de coordonnées légèrement différents
pour la même description narrative) et l'a documentée honnêtement, mais
son évaluation visuelle (« se lit aussi comme un vrai cadenas plausible »)
n'était **pas appuyée par un rendu regardé**, contrairement aux deux cas
qu'il a effectivement rendus et documentés au round 4 (§13.2, rectangle et
rond hachurés — sur ceux-là, son jugement se confirme, voir section 2
ci-dessus). Ce round-ci montre que la méthode (mesurer, ET rendre, ET
regarder, systématiquement, sans exception même pour une configuration
« déjà mesurée » à un round antérieur) doit s'appliquer à **toutes** les
configurations frontalières, y compris celles écartées lors d'un round
précédent sur la seule foi du chiffre.

---

## Défauts trouvés

**P1 — Les trois tests actuellement committés dans
`e2e/icon-shape-metrics.spec.ts` (métriques globales, average hash, taux
d'encre absolu) laissent encore passer une géométrie de cadenas
franchement confondante avec le crâne.** Démontré par une reproduction
indépendante de la configuration « corps gélule + anse originale + trous/
nez façon crâne » (déjà décrite, mais jamais rendue, par le constructeur
lui-même au round 3), appliquée réellement dans `src/ui-icons.ts`,
mesurée à `aHash=61` et `inkRatio=0.326` (marges confortables sur les deux
gardes, pas des cas limites), qui passe les 3 tests + le test de
signatures structurelles, et qui, dans l'application réellement construite
à l'échelle réelle d'usage, est indiscernable d'un visage/crâne miniature.
**Correctif suggéré** : le facteur commun aux contournements qui
fonctionnent depuis 3 rounds (rounds 2, 3 et celui-ci) est un **corps à
silhouette globalement ronde/ovale** (cercle, gélule à grand rayon) plutôt
qu'un corps à coins nets identifiables comme ceux d'un rectangle — c'est
précisément ce que `DECISIONS-H.md` §12 avait déjà identifié comme « le
facteur discriminant réel » (« forme du corps : circulaire/gélule vs
rectangulaire ») sans en tirer de garde automatisée. Ajouter une **mesure
de convexité/anguleusité de la silhouette du corps principal** (ex. :
rapport entre l'aire de la coque convexe et l'aire réelle, ou détection du
nombre de coins nets via la courbure locale du contour extrait des pixels)
qui exigerait un corps de cadenas suffisamment anguleux/rectangulaire
plutôt que quasi circulaire — ce qui formaliserait enfin, en test
automatisé, l'observation que le constructeur a déjà faite à la main.

---

## Fichiers/preuves produits pendant cette vérification

Tout le travail a eu lieu dans un worktree détaché sur `5bc5a27`
(`/tmp/claude-0/.../scratchpad/wt4`), **supprimé** en fin de mission
(`git worktree remove --force`, confirmé par `git worktree list`). Aucun
fichier de ce worktree ne subsiste (y compris une correction en cours de
route : un nettoyage trop large de mes propres scripts de mesure a
supprimé par erreur des fichiers suivis par git dans ce worktree jetable —
`index.html`/`package.json`/`tsconfig*.json`/`vercel.json` — restaurés
immédiatement par `git checkout --`, sans aucune conséquence puisque ce
worktree a de toute façon été détruit ensuite ; signalé ici par
transparence). Le seul fichier ajouté au dépôt partagé par cette critique
est le présent rapport, `docs/audit/H-critique-round4.md` — les rounds
précédents n'ont pas été modifiés.
