# DECISIONS-C — Élément C : Moteur de dés 3D (qualité d'ingénierie uniquement)

Agent constructeur de l'élément C (audit qualité AAA ScoreTrack, brief v2).
Périmètre exclusif : `src/dice3d/cube.ts`, `src/dice3d/die.ts`,
`src/dice3d/polyhedra.ts`, `src/dice3d/types.ts`, `src/dice-ui.ts`, nouveaux
fichiers de tests sous `tests/`, ce fichier, et `docs/audit/BRIEF.md` §7
(ajout uniquement). Voir `docs/audit/BRIEF.md` pour le brief complet
(en particulier D-CLAUDE-1, la décision verrouillée sur le moteur de dés) et
`docs/audit/CONSTAT-INITIAL.md` pour le constat de départ.

**Règle absolue appliquée à chaque étape : aucune modification visuelle.**
Tout changement ci-dessous est un changement d'ingénierie interne (typage,
robustesse, tests, libération de ressources) qui ne touche à aucun angle,
rayon, couleur, taille de police, matériau ou proportion documentés dans
`CLAUDE.md` §« Lanceur de dés ». La preuve d'absence de régression est au §4.

## 0. Note méthodologique : dépôt partagé vivant

Comme documenté indépendamment par les éléments A et B
(`docs/audit/A-critique-round1.md` §0, `docs/audit/DECISIONS-B.md` §0),
`/home/user/scoretrack` est un répertoire de travail partagé en direct par
plusieurs agents concurrents (au moment de mon travail : au moins B, E, F,
et un critique de A, tous avec des modifications non commitées visibles dans
`git status` sur des fichiers hors de mon périmètre — `index.html`,
`src/i18n.ts`, `src/i18n/translations.ts`, `src/game.ts`, `src/recap-pdf.ts`,
`src/sw-worker.ts`, `build.mjs`, `vercel.json`, `.gitignore`, `README.md`).
Conséquence directe : `npm run typecheck` sur l'ARBRE PARTAGÉ affiche des
erreurs dans `src/animations.ts`, `src/game.ts`, `src/i18n.ts` — vérifié
n'avoir AUCUN rapport avec mes fichiers en comparant `git stash` (retour au
dernier commit) vs état courant : l'ensemble exact des erreurs préexiste déjà
au dernier commit (`2c088ad`, avant même mes modifications), dans des fichiers
hors de mon périmètre exclusif (B et D). Après chacune de mes modifications,
`npm run typecheck 2>&1 | grep -oE "^src/...\.ts"` ne fait jamais apparaître
`dice-ui.ts` ni `dice3d/*.ts` dans la liste des fichiers en erreur : mon
périmètre est et reste 100 % propre. Je recommande au critique de l'élément C
de revérifier depuis un `git worktree` isolé sur mon dernier commit exact,
comme B le recommande pour son propre périmètre, afin de ne pas capturer un
état transitoire d'un autre agent en cours d'écriture.

## 1. Défauts d'ingénierie trouvés et corrigés

### 1.1 Fuite mémoire GPU réelle sur les dés reconstruits (`src/dice-ui.ts`)

