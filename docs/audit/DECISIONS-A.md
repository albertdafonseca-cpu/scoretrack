# DECISIONS-A — Élément A : Fondation & outillage

Agent constructeur de l'élément A (audit qualité AAA ScoreTrack, brief v2).
Périmètre exclusif : `package.json` (scripts/devDependencies), `tsconfig*.json`,
config ESLint, `vitest.config.ts`, `playwright.config.ts`, `.github/workflows/*.yml`,
`tests/`, `e2e/`, ce fichier. Voir `docs/audit/BRIEF.md` §7 pour les décisions
numérotées (D1-D3) référencées ci-dessous.

## Constat de départ

Confirmé avant toute action : `npm run check` ne faisait que `tsc --noEmit`
puis `node build.mjs`. Aucun test (0 fichier), aucun lint, aucune CI
(`.github/` absent). C'est le défaut P0 #3 du constat initial.

## Ce qui a été posé

### 1. Vitest (tests unitaires)
- `vitest@^5.0.1` + `jsdom@^30` (environnement DOM pour les quelques
  helpers qui en ont besoin) + `vite@^7` (peer dependency non-optionnelle de
  vitest 5, à installer explicitement).
- `vitest.config.ts` : environnement `jsdom`, tests dans `tests/**/*.test.ts`.
  Vitest transforme directement les `.ts` via esbuild (comme le build de
  prod) : pas besoin de passer par `tsc` pour exécuter les tests. Le typage
  des tests reste vérifié séparément par `npm run typecheck`
  (`tsconfig.test.json`, cf. plus bas).
- Scripts : `npm test` (`vitest run`, un coup, pour CI/vérif), `npm run
  test:watch` (`vitest`, mode watch pour le développement).

### 2. ESLint (lint)
- `eslint@^10.11.0` (flat config) + `typescript-eslint@^8.70.0` +
  `@eslint/js` + `globals`.
- **Obstacle réel rencontré et sa résolution (D1)** : le projet utilise
  `typescript@^7.0.2` (nouvelle implémentation native de TypeScript).
  `typescript-eslint` 8.70 (dernière version stable au 20/09/2026) **refuse
  de démarrer** si `typescript` a une version majeure ≥ 7 — vérifié
  empiriquement (`Error: typescript-eslint does not support TS 7.0.`, levée
  inconditionnellement par `@typescript-eslint/parser` et
  `@typescript-eslint/eslint-plugin`, avec ou sans linting type-aware). Aucune
  version stable de `typescript-eslint` ne supporte encore TS 7 à cette date
  (voir https://github.com/typescript-eslint/typescript-eslint/issues/10940).
  **Décision retenue** : rétrograder la devDependency `typescript` à
  `^6.0.3` (dernière version stable dans la plage peerDependency de
  `typescript-eslint`, `>=4.8.4 <6.1.0`). Vérifié après coup : `npm run
  typecheck` reste vert à l'identique (0 erreur, aucune régression de
  comportement observée sur cette base de code) et `npm run build` (esbuild,
  indépendant de la version de `tsc`) inchangé. C'est une devDependency,
  explicitement dans mon périmètre. **Réversible** : dès qu'une version de
  `typescript-eslint` supporte TS 7, remonter `typescript` et relancer
  `npm run typecheck` pour confirmer l'absence de régression avant de
  merger.
- **Conséquence (D2)** : le lint reste en analyse de **syntaxe uniquement**
  (`tseslint.configs.recommended`, pas de `parserOptions.project`/
  `projectService`). Activer le linting *type-aware* (`recommendedTypeChecked`)
  aurait pu rester possible même avec TS 6.0.3, mais je ne l'ai pas activé
  par défaut : un essai a fait remonter **785 erreurs** quasi toutes dues aux
  très nombreux appels `any` non typés sur l'objet jsPDF (`recap-pdf.ts`,
  périmètre élément E, cf. `globals.d.ts` qui type délibérément jsPDF en
  `any` — CDN sans types). Corriger cela est hors de mon périmètre. **Piste
  pour plus tard** (notée aussi en D2) : une fois D1 stabilisé, activer
  `recommendedTypeChecked` ferait immédiatement remonter ces `any` non sûrs
  comme des points précis à traiter par l'élément E — potentiellement un
  bon outil de diagnostic pour ce défaut P1 déjà identifié.
