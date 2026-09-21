# DECISIONS-H — Élément H (round 4, post-clôture) : émojis système -> icônes SVG

Agent constructeur de l'élément H, ouvert sur demande explicite de
l'utilisateur après la clôture de l'audit AAA v2 et du chantier G (voir
`docs/audit/BRIEF.md` §9). Périmètre exclusif : `index.html`, `src/game.ts`,
`src/recap-pdf.ts`, `src/icons.ts` (non utilisé, voir §1), un nouveau
`src/ui-icons.ts`, nouveaux tests sous `tests/`/`e2e/`, ce fichier,
`docs/audit/BRIEF.md` §7 (ajout uniquement). Confirmé en fin de tâche par
`git status --short` : aucun autre fichier touché (§6).

## 0. Rappel du problème (P1 #7 du constat initial, D21/D26 §4)

Quatre émojis système utilisés comme icônes fonctionnelles :
- trophée (victoire),
- drapeau à damier (fin de manche / dernier perdant désigné),
- tête de mort (élimination),
- cadenas (confidentialité).

Rendu non maîtrisé selon la police système de la plateforme (Windows/Mac/
Android/iOS rendent différemment le même point de code), incohérent avec la
charte visuelle sombre et nette du reste de l'app (moteur de dés
notamment). Documenté comme dette non traitée par l'élément D en D21
(`docs/audit/DECISIONS-D.md` §4) : la plupart des occurrences sont assignées
dynamiquement par `game.ts`/`recap-pdf.ts`, hors du périmètre de D à
l'époque — nécessitait un tour coordonné, confié ici à un seul agent pour
garantir un style d'icône cohérent entre tous les points d'usage (raison
donnée par le brief §9 pour ne pas découper ce chantier entre plusieurs
agents).

## 1. Inventaire exhaustif (avant toute modification)

```
grep -rn '💀\|🏆\|🔒\|🏁\|☠️' index.html src/*.ts
```

- `index.html:1505` — `#btn-privacy-txt` (bouton, texte par défaut avant JS)
- `index.html:1512` — `#privacy-title-txt` (titre de page, texte par défaut)
- `index.html:1671` — `#winner-icon` (trophée par défaut, statique)
- `index.html:1695` — icône du `#elim-modal` (crâne, statique, sans id)
- `index.html:1707` — `#endgame-modal-icon` (drapeau par défaut, statique)
- `index.html:1758` — `#elim-anim-skull` (☠️, variante différente — voir §5)
- `src/game.ts:862` — `winIcon` (variable, tuile de carte vainqueur/finisher)
- `src/game.ts:878` — `.elim-icon` dans un `innerHTML` (tuile de carte éliminé)
- `src/game.ts:1146` — `$('endgame-modal-icon').textContent='🏆'`
- `src/game.ts:1168` — `$('endgame-modal-icon').textContent='🏁'`
- `src/game.ts:1742` — `$('winner-icon').textContent='💀'`
- `src/game.ts:1756` — `showWinnerModal` : `'🏆':'🏁'`
- `src/game.ts:1780` — `icon` (variable, badge de statut du récapitulatif)
- `src/game.ts:1788` — `.recap-status.elim` dans un `innerHTML`
- `src/recap-pdf.ts:137` — statut « winner » du tableau PDF
- `src/recap-pdf.ts:138` — statut « eliminated » du tableau PDF

Aucune occurrence de 🔒 dans `src/game.ts`/`src/recap-pdf.ts` (confirmé) :
le cadenas n'existe que dans `index.html` et, transitivement, dans les 18
langues de `src/i18n/translations.ts` (voir §4 — hors périmètre, dette
documentée là plutôt qu'ignorée).

`src/icons.ts` (existant) n'a pas été étendu : sa seule responsabilité est
la génération de l'icône d'app/favicon/manifest par `<canvas>` (PNG en
`data:` URI), une problématique complètement différente des icônes
d'interface inline de ce chantier (voir l'en-tête de `src/icons.ts` et la
consigne du brief de ne pas mélanger les deux responsabilités). Un nouveau
fichier `src/ui-icons.ts` a donc été créé.

