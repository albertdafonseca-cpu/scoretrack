# Critique de l'élément D — logique de jeu pure et tests (round 1)

Périmètre jugé : `js/core/*.js` (hors `constants.js`, en cours de modification par A), `js/store.js`,
`tests/unit/**`, `vitest.config.js`, `tests/unit/fixtures/*.json`, `scratchpad/D/*`.
Aucun fichier du dépôt n'a été modifié. Tout est reproductible depuis
`scratchpad/critic/mut/` (mutation) et `scratchpad/critic/probe/` (sondes).

## 0. Verdict en une ligne

**AAA : NON.** Le noyau est le meilleur morceau du dépôt (275 tests, 100 % de lignes, 43/50 mutants
tués), mais il reste **3 défauts bloquants** (contrat `findWinner` qui produit un faux vainqueur au
préréglage phare, sauvegarde perdue pour un score non numérique, sauvegarde à 13 joueurs acceptée)
et le critère §5.6 du brief (« aucune fonction morte, aucune duplication ») est franchement raté.

---

## 1. Couverture et qualité de la suite (preuve)

```
$ npm run test:unit        (npx vitest run, coverage v8)
Test Files 7 passed (7) | Tests 275 passed (275) | 1.11 s
Statements 100 % (501/501) | Branches 98.62 % (431/437) | Functions 100 % (129/129) | Lines 100 % (410/410)
```

Seuils `vitest.config.js` : lines/statements/functions 95, branches 90 → tenus.

**6 branches non couvertes** (extraites de `coverage/lcov.info`, script dans le rapport) :

| Fichier                | Ligne    | Branche non prise                                                      |
| ---------------------- | -------- | ---------------------------------------------------------------------- |
| js/core/history.js     | 199      | `applyEntry` : via non reconnu (aucune branche atteinte)               |
| js/core/history.js     | 355 (×2) | `logFromGroups` : filtre `g &&` / `players[g.playerIdx]` partiellement |
| js/core/history.js     | 396      | `groupsFromLog` : `who` de repli `''` quand le joueur n'existe plus    |
| js/core/layout.js      | 185      | `computeFit` : un palier de `charRatio` jamais atteint                 |
| js/core/save-schema.js | 92       | `parseSettings` : `defStart < 0 → -1` (mutant N19 survivant, cf. §2)   |

**Qualité des tests** : très au-dessus de la moyenne. Propriétés aléatoires à graine fixe
(`rng(seed)`, `undo(redo(x)) = x` sur 25 graines × 60 actions, `jumpTo` sur 10 graines), bornes
testées des deux côtés (`GROUP_DELAY` inclus/exclu, 25 % arrondi au plancher), gabarits **réels**
produits en pilotant l'ancienne app (`scratchpad/D/make-v0-fixtures.mjs`), temps injecté partout
(`t`, `now`) donc aucun test non déterministe. Je n'ai trouvé **aucun test structurellement
tautologique**, mais 3 assertions qui ne peuvent pas échouer :

- `tests/unit/rules.test.js` : `expect(rows[0].player).toBe(rows[0].player)` — toujours vraie
  (devrait être `toBe(players[1])`).
- `tests/unit/layout.test.js` : `expect(s.idealArea).toBeCloseTo(1 / n)` — `idealArea` **est**
  `1/n` par définition ; `expect(s.minCellArea).toBeLessThanOrEqual(s.maxCellArea)` — vrai par
  construction (`Math.min` ≤ `Math.max`).
- `tests/unit/layout.test.js` : `expect(nameMaxLength(n, 390, 844)).toBe(12)` pour n = 1..12 — le
  test fige une **constante** et masque le fait que la fonction ne fait rien (cf. §3.7).

`js/store.js` est un fichier de D mais **n'est pas dans `coverage.include`** (`js/core/**` seulement) :
aucun seuil ne le protège.

---

## 2. Test de mutation manuel (54 mutants appliqués, 3 vagues)

Copie complète du dépôt dans `scratchpad/critic/mut/repo`, restauration de `js/` entre chaque
mutant, `npx vitest run` à chaque fois. Journaux : `mut/results.txt`, `mut/results2.txt`,
harnais `mut/run.mjs`, `run2.mjs`, `run3.mjs`.

### Les 8 mutations demandées : **8/8 TUÉES**

