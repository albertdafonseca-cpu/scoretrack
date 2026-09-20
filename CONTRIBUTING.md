# Contribuer

Merci de lire [docs/DECISIONS.md](docs/DECISIONS.md) avant de proposer un changement : les
décisions qui y figurent ne sont pas rediscutées sans nouvel élément, et les demandes imprécises
sont d'abord reformulées et arbitrées.

## Prérequis

Node 22, npm 10. `npm ci` installe l'outillage (aucune dépendance n'est servie aux utilisateurs).
Playwright télécharge Chromium à la première exécution (`npx playwright install chromium` ; en CI
`--with-deps`).

## Règles non négociables

1. **`npm run check` vert avant tout commit** : lint (ESLint + Prettier, anti-emoji), `check:sw`,
   tests unitaires, tests e2e. La CI fait les mêmes vérifications, réparties en jobs parallèles
   (elle appelle les outils un par un, pas `npm run check`), et en ajoute quatre que `check` ne
   couvre pas : empaquetage `dist/` et poids du précache, contraste et daltonisme, Lighthouse,
   audit des dépendances.
2. **`npm run build:sw` après tout ajout, suppression ou modification d'un fichier servi**
   (HTML, CSS, JS, JSON, police, image). Le précache et le hash de version de `sw-st.js` sont
   générés ; un oubli fait échouer `check:sw` et priverait les utilisateurs de la mise à jour.
3. **`npm run build:screenshots` après tout changement visuel** (CSS, thème, écran, icône) et
   versionner les huit PNG régénérés : la CI les compare octet à octet à ce que l'interface rend.
   La référence est Linux (runner Ubuntu, Playwright du lockfile) : sous macOS ou Windows,
   `check:screenshots` est rouge en local sans être en tort — ne versionnez pas vos captures, laissez
   la CI trancher ou régénérez depuis un conteneur Ubuntu. Toute montée de `@playwright/test`
   (PR Dependabot dédiée) exige de régénérer les captures dans la même PR.
4. **Langue** : interface, documentation, commentaires, messages de commit et de PR en français ;
   identifiants de code (variables, fonctions, fichiers, clés JSON, classes CSS) en anglais.
5. **Zéro dépendance à l'exécution, zéro bundler** (D2) : pas d'`import` depuis `node_modules`
   dans `js/`, pas d'étape de build pour servir.
6. **Vie privée** (D4) : aucune requête réseau vers un tiers, aucune police ou script externe.
7. **Accessibilité et daltonisme** (D1, D10) : toute information portée par une couleur l'est aussi
   par un glyphe, une icône, un texte ou une position ; contraste AA sur les 14 thèmes ; cibles
   ≥ 44 px ; **aucun texte sous 12 px** ; navigation clavier et focus visible.
8. **Aucune donnée fictive, aucun identifiant de modèle d'IA** dans le code, les commits ou les
   docs (D9).

## Organisation du code

- `js/core` : logique pure, sans DOM ni `window`, couverte par des tests unitaires (toute nouvelle
  règle métier commence ici).
- `js/platform` : tout ce qui touche le navigateur (stockage, SW, erreurs, haptique).
- `js/ui` : DOM uniquement, via `h()`/`textContent` (jamais `innerHTML` avec des données).
- Actions des boutons : attribut `data-action` + entrée dans la table `ACTIONS` de `js/main.js`
  (aucun gestionnaire inline : la CSP les bloque).
- Données persistantes : passer par `platform/storage.js` et `core/save-schema.js` ; toute
  évolution du format = nouvelle version + fixture dans `tests/unit/fixtures` + test de migration.
- Icônes : SVG via `js/ui/icons.js` ; pas d'emoji dans l'interface finale.

## Tests

- Unitaires : `tests/unit/*.test.js` (Vitest, environnement Node). Couverture : `npx vitest run
--coverage`.
- Bout en bout : `tests/e2e/*.spec.js` (Playwright, iPhone 13 émulé, tactile). Utiliser les
  sélecteurs de rôle/texte plutôt que des classes CSS ; toute correction de bug s'accompagne d'un
  test qui échouait avant.
- Visuel/perf : `npm run build:dist` puis `npm run lhci` (Lighthouse mesure le paquet publié ;
  budget dans `lighthouserc.json`, voir ADR-15 pour la seule dérogation admise).
- Contraste et daltonisme : `npm run dev` dans un terminal, puis `npm run audit:contrast` et
  `npm run audit:cvd` (mêmes scripts qu'en CI, rapports dans `test-results/`).

## Style

Prettier (100 colonnes, guillemets simples) et `.editorconfig` font foi : `npm run format`.
Commits : un sujet à l'impératif en français (« Corrige l'annulation après rotation »), un corps
qui explique le pourquoi ; référence à l'ADR ou à l'issue si pertinent.

## Proposer un changement

1. Branche depuis `master`, commits atomiques.
2. `npm run build:sw` si nécessaire, puis `npm run check`.
3. Entrée dans `CHANGELOG.md` (section « Non publié »).
4. PR décrivant le changement, les preuves (captures, mesures, tests) et, pour toute décision de
   conception, une entrée proposée dans `docs/DECISIONS.md`.

## Sécurité

Voir [SECURITY.md](SECURITY.md) pour signaler une vulnérabilité (pas d'issue publique détaillée).
