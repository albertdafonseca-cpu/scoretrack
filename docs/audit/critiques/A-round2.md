# Critique de l'élément A — tour 2

Base stable : **commit 878e042** (dernier commit), archivé dans `critic/A2/repo/` et servi sur le
port 8790 pour que mes mesures ne bougent pas pendant que A travaille. Arbre de travail (chantier
en cours) mesuré séparément sur 8765. Scripts : `critic/A2/v*.mjs`, mutations :
`critic/A2/patches/*.py` + `critic/A2/mut*.log`, captures : `critic/A2/shots/`.

## 1. Référence : la suite passe

`npx playwright test --workers=1` sur le commit 878e042 : **72 tests, 72 passés, 10,5 min**
(`critic/A2/baseline.log`), projet `perf` inclus. Contre 2 échecs au tour 1.

## 2. Vérification des mesures revendiquées (refaites, jamais reprises)

| Revendication                                            | Ma mesure                                                                                                                                                                                                      | Verdict                                     |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Bulle vivante aux actions 1, 2 et 10                     | 10 actions successives du MÊME joueur, sans rechargement : opacité 1 à 0,3 s et à 1,2 s, 0 à 1,8 s, **10 fois sur 10** (`v1-core.mjs`)                                                                         | **confirmé**                                |
| Taps simultanés comptés individuellement                 | 2 doigts → 101/101 · 3 doigts → 101/101/101 · **5 doigts → 5×101** · poses et levées décalées → 101/99 · 0 moitié restée « pressée »                                                                           | **confirmé, au-delà de ce qui est annoncé** |
| Écart de taille du score < 1,42 dans une disposition     | max/min du corps du score, n = 4…12, scores 40/100/1234 : **1,00 à 1,40** (contre 3,13 mesuré au tour 1)                                                                                                       | **confirmé**                                |
| Retour visuel, médiane 23,1 ms                           | 3 exécutions du test `réactivité` : médiane **22,3 / 24,9 / 22,6 ms**, p95 26,8–33,4 ms                                                                                                                        | **confirmé**                                |
| Fluidité : zéro trame perdue                             | machine au repos, 3 exécutions : **0 trame perdue** sur 157–170 trames à 4 joueurs et 0 sur 166–170 à 12, p95 **16,7–16,8 ms** à chaque fois                                                                   | **confirmé** (réserve §4)                   |
| Capitale 101 px à 4 joueurs, 390×844                     | **101 px** (cyber, dark et Inter : 108, arcade : 126, ldm : 105)                                                                                                                                               | **confirmé**                                |
| Cas courant à 4 chiffres franchissant 30 px à 12 joueurs | **35–46 px** (contre 27–31 au tour 1)                                                                                                                                                                          | **confirmé**                                |
| Deux lignes : 33 px à 12 joueurs / 7 chiffres            | **31–32 px** sur les 12 cartes (contre 20–22 au tour 1). Le commentaire du code de A dit 32 ; les 33 px relayés ne sont pas atteints. Seuil de 30 franchi malgré tout.                                         | **corrigé à la baisse**                     |
| Contraste conforme, 14 thèmes × 3 états                  | 3 528 mesures (14 thèmes × 7 états × 12 cartes × 3 textes, pire cellule sur 8) : transitoire **3,47** au pire → conforme D20 ; repos **4,44** au pire (light / carte 9, moyenne 4,51) → **une paire sous 4,5** | **presque**                                 |
| Prénoms courts non rognés                                | 0 prénom court tronqué de 1 à 12 joueurs                                                                                                                                                                       | **confirmé**                                |
| Journal du récap sans recouvrement                       | 0 intersection, confirmé aussi par mutation (§3)                                                                                                                                                               | **confirmé**                                |

## 3. Les tests peuvent-ils échouer ? (méthode par mutation, D17)

Chaque défaut est réintroduit dans une **copie** du commit 878e042, sur un port dédié.

