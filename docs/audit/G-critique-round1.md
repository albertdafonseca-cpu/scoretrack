# G-critique-round1 — Vérification indépendante de l'élément G (round 3, post-clôture)

Agent critique indépendant, isolé dans un `git worktree --detach` sur
`a7dd250` (`/tmp/g-audit-worktree`, supprimé en fin de mission —
`git worktree remove --force` confirmé, `git worktree list` ne montre plus
que le dépôt principal). Aucun fichier du dépôt partagé n'a été modifié en
dehors de ce rapport. Toutes les commandes ci-dessous ont été exécutées
réellement dans ce worktree ; les sorties sont copiées telles quelles (pas
paraphrasées), sauf mention explicite de troncature.

## Verdict

**AAA : oui.**

Aucun défaut P0/P1 reproductible trouvé après vérification indépendante et
adversariale de l'inventaire complet des 65 cas, de la mesure CSP réelle
(y compris une contre-preuve et un scénario que le constructeur n'avait pas
testé — le geste de fermeture par glissement tactile), de 4 mutations
supplémentaires (4 catégories distinctes de câblage, aucune ne recoupant les
3 déjà testées par le constructeur), et de la non-régression accessibilité
avec de la vraie navigation clavier. 3 défauts P2 documentaires sont listés
en fin de rapport (n'affectent ni la sécurité, ni le comportement, ni le
périmètre — ils ne bloquent pas l'AAA, conformément au précédent déjà posé
pour l'élément C round 2, `BRIEF.md` D25).

---

## 1. Absence réelle de tout `onclick=` (mesure indépendante)

```
$ grep -c 'onclick=' index.html
0
```

Recherche des `onclick` construits dynamiquement en JS (`element.onclick = fn`,
qui ne sont PAS des attributs HTML et ne nécessitent donc jamais
`'unsafe-inline'` dans `script-src` — l'attribut inline est interprété par le
parseur HTML au moment où il rencontre le balisage, une affectation de
propriété DOM par un script déjà chargé et autorisé (`script-src 'self'`)
n'est ni une exécution de code inline ni un `<script>` inline) :

```
$ grep -rn '\.onclick\s*=' src/*.ts | wc -l
9
$ grep -c '\.onclick\s*=' src/game.ts src/dice-ui.ts src/sw.ts
src/game.ts:6
src/dice-ui.ts:2
src/sw.ts:1
```

**Écart avec la documentation du constructeur** : `DECISIONS-G.md` §4 affirme
« 8 occurrences restantes ... (game.ts ×6, dice-ui.ts ×2, sw.ts ×1) ». Or
6+2+1 = **9**, pas 8, confirmé par une mesure indépendante à deux méthodes de
comptage différentes qui s'accordent. Le raisonnement CSP par occurrence reste
correct (voir §2 ci-dessous, mesuré, pas supposé), mais le décompte lui-même
est faux. Voir P2-2.

## 2. Mesure CSP réelle et indépendante — pas une déduction théorique

Test indépendant écrit et exécuté dans le worktree (`dist/` servi en HTTP
avec les **en-têtes réels lus depuis `vercel.json`**, écouteur
`securitypolicyviolation` posé avant tout script) :

```
Running 3 tests using 1 worker

  ✓  1 […] CRITIQUE INDEPENDANT — clic sur le fond ferme, clic sur la feuille ne ferme PAS (1.7s)
  ✓  2 […] CRITIQUE INDEPENDANT — CSP: .onclick= dynamique (game.ts applyPreset) ne viole pas script-src sans unsafe-inline (1.0s)
  ✓  3 […] CRITIQUE INDEPENDANT — contre-preuve: unsafe-inline réintroduit => une vraie violation eût existé, le test CSP existant le détecterait (5ms)

  3 passed (3.8s)
```

- **Test 2** clique réellement sur `.preset-card` (câblé par `game.ts:296`,
  `c.onclick=()=>applyPreset(idx)`, une affectation dynamique) **et** sur
  `#recap-close-btn` (`game.ts:1802`, même mécanisme), avec la CSP resserrée
  (`script-src 'self'`, sans `'unsafe-inline'`) réellement appliquée par le
  serveur de test. **Zéro violation `securitypolicyviolation` capturée.**
  Ceci confirme, par la mesure et non par la théorie seule, l'affirmation du
  constructeur (`DECISIONS-G.md` §3/§4) : une affectation `.onclick = fn`
  faite par `dist/app.js` (script externe déjà autorisé) n'exige à aucun
  moment `'unsafe-inline'`.
- **Test 3** est une contre-preuve logique sur le garde-fou du test committé
  `e2e/csp-script-src.spec.ts` : en réintroduisant `'unsafe-inline'` dans la
  valeur de `Content-Security-Policy` lue depuis `vercel.json`, les mêmes
  assertions que celles en tête de ce test (`expect(...).not.toContain
  ('unsafe-inline')`) échouent bien — le test existant ne pourrait donc pas
  passer silencieusement sur une CSP relâchée.

### Reproduction du parcours CSP complet du constructeur (e2e/csp-script-src.spec.ts)

```
✓ CSP resserrée (script-src sans unsafe-inline) : parcours complet sans aucune violation (5.2s)
```
Confirmé sur 3 exécutions consécutives avec `--workers=1` (voir §6).

### Scénario NON couvert par le constructeur, testé indépendamment ici : le geste de glissement tactile

Ni `e2e/onclick-wiring.spec.ts` ni `e2e/csp-script-src.spec.ts` ne
déclenchent le geste de fermeture par glissement de la feuille du lanceur de
dés (seuils 120px/0,3px·ms, `CLAUDE.md`), pourtant explicitement dans le
périmètre demandé pour cette vérification (item 4 de la mission). J'ai
dispatché un vrai geste tactile via CDP (`Input.dispatchTouchEvent`,
`touchStart`/`touchMove` ×10/`touchEnd`, plus de 120px de déplacement vers le
bas) contre `dist/` servi avec la CSP resserrée réelle :

```
✓ INDEPENDANT — geste de glissement tactile (fermeture feuille dés) : 0 violation CSP avec script-src sans unsafe-inline (2.8s)
```

La feuille se ferme bien (`#dice-overlay` reprend la classe `hidden`) et
**zéro violation CSP** n'est déclenchée. Le code du geste
(`src/dice-ui.ts`, IIFE `initDiceDrag`) utilise déjà `addEventListener` pour
`touchstart`/`touchmove`/`touchend`/`touchcancel` — jamais un `onclick` ni un
`<script>` inline — donc ce résultat était attendu, mais **aucun test
automatisé permanent ne le couvre** : voir P2-3.

## 3. Reproduction indépendante de l'inventaire des 65 cas

Extraction indépendante des 65 lignes `onclick=` du HTML AVANT le commit
(`git show a7dd250^:index.html | grep -n 'onclick='`, 65 lignes) puis
comparaison ligne par ligne avec `wireHandlers()` dans `src/main.ts` (après
le commit). **Les 65 cas correspondent exactement, un par un, sans aucun
argument inversé ni cas oublié** :

- Les 6 chips `data-oval` (`clearPresetSelection();selectObjectifPreset(N)`)
  → boucle `forEach` lisant `chip.dataset.oval`, valeur transmise fidèlement
  (vérifié aussi par mutation, §5).
- Les 3 chips objectif : `obj-win`→`selectObjectif('win')`,
  `obj-elim`→`selectObjectif('elim')` (**pas** `'win'`, vérifié explicitement
  car signalé comme piège par la mission), `obj-none`→`selectObjectif('none')`
  — aucun argument inversé.
- Cas 3 (évènement réel) : `saveAsDefault(event)`/`restoreSavedDefaults(event)`
  /`clearSavedDefaults(event)` → `(e) => game.xxx(e)`, le vrai `MouseEvent` de
  clic est transmis (pas un évènement synthétique vide).
- Cas 5 (condition sur la cible) : `if(event.target===this)closeDice()` →
  `(e) => { if (e.target === e.currentTarget) diceUi.closeDice(); }` — `this`
  dans un attribut `onclick` inline vaut l'élément porteur, soit
  `e.currentTarget` dans un listener `addEventListener` : équivalence exacte,
  confirmée par un test indépendant (voir §4).
- Cas 6 (manipulation DOM inline) : `bar-reset-btn`/`btn-back-reset` →
  `byId('reset-modal').classList.add/remove('hidden')`, reproduit à
  l'identique.
- Les 42 appels simples et 8 arguments littéraux : tous vérifiés un par un
  contre `wireHandlers()`, aucune divergence.

**Total confirmé : 42+8+3+3+1+2+6 = 65.**

## 4. Test indépendant du cas 5 (condition sur la cible du clic)

```
✓ INDEPENDANT — clic sur le fond ferme, clic sur la feuille ne ferme PAS (1.7s)
```
Un clic sur `.dice-sheet` (position (10,10), à l'intérieur de la feuille) ne
ferme PAS le lanceur ; un clic sur `#dice-overlay` en dehors de la feuille
(position (2,2)) le ferme. Comportement confirmé identique à l'ancien
`onclick="if(event.target===this)closeDice()"`.

## 5. Mutation testing indépendant — 4 mutations, 4 catégories non recoupées

Le constructeur avait déjà mutation-testé : cas 1 (`dice-close-btn`), cas 3
(`btn-restoredefault`), cas 4 (`obj-elim`). J'ai testé les 4 catégories
restantes explicitement demandées par la mission : chips `data-oval` (cas 7),
condition sur la cible (cas 5), manipulation DOM inline (cas 6), et un appel
simple (cas 1) différent de celui déjà couvert.

Pour chacune : `npm run build` avant de rejouer le test ciblé, puis
restauration et `git diff --stat src/main.ts index.html vercel.json` vide
avant de continuer (confirmé 4/4 fois).

**Mutation 1 — cas 7 (`data-oval`)** : `game.selectObjectifPreset(val)` →
`game.selectObjectifPreset(0)` (valeur figée, ignore le `data-oval` cliqué).
```
✘ chips objectif […] : sélection mutuelle, go-btn réagit
  Locator: locator('#objectif-presets .points-chip[data-oval="50"]')
  Expected pattern: /\bon\b/
  Received string:  "points-chip"
```
Échec confirmé → restauré → re-testé vert → `git diff` vide.

**Mutation 2 — cas 5 (condition sur la cible)** : suppression de la
condition (`if (e.target === e.currentTarget)`), fermeture inconditionnelle.
```
✘ lanceur de dés › ouverture, config, lancer, choix du joueur, retour, fermeture
  // Cas 5 : clic sur le fond flouté ferme, clic à l'intérieur ne ferme pas.
  await page.locator('.dice-sheet').click();
  Expected pattern: not /\bhidden\b/
  Received string: "hidden"
```
Échec confirmé (un clic à l'intérieur de la feuille la ferme désormais, à
tort) → restauré → re-testé vert → `git diff` vide.

**Mutation 3 — cas 6 (manipulation DOM inline)** : `btn-back-reset` :
`classList.add('hidden')` → `classList.remove('hidden')`.
```
✘ bouton Reset : ouverture, retour au jeu, nouvelle partie, retour au menu
  Locator: locator('#reset-modal')
  Expected pattern: /\bhidden\b/
  Received string:  "modal-overlay"
```
Échec confirmé → restauré → re-testé vert → `git diff` vide.

**Mutation 4 — cas 1 (appel simple, non testé par le constructeur)** :
`btn-shuffle` : `game.shufflePlayers()` → `game.saveProfiles()`.
```
✘ mélanger / mémoriser / vider les cases / tout effacer / retour
  Locator:  locator('.name-input').first()
  Expected: "Bob"
  Received: "Alice"
```
Échec confirmé (les champs ne sont plus mélangés) → restauré → re-testé
vert → `git diff` vide.

**Bilan : 4/4 mutations détectées par la suite e2e existante, 4/4
restaurations propres confirmées.** Combiné aux 3 mutations du constructeur,
7 catégories de câblage sur 7 sont désormais couvertes par une preuve de
mutation testing réelle (aucun test qui « ne peut structurellement pas
échouer », conformément à D17/BRIEF.md §3.2).

## 6. Reproductibilité (BRIEF.md §3.5 — 3 exécutions identiques)

Suite e2e complète (27 tests), 3 exécutions consécutives, `--workers=1`
(nécessaire : voir note ci-dessous) :

```
=== RUN 1 === … 27 passed (43.0s)
=== RUN 2 === … 27 passed (43.0s)
=== RUN 3 === … 27 passed (42.5s)
```

**Note indépendante, hors périmètre de l'élément G** : en parallélisme par
défaut (`fullyParallel: true`, 2 workers sur cette machine), le test
préexistant (élément D) `contraste chip off/on du thème mono-light` a
timeout une fois sur une exécution à 2 workers, puis est repassé vert
isolément et lors des 3 exécutions à `--workers=1`. Cause probable :
accumulation de contextes WebGL simultanés, comportement déjà documenté dans
`CLAUDE.md` (« au-delà d'une quinzaine de contextes WebGL simultanés,
Chromium blanchit les canvases »). Ce test n'appartient pas au périmètre de
l'élément G (`e2e/accessibility-basics.spec.ts`, élément D) et n'a pas été
modifié par ce chantier — signalé pour information, non retenu comme défaut
de l'élément G lui-même.

## 7. `npm run check` et suites complètes (mesure indépendante)

```
$ npm run typecheck   → exit 0 (3 programmes tsc)
$ npm run test        → Test Files 9 passed (9) / Tests 87 passed (87)
$ npm run build       → dist/sw.js 1.8kb, dist/app.js 1.6mb (vert)
$ npm run lint        → 573 problems sur worktree AVEC mes fichiers de test
                         temporaires (6 erreurs venant de MES fichiers, pas
                         du commit audité) ; après suppression de mes
                         fichiers : 565 problems (0 errors, 565 warnings) —
                         correspond exactement à la revendication du
                         constructeur.
$ npx eslint src/main.ts → aucune sortie (0 avertissement, 0 erreur, confirmé)
```

## 8. `id` ajoutés — collision et exhaustivité (mesure indépendante)

```
$ diff <(git show a7dd250^:index.html | grep -oE 'id="[^"]*"' | sort -u) \
       <(git show a7dd250:index.html   | grep -oE 'id="[^"]*"' | sort -u)
4a5
> id="bar-recap-btn"
5a7
> id="bar-reset-btn"
6a9
> id="bar-rotate-btn"
7a11
> id="bar-theme-btn"
161a166
> id="row-single-winner"
```

**5 nouveaux `id`, pas 4.** `bar-reset-btn` est un vrai nouvel `id` (absent
avant le commit, présent après, réellement câblé en `src/main.ts:194`) que
la documentation omet du décompte présenté en titre : `DECISIONS-G.md` §2
l'évoque bien dans le corps du texte (« le 4e, Reset, a reçu
`bar-reset-btn` ») mais sous un intitulé « 4 éléments » qui, lui, ne compte
pas juste (1 `row-single-winner` + 4 boutons `.bar-btn` = 5, pas 4), et
`BRIEF.md` D27 reprend la liste tronquée à 4 sans corriger le total. Ceci a
même été reproduit tel quel dans l'énoncé de cette mission de critique (item
5 ne cite que 4 id). Voir P2-1.

Aucune collision constatée : chaque `id` apparaît exactement une fois dans
`index.html`, référencé exactement une fois dans `src/main.ts`, sans aucun
sélecteur CSS ni autre usage JS qui s'y accrocherait :

```
$ for id in row-single-winner bar-rotate-btn bar-recap-btn bar-theme-btn bar-reset-btn; do
    grep -n "\"$id\"" index.html src/*.ts
  done
# → une ligne HTML + une ligne main.ts par id, rien d'autre, aucun doublon.
```

## 9. Non-régression accessibilité (élément D) — vraie navigation clavier

Au-delà du statut vert des 9 tests `accessibility-basics.spec.ts` (revérifié,
voir §6), 3 vérifications indépendantes ont été écrites, pilotant le clavier
réel (`page.keyboard.press`), sans dépendre de la logique interne du test du
constructeur :

```
✓ INDEPENDANT — Echap ferme #score-modal via vraie navigation clavier
✓ INDEPENDANT — piège de focus reel dans #dice-overlay (Tab répété reste dans la feuille, 25 Tab consécutifs vérifiés)
✓ INDEPENDANT — anneau de focus réellement rendu (outline non "none"/0px) sur go-btn après Tab clavier
```

Les 3 passent. Le retrait des `onclick` n'a affecté ni les rôles ARIA, ni
les pièges de focus (`initDialogA11y`, `src/animations.ts`, non modifié), ni
la CSS de focus visible.

## 10. Périmètre (mesure indépendante)

```
$ git show --stat a7dd250
 docs/audit/BRIEF.md        |  30 +++
 docs/audit/DECISIONS-G.md  | 377 +++++++++++++++++++++++++++
 e2e/csp-script-src.spec.ts | 146 +++++++++++
 e2e/onclick-wiring.spec.ts | 634 +++++++++++++++++++++++++++++++++++++++++++++
 index.html                 | 130 +++++-----
 src/main.ts                | 149 ++++++++++-
 vercel.json                |   2 +-
```

Exactement les 7 fichiers autorisés par le périmètre de la mission (index.html,
src/main.ts, vercel.json, DECISIONS-G.md, BRIEF.md, + 2 nouveaux fichiers de
test). Aucun fichier hors périmètre touché (`game.ts`, `dice-ui.ts`,
`animations.ts`, `i18n*`, `sw*.ts`, `recap-pdf.ts`, `dice3d/*`, `build.mjs`,
`.gitignore`, `README.md`, `package.json`, tests existants : tous absents du
diff, confirmé).

`vercel.json` : diff d'une seule ligne, exactement celle attendue :
```
-          "value": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; …"
+          "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; …"
```
`style-src 'unsafe-inline'` intact, conforme au périmètre annoncé.

## 11. Comparaison à l'aveugle

Une application grand public professionnelle moderne (compteur de score /
lanceur de dés) n'utilise normalement ni attribut `onclick` inline, ni CSP
`script-src 'unsafe-inline'`. ScoreTrack atteint désormais : 0 `onclick`
inline (mesuré), câblage `addEventListener` explicite et nommé (pas de
dispatcher générique fourre-tout, ce qui est même plus lisible/maintenable
qu'un simple `data-action` générique), CSP `script-src 'self'` sans
`'unsafe-inline'` (mesurée en conditions réelles, pas seulement écrite),
couverture de régression par mutation testing réelle sur les 7 catégories de
câblage. Ce niveau est au moins à égalité, et sur l'angle « preuve par
mutation testing engagée dans le dépôt » (test CSP committé de façon
permanente, pas une vérification jetable), probablement au-dessus de la
pratique courante du marché qui se contente généralement d'écrire la CSP
sans la vérifier par un test exécutable committé.

---

## Défauts trouvés (tous P2, non bloquants pour l'AAA)

**P2-1 — Décompte erroné des `id` ajoutés.** `DECISIONS-G.md` §2 et
`BRIEF.md` D27 (et par ricochet l'énoncé de cette mission) annoncent
« 4 `id` ajoutés » alors qu'il y en a réellement **5**
(`row-single-winner`, `bar-rotate-btn`, `bar-recap-btn`, `bar-theme-btn`,
**`bar-reset-btn`** — ce dernier omis du décompte bien que mentionné dans le
corps du texte de `DECISIONS-G.md` §2 sous un intitulé qui ne s'additionne
pas). Aucun effet fonctionnel (vérifié : pas de collision, câblage correct),
mais c'est une affirmation chiffrée fausse dans un document destiné à servir
de preuve d'audit. **Correctif suggéré** : corriger le décompte dans
`DECISIONS-G.md` §2 et `BRIEF.md` D27 (« 5 `id` ajoutés »).

**P2-2 — Décompte erroné des `.onclick=` dynamiques restants.**
`DECISIONS-G.md` §4 annonce « 8 occurrences restantes (game.ts ×6,
dice-ui.ts ×2, sw.ts ×1) » ; 6+2+1 = 9, confirmé par mesure indépendante à 9
occurrences réelles. Le raisonnement CSP reste correct pour chacune (vérifié
par mesure, §2 ci-dessus), mais le décompte total est faux. **Correctif
suggéré** : corriger « 8 » en « 9 » dans `DECISIONS-G.md` §4.

**P2-3 — Aucun test de régression automatisé pour le geste de fermeture par
glissement tactile sous la CSP resserrée.** Le geste (seuils 120px/0,3px·ms,
`CLAUDE.md`) fonctionne bien et ne déclenche aucune violation CSP (vérifié
manuellement ici via de vrais évènements tactiles CDP), mais ni
`e2e/onclick-wiring.spec.ts` ni `e2e/csp-script-src.spec.ts` ne l'exercent.
Comme ce chemin utilise déjà `addEventListener` sur des évènements `touch*`
(`src/dice-ui.ts`, hors périmètre de l'élément G, non modifié), le risque
actuel est nul, mais une régression future sur ce point précis (par exemple
une réintroduction accidentelle d'un attribut inline sur ce chemin) ne
serait pas détectée par la suite committée. **Correctif suggéré (non
bloquant)** : ajouter un test dans un futur tour, utilisant
`Input.dispatchTouchEvent` (CDP) comme démontré dans ce rapport.

---

## Fichiers/preuves produits pendant cette vérification

Tout le travail de vérification a eu lieu dans `/tmp/g-audit-worktree`
(worktree détaché sur `a7dd250`), **supprimé** en fin de mission
(`git worktree remove --force`, confirmé par `git worktree list`). Aucun
fichier de ce worktree ne subsiste. Le seul fichier ajouté au dépôt partagé
par cette critique est le présent rapport,
`docs/audit/G-critique-round1.md`.
