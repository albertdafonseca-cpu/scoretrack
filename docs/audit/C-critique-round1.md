# C-critique-round1 — Audit qualité AAA, élément C (moteur de dés 3D)

Agent CRITIQUE indépendant, élément C. Commit constructeur revu : `e17db3e`
(parent : `7b68c4d`). Toutes les vérifications de ce document ont été
reproduites **par moi-même**, dans deux `git worktree` détachés isolés
(`git worktree add --detach <dir> <sha>`), jamais dans le dépôt principal
partagé, puis supprimés (`git worktree remove --force`) une fois le travail
terminé. Aucune modification n'a été apportée à un fichier du dépôt partagé
autre que ce compte-rendu.

## Verdict

# **AAA : NON**

Zéro régression visuelle détectée (mesuré, voir §1 — la clause de
disqualification automatique du mandat ne s'applique donc pas), mais un
défaut **P1** reproductible sur la couverture de test d'un comportement
géométrique verrouillé (D-CLAUDE-1), et deux défauts **P2** sur la rigueur
de la preuve de fuite mémoire et sur une mutation non testable. Voir §4 pour
le détail actionnable.

---

## 1. Protocole de capture visuelle avant/après — reproduit indépendamment

**Méthode exacte (reproductible)** :
1. `git worktree add --detach /tmp/audit-C/before 7b68c4d` (parent exact de
   `e17db3e`, confirmé par `git rev-parse e17db3e~1`), `npm run build`.
2. `git worktree add --detach /tmp/audit-C/wt e17db3e`, `npm run build`.
3. Script Playwright indépendant (`capture.mjs`, écrit par moi, jamais lu ni
   copié depuis le constructeur) : lance Chromium
   `--use-gl=swiftshader --enable-webgl --ignore-gpu-blocklist`, injecte un
   RNG figé (mulberry32, graine `424242`) via `page.addInitScript` **avant**
   tout chargement de script de page, force `#game-screen{display:flex}`
   (nécessaire pour atteindre le lanceur sans passer par tout le flux de
   création de joueurs — n'affecte aucune géométrie de dé), puis pilote
   l'app exactement comme un utilisateur via `window.ScoreTrack.diceUi`
   (`openDice`, `diceConfig.faces/count`, `diceRenderConfig`, `rollDice`,
   `closeDice`) — jamais une fonction de géométrie appelée hors contexte.
4. Capture des 14 types de dés (d2…d120) en aperçu, + aperçu multi-dés
   (3×d6), + un résultat de lancer animé (d20, attente 2,6 s pour la fin de
   l'animation) = 16 captures par exécution.
5. **5 exécutions complètes** : `before1`, `before2` (build AVANT),
   `after1`, `after2`, `after3` (build APRÈS) = 80 fichiers PNG.
6. Comparaison **sha256** fichier par fichier (script bash, alignement par
   nom de fichier explicite, pas par tri positionnel fragile).

**Résultats mesurés** :
- Déterminisme confirmé : `before1` ≡ `before2` et `after1` ≡ `after2` ≡
  `after3`, octet pour octet, sur les 16 captures (conforme à la règle
  D16/D21 du brief : 3 exécutions identiques consécutives).
- **`before1` vs `after1` : 16/16 fichiers identiques, sha256 égaux, aucune
  ligne `DIFF`.** Vérifié une deuxième fois par comparaison croisée
  explicite (`before1`/`before2` vs `after1`/`after2`/`after3`, 5 hachages
  par capture, tous égaux) pour exclure un bug d'alignement du script de
  comparaison.
- Inspection visuelle manuelle de `d4`, `d48`, `d120` (cas géométriquement
  les plus délicats, solides de Catalan sphérisés) : rendu conforme à
  `CLAUDE.md` (arrondi résine, silhouette ronde, pas de « boule »).

**Conclusion §1 : la revendication du constructeur (« 16 captures identiques
octet pour octet ») est confirmée de façon totalement indépendante.** La
clause de disqualification automatique du mandat (toute différence visuelle
réelle) ne s'applique pas.

Scripts et captures conservés dans mon scratchpad (non commités) :
`capture.mjs`, `shots/{before,after}{1,2,3}_*.png` — reproductibles par
n'importe qui en relançant le protocole ci-dessus.

## 2. Fuite mémoire GPU — mesurée indépendamment, résultat nuancé (P2)

**Protocole** : `leak_check.mjs`, écrit indépendamment. Ouvre le lanceur,
puis exécute 64 cycles reconstruisant à chaque fois **9 dés** (le maximum de
l'app) en alternant les types les plus à risque de fuite d'après le propre
diagnostic du constructeur (§1.2 de `DECISIONS-C.md` : d6/d3/pièce, textures
de points jamais mises en cache) et un solide lourd (d48/d120). Sous
`--use-gl=swiftshader`, le rendu est **logiciel** : la mémoire "GPU" est de
la mémoire process ordinaire, mesurable via `VmRSS` (`/proc/<pid>/status`,
sommée sur tout l'arbre de process Chromium — browser + GPU + renderer),
contrairement à un vrai GPU dédié. Échantillonnage systématique au même
point du cycle de types (toujours juste après un `d6`) pour ne pas confondre
« type de dé plus lourd » et « croissance réelle ». `window.gc()` forcé
avant chaque mesure (`--js-flags=--expose-gc`).

**Résultat sous l'environnement prescrit par `CLAUDE.md`
(`--use-gl=swiftshader`, extension `WEBGL_lose_context` disponible — vérifié
présente dans cet environnement)** :

| Cycle | RSS AVANT (Ko) | RSS APRÈS (Ko) |
|---|---|---|
| 0 | 633 208 | 632 528 |
| 8 | 752 104 | 749 888 |
| 16 | 790 592 | 788 732 |
| 24 | 822 608 | 815 956 |
| 32 | 831 508 | 821 284 |
| 40 | 834 768 | 823 340 |
| 48 | 838 996 | 826 208 |
| 56 | 846 940 | 827 492 |
| Δ sur 64 cycles | **+226 020 Ko** | **+210 176 Ko** |

Les deux courbes sont quasi identiques (plateau ~830-850 Mo dans les deux
cas, écart final ~7 %, dans le bruit de mesure d'un process Chromium
complet). **Dans l'environnement de test que `CLAUDE.md` prescrit
explicitement (`--use-gl=swiftshader`, extension disponible),
`_disposeSceneResources` n'apporte pas de réduction mesurable de la fuite.**

**Second test, ciblé sur le mécanisme exact décrit par le constructeur** :
j'ai neutralisé `WEBGL_lose_context` (`getExtension` patché pour renvoyer
`null` pour ce nom précis, via `page.addInitScript`, vérifié effectif) pour
reproduire le scénario que `DECISIONS-C.md` §1.1 identifie comme la vraie
cause de fuite (« un no-op silencieux si l'extension est indisponible »).
Résultat :

| Cycle | RSS AVANT sans ext. (Ko) | RSS APRÈS sans ext. (Ko) |
|---|---|---|
| 0 | 637 084 | 638 524 |
| 8 | 845 772 | 837 392 |
| 16 | 889 200 | 879 504 |
| 24 | 925 680 | 911 124 |
| 32 | 935 588 | 914 940 |
| 40 | 939 200 | 916 204 |
| 48 | 943 964 | 918 152 |
| 56 | 949 504 | 927 128 |
| Δ sur 64 cycles | **+268 284 Ko** | **+247 996 Ko** |

Ici l'effet est présent et dans le sens attendu (plateau ~950 Mo avant vs
~927 Mo après, soit ~2 % de mieux en absolu sur la RSS totale, ~8 % de mieux
sur le delta de croissance), mais reste modeste et n'a été mesuré **qu'une
seule fois par condition** (pas de triple exécution, contrairement à la
règle D16/D21 du brief pour les mesures non déterministes) faute de temps —
je ne peux donc pas exclure que l'écart observé soit en partie du bruit
inter-exécution d'un process Chromium complet.

**Conclusion §2 (P2, pas P0/P1)** : le correctif est une bonne pratique
Three.js standard (dispose explicite des géométries/matériaux/textures) et
ne fait de mal nulle part — mais la formulation de `DECISIONS-C.md` (« fuite
mémoire GPU **réelle**... pas seulement dans l'hypothèse pathologique ») est
**plus affirmative que ce que ma mesure indépendante démontre** dans
l'environnement de test prescrit par le projet, où l'extension est
disponible et où l'écart avant/après est dans le bruit. L'effet n'est net
que dans le scénario dégradé (extension absente) que le constructeur
lui-même décrit comme la vraie cause — et même là, modeste et mesuré une
seule fois. Recommandation : soit mesurer avec un instrument plus direct
(ex. compter les objets réellement enregistrés dans les caches internes du
renderer avant/après dispose, plutôt que la RSS globale d'un process
Chromium bruité par bien d'autres facteurs), soit reformuler la revendication
avec la nuance ci-dessus.

Confirmé en revanche, indépendamment : **aucune accumulation de canvases
fantômes** dans `#dice-result` (`document.querySelectorAll('#dice-result
canvas').length` reste égal au nombre de dés affichés à chaque mesure, dans
les deux versions) — ce point précis de la revendication est exact.

## 3. Mutation testing indépendant (4 fonctions, mutations différentes de celles du constructeur)

Chaque mutation appliquée par `sed`/edit direct dans le worktree isolé,
tests relancés, échec constaté, fichier restauré depuis une copie de
sauvegarde, `git diff --stat` revérifié vide après restauration, puis
`npm test` complet revérifié vert (79/79).

| # | Fonction | Mutation (différente de celle du constructeur) | Résultat |
|---|---|---|---|
| 1 | `_hexLum` | poids **G/B** intervertis (le constructeur avait interverti R/G) | **4/23 tests couleur échouent**, dont le test D-CLAUDE-2 dédié (vert/bleu) |
| 2 | `_contrastInk` | valeur du seuil `0.58` → `0.3` (le constructeur avait inversé le sens `>`/`<`, pas changé la valeur) | **1/23 test échoue** (le test de bascule au seuil exact) |
| 3 | `_disposeSceneResources` | suppression de la ligne `shadow.map.dispose()` (le constructeur avait ciblé le geometry-dispose et le shared-texture-dispose, jamais la shadow map) | **1/7 test échoue** (test dédié à la shadow map) |
| 4 | `catalanDie` | facteur de sphérisation `t=t*0.1` dans la branche `onSphere` (jamais touchée par les mutations du constructeur) | **0/79 test échoue — AUCUNE détection** |

Restauration et `git diff --stat` vide confirmés après chacune des 4
mutations (avant de passer à la suivante).

**La mutation #4 est le résultat le plus important de cet audit.** Elle
révèle que la branche `onSphere` de `catalanDie` — le paramètre `t` qui
contrôle EXACTEMENT le comportement que `CLAUDE.md` documente comme
verrouillé et validé par l'utilisateur (« d48 et d120 : sommets ramenés vers
la sphère englobante... t = 1 pour le d48, 0.85 pour le d120 ») — n'est
exercée par **aucun des 79 tests** du projet. Vérifié : les deux seuls
appels à `catalanDie` dans `tests/dice3d.geometry.test.ts` (§118-135) passent
`archRhombicuboctahedron`/`archIcosidodecahedron` avec **2 arguments
seulement** (pas de 3ᵉ argument `onSphere`), donc utilisent uniquement les
chemins d24/d30 (qui n'ont pas de sphérisation). Une régression future sur
`t` — par exemple un copier-coller malheureux entre d48 et d120, ou une
constante décalée lors d'un futur refactor — casserait silencieusement le
rendu du d48 ou du d120 sans qu'aucun test ne l'attrape, alors même que
`DECISIONS-C.md` §3 revendique une couverture des « solides d'Archimède ».
C'est un défaut **P1** : reproductible, actionnable (ajouter un test qui
construit `catalanDie(archFn, R, true)` et `catalanDie(archFn, R, 0.85)` et
vérifie que les rayons des sommets convergent proportionnellement à `t` vers
`R`), et touche directement une décision verrouillée (D-CLAUDE-1).

## 4. D-CLAUDE-2 (contraste par luminance, pas par teinte) — couverture jugée correcte

Lu `tests/dice3d.color.test.ts` intégralement. Le test dédié est bien conçu
pour la question posée par le mandat : il compare un **vert pur saturé**
(teinte 120°, perçu comme « éclatant », luminance réelle 0,7152 — haute) et
un **bleu pur saturé** (teinte 240°, luminance réelle 0,0722 — basse), deux
couleurs à teintes opposées sur le cercle chromatique mais dont le
classement par luminance est contre-intuitif si on se fie à la « vivacité »
perçue. `_contrastInk(vert)` → encre foncée, `_contrastInk(bleu)` → encre
claire : un code qui se baserait par erreur sur la saturation/teinte plutôt
que sur la luminance réelle inverserait ce résultat. Confirmé par ma propre
mutation #1 (poids G/B intervertis) : ce test échoue précisément sur ce cas,
preuve qu'il détecte bien une vraie régression de la convention. **Aucun
défaut trouvé sur ce point.**

## 5. Respect du périmètre — conforme

`git show --stat e17db3e` (reproduit indépendamment) : seuls
`src/dice-ui.ts`, `src/dice3d/{die,polyhedra,types}.ts`,
`tests/dice3d.{color,geometry,dispose}.test.ts`, `docs/audit/DECISIONS-C.md`
et `docs/audit/BRIEF.md` sont touchés. `git diff 7b68c4d e17db3e --
docs/audit/BRIEF.md` confirme un **ajout pur** (D14-D17 ajoutés en fin de
§7, aucune ligne préexistante modifiée ou supprimée). Conforme au mandat.

## 6. Vérifications d'outillage — reproduites, conformes aux revendications

- `npm run typecheck` (worktree isolé sur `e17db3e`) : erreurs uniquement
  dans `src/animations.ts`, `src/game.ts`, `src/i18n.ts` (hors périmètre C,
  confirmé par `grep -E "^src/dice"` sur la sortie → aucune ligne). **0
  erreur dans le périmètre C.**
- `npm run build` : succès, `dist/app.js` + `dist/sw.js` générés.
- `npm run lint` : **0 erreur, 566 avertissements** — confirmé identique à
  la revendication de `DECISIONS-C.md` §6 (une première exécution avait
  montré 60 erreurs, entièrement dues à mes propres scripts de test
  temporaires laissés dans le worktree — supprimés puis rerun, résultat
  propre confirmé, aucune fausse alerte imputable au code du constructeur).
- `npm test` : **79/79 tests verts**, 8 fichiers.

## 7. Comparaison à l'aveugle / niveau professionnel attendu (§6 du mandat)

Sur la gestion mémoire WebGL et la testabilité, ce livrable est **en
dessous** du niveau attendu d'un moteur 3D grand public professionnel sur
deux points précis : (a) la preuve de correction d'une fuite mémoire
annoncée comme « réelle » ne résiste pas complètement à une mesure
indépendante dans l'environnement de test prescrit par le projet lui-même
(§2) — une équipe QA sérieuse aurait qualifié la sévérité avant de
l'annoncer comme telle ; (b) le paramètre géométrique le plus explicitement
« réglé à la main puis verrouillé » de tout le module (`t` de sphérisation
du d48/d120, cf. `CLAUDE.md`) n'a aucun test de régression (§3) — c'est
précisément le genre de constante qu'un processus de QA mature protège en
priorité, puisque sa dérive ne casse rien au typecheck/lint/build et ne se
verrait qu'à l'œil sur un rendu que personne ne recompare systématiquement
en CI. Sur le reste (typage, garde-fou div/0, fuite DOM, absence de
régression visuelle, largeur de la suite de tests), le niveau est correct
et conforme au mandat.

## 8. Défauts à corriger avant re-passe

- **P1** — Ajouter un test exerçant `catalanDie` avec un `onSphere` non
  trivial (`true` ET une valeur fractionnaire comme `0.85`), vérifiant
  quantitativement l'effet de sphérisation (ex. dispersion des rayons des
  sommets avant/après, ou convergence proportionnelle à `t` vers le rayon
  cible) — sans quoi une régression sur le comportement d48/d120
  explicitement verrouillé par D-CLAUDE-1 ne serait détectée par aucun test
  automatisé (démontré §3, mutation #4).
- **P2** — Revoir la formulation de la sévérité de la fuite mémoire GPU dans
  `DECISIONS-C.md` §1.1 à la lumière de la mesure indépendante du §2 :
  l'effet est réel mais net seulement quand `WEBGL_lose_context` est
  indisponible, et modeste même dans ce cas (mesuré une seule fois, pas
  triple comme l'exige la règle de mesure du brief). Soit mesurer plus
  directement (compteurs internes du renderer plutôt que RSS globale), soit
  nuancer l'affirmation.
- **P2** — Le garde-fou division par zéro de `catalanDie` (§1.5 de
  `DECISIONS-C.md`) est, par la propre admission du constructeur, inatteignable
  et donc non testable en échec sur les 5 solides réels : au sens strict de
  la règle du brief (« un test qui ne peut structurellement pas échouer ne
  vaut rien »), cette correction précise n'a pas de mutation-test valide.
  Sévérité mineure (le code défensif ne fait de mal nulle part et c'est
  honnêtement documenté), mais à noter pour ne pas compter cette ligne comme
  « couverte par mutation testing » dans un futur bilan.

## Prochaine étape

Correction du P1 (§8) attendue avant nouvelle passe. Les P2 peuvent être
traités dans la même passe ou documentés comme dette assumée si le
constructeur préfère nuancer plutôt que re-mesurer.