**Constat.** `_disposeDice3D()` ne faisait que
`renderer.forceContextLoss(); renderer.dispose();` avant de jeter la
référence au dé. J'ai vérifié dans le code source de `three@0.149.0`
installé (`node_modules/three/build/three.js`, fonction `WebGLProperties`)
que `renderer.dispose()` **n'appelle jamais** `gl.deleteBuffer`/
`gl.deleteTexture` sur les géométries/matériaux/textures : il se contente de
remplacer la `WeakMap` interne de suivi par une neuve
(`function dispose(){ properties = new WeakMap(); }`). La libération réelle
du GPU dépendait donc entièrement de `forceContextLoss()`, qui elle-même
n'agit que si l'extension `WEBGL_lose_context` est disponible
(`this.forceContextLoss = function(){ const extension = extensions.get(
'WEBGL_lose_context' ); if(extension) extension.loseContext(); };` — sinon
c'est un no-op silencieux). C'est le risque que la note de `CLAUDE.md` sur
les contextes WebGL simultanés pointe indirectement : un lanceur qui
reconstruit ses dés à **chaque** changement de type/nombre (`diceFacesStep`,
`diceCountStep`, sélection rapide) et à chaque changement de thème
(`diceResetPreview`) sans jamais disposer explicitement les
géométries/matériaux/textures s'expose à une fuite GPU si l'extension
manque ou est bridée par le pilote.

> **Mise à jour round 2 (voir `docs/audit/C-critique-round1.md` §2, P2) — à
> lire avant de juger la sévérité.** Le critique a mesuré indépendamment la
> RSS process sur 64 cycles de reconstruction (9 dés/cycle) : **dans
> l'environnement de test prescrit par `CLAUDE.md` (`--use-gl=swiftshader`,
> extension `WEBGL_lose_context` disponible), l'écart avant/après ce
> correctif est dans le bruit de mesure** (+226 Mo sans le correctif contre
> +210 Mo avec, sur un process Chromium complet — pas un écart qu'on peut
> attribuer avec confiance au correctif plutôt qu'au bruit). L'effet devient
> net, mais reste modeste, uniquement quand `WEBGL_lose_context` est
> neutralisée artificiellement (+268 Mo sans vs +248 Mo avec, mesuré une
> seule fois). **Verdict correct à retenir : c'est une bonne pratique
> Three.js standard et un filet de sécurité légitime pour les environnements
> dégradés (extension absente/bridée), PAS une suppression mesurée d'une
> fuite massive dans l'environnement de test standard du projet.** Ma
> première rédaction ci-dessous (« fuite mémoire GPU réelle... pas seulement
> dans l'hypothèse pathologique ») était plus affirmative que ce que la
> mesure indépendante démontre ; je la corrige explicitement plutôt que de la
> réécrire silencieusement (cf. journal `BRIEF.md` §7, D-PREF-2) — le
> paragraphe qui suit reste tel qu'écrit initialement, à lire à la lumière de
> cette mise à jour.

**Correctif.** Nouvelle fonction exportée `_disposeSceneResources(scene)`
dans `src/dice-ui.ts` : parcourt la scène entière (`scene.traverse`) et
appelle explicitement `.dispose()` sur chaque géométrie, chaque matériau et,
pour les matériaux qui en portent une, la texture `.map` — **sauf** si cette
texture est marquée `userData.shared` (voir 1.2). Dispose aussi la render
target de la shadow map d'une lumière si déjà allouée. Appelée en tout début
de `_disposeDice3D()`, avant `forceContextLoss()`/`dispose()` (conservés en
défense complémentaire, sans coût, pour les environnements où l'extension
est disponible). Couvre au passage un oubli distinct : le sol
(`floor = new THREE.Mesh(new THREE.PlaneGeometry(12,12), new
THREE.ShadowMaterial(...))`, construit dans `diceBuild3D`) n'était référencé
nulle part pour disposal — il est maintenant couvert par le parcours
générique de la scène puisqu'il y est ajouté (`scene.add(floor)`).

**Ce que ce correctif ne change PAS** : aucune géométrie, aucun matériau,
aucune couleur, aucun angle de caméra, aucune texture-chiffre n'est modifié —
seule la fin de vie des objets déjà affichés est traitée, une fois qu'ils
sont sur le point d'être jetés pour être remplacés. Preuve pixel par pixel
au §4.

### 1.2 Marquage des textures partagées (`src/dice3d/die.ts`, `src/dice3d/types.ts`)

Le cache `_numTexCache` (`_numTex()`) réutilise la **même** instance de
`THREE.CanvasTexture` pour toutes les plaques-chiffres de tous les dés vivants
partageant la même valeur/couleur (commentaire d'origine : « évite de
régénérer 120 canvases »). Disposer une texture partagée en détruisant UN
seul dé casserait l'affichage des chiffres des AUTRES dés encore affichés
(texture GPU libérée mais toujours référencée ailleurs). J'ai donc marqué
`userData.shared = true` sur toute texture qui transite par ce cache
(`_numTex`), et `_disposeSceneResources` ne dispose jamais une texture ainsi
marquée. À l'inverse, les textures de points du d6/d3/pièce
(`_dieFaceTexture` dans `cube.ts`) ne sont **jamais** mises en cache — elles
sont régénérées à chaque construction de dé — et restent donc candidates à
la libération : c'est le cas réel de fuite le plus visible (chaque
changement de type de dé vers d6/d3/pièce, ou chaque thème changé pendant
que le lanceur est ouvert, créait des canvases 256×256 jamais libérés).
Type `NumTexUserData.shared?: boolean` ajouté dans `src/dice3d/types.ts`
pour documenter le contrat.

### 1.3 Fuite DOM sur `_cardBgHex` (`src/dice3d/die.ts`)

**Constat.** `_cardBgHex(n)` crée une sonde `<div>` invisible, la mesure via
`getComputedStyle`, puis la retire — mais le retrait
(`document.body.removeChild(probe)`) n'était PAS dans un `finally` : une
exception entre l'ajout et le retrait (par ex. `getComputedStyle` qui lève
dans un environnement dégradé, ou le `.match()` suivant) laissait un `<div>`
orphelin dans `<body>`. Cette fonction est appelée jusqu'à 10 fois (boucle
`n=1..10`) à **chaque** construction de dé (`_diceBodyColor`), donc jusqu'à
10 sondes potentiellement orphelines par dé construit sur le chemin d'échec.