## 2. Design des 4 icônes (`src/ui-icons.ts`)

### 2.1 Contrainte non négociable (D-PREF-1/D-CLAUDE-2)

Chaque icône doit rester identifiable par sa **silhouette**, indépendamment
de la couleur — jamais 4 pastilles de la même forme recolorées. Choix :

| Icône | Silhouette | Pourquoi distincte des 3 autres |
|---|---|---|
| Trophée | Coupe évasée + 2 anses en arc + socle à 2 étages | Seule forme « objet posé au sol », base large |
| Drapeau | Hampe verticale fine + rectangle à damier 4×3 | Seule forme avec un motif interne répété (damier) |
| Crâne | Disque arrondi + 2 orbites rondes + nez triangulaire + mâchoire dentée | Seule silhouette globalement ronde, avec des « trous » |
| Cadenas | Anse en arc ouvert au-dessus d'un corps rectangulaire à trou de serrure | Seule forme avec un arc ouvert en haut (pas fermé sur lui-même comme les anses du trophée) |

Chaque forme est construite avec une combinaison différente de primitives
SVG (nombre de `<path>`/`<rect>`, présence de trous `fill-rule="evenodd"`,
présence de traits `stroke`) — vérifié mécaniquement par
`tests/ui-icons.test.ts` (« signatures structurelles toutes différentes »)
et par l'e2e `e2e/functional-icons.spec.ts` (dernier test du fichier).

### 2.2 Couleur : `currentColor` partout, sauf le damier

Toutes les icônes utilisent `fill="currentColor"`/`stroke="currentColor"` :
la couleur suit celle du texte environnant (thème actif), jamais fixée en
dur — cohérent avec les 22 thèmes de l'app (D-CLAUDE-2 : la distinction ne
doit jamais reposer sur la couleur, donc la couleur elle-même peut varier
librement sans casser l'identification). Exception volontaire : le damier
du drapeau alterne littéralement `currentColor`/`none` (transparent, pas une
couleur fixe) avec un fin contour `stroke="currentColor"` sur chaque case,
pour que le motif reste visible même quand une case « vide » tombe sur un
fond de même teinte que `currentColor` — un vrai drapeau à damier est
d'ailleurs conventionnellement noir/blanc (achromatique par nature), ce qui
renforce plutôt que contredit la contrainte daltonienne.

### 2.3 Trous transparents plutôt que couleur plaquée

Les orbites/le nez du crâne et le trou de serrure du cadenas sont de vrais
trous (un seul `<path fill-rule="evenodd">` combinant le contour extérieur
et les sous-chemins internes) : ils laissent voir le fond réel derrière
l'icône, quel que soit ce fond (overlay noir des tuiles de carte, fond de
modal `--bg2` du thème actif, fond de page `--bg`...). Une couleur plaquée
en dur (ex. blanc) aurait pu casser sur un thème clair. Deux fonctions
utilitaires pures et testées (`_circleSubpath`, `_roundedRectSubpath`,
`tests/ui-icons.test.ts`) construisent ces sous-chemins pour éviter la
duplication de calcul entre le crâne (2 orbites) et le cadenas (1 trou de
serrure circulaire + trapèze).

### 2.4 Précision numérique (`_fmt`)

Les coordonnées calculées par soustraction/division (`_circleSubpath`,
`_roundedRectSubpath`, la grille du drapeau) produisent en JavaScript des
flottants à 17 chiffres (`9.2-1.7` → `7.499999999999999`). Sans traitement,
cela ne casse pas le rendu (un moteur SVG accepte cette précision) mais rend
les tests qui comparent une chaîne générée par Node à celle relue depuis un
DOM navigateur/jsdom fragiles : les deux moteurs peuvent re-sérialiser un
même nombre différemment à la relecture. `_fmt()` arrondit à 4 décimales
avant d'écrire chaque nombre dans le `d`/les attributs — mesuré : les
valeurs qui apparaissaient comme `2.6666666666666665` deviennent `2.6667`,
sans changement perceptible du rendu (moins de 0.0001 unité SVG, sur un
viewBox de 24 unités).

