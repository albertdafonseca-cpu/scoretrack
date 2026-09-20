# Critique élément F — CI/CD, déploiement, sécurité, documentation (round 1)

État audité : commit `5d15ed1`, arbre de travail propre (`git status --porcelain` vide).
Toutes les commandes ont été rejouées dans une copie du dépôt :
`/tmp/claude-0/-home-user-scoretrack/600391ed-7dfc-5cbd-85c8-2b4a98249abe/scratchpad/critic/F/repo`.
Aucun fichier du dépôt n'a été modifié.

## 0. Scores

| Domaine       | Score | Commentaire d'une ligne                                                                            |
| ------------- | ----- | -------------------------------------------------------------------------------------------------- |
| CI            | 6/10  | structure exemplaire, mais le job `lighthouse` est **rouge** et deux garde-fous sont contournables |
| Déploiement   | 8/10  | artefact prouvé complet et hors-ligne ; permissions trop larges, pas de `.nojekyll` versionné      |
| Sécurité      | 8/10  | modèle de menace sérieux et honnête ; CSP incomplète, actions non épinglées par SHA                |
| Documentation | 7/10  | runbook réellement utilisable ; 3 affirmations fausses, 1 diagramme Mermaid cassé                  |

**AAA : non.** Un critique ne peut pas préférer une CI dont le job de performance échoue dès le
premier push et une documentation qui annonce deux garanties inexistantes.

## 1. Ce qui est vérifié VERT (preuves)

| Étape de workflow rejouée                                 | Résultat                                                                                                                                                                  |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`                                                  | 0 vulnérabilité, EXIT=0 (`critic/F/npm-ci.log`)                                                                                                                           |
| `npx eslint .`                                            | exit 0                                                                                                                                                                    |
| `npx prettier --check .`                                  | « All matched files use Prettier code style! »                                                                                                                            |
| `npm run check:sw`                                        | « sw-st.js à jour (version b4704f20, 54 fichiers précachés) »                                                                                                             |
| `node scripts/lint-no-emoji.mjs`                          | exit 0 — « 0 emoji hors exception, 10 glyphes typographiques à migrer »                                                                                                   |
| `npx vitest run --coverage`                               | 7 fichiers, **275 tests passés** ; lignes 100 %, branches 98,62 %                                                                                                         |
| `npx playwright test`                                     | **25/25 passés en 54,4 s** (`critic/F/e2e.log`)                                                                                                                           |
| `npm audit --omit=dev --audit-level=high`                 | 0 vulnérabilité, y compris **sans `node_modules`** (le job `audit` ne fait pas `npm ci` : vérifié, il fonctionne)                                                         |
| `npm audit --audit-level=critical`                        | 0 vulnérabilité                                                                                                                                                           |
| Empaquetage `dist/` (tar rejoué à l'identique)            | 57 fichiers, 936 Ko ; les 6 fichiers du contrôle présents ; ni `package.json`, ni `tests/`, ni `node_modules`                                                             |
| Précache ↔ `dist/`                                        | **55/55 entrées présentes** (script de comparaison) ; non précachés : `favicon.png`, `assets/fonts/LICENSES.md`, les 2 captures du manifest, `sw-st.js` (normal)          |
| `dist/` servi puis **mode avion** (Playwright, iPhone 13) | SW actif sur `/`, cache `st-b4704f20`, **55 entrées**, page rechargée hors ligne, `#setup-page` visible, **0 erreur console**                                             |
| Branche par défaut                                        | `git ls-remote --symref origin HEAD` → `refs/heads/master` = déclencheur de `deploy-pages.yml` ✔                                                                          |
| Secrets                                                   | aucun (grep clé/API/token/PEM sur tout le dépôt hors lockfile)                                                                                                            |
| Requêtes tierces dans les fichiers servis                 | aucune : les seules URL sont des commentaires « source : » dans `css/fonts.css` et des `xmlns` `w3.org`                                                                   |
| Sinks dangereux dans `js/`                                | aucun `innerHTML`/`insertAdjacentHTML`/`eval`/`new Function` (seul `scripts/audit-contrast.mjs`, non servi) ; ESLint applique `no-eval`, `no-implied-eval`, `no-new-func` |
| `index.html`                                              | 1 seul `<script type="module" src>`, aucun `onclick`, aucun `<form>`/`<base>`/`<iframe>`                                                                                  |
| Câblage `data-action` ↔ table `ACTIONS`                   | bijection exacte, aucun bouton mort, aucune action morte                                                                                                                  |
| Liens Markdown                                            | 0 lien relatif cassé dans tous les `.md`                                                                                                                                  |
| Workflows                                                 | `concurrency` sur les deux, `timeout-minutes` sur les 6 jobs, `cache: npm`, artefacts `if: always()` / `if: failure()` corrects                                           |