- **Sévérités de règles choisies pour un premier lint sur 7 750 lignes qui
  n'en avait jamais eu** (voir commentaires en tête d'`eslint.config.js`) :
  - `error` (bloquant CI) : `no-unused-vars`/`@typescript-eslint/no-unused-vars`
    (avec `args:'none'` et `caughtErrors:'none'` — les gestionnaires
    d'événements du HTML partagent une signature commune même quand l'event
    n'est pas utilisé, et de nombreux `catch(e){}` avalent volontairement une
    erreur non actionnable, ex. `localStorage` indisponible), `no-empty`
    (avec `allowEmptyCatch:true`, même raison), `no-unused-expressions`/
    `@typescript-eslint/no-unused-expressions` (avec `allowTernary:true` —
    le style existant utilise `cond ? doA() : doB();` comme un if/else
    compact, ex. `dice-ui.ts`, `game.ts`), et tout le reste de
    `eslint:recommended` + `typescript-eslint/recommended` non explicitement
    réassoupli ci-dessous.
  - `warn` (visible, non bloquant) : `no-var` et `prefer-const` (style
    pré-TypeScript très répandu — 500+ occurrences dans des fichiers hors de
    mon périmètre — le corriger en masse aurait été hors sujet pour cet audit
    et risqué de collision avec les autres éléments qui éditent ces mêmes
    fichiers en parallèle), `@typescript-eslint/no-explicit-any` (le projet a
    une convention documentée dans `CLAUDE.md` autorisant `any` explicite
    commenté), `no-useless-assignment` (une seule occurrence actuelle,
    bénigne — voir « Dette » plus bas).
  - Une exception ciblée : `src/sw-worker.ts` reçoit les globals
    `serviceworker` (via le paquet `globals`), et les fichiers de config
    d'outillage (`*.config.{js,ts,mjs,cts}`, `build.mjs`) reçoivent les
    globals `node`.
- **Vérifié réellement** : `npm run lint` (= `eslint .`) sur la base actuelle
  → **0 erreur, 565 avertissements**, code de sortie 0. Sans les
  réassouplissements ci-dessus (config par défaut `recommendedTypeChecked`),
  c'était 785 erreurs ; avec `recommended` (syntaxe) nu, 590 erreurs. Le
  lint est donc réellement vert aujourd'hui, pas seulement configuré pour
  l'être en théorie.

### 3. Playwright (e2e, décision D3)
- `@playwright/test` **épinglé en `1.56.1`** (pas la dernière version, 1.63.0)
  — vérifié empiriquement que le binaire Chromium déjà présent dans cet
  environnement (`/opt/pw-browsers/chromium-1194`) correspond à la révision
  attendue par 1.56.1, alors que 1.63.0 attend `chromium-1243` (absent ici,
  téléchargement non tenté). Sans réseau de téléchargement de navigateur
  disponible/souhaité pour cette tâche, épingler la version qui correspond
  au binaire déjà installé était le choix le plus sûr pour avoir un test qui
  tourne réellement plutôt que déclaratif.
- `playwright.config.ts` minimal (projet Chromium desktop, trace on retry).
- `e2e/smoke.spec.ts` : ouvre `dist/index.html` (build de prod, en `file://`,
  comme le fait déjà la vérification visuelle manuelle documentée dans
  `CLAUDE.md`), accepte le consentement de confidentialité obligatoire au
  premier lancement (`checkFirstLaunch`/`#btn-privacy-accept`, découvert en
  écrivant ce test — je ne l'avais pas anticipé), choisit un préréglage,
  lance la partie sans saisir de nom, puis tape sur la moitié droite de la
  zone de la première carte joueur (`getIsPlus` dans `game.ts`) et vérifie
  que le score affiché augmente de 1.
- Script : `npm run test:e2e` (`playwright test`). Nécessite un
  `npm run build` préalable (dist/ à jour) — non automatisé en `pretest:e2e`
  pour rester simple ; à faire manuellement ou par l'élément qui l'utilise.
- **Volontairement absent de la CI GitHub Actions** (D3) : la mission
  demande une CI qui exécute *« install, lint, typecheck, tests unitaires,
  build »* — l'e2e n'y figure pas explicitement, et un runner GitHub Actions
  n'a pas Chromium préinstallé (`playwright install --with-deps chromium`
  alourdirait significativement une CI que la mission veut minimale, avec un
  temps de téléchargement variable). Le test existe, est vérifié comme
  fonctionnant réellement en local, et reste disponible via
  `npm run test:e2e` pour quiconque veut l'exécuter ou l'étendre. Ajouter un
  job CI dédié (avec cache du navigateur) est une amélioration future
  raisonnable, pas un blocage pour la mission actuelle.

