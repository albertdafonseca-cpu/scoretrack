# H-critique-round5 — Vérification indépendante de l'élément H, round 5

Agent critique indépendant, isolé dans un `git worktree --detach` sur
`2400995` (`/tmp/claude-0/.../scratchpad/wt5`, supprimé en fin de mission —
`git worktree remove --force` confirmé, `git worktree list` ne montre plus
que le dépôt principal). Toutes les commandes, mesures et rendus
ci-dessous ont été réellement exécutés/générés/inspectés dans ce
worktree. Les rounds précédents (`H-critique-round1/2/3/4.md`) n'ont pas
été modifiés.

## Verdict

**AAA : non.** J'ai trouvé un contournement réel et net (pas marginal) des
4 gardes actuellement committées dans `e2e/icon-shape-metrics.spec.ts`.
Conformément à la consigne du coordinateur, je le documente clairement
ci-dessous, avec preuve à l'appui à chaque étape ; la décision de clôturer
ce cycle de durcissement ou de rouvrir un tour revient au coordinateur, pas
à ce rapport.

---

## 1. Reproduction de ma config E exacte du round 4 — confirmée corrigée

```
$ npm run build
$ npx playwright test e2e/icon-shape-metrics.spec.ts --workers=1
  ✓ métriques globales (round 2)
  ✓ average hash (round 3)
  ✓ taux d'encre absolu (round 4)
  ✘ topologie des trous (round 5)
    le corps du cadenas (anse retirée) a 3 trou(s), pas strictement moins
    que le crâne — topologie de trous mesurée pour les 4 icônes :
    trophy = 0 / flag = 6 / skull = 3 / lock = 3
    Expected: < 3   Received: 3
```

Correctif confirmé pour cette configuration précise : le corps « gélule »
+ 2 yeux + 1 nez a bien 3 trous, comme le crâne, désormais détecté.
Restauré, `git diff --stat src/ui-icons.ts` vide confirmé, 122/122 et
42/42 re-verts. **Point 1 de la mission : confirmé.**

## 2. Ma tentative de contournement — réussie, avec marge confortable

### 2.1 L'observation qui a mené au contournement

Le nouveau test exige seulement `holeCount(lock) < holeCount(skull)`, soit
`< 3` — **pas** exactement `1` (le nombre réel de trous d'un vrai
cadenas). N'importe quelle géométrie à **0, 1 ou 2** trous passe cette
garde. Le correctif round 5 neutralise la famille « 3 trous distincts »
(2 yeux + 1 nez, exactement la topologie du crâne) qui a motivé cette
garde, mais laisse ouverte toute géométrie à **2 trous seulement**.

### 2.2 Le contournement : la config E du round 4, moins le trou du nez

Reprise de ma configuration du round 4 (corps « gélule » + anse originale
+ 2 yeux ronds façon crâne), en supprimant simplement le sous-chemin du
nez — 2 trous au lieu de 3 :

```ts
export const ICON_LOCK: string = _svg(
  '<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M8.2 9V5.8a3.8 3.8 0 0 1 7.6 0V9"/>'
  +'<path fill="currentColor" fill-rule="evenodd" d="'
  +_roundedRectSubpath(5,9,14,12.5,6)
  +' '+_circleSubpath(9.4,13,1.7)
  +' '+_circleSubpath(14.6,13,1.7)
  +'"/>'
);
```

Mesuré avec la méthode exacte des 4 tests :

```
average hash (vs crâne)  = 60   (>= 48 — marge confortable)
inkRatio (24×24)         = 0.326 (dans [0.15, 0.45] — proche du crâne, 0.323)
holeCount (48×48)        = 2    (< 3, le nombre de trous du crâne — marge nette, pas 2 vs 3 à la limite d'une résolution)
```

### 2.3 Appliqué réellement dans le code, testé sur les 4 tests réellement committés

```
$ npm run build
$ npx playwright test e2e/icon-shape-metrics.spec.ts e2e/functional-icons.spec.ts --workers=1
  ✓ métriques globales (round 2)
  ✓ average hash (round 3)
  ✓ taux d'encre absolu (round 4)
  ✓ topologie des trous (round 5)
  ✓ (8 autres tests de functional-icons.spec.ts, dont « 4 silhouettes
     structurellement distinctes »)
  12 passed (14.9s)

$ npm run test
 ❯ tests/ui-icons.test.ts › les deux helpers sont bien ceux utilisés par ICON_SKULL/ICON_LOCK
   (échec — coïncidence, cinquième round consécutif où seul ce test sans
   rapport avec la distinguabilité détecte quelque chose, par hasard)
 Tests  1 failed | 121 passed (122)
```

**Les 12 tests e2e pertinents passent, y compris les 4 tests du fichier
dédié à cette protection.**

### 2.4 Preuve visuelle — capture réelle de l'application construite, pixels natifs

Page confidentialité (`dist/index.html` servi en HTTP, build complet,
couleur violette réelle du thème par défaut), zoomée sur les seuls
pixels de l'icône, sans interpolation ajoutée :