| #   | Mutation                                                             | Verdict  | Test qui tue                                                       |
| --- | -------------------------------------------------------------------- | -------- | ------------------------------------------------------------------ |
| M1  | `clampScore` : borne inversée (`allowNeg ? 0 : -Infinity`)           | TUÉ (3)  | `clampScore > ne descend pas sous 0…`                              |
| M2  | `record` : troncature du redo supprimée                              | TUÉ (1)  | `record > tronque les entrées rétablissables`                      |
| M3  | seuil `GROUP_DELAY` décalé (`<=` → `<`)                              | TUÉ (1)  | `record > ne regroupe pas au-delà de GROUP_DELAY (limite incluse)` |
| M4  | `computeLayout` : colonne gauche de haut en bas (sens horaire cassé) | TUÉ (11) | `… sens horaire — gauche de bas en haut…`                          |
| M5  | somme de contrôle ignorée à la lecture                               | TUÉ (1)  | `'corrupt' quand la somme de contrôle ne correspond pas`           |
| M6  | `ranking` : rang faux en cas d'ex æquo                               | TUÉ (3)  | `ranking > … ex æquo au même rang (1, 2, 2, 4)`                    |
| M7  | `findWinner` : `last-alive` à 1 joueur                               | TUÉ (2)  | `findWinner > à 1 joueur seul, jamais de vainqueur`                |
| M8  | migration : `maxPoints` null → 0                                     | TUÉ (4)  | `migration v0/v1 → v2 … v0-solo : lue sans perte`                  |

### Bilan global

**54 mutants appliqués, 43 tués, 11 survivants**, dont **4 équivalents** (N5 garde involontairement
la garde ; N6 `entry.to === true` vs `Boolean(entry.to)` — `to` est toujours booléen après `record`
ou `parseEntry` ; P8 `num(Infinity, null)` vaut déjà `null` ; P10 copie superficielle).
→ **taux de mise à mort réel : 43/50 = 86 %**.

### Les 7 mutants survivants = 7 trous de test

| Mutant | Mutation survivante                                                      | Ce que cela prouve                                                                                                     |
| ------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| M16    | `record` : `id = log.entries.length + 1` au lieu de `prev.id + 1`        | aucun test n'enregistre une entrée **après relecture d'une sauvegarde aux id désordonnés** (bug réel, §3.4)            |
| N1     | `nameMaxLength` ignore la disposition (`Math.min(w,h)` → `w`)            | la fonction ne dépend pas de son entrée (§3.7)                                                                         |
| N2     | `nameMaxLength` : borne basse 3 → 1                                      | borne morte, jamais atteinte                                                                                           |
| N11    | `parseEntry` : `delta` de la sauvegarde **cru** au lieu d'être recalculé | aucun test ne fournit un `delta` incohérent avec `from`/`to`                                                           |
| N19    | `parseSettings` : `defStart` négatif conservé                            | branche `→ -1` jamais testée (et sémantique douteuse, §3.9)                                                            |
| P1     | `applyEntry` : garde « joueur inexistant » supprimée                     | l'invariant documenté « indices hors limites ignorés sans erreur » n'est pas testé sur un `playerIdx` **hors tableau** |
| P11    | `timeline` : champ `undone` forcé à `false`                              | `timeline` est testée pour l'ordre, jamais pour `undone`                                                               |

---

## 3. Lecture à la loupe de l'API : invariants, erreurs, performances, migration

Sondes : `probe/inv.mjs`, `probe/inv2.mjs`, `probe/inv3.mjs`, `probe/matrix.mjs`, `probe/migr.mjs`,
`probe/perf.mjs`.

### 3.1 BLOQUANT — `findWinner` : le contrat publié produit un faux vainqueur

`CONTRACTS.md` publie `findWinner(players, {maxPoints, allowNeg})`. L'implémentation a besoin d'un
troisième champ **non contractuel**, `startPoints`, pour distinguer plafond-butée et plafond-victoire :

```
findWinner([40,40,40], {maxPoints:40, allowNeg:false})                  → {index:0, reason:'max-reached'}  ← FAUX
findWinner([40,40,40], {maxPoints:40, allowNeg:false, startPoints:40})  → null                             ← attendu
```

Au préréglage **Loi du Milieu** (départ 40, max 40 — le préréglage vedette), un appel conforme au
contrat déclare un vainqueur **dès le lancement de la partie**. A branche l'écran de jeu en ce
moment : c'est une bombe à retardement. (Pour information, sans jugement sur son fichier,
`js/ui/game.js:439` appelle aujourd'hui `findWinner(store.game.players)` sans configuration : la
victoire par plafond n'existe donc pas dans l'app.)