**Correctif.** `try/finally` : le retrait de la sonde est désormais
garanti quel que soit le chemin de sortie (retour normal ou exception),
vérifié par un test qui simule l'échec (`getComputedStyle` mocké pour lever)
et vérifie qu'aucune sonde `.pcard` ne reste dans `<body>` (voir §3, mutation
testing confirmée).

### 1.4 Typage relâché : `_diceRollGuard: number | null` (`src/dice-ui.ts`)

**Constat.** `npm run typecheck` échouait sur `src/dice-ui.ts` (erreur
`TS2322: Type 'Timeout' is not assignable to type 'number'`), présente au
dernier commit avant mon intervention (vérifié par `git stash` + relance du
typecheck — donc un vrai défaut préexistant de mon périmètre, pas un artefact
d'un autre agent). Cause : `tsconfig.test.json` (élément A, hors de mon
périmètre) type-checke aussi `src/dice-ui.ts` via le graphe d'imports
transitif des tests, avec `"types": ["node"]` — sous ce lib Node ambiant,
`setTimeout()` résout en `NodeJS.Timeout`, pas en `number` (DOM). Je
documente ce risque au lieu d'imposer un choix sur `tsconfig.test.json` (hors
de mon périmètre exclusif).

**Correctif.** `_diceRollGuard: ReturnType<typeof setTimeout> | null` au lieu
de `number | null` — correct dans les deux environnements (build navigateur
réel via esbuild comme sous ce tsconfig de test), sans dépendre de quel
`lib`/`types` ambiant est actif au moment de la compilation.

### 1.5 Garde-fou division par zéro dans `catalanDie` (`src/dice3d/polyhedra.ts`)

**Constat.** `var s=(radius||1.3)/maxr;` — si `dualVertices(archFn())`
produisait un jour un ensemble dégénéré (tous les sommets à l'origine,
`maxr=0`), la mise à l'échelle produirait `Infinity`/`NaN` propagés à tous
les sommets. **Inatteignable avec les 5 solides d'Archimède codés en dur
utilisés aujourd'hui** (d24/d30/d48/d60/d120, tous des solides non
dégénérés, valeur `maxr` toujours strictement positive et jamais proche de 0
— vérifié par test, voir §3) : ce n'est donc pas un bug observable
aujourd'hui, mais une garantie manquante contre une géométrie future
dégénérée qui produirait un dé invisible plutôt qu'un crash de rendu franc.

**Correctif.** `var s=(radius||1.3)/(maxr||1e-6);` — inerte sur les 5 solides
réels (vérifié : le test `catalanDie` reproduit exactement le rayon
englobant demandé à 10⁻³ près, donc AUCUN changement de silhouette), actif
uniquement dans le cas dégénéré hypothétique.