### 2.5 Taille et intégration DOM

Chaque `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"
focusable="false">` porte une règle CSS commune ajoutée dans `index.html` :

```css
.ui-icon{width:1em;height:1em;display:inline-block;vertical-align:-0.125em;flex-shrink:0;}
```

`width/height:1em` fait suivre l'icône au `font-size` du conteneur — exactement
le même mécanisme que l'émoji qu'elle remplace (un glyphe de texte suit
`font-size`), donc **aucune régression sur le dimensionnement dynamique déjà
en place** : `fitCard()` (`src/game.ts`, non modifié dans cette logique)
continue de faire `iconEl.style.fontSize=iconSz+'px'` sur `.win-icon`/
`.elim-icon` des tuiles de carte, et l'icône SVG à l'intérieur suit
automatiquement (vérifié visuellement, captures §3).

Deux couleurs de secours ont été fixées explicitement (au lieu de
`currentColor` hérité) pour les icônes des tuiles de carte, dont le fond est
un overlay `rgba(0,0,0,0.85)` **fixe** quel que soit le thème (contrairement
aux modales, dont le fond suit `--bg2` du thème) :
- `.win-icon{color:var(--accent)}` — même couleur que `.win-label` voisin ;
- `.elim-icon{color:#fff}` — même couleur que `.elim-label` voisin.

Sans ce choix, l'icône aurait hérité de `--text` (couleur de corps de texte
du thème), qui est **sombre** dans tous les thèmes clairs de l'app
(`--text:#10141a` p. ex.) — donc quasi invisible sur un fond
`rgba(0,0,0,0.85)` toujours sombre. Vérifié en lisant la cascade CSS
(`body{color:var(--text)}`, aucune règle `color` préexistante sur
`.win-icon`/`.elim-icon`), pas supposé.

## 3. Vérification visuelle réelle (Playwright)

`npm run build` puis `npx playwright test e2e/functional-icons.spec.ts`
(voir §7 pour le détail des 7 tests). Captures réelles (non committées,
`test-results/*.png`, ignoré par `.gitignore` — D4) :
- `h-privacy-lock.png` — cadenas visible devant « PRIVACY » (page
  confidentialité).
- `h-winner-trophy.png` / `h-winner-flag.png` — trophée / drapeau à damier
  visibles dans `#winner-modal`, partie réellement lancée jusqu'à l'écran
  de victoire (voir §7, fonction `startRealGame`).
- `h-elim-card-skull.png` / `h-elim-confirm-skull.png` /
  `h-recap-skull.png` — crâne visible sur la tuile de carte, dans la
  confirmation d'élimination et dans le badge du récapitulatif, partie
  réellement jouée jusqu'à l'élimination.

Point relevé pendant la vérification, sans rapport avec ce correctif :
`h-elim-card-skull.png`/`h-recap-skull.png` montrent aussi, en grand plan,
la tête de mort ☠️ **émoji** de l'animation d'élimination existante
(`#elim-anim-skull`, `src/animations.ts`) qui grossit à l'écran — confirmé
qu'elle coexiste sans conflit avec la nouvelle icône SVG (petite, à côté du
texte « ELIMINATED »), et confirmé qu'elle reste, comme prévu, hors
périmètre (voir §5).

### 3.1 Preuve de la distinction daltonienne (D-CLAUDE-2/D-PREF-1)

Les 4 icônes ont été rendues côte à côte (grille isolée, couleurs
distinctes assignées arbitrairement à chacune pour simuler le pire cas —
4 teintes différentes plutôt que la même `currentColor` partout), capturées
une première fois en couleur puis une seconde fois avec
`filter:grayscale(100%) contrast(1.1)` appliqué à la page entière — la même
technique que celle déjà utilisée par l'audit pour vérifier des contrastes
(cf. `e2e/accessibility-basics.spec.ts`). Les deux captures ont été
inspectées visuellement (pas seulement générées) :
- **Couleur** : trophée orange, drapeau bleu à damier, crâne rose, cadenas
  vert — 4 couleurs arbitraires très différentes.