### 3.2 BLOQUANT — une sauvegarde lisible est perdue pour un score non numérique

L'en-tête de `save-schema.js` affiche « Règle absolue (D5) : une sauvegarde lisible n'est jamais
perdue ; les champs douteux sont réparés ». Or `parsePlayer` renvoie `null` dès que `score` n'est pas
un nombre fini, et `parseGame` déclare alors **toute la partie** `corrupt` (matrice complète dans
`probe/matrix.mjs`) :

```
score en chaîne "40"    → PERDU (corrupt)          nom numérique        → RÉPARÉ
score absent            → PERDU (corrupt)          eliminated = "oui"   → RÉPARÉ
score null / NaN / Inf  → PERDU (corrupt)          seatOrder incomplet  → RÉPARÉ
un joueur null          → PERDU (corrupt)          history corrompu     → RÉPARÉ
```

Deux poids deux mesures : tout est réparé sauf ce qui est trivialement réparable (`Number('40')`,
repli sur `startPoints`). Mon gabarit pervers fait main (`probe/v0-pervers.json` : score en chaîne,
`seatOrder` incomplet `[2,2,0]`, history partiellement corrompu, `numPlayers` 9 faux,
`startPoints:'40'`, `allowNeg:'non'`) est **intégralement perdu** à cause du seul `score:'40'`.

### 3.3 BLOQUANT — sauvegarde à plus de 12 joueurs acceptée

`parseGame` ne borne pas le nombre de joueurs : une sauvegarde à 13 joueurs est acceptée
(`numPlayers:13`, `seatOrder` de 13). `computeLayout(13, …)` retombe alors sur **une seule carte** :
12 joueurs disparaissent de l'écran, sans erreur ni message. `MAX_PLAYERS` existe dans `layout.js`
mais n'est jamais consulté par le schéma.

### 3.4 MAJEUR — identifiants d'entrées non normalisés à la lecture → doublons d'id

`parseLog` conserve l'ordre brut et ne renumérote pas. Sur une sauvegarde dont les entrées sont
désordonnées (ids `[3,2]`), `record` calcule `id = prev.id + 1 = 3` → **doublon** (`probe/inv.mjs` §B).
Conséquence mesurée (`inv2.mjs` §L) : `timeline()` et `groupsFromLog()` (qui font
`entries.find(e => e.id === id)`) lisent la **mauvaise entrée** :

```
ids = 2,1,2 → timeline deltas = 2:5 1:100 2:5   (attendu 2:5 1:100 2:1)
```

L'unicité des id est un invariant du journal : `parseLog` doit trier/renuméroter, ou `record` doit
prendre `max(id) + 1`.

### 3.5 MAJEUR — `record` fait confiance à un curseur hors bornes

`isLog()` existe mais n'est utilisé que par `serializeGame`. `record` exécute
`log.entries.length = log.cursor` sans vérification : sur `{entries: [], cursor: 3}` il fabrique un
**tableau creux** (3 trous), après quoi `groups()` et `undo()` lèvent
`TypeError: Cannot read properties of undefined (reading 'groupId')` (`inv2.mjs` §K). Ce journal
peut venir de `store.setGame({... log})`, qui accepte n'importe quel objet `log`.

### 3.6 MAJEUR — curseur au milieu d'un groupe : `undo` puis `redo` n'est pas neutre

`parseLog` borne le curseur aux extrémités mais ne le **cale pas sur une frontière de groupe**.
Sauvegarde à 3 taps groupés avec `cursor: 2`, score 42 (`inv3.mjs` §Q) :

```
undo → score 40 (curseur 0)   puis   redo → score 43 (curseur 3)
```

Le score « saute » à une valeur où il n'était pas. Même famille : quand `parseLog` écarte une entrée,
le curseur est repoussé à la fin (`dropped → cursor = entries.length`), ce qui déclare appliquées des
actions que les scores enregistrés ne reflètent pas.

### 3.7 MAJEUR — `nameMaxLength` est une constante, sa JSDoc est fausse, personne ne l'appelle

```
320×568, 390×844, 1024×1366, 100×200, 2000×2000 ; n = 1,2,4,6,8,12  →  12 partout
```

