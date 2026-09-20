# Critique de l'élément D — round 3 (final)

Périmètre : `js/core/*.js`, `js/store.js`, `tests/unit/**`. Aucun fichier du dépôt modifié. Le conteneur
a redémarré entre les rounds : la copie de mutation et les sondes ont été reconstruites
(`scratchpad/critic/mut3/`, `scratchpad/critic/probe3/r3.mjs`, `r3b.mjs`). Rien ici ne dépend des
fichiers servis que B modifie.

## 0. Verdict en une ligne

**AAA : OUI pour la logique pure.** Les trois majeurs du round 2 sont réellement corrigés et prouvés
par mes reproductions, les mutants Q12 et Q17 sont tués, la matrice `repaired` dit la vérité, les
cinq gabarits réels restent non réparés. Il reste **quatre trous de test** (le code est juste dans
les quatre cas, vérifié par sonde) et **deux nuances de documentation**, listés en §4, aucun ne
constituant un défaut fonctionnel.

## 1. Suite (preuve)

`npx vitest run` → 320 tests verts, 100 % lignes / branches / fonctions / instructions
(644 / 546 / 123 / 528). Aucun `.skip`/`.only`/env (D17). Lint propre.

## 2. Vérification des affirmations de D (sans les croire)

| Affirmation                                                                                          | Mesure                                                                                                                                                                                                                                                                                                                                                                                 | Verdict      |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Le bornage ne retire plus jamais l'action contenant `cursor − 1`                                     | `trim` : `keepFrom = groupStart(entries, length − 1)`, `cut ≤ keepFrom` ; mutants T1 (keepFrom = length), T2 (cut non borné), T7 (garde une seule entrée) **tués**                                                                                                                                                                                                                     | **VRAI**     |
| Plafond 500 taps par action, le 501e ouvre un groupe                                                 | 1 203 taps rapprochés → tailles `500, 500, 203` ; mutants G1 (jamais plein), G2 (plein à 499), G3 (plein à 501), G5 (plafond ignoré), G6 (5 000) **tués**                                                                                                                                                                                                                              | **VRAI**     |
| Reproductions : pavé + 2 000 / 2 001 / 2 500 / 6 000 taps, jamais vide, undo possible, 2 001 → 1 501 | `r3.mjs` §1 : 2 000 → 2 000 entrées (undo −500) ; **2 001 → 1 501** (undo −1) ; 2 500 → 2 000 ; 6 000 → 2 000 ; 6 000 pavés → 2 000, ids croissants ; `canUndo` vrai partout                                                                                                                                                                                                           | **VRAI**     |
| Test de bornage : tailles variées, chaque groupe garde sa taille                                     | tailles 3/5/7 avec `groupId` explicites, table `groupId → taille` vérifiée ; **Q12 tué** (2 tests)                                                                                                                                                                                                                                                                                     | **VRAI**     |
| Test de linéarité : tous les accès par mandataire, groupes 1 à 50                                    | `Proxy` sur le tableau (indices) **et** sur chaque entrée (champs), tailles 1/3/7/50, borne 40 accès/entrée + ratio 2 000/1 000 ∈ ]1,5 ; 2,5[ ; **Q17 tué** (boucle sur `groupId`), **Q17b tué** (boucle sur indices)                                                                                                                                                                  | **VRAI**     |
| `repaired` : toute valeur non relue telle quelle, encodages légitimes exclus, gabarits non réparés   | matrice `r3.mjs` §3 : sain/`seatOrder` absent/`maxPoints null`/`allowNeg` absent/`ts` absent/aller-retour v2 → **false** ; `"40"`, absent, null, joueur null, `[1]`, `startPoints "40"`, `maxPoints "40"`, `"non"`, `"true"`, `eliminated 1`, `ts "hier"` → **true** ; 5 gabarits réels → **false** ; mutants R1, R2, R3, R4 **tués** ; en-tête du module réécrit en conséquence (D15) | **VRAI**     |
| Curseur préservé face à une entrée illisible après lui                                               | `[ok, zap, redo]`, cursor 1 → cursor 1, `canUndo` et `canRedo` vrais, `floor 0` ; entrée illisible **avant** le curseur → cursor décalé de 1 ; mutant P5 **tué**                                                                                                                                                                                                                       | **VRAI**     |
| Fermeture de groupe au chargement testée                                                             | mutant N14 **tué** par « après relecture v2, un tap à moins de GROUP_DELAY… ouvre une nouvelle action » ; sonde : `groupIds [1,1,3]`                                                                                                                                                                                                                                                   | **VRAI**     |
| Longueur de prénom non croissante en n                                                               | 320×568 : 13 13 13 13 11 11 8 8 6 6 5 5 ; 390×844 : 16…7 ; 1024×1366 : 18…8 — non croissante sur 4 écrans ; mutant L1 (sans lissage) **tué**                                                                                                                                                                                                                                           | **VRAI**     |
| Deux exports documentés comme API                                                                    | `scoreWidth` : JSDoc « modèle de chasse… utile pour vérifier qu'un rendu tient » ✓ ; `clampScore` : JSDoc inchangée (« Borne un score… »), rien ne dit qu'il est exposé volontairement                                                                                                                                                                                                 | **À MOITIÉ** |

## 3. Mutation round 3

**35 mutants appliqués** (8 de régression M1–M8, les 4 survivants du round 2, 21 neufs sur `trim`,
`groupIsFull`, `loose`/`bool`, curseur, lissage) → **27 tués, 6 survivants dont 2 équivalents**
(T4 : `record` pose déjà `cursor = length` ; T6 : `splice(0, 0)` est neutre) → **27 / 33 = 82 %**
sur ce lot ciblé ; **cumul des trois rounds : 145 tués / 162 non équivalents = 90 %**.
Les 8 imposés : 8/8. Q12, Q17, N14, P5 : 4/4 tués.

## 4. Ce qui reste (aucun défaut fonctionnel ; code vérifié juste par sonde dans chaque cas)

1. **Trou de test — G4** : `groupIsFull` compté sans vérifier `groupId` survit. Sonde : deux taps
   rapprochés après 600 entrées se regroupent bien (code juste) ; test à ajouter : journal long à
   petits groupes puis deux taps → même `groupId`. C'est le seul survivant qui cacherait une
   régression visible (le regroupement cesserait après 500 entrées).
2. **Trou de test — T5** : `floor` non décalé par `trim` survit. Sonde : floor 1 000 + 1 000
   enregistrements → floor 500 (juste). Test : `locked` compte après bornage.
3. **Trou de test — R6** : curseur `min(total, rawCursor)` au lieu du comptage des entrées
   conservées survit. Sonde : `[ok, zap, ok, ok]`, cursor 3 → 2 (juste). Test : entrée illisible
   **avant** le curseur avec redo restant.
4. **Trou de test — R5** : curseur brut hors bornes non signalé `repaired` (le résultat, lui, est
   identique). Mineur.
5. **D15, nuance** : l'en-tête dit « entrées de journal illisibles » ⇒ `repaired` ; vrai en v2, faux
   pour un **groupe d'historique v0** illisible ou un `delta "x"` écarté (`repaired: false`). Préciser
   « v2 » ou compter aussi les rejets de `parseGroup`.
6. **Contournement assumé** : un `groupId` explicite passé à `record` ignore le plafond de 500
   (600 taps → une action). Réservé aux tests et à la migration, l'interface n'en passe jamais ; à
   écrire dans la JSDoc de `record`.
7. `clampScore` : documenter l'intention d'export (ou le rendre interne à `applyDelta`).

## 5. Verdict critère par critère

| Critère     | Verdict               | Preuve                                                                                                                         |
| ----------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| RUBRIC D2.4 | **OUI**               | inchangé : 0 % vide n = 1..12, table verrouillée                                                                               |
| RUBRIC D8.1 | **OUI**               | undo ×40 unitaire, 20 000 curseurs aléatoires (round 2), bornage ne vide plus jamais le journal                                |
| RUBRIC D8.3 | **OUI**               | `jumpTo` + plancher, e2e « Revenir ici » vert (round 2)                                                                        |
| RUBRIC D8.5 | **OUI**               | e2e élimination/modales/sauvegarde vert (round 2), `findWinner` à repli sûr                                                    |
| RUBRIC D7.5 | **OUI**               | journal + curseur + plancher + somme persistés ; curseur préservé face aux entrées illisibles ; gabarits réels sans réparation |
| Brief §5.1  | **OUI**               | le défaut du round 2 (vidage du journal) est corrigé et verrouillé par 4 tests + mes 5 reproductions                           |
| Brief §5.6  | **OUI**               | une représentation d'état, 100 % couvert, lint propre, fonctions ≤ 50 lignes                                                   |
| D15         | **OUI** (nuance §4.5) | en-tête `repaired` conforme à la matrice                                                                                       |
| D17         | **OUI**               | Q12, Q17, Q17b tués ; aucun test conditionnel                                                                                  |
| D21         | **OUI**               | aucune durée, graines fixes, horloge injectée                                                                                  |

**AAA : OUI** pour l'élément D. Les points §4 sont des durcissements de tests et deux précisions
de JSDoc, à traiter quand D repasse sur le fichier ; aucun ne touche au comportement.