- **Niveaux de gris** : les 4 silhouettes restent instantanément et
  individuellement reconnaissables — coupe à anses/socle, damier
  rectiligne, tête ronde à orbites/dents, cadenas à anse/trou de serrure.
  Aucune paire ne devient ambiguë une fois désaturée.

Ceci confirme mécaniquement ce que `tests/ui-icons.test.ts` vérifie déjà en
structure (signatures `<path>`/`<rect>`/`evenodd`/`stroke` toutes
différentes) : la distinction ne repose à aucun moment sur la teinte.

## 4. Confidentialité (`🔒`) : le cas particulier de `i18n.ts`/`translations.ts`

`index.html:1505`/`:1512` ont été corrigés (icône SVG cadenas insérée
directement dans le texte par défaut, émoji retiré). **Mais** ces deux
éléments (`#btn-privacy-txt`, `#privacy-title-txt`) reçoivent aussi leur
texte de `src/i18n.ts` (`applyLang()` → `_setText(id, t('btnPrivacy'))`/
`_setText(id, t('privacyTitle'))`), et **chacune des 18 langues de
`src/i18n/translations.ts` préfixe encore sa traduction par l'émoji
cadenas** (ex. `btnPrivacy:'🔒 Politique de confidentialité'`). Ces deux
fichiers sont hors du périmètre exclusif de cet élément (propriété de
l'élément D) — je ne les ai pas modifiés.

Or `_setText()` fait `el.textContent = val` (remplace tout le contenu,
y compris un `<svg>` posé à l'avance) et s'exécute :
1. une fois au démarrage, depuis `loadSettings()` (`src/game.ts`, dans mon
   périmètre) ;
2. à chaque changement de langue depuis le sélecteur, directement dans
   `src/i18n.ts` (lignes 217/255, **hors** de mon périmètre).

Un correctif limité au seul point d'appel (1) aurait laissé l'émoji
réapparaître au moindre changement de langue (point d'appel (2), que je ne
peux pas modifier). Solution retenue, entièrement dans `src/game.ts` :
`initFunctionalIcons()` pose un `MutationObserver` sur les deux éléments,
qui détecte un préfixe cadenas (`String.fromCodePoint(0x1F512)` — **construit
par point de code, jamais écrit en littéral dans `game.ts`**, pour ne pas
réintroduire l'émoji dans le fichier vérifié par `grep`, voir §7.1) dès
qu'il apparaît, peu importe qui a écrit le texte, et le remplace par
l'icône SVG + le reste du texte. `initFunctionalIcons()` est appelée une
fois depuis `loadSettings()`, juste après `applyLang(currentLang)` : le
`MutationObserver`, déjà posé à ce moment-là, reste actif pour toute la
durée de vie de la page et couvre donc aussi les changements de langue
ultérieurs déclenchés depuis `i18n.ts`.

Vérifié réellement (`tests/game.icons.test.ts`) : un texte déjà préfixé
avant l'appel de `initFunctionalIcons()` est corrigé immédiatement (passage
synchrone initial dans `_watchLockIcon`) ; un texte réinjecté après coup
(simulant l'effet de bord d'`i18n.ts`) est corrigé après un tour de
microtâche (comportement réel d'un `MutationObserver`, jamais synchrone).

**Dette documentée, non traitée ici** : les 18×2 chaînes de
`src/i18n/translations.ts` continuent de porter l'émoji cadenas en dur dans
leur code source (inoffensif à l'exécution grâce au correctif ci-dessus,
mais toujours présent comme texte mort dans le fichier). Un futur tour
pourrait, avec l'accord de l'élément D, retirer le préfixe `🔒 ` des 18
paires de clés `privacyTitle`/`btnPrivacy` pour ne plus avoir besoin du
`MutationObserver` de contournement — non fait ici : `translations.ts`
n'est pas dans mon périmètre exclusif, et le correctif actuel est déjà
complet et vérifié côté rendu (aucun émoji visible à l'écran, dans aucune
langue testée).

## 5. `#elim-anim-skull` (☠️) : laissé tel quel, volontairement

`index.html:1758` et son usage dans `src/animations.ts` (hors périmètre
d'édition explicite de ce chantier, rappelé par le brief) portent une
tête de mort ☠️ (U+2620, variante Unicode différente de 💀 U+1F480) comme
**état de départ d'une animation JS** : l'élément est agrandi/positionné
dynamiquement par du code JavaScript (transform, tailles calculées) pendant
la séquence d'élimination, puis masqué. Remplacer ce glyphe par un SVG
statique n'est pas un remplacement neutre ici : `src/animations.ts` en
dépend probablement pour des dimensions/transformations calculées à partir
des métriques du glyphe texte (aucune garantie que `transform`/`clip-path`
appliqués dessus se comportent identiquement sur un `<svg>` plutôt qu'un
caractère), et ce fichier est explicitement listé comme non modifiable dans
ce tour (« si un changement y est nécessaire, documente-le comme dette pour
un futur tour plutôt que d'y toucher »).

**Décision** : laissé tel quel. Documenté comme dette explicite pour un
futur tour qui aurait le mandat d'éditer `src/animations.ts` : remplacer
`#elim-anim-skull` par le même `ICON_SKULL` (`src/ui-icons.ts`), en
revalidant que l'animation (grossissement, position, éventuel filtre CSS)
produit un rendu équivalent avec un `<svg>` plutôt qu'un caractère de
texte — probablement en ajustant `transform-origin`/les unités utilisées
par `src/animations.ts` pour l'agrandissement. Non traité ici : hors
périmètre. Confirmé par capture (§3) que cette occurrence coexiste sans
conflit visuel ni fonctionnel avec le reste du correctif.

## 6. Export PDF (`src/recap-pdf.ts`)

Un émoji dans un PDF géré par jsPDF n'a pas de rendu fiable (police
manquante dans le lecteur PDF, glyphe couleur non supporté selon le moteur,
« tofu » — carré vide). Une vraie icône SVG n'a pas de sens dans ce
contexte texte (pas de moteur de rendu SVG dans le flux `doc.text()`).
Choix retenu (option B du brief, pas le compromis textuel « [Victoire]/
[Éliminé] ») : dessin vectoriel minimaliste avec l'API de dessin de jsPDF
(`doc.triangle`, `doc.circle`, `doc.rect`), cohérent avec les silhouettes
SVG de `src/ui-icons.ts` sans les copier littéralement (API différente) :
- **Trophée** : triangle inversé (coupe) + 2 traits (anses) + 2 petits
  rectangles empilés (tige + socle), couleur `C_WIN` (déjà utilisée par ce
  fichier pour le texte de statut « winner »).
- **Crâne** : disque + rectangle (mâchoire) en couleur `C_ELIM` (déjà
  utilisée pour le texte « eliminated »), puis orbites/nez « creusés » en
  blanc (`C_PAGE_BG`) par-dessus — technique équivalente aux trous
  `fill-rule="evenodd"` du SVG, adaptée à une API qui ne connaît que des
  formes pleines : fiable ici car aucune ligne du tableau des scores n'a de
  remplissage propre (fond de page blanc constant, vérifié en lisant le
  code existant avant d'écrire le correctif).

Pas d'icône « drapeau à damier » dans le PDF : `exportRecapPDF()` n'a
**jamais** distingué champion/finisher avant ce correctif (toujours le
même statut « winner », un seul `if(p.winner)` dans le code d'origine) —
seuls les émojis trophée et tête de mort apparaissaient. Ajouter une
distinction visuelle inédite (damier) aurait changé le contenu informatif
du PDF, hors du périmètre de cette tâche (remplacer des émojis existants
par des équivalents, pas enrichir le document). `drawFlagIcon` a d'ailleurs
été retiré du brouillon initial de ce fichier une fois ce constat fait :
`noUnusedLocals` (convention TypeScript du projet) l'aurait de toute façon
fait échouer au typecheck si elle était restée inutilisée.

## 7. Tests ajoutés

### 7.1 `tests/ui-icons.test.ts` (15 tests, module pur, sans DOM applicatif)

Importe directement `src/ui-icons.ts` (aucune dépendance, donc aucun risque
de retomber sur le conflit de types `tsconfig.test.json` documenté en
D13/D22). Couvre : enveloppe commune des 4 icônes (viewBox, classe,
`aria-hidden`/`focusable`), absence de tout caractère émoji dans les
chaînes générées, signatures structurelles des 4 icônes toutes différentes,
`victoryIcon(true/false)` exactement égal à `ICON_TROPHY`/`ICON_FLAG`, et
les deux helpers géométriques purs (`_circleSubpath`, `_roundedRectSubpath`).

### 7.2 `tests/game.icons.test.ts` (11 tests, via `tests/support/loadGame.js`)

Étend `tests/support/loadGame.d.ts` (ajout de `showWinnerModal`,
`initFunctionalIcons`, `_fixLockIcon` au sous-ensemble déjà exposé par
l'élément B — aucune entrée existante modifiée). Couvre le câblage réel
dans `game.ts` : `buildCard` (tuile éliminé → `ICON_SKULL`, tuile
vainqueur/finisher par défaut → `ICON_FLAG`), `showWinnerModal(true/false)`
→ `ICON_TROPHY`/`ICON_FLAG` sur `#winner-icon`, `showRecap()` (badges
éliminé/vainqueur), et le `MutationObserver` de l'icône cadenas (§4) —
correction immédiate d'un texte déjà préfixé, correction différée d'un
texte réinjecté après coup, et absence de faux positif sur un texte sans
rapport.

Les comparaisons de chaînes SVG passent systématiquement par une fonction
`normalize()` locale qui refait `div.innerHTML = svg; return div.innerHTML`
dans **le même moteur DOM** (jsdom ici, le navigateur dans le cas des tests
e2e) que celui qui a produit le HTML observé : jsdom/Chromium re-sérialisent
une balise vide (`<rect/>` écrite dans le code source) en `<rect></rect>`
à la lecture d'`innerHTML`, ce qui aurait cassé une comparaison à la chaîne
TypeScript brute même quand le contenu réel est rigoureusement identique
(constaté en écrivant une première version de ces tests sans `normalize()` :
5 échecs de faux diff, chacun confirmé être une différence de sérialisation
et non de contenu avant correction).

### 7.3 `e2e/functional-icons.spec.ts` (7 tests, build réel + Chromium)

Importe directement `ICON_TROPHY`/`ICON_FLAG`/`ICON_SKULL`/`ICON_LOCK`
depuis `src/ui-icons.ts` (comparaison à la source de vérité réelle, pas une
recopie manuelle qui se périmerait silencieusement). Couvre, sur le DOM
réellement rendu par `dist/index.html` :
1. Absence de tout émoji sur l'écran de démarrage.
2. Icône cadenas dans le bouton et le titre de la page confidentialité,
   accessible en cliquant réellement dessus (pas un raccourci JS).
3. Trophée dans `#winner-icon` (`showWinnerModal(true)`, partie réellement
   lancée au préalable — nécessaire pour que la modale, imbriquée dans
   `#game-screen`, soit effectivement rendue visuellement et pas seulement
   présente dans un sous-arbre `display:none`, voir piège de mesure
   documenté au fil du test).
4. Drapeau dans `#winner-icon` (`showWinnerModal(false)`).
5. Crâne sur la tuile de carte, après une élimination réellement jouée via
   `adjust()` (la vraie fonction déclenchée par le clavier du modal de
   score), jusqu'au récapitulatif.
6. Crâne dans `#elim-modal` (confirmation manuelle, ≤2 joueurs en jeu — cas
   distinct de l'élimination directe du test précédent).
7. Preuve mécanique que les 4 icônes ont des signatures structurelles
   toutes différentes (même méthode qu'en 7.1, rejouée côté build réel).

Captures d'écran prises à chaque étape clé (§3), non committées
(`test-results/`, ignoré — D4).

### 7.4 Mutation testing (règle §3.2 du brief : un test qui ne peut pas
structurellement échouer ne vaut rien)

Trois mutations distinctes, chacune cassée puis restaurée, échec confirmé
avant restauration, `diff` vide confirmé après restauration :

1. **`victoryIcon` (src/ui-icons.ts)** : polarité de la condition ternaire
   inversée (`isChampion ? ICON_FLAG : ICON_TROPHY`). 6 tests détectent
   l'échec (3 dans `tests/ui-icons.test.ts`, 3 dans
   `tests/game.icons.test.ts` via `showWinnerModal`).
2. **`LOCK_EMOJI` (src/game.ts)** : point de code changé de `0x1F512`
   (cadenas fermé) à `0x1F513` (cadenas ouvert, glyphe différent). 2 tests
   de `tests/game.icons.test.ts` détectent l'échec (le préfixe n'est plus
   reconnu, donc jamais corrigé).
3. **Mapping icône↔état (src/game.ts:917, `buildCard`)** : `ICON_SKULL`
   remplacé par `ICON_TROPHY` sur la tuile d'élimination. Détecté à la fois
   par `tests/game.icons.test.ts` (unitaire) et par
   `e2e/functional-icons.spec.ts` (bout en bout, build réel) — les deux
   niveaux de test couvrent réellement cette régression, pas seulement l'un
   des deux.

## 8. Régressions vérifiées : aucune

- `npm run typecheck` : vert (3 programmes : racine, `tsconfig.sw.json`,
  `tsconfig.test.json`).
- `npm run lint` : 0 erreur, 565 avertissements — **le même total qu'avant
  ce chantier** (tous préexistants, `no-var` sur du code non touché ici).
- `npm run test` (Vitest) : 113/113 verts (87 préexistants + 26 nouveaux :
  15 `tests/ui-icons.test.ts` + 11 `tests/game.icons.test.ts`).
- `npm run build` : vert, `dist/app.js` 1,6 Mo (poids inchangé à l'octet
  près près — aucune dépendance ajoutée, `src/ui-icons.ts` est quelques Ko
  de chaînes constantes).
- `npx playwright test` (35 specs, tous fichiers e2e confondus) : 35/35
  verts — les 28 tests préexistants (accessibilité, câblage `onclick`, CSP,
  polices auto-hébergées, export PDF hors ligne, fumée) restent verts sans
  modification, plus les 7 nouveaux de `e2e/functional-icons.spec.ts`.
- `aria-hidden` déjà présent sur les conteneurs d'icônes dans `index.html`
  conservé tel quel (`#winner-icon`, l'icône du `#elim-modal`,
  `#endgame-modal-icon`) ; les nouvelles balises `<svg>` portent en plus
  leur propre `aria-hidden="true" focusable="false"` (redondant mais
  inoffensif si un jour l'icône est réutilisée hors d'un conteneur déjà
  `aria-hidden`) — le texte adjacent (nom du joueur, libellé « Éliminé »/
  « Vainqueur »/« PRIVACY ») continue de porter seul le sens pour les
  lecteurs d'écran, comme c'était déjà le cas avec les émojis.
- `git status --short` en fin de tâche : seuls les fichiers du périmètre
  déclaré sont modifiés/ajoutés (voir en-tête de ce document).

## 9. Dette restante (résumé)

1. **`#elim-anim-skull` (☠️, `src/animations.ts`)** — non traité,
   volontairement (§5) : hors périmètre d'édition de ce chantier, dépendance
   probable à des métriques de glyphe texte pour l'animation.
2. **`src/i18n/translations.ts`** — 18×2 chaînes portent encore l'émoji
   cadenas en dur dans leur code source (§4), neutralisé à l'exécution par
   un `MutationObserver` dans `game.ts`, mais pas retiré à la racine (hors
   périmètre, propriété de l'élément D).
3. **`src/recap-pdf.ts`** — aucune icône « drapeau à damier » (§6),
   cohérent avec le comportement préexistant (jamais de distinction
   champion/finisher dans le PDF), pas un manque introduit par ce chantier.