Algébriquement : `floor(effectiveW·0,84 / (effectiveW·0,13·0,84·0,62)) = floor(12,4) = 12`, quelle que
soit la taille de cellule. La JSDoc annonce « Longueur maximale d'un prénom pour qu'il tienne sur la
plus petite carte de la disposition. Dérivée de `computeLayout` » : faux. Deux conséquences : les
prénoms de **18 caractères** exigés au §5.1 du brief ne sont jamais autorisés par cette fonction, et
la fonction n'est **importée par aucun module** (`grep` sur tout `js/`). Les mutants N1 et N2 l'ont
révélée.

### 3.8 MAJEUR — aucune vérification de cohérence journal ↔ scores

Une sauvegarde v2 dont les scores contredisent le journal (`players[0].score = 1000`, dernière
entrée `to = 1`) est acceptée sans un mot (`inv.mjs` §N). Le `delta` d'une entrée, lui, **est**
recalculé depuis `from`/`to` (bon réflexe, mais non testé : mutant N11).

### 3.9 MINEUR — `parseSettings` : réparations silencieuses discutables

```
{defMax:'40'}   → defMax 0        (le plafond disparaît : Loi du Milieu devient sans butée)
{defStart:'40'} → defStart 0      (change les seuils low/crit de scoreClass)
{defPlayers:99} → defPlayers 99   (aucune borne à MAX_PLAYERS)
{defStart:-5}   → defStart -1     (sentinelle -1 non documentée, branche non couverte)
{allowNeg:'non'}→ true            (Boolean('non'))
```

### 3.10 Gestion des erreurs : cohérente, mais deux styles

`record` **lève** (`TypeError` pour un type faux, `RangeError` pour une valeur hors domaine :
`via` inconnu, `from === to`, `playerIdx < 0`) ; `parseGame` **renvoie** `{ok:false, reason}`.
La séparation « écriture = programmation défensive, lecture = données hostiles » se défend et est
documentée. Deux réserves : `via` inconnu est un `RangeError` alors que c'est un type faux ; et
`record` accepte `playerIdx: 99` sans liste de joueurs (par construction, mais à documenter).

### 3.11 Performances (`probe/perf.mjs`, Node 22)

| Entrées | groups() | timeline()  | jumpTo(1er) | undo ×40 | serializeGame | parseGame  | groupsFromLog |
| ------- | -------- | ----------- | ----------- | -------- | ------------- | ---------- | ------------- |
| 100     | 0,18 ms  | 0,69 ms     | 0,17 ms     | 0,20 ms  | 1,41 ms       | 2,9 ms     | 0,28 ms       |
| 1 000   | 0,52 ms  | 7,69 ms     | 0,75 ms     | 0,02 ms  | 0,73 ms       | 8,6 ms     | 7,1 ms        |
| 10 000  | 5,34 ms  | **97,2 ms** | 1,74 ms     | 0,02 ms  | 8,9 ms        | **132 ms** | **107 ms**    |

`jumpTo` sur 10 000 entrées : **1,7 ms** — excellent. `groups()` est recalculé à chaque appel mais
reste linéaire (5 ms/10 000) : acceptable. En revanche `timeline()` et `groupsFromLog()` sont en
**O(n²)** (`entries.find(e => e.id === id)` dans une boucle) ; `groupsFromLog` est appelé par
`flatten`, donc à **chaque** `parseGame`. Un index `Map(id → entrée)` les rend linéaires.

### 3.12 Sérialisation et quota

2 000 actions à 4 joueurs → **187 104 octets** (≈ 183 Kio, 94 o/entrée), soit **7,1 %** d'un quota
localStorage de 5 Mio en UTF-16. Saturation vers **28 000 actions**. Le journal n'est **jamais
tronqué** (aucune limite, contrairement à `UNDO_LIMIT = 40` de la v1) : il faut une politique
(compactage des vieilles actions ou plafond dur), sinon l'échec sera un `QuotaExceededError` en
pleine partie.

### 3.13 Horodatages

`record(log, {…, t})` et `serializeGame(state, now)` acceptent tous deux une horloge injectée ;
`Date.now()` n'est que le défaut. Les tests utilisent `T0 = 1_700_000_000_000` partout :
**déterminisme total**, aucun `vi.useFakeTimers` nécessaire. Point fort.

### 3.14 Migration v0 → v2 sur les 4 gabarits réels + le mien (`probe/migr.mjs`)