| Mutation                                                    | Test visé                  | Résultat                                              |
| ----------------------------------------------------------- | -------------------------- | ----------------------------------------------------- |
| M1 fondu de la bulle en `fill: forwards`, purge neutralisée | `bulle de delta`           | **ATTRAPÉ** — « action 2 à 0,3 s : reçu 0 »           |
| M2 un nouvel appui annule tous les autres                   | `taps SIMULTANÉS`          | **ATTRAPÉ** — attendu 101, reçu 100                   |
| M3 rembourrure verticale remise en `3%`                     | `écart de taille du score` | **ATTRAPÉ** — écart cœur/rendu 0,284 > 0,2            |
| M4 plafond du score ramené à 110 px                         | `hauteur de capitale`      | **ATTRAPÉ** — 77 < 96                                 |
| M6b `shrinkLabel` remesure le conteneur (bug du tour 1)     | `prénom COURT`             | **ATTRAPÉ** — 65 prénoms rognés listés                |
| M9b garde de débordement retirée de `.recap-tag`            | `journal du récap`         | **ATTRAPÉ** — 721 px² de recouvrement                 |
| M7 130 ms bloquants avant le retour visuel                  | `réactivité`               | **ATTRAPÉ** — p95 143 ms                              |
| M10 `--score-color` du thème clair dégradé                  | `contraste`                | **ATTRAPÉ** — 2,03                                    |
| M8 **30 ms bloquants à chaque tap**                         | `fluidité`                 | **NON ATTRAPÉ** — 3 exécutions vertes, 0 trame perdue |
| M8b 200 ms bloquants à chaque tap                           | `fluidité`                 | attrapé — p95 183 ms                                  |

Deux mutations se sont révélées **inopérantes** et ne prouvent donc rien contre les tests : M5
(voile de l'état pressé porté de 12 % à 55 %) et M5b (teinte de bord **opaque** sur le tiers
extérieur) ne déplacent le contraste du score que de 4,79 à 4,63 puis 4,79 — mon propre instrument
ne voit rien non plus. La teinte d'état est géométriquement hors du chiffre : la robustesse vient
de la conception, pas d'un réglage. De même M6 (`max-width: 96%` réintroduite) est sans effet, la
largeur étant posée en ligne. M9 (`min-width: auto`) est neutralisée par la garde de `.recap-tag`.

**Bilan : 8 mutations opérantes sur 9 sont attrapées.** Le seul angle mort réel est la sensibilité
du test de fluidité.

## 4. Ce qui reste ouvert

1. **Thème `arcade` (Press Start 2P) sous le seuil de lisibilité.** Partie neuve par thème, 390×844,
   12 joueurs : capitale **25–34 px à 4 chiffres** et **22–24 px à 7 chiffres**, contre 31–46 pour
   les treize autres thèmes. Le test `hauteur de capitale` ne tourne que sur le thème par défaut.
   → étendre le test aux 14 thèmes ; la chasse pleine de Press Start 2P impose soit un troisième
   niveau de lignes, soit l'exclusion de cette police pour le score.
2. **`light` / carte 9 à 4,44 au repos** (moyenne 4,51), soit 0,06 sous le seuil — et à moins de 0,2
   du seuil, donc « défaut de conception » au sens de D21. Le test de contraste n'audite qu'**une
   seule carte** (couleur 1, 4 joueurs) : il ne peut pas voir ce cas.
   → boucler le test sur les 10 couleurs de carte ; corriger la paire (relève de la palette de B).
3. **Test de fluidité : plancher de sensibilité non caractérisé.** 30 ms de calcul par tap — un
   à-coup parfaitement visible sur un téléphone — passent 3 fois sur 3 sans une seule trame perdue
   (le nombre de trames mesurées monte de 160 à 220 sans que rien ne le signale) ; il faut 200 ms
   pour faire virer le test. Le rendu sans affichage ne cadence pas `requestAnimationFrame` sur le
   compositeur. → asserter aussi le NOMBRE de trames par rapport au témoin, et documenter le
   plancher mesuré au lieu de laisser croire à une garantie de 60 fps.
4. **Le témoin ne protège pas de la charge hôte (D21).** Avec trois serveurs de plus sur la machine,
   le même code sain donne 25 trames perdues sur 247 côté cartes et échoue, pendant que le témoin
   reste à 5/180 et déclare la machine saine. Faux rouge possible en CI.
   → lier le seuil des cartes au témoin (`taps.lost ≤ control.lost + 2`) plutôt que deux seuils
   absolus indépendants.
5. **Prénoms de 18 caractères toujours tronqués** à partir de 7 joueurs (12/12 cartes à n = 12,
   pire rapport visible/nécessaire 0,52 ; **0,38 à n = 11**, soit ~7 caractères sur 18). L'écran des
   prénoms avertit mais n'empêche pas. Physiquement inévitable sous le plancher de 12 px (D10) :
   je ne le compte plus comme un défaut, mais la grille 2.3 devrait dire « tronqué proprement,
   sans chevauchement » plutôt que « affiché ».
6. **Le test de contraste surpromet dans son intitulé.** Pour le SCORE, son instrument (mode du fond)
   renvoie une valeur **identique dans les 7 états** (12,86 / 5,23 / 7,32 / 7,31 au repos comme en
   pressé ; 2,03 sept fois sur le mutant M10). Les sept états n'ajoutent rien sur cette cible — ce
   qui est acceptable puisque j'ai prouvé qu'aucune teinte d'état n'atteint le chiffre, mais
   l'annotation doit le dire.