## 2. Corrections — BLOQUANT

1. **`npm run lhci` ÉCHOUE — le job `lighthouse` de la CI est rouge dès le premier push.**
   Reproduit deux fois à l'identique (mon run 19:14 et le run de F conservé dans
   `/home/user/scoretrack/.lighthouseci/assertion-results.json`, 06:07) :
   - `categories:performance` attendu ≥ 0,95, mesuré **0,83 / 0,81 / 0,81** (`lighthouserc.json:16-19`)
   - `cumulative-layout-shift` attendu ≤ 0,1, mesuré **0,330** (`lighthouserc.json:54-57`) —
     élément fautif : `body > section#setup-page > section.setup-section` (« POINTS DE DÉPART »)
   - `font-size` attendu 1, mesuré **0** (`lighthouserc.json:52`) — 6 sélecteurs à 11 px dans
     `css/setup.css` (`.setup-label` l.8, `.ghost-btn` l.35, `.preset-card-*` l.168/176,
     `.logo-sub` l.125, `.toggle-sub` l.273)
     Aggravant : `font-size` = 1 **contredit** D7/ADR-15 qui impose justement « ≥ 11 px » — Lighthouse
     exige ≥ 12 px et refuse tout avec `user-scalable=no`. Le budget est auto-contradictoire.
     Attendu : (a) corriger CLS et tailles côté C/B, ou (b) réviser le budget avec un ADR daté et
     chiffré ; dans les deux cas F doit livrer un `npm run lhci` vert, preuve à l'appui.
     _(Le détail des causes appartient à B/C, mais le job rouge est le livrable de F.)_
2. **`docs/DECISIONS.md:26` ment sur une garantie de CI** : « script `scripts/audit-cvd.mjs`
   (simulation CVD) et `audit-contrast.mjs` **en CI** ». Vérifié : aucun des deux n'apparaît dans
   `.github/workflows/*.yml` ni dans les scripts de `package.json` (grep vide). Attendu : ajouter
   `"audit:contrast"`/`"audit:cvd"` à `package.json` et une étape au job `lint`, ou corriger la phrase.

## 3. Corrections — MAJEUR