### 4. CI GitHub Actions
- `.github/workflows/ci.yml` : un seul job `ci` sur `ubuntu-latest`,
  déclenché sur push (toutes branches) et pull_request. Étapes : checkout,
  setup-node (Node 22, cache npm), `npm ci`, `npm run lint`,
  `npm run typecheck`, `npm run test`, `npm run build`. Pas de déploiement
  (Vercel s'en charge hors CI, `vercel.json` existant non touché).
- Vérifié réellement (pas seulement écrit) : `rm -rf node_modules && npm ci`
  puis `npm run lint && npm run typecheck && npm run test && npm run build`
  en local, dans cet ordre exact, tout en vert — reproduit fidèlement ce que
  fait le workflow.

### 5. Scripts npm ajoutés
```
lint       → eslint .
test       → vitest run
test:watch → vitest
test:e2e   → playwright test
ci         → lint && typecheck && test && build
```
`check` (`typecheck && build`) est **laissé inchangé** : `CLAUDE.md` (hors de
mon périmètre d'édition) documente explicitement que `npm run check` =
« les deux » (typecheck + build). Changer son comportement aurait rendu ce
document faux sans que je puisse le corriger moi-même. J'ai donc ajouté un
script **`ci`** séparé qui enchaîne lint + typecheck + test + build, comme la
mission l'autorisait explicitement (« npm run check (ou un nouveau script
ci) »).

### 6. `tsconfig.test.json`
Nouveau fichier, étend `tsconfig.json`, inclut `tests/**/*.ts` et
`e2e/**/*.ts`, ajoute `"types": ["node"]` (nécessaire pour `node:url`,
`node:path`, `import.meta.dirname` utilisés par le test e2e — le
`tsconfig.json` de base a `"types": []` à dessein pour `src/`, qui est du
code navigateur pur). Intégré à `npm run typecheck`
(`tsc --noEmit -p tsconfig.test.json` en 3ᵉ étape). `@types/node` ajouté en
devDependency pour cette raison.

## Tests unitaires de démonstration écrits

Objectif explicite de la mission : prouver que la chaîne fonctionne
réellement de bout en bout, pas couvrir en profondeur (ça revient aux
éléments B-F sur leur propre périmètre). **11 tests, dans 2 fichiers** :

1. **`tests/dom.test.ts`** (7 tests) — `src/dom.ts` (`$`, `$opt`, `$$`, `$q`),
   périmètre de l'élément B. Environnement jsdom : construit un DOM minimal,
   vérifie qu'un id existant est trouvé, qu'un id absent renvoie `null`
   (`$opt`) plutôt que de planter, que `$$` renvoie un vrai tableau (jamais
   `null`/`undefined`) y compris vide, que `$q` renvoie le premier élément
   ou `null`, et qu'une racine (`root`) différente de `document` est bien
   respectée.
2. **`tests/translations.test.ts`** (4 tests) — `src/i18n/translations.ts`
   (18 langues), périmètre de l'élément D. Vérifie que les 18 langues sont
   bien présentes, que `LANGS` et les clés de `T` correspondent exactement,
   que **chaque langue traduit au moins toutes les clés de la langue de
   référence `en`** (une régression réaliste — clé ajoutée dans `en` sans
   être répercutée dans les 17 autres langues — ne casse ni le typecheck ni
   le build, repli silencieux sur `en` via `t()`, donc invisible sans ce
   test), et qu'aucune traduction n'est une chaîne vide.

Tests choisis pour être **structurellement capables d'échouer** (règle D17) :
zéro accès DOM/API distant, données ou fonctions déjà présentes dans le
dépôt (aucun stub artificiel créé juste pour avoir un test vert).

