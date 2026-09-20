# Critique de l'élément A — écran de jeu, gestes, mouvement, modales, récap (tour 1)

Dépôt à l'état du commit `f663e2c` (« Écran de jeu de niveau AAA… »), arbre propre.
Toutes les mesures ci-dessous ont été refaites par le critique ; scripts et captures :
`scratchpad/critic/A/*.mjs`, `scratchpad/critic/A/shots/*.png`, `scratchpad/critic/A/*.json`.
Environnement : Chromium sans affichage, iPhone 13 (390×664) et gabarit de la grille (390×844).

---

## 1. État des suites

| Commande                                                  | Résultat                                                                        |
| --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `npm run lint` + `check:sw` + `test:unit`                 | vert                                                                            |
| `playwright test game.spec.js motion.spec.js` (2 workers) | **1 échec** : `fluidité`                                                        |
| idem `--workers=1`                                        | **2 échecs** : `fluidité`, `bulle de delta` (`à 1,2 s : reçu 0, attendu > 0,9`) |

Journaux : `critic/A/e2e-A.log`, `critic/A/e2e-A-w1.log`. La suite de A n'est donc **pas verte**
dans l'arbre courant, et l'un des deux échecs est un vrai défaut produit (§3.1).

## 2. Vérification des mesures revendiquées par A

| Revendication de A                                                                       | Mesure du critique                                                                                                                                                                                                               | Verdict                                                                                |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Capitale du score 97 px à 4 joueurs                                                      | **97 px à 390×664**, **92 px à 390×844** (gabarit imposé par la grille)                                                                                                                                                          | partiellement faux : sous le seuil de 96 px au gabarit de la grille                    |
| 59–69 px à 12 joueurs                                                                    | **59–69 px avec un score à 2 chiffres** ; 39–46 à 3 chiffres ; **27–31 à 4 chiffres** ; 17–22 à 7                                                                                                                                | vrai seulement pour le cas le plus favorable                                           |
| Intersection nom/score nulle, aucun débordement, n = 1..12, 4 rotations, prénoms 18 car. | **0 intersection / 0 débordement sur 155 cartes** (`m11-geom.json`)                                                                                                                                                              | **confirmé**                                                                           |
| Retour visuel 0,60 ms au p95                                                             | **médiane 30 ms, p95 52–74 ms, max 74 ms** du `pointerdown` matériel à la trame qui peint l'état pressé (`m5-latency.json`)                                                                                                      | **faux de deux ordres de grandeur** ; le test de A ne mesure pas ce qu'il annonce (§4) |
| p95 des trames 16,7–16,8 ms sur 20 taps (4 et 12 joueurs)                                | avec des taps **réels** (CDP) : p95 = 16,7–16,8 ms dans 4 séries sur 6, **33,3 ms dans 2 séries**, max 66–83 ms ; témoin identique sur l'en-tête (sans gestionnaire) : p95 16,7 ms, 0–2 trames perdues contre 3–7 sur les cartes | chiffre reproductible au mieux, mais « aucune trame > 16,7 ms » est faux               |
| Animation du chiffre 220 ms                                                              | **220 ms**, courbe `linear()` de ressort, `fill: none`                                                                                                                                                                           | **confirmé**                                                                           |
| Bulle de delta visible exactement la durée du groupe                                     | **vrai pour la toute première bulle d'un joueur ; 160 ms ensuite** (§3.1)                                                                                                                                                        | **faux**                                                                               |
| 0 nœud ajouté/retiré sous la grille (tap, annulation, rétablissement, rotation)          | **0** (observateur de mutations sur `#players-wrap`)                                                                                                                                                                             | **confirmé**                                                                           |
| Un seul changement de score et une seule vibration par tap                               | confirmé à un doigt ; **à deux doigts, un tap sur deux est perdu** (§3.2)                                                                                                                                                        | confirmé puis invalidé                                                                 |
| Aucune animation sous mouvement réduit                                                   | `document.getAnimations()` = 0, aucun transform résiduel après rotation, pas de confettis                                                                                                                                        | **confirmé**                                                                           |

Autres mesures confirmées : toutes les moitiés tactiles ≥ 44×44 px (0/155 en échec), signes +/− ≥ 24 px,
prénom et numéro de siège ≥ 12 px, cartes alignées sur des pixels entiers (0/155 en sous-pixel),
zoom 400 % des jonctions net (`shots/zoom400-jonction.png`).

