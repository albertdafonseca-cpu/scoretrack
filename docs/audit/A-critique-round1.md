# A-critique-round1 — Élément A : Fondation & outillage

Agent critique indépendant, round 1. Cible auditée : commit `2c088ad876cb7b2b7968b6e505db9b968eca1847`
(« Audit AAA — élément A : outillage tests/lint/CI »), sur la branche
`claude/audit-qualite-aaa-lmthte`.

## Verdict

**AAA : oui.**

Aucun défaut P0/P1 reproductible trouvé. Deux défauts P2 mineurs (voir §9),
n'affectant ni la robustesse ni la véracité des affirmations du constructeur.
Toutes les commandes de vérification ci-dessous ont été exécutées réellement,
avec sorties intégrales ou extraits fidèles collés tels quels (jamais
paraphrasés), dans un environnement isolé (voir §0 — nécessaire, note
méthodologique importante).

## 0. Note méthodologique : dépôt partagé vivant, isolation par worktree

**Découverte en cours d'audit** : `/home/user/scoretrack` est un répertoire de
travail *partagé en direct* par plusieurs agents constructeurs concurrents
(éléments B, C, E, F) qui commitent progressivement pendant que cet audit
tourne. Pendant les premières étapes de ce round, j'ai observé des fichiers
hors de mon périmètre (`src/dom.ts`, `src/game.ts`, `package.json`, `build.mjs`,
etc.) changer sous mes pieds pendant l'exécution — non commités, en cours
d'écriture par d'autres agents. Une restauration naïve depuis une copie de
sauvegarde (`cp fichier.orig fichier`) après une mutation de test aurait pu
écraser du travail en cours d'un autre agent.

**Correctif appliqué immédiatement** : dès ce constat, j'ai isolé toute la
suite de vérification (§1 à §5 ci-dessous) dans un `git worktree --detach` sur
le commit exact `2c088ad`, dans `/tmp/...worktree` (supprimé en fin d'audit).
Toute commande listée plus bas a été exécutée dans cette copie isolée, jamais
dans le répertoire partagé — sauf les commandes explicitement marquées
« (répertoire partagé, lecture seule) ». J'ai vérifié en fin d'audit que le
répertoire partagé est resté intact pour le périmètre de l'élément A (voir
§0.1) et que mes mutations de test n'ont laissé aucune trace (`git status`
propre après chaque restauration, dans le worktree isolé).