```
v0-fresh-4p    ok | 4 j. | 0 entrée  | maxPoints 40       | undo total → [40,40,40,40]
v0-advanced-4p ok | 4 j. | 5 entrées | 4 actions          | undo total → [40,40,40,40]
v0-12p-neg     ok | 12 j.| 5 entrées | maxPoints Infinity | undo total → 12×0
v0-solo        ok | 1 j. | 2 entrées | maxPoints Infinity | undo total → [0]
v1-save        ok | 3 j. | 4 entrées | maxPoints Infinity | undo total → [40,40,40]
gabarit pervers fait main                                 → PERDU (corrupt), cf. §3.2
```

Les 5 gabarits réels remontent exactement au score de départ après annulation complète, puis au
score final après rétablissement : la reconstitution à rebours de `logFromGroups` est juste.

---

## 4. `layoutStats(n)` pour n = 1..12 (mesures, 390×844)

| n   | grille | cellules | vide % | minRatio  | plus petite cellule | J1 en bas | J1 droit        |
| --- | ------ | -------- | ------ | --------- | ------------------- | --------- | --------------- |
| 1   | 1×1    | 1        | 0      | 1,000     | 390×732             | oui       | oui             |
| 2   | 1×2    | 2        | 0      | 1,000     | 390×366             | oui       | oui             |
| 3   | 2×3    | 3        | 0      | 1,000     | 195×488             | oui       | oui             |
| 4   | 2×2    | 4        | 0      | 1,000     | 195×366             | oui       | **non (rot-l)** |
| 5   | 2×3    | 5        | 0      | 0,833     | 195×244             | oui       | oui             |
| 6   | 2×3    | 6        | 0      | 1,000     | 195×244             | oui       | **non (rot-l)** |
| 7   | 2×4    | 7        | 0      | 0,875     | 195×183             | oui       | oui             |
| 8   | 3×3    | 8        | 0      | 0,889     | 130×244             | oui       | oui             |
| 9   | 2×5    | 9        | 0      | 0,900     | 195×146             | oui       | oui             |
| 10  | 3×4    | 10       | 0      | 0,833     | 130×183             | oui       | oui             |
| 11  | 2×6    | 11       | 0      | 0,917     | 195×122             | oui       | oui             |
| 12  | 3×5    | 12       | 0      | **0,800** | 130×146             | oui       | oui             |

- **Aire vide : 0 % pour n = 1..12** → RUBRIC **D2.4 : OUI**, et le contrat « ≤ 10 % » est battu.
- **min cellule ≥ 80 % de l'idéal : OUI**, mais n = 12 tombe **exactement** sur 0,800 : la moindre
  retouche (p. ex. J1 sur 4 lignes au lieu de 3) fait passer le test sous le seuil. Fragile.
- **Sens horaire : OUI** pour tout n ≥ 3 (colonne gauche de bas en haut, haut de table, colonne
  droite de haut en bas — vérifié cellule par cellule dans `inv2.mjs` §P).
- **Joueur 1 en bas : OUI** partout ; mais **à 4 et 6 joueurs il est couché (`rot-l`)**, alors qu'il
  est droit (`rot-0`) pour tous les autres n. Le test entérine l'exception
  (`if (n !== 4 && n !== 6) expect(j1.rot).toBe('rot-0')`) : un test taillé sur l'implémentation.

**Propositions (5, 7, 10, 12)** — mesurées, pas d'impression :

- **n = 6** : appliquer `threeColumns` (k = 2) donnerait 3×2, 6 cellules **égales** (130×366),
  vide 0 %, minRatio 1,000 et surtout **J1 droit**. Cohérence de lecture gagnée, largeur perdue
  (130 au lieu de 195). C'est le seul changement que je recommande vraiment.
- **n = 5 et 7** : rien de mieux à surface égale. 5 → 0,833 et 7 → 0,875 sont les optima des grilles
  sans cellule vide (une grille 3 colonnes exige n pair). Laisser tel quel.
- **n = 10 et 12** : une grille 4×3 (12) ou 5×2 (10) donnerait minRatio 1,000, mais détruirait
  l'anneau autour de la table (deux joueurs se retrouvent au centre) ; l'anneau périmétrique d'une
  grille 4×4 laisserait 25 % de vide (> 10 %). La disposition actuelle est le bon compromis :
  **ne pas toucher**, mais sortir n = 12 du seuil 0,800 en donnant 2 lignes à J1 et 2 au vis-à-vis
  n'est pas possible (k = 5 impair) — assumer et documenter la marge nulle.

**Effet de bord mesuré sur la lisibilité (`computeFit`, score « 40 ») :**