### Preuve de mutation testing (D17), exécutée puis restaurée
Pour chacun des 2 fichiers de test, le code source réel a été cassé
temporairement, le test relancé pour confirmer l'échec, puis le fichier
restauré à l'identique (vérifié par `diff` vide) avant de continuer :
- `src/dom.ts` : `$opt` modifié pour ne plus jamais renvoyer `null` → le test
  « `$opt` renvoie `null` quand l'id est absent » échoue bien
  (`AssertionError: expected <div> to be null`). Restauré, `diff` vide.
- `src/i18n/translations.ts` : suppression de la clé `appSub` dans `fr` → le
  test de complétude échoue bien (`expected [ 'appSub' ] to deeply equal []`
  pour `fr`). Restauré, `diff` vide.
- Test e2e (`e2e/smoke.spec.ts`) inclus dans le même exercice bien que hors
  du périmètre strict des tests unitaires : `adjust()` dans `src/game.ts`
  modifié pour forcer `delta=0` → le test échoue bien (score affiché
  toujours `40` au lieu de `41` attendu). Restauré, `diff` vide, `npm run
  build` puis `npm run test:e2e` revérifiés verts après restauration.

## Résultat des vérifications réelles (pas supposées)

Toutes exécutées dans cet ordre, `node_modules` réinstallé proprement
(`rm -rf node_modules && npm ci`) juste avant, pour être sûr de ne pas
vérifier un état local fortuit :

| Commande | Résultat |
|---|---|
| `npm ci` | OK, 172 paquets, 0 vulnérabilité |
| `npm run lint` | OK — **0 erreur**, 565 avertissements (code sortie 0) |
| `npm run typecheck` | OK — 0 erreur (3 tsconfig : `tsconfig.json`, `tsconfig.sw.json`, `tsconfig.test.json`) |
| `npm run test` | OK — **11/11 tests passés**, 2 fichiers |
| `npm run build` | OK — `dist/app.js` 801.7kb, `dist/sw.js` 1.8kb |
| `npm run ci` (lint+typecheck+test+build) | OK, tout vert |
| `npm run test:e2e` | OK — **1/1 test e2e passé** |

## Dette assumée / restant à faire (pour les autres éléments)

Ce que cet agent a délibérément **laissé de côté**, avec la raison, pour que
les autres éléments sachent quoi faire de l'outillage maintenant disponible :

- **Élément B (`src/game.ts`, `src/types.ts`, `src/dom.ts`,
  `src/globals.d.ts`)** :
  - L'injection HTML par nom de joueur (P0 #2 du constat initial,
    `game.ts:510` et 5 autres `innerHTML`) n'a **pas** été testée ici : elle
    est hors de mon périmètre d'édition et le mieux placé pour écrire le
    test de non-régression est l'agent qui pose le correctif (le test doit
    échouer sur le code non corrigé, donc être écrit avec/juste après le
    correctif). Vitest + jsdom (déjà en place) conviennent directement pour
    ce test (construire un joueur avec un nom contenant `<img onerror=...>`
    ou `</span>`, vérifier que le HTML rendu ne contient pas de balise
    active, ou que `textContent` reste fidèle au nom saisi).
  - `game.ts` fait 1988 lignes et mélange état/réglages/logique/rendu (P1
    #5) : au fur et à mesure que B extrait des fonctions pures (calcul de
    score, formatage, validation de réglages...), `tests/` est l'endroit où
    les couvrir unitairement sans DOM.
  - Deux `catch(e){}` valent la peine d'être revus par B au passage (pas des
    bugs bloquants, juste signalés par le lint en configuration actuelle
    silencieuse sur ce point précis) : aucun, en fait — j'ai vérifié qu'ils
    étaient tous des avalages volontaires documentés par le style du fichier.
  - `game.ts:529` : `let profiles=loadProfiles().filter(...)` n'est jamais
    réassigné (`prefer-const`, actuellement en `warn`) — cosmétique, à corriger
    à l'occasion d'un futur passage sur ce fichier plutôt qu'isolément.