**Précision explicite (round 2, `C-critique-round1.md` §8, P2)** : parce que
`maxr` ne peut structurellement pas être nul sur les 5 solides réellement
codés en dur dans `polyhedra.ts`, **aucune mutation sur cette ligne précise
(`||1e-6`) ne peut être mise en échec par un test qui construit un de ces 5
solides réels** — ce n'est donc PAS une ligne « couverte par mutation
testing » au sens strict de la règle du brief (§3.2 : « un test qui ne peut
structurellement pas échouer ne vaut rien »), même si le test de non-
régression (`Number.isFinite` sur toutes les coordonnées) documente
honnêtement le comportement attendu du chemin normal. Le §3 ci-dessous ne
compte plus cette ligne dans le total des mutations testées.

## 2. Passé en revue, aucun défaut trouvé (documenté pour éviter une redite)

- **`dieExtractFaces`** : toutes les divisions potentielles par une longueur
  nulle sont déjà gardées (`if(L<1e-6) continue;`, `f.circum=(rmax>1e-4)?
  rmax:0.5`, `f.inradius=(isFinite(rin)&&rin>1e-4)?rin:f.circum*0.5`).
- **`buildNumberedDie`** (ajustement polygonal des petites plaques) : la
  division `dist/ext` est déjà gardée par `if(ext>1e-6)`.
- **`_roundedBody`** (centre de coin par moindres carrés) : le cas de
  matrice singulière (`Math.abs(det)<1e-9`) a déjà un repli explicite
  (projection radiale bornée par `Math.max(1e-3, V.p.length())`).
- **`dualVertices`** : `if(Math.abs(d)<1e-6)d=1e-6;` déjà présent.
- **`_chamferSolid`** : `try/catch` déjà présent autour de `ConvexGeometry`
  (repli sur la géométrie nette si le hull échoue).
- **`any` implicite ou non justifié** : aucun trouvé dans
  `src/dice3d/*.ts` ni `src/dice-ui.ts` (`grep -n ": any\|as any\|<any>"` ne
  remonte rien) — le typage strict du projet (`strict`, `noUnusedLocals`)
  est déjà respecté intégralement dans mon périmètre.
- **Fonctions non exportées mais porteuses de logique** : aucune trouvée —
  toute fonction non triviale de mon périmètre est déjà exportée (convention
  du projet documentée dans `CLAUDE.md`), ce qui explique pourquoi les tests
  du §3 ont pu couvrir directement les fonctions réelles sans réécriture.

## 3. Tests ajoutés et mutation testing

Trois nouveaux fichiers sous `tests/`, zéro dépendance npm ajoutée (voir §5) :

- **`tests/dice3d.color.test.ts`** (23 tests) — `_hexLum`, `_mixHex`,
  `_hexHS`, `_contrastInk`, `_capLum`. Couvre explicitement D-CLAUDE-2
  (contraste par LUMINANCE, jamais par teinte seule) : un test dédié vérifie
  qu'un vert pur saturé (perçu comme « éclatant ») reçoit une encre foncée
  parce que sa luminance réelle dépasse le seuil, et qu'un bleu pur saturé
  reçoit l'inverse — la teinte seule ne doit jamais dicter le résultat.
- **`tests/dice3d.geometry.test.ts`** (22 tests, dont 5 ajoutés en round 2)
  — `dieExtractFaces`, `dieAssignValues` (vérifie noir sur blanc que les
  faces opposées d'un cube/octaèdre somment bien à N+1, comme un vrai dé),
  `_normalizeGeoRadius`, `_roundRadiusFor` (vérifie le plafond à 30 % du plus
  petit rayon inscrit, D-CLAUDE-1), `allPerms`/`evenPerms`/`dedupe`/
  `catalanDie` de `polyhedra.ts`. **Round 2** (réponse au P1 de
  `C-critique-round1.md` §3/§8, mutation #4 du critique non détectée) :
  nouveau describe dédié au paramètre `onSphere` de `catalanDie` — celui qui
  porte EXACTEMENT le comportement verrouillé par D-CLAUDE-1 (« t=1 pour le
  d48, 0.85 pour le d120 »), jusqu'ici jamais exercé avec une valeur non
  triviale. Mesure quantitative directe (écart-type des distances des
  sommets au centre — 0 = silhouette parfaitement ronde) : (a) sans
  `onSphere`, le solide de Catalan brut a bien plusieurs rayons distincts
  (stddev > 0,01, condition nécessaire pour que le paramètre ait un effet
  mesurable) ; (b) `onSphere=true` (config réelle du d48) ramène tous les
  sommets exactement sur la sphère (stddev < 10⁻⁴) ; (c) `onSphere=0.85`
  (config réelle du d120) donne un écart-type strictement ENTRE le solide
  brut et le d48 sphérisé (sphérisation partielle, ni 0 ni le solide brut) ;
  (d) l'effet est monotone et proportionnel à `t` (0 → 0,5 → 0,85 → 1,
  stddev strictement décroissante) ; (e) test de bout en bout sur le vrai
  point d'entrée `dieGeometryFor(48)`/`dieGeometryFor(120)` (pas seulement
  `catalanDie` appelé directement) pour attraper spécifiquement un
  copier-coller qui échangerait les arguments `onSphere` entre les deux cas.