```
n=4  cellule 195×366 → scoreSz  90 px      (RUBRIC D2.1 exige ≥ 96 px à 4 joueurs → ÉCHEC de 6 px)
n=12 cellule 130×146 → scoreSz  60 px      (exige ≥ 30 px → OK)
n=12 score « 9 999 999 »       → 24 px     (< 30 px → ÉCHEC sur les scores à 7 chiffres)
```

Le rendu final appartient à A, mais la formule est dans `layout.js` : `charRatio` 0,55 pour 2
chiffres plafonne à 90 px sur une carte de 195 px de large.

---

## 5. Lisibilité du code

- **Longueur des fonctions** : aucune > 40 lignes (`parseGame` 40, `layoutStats` 38, `logFromGroups`
  37, `parseEntry` 33). **OK.**
- **Lint** : `eslint js/core js/store.js tests/unit` et `prettier --check` → propres.
- **Fichiers** : `history.js` **497 lignes** parce qu'il héberge **deux implémentations parallèles**
  (journal v2 + groupes/instantanés v1). C'est de la duplication fonctionnelle assumée mais réelle.
- **Code mort / API v1 @deprecated — qui l'utilise encore ?** (`grep js/ui`)
  - `js/ui/game.js` : `addGroupedDelta`, `addManualDelta`, `closeOpenGroup`, `pushUndo`, `popUndo`
  - `js/ui/recap.js` : `closeAllGroups`, `groupSum`, `playerRecap`
  - **Aucun module UI n'importe la v2** : `record`, `undo`, `redo`, `jumpTo`, `timeline`, `canUndo`,
    `canRedo`, `applyEntry`, `invert`, `isLog`, `logFromGroups`, `groupsFromLog`, `VIAS`,
    `SCORE_VIAS`, `layoutStats`, `nameMaxLength`, `ranking`, `isMaxReached`, `clampScore`,
    `checksum`, `verifyChecksum`, `HEADER_H`, `emptyGame` sont inutilisés hors `js/core` et tests.
    → §5.6 du brief (« aucune fonction morte ») : **NON** aujourd'hui. C'est conforme au plan
    (A branche la v2 maintenant), mais tant que ce n'est pas fait, `undo` dans l'app reste la pile
    d'instantanés v1 **non persistée** : après rechargement, l'annulation est perdue, alors que le
    journal, lui, est bien sauvegardé. La note D7.5 dépend donc entièrement de A.
  - `js/store.js` maintient **quatre** représentations redondantes du même état (`log`, `history`,
    `actionCounter`, `undoStack`/`redoStack`), et `redoStack` n'est écrit par personne.
- **JSDoc inexacte** :
  - `findWinner` : `@returns {{index, reason}|null}` — renvoie en fait `{...player, index, reason}` ;
    `@param` omet que `startPoints` est **déterminant** (cf. §3.1).
  - `record` : `@param` liste `delta` comme entrée acceptée alors qu'il est toujours recalculé.
  - `nameMaxLength` : description fausse (cf. §3.7).
  - `groups` : `@returns` omet `approx`.
- **Nommage** : bon et cohérent (`from`/`to`/`delta`/`via`/`groupId`), commentaires en français,
  identifiants en anglais → conforme à D6.

---

## 6. Verdict critère par critère

| Critère                                                                                           | Verdict           | Preuve                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RUBRIC D8.1** undo ×40 + redo ×40, 1 groupe = 1 action                                          | **OUI (logique)** | test `undo ×40 puis redo ×40 → état identique`, propriété `undo(redo(x))=x` sur 25 graines ; mutants M2, M15, P4, P9 tués. _Réserve_ : non branché dans l'app (§5).                                                                |
| **RUBRIC D8.3** retour à un point, redo conservé                                                  | **OUI (logique)** | 5 tests `jumpTo` dont une propriété aléatoire ; `jumpTo` 1,7 ms sur 10 000 entrées ; mutants P2, P3, M10 tués. _Réserve_ : aucune UI, donc 0 au barème tant que A ne l'expose pas.                                                 |
| **RUBRIC D8.5** l'annulation ne casse aucun état dérivé                                           | **PARTIEL**       | elim/unelim, rotate et rename s'inversent correctement (tests + M9, P4) ; mais `findWinner` (§3.1) peut rouvrir une modale de victoire à tort, et rien ne garantit la cohérence journal ↔ scores (§3.8).                           |
| **RUBRIC D7.5** restauration complète + schéma versionné avec somme de contrôle                   | **PARTIEL**       | v2 + FNV-1a vérifiée à la lecture, journal **et curseur** persistés, aller-retour stable sur les 5 gabarits ; mais §3.2 (perte de sauvegarde), §3.3 (13 joueurs), §3.6 (curseur mi-groupe). L'atomicité de l'écriture relève de E. |
| **RUBRIC D2.4** surface inutilisée ≤ 10 %                                                         | **OUI**           | 0 % mesuré pour n = 1..12, minRatio ≥ 0,800 (§4).                                                                                                                                                                                  |
| **Brief §5.1** zéro défaut sur les cas limites                                                    | **NON**           | 1 et 12 joueurs, 7 chiffres, négatifs, undo ×40, rotation : OK et prouvés. Mais faux vainqueur (§3.1), sauvegarde perdue (§3.2), 13 joueurs (§3.3), doublons d'id (§3.4), `TypeError` sur curseur hors bornes (§3.5).              |
| **Brief §5.6** modules courts, logique testée, zéro duplication, zéro fonction morte, lint propre | **NON**           | fonctions ≤ 40 lignes ✓, 100 % de lignes couvertes ✓, lint ✓ ; mais duplication v1/v2 (497 lignes), 4 états redondants dans `store.js`, ~22 exports morts dont `nameMaxLength` (§5).                                               |

