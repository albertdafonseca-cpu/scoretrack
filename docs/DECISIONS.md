# Journal des décisions (ADR courts)

Mémoire du projet : une décision consignée ici n'est pas rediscutée sans nouvel élément. Format :
**contexte → décision → conséquences**. Les entrées D1 à D9 viennent du brief d'audit de septembre
2026 ; les suivantes sont les décisions techniques prises pendant les travaux ; la dernière section
consigne les préférences du propriétaire.

## Préférences du propriétaire (s'appliquent à tout)

- **Créations adaptées aux daltoniens** : toute production visuelle (palette, thèmes, captures,
  diagrammes de la documentation) doit rester lisible en protanopie, deutéranopie et tritanopie ;
  jamais une information portée par la seule couleur.
- **Mémoriser les décisions prises** : ce fichier est la référence ; un agent ou un contributeur qui
  découvre une décision non consignée l'ajoute.
- **Remettre en question les demandes imprécises** : avant d'implémenter une demande ambiguë, la
  reformuler, exposer les options et leurs conséquences, et faire trancher plutôt que deviner.

## D1 — Palette daltonien-safe partout

- Contexte : 12 couleurs de joueurs et des signaux gain/perte ; ~8 % des hommes ont une déficience
  de vision des couleurs.
- Décision : couleurs joueurs = palette Paul Tol « bright/vibrant » ; gain/perte = paire
  bleu/orange (`--gain #0077BB`, `--loss #EE7733`), jamais vert/rouge seuls ; toute couleur doublée
  d'un glyphe, d'une icône, d'une forme, d'un texte ou d'une position.
- Conséquences : `--green`/`--red` restent définis pour compatibilité mais ne portent plus de
  sémantique. `scripts/audit-contrast.mjs` (contraste AA sur les 14 thèmes) et
  `scripts/audit-cvd.mjs` (simulation protanopie/deutéranopie/tritanopie) sont exécutés par le job
  `design` de la CI sur le paquet `dist/` et font échouer la construction en cas de régression
  (code 1 = seuil non tenu, code 2 = audit impossible) — D13.

## D2 — Zéro dépendance à l'exécution, zéro bundler

- Contexte : projet léger, pérenne, hébergé sur GitHub Pages ; un build fragilise et opacifie.
- Décision : modules ES natifs et CSS séparés, servis tels quels depuis la racine du dépôt ; npm
  uniquement pour lint, tests, génération.
- Conséquences : « deploy from branch » fonctionne toujours ; le workflow Pages ne fait que
  filtrer l'outillage ; `npm audit --omit=dev` audite un arbre vide ; pas de minification. Deux
  poids distincts sont surveillés : le **chargement initial** de la page (audit Lighthouse
  `total-byte-weight`, plafond 512 000 octets) et le **précache téléchargé à l'installation du
  service worker** (job `paquet` de la CI, plafond `PRECACHE_MAX_BYTES` = 700 000 octets).

## D3 — `sw-st.js` et `manifest-st.json` gardent leur nom

- Contexte : des PWA déjà installées référencent ces URL.
- Décision : noms figés ; le nouveau SW purge `st-v1`, `st-fonts-v1` (et `st-v2` de la fondation)
  et prend la main immédiatement lorsqu'il détecte un cache hérité.
- Conséquences : les utilisateurs existants reçoivent la nouvelle version sans réinstaller ;
  ensuite les mises à jour passent par la bannière (voir ADR-13).

## D4 — Aucune donnée ne quitte l'appareil

- Contexte : la politique de confidentialité affirmait « aucune transmission » alors que Google
  Fonts était contacté à chaque chargement (fuite d'IP ; LG München I, 20 janvier 2022).
- Décision : polices auto-hébergées (OFL, `assets/fonts/LICENSES.md`), CSP `connect-src 'self'`,
  aucun analytics, aucun CDN.
- Conséquences : +238 Ko de polices précachées ; test e2e « aucune requête hors origine ».

## D5 — Compatibilité des données locales

- Contexte : clés `scoretrack_settings/save/profiles` sans version au commit initial.
- Décision : numéro de version dans chaque objet, `parse*` tolérant toutes les versions passées,
  fixtures figées, jamais de perte de partie en cours.
- Conséquences : voir ARCHITECTURE § 3 ; toute évolution du schéma = fixture + test de migration.

## D6 — Langue

- Décision : UI, documentation, commentaires et messages de commit en français ; identifiants de
  code (variables, fonctions, fichiers, clés JSON) en anglais.

## D7 — `user-scalable=no` conservé sur l'écran de jeu

- Contexte : un pinch-zoom accidentel en pleine partie est inacceptable ; WCAG 1.4.4 demande
  pourtant le zoom.
- Décision : conserver `maximum-scale=1, user-scalable=no` ; en contrepartie tailles minimales de
  texte (voir D10 : plancher porté à 12 px), `prefers-reduced-motion` respecté.
- Conséquences : l'audit Lighthouse `meta-viewport` (poids 10) échoue **structurellement**. Avec
  21 audits d'accessibilité applicables sur cette page, la catégorie plafonne à **0,934** (mesuré :
  0,93 sur 3 exécutions). Le budget CI asserte donc chaque audit d'accessibilité individuellement à
  1, fixe le seuil de catégorie à 0,93 et désactive `meta-viewport` — seule dérogation admise
  (D12, ADR-15).