- **`tests/dice3d.dispose.test.ts`** (7 tests) — `_disposeSceneResources`
  (géométrie/matériau disposés, texture non partagée disposée, texture
  `shared` jamais disposée, shadow map disposée, scène vide sans exception)
  et `_cardBgHex` (aucune sonde orpheline en chemin heureux ET en chemin
  d'échec simulé).

**Mutation testing (exigence §3.2 du brief) : 10 mutations, cassées puis
restaurées une à une, chacune confirmée en échec avant restauration** :

| # | Fichier | Mutation | Résultat |
|---|---|---|---|
| 1 | `die.ts` | `_contrastInk` : `lum>0.58` → `lum<0.58` | 6/23 tests couleur échouent |
| 2 | `die.ts` | `_hexLum` : poids R/G intervertis | 3/23 tests couleur échouent |
| 3 | `die.ts` | `dieAssignValues` : `d<bd` → `d>bd` (apparie les faces les plus PROCHES au lieu des plus opposées) | 2/17 tests géométrie échouent |
| 4 | `die.ts` | `_roundRadiusFor` : plafond `0.30` → `0.50` | 1/17 tests géométrie échoue |
| 5 | `polyhedra.ts` | `catalanDie` : facteur d'échelle `maxr` → `maxr*2` | 1/17 tests géométrie échoue |
| 6 | `dice-ui.ts` | `_disposeSceneResources` : `if(o.geometry)` → `if(false && o.geometry)` (désactive le dispose des géométries) | 1/7 tests dispose échoue |
| 7 | `dice-ui.ts` | `_disposeSceneResources` : `!map.userData.shared` retiré (dispose TOUJOURS le `.map`) | 1/7 tests dispose échoue |
| 8 | `die.ts` | `_cardBgHex` : `finally` retiré, retrait remis en chemin heureux seul (= bug d'origine) | 1/7 tests dispose échoue (reproduit exactement le bug corrigé en 1.3) |
| 9 | `polyhedra.ts` | **Round 2**, reproduit EXACTEMENT la mutation #4 du critique (`C-critique-round1.md` §3) : `catalanDie`, `var t=(onSphere===true)?1:onSphere;` → `t=(...)*0.1` | 1/22 tests géométrie échoue (le test d48/t=1 dédié) — **confirmé non détecté avant l'ajout du nouveau describe `onSphere`, détecté après** |
| 10 | `die.ts` | **Round 2** : `dieGeometryFor`, arguments `onSphere` échangés entre les cas `48` et `120` (`catalanDie(archTruncCuboctahedron,1.35,0.85)` / `catalanDie(archTruncIcosidodecahedron,1.35,true)`) — scénario « copier-coller malheureux » cité par le critique | 1/22 tests géométrie échoue (le test de câblage `dieGeometryFor` dédié) |

Chaque mutation a été appliquée par un script Python jetable (diff textuel
exact conservé ci-dessus pour traçabilité), les tests concernés relancés
(`npx vitest run tests/dice3d.<fichier>.test.ts`), l'échec constaté, puis le
fichier restauré depuis une copie de sauvegarde
(`/tmp/.../scratchpad/{die,dice-ui,polyhedra}.ts.orig{,2}`) avant de relancer
`npm test` complet pour confirmer le retour au vert. Aucun test
« ne pouvant structurellement pas échouer » (D17 de l'audit v1) : chacun a
été vu échouer au moins une fois pendant cette session. Le garde-fou
div/0 de `catalanDie` (§1.5) n'est PAS dans cette table : il n'a
délibérément aucune mutation testable en échec sur les 5 solides réels (voir
§1.5, précision round 2) — ne pas le compter comme couvert.

**Résultat final** : `npm test` → **9 fichiers de test, 87 tests, tous
verts** (35 préexistants + 52 ajoutés par cet élément, dont 5 ajoutés en
round 2 pour couvrir `onSphere`).

## 4. Preuve d'absence de régression visuelle (D-CLAUDE-1)

Méthode : capture Playwright/Chromium (`--use-gl=swiftshader`, comme prescrit
par `CLAUDE.md`) du DOM réel après `npm run build`, en pilotant l'app
exactement comme un utilisateur (`window.ScoreTrack.diceUi.openDice()`,
`diceConfig.faces=<type>`, `diceRenderConfig()`) — jamais une géométrie
appelée hors contexte. Pour respecter la règle de mesure D16/D21 du brief
(« tout verdict non déterministe entre deux exécutions est jugé invalide »),
le générateur pseudo-aléatoire de la page a été figé (`Math.random`
remplacé par un mulberry32 à graine fixe injecté via `page.addInitScript`)
avant chargement : les faces du d3/d6 en aperçu et le résultat du lancer
dépendent de `Math.random()`, donc non déterministes autrement — c'est du
hasard de tirage, pas une régression, mais il fallait le neutraliser pour
mesurer plutôt que deviner (leçon D11 du brief).

**Protocole** :
1. `git stash` (retour au dernier commit, avant mes modifications) → build →
   capture des 14 types de dés (`d2` … `d120`), un aperçu multi-dés (3×d6) et
   un résultat de lancer (d20) → **deux exécutions consécutives**
   (`before1`, `before2`).
2. `git stash pop` (mes modifications) → build → mêmes captures, **trois
   exécutions consécutives** (`after1`, `after2`, `after3`).
3. Comparaison **binaire exacte** (`cmp`/sha256) de tous les PNG, pas une
   comparaison perceptuelle approximative.

**Résultats mesurés** :
- Déterminisme confirmé : `before1` ≡ `before2` (octet pour octet) sur les 4
  captures sensibles au hasard (`d3`, `d6`, `multi-d6x3`, `rolled-d20`) ;
  `after1` ≡ `after2` ≡ `after3` de même (3 exécutions identiques
  consécutives, conforme à la règle D16/D21).
- **Avant/après (`before1` vs `after1`) : les 16 captures sont OCTET POUR
  OCTET IDENTIQUES** — les 14 types de dés, l'aperçu multi-dés, et le
  résultat de lancer avec halo. Zéro pixel différent.
- Contrôle complémentaire : après 5 passages sur les 14 types (70
  reconstructions de dés, simulant un joueur qui feuillette longuement avant
  de lancer), `#dice-result` ne contient jamais plus d'1 `<canvas>` que le
  nombre de dés actuellement affichés (mesuré via
  `document.querySelectorAll('#dice-result canvas').length` après le dernier
  rendu) : aucune accumulation de canvases fantômes dans le DOM.

Scripts et captures (non commités, `docs/audit/` ne contient que ce
compte-rendu comme demandé) : `/tmp/claude-0/-home-user-scoretrack/
600391ed-7dfc-5cbd-85c8-2b4a98249abe/scratchpad/{dice_visual.mjs,
leak_check.mjs,check_ext.mjs}` et `.../scratchpad/shots/*.png` — reproductibles
en relançant ces scripts après `npm run build`.

**Round 2 — re-preuve après les changements du §8, méthode affinée.** Le
dépôt étant partagé en direct (§0), une comparaison `avant`/`après` séparée
dans le temps peut capter une dérive **d'un fichier hors de mon périmètre**
(vu en pratique : en recomparant mes captures `after1..3` du round 1 à une
nouvelle capture prise après le round 2, `rolled-d20` différait — pas les 14
dés ni l'aperçu multi-dés. Diagnostic : `index.html`/les polices ont changé
entre-temps du fait d'autres éléments, ce qui déplace légèrement le rendu du
texte « Total : N » à côté du dé, sans toucher au dé lui-même). Pour isoler
strictement l'effet de MES changements round 2 (commentaire dans
`src/dice-ui.ts`, tests, doc — aucune géométrie touchée), comparaison
refaite à index.html CONSTANT : `git stash push -- docs/audit/DECISIONS-C.md
src/dice-ui.ts tests/dice3d.geometry.test.ts` (stash scopé à mes seuls
fichiers, jamais un `git stash` complet qui aurait aussi emporté le travail
en cours d'autres agents sur `index.html`/`e2e/*`) → build → capture
(`round2before`) → `git stash pop` → build → capture (`round2after`).
**Résultat : 16/16 captures identiques octet pour octet**, `rolled-d20`
compris — confirme que le round 2 n'a introduit aucune régression visuelle,
la dérive observée plus haut étant entièrement imputable à un autre élément.

## 5. Dépendances npm

**Aucune ajoutée.** Les tests du §3 utilisent exclusivement `vitest`, `three`
et `jsdom`, déjà présents (élément A). Un test (`_numTex` via un contexte
canvas 2D factice) contourne l'absence du paquet natif `canvas` dans jsdom en
injectant un faux `CanvasRenderingContext2D` minimal (`vi.spyOn(
HTMLCanvasElement.prototype, 'getContext')`) plutôt que d'ajouter cette
dépendance native — plus simple, sans risque de compilation native
supplémentaire, suffisant pour exercer le vrai code de production.

## 6. Vérifications réelles (résultat exact)

Exécutées après le dernier commit de cet élément, sur l'arbre partagé (voir
§0 pour la mise en garde sur les autres agents en parallèle) :

- `npm run typecheck` → erreurs UNIQUEMENT dans `src/animations.ts`,
  `src/game.ts`, `src/i18n.ts` (hors périmètre C, préexistantes au dernier
  commit avant mon travail, vérifié par `git stash`). **Zéro erreur dans
  `src/dice3d/*.ts` et `src/dice-ui.ts`.**
- `npm run lint` → **0 erreur** (566 avertissements `no-var`/`no-explicit-any`,
  tous préexistants et hors périmètre C sauf les avertissements `no-var`
  intrinsèques au style ES5 déjà en vigueur dans `polyhedra.ts`/`die.ts`
  avant mon intervention — je n'ai pas converti `var`→`let/const` sur du code
  que je n'ai pas touché, changement massif et hors mandat qui n'aurait rien
  à voir avec la robustesse/le typage/les tests).
- `npm run test` → **87/87 tests verts** (9 fichiers, dont 3 miens totalisant
  52 tests — reconfirmé après les ajouts du round 2).
- `npm run build` → succès (`dist/app.js`, `dist/sw.js` générés sans erreur).
- Contrôle visuel Playwright/swiftshader : voir §4 (16 captures identiques
  avant/après, 3 exécutions consécutives reproductibles).

## 7. Dette restante (transparence)

- Le typage relâché de `_diceRollGuard` (1.4) est un symptôme d'un choix plus
  large d'élément A (`tsconfig.test.json` avec `"types":["node"]` appliqué
  transitivement à du code navigateur pur) : ma correction locale est
  suffisante et n'a pas besoin d'être révisée, mais si d'autres modules
  hors de mon périmètre ont le même symptôme (ex. `src/i18n.ts:160`, déjà vu
  dans les erreurs de typecheck), c'est à l'agent propriétaire de ce fichier
  de décider s'il applique le même correctif localement ou si element A
  reconsidère `tsconfig.test.json`.
- `_disposeSceneResources` dispose tout objet de la scène sauf les textures
  `shared` — si un futur ajout au moteur de dés introduit un NOUVEAU type de
  texture partagée entre dés vivants (au-delà du cache `_numTexCache`
  existant), il faudra impérativement le marquer `userData.shared=true`,
  sous peine de casser les dés encore affichés au moment où un autre est
  détruit. Documenté en commentaire directement au-dessus de la fonction et
  dans `NumTexUserData`.
- La feuille du lanceur ne dispose ses dés qu'à la reconstruction (ouverture
  suivante ou changement de config), jamais à la fermeture de la modale
  (`closeDice()` ne touche pas `_diceThree`) : ce n'est PAS une fuite qui
  s'accumule (le renderer précédent est toujours disposé avant la
  construction du suivant, jamais après), seulement une libération un peu
  différée par rapport à l'idéal (ressources gardées vivantes tant que la
  modale reste fermée sans être rouverte). Je ne l'ai pas changé : ça
  toucherait le comportement d'ouverture/fermeture de la feuille sans gain de
  robustesse mesurable, et le brief demande de ne corriger que des défauts
  mesurés, pas des optimisations spéculatives (D11 du brief).
