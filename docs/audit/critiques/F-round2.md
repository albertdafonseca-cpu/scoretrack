# Critique élément F — tour 2 (CI/CD, déploiement, sécurité, documentation)

État audité : `HEAD = de02a43`, copie propre (`git archive HEAD`) dans
`…/scratchpad/critic/F2/repo`. Arbre de travail du dépôt sale (A en vol : `css/game.css`,
`css/themes.css`, `js/fx/layout-fit.js`, `sw-st.js`, `tests/e2e/game.spec.js`). Aucun fichier du
dépôt modifié par moi.

## 0. Scores

| Domaine       | Tour 1 | Tour 2 | Motif                                                                                    |
| ------------- | ------ | ------ | ---------------------------------------------------------------------------------------- |
| CI            | 6/10   | 6/10   | garde-fous désormais prouvés, mais 2 jobs rouges au commit et 2 audits non déterministes |
| Déploiement   | 8/10   | 5/10   | `build:dist` publie 2,6 Mo de captures de débogage d'un autre agent                      |
| Sécurité      | 8/10   | 9/10   | CSP complète, permissions par job, chaîne propre                                         |
| Documentation | 7/10   | 6/10   | D16–D21 absents du journal, six affirmations périmées, chiffres faux                     |

**AAA : non.**

## 1. Corrections du tour 1 : vérifiées RÉSOLUES (preuves)

| Tour 1                          | Vérification                                                                                                                                                                                       |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bloq. 1** `lhci` rouge        | `npm run lhci` → **EXIT=0**, trois fois de suite. Mesuré sur `dist/` : perf 0,95 · a11y 0,93 · best-practices 1,00 · SEO 1,00 · **CLS 0,018** · `font-size` **1** · poids 437 Kio                  |
| **Bloq. 2** audits non exécutés | job `design` de `ci.yml:146-181` : `npm run audit:contrast` + `audit:cvd` sur `dist/` servi. Exécutés ici : **contraste sort 1** (63–66 échecs) → le job échoue réellement (D13 tenu)              |
| **Maj. 3** Mermaid cassé        | les **4** diagrammes de `ARCHITECTURE.md` parsent (mermaid@11)                                                                                                                                     |
| **Maj. 4** CSP incomplète       | `index.html:11` contient `base-uri 'none'; form-action 'none'; object-src 'none'; worker-src 'self'`                                                                                               |
| **Maj. 5** permissions larges   | `deploy-pages.yml` : workflow en `contents: read`, `pages: write`/`id-token: write` sur le **seul** job `deploy`                                                                                   |
| **Maj. 6** `.nojekyll`          | versionné à la racine (`git ls-files`), copié dans `dist/`, contrôlé par les deux workflows                                                                                                        |
| **Maj. 7** garde-fou emoji      | `run: npm run lint:emoji` (plus de `if [ -f ]`) ; **prouvé** : un emoji injecté dans `<title>` → `ERREUR index.html:25 EMOJI 🎲`, exit 1                                                           |
| **Maj. 8** rollback incohérent  | `EXPLOITATION.md` § 2 : PR de revert, branche protégée assumée, `workflow_dispatch` pour republier                                                                                                 |
| **Maj. 9** seuil a11y           | `lighthouserc.json:22` = **0,93** = la mesure                                                                                                                                                      |
| **Maj. 10** poids               | deux métriques distinctes : `total-byte-weight` ≤ 512 000 (437 Kio mesurés) **et** `PRECACHE_MAX_BYTES` dans le job `paquet`                                                                       |
| **Maj. 11** mesure ≠ publié     | `lighthouserc.json:4` sert **`dist`** ; job `paquet` construit et contrôle `dist/` **à chaque PR**                                                                                                 |
| Mineurs 14/16/18/22             | `on: push: branches: [master]` + `workflow_dispatch` ; raccourcis `?action=` câblés (`js/platform/shortcuts.js`) ; `.gitignore` complété ; `AUDIT-2026-09.md` annoncé « brouillon » dans le README |

**Budget non relâché — vérifié ligne à ligne** : performance ≥ 0,95 (inchangé), CLS ≤ 0,1
(inchangé), `font-size` = 1 (inchangé), `total-byte-weight` ≤ 512 000 (inchangé), et `skipAudits`
a été **supprimé** (donc `is-on-https`, `uses-http2`, `uses-text-compression`, `redirects-http`
sont désormais évalués) : le budget est plus strict qu'au tour 1, pas plus laxiste.

**Garde-fous prouvés par dégradation volontaire** (copie ; `…/F2/gate-check.sh`) :

| Régression injectée                    | Résultat                                       |
| -------------------------------------- | ---------------------------------------------- |
| `dist/js/core/rules.js` retiré         | `Absents de dist/ : js/core/rules.js` → exit 1 |
| plafond de poids abaissé à 600 000     | `Précache trop lourd` → exit 1                 |
| emoji dans `<title>`                   | exit 1                                         |
| `css/base.css` modifié sans `build:sw` | `sw-st.js n'est pas à jour` → exit 1           |
| `dist/package.json` créé               | `ne doit pas être publié` → exit 1             |