3. **`docs/ARCHITECTURE.md:145-157` : le diagramme Mermaid n° 4 ne parse pas.** Validé avec
   `mermaid@11` : _« Parse error on line 4 : …ipWaiting immédiat\n(migration des ancie … got 'PS' »_.
   Cause l.149 : parenthèses dans un nœud non quoté. Les 3 autres diagrammes parsent (OK).
   Attendu : `SK["skipWaiting immédiat\n(migration des anciens utilisateurs)"]`.
4. **CSP incomplète — `index.html:9-11`.** `base-uri` et `form-action` **ne retombent pas** sur
   `default-src` : ils sont donc absents. `docs/SECURITE.md` §2.2 documente correctement que
   `frame-ancestors`/`report-to`/`sandbox` sont ignorés en `<meta>` (bon point, rare), mais ne
   signale pas ce manque. Attendu : ajouter `base-uri 'none'; form-action 'none'; object-src 'none';
worker-src 'self'` et le refléter dans SECURITE §2.2.
5. **`deploy-pages.yml:12-15` — permissions non minimales.** `pages: write` et `id-token: write`
   sont accordés au workflow entier, donc au job `build` qui n'en a aucun besoin. Attendu :
   `permissions: contents: read` au niveau workflow + un bloc `permissions` sur le seul job `deploy`.
6. **Pas de `.nojekyll` versionné à la racine.** `README.md:105` et ADR-16 présentent « Deploy from a
   branch » comme voie supportée (D2) ; le `touch dist/.nojekyll` (`deploy-pages.yml:51`) ne couvre
   que la voie Actions. Attendu : committer un `.nojekyll` vide à la racine.
7. **`ci.yml:37-43` — garde-fou contournable.** L'étape emoji est enveloppée dans
   `if [ -f scripts/lint-no-emoji.mjs ]` alors que le fichier est versionné : le supprimer rendrait
   la CI verte en silence. Attendu : `run: npm run lint:emoji`. De plus le script sort 0 malgré
   « 10 glyphes typographiques à migrer » : la garantie annoncée (`CONTRIBUTING.md:41`,
   `docs/SECURITE.md` §3) n'est aujourd'hui qu'informative.
8. **Runbook contradictoire.** `EXPLOITATION.md:30` prescrit `git push origin master` pour le
   rollback, tandis que `EXPLOITATION.md:118` demande de protéger `master` avec « PR obligatoire ».
   Appliqué, le §7 rend le §2 impossible. Attendu : rollback par PR de revert (avec le chemin
   `workflow_dispatch` déjà documenté comme secours).
9. **`docs/DECISIONS.md:72-73` : « la catégorie accessibilité plafonne à 0,86 » est faux.** Mesuré
   **0,93** sur les 3 runs, seul `meta-viewport` (poids 10) à 0. Le seuil 0,86 laisse donc passer
   7 points de régression silencieuse. Attendu : seuil `0.93` dans `lighthouserc.json:22` et phrase
   corrigée.
10. **Poids annoncé faux, et l'assertion ne mesure pas ce qu'elle prétend.** `DECISIONS.md:35` :
    « le poids total reste < 512 Ko, asserté par Lighthouse » — or `total-byte-weight` vaut
    **323 Kio** (chargement initial seul, les polices étant différées), alors que le **précache
    réellement téléchargé pèse 556 Ko** (55 fichiers, mesuré). `README.md:45` annonce « ≈ 650 Ko » :
    faux aussi. Attendu : assertion de poids du précache dans `scripts/build-sw.mjs` (échec au-delà
    d'un seuil) + les deux chiffres corrigés.
11. **Ce qui est mesuré n'est pas ce qui est publié.** `lighthouserc.json:4-7` sert la **racine du
    dépôt**, pas `dist/` ; et le job d'empaquetage n'est exercé qu'au push sur `master`
    (`deploy-pages.yml:8-9`), jamais en PR. Une régression d'empaquetage n'apparaîtrait donc qu'en
    production. Attendu : construire `dist/` dans la CI et y pointer Lighthouse.

## 4. Corrections — MINEUR

12. Actions épinglées par tag majeur (`checkout@v4`, `setup-node@v4`, `configure-pages@v5`,
    `upload-pages-artifact@v3`, `deploy-pages@v4`, `upload-artifact@v4`), pas par SHA — assumé dans
    SECURITE §2.6 ; à passer en SHA + commentaire de version, Dependabot suit déjà.
13. `package.json:22` — `npx --yes @lhci/cli@0.15.1` : version épinglée mais **hors lockfile**, donc
    sans vérification d'intégrité. ADR-15 l'assume explicitement (≈ 300 paquets transitifs).
14. `ci.yml:5-7` — `on: push` sans filtre **et** `pull_request` : double exécution complète sur les
    branches de PR du dépôt ; pas de `workflow_dispatch` pour relancer.
15. `favicon.png` (7 Ko) à la racine n'est référencé nulle part (`index.html:23` pointe
    `icons/icon-192.png`) et est tout de même publié dans `dist/` : fichier mort.
16. `manifest-st.json` déclare les raccourcis `./?action=new` et `./?action=resume` ; aucun code ne
    lit `location.search`/`URLSearchParams` (grep vide) → raccourcis PWA inopérants (élément E).
17. Les 2 captures du manifest (218 Ko) ne sont pas précachées (`scripts/build-sw.mjs:13` ignore
    `assets/screenshots`) : fiche d'installation dégradée hors ligne. À assumer par écrit ou à ajouter.
18. `.gitignore` : ajouter `.DS_Store`, `*.log`, `.env*`, `.idea/`, `.vscode/`.
19. `EXPLOITATION.md:105` attend `content-type: application/javascript` ; GitHub Pages sert
    couramment `text/javascript` → la commande de contrôle peut alarmer à tort. Rendre le grep tolérant.
20. `EXPLOITATION.md:118-119` nomme les checks requis `lint, unit, e2e, lighthouse, audit` (ids des
    jobs) alors que GitHub expose les **noms d'affichage** (« Lint (eslint, prettier, précache SW,
    emoji) », …). Donner les noms exacts, sinon la protection de branche sera mal configurée.