## D8 — Niveau visé : meilleur compteur de score du marché

- Décision : la grille `RUBRIC.md` (recherche) et le protocole de comparaison à l'aveugle font foi ;
  un critère n'est « AAA » que prouvé (capture, mesure, sortie de test).

## D9 — Aucune donnée fictive, aucun identifiant de modèle IA

- Décision : pas de scores, captures ou mesures inventés dans les livrables ; ni le code, ni les
  commits, ni les docs ne mentionnent d'identifiant de modèle d'IA.

## D10 — Plancher typographique à 12 px (remplace « ≥ 11 px »)

- Contexte : le plancher de 11 px était incompatible avec l'audit `font-size` de Lighthouse (qui
  exige 12 px dès que le zoom est désactivé) et, surtout, avec la lisibilité à 1 m visée par D8.
- Décision (arbitrage de l'auditeur, 17 septembre 2026) : tous les textes rendus mesurent au moins
  12 px (jeton `--fs-1`), sans exception — libellés de la barre d'action et mentions légales
  comprises. Les jetons de l'échelle typographique sont décalés en conséquence.
- Conséquences : l'assertion `font-size` = 1 du budget Lighthouse devient tenable et cesse de
  contredire D7. Six sélecteurs de `css/setup.css` restent à corriger au moment de cette entrée.

## D11 — Le CLS est un défaut, pas un budget à assouplir

- Contexte : CLS de 0,330 mesuré sur l'écran d'accueil, causé par le chargement des polices
  (`#setup-page > .setup-section` se déplace à l'arrivée des fontes).
- Décision : le budget (performance ≥ 0,95, CLS ≤ 0,1) ne bouge pas ; le décalage se corrige par
  `size-adjust`/`ascent-override` dans `css/fonts.css`, préchargement (`<link rel="preload">`) des
  deux polices du premier rendu et réservation de la hauteur des blocs.
- Conséquences : le job `lighthouse` reste rouge tant que la correction n'est pas faite ; c'est le
  signal attendu, pas un réglage à contourner.

## D12 — `meta-viewport` : seule dérogation Lighthouse admise

- Décision : `user-scalable=no` est conservé (D7) et l'audit `meta-viewport` reste désactivé dans
  `lighthouserc.json`, avec la justification écrite en ADR-15. Aucun autre audit n'est désactivé, et
  `skipAudits` est vide.

## D13 — Les audits de contraste et de daltonisme tournent réellement en CI

- Contexte : `docs/DECISIONS.md` annonçait ces audits « en CI » alors qu'aucun workflow ne les
  appelait. Une garantie documentée mais non exécutée est un mensonge de documentation.
- Décision : job `design` de `ci.yml` — `npm run audit:contrast` et `npm run audit:cvd` sur `dist/`
  servi localement, rapports en artefact, échec de la construction en cas de régression.

## D14 — Rien d'annoncé ne reste non câblé

- Décision : les raccourcis `./?action=new` et `./?action=resume` déclarés dans `manifest-st.json`
  doivent être implémentés (lecture de `location.search` au démarrage) ou retirés du manifeste.
- État à la date de cette entrée : déclarés, non câblés — à traiter par l'élément E.

## D15 — Aucune documentation ne décrit un état futur au présent

- Décision : chaque affirmation du README, du journal des décisions, du journal des modifications et
  de l'architecture est vraie à l'instant du commit, chiffres compris (poids, tailles, scores). Ce
  qui n'est pas livré est nommé comme tel, daté, et attribué à un élément.
- Conséquences : les mesures citées dans la documentation portent leur date et la commande qui les
  produit ; un chiffre invérifiable est retiré plutôt qu'arrondi.

## ADR-10 — CSP déclarée en `<meta>` (pas d'en-têtes sur Pages)

- Contexte : GitHub Pages n'autorise aucun en-tête HTTP personnalisé.
- Décision : CSP stricte en `<meta http-equiv>` en tête du `<head>` ; `script-src 'self'` sans
  inline ; `style-src 'unsafe-inline'` toléré (styles calculés).
- Conséquences : plus aucun `onclick` inline (table `ACTIONS`) ; `frame-ancestors`/`report-to`
  inapplicables (voir SECURITE § 2.2) ; l'audit Lighthouse `csp-xss` reste informatif.
- Écart ouvert au 17 septembre 2026 : `base-uri` et `form-action` ne retombent pas sur
  `default-src`, ils sont donc absents de la politique actuelle. La ligne complète attendue figure
  dans `docs/SECURITE.md` § 2.2 ; `index.html` appartient aux éléments C/A, la correction leur
  revient.

## ADR-11 — Découpage en modules `core / ui / platform / fx`

- Décision : `core` sans DOM et testé unitairement ; `platform` isole le navigateur ; `ui` seule
  touche le DOM ; `main.js` ne fait que câbler.
- Conséquences : couverture unitaire ≈ 100 % lignes sur `core` ; le rendu utilise `h()`/
  `textContent`, jamais `innerHTML` avec des données.

## ADR-12 — Précache du SW généré par script et vérifié en CI

- Décision : `scripts/build-sw.mjs` écrit `PRECACHE` + `VERSION` (hash SHA-256 tronqué) ;
  `check:sw` en CI et dans `npm run check`.
- Conséquences : `npm run build:sw` est **obligatoire** après tout ajout/modification de fichier
  servi ; le nom de cache change à chaque livraison, ce qui déclenche la mise à jour.
- Le job `paquet` de la CI vérifie en plus que chaque entrée du précache existe bien dans `dist/`
  et que le poids total reste sous `PRECACHE_MAX_BYTES` : c'est ce poids-là, et non
  `total-byte-weight`, que l'utilisateur télécharge à la première visite.

## ADR-13 — Mise à jour PWA explicite (waiting + bannière)

- Contexte : un `skipWaiting` systématique peut recharger un module au milieu d'une partie.
- Décision : le nouveau SW attend ; la page affiche « Nouvelle version disponible — Mettre à
  jour » ; l'application n'envoie `SKIP_WAITING` que sur action, après sauvegarde. Exception :
  migration depuis les caches hérités (D3).

## ADR-14 — Sauvegarde atomique avec `.tmp` / `.prev` / `.corrupt`

- Contexte : au commit initial, une sauvegarde illisible était effacée en silence.
- Décision : écriture `tmp` → bascule ; dernière sauvegarde valide conservée ; sauvegarde illisible
  mise en quarantaine et proposée à la décision de l'utilisateur ; écritures coalescées par trame ;
  `navigator.storage.persist()` demandé.
- Conséquences : quatre clés annexes ; runbook « récupérer ses données » (EXPLOITATION § 4).

## ADR-15 — Budget Lighthouse, mesuré sur le paquet publié

- Décision : `lighthouserc.json` à la racine ; collecte mobile ×3 avec agrégation médiane sur
  **`dist/`** (le paquet réellement publié, construit par `npm run build:dist`), servi par
  `http-server` sur le port 8799.
- Budget : performance ≥ 0,95, best-practices ≥ 0,95, SEO ≥ 0,9, accessibilité ≥ 0,93 **et** chaque
  audit d'accessibilité asserté à 1 individuellement ; `font-size` = 1 (impose le plancher de 12 px,
  D10), `errors-in-console` = 1, CLS ≤ 0,1 (D11), `total-byte-weight` ≤ 512 000 octets.
- Dérogation unique : `meta-viewport` désactivé (D7/D12), justifié ci-dessus. Aucun `skipAudits` :
  sur `localhost`, `is-on-https` et `uses-http2` sont déjà à 1, et `uses-text-compression` n'est pas
  pondéré (GitHub Pages compresse à la livraison).
- Lighthouse ≥ 12 n'a plus de catégorie « PWA » ni d'audit `installable-manifest` :
  l'installabilité est garantie par `tests/e2e/pwa.spec.js` (manifeste, service worker, hors ligne),
  pas par LHCI.
- `@lhci/cli` est appelé par `npx` avec une version épinglée (`0.15.1`) plutôt qu'ajouté aux
  devDependencies (≈ 300 paquets transitifs pour un outil de mesure). Conséquence assumée : cette
  dépendance-là n'est pas couverte par l'intégrité du `package-lock.json`.
- État au 17 septembre 2026 : le job `lighthouse` est **rouge**. Mesuré sur `dist/` : performance
  0,83 (attendu ≥ 0,95), CLS 0,330 (attendu ≤ 0,1), `font-size` 0 (six sélecteurs à 11 px dans
  `css/setup.css`). Accessibilité 0,93, best-practices 0,96, SEO 1,00 sont tenus. Ces trois échecs
  sont des défauts réels de l'application (D10, D11), pas un budget mal réglé : le budget n'est pas
  relâché pour faire passer la CI.

## ADR-16 — Déploiement Pages par GitHub Actions

- Décision : `deploy-pages.yml` (push sur `master` + manuel) empaquette le dépôt sans outillage
  dans `dist/` via `npm run build:dist` (`tar` avec liste d'exclusion explicite) —
  **la même commande** que la CI construit, mesure avec Lighthouse et contrôle dans le job
  `paquet`, pour que ce qui est mesuré soit ce qui est publié. Puis `configure-pages` →
  `upload-pages-artifact` → `deploy-pages`. Permissions minimales : le workflow est en
  `contents: read`, et seul le job `deploy` reçoit `pages: write` et `id-token: write`.
  Environnement `github-pages`, aucun secret.
- `.nojekyll` est **versionné à la racine** (et donc copié dans `dist/`) : il protège aussi la voie
  « deploy from branch », où aucun workflow ne passe.
- Conséquences : la source Pages doit être réglée sur « GitHub Actions » (à faire par le
  propriétaire) ; « Deploy from a branch » à la racine reste possible (D2) mais publierait aussi
  `package.json`, `tests/`, `docs/`.

## ADR-17 — Licence : à définir par le propriétaire

- Contexte : aucun fichier LICENSE ; `package.json` indique `UNLICENSED` (tous droits réservés
  par défaut). Les polices sont OFL (redistribution autorisée avec mention).
- Options :
  - **MIT** : permissive, favorise réutilisation et contributions ; n'empêche pas une copie
    commerciale de l'app ; attribution obligatoire.
  - **Propriétaire (tous droits réservés)** : le code est visible sur GitHub mais nul ne peut le
    réutiliser ; à indiquer explicitement dans README et un fichier LICENSE.
  - Intermédiaires possibles : AGPL-3.0 (copyleft fort, oblige à publier les dérivés hébergés),
    PolyForm Noncommercial.
- Décision : **en attente**. Tant qu'elle n'est pas prise, README affiche « Licence : à définir »
  et `package.json` garde `UNLICENSED`.

## ADR-20 — Actions GitHub épinglées par tag majeur (et non par SHA)

- Contexte : un tag majeur (`actions/checkout@v4`) est mutable ; un compte d'action compromis peut
  réécrire le tag et exécuter du code arbitraire sur le runner. L'épinglage par SHA supprime ce
  risque.
- Décision : rester sur les tags majeurs **pour l'instant**, parce que les SHA ne peuvent pas être
  obtenus honnêtement depuis l'environnement d'audit (api.github.com inaccessible derrière le
  mandataire) et qu'un SHA inventé est interdit (D9).
- Conséquences : à convertir en `owner/action@<sha> # vX.Y.Z` lors du premier passage sur une
  machine ayant accès à GitHub ; Dependabot (ADR-18) met à jour les deux formes.
- Portée du risque : ces actions ne touchent ni secret ni code publié en dehors du déploiement ;
  `permissions: contents: read` limite ce qu'un runner compromis pourrait faire.

## ADR-18 — Dependabot hebdomadaire, groupé

- Décision : npm (devDependencies) et github-actions, le lundi, mises à jour mineures/correctifs
  groupées, préfixes `deps`/`ci`. Un bump majeur reste une PR séparée à relire.

## ADR-19 — Captures de la documentation

- Décision : les captures du README sont produites par Playwright (iPhone 13, thème par défaut),
  réduites à 390 px de large, stockées dans `docs/img/` ; elles portent la date de prise et sont
  régénérées à chaque changement visuel notable (script `shoot.mjs` conservé hors dépôt par
  l'auditeur ; à versionner dans `scripts/` si le besoin devient récurrent).