## 3. Défauts trouvés en jouant

### 3.1 BLOQUANT — la bulle de delta cumulé ne fonctionne qu'une fois par joueur

`js/fx/score.js` → `hideDeltaBubble()` crée l'animation de fondu avec `fill: 'forwards'` et ne la
stocke ni ne l'annule (`bubbleTimers.set(node, { timer, anim: null })`). Une animation terminée en
`fill: forwards` prime sur le style en ligne : à partir de la **deuxième** action du même joueur,
`node.style.opacity = '1'` n'a plus aucun effet. Trace (`m9-bubble2.mjs`) :

```
série 1 : opacité 1 de 150 ms à 1500 ms, puis fondu   <- conforme
série 2 : opacité 1 de 100 à 200 ms, 0 dès 250 ms     <- 160 ms au lieu de 1500
série 3 : identique
```

Le test `bulle de delta` de `motion.spec.js` ne l'attrape pas : il ne teste que la première bulle
d'une partie neuve. Il échoue par ailleurs en charge (fenêtre de 1500 ms chronométrée depuis un
point non borné). Correction : `fill: 'none'` (le style en ligne porte déjà l'état final) ou
mémoriser l'animation et l'annuler dans `showDeltaBubble`.

### 3.2 BLOQUANT — un seul doigt à la fois : les taps simultanés sont perdus

`js/ui/game.js` garde un unique `let pressed = null` et `onPointerDown` appelle `endPress()` sans
condition. Le deuxième doigt annule le premier appui, qui n'applique rien. Mesuré (`m4-multitouch.mjs`,
événements tactiles CDP) :

```
2 doigts / 2 cartes (simultanés, 30 ms, 120 ms) : 100 / 99  (attendu 101 / 99)
3 doigts / 3 cartes                              : 100,100,101 (attendu 101,101,101)
```

Un tap sur deux, ou deux sur trois, est silencieusement perdu — sans vibration, sans trace au
journal, après un retour visuel « pressé » qui laisse croire au succès. C'est le scénario même du
produit (D8 : téléphone posé au milieu de la table, 1 à 12 joueurs). Aucun test ne le couvre.
Correction : `const presses = new Map()` clé `pointerId`, `endPress(pointerId)` ciblé.

### 3.3 MAJEUR — le joueur du bas a un score 3× plus petit que les autres (n impair ≥ 5)

`css/game.css` `.card-face { padding: 3% 4%; }` : un padding vertical en pourcentage se résout sur
la **largeur**. Sur la carte bandeau (388×90 à 11 joueurs) cela retire 23 px des 90 px de hauteur
(26 %), contre 5 px sur 193 pour une carte latérale (2,7 %). Mesures (`m2-shots.mjs`) :

```
11 joueurs, score « 7 » : carte 1 (bandeau) font-size 44 px / capitale 31 px
                          cartes 2 à 11      font-size 138 px / capitale 97 px
 9 joueurs :              62 px contre 144 px
 7 joueurs :              85 px contre 104 px
```

`computeFit` (cœur) calcule 90 px pour cette carte ; le DOM en applique 44. La correction par mesure
de `layout-fit.js` ne rattrape pas l'écart parce qu'elle ne corrige que la **largeur**.
Capture : `shots/grid-11j.png`. Correction : padding vertical en px (`padding: 4px 4%`) ou
`padding-block: min(3%, 6px)`.

### 3.4 MAJEUR — contraste du score sous le doigt

Contraste mesuré sur les **pixels réellement peints** (fond composé : carte + teinte de moitié +
texture + voile pressé), 14 thèmes × 3 états × 12 cartes, pire cellule sur une grille 4×2 de la
boîte du score (`m10-contrast.json`, méthode indépendante `critic/A/wcag.mjs`) :

| État                    | Thèmes dont le score passe sous 4,5:1 | Pire                                                               |
| ----------------------- | ------------------------------------- | ------------------------------------------------------------------ |
| repos                   | 1/14 (`light` 4,42)                   | 4,42                                                               |
| moitié « + » pressée    | **9/14**                              | **2,98** (`light`) — moyenne 3,71, donc pas un artefact de cellule |
| moitié « − » pressée    | 8/14                                  | 3,25 (`light`)                                                     |
| numéro de siège, pressé | 12/14 (opacité 0,72)                  | 3,02 (`ldm`)                                                       |