**Autres preuves** : `npm run lint` (eslint + prettier + emoji + **jetons**) EXIT=0 · vitest
**309 tests**, couverture **100 % lignes / branches / fonctions / instructions** · `npm audit`
prod et dev 0 vulnérabilité · `dist/` servi puis **mode avion** : SW actif, cache `st-1d76539c`,
**59 entrées**, écran visible, **0 erreur console**.

## 2. BLOQUANTS

1. **`npm run build:dist` publie 2,6 Mo de captures de débogage d'un autre agent.**
   Quatorze fichiers `_tmp_claude-0_…_scratchpad_B_dbg_sobre-*.png` sont **versionnés à la racine**
   (`git ls-files | grep _dbg_` → 14, `du -ch` → 2,6 Mo) et se retrouvent dans `dist/` (83 fichiers
   au lieu de 59 + 10 légitimes). Ils seraient publiés sur GitHub Pages. Le contrôle du job `paquet`
   (`ci.yml:114-116`) ne teste que sept chemins interdits nommément : il ne voit rien.
   Attendu : (a) suppression des 14 fichiers du dépôt (propriétaire : B / auditeur) ; (b) **inverser
   le contrôle du job `paquet` en liste blanche** — refuser tout fichier de `dist/` qui n'est ni une
   entrée du précache, ni `.nojekyll`, ni l'un des actifs déclarés (`favicon.png`, captures du
   manifeste, `sprite.svg`, logos, `LICENSES.md`, `sw-st.js`). Sans (b), le trou se rouvrira.
2. **Deux jobs de CI sont rouges au commit audité.**
   - `design` : `npm run audit:contrast` sort **1** — 63 à 66 échecs sur ~14 950 mesures
     (thèmes `sobre`, `mono`, `ocean`, `sunset`, `nature` : `span.pplayer` 3,85 à 4,67 < 4,70 ;
     `svg.icon[plus|minus]` 2,63 < 3,20 sur `nature`).
   - `e2e` : `npx playwright test` → **1 échec, 3 non exécutés, 70 passés sur 74**
     (`tests/e2e/game.spec.js:447`, « 12 joueurs, prénoms de 18 caractères »).
     Les causes appartiennent à A et B (un correctif est en vol dans l'arbre de travail : `css/game.css`,
     `js/fx/layout-fit.js`, `tests/e2e/game.spec.js`), mais **au commit livré la CI ne passe pas**, et
     la documentation ne le dit pas : `ADR-15` décrit encore l'ancien échec Lighthouse et rien ne
     signale l'échec du contraste ni celui de bout en bout (D15).
