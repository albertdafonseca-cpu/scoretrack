# Critique de l'élément D — round 2 (final)

Périmètre : `js/core/*.js`, `js/store.js`, `tests/unit/**`, `vitest.config.js`, gabarits ; consommation
par `js/ui`, `js/fx`, `js/platform` vérifiée par grep et par 4 tests e2e ciblés. Aucun fichier du dépôt
modifié. Reproductible : `scratchpad/critic/mut2/` (83 mutants), `scratchpad/critic/probe/r2*.mjs`, `cvd.mjs`.
Rien de ce qui suit ne dépend de `css/themes.css` ni des scripts d'audit (en cours de modification par B).

## 0. Verdict en une ligne

**AAA : NON, de peu.** Les 3 bloquants, les 7 majeurs et les mineurs du round 1 sont réellement traités
(preuves ci-dessous, chaque affirmation de D vérifiée sans la croire). Il reste **un défaut fonctionnel
neuf** introduit par la borne du journal (un groupe de plus de 2 000 taps **efface tout le journal**),
**deux tests qui n'éprouvent pas ce qu'ils annoncent** (D17) et **une documentation fausse** sur le
drapeau `repaired` (D15). Tout est corrigeable en moins d'une heure ; sans cela le §5.1 du brief
(« zéro défaut sur les cas limites ») n'est pas tenu.

## 1. Suite de tests et couverture (preuve)

```
$ npx vitest run  →  Test Files 7 passed | Tests 309 passed (309) | 1,1 s
Statements 100 % (614/614) | Branches 100 % (529/529) | Functions 100 % (120/120) | Lines 100 % (509/509)
```

`js/store.js` est maintenant dans `coverage.include` ✓. Aucun `.skip`, `.only`, `todo` ni condition
d'environnement dans `tests/unit` (D17) ✓. Les 3 assertions tautologiques du round 1 ont disparu ✓.
ESLint et Prettier propres ✓. Aucune fonction > 50 lignes (`computeFit` 49, `parseGame` 49, `parseLog` 44).

## 2. Campagne de mutation — 83 mutants appliqués, 75 tués

Les 51 mutants du round 1 (moins 3 équivalents par construction) transposés sur le code actuel,
plus 32 mutants neufs visant les évolutions (plancher `floor`, `trim`, `isCoherent`, renumérotation,
calage du curseur, `loose`/`bool`, `scoreRows`, `computeFit` à deux contraintes, `cardBox`,
`appliedState`, `setGame`). Journal complet : `mut2/results.txt`.