Le commentaire de `css/game.css` (« aucune paire score/fond n'est dégradée », « voile ≤ 12 % »)
est donc faux au moment précis où l'utilisateur regarde. D16 impose de mesurer les états réels.

### 3.5 MAJEUR — les prénoms sont tronqués, y compris les courts

`fitCard` réduit la taille du nom tant que `.pname.scrollWidth > box.w × 0,9`, mais l'enfant
`.pplayer` est en réalité borné par `max-width: 96 %` de `.card-face` (rembourrée) : la boucle
s'arrête 3 px trop tôt et l'ellipse tombe. Mesures :

```
prénoms de 18 caractères : tronqués sur 116/155 cartes
   n=7 : ~14 car. visibles · n=9 : ~10 · n=11 : ~7 · n=12 : ~9
prénoms COURTS : « Alice » tronqué en « Ali… » sur la carte centrale à n = 8, 10 et 12
   (`.pplayer` 67 px disponibles pour 70 px nécessaires)
```

Captures : `shots/grid-12j.png`, `shots/cvd-12j-achromatopsia.png` (« Ali… », « Ga… » sur les deux
plus GRANDES cartes de la grille). Correction : dans `js/fx/layout-fit.js`, itérer tant que
`label.scrollWidth > label.clientWidth`, et retirer `max-width: 96%` de `.pname`.

### 3.6 MAJEUR — le journal du récap passe sous le bouton « Revenir ici »

`.recap-action` est une grille `1fr auto` mais `.recap-action-body` n'a pas de `min-width: 0` :
la pastille « 8 taps : −1 −1 … » déborde sa colonne et glisse sous le bouton. Mesure
(`m13-recapoverlap.mjs`) : intersection géométrique confirmée sur l'action n°1 ; la fin de la liste
est illisible. Sur d'autres entrées, « de 50 à 45 » se replie à un mot par ligne
(`shots/recap-journal.png`). Correction : `min-width: 0` + ellipse sur `.recap-tag`.

### 3.7 Défauts mineurs constatés

1. Mini-courbes du récap normalisées **par joueur** : une progression de +25 et une chute de −5
   ont exactement la même pente. Information trompeuse (`shots/recap-haut.png`).
2. `.recap-rank-meta` se replie sur deux lignes une ligne sur trois : rythme vertical cassé.
3. Modale de victoire : le titre « Objectif atteint » et le sous-titre « Objectif atteint · 10 / 10 »
   se répètent mot pour mot (`shots/victoire.png`).
4. Colonne centrale à 8/10/12 joueurs : le prénom et le score sont séparés par 300 à 500 px de
   texture vide ; les deux plus grandes cartes portent les prénoms les plus tronqués.
5. L'anneau d'appui long est centré sur la moitié et se superpose au chiffre
   (`shots/appui-250ms.png`).
6. `will-change: transform` posé en permanence sur toutes les `.score` : jusqu'à 12 couches
   composites maintenues en mémoire pendant toute la partie.
7. `.tap-half` anime un `box-shadow: inset 0 0 0 999px` (pressé, flash, butée) : c'est un repaint
   plein cadre de la moitié à chaque tap, candidat probable aux trames perdues mesurées au §2.
8. Feuille joueur : le champ de renommage n'a aucun libellé et a exactement la même forme que le
   bouton « Éliminer » ; aucun dé, aucun tirage du premier joueur, aucun minuteur (écart 11 de
   `GAPS.md`, explicitement attribué à A, non traité).
9. Ce que le pavé ne montre pas : le score projeté (« 62 → 79 »).

### 3.8 Ce qui a résisté à toutes mes tentatives de casse

Salve de 20 taps en < 400 ms (score et groupe exacts) ; tap pendant l'animation du chiffre (aucun
transform résiduel) ; rotation pendant un appui long (pavé ouvert, score inchangé) ; annulation
pendant les confettis (modale fermée, canevas retiré, score restauré) ; pavé ouvert puis
rechargement (aucune modale fantôme, bannière de reprise) ; élimination puis annulation
(réintégration complète, moitiés réactivées) ; undo ×40 puis redo ×40 (états JSON identiques, DOM
synchronisé) ; rechargement en pleine partie (scores et annulation conservés) ; score négatif à
7 chiffres à 12 joueurs (affiché, sans débordement) ; prénoms vides (numéro de siège seul) ;
victoire par plafond et par dernier survivant. **Zéro erreur console sur l'ensemble des parcours.**