- Je n'ai pas ajouté de test end-to-end Playwright dans `tests/` ou `e2e/`
  (l'outillage e2e existe côté élément A mais n'est pas dans mon périmètre) :
  la preuve visuelle du §4 est un script Playwright autonome dans le
  scratchpad, pas un test versionné. Si un futur agent veut la reconduire
  durablement, il devrait vivre sous `e2e/` (hors de mon périmètre
  d'écriture).

## 8. Round 2 — réponse à la critique indépendante (`docs/audit/C-critique-round1.md`)

Verdict round 1 : **AAA : non** — zéro régression visuelle confirmée
indépendamment (clause de disqualification automatique non déclenchée), mais
1 défaut P1 et 2 défauts P2. Traité point par point :

- **P1 (couverture manquante sur `onSphere`, mutation #4 du critique non
  détectée)** — **corrigé.** Nouveau describe dans
  `tests/dice3d.geometry.test.ts` (§3 ci-dessus, détail complet) : mesure
  quantitative de l'effet de sphérisation (écart-type des rayons des
  sommets) sur les deux configurations réellement verrouillées par
  D-CLAUDE-1 (d48 : `onSphere=true`/t=1 ; d120 : `onSphere=0.85`), plus un
  test de monotonicité et un test de bout en bout sur `dieGeometryFor` qui
  attrape spécifiquement un échange des arguments entre les cas 48 et 120.
  **Vérifié en reproduisant EXACTEMENT la mutation #4 du critique**
  (`t=(...)*0.1` dans `catalanDie`) : non détectée avant l'ajout de ces
  tests (confirmé), détectée après (1/22 tests géométrie échoue — table
  mutation #9 au §3). Une seconde mutation, non suggérée par le critique
  mais couvrant le scénario « copier-coller entre d48 et d120 » qu'il cite
  explicitement en §3, est également détectée (mutation #10).
- **P2 (formulation trop affirmative de la fuite mémoire)** — **corrigé.**
  Reformulé `docs/audit/DECISIONS-C.md` §1.1 (nuance ajoutée en tête de
  section, texte original conservé en dessous plutôt que réécrit
  silencieusement) et le commentaire de code correspondant dans
  `src/dice-ui.ts` (au-dessus de `_disposeSceneResources`) : le correctif
  est présenté comme une bonne pratique Three.js standard dont l'effet
  mesuré est dans le bruit sous l'environnement de test prescrit par
  `CLAUDE.md`, et net mais modeste seulement quand `WEBGL_lose_context` est
  indisponible — plus jamais présenté comme une fuite « réelle... pas
  seulement dans l'hypothèse pathologique ». Je n'ai pas repris de mesure
  RSS supplémentaire (le critique a déjà mesuré des deux côtés, avec et sans
  l'extension) : reformuler l'affirmation était l'action demandée, pas
  refaire la mesure.
- **P2 (garde-fou div/0 non mutation-testable sur les cas réels)** —
  **corrigé.** Précision explicite ajoutée en §1.5 : cette ligne n'est pas
  comptée dans le total de mutations testées du §3, avec l'explication
  exacte de pourquoi (impossible de rendre `maxr=0` avec les 5 solides
  d'Archimède réels codés en dur).

Toutes les vérifications du §6 rejouées après ces changements : `npm run
typecheck`/`lint`/`test`/`build` tous verts (voir §6, chiffres mis à jour :
87/87 tests). Aucune modification visuelle introduite par ce round (aucun
fichier de rendu — `cube.ts`, la géométrie de `die.ts`, `polyhedra.ts` en
dehors du garde-fou déjà en place — n'a été touché ; seuls des tests, un
commentaire, et la documentation ont changé).