- **Élément C (`src/dice3d/*`, `src/dice-ui.ts`)** :
  - `dice-ui.ts:403` : `var sum: number, percentVal: number | null=null;` —
    l'initialisation à `null` de `percentVal` n'est jamais lue avant d'être
    réécrite (`no-useless-assignment`, `warn`) : bénin (pas un bug, juste une
    initialisation morte), mais autant le nettoyer si C repasse sur cette
    fonction.
  - Le module `src/dice3d/die.ts` contient plusieurs fonctions pures et
    testables sans DOM ni WebGL (`_hexLum`, `_mixHex`, `_hexHS`,
    `_contrastInk`, `_capLum` — calculs de luminance/contraste, exactement
    le type de logique où un test de non-régression a le plus de valeur pour
    la garantie d'accessibilité daltonienne D-CLAUDE-2). Volontairement pas
    testées par cet agent : la mission place les tests approfondis du moteur
    de dés dans le périmètre de l'élément C, et ces fonctions sont assez
    proches du rendu (elles pilotent directement la géométrie/texture des
    dés) pour que ce soit à C de décider quoi en tester en cohérence avec le
    reste de son travail (D-CLAUDE-1 : zéro changement visuel, donc toute
    référence de test doit être établie par C lui-même, pas devinée par moi).
  - Une fois testées, ces fonctions bénéficieraient d'assertions de type
    « la luminance encre/corps reste ≥ à un seuil de contraste » — mesure
    directement liée à D-CLAUDE-2 (accessibilité daltonienne par luminance).
- **Élément D (`index.html`, `src/i18n.ts`, `src/i18n/translations.ts`,
  `src/icons.ts`, `src/animations.ts`, `src/splash.ts`)** :
  - Le test de complétude des 18 langues (`tests/translations.test.ts`) est
    déjà là ; D peut/doit l'étendre s'il ajoute des clés (rien à faire de
    plus si la discipline « une clé ajoutée dans `en` doit exister partout »
    est respectée — le test échouera sinon, c'est le but).
  - Aucun test d'accessibilité (contraste, rôles ARIA, tailles de police —
    P1 #4 du constat initial) n'a été posé ici : ce n'est pas un « utilitaire
    pur sans DOM lourd », c'est le cœur du travail de D. `jsdom` (déjà
    disponible via Vitest) ne rend pas de vraies polices/tailles CSS
    calculées ; un contrôle de contraste réel demandera probablement
    Playwright (déjà posé, `npm run test:e2e`) plutôt que Vitest — D peut
    étendre `e2e/` avec ses propres specs.
- **Élément E (`src/sw.ts`, `src/sw-worker.ts`, `src/recap-pdf.ts`, section
  confidentialité)** :
  - `recap-pdf.ts:11` type explicitement jsPDF en `any` (`@typescript-eslint/no-explicit-any`,
    `warn`) — documenté comme choix accepté (`CLAUDE.md`), mais si E ajoute des
    types pour jsPDF (ou un wrapper typé), le linting *type-aware* (voir D2
    ci-dessus) deviendrait activable sans les 785 erreurs actuelles, avec un
    vrai gain de sécurité de type sur ce module.
  - Le mensonge de politique de confidentialité (P0 #1) et le chargement
    CDN de jsPDF/Google Fonts non testés ici : hors périmètre, mais une fois
    corrigés, `e2e/` (Playwright, déjà posé) est l'outil naturel pour
    vérifier qu'aucune requête réseau externe n'est déclenchée à l'ouverture
    (`page.on('request', ...)` + assertion sur la liste des origines
    contactées).
- **Élément F (CI/CD, déploiement, doc)** :
  - `.gitignore` (hors de mon périmètre) ne connaît pas encore les
    artefacts que Playwright peut générer (`test-results/`,
    `playwright-report/`) — supprimés manuellement avant chaque commit de
    cet agent, mais F devrait les ajouter au `.gitignore` pour que
    `npm run test:e2e` ne pollue plus jamais `git status` pour personne.
  - Si un futur job CI e2e est ajouté (D3), il faudra aussi cacher/installer
    le navigateur Playwright (`playwright install --with-deps chromium`) et
    prévoir le temps de téléchargement en CI.

## Corrections round 1 (suite au verdict AAA:oui, 2 défauts P2)

Le critique indépendant (`docs/audit/A-critique-round1.md`) a rendu
**AAA : oui**, avec deux défauts P2 mineurs et actionnables, corrigés ici
(D9, `docs/audit/BRIEF.md` §7).

**P2-1 — `tests/dom.test.ts` : la fixture ne prouvait pas ce que le test
prétendait.** Tous les `.item` du montage DOM étaient placés à l'intérieur
de `#list` ; `document.querySelectorAll('.item')` et
`list.querySelectorAll('.item')` renvoyaient donc le même résultat, et une
implémentation de `$$`/`$q` qui **ignorerait totalement le paramètre `root`**
passait le test sans être détectée (confirmé indépendamment par le critique
via mutation testing). *Correctif* : ajout d'un `.item` supplémentaire hors
de `#list` dans la fixture (`beforeEach`), et ajustement des assertions
existantes qui comptaient les `.item` sans racine (elles voient maintenant 4
éléments au lieu de 3). Le test renommé « `$$` et `$q` utilisent bien le
paramètre `root` (pas seulement `document`) » vérifie désormais que
`$$('.item', list)` renvoie exactement les 3 éléments internes (pas les 4)
et que `$q('.item', list)` renvoie `'1'` (pas `'0'`, le premier élément
document-wide).

Mutation testing rejoué et confirmé : `$$`/`$q` modifiés temporairement pour
ignorer `root` (`document.querySelectorAll`/`querySelector` au lieu de
`root.…`) → le test échoue bien (`expected [...] to have a length of 3 but
got 4`). Restauré depuis une copie prise juste avant la mutation (état
courant de `src/dom.ts`, qui inclut déjà `escapeHtml` ajouté entre-temps par
l'élément B) ; `git diff src/dom.ts` vide après restauration, confirmé.

**P2-2 — `npm run test:e2e` pouvait tester silencieusement un `dist/`
obsolète.** Le script ne rebuildait pas automatiquement avant de lancer
Playwright (documenté comme choix assumé dans la version précédente de ce
fichier, mais un oubli réel de rebuild automatique). *Correctif* : ajout du
script `"pretest:e2e": "npm run build"` — npm exécute automatiquement tout
script `pre<nom>` avant `<nom>` lors d'un `npm run <nom>`, pas seulement pour
les scripts de cycle de vie standard (`test`, `install`...). Vérifié
réellement : `dist/app.js` supprimé manuellement, puis `npm run test:e2e` →
le build s'exécute d'abord (log esbuild visible), puis les tests e2e
tournent contre le `dist/` frais.

Vérifications finales après les deux corrections (dans le dépôt partagé,
sans toucher aux fichiers en cours d'édition par B/C/E/F) :
- `vitest run tests/dom.test.ts tests/translations.test.ts` → 11/11 tests
  passés.
- `npm run test:e2e` (avec `dist/app.js` préalablement supprimé) → build
  automatique déclenché, `e2e/smoke.spec.ts` passe.
- `git status --porcelain` : seuls `package.json` (script `pretest:e2e`
  ajouté) et `tests/dom.test.ts` modifiés par cet agent ; aucun fichier hors
  périmètre touché (les autres modifications visibles dans l'arbre de
  travail au moment de cette correction — `src/dice-ui.ts`, `src/dice3d/*`,
  `src/dom.ts` (ajout `escapeHtml`), `src/game.ts`, `src/recap-pdf.ts`,
  `src/sw-worker.ts`, `package-lock.json` (ajout `jspdf`) — appartiennent
  aux éléments B/C/E, en cours d'édition en parallèle, non lues au-delà du
  strict nécessaire (diff `package.json`/`src/dom.ts` uniquement, pour
  écrire ma restauration sans écraser leur travail).

## Fichiers créés/modifiés par cet agent

- `package.json` (scripts + devDependencies uniquement — `dependencies`
  non touché)
- `package-lock.json`
- `tsconfig.test.json` (nouveau)
- `eslint.config.js` (nouveau)
- `vitest.config.ts` (nouveau)
- `playwright.config.ts` (nouveau)
- `.github/workflows/ci.yml` (nouveau)
- `tests/dom.test.ts`, `tests/translations.test.ts` (nouveaux)
- `e2e/smoke.spec.ts` (nouveau)
- `docs/audit/BRIEF.md` (ajout au §7 uniquement — D1, D2, D3)
- `docs/audit/DECISIONS-A.md` (ce fichier, nouveau)