## 4. Qualité des tests de A (D17)

Bons et non complaisants : `taps à ±4 px de la frontière` (taps tactiles réels sur les 4 rotations),
`appui long 200/600 ms` (CDP), `pavé au clavier physique`, `récap` (presse-papiers réel, retour à un
point, rétablissement), `feuille joueur` (piège de focus éprouvé sur 6 tabulations), `annulation`
(vérifie la sauvegarde persistée), `un tap réel = un seul changement` (tactile, souris, clavier),
`identifiant non chromatique`, `DOM des cartes survit`. Aucune assertion conditionnée à une
variable d'environnement, aucun `skip`, aucun filtre silencieux.

Trois tests valent **zéro** :

1. `retour visuel … moins de 100 ms` : l'`MutationObserver` est **déconnecté synchronement** juste
   après `dispatchEvent`, donc son rappel (micro-tâche) ne s'exécute jamais ; `mark` reste `null` et
   la valeur mesurée est la durée synchrone de `dispatchEvent`. D'où les 0,60 ms. Le test ne peut
   pas échouer et ne mesure aucun retour visuel.
2. `fluidité` : événements `PointerEvent` **synthétiques émis depuis la page**, qui court-circuitent
   le pipeline d'entrée, le test de survol et le compositeur ; l'assertion `taps.p95 < idle.p95 × 2 + 2`
   tolère une trame perdue par construction. Et il échoue réellement (2 runs sur 2).
3. `bulle de delta` : ne teste que la première bulle d'une partie neuve — exactement le seul cas où
   le bug du §3.1 ne se voit pas.

Deux tests sont réglés sur le cas favorable : `hauteur de capitale` (score à 2 chiffres, gabarit
390×664) et `12 joueurs / prénoms de 18 caractères` (vérifie l'absence de chevauchement, jamais la
lisibilité du prénom). Aucun test ne couvre le multitouch.

## 5. Notes par dimension

| Dimension              | Critères OUI                                                                    | Note    |
| ---------------------- | ------------------------------------------------------------------------------- | ------- |
| D1.4 affordance +/−    | 1/1 (signes ≥ 24 px sur 155 cartes, séparateur médian 2 px, teintes distinctes) | **5/5** |
| D2 écran & lisibilité  | 2.4 ✔, 2.5 ✔ ; 2.1 ✘, 2.2 ✘, 2.3 ✘                                              | **2/5** |
| D3 gestes & réactivité | 3.1 ✔, 3.2 ✔, 3.3 ✔, 3.4 ✔ ; 3.5 ✘ (tap perdu à deux doigts)                    | **4/5** |
| D4 motion              | 4.1 ✔, 4.3 ✔, 4.4 ✔ ; 4.2 ✘, 4.5 ✘                                              | **3/5** |
| D8 historique & récap  | 8.1 à 8.5 ✔ (défauts de rendu listés en 3.6 et 3.7)                             | **5/5** |

## 6. Comparaison à l'aveugle (BLIND-PROTOCOL, §6 limites reproduites)

Asymétrie de preuve assumée : ScoreTrack est mesuré en exécution réelle, les références sont
décrites depuis des sources publiques et n'ont pas été exécutées. Aucun « non couvert » n'est
converti en « NON » au bénéfice de ScoreTrack.