7. **11 joueurs / 7 chiffres à 29 px** : A le documente en toutes lettres comme une limite assumée
   et la verrouille par un test. Documenté, pas caché : j'accepte l'arbitrage.

## 5. Chantier en cours (constaté, non compté comme défaut)

Arbre de travail : bulle de delta déplacée **sous** le score (vérifiée fonctionnelle : opacité 1 aux
actions 1, 2 et 3, **0 intersection avec le chiffre, 0 débordement de carte** à 12 joueurs avec un
score à 7 chiffres) ; correction par **hauteur d'encre** du chiffre (vérifiée : **0 rognage sur les
14 thèmes** à 12 joueurs / 7 chiffres, y compris Cinzel et Press Start 2P) ; échelle du bloc
d'identité suivant la préférence système (D19). Les capitales mesurées sont identiques sur l'arbre
de travail et sur le commit : ce chantier n'a rien dégradé à ce stade.

## 6. Notes par dimension

| Dimension             | Détail                                                                                                               | Tour 1 | Tour 2  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- | ------ | ------- |
| D1.4 affordance +/−   | inchangé, prouvé                                                                                                     | 5/5    | **5/5** |
| D2 lisibilité         | 2.1 ✘ (arcade : 25 px à 12 j / 4 chiffres), 2.2 ✘ (4,44 au repos, couverture d'une seule carte), 2.3 ✔, 2.4 ✔, 2.5 ✔ | 2/5    | **3/5** |
| D3 gestes             | 3.1 à 3.5 ✔ — multitouch corrigé et prouvé jusqu'à 5 doigts                                                          | 4/5    | **5/5** |
| D4 mouvement          | 4.1 à 4.5 ✔ — 0 trame perdue, entrée réelle, témoin, 3 exécutions identiques                                         | 3/5    | **5/5** |
| D8 historique & récap | inchangé, recouvrement du journal corrigé                                                                            | 5/5    | **5/5** |

## 7. Comparaison à l'aveugle (BLIND-PROTOCOL — asymétrie de preuve assumée)

| Dim. | Référence                               | Tour 1  | Tour 2      | Confiance | Motif                                                                                                                                                                                                                                                                                                                         |
| ---- | --------------------------------------- | ------- | ----------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D2   | Mutility                                | B       | **Indécis** | 3/5       | À 4 joueurs les deux tiennent la promesse (101 px mesurés ici, « large life totals » déclaré là-bas) ; A couvre 12 joueurs avec un score sur deux lignes et un contraste mesuré. Ce qui m'empêche de préférer A : un thème livré où le chiffre tombe à 25 px et des prénoms tronqués.                                         |
| D3   | Mutility + Lotus                        | Indécis | **A**       | 4/5       | Le défaut qui me retenait au tour 1 — un tap sur deux perdu à deux doigts — est corrigé et prouvé jusqu'à cinq doigts. Zones délimitées, anneau d'appui long, pavé clavier, haptique par tap, retour visuel à 23 ms mesuré : aucune référence ne documente cet ensemble. Il manque encore la répétition continue au maintien. |
| D4   | Carbon + Mutility                       | Indécis | **A**       | 4/5       | Bulle de delta réparée et vérifiée jusqu'à la 10e action, chiffre à ressort de 220 ms, aucune reconstruction du DOM, mouvement réduit complet, et surtout **une mesure de 60 fps reproductible sur entrée réelle avec témoin** — que ne publie aucune référence.                                                              |
| D8   | Lifelinker + Keep Score + Score Counter | A       | **A**       | 4/5       | Inchangé : journal horodaté, retour à un point, rétablissement, copie, mini-courbes.                                                                                                                                                                                                                                          |

## 8. AAA : **non** — mais l'écart est réduit à D2

Trois dimensions sur cinq de mon périmètre passent à 5/5 et je préfère désormais ScoreTrack à la
référence sur les gestes et le mouvement, ce que je refusais au tour 1. Les deux défauts bloquants
que j'avais posés sont corrigés, et corrigés de façon **prouvée** : leurs tests échouent quand on
réintroduit le défaut. Il reste D2, sur deux points étroits et chiffrés — un thème dont le chiffre
tombe à 25 px à 12 joueurs, une paire de contraste à 4,44 au repos — et deux tests dont la
couverture doit s'étendre (thèmes pour la capitale, couleurs de carte pour le contraste). Ce sont
des corrections de quelques lignes, pas des arbitrages de conception.