Un premier passage (avant l'isolation) m'avait fait croire à tort à une
régression TypeScript 6→7 (`escapeHtml` « jamais lu ») : en réalité, c'était
un état transitoire du travail en cours de l'élément B (import ajouté avant
d'être câblé partout) capturé par malchance au mauvais instant dans le
répertoire partagé. Refait proprement dans le worktree isolé (§5), ce
« défaut » disparaît : ce n'en était pas un. Leçon pour les rounds suivants
(et pour B/C/D/E/F) : **toujours auditer depuis un worktree isolé sur le
commit exact**, jamais depuis le répertoire de travail partagé en direct.

### 0.1 Le répertoire partagé est resté intact pour l'élément A

```
$ cd /home/user/scoretrack && git log --oneline -1
2c088ad Audit AAA — élément A : outillage tests/lint/CI (inexistant jusqu'ici)

$ git diff --stat HEAD -- package.json tsconfig.test.json eslint.config.js \
    vitest.config.ts playwright.config.ts .github/workflows/ci.yml tests/ e2e/ \
    docs/audit/DECISIONS-A.md
 docs/audit/BRIEF.md | 36 ++++++++++++++++++++++++++++++++++++
 package.json        |  1 +
 2 files changed, 37 insertions(+)
```
Les seules différences sur les fichiers touchés par A sont : (a) `BRIEF.md`
§7, journal partagé où *chaque* élément ajoute ses décisions par conception du
brief (D4+ ajoutés par d'autres éléments depuis) — pas une régression de A ;
(b) `package.json` +1 ligne = ajout d'une entrée dans `dependencies` (jspdf,
périmètre de l'élément E), aucune touche aux `devDependencies`/`scripts` de A.
Aucun fichier possédé par A n'a été altéré par mon passage ni par un tiers.

## 1. `npm ci` + `npm audit` (worktree isolé, commit `2c088ad`)

```
$ rm -rf node_modules && npm ci
added 172 packages, and audited 173 packages in 3s
46 packages are looking for funding
found 0 vulnerabilities
NPM_CI_EXIT:0

$ npm audit
found 0 vulnerabilities
AUDIT_EXIT:0
```
Conforme à l'affirmation du constructeur (172 paquets, 0 vulnérabilité).
Reproduit deux fois (worktree #1 et worktree #2, §5), résultat identique.

## 2. `lint`, `typecheck`, `test`, `build`, `ci` — sorties réelles

```
$ npm run lint
[…]
✖ 565 problems (0 errors, 565 warnings)
  0 errors and 515 warnings potentially fixable with the `--fix` option.
LINT_EXIT:0

$ npm run typecheck
> tsc --noEmit && tsc --noEmit -p tsconfig.sw.json && tsc --noEmit -p tsconfig.test.json
TYPECHECK_EXIT:0

$ npm run test
 Test Files  2 passed (2)
      Tests  11 passed (11)
TEST_EXIT:0

$ npm run build
  dist/app.js      801.7kb
  dist/app.js.map    2.5mb
  dist/sw.js  1.8kb
BUILD_EXIT:0

$ npm run ci        # (lint && typecheck && test && build enchaînés, vérifié séparément dans un 2e worktree)
[…]
✖ 565 problems (0 errors, 565 warnings)
[…]
 Test Files  2 passed (2)
      Tests  11 passed (11)
[…]
  dist/app.js      801.7kb
CI_SCRIPT_EXIT:0
```
Tout correspond exactement aux chiffres de `DECISIONS-A.md` (565
avertissements, 11/11 tests, tailles de bundle). Codes de sortie 0 partout.

## 3. Mutation testing indépendant sur les 11 tests unitaires

5 mutations indépendantes, à des endroits différents de ceux déjà cassés par
le constructeur (qui avait testé `$opt` et la clé `appSub`/`fr`), chacune
restaurée à l'identique ensuite (`git diff` vide vérifié après coup).

| # | Fichier muté | Mutation | Résultat attendu | Résultat réel |
|---|---|---|---|---|
| 1 | `src/dom.ts` | `$q` renvoie le **dernier** élément au lieu du premier | échec | **Échec confirmé** (2 tests rouges : `expected '1' to be '3'`) |
| 2 | `src/dom.ts` | `$` cherche `id+'-x'` (id altéré) | échec | **Échec confirmé** (`expected null not to be null`, puis `TypeError` en cascade) |
| 3 | `src/i18n/translations.ts` | `ja.restoreTitle` mis à chaîne vide (langue/clé différentes de celles déjà testées par le constructeur) | échec | **Échec confirmé** (`ja.restoreTitle est vide: expected 0 to be greater than 0`) |
| 4 | `src/i18n/translations.ts` | suppression de l'entrée `ko` dans `LANGS` (pas dans `T`) | échec | **Échec confirmé** (`LANGS et les clés de T se correspondent exactement` : diff montre `ko` manquant) |
| 5 | `src/dom.ts` | `$$` ignore complètement `root` et interroge toujours `document` | échec attendu | **Non détecté** — voir défaut P2-1 (§9) |

Après chaque mutation : restauration depuis copie de sauvegarde,
`git diff <fichier> | wc -l` → `0` à chaque fois (vérifié systématiquement,
pas seulement pour la dernière). Séquence complète rejouée deux fois (une
fois par erreur dans le répertoire partagé — annulée sans dommage car
identique au commit avant B — puis proprement dans le worktree isolé, dont
les résultats ci-dessus sont extraits).

**Conclusion** : 4 mutations sur 5 sont détectées immédiatement et
précisément par la suite de tests — ce sont de vrais tests, structurellement
capables d'échouer, pas des tests qui passent quoi qu'il arrive. La 5ᵉ
mutation non détectée révèle une faiblesse réelle mais mineure d'un des 11
tests (P2, pas un test « bidon » en soi — les 4 autres assertions de ce même
fichier de test échouent bien sur d'autres mutations).

## 4. Mutation testing indépendant sur le test e2e Playwright

Test rejoué réellement (pas seulement inspecté) :

```
$ npm run test:e2e
  ✓  1 [chromium] › e2e/smoke.spec.ts:10:1 › parcours minimal : préréglage -> lancement -> +1 point (1.3s)
  1 passed (2.1s)
```

C'est un vrai parcours utilisateur : accepte le consentement de
confidentialité, choisit le premier préréglage (`presetLdm`, 6 joueurs),
passe l'écran des noms, puis **clique réellement** (Playwright, pas un appel
de fonction interne) sur la moitié droite de la première carte joueur, et
vérifie que le score affiché passe de 40 à 41 — plus une assertion qu'aucune
erreur JS n'a été levée (`pageerror`).

**Mutation indépendante** (différente de celle du constructeur, qui avait
cassé `adjust()` pour forcer `delta=0`) : j'ai inversé la branche `rot-l` de
`getIsPlus()` dans `src/game.ts` (`>=` → `<`), qui est la branche *réellement
exercée* par ce test précis (le premier joueur du préréglage à 6 joueurs a la
rotation `rot-l`, pas la rotation par défaut — vérifié en lisant le layout à
6 joueurs avant de choisir où muter, pour ne pas muter une branche morte pour
ce test).

```
$ npm run build && npm run test:e2e
  ✘  1 […] parcours minimal : préréglage -> lancement -> +1 point (6.3s)
    Error: expect(locator).toHaveText(expected)
    Expected: "41"
    Received: "39"
  1 failed
E2E_EXIT:1
```
Le score a **diminué** (clic « plus » interprété comme « moins ») : le test
échoue bien, avec un message clair. Restauré, rebuild, re-testé vert :
```
$ npm run build && npm run test:e2e
  ✓ 1 passed (2.1s)
```
`git diff src/game.ts | wc -l` → `0` après restauration.

**Conclusion** : le test e2e est un vrai test de parcours, pas un test qui ne
peut structurellement pas échouer — confirmé par une mutation indépendante
qui le fait échouer avec un message exact et exploitable.

## 5. Rétrogradation TypeScript `^7.0.2` → `^6.0.3` (D1) : risque réel ?

Vérifié moi-même avec le binaire TypeScript réellement installé, dans le
worktree isolé, en 3 exécutions consécutives pour chaque version (règle de
déterminisme du brief §3.5) :

```
$ npx tsc --version
Version 6.0.3
$ for i in 1 2 3; do npm run typecheck; done   # x3
TS6 run1 exit:0 / run2 exit:0 / run3 exit:0    # 0 erreur, identique x3

$ npm install --no-save typescript@^7.0.2
$ npx tsc --version
Version 7.0.2
$ for i in 1 2 3; do npm run typecheck; done   # x3
TS7 run1 exit:0 / run2 exit:0 / run3 exit:0    # 0 erreur, identique x3
```
**0 erreur dans les deux cas, 3 exécutions consécutives identiques chacune.**
La rétrogradation est donc bien sans régression observable sur le code actuel
d'élément A — l'affirmation D1/DECISIONS-A.md est confirmée, pas seulement
crue sur parole. (Le faux positif rencontré dans le répertoire partagé — voir
§0 — était un artefact du travail concurrent de B, pas un effet de la
rétrogradation elle-même : refait à l'identique dans un environnement propre,
aucune différence TS6/TS7.)

Le typage `typescript-eslint` refusant réellement TS ≥7 a été confirmé
indirectement : `npm ci` (qui installe `typescript@^6.0.3` d'après le
`package-lock.json` commité) fait tourner `eslint .` sans erreur de démarrage
— cohérent avec la nécessité du palier documentée.

## 6. `.github/workflows/ci.yml` : validité et cohérence

```python
>>> import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))
YAML valid, top-level keys: ['name', True, 'jobs']   # 'on:' interprété True par PyYAML (YAML 1.1, sans effet sur le parseur GitHub Actions réel)
{'jobs': {'ci': {'steps': [checkout, setup-node(22), 'npm ci', 'npm run lint',
 'npm run typecheck', 'npm run test', 'npm run build']}}}
```
YAML syntaxiquement valide. Les 4 étapes de vérification (`lint`, `typecheck`,
`test`, `build`) correspondent **exactement** aux scripts présents dans
`package.json` du même commit — pas de script fantôme, pas de script
manquant. Node 22 dans le workflow correspond à la version locale utilisée
pour toutes mes vérifications (`v22.22.2`). Déclenchement sur toutes les
branches + PR, cohérent avec un projet mono-branche de fait. Pas de
déploiement dans ce fichier, conforme à ce qu'affirme `DECISIONS-A.md`.

## 7. Échantillon des 565 avertissements ESLint restants

Les 565 avertissements ne touchent que **8 fichiers au total** (pas un
échantillon partiel — c'est la totalité des fichiers concernés) :
`src/animations.ts`, `src/dice-ui.ts`, `src/dice3d/die.ts`,
`src/dice3d/cube.ts`, `src/dice3d/polyhedra.ts`, `src/game.ts`,
`src/globals.d.ts`, `src/recap-pdf.ts`. J'ai lu la totalité des lignes
signalées par ces 8 fichiers (bien au-delà de l'échantillon de 15-20 demandé)
et vérifié par script le seul motif de bug réel plausible pour du `var` en
boucle (variable de boucle capturée par une closure asynchrone —
`setTimeout`/`addEventListener`/`requestAnimationFrame`/`Promise` dans le
corps de la boucle) :

```
$ grep -n "for(var\|for (var" <fichiers> | vérif closures asynchrones dans les 15 lignes suivantes
POSSIBLE RISK near animations.ts:571   # inspecté manuellement : requestAnimationFrame
                                        # est hors de la boucle, pi est consommé
                                        # entièrement en synchrone → FAUX POSITIF, pas un bug
```
Aucune autre occurrence trouvée dans les ~540 `var` des 6 fichiers concernés.
Les deux `no-explicit-any` (`globals.d.ts:21`, `recap-pdf.ts:11`) sont bien
le typage jsPDF documenté par `CLAUDE.md` comme convention acceptée (« `any`
explicite... commenté »). Les deux `prefer-const` et le `no-useless-assignment`
(`dice-ui.ts:403`, `percentVal`) sont cosmétiques, confirmés par lecture du
code environnant.

**Conclusion : les 565 avertissements sont bien du style hérité inoffensif,
pas des bugs masqués.**

## 8. Périmètre respecté (`git show --stat 2c088ad`)

```
 .github/workflows/ci.yml   |   37 +
 docs/audit/BRIEF.md        |   18 +
 docs/audit/DECISIONS-A.md  |  317 +++
 e2e/smoke.spec.ts          |   51 +
 eslint.config.js           |   71 +
 package-lock.json          | 3025 +++---
 package.json               |   20 +-
 playwright.config.ts       |   23 +
 tests/dom.test.ts          |   55 +
 tests/translations.test.ts |   40 +
 tsconfig.test.json         |   10 +
 vitest.config.ts           |   13 +
 12 files changed, 3375 insertions(+), 305 deletions(-)
```
Aucun `index.html`, aucun `src/game.ts`, `src/types.ts`, `src/dom.ts`,
`src/dice3d/*`, `src/dice-ui.ts`, `src/i18n*`, `src/icons.ts`,
`src/animations.ts`, `src/splash.ts`, `src/sw*.ts`, `src/recap-pdf.ts`,
`vercel.json`, `build.mjs`, `.gitignore`, `README.md` touchés — tous
strictement hors périmètre A. Dans `package.json`, diff confirmé limité à
`scripts` + `devDependencies` ; `dependencies` (`three`) intact. `BRIEF.md`
n'est modifié qu'au §7 (journal partagé, usage explicitement prévu par le
brief lui-même pour tout élément). **Périmètre intégralement respecté.**

## 9. Défauts trouvés (aucun P0/P1)

**P2-1 — `tests/dom.test.ts`, test « `$$` et `$q` acceptent une racine
différente de `document` » (ligne ~50-54) : l'assertion sur `$$` ne prouve
pas ce qu'elle prétend.** Le montage DOM du test place les `.item` uniquement
à l'intérieur de `#list`, donc `document.querySelectorAll('.item')` renvoie
exactement le même résultat que `list.querySelectorAll('.item')` — une
implémentation de `$$` qui **ignorerait totalement le paramètre `root`**
passe ce test sans être détectée (vérifié : mutation réelle non détectée,
§3 ligne 5). La partie `$q` du même test, elle, détecte bien une régression
équivalente (vérifiée séparément). *Correctif suggéré (actionnable, pour
qui reprend `tests/dom.test.ts`)* : ajouter un élément `.item` supplémentaire
en dehors de `#list` dans le montage du test, pour que `$$('.item', list)`
et `$$('.item')` (sans root) divergent réellement en cas de bug.

**P2-2 — `npm run test:e2e` peut tester silencieusement un `dist/` obsolète.**
Le script ne rebuild pas automatiquement (`DECISIONS-A.md` le documente
explicitement comme un choix assumé, pas un oubli caché). Si `dist/`
n'existe pas du tout, l'échec est net et explicite (vérifié :
`page.goto()` échoue immédiatement, code de sortie 1). Mais si `dist/`
existe déjà et est simplement **périmé** (un correctif source pas encore
rebuild), le test passera contre l'ancien code et donnera une fausse
impression de vérification. *Correctif suggéré* : `"pretest:e2e": "npm run
build"` dans `package.json` (propriété de l'élément A). Mineur : le risque
est documenté honnêtement par le constructeur, pas dissimulé, et n'affecte
pas la véracité de ce qui est déjà affirmé comme vérifié.

Aucun autre défaut trouvé. Ni le lint, ni le typecheck, ni la CI, ni la
rétrogradation TypeScript, ni le périmètre ne présentent de problème réel.

## 10. Verdict détaillé au regard de la définition AAA (BRIEF §6)

- Aucun défaut P0/P1 reproductible trouvé par ce critique : **respecté**.
- Chaque correctif est couvert par un test qui échoue si on l'annule
  (mutation testing) : **respecté** — vérifié indépendamment par ce
  critique sur 5 mutations dom/i18n + 1 mutation e2e, toutes sauf une
  détectées, et celle non détectée est documentée en P2-1 sans remettre en
  cause la validité des tests dans leur ensemble.
- Comparaison à l'aveugle contre une application du marché : **non
  applicable à un élément d'outillage pur** (pas de rendu utilisateur à
  comparer) — cohérent avec la nature de l'élément A, aucune application de
  comptage de score/lancer de dés grand public n'a de pipeline
  test/lint/CI comparable à évaluer « à l'aveugle ».
- Aucune régression sur D-CLAUDE-1/2, D-PREF-1/2/3 : **respecté** — élément
  A n'a touché ni aux dés, ni à l'esthétique, ni à l'accessibilité (hors
  périmètre, vérifié §8).
- `npm run check` reste vert : **respecté** (`typecheck` + `build`, testés
  séparément, tous deux verts, dans le worktree isolé sur le commit
  audité).

## Conclusion

**AAA : oui**, avec deux améliorations P2 non bloquantes à la discrétion
d'un futur passage de l'élément A. L'outillage posé est réel, fonctionne de
bout en bout, et les tests (unitaires comme e2e) sont de vrais tests
capables d'échouer — vérifié par mutation testing indépendant, pas seulement
sur la foi des mutations déjà rejouées par le constructeur lui-même.