| Dim. | App B (référence)                                                                     | Préférence  | Confiance | Motif                                                                                                                                                                                                                                                                                        |
| ---- | ------------------------------------------------------------------------------------- | ----------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D2   | Mutility (« large, beautiful life totals », 1–4 joueurs)                              | **B**       | 3/5       | À 4 joueurs A est au niveau (capitale 92–97 px) mais échoue son propre seuil au gabarit du brief, dégrade le contraste sous le doigt sur 9 thèmes et tronque les prénoms dès 7 joueurs. B ne couvre pas 12 joueurs : la supériorité de A au-delà de 4 est hors périmètre, pas une victoire.  |
| D3   | Mutility (gauche/droite, maintien = répétition) + Lotus (pavé au tap, pas de 10)      | **Indécis** | 4/5       | A ajoute l'anneau de progression, les zones délimitées, le pavé clavier, l'haptique par tap — aucune référence ne documente les deux premiers. Mais A perd un tap sur deux à deux doigts, ce qu'aucune référence de table ne se permettrait, et n'offre ni répétition continue ni pas de 10. |
| D4   | Carbon (animations sobres) + Mutility (motion réduit)                                 | **Indécis** | 3/5       | A documente `prefers-reduced-motion`, l'animation à ressort de 220 ms et l'absence de reconstruction du DOM ; aucune référence ne publie cela. Mais sa mesure de 60 fps ne prouve rien et sa bulle de delta est cassée dès la deuxième action.                                               |
| D8   | Lifelinker (retour à un point) + Keep Score (édition, stats) + Score Counter (graphe) | **A**       | 4/5       | Journal chronologique horodaté avec moyen d'action, retour à un point avec confirmation **et** rétablissement, copie texte, mini-courbes, classement complet : aucune référence unique ne réunit les trois derniers. Les défauts relevés sont de mise en page, pas de fond.                  |

Une préférence pour la référence sur D2 alors que D2 est à 2/5 est cohérente : la grille n'a pas de
critère manquant, c'est ScoreTrack qui n'y répond pas.

## 7. Corrections, par gravité

**Bloquant**