- **Les 8 mutations imposées (M1–M8) : 8/8 tuées.**
- **Les 7 survivants du round 1 : 7/7 tués** (M16, N1, N2, N11, N19, P1*, P11) — *P1 survit encore
  mais mon mutant est équivalent par construction (`|| {}` neutralise lui-même l'effet) ; le test
  « ignore une entrée visant un joueur absent » existe et passe.
- **Bilan : 83 appliqués, 75 tués, 8 survivants, dont 4 équivalents** (M17 : `normalize` rattrape le
  curseur en aval ; N6 : `to` est toujours booléen ; P1 ci-dessus ; Q14 : `record` pose déjà
  `cursor = length` avant `trim`). **Taux réel : 75/79 = 95 %** (86 % au round 1).

| Survivant réel | Mutation                                                | Ce que cela révèle                                                                                                                                                                                                                           |
| -------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Q12**        | `trim` coupe une action en deux                         | le test « sans couper une action » (`history.test.js:245`) passe quand même : il ne vérifie que la longueur du premier groupe sur des groupes de 2, pas que la coupure tombe sur une frontière → **D17**                                     |
| **Q17**        | `groups` quadratique via `groupId`                      | le test de linéarité ne compte que les lectures de `id` : une implémentation quadratique qui lit `groupId` ou indexe `entries[]` passe → mesure un motif, pas la complexité                                                                  |
| **N14**        | `closeGroup` retiré de `parseGame`                      | aucun test ne vérifie qu'après relecture v2 un tap survenant < 1,5 s après le dernier tap sauvegardé ouvre un nouveau groupe (le code le fait : sondé, `groupIds = [1,1,3]`)                                                                 |
| **P5**         | curseur non forcé à la fin quand une entrée est écartée | politique non testée ; et discutable : une entrée illisible située **après** le curseur force le curseur à la fin, rend le journal incohérent, **scelle l'undo et jette le redo** (`probe/r2d.mjs` §B) alors que le mutant conserve les deux |

## 3. Vérification des évolutions annoncées (sans les croire)

| Affirmation de D                                                                 | Vérification                                                                                                                                                                                                                                                                                                                          | Verdict                                                                                                            |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Vainqueur jamais déclaré au lancement quand plafond = départ                     | `findWinner([40,40,40], {maxPoints:40, allowNeg:false})` (appel « contrat ») → `null` ; avec `startPoints:0`, Uno 500 → `max-reached` ; mutant Q1 (repli → 0) tué                                                                                                                                                                     | **VRAI**                                                                                                           |
| Sauvegarde lisible jamais perdue, scores réparés, borne joueurs                  | matrice round 1 : 12/13 réparés, 13 joueurs → `unsupported` explicite (refus documenté, pas d'amputation) ; **gabarit pervers intégralement récupéré** (`repaired:true`, Dédé → 40 = départ, sièges identité, 1 entrée d'historique sauvée) ; aller-retour stable ; mutants Q2, Q18, Q19, Q33, P7 tués                                | **VRAI**                                                                                                           |
| Identifiants triés et renumérotés                                                | ids `[3,2]` → `[1,2]`, `record` → `[1,2,3]`, aucun doublon ; Q3, Q4, M16 tués                                                                                                                                                                                                                                                         | **VRAI**                                                                                                           |
| Curseur validé et calé sur frontière                                             | `record` sur `{entries:[],cursor:3}` → aucun trou, `groups()` OK ; curseur mi-groupe → calé puis **scellé** (scores font foi) ; Q5, Q15, N22 tués                                                                                                                                                                                     | **VRAI**                                                                                                           |
| Cohérence journal/scores, lecture seule si désaccord                             | score 1000 vs journal à 1 → `ok`, `floor = cursor`, redo abandonné, `canUndo=false`, un tap ultérieur redevient annulable ; Q6–Q9 tués                                                                                                                                                                                                | **VRAI**                                                                                                           |
| Invariant undo/redo sur curseur aléatoire                                        | **20 000 cas** (ma propre graine, 3 joueurs, 1–15 actions, taps et pavé mélangés) : k undo puis k redo = état lu dans 20 000/20 000 ; **aucun état intermédiaire hors du passé réel** (0 téléportation) ; redo jamais perdu quand le curseur est sur une frontière (18 236/18 236) ; 1 562 journaux scellés, tous à curseur mi-groupe | **VRAI**                                                                                                           |
| `nameMaxLength` dérivée du repère réel                                           | 390×844 : 16 16 18 18 15 15 11 18 9 17 7 13 (n = 1..12) ; varie avec n et l'écran ; N1, N2 tués                                                                                                                                                                                                                                       | **VRAI** (mais non monotone en n, cf. §5)                                                                          |
| 33 px de capitale à 12 joueurs pour 7 chiffres, deux lignes décidées par le cœur | `computeFit(minCard(12), "9 999 999")` → 47 px × 0,7 = **33 px**, `lines:2`, les deux lignes tiennent (126 et 84 px ≤ 132) ; « 40 » à 4 joueurs → 144 px (≥ 96) ; seule exception 11 j./7 ch. = 29 px, verrouillée par un test d'inventaire exhaustif ; Q23–Q28 tués                                                                  | **VRAI**                                                                                                           |
| Chronologie et regroupement linéaires                                            | 1 000 / 10 000 / 40 000 entrées : `timeline` 0,16 / 1,25 / 10,3 ms, `groups` 0,17 / 5,5 / 20 ms, `parseGame` 1,6 / 16 / 71 ms — linéaire ; Q16 (ancien `find` par id) tué par le test de linéarité                                                                                                                                    | **VRAI** (réserve Q17)                                                                                             |
| Journal borné à 2 000 entrées                                                    | 2 100 pavés → 2 000 entrées, 197 Kio ; **mais voir §4.1**                                                                                                                                                                                                                                                                             | **VRAI avec un défaut**                                                                                            |
| Réglages assainis                                                                | `defPlayers 99 → 0`, `"40" → 40`, `defStart -5 → 0`, `defNeg "non" → false` ; N19, Q18–Q20 tués                                                                                                                                                                                                                                       | **VRAI**                                                                                                           |
| 7 tests tueurs + 8 ; 309 tests ; couverture intégrale                            | 309 ✓, 100 % ✓, les 7 mutants tués ✓                                                                                                                                                                                                                                                                                                  | **VRAI**                                                                                                           |
| API v1 supprimée                                                                 | `groupSum`, `pushUndo`, `popUndo`, `addGroupedDelta`, `snapshot`… absents ; `store.js` = une seule représentation `{players, seatOrder, log}`                                                                                                                                                                                         | **VRAI**                                                                                                           |
| Durée remplacée par comptage d'accès                                             | oui, compteur sur `id` via `defineProperty` ; insensible à la charge ✓ ; mais proxy incomplet (Q17)                                                                                                                                                                                                                                   | **VRAI, incomplet**                                                                                                |
| Palette réordonnée : séparabilité de 4 à 6 joueurs                               | mon propre calcul (Machado 2009 sévérité 1, ΔE2000) : ΔE min des 6 premières couleurs = 15,1 protan (paire 3-6), 15,7 deutan, 15,5 tritan ; k = 7 → 11,2                                                                                                                                                                              | **VRAI**, mais 15,1 est à 0,1 du seuil 15 : **D21** classe cela en défaut de conception, pas en résultat publiable |

**L'interface consomme réellement le cœur** (mon reproche « §5.6 NON ») : `game.js` importe
`recordScore/recordRotate/recordElim/recordRename`, `undo`, `redo`, `canUndo`, `canRedo`, `jumpTo`,
`applyEntry`, `closeGroup`, `findWinner(players, store.config)`, `isMaxReached`, `computeLayout`,
`cardBox`, `computeFit`, `parseGame`/`serializeGame` (et lit `repaired`) ; `recap.js` : `groups`,
`timeline`, `playerRecap`, `ranking` ; `names.js` : `nameMaxLength` ; `fx/layout-fit.js` : `LINE_GAP`,
`MIN/MAX_*_PX`. Restent inutilisés hors cœur et tests : `layoutStats`, `scoreWidth`, `appliedState`,
`clampScore`, `checksum`, `verifyChecksum`, `logFromGroups`, `invert`, `record`, `isLog`, `createLog`
— tous **utilisés en interne** par le cœur (pas de code mort), sauf `scoreWidth` (outil de
vérification, testé) et `clampScore` (n'est plus appelé que par `applyDelta` : à rendre interne).

**E2E ciblés (lancés, 4/4 verts, 12 s)** : « le DOM des cartes survit aux taps, à l'annulation, au
rétablissement et à la rotation », « annulation : réintègre un éliminé, ferme les modales et met à
jour la sauvegarde », « journal du récap : bouton Revenir ici », « reprise : le journal restauré
réactive Annuler ». Aucun e2e « 40 actions, 40 undo, 40 redo » (exigé par RUBRIC 8.1) : fichier de A.

## 4. Défauts restants

### 4.1 MAJEUR — `trim` : un groupe de plus de 2 000 taps efface **tout** le journal

`js/core/history.js → trim`. Quand l'excédent tombe dans un groupe, `cut` avance jusqu'à la fin du
groupe pour ne pas couper une action ; si ce groupe est le **dernier**, tout part (`probe/r2d.mjs` §A) :

```
1 pavé + groupe de 2000 taps → 2000 entrées, undo → −2000      (correct)
1 pavé + groupe de 2001 taps → 0 entrée, canUndo=false          (journal effacé, silencieusement)
1 pavé + groupe de 2500 taps → 499 entrées                      (les 2001 premiers taps perdus)
```

Atteignable par 2 001 taps sur une même carte espacés de moins de 1,5 s (≈ 30 min de tapotage
continu) : rare, mais l'effet est total et invisible. Attendu : ne jamais retirer le groupe qui
contient `cursor − 1` (garder au moins la dernière action), ou clore d'office un groupe au-delà d'une
taille (p. ex. 500 taps), et un test « un groupe géant ne vide jamais le journal ».

### 4.2 MAJEUR (D17) — deux tests qui n'éprouvent pas leur intitulé

1. `history.test.js:245` « sans couper une action » : survit au mutant Q12 (coupure au milieu d'un
   groupe). Attendu : construire des groupes de tailles variées (3, 5, 7) et vérifier que
   `entries[0].groupId !== groupIdRetiré` et que chaque groupe restant a sa taille d'origine.
2. `history.test.js:612` « restent linéaires » : survit au mutant Q17 (boucle quadratique sur
   `groupId`). Attendu : compter **tous** les accès (Proxy sur `entries` comptant les lectures
   d'index, ou `defineProperty` sur `id` **et** `groupId`), même borne `≤ 10 n`.

### 4.3 MAJEUR (D15) — `repaired` contredit l'en-tête du module

`save-schema.js` déclare « RÉPARABLE (la partie est rendue, `repaired: true`) : score en chaîne… »
mais `parseGame({players:[{score:'40'}]}).repaired === false` ; idem `startPoints:'40'`,
`allowNeg:'true'`, `ts:'hier'` (`probe/r2d.mjs` §C). Soit `loose()` signale la conversion, soit
l'en-tête dit la vérité (« conversion silencieuse, réparation signalée seulement si une valeur a été
inventée »). L'interface affiche un toast sur `repaired` (`game.js:168`) : le choix a un effet visible.

### 4.4 Mineurs

- **P5** : une entrée illisible **après** le curseur détruit le redo et scelle l'undo (le curseur est
  forcé à la fin puis jugé incohérent). Politique plus fine : n'écarter que l'entrée et décaler le
  curseur du nombre d'entrées écartées **avant** lui.
- **N14** : ajouter le test « après relecture v2, un tap à < GROUP_DELAY du dernier tap sauvegardé
  ouvre un nouveau groupe ».
- `nameMaxLength` non monotone en n (18 → 15 → 11 → 18 → 9 → 17 → 7 → 13) : passer de 8 à 9 joueurs
  divise la longueur autorisée par deux. C'est la géométrie (2 colonnes vs 3), mais l'écran des
  prénoms devrait l'annoncer ou lisser (p. ex. `min` sur n et n±1).
- `clampScore` exporté sans consommateur hors cœur ; `scoreWidth` idem (outil) : documenter ou
  internaliser.
- Palette : paire 3-6 à ΔE 15,1 en protanopie, 5-6 à 15,5 en tritanopie — à moins de 0,2 du seuil
  au sens de D21 (à traiter avec B, propriétaire de l'audit ; `COLORS` est dans `constants.js`).
- `13 joueurs → unsupported` est un refus, pas une réparation ; acceptable car aucune version de
  l'app n'a pu écrire une telle sauvegarde, et c'est documenté dans l'en-tête.
- E2E « 40 undo + 40 redo » manquant (A).

## 5. Verdict critère par critère

| Critère                                                                      | Verdict                     | Preuve                                                                                                                                                     |
| ---------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RUBRIC **D2.4** aire inutilisée ≤ 10 %                                       | **OUI**                     | 0 % pour n = 1..12 ; table des 12 dispositions verrouillée par test ; minRatio ≥ 0,80                                                                      |
| RUBRIC **D8.1** undo ×40 + redo ×40                                          | **OUI** (logique + câblage) | test unitaire ×40 ; propriété 25 graines ; 20 000 cas aléatoires ; `undoLast`/`redoLast` câblés ; mutants M2, M15, P4, P9, Q10 tués. E2E ×40 absent (A)    |
| RUBRIC **D8.3** retour à un point, redo conservé                             | **OUI**                     | `jumpTo` + plancher (Q11, P2, P3 tués) ; `jumpToEntry` câblé ; e2e « Revenir ici » + `#redo-btn` activé : vert                                             |
| RUBRIC **D8.5** undo ne casse aucun état dérivé                              | **OUI**                     | e2e « réintègre un éliminé, ferme les modales, met à jour la sauvegarde » : vert ; `findWinner` à repli sûr (Q1 tué)                                       |
| RUBRIC **D7.5** restauration complète, schéma versionné + somme              | **OUI, réserve 4.1**        | journal + curseur + plancher persistés, FNV-1a vérifiée (M5, N13 tués), 5 gabarits réels sans réparation, e2e « journal restauré réactive Annuler » : vert |
| Brief **§5.1** zéro défaut cas limites                                       | **NON**                     | 1/12 joueurs, 7 chiffres, négatifs, undo ×40, rotation, restauration : OK. Reste le vidage du journal par groupe géant (4.1)                               |
| Brief **§5.6** modules courts, testé, zéro duplication, zéro code mort, lint | **OUI**                     | API v1 supprimée, 1 représentation d'état, 100 % couvert, lint propre ; 2 exports à internaliser (mineur)                                                  |
| Décision **D17** (test qui ne peut pas échouer)                              | **NON**                     | Q12 et Q17 survivent à des mutants qui contredisent l'intitulé du test                                                                                     |
| Décision **D21** (verdict stable)                                            | **OUI**                     | aucune durée dans les tests, graines fixes, horloge injectée ; 3 exécutions identiques                                                                     |
| Décision **D15** (doc vraie)                                                 | **NON**                     | en-tête `save-schema.js` sur `repaired`                                                                                                                    |

**Mutants : 75 tués / 79 non équivalents (95 %) ; 83 appliqués.**
**AAA : NON.** Manque : correction de `trim` (4.1) avec son test, durcissement des deux tests
(4.2), mise en accord doc/code sur `repaired` (4.3). Tout le reste est au niveau.