3. **D21 n'est pas tenue : l'audit de contraste n'est pas reproductible.**
   Trois exécutions consécutives sur le même `dist/` : run 1 = **63 échecs / 14 962 mesures** ;
   runs 2 et 3 = **66 échecs / 14 938 mesures**. L'ensemble d'échecs diffère sur **13 entrées**
   (5 échecs d'icônes sur `nature` au run 1, remplacés par 8 échecs de `span.pplayer`), et le
   **nombre d'éléments mesurés change** d'une exécution à l'autre : l'audit n'atteint donc pas le
   même état de page. La médiane de captures et la marge de 0,2 réduisent le bruit mais ne
   l'éliminent pas. Attendu : rendre le pilotage déterministe (attente de `document.fonts.ready` et
   de la fin des transitions, nombre d'éléments mesurés **asserté constant**), puis prouver trois
   exécutions à ensemble d'échecs identique.

## 3. MAJEURS

4. **La règle D21 s'applique aussi à Lighthouse, et le job y échappe par chance.** Scores de
   performance par exécution : run A `0,95 / 0,89 / 0,89`, run B `0,86 / 0,95 / 0,98`, run C
   `0,95 / 0,98 / 0,91` — **4 des 9 exécutions sont sous le seuil de 0,95**. Le job passe parce que
   `aggregationMethod: median-run` désigne l'exécution médiane sur d'autres métriques et est tombée
   trois fois sur une bonne. LCP mesuré : 2,6 à 3,3 s. Attendu : `numberOfRuns` porté à 5 avec
   assertion sur le pire ou le 2ᵉ pire, ou correction du LCP — mais pas un vert tiré au sort.
5. **D16 à D21 et le rectificatif D11 ne sont pas consignés.** `docs/DECISIONS.md` s'arrête à D15
   (`grep "^## "` : D1…D15, puis ADR-10…ADR-20). Or le journal est, par préférence explicite du
   propriétaire, la mémoire du projet, et D15 exige qu'il soit à jour. Attendu : six entrées
   D16 (mesure sur pixels réels), D17 (pas de garde-fou silencieux), D18 (identifiant non
   chromatique par carte), D19 (échelle en rem), D20 (seuil transitoire ratifié), D21 (déterminisme),
   plus la reprise du **rectificatif D11**.
6. **`DECISIONS.md` D11 (l.102-111) affirme encore une cause que l'auditeur a rétractée** : « CLS
   causé par le chargement des polices ». Le rectificatif attribue 0,289 des 0,317 à `#presets-grid`
   (grille de préréglages remplie en JavaScript) et 0,031 seulement aux polices.
7. **Six affirmations « vérifiées le 17 septembre 2026 » sont fausses au commit audité** (D15 :
   la date ne dispense pas de la mise à jour, et le lecteur croit l'écart encore ouvert) :
   - `ADR-10` (l.148-150) et `SECURITE.md` § 2.2 (bloc « CSP actuellement déclarée » + « Écart
     ouvert ») : `base-uri`/`form-action` y sont donnés pour **absents** ; ils sont dans
     `index.html:11`. La « ligne attendue » est déjà appliquée.
   - `ADR-15`, dernier point : « le job `lighthouse` est **rouge** … performance 0,83, CLS 0,330,
     `font-size` 0 » → mesuré 0,95 / 0,018 / 1, exit 0.
   - `D10` : « six sélecteurs de `css/setup.css` restent à corriger » → `font-size` vaut 1 et
     `--fs-1: max(0.75rem, 12px)`.
   - `D14` : « État à la date de cette entrée : déclarés, non câblés » → câblés
     (`js/platform/shortcuts.js`, `js/platform/prepaint.js:45`).
   - `CHANGELOG.md` § « En cours » : « `timeline(log)` … n'est pas encore appelée par
     `js/ui/recap.js` » → appelée en `js/ui/recap.js:306` ; « raccourcis … pas encore câblés » → câblés.
     (Restent vraies : `exportDiagnostics()` non exposé, licence à définir, actions non épinglées par SHA.)
8. **Chiffres de poids et de comptage faux.** Mesuré sur le `dist/` de `HEAD` avec le script même du
   job `paquet` : **59 entrées de précache, 58 fichiers, 730 325 octets**.
   - `ci.yml:22-23` : « ≈ 644 000 octets, 61 fichiers » → faux de 13 % et de 3 fichiers.
   - `README.md:46` : « ≈ 640 Ko … 61 fichiers » → idem (« 238 Ko de polices » est juste : 244 132 o).
   - Conséquence pratique : 730 325 n'est qu'à **2,7 %** du plafond `PRECACHE_MAX_BYTES` = 750 000.
     Le prochain actif ajouté fait échouer la CI sans qu'aucun document n'ait prévenu.
9. **`CHANGELOG.md:67-68`** : « coquille de structure (24 Ko au 17 septembre 2026) » → `index.html`
   fait **38 630 octets (37,7 Ko)**. (« neuf feuilles CSS » est juste.)

## 4. MINEURS

10. `docs/SECURITE.md` § 3 (« Ce que la CI garantit ») liste cinq jobs : `paquet` et `design`
    manquent, alors que `ci.yml:3` renvoie explicitement le lecteur à cette section.
11. `ARCHITECTURE.md` § 1 : le diagramme omet `js/ui/toast.js`, `js/platform/prepaint.js` et
    `js/platform/shortcuts.js` (le sous-graphe `js/fx` est en revanche exact : 6 modules réels).
12. `scripts/audit-cvd.mjs` : seuls les échecs de la paire `gain`/`loss` sortent en 1 ; les échecs
    de palette sont **listés sans faire échouer**. C'est justifié (palette figée par D1) mais c'est
    un garde-fou partiellement muet au sens de D17 : à écrire dans `SECURITE.md` § 3.
13. Actions toujours épinglées par tag majeur — `ADR-20` l'assume honnêtement et explique pourquoi
    (SHA non obtenables derrière le mandataire, D9 interdit d'en inventer). À convertir hors sandbox.
14. `npm run lint:tokens` : plafonds réglés exactement sur les comptages actuels (32/32, 6/6, 10/10,
    4/4). Bon cliquet, mais zéro marge : tout ajout légitime exigera de toucher le plafond.
15. `@lhci/cli` toujours hors `package-lock.json` (assumé par ADR-15).

## 5. Verdict par domaine

- **CI — NON conforme.** Structure de très bon niveau (7 jobs, permissions minimales, `concurrency`,
  délais, artefacts, garde-fous **prouvés** non contournables), mais deux jobs rouges au commit et
  deux audits dont le verdict varie (bloquants 2 et 3, majeur 4).
- **Déploiement — NON conforme.** Le paquet est complet et fonctionne hors ligne (59/59 entrées,
  0 erreur), Lighthouse mesure enfin ce qui est publié, mais 2,6 Mo de captures de débogage
  partiraient en production sans que le contrôle s'en aperçoive (bloquant 1).
- **Sécurité — conforme.** CSP complète, permissions par job, aucun secret, aucune requête tierce,
  `npm audit` propre, modèle de menace sérieux. Seule réserve : l'épinglage par SHA, documenté.
- **Documentation — NON conforme.** Excellente sur la forme (datée, chiffrée, écarts nommés et
  attribués) mais D16–D21 manquent, un diagnostic rétracté subsiste, six affirmations et trois
  chiffres sont périmés (majeurs 5 à 9). C'est exactement ce que D15 interdit.

**AAA : non.**