21. `CONTRIBUTING.md:15-16` « La CI rejoue exactement ces commandes » : la CI réexécute les outils un
    par un et n'appelle jamais `npm run check`. Reformuler (« les mêmes vérifications, réparties en jobs »).
22. `docs/AUDIT-2026-09.md` est aux ~70 % « à compléter par l'auditeur » alors que `README.md:94` le
    référence comme documentation livrée. À signaler comme brouillon jusqu'à clôture.

## 5. Écarts liés au chantier en cours de l'élément A (signalés, non imputés à F)

- `CHANGELOG.md:60-61` : « coquille de 13 Ko » (mesuré **19,7 Ko**) et « modules … `js/fx` » alors
  que `js/fx/` n'existe pas — et la même ligne est listée en « En cours » l.75. Contradiction interne
  à recaler à la fusion.
- `README.md:84` liste `js/fx/  animations` dans la structure sans réserve. À l'inverse,
  `ARCHITECTURE.md:106` dit honnêtement « `js/fx/` n'existe pas encore » : c'est le bon modèle.
- `CHANGELOG.md:40-41` annonce un « texte de diagnostic à copier » ; `exportDiagnostics()` n'est
  exposé par aucun `data-action` (`EXPLOITATION.md:92-95` le dit honnêtement, le CHANGELOG non).

## 6. Décisions et préférences — fidélité de la consignation

D1 à D9 sont tous consignés dans `docs/DECISIONS.md` avec contexte/décision/conséquences, et
rappelés en table dans `ARCHITECTURE.md` §6 : conformes au brief, sans déformation. Les trois
préférences du propriétaire (daltonisme, mémoire des décisions, remise en question des demandes
imprécises) figurent en tête de `DECISIONS.md` l.8-16 et sont reprises dans `CONTRIBUTING.md` l.3-5.
Réserve : D1 s'appuie sur une garantie de CI qui n'existe pas (voir bloquant n° 2).

## 7. Le runbook permet-il à un nouveau venu de…

| Question                     | Réponse       | Preuve                                                                                                            |
| ---------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------- |
| déployer ?                   | **oui**       | EXPLOITATION §1 + §7 ; le seul réglage manuel (Source = GitHub Actions) est explicite                             |
| revenir en arrière ?         | **oui, mais** | §2 est complet (revert, `build:sw`, jamais de `--force`, `workflow_dispatch`) mais contredit §7 (correction n° 8) |
| diagnostiquer un SW périmé ? | **oui**       | §3 : ordre de diagnostic, 4 remèdes gradués, et l'avertissement « Unregister ne touche pas le localStorage »      |
| récupérer des données ?      | **oui**       | §4 : tableau situation → action, format d'export documenté et conforme à `js/platform/backup.js`                  |