**AAA : NON.**

---

## 7. Corrections demandées (numérotées, actionnables)

### Bloquant

1. **`js/core/rules.js` → `findWinner`** : rendre la décision indépendante d'un champ absent du
   contrat. Attendu : soit `findWinner(players, config)` exige `startPoints` et **lève/renvoie null**
   si absent, soit la règle devient « atteindre `maxPoints` **et** avoir progressé depuis
   `startPoints` », soit `CONTRACTS.md` est corrigé pour publier `{maxPoints, allowNeg, startPoints}`.
   Test attendu : `findWinner(players, {maxPoints: 40})` sur une partie Loi du Milieu à 40/40/40 ne
   doit **jamais** renvoyer `max-reached`.
2. **`js/core/save-schema.js` → `parsePlayer`/`parseGame`** : réparer un score non numérique au lieu
   de perdre la partie (`Number(x)` si finie, sinon `config.startPoints`, sinon 0) et n'écarter que
   les joueurs `null`. Attendu : `parseGame({players:[{playerName:'A',score:'40'}], …}).ok === true`
   avec `score: 40`. Tests attendus : la matrice de `probe/matrix.mjs` versionnée en test.
3. **`js/core/save-schema.js` → `parseGame`** : borner le nombre de joueurs à
   `MAX_PLAYERS` (importé de `layout.js`). Attendu : 13 joueurs → `{ok:false, reason:'unsupported'}`
   ou troncature explicite à 12 + `seatOrder` recalculé. Test attendu : une sauvegarde à 13 joueurs
   ne doit jamais produire un écran à une seule carte.

### Majeur

4. **`js/core/save-schema.js` → `parseLog`** : normaliser les identifiants (tri par `id` croissant
   puis renumérotation 1..n en conservant les `groupId`). Attendu : `new Set(ids).size === ids.length`
   et `ids` strictement croissants après toute lecture ; test avec des entrées désordonnées suivies
   d'un `record`.
5. **`js/core/history.js` → `record`** (et `undo`/`redo`/`groups`) : refuser ou assainir un journal
   dont `isLog()` est faux (`cursor = clamp(0, entries.length)`), au lieu de fabriquer un tableau
   creux. Attendu : `record({entries:[],cursor:3}, …)` ne doit pas produire de trous ni faire lever
   `groups()`. Même garde dans `js/store.js → setGame`.
6. **`js/core/save-schema.js` → `parseLog`** : caler le curseur sur une frontière de groupe
   (`groupStart`/`groupEnd`). Attendu : après lecture, `undo` puis `redo` redonne exactement l'état
   lu (test de propriété sur curseur aléatoire).
7. **`js/core/layout.js` → `nameMaxLength`** : soit la rendre réellement dépendante de la cellule
   (le rapport `0,13 × 0,62` se simplifie : il faut comparer une largeur de cellule à une taille de
   police **plafonnée**, comme `computeFit` le fait avec `cap`), soit la **supprimer** avec son test.
   Attendu : `nameMaxLength(12, 320, 568) < nameMaxLength(1, 1024, 1366)` et 18 atteignable sur une
   grande carte. Corriger la JSDoc dans les deux cas.