1. `js/fx/score.js`, `hideDeltaBubble()` : remplacer `fill: 'forwards'` par `fill: 'none'` (le style
   en ligne `opacity = '0'` porte déjà l'état final), ou mémoriser l'animation et l'annuler en tête
   de `showDeltaBubble()`. Attendu : opacité ≥ 0,9 pendant 1500 ms **à la 2e et à la 10e action**
   d'un même joueur. Ajouter le cas au test `bulle de delta` et chronométrer depuis le dernier tap.
2. `js/ui/game.js` : remplacer `let pressed = null` par `const presses = new Map()` clé
   `e.pointerId` ; `endPress(id)` ne clôt que cet appui ; `onPointerDown` n'annule que le même
   `pointerId`. Attendu : 3 doigts sur 3 cartes = 3 changements de score et 3 vibrations. Test :
   `Input.dispatchTouchEvent` avec 2 puis 3 `touchPoints`.
3. `css/game.css` `.card-face` : `padding: 4px 4%` (ou `padding-block: min(3%, 6px)`). Attendu :
   à 11 joueurs, la carte bandeau passe d'une capitale de 31 px à ≥ 70 px, et l'écart de taille du
   score entre cartes d'une même disposition tombe sous 1,5×. Verrouiller par un test de propriété
   sur n = 5, 7, 9, 11.

**Majeur** 4. `css/game.css` `.tap-half.pressed/.flash-*/.blocked` : ramener le voile sous le chiffre à 0 %
(garder le liseré intérieur de 4 px et teinter uniquement le tiers extérieur, comme le repos).
Attendu : ≥ 4,5:1 sur les 14 thèmes dans les états pressé et flash, mesuré sur pixels rendus. 5. `js/fx/layout-fit.js`, `shrinkToWidth()` : boucler tant que `flexible.scrollWidth >
   flexible.clientWidth + 0.5` ; `css/game.css` `.pname` : retirer `max-width: 96%` (la largeur est
déjà posée en ligne). Attendu : aucun prénom de ≤ 8 caractères tronqué jusqu'à 12 joueurs. 6. `css/modals.css` `.recap-action-body { min-width: 0 }` et `.recap-tag { overflow: hidden;
   text-overflow: ellipsis }`. Attendu : 0 intersection géométrique entre `.recap-tag` et
`.recap-jump-btn`, à vérifier par test. 7. `tests/e2e/motion.spec.js`, test `retour visuel` : mesurer du `pointerdown` matériel (CDP
`Input.dispatchTouchEvent`) à la trame `requestAnimationFrame` qui suit le traitement. Attendu :
p95 < 100 ms — la valeur réelle est 52–74 ms, l'assertion reste tenable. 8. `tests/e2e/motion.spec.js`, test `fluidité` : taps réels via CDP, et assertion absolue
(`p95 ≤ 1,5 × période au repos`, `max ≤ 3 trames`), avec un témoin sur une zone sans gestionnaire.
Attendu : le test distingue le coût de l'application du bruit de l'environnement. 9. `tests/e2e/game.spec.js`, `hauteur de capitale` : couvrir 2, 4 et 7 chiffres, et 390×844. Décider
explicitement : soit le seuil de 96 px vaut au gabarit du brief (et il faut retrouver 4 px), soit
la grille doit être corrigée.

**Mineur** 10. `js/ui/recap.js`, `sparkline()` : échelle verticale commune à tous les joueurs (min/max global). 11. `css/modals.css` `.recap-rank-meta` : `white-space: nowrap` et abréviation (« −13 · +12 »). 12. `js/ui/modals.js`, `openWinnerModal` : supprimer la répétition du titre dans le sous-titre. 13. `css/game.css` `.score` : retirer `will-change: transform` (poser la couche à l'animation). 14. `css/game.css` : remplacer `box-shadow: inset 0 0 0 999px` par un pseudo-élément en `opacity`. 15. `js/ui/modals.js`, feuille joueur : libellé « Prénom » sur le champ ; envisager le dé, le tirage
du premier joueur et le minuteur (écart 11 de `GAPS.md`, attribué à A, non traité). 16. `js/fx/hold-ring.js` / `css/game.css` `.hold-ring` : décaler l'anneau vers le bord extérieur de
la moitié pour qu'il ne recouvre plus le chiffre.

## 8. Avis tranché sur les trois points laissés ouverts par A

**Score à 7 chiffres à 12 joueurs (20–22 px contre 30 exigés).** Contrainte physique **et** choix de
conception. Sur une carte de 130×146 px, 7 chiffres à 30 px de capitale demandent 180 px de large :
impossible sur une ligne, A a raison. Mais c'est l'exigence de précision totale sur une ligne qui est
un choix, pas une fatalité : deux lignes (`1 234` / `567`), ou une notation abrégée avec la valeur
exacte au pavé, tiendraient le seuil. Le vrai problème n'est d'ailleurs pas 7 chiffres — c'est
**4 chiffres à 12 joueurs, mesuré à 27–31 px**, cas parfaitement courant (rami, canasta, Skyjo
cumulé) qui échoue déjà le seuil. À traiter ; la mention « 7 chiffres » masque le cas réel.

**Orientation de lecture des colonnes latérales.** Correcte et à conserver. Le « − » qui paraît
vertical sur une capture vue de face est horizontal pour le joueur assis sur ce côté, qui est le seul
destinataire de la carte ; l'écart 4 de `GAPS.md` est résolu, et le cercle autour du trait lève
l'ambiguïté résiduelle. Le vrai problème des colonnes latérales n'est pas l'orientation, c'est la
largeur de lecture (90 à 130 px) qui tronque les prénoms.

**Correction de chasse par mesure qui double partiellement le calcul du cœur.** À conserver, mais
elle est aujourd'hui un **cache-misère**. Elle est légitime : aucune chasse moyenne ne couvre l'écart
entre « Press Start 2P » (1 em) et « Inter » (0,55 em), il faut mesurer. Ce qui n'est pas légitime,
c'est que `computeFit` calcule 90 px et que le DOM en applique 44 (§3.3) sans que personne ne le
remarque : le cœur ignore la rembourrure réelle, et la correction ne compense que la largeur. Il faut
soit donner au cœur la boîte de contenu réelle (rembourrure déduite), soit poser une assertion de
cohérence — en développement, avertir si `|scoreSz appliqué − fit.scoreSz| > 20 %`. La correction
n'est pas de trop ; c'est le silence entre les deux calculs qui l'est.

## 9. AAA : **non**

Deux défauts bloquants dans le geste et le mouvement (taps simultanés perdus, bulle de delta morte
après la première action), un défaut de disposition qui donne au joueur assis en bas un chiffre trois
fois plus petit qu'aux autres, un contraste AA perdu sous le doigt sur neuf thèmes, des prénoms
tronqués dès cinq caractères, et deux tests rouges dans l'arbre. Le socle est cependant très solide —
identité du DOM préservée, annulation/rétablissement irréprochables, récap complet, clavier et
mouvement réduit exemplaires, zéro erreur console sur tous les parcours : les corrections 1 à 6 sont
localisées et devraient suffire à repasser D3, D4 et D8 à 5/5. D2 demandera un arbitrage de fond sur
la taille du chiffre.