**Un rond violet avec deux grands yeux noirs — rien d'autre.** Aucune
trace de nez, aucune trace de mâchoire, mais la lecture « visage/tête »
est immédiate et sans ambiguïté, arguably même plus nette et plus
reconnaissable au premier coup d'œil que les configurations des rounds
précédents (2 formes rondes et sombres sur une tête ronde suffisent au
cerveau humain pour lire « un visage » — c'est d'ailleurs le principe même
de la pareidolie). L'anse du cadenas, visible juste au-dessus, se fond
avec le contour de la tête plutôt que de se détacher comme une poignée
distincte.

Restauré, `git diff --stat src/ui-icons.ts` vide confirmé, rebuild,
122/122 et 42/42 re-verts.

### 2.5 Pourquoi ce contournement n'est pas marginal

Contrairement au round 4 (où j'avais insisté sur le fait que la marge
était confortable pour la distinguer d'un cas limite), ce point mérite
d'être souligné explicitement ici aussi :
- `average hash = 60` : au-dessus de la valeur mesurée pour la config E
  complète du round 4 (61) — retirer un trou n'a presque pas changé cette
  mesure, ce qui confirme que l'average hash reste structurellement
  aveugle à ce type de variation (comptage de trous), pas seulement à la
  marge.
- `inkRatio = 0.326` : essentiellement identique à celui du crâne réel
  (0.323) et à la config E complète (0.326) — retirer un petit trou
  triangulaire ne change quasiment pas le taux d'encre global.
- `holeCount = 2` : net, pas `2` obtenu par un artefact de résolution à la
  limite (contrairement à ce que documente honnêtement le constructeur
  pour la valeur du VRAI cadenas, qui oscille entre 1 et 2 selon la
  résolution) — ici, 2 orbites rondes bien séparées donnent un compte de 2
  stable, quelle que soit la résolution de mesure (vérifié à 48×48, la
  résolution retenue par le test).

C'est une conséquence directe et presque immédiate de la façon dont le
seuil du round 5 a été posé (« strictement moins que 3 », pas « exactement
1 » ni même « au plus 1 ») plutôt qu'une faille cachée qu'il aurait fallu
chercher longtemps.

---

## Défauts trouvés

**P1 — Les 4 tests actuellement committés dans
`e2e/icon-shape-metrics.spec.ts` (métriques globales, average hash, taux
d'encre absolu, topologie des trous) laissent encore passer une géométrie
de cadenas franchement confondante avec le crâne : un visage à 2 yeux, sans
nez.** Démontré par une variante à un seul trait de moins de la
configuration déjà documentée au round 4, mesurée avec des marges nettes
sur les 4 gardes (pas des cas limites), appliquée réellement dans
`src/ui-icons.ts`, qui passe l'intégralité de la suite e2e du fichier
dédié, et qui, dans l'application réellement construite à l'échelle réelle
d'usage, se lit sans ambiguïté comme un visage. **Correctif suggéré** : la
garde de topologie devrait exiger `holeCount(lock) <= 1` (ou une valeur
fixe proche de la topologie réelle du trou de serrure, avec la tolérance de
résolution déjà documentée par le constructeur — 1 ou 2 selon la
résolution pour le VRAI cadenas), plutôt qu'une simple comparaison relative
`< holeCount(skull)` qui laisse toute la plage 0–2 ouverte à n'importe
quelle géométrie, y compris des géométries à 2 trous ronds qui n'ont
strictement rien à voir avec un trou de serrure.

---

## Note pour la suite

Ce rapport documente un contournement réel et non marginal, comme demandé,
sans présumer de la suite : le coordinateur a explicitement indiqué que la
décision de clôturer ce cycle de durcissement précis ou de rouvrir un
nouveau tour lui revient à partir de ce round, pas à une règle automatique
de ce rapport. Les 4 rounds précédents ont chacun trouvé un contournement
réel sur une famille différente (corps plein rond, contour fin, corps
« gélule » à 3 trous, et maintenant une variante à 2 trous de cette
dernière famille) — un schéma qui suggère que la vraie difficulté de fond
(garantir par un test automatisé qu'aucune combinaison de paramètres
géométriques ne produise jamais une silhouette confondante) est
probablement irréductible à une suite finie de gardes ad hoc, chacune
corrigeant le contournement précédent sans fermer l'espace de recherche
dans son ensemble — une observation offerte pour éclairer la décision à
venir, pas pour la présumer.

---

## Fichiers/preuves produits pendant cette vérification

Tout le travail a eu lieu dans un worktree détaché sur `2400995`
(`/tmp/claude-0/.../scratchpad/wt5`), **supprimé** en fin de mission
(`git worktree remove --force`, confirmé par `git worktree list`). Aucun
fichier de ce worktree ne subsiste. Le seul fichier ajouté au dépôt
partagé par cette critique est le présent rapport,
`docs/audit/H-critique-round5.md` — les rounds précédents n'ont pas été
modifiés.