8. **`js/core/save-schema.js` → `parseGame`** : vérifier la cohérence journal ↔ scores (dernier `to`
   appliqué par joueur vs `players[i].score`) et, en cas de désaccord, **faire foi aux scores** en
   marquant le journal non rejouable plutôt que d'exposer un undo qui téléporte le score.
9. **`js/core/layout.js` → `computeFit`** : 90 px à 4 joueurs contre 96 px exigés par D2.1, 24 px
   pour un score à 7 chiffres à 12 joueurs contre 30 px. Attendu : un test `computeFit` piloté par
   `layoutStats(n, {width:390, height:844})` qui assert ≥ 96 px (n = 4) et ≥ 30 px (n = 12, 7
   chiffres). À arbitrer avec A, qui possède le rendu.
10. **`js/core/history.js` → `timeline`, `groupsFromLog`** : indexer par `Map(id → entrée)` (O(n²) →
    O(n)). Mesure actuelle : 97 ms et 107 ms à 10 000 entrées, `groupsFromLog` étant appelé à chaque
    `parseGame`.

### Mineur

11. **`parseSettings`** : borner `defPlayers` à 1..12, convertir les nombres en chaîne
    (`defStart`, `defMax`) au lieu de les écraser, supprimer la sentinelle `-1` non documentée,
    couvrir la branche `defStart < 0` (branche non couverte + mutant N19).
12. **Tests tautologiques** : corriger `expect(rows[0].player).toBe(rows[0].player)`
    (`tests/unit/rules.test.js`), retirer `idealArea ≈ 1/n` et `minCellArea ≤ maxCellArea`
    (`tests/unit/layout.test.js`).
13. **`vitest.config.js`** : ajouter `js/store.js` (et, à terme, `js/core/constants.js`) à
    `coverage.include` — un fichier de D non protégé par le seuil.
14. **Ajouter 7 tests** correspondant aux 7 mutants survivants : id après relecture désordonnée
    (M16), `nameMaxLength` dépendante de l'entrée (N1, N2), `delta` incohérent recalculé (N11),
    `defStart` négatif (N19), `applyEntry` avec `playerIdx` hors tableau (P1), `timeline().undone`
    (P11). Chaque test doit échouer sur le mutant correspondant (harnais réutilisable :
    `scratchpad/critic/mut/run.mjs`).
15. **JSDoc** : corriger `findWinner` (`@returns`, `startPoints`), `record` (`delta` ignoré),
    `groups` (`approx`), `nameMaxLength`.
16. **Dette v1** : planifier la suppression de `groupSum`, `findOpenGroup`, `closeOpenGroup`,
    `closeAllGroups`, `addGroupedDelta`, `addManualDelta`, `snapshot`, `pushUndo`, `popUndo`,
    `UNDO_LIMIT` et des champs `history`/`actionCounter`/`undoStack`/`redoStack` de `store.js` dès
    que A a basculé sur le journal (ticket explicite, sinon §5.6 restera NON).
17. **Politique de taille du journal** : 94 o/entrée, saturation du quota vers 28 000 actions,
    aucune troncature. Définir un plafond (ou un compactage des actions anciennes) et le tester.
18. **`parseEntry` (rotate)** : un `seatOrder` corrompu est « réparé » en identité **des deux côtés**
    (`from` et `to`), ce qui transforme l'entrée en non-opération silencieuse ; mieux vaut écarter
    l'entrée que de conserver une rotation fantôme dans l'historique.

---

## 8. Reproduire

```bash
# Couverture et branches
cd /home/user/scoretrack && npx vitest run
# Mutation (54 mutants, ~4 min)
cd scratchpad/critic/mut && node run.mjs && node run2.mjs && node run3.mjs
# Invariants, migration, performances, dispositions
node scratchpad/critic/probe/inv.mjs
node scratchpad/critic/probe/inv2.mjs
node scratchpad/critic/probe/inv3.mjs
node scratchpad/critic/probe/matrix.mjs
node scratchpad/critic/probe/migr.mjs
node scratchpad/critic/probe/perf.mjs
```

Note : `js/ui/game.js`, `js/ui/modals.js`, `js/ui/recap.js`, `css/game.css`, `css/modals.css`,
`index.html` et `js/core/constants.js` sont en cours de modification par A et **n'ont pas été
jugés** ; aucun test e2e n'a été lancé pour cette raison. Les unités ci-dessus ne dépendent d'aucun
de ces fichiers (`constants.js` n'est touché que par `tests/unit/format.test.js`, qui passe).
