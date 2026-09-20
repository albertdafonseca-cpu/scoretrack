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
  contredire D7.
- État au 19 septembre 2026 : appliqué — `--fs-1: max(0.75rem, 12px)` (D19), plus aucun sélecteur
  de `css/setup.css` sous 12 px, et l'audit Lighthouse `font-size` vaut **1** sur les 5 exécutions.

## D11 — Le CLS est un défaut, pas un budget à assouplir (rectifié le 18 septembre 2026)

- Contexte : CLS de 0,317 mesuré sur l'écran d'accueil.
- **Rectificatif de l'auditeur.** Le diagnostic initial de cette entrée — « causé par le chargement
  des polices » — était **faux**, et il est rétracté. Mesures de l'agent B : sur 0,317, **0,289
  viennent de la grille de préréglages remplie en JavaScript** (`#presets-grid` : la section passe
  de 41 px à 154 px vers 310 ms) et **0,031 seulement des polices**. Le correctif principal
  appartenait donc à C (réserver la hauteur de la grille, ou rendre les préréglages directement
  dans le HTML), B ne restant responsable que des métriques de police et du préchargement.
- Décision (inchangée) : le budget ne bouge pas — performance ≥ 0,95, CLS ≤ 0,1.
- **Leçon générale, applicable à tous : un correctif ne se décide pas sans avoir mesuré la cause.**
  Une cause plausible n'est pas une cause mesurée ; l'écrire dans ce journal avant de l'avoir
  vérifiée a envoyé le travail au mauvais agent.
- État au 19 septembre 2026 : CLS mesuré **0,018** sur les 5 exécutions Lighthouse (budget tenu).

## D12 — `meta-viewport` : seule dérogation Lighthouse admise

- Décision : `user-scalable=no` est conservé (D7) et l'audit `meta-viewport` reste désactivé dans
  `lighthouserc.json`, avec la justification écrite en ADR-15. Aucun autre audit n'est désactivé, et
  `skipAudits` est vide.

## D13 — Les audits de contraste et de daltonisme tournent réellement en CI

- Contexte : `docs/DECISIONS.md` annonçait ces audits « en CI » alors qu'aucun workflow ne les
  appelait. Une garantie documentée mais non exécutée est un mensonge de documentation.
- Décision : job `design` de `ci.yml` — `npm run audit:contrast` et `npm run audit:cvd` sur `dist/`
  servi localement, rapports en artefact, échec de la construction en cas de régression.
- **État au 19 septembre 2026 (mesure de 14 h) : le job `design` est rouge**, et la documentation le
  dit plutôt que de l'ignorer (D15). `npm run audit:contrast` sort 1 : **40 écarts sur 18 502
  mesures**, tous sur le même élément — le prénom du joueur (`span.pplayer`) — et tous dans les
  quatre états transitoires (butée 12, flash gain 10, flash perte 8, pression 10) de sept thèmes
  (`dark` 8, `nature` 8, `arcade` 5, `sunset` 5, `ocean` 5, `mono` 5, `sobre` 4) ; rapports mesurés
  de 4,10 à 4,70 exclu, pour un seuil de 4,70 (4,5 exigé par D20 + la marge de 0,2 de D21). Aucun
  écart en état stable. Vérifié avant d'attribuer : le script est conforme à D20 — il ne concède 3:1
  qu'au texte de 24 px ou plus (le score), et le prénom, plus petit, reste tenu à 4,5:1 même pendant
  un flash. Ce sont donc de vrais défauts de contraste, **à corriger par B** (couleur du prénom et
  voiles des états transitoires dans ces thèmes) ; ils ne sont pas corrigés à la date de cette
  entrée. F n'a touché à aucun seuil pour faire passer le job.
- Déterminisme (D21) : trois exécutions consécutives le 19 septembre au matin → 40 échecs à chaque
  fois, ensembles strictement identiques ; depuis, B a rendu le nombre de mesures auto-contrôlé
  (« 0 cellule instable, 0 écart de nombre de mesures » dans le rapport).
- `npm run audit:cvd` sort 0 (la paire gain/perte reste distinguable sous les trois simulations).

## D14 — Rien d'annoncé ne reste non câblé

- Décision : les raccourcis `./?action=new` et `./?action=resume` déclarés dans `manifest-st.json`
  doivent être implémentés (lecture de `location.search` au démarrage) ou retirés du manifeste.
- État au 19 septembre 2026 : **câblés** — `js/platform/shortcuts.js` (`applyLaunchAction`, appelé
  par `js/main.js`) lit `location.search` au démarrage et applique `?action=new` / `?action=resume`.

## D15 — Aucune documentation ne décrit un état futur au présent

- Décision : chaque affirmation du README, du journal des décisions, du journal des modifications et
  de l'architecture est vraie à l'instant du commit, chiffres compris (poids, tailles, scores). Ce
  qui n'est pas livré est nommé comme tel, daté, et attribué à un élément.
- Conséquences : les mesures citées dans la documentation portent leur date et la commande qui les
  produit ; un chiffre invérifiable est retiré plutôt qu'arrondi.

## D16 — Un audit doit mesurer ce que l'utilisateur voit réellement

- Contexte : l'audit de contraste lisait une couleur de fond **théorique** (jeton CSS) en ignorant
  les moitiés teintées des zones plus/moins et la texture des cartes. Ses 1600 résultats étaient
  donc faux là où ça compte.
- Décision : tout audit automatique échantillonne les **pixels rendus**, dans les états réels
  (repos, pressé, éliminé). Un audit qui mesure autre chose que ce que l'œil reçoit est un faux
  témoignage, et vaut moins que pas d'audit du tout.
- Conséquences : `scripts/audit-contrast.mjs` capture la page et lit les pixels ; le nombre de
  mesures passe de 1 600 à ~16 500 et le job `design` de la CI s'allonge en proportion.

## D17 — Un test désactivé par défaut n'est pas un test

- Contexte : les assertions fortes des tests visuels étaient conditionnées à une variable
  d'environnement posée nulle part ; un script d'audit sortait en succès malgré trente paires en
  échec.
- Décision : tout contrôle de qualité **échoue par défaut** en cas de régression. Interdiction des
  garde-fous silencieux : pas d'assertion sous condition d'environnement, pas de sortie 0 avec des
  échecs dans le rapport.
- Conséquences pour F : chaque garde-fou de la CI est prouvé par dégradation volontaire avant
  d'être considéré comme livré (voir `docs/SECURITE.md` § 3). Reste une exception **documentée** :
  `audit:cvd` ne fait échouer que sur la paire gain/perte, les écarts de palette étant listés sans
  bloquer, parce que la palette est figée par D1 et que la distinction est portée par des signes
  non chromatiques (D18).

## D18 — Distinction non chromatique obligatoire sur l'écran de jeu

- Contexte : en simulation d'achromatopsie, les douze cartes apparaissent identiques et ne portent
  ni nom ni numéro de siège lisible.
- Décision : chaque carte porte en permanence un identifiant non chromatique (numéro de siège
  et/ou prénom, à une taille suffisante). L'appartenance d'une carte à un joueur ne dépend jamais
  de la couleur. C'est l'application directe de D1.

## D19 — L'échelle typographique passe en unités relatives

- Contexte : l'application cumulait deux verrous — zoom par pincement désactivé (D7) et échelle
  typographique en pixels absolus. Un utilisateur qui agrandit la taille du texte dans les réglages
  de son système n'obtenait **aucun** effet : échec du critère « redimensionnement du texte », et
  la contrepartie posée en D7 s'en trouvait vidée de sa substance.
- Décision : les jetons `--fs-*` passent en `rem`, calés sur une base de 16 px, plancher effectif de
  12 px conservé (D10). Propriétaire : B (`css/tokens.css`) ; les feuilles de A et C suivent.
- Vérification exigée : à 200 % de taille système, l'application reste utilisable, aucun texte
  tronqué, aucune cible sous 44 px, zone de jeu jouable.
- État au 19 septembre 2026 : appliqué — `--fs-1: max(0.75rem, 12px)`.

## D20 — Seuil de contraste en état transitoire, ratifié explicitement

- Contexte : les règles d'accessibilité accordent 3:1 aux grands textes sans condition, et le score
  de l'écran de jeu dépasse largement la taille de grand texte.
- Décision, plus stricte que la norme : **4,5:1 exigé au repos pour tout texte, score compris** ;
  3:1 toléré **uniquement** pendant les états transitoires et brefs (pression, flash, butée). La
  tolérance ne s'applique jamais à un état stable.
- Conséquence de forme : cette règle doit être écrite en toutes lettres dans l'en-tête du script
  d'audit, dans son rapport et ici. Un en-tête qui affirmerait encore « 4,5:1 pour tout texte »
  contredirait le code et tomberait sous D15.

## D21 — Un audit dont le verdict varie d'une exécution à l'autre ne vaut rien

- Contexte : deux passages consécutifs de l'audit de contraste ont donné des ensembles d'échecs
  différant sur onze entrées sur vingt-deux, tous les échecs se situant à moins de 0,3 du seuil.
  Le verdict de la CI était alors tiré au sort.
- Décision : trois exécutions consécutives doivent produire des **ensembles d'échecs identiques** ;
  l'échantillonnage est stabilisé (médiane de plusieurs captures) ; tout élément mesuré à moins de
  0,2 du seuil est traité comme un **défaut de conception à corriger**, pas comme un résultat à
  publier. La même exigence vaut pour **tout** audit automatique du projet.
- Application à Lighthouse (F) : la mesure de performance variait de 0,86 à 0,98 d'une exécution à
  l'autre et le job passait grâce à l'exécution médiane — un vert tiré au sort. Depuis le
  19 septembre 2026, `lighthouserc.json` collecte **5 exécutions** et asserte sur la **pire**
  (`aggregationMethod: pessimistic`) pour les quatre catégories, le CLS, le poids et les audits
  binaires sensibles. Voir ADR-15 pour les mesures.

## ADR-10 — CSP déclarée en `<meta>` (pas d'en-têtes sur Pages)

- Contexte : GitHub Pages n'autorise aucun en-tête HTTP personnalisé.
- Décision : CSP stricte en `<meta http-equiv>` en tête du `<head>` ; `script-src 'self'` sans
  inline ; `style-src 'unsafe-inline'` toléré (styles calculés).
- Conséquences : plus aucun `onclick` inline (table `ACTIONS`) ; `frame-ancestors`/`report-to`
  inapplicables (voir SECURITE § 2.2) ; l'audit Lighthouse `csp-xss` reste informatif.
- Écart **refermé** le 18 septembre 2026 : `base-uri 'none'`, `form-action 'none'`,
  `object-src 'none'` et `worker-src 'self'` sont désormais dans `index.html:11` (vérifié le
  19 septembre). Ces quatre directives ne retombent pas toutes sur `default-src` — `base-uri` et
  `form-action` en sont exclues par la spécification — et devaient donc être déclarées.

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
- Déterminisme (D21) : la mesure de performance variait de 0,86 à 0,98 selon l'exécution, et le job
  passait grâce à l'exécution médiane. Depuis le 19 septembre 2026, la collecte fait **5 exécutions**
  et les assertions portent sur la **pire** (`aggregationMethod: pessimistic`) pour les quatre
  catégories, le CLS, le poids total et les audits binaires sensibles (`font-size`,
  `errors-in-console`, `color-contrast`, `target-size`, `button-name`, `label`).
- **État au 19 septembre 2026 : le job `lighthouse` est rouge**, et il l'est de façon reproductible.
  Mesuré sur `dist/`, 5 exécutions, assertion sur la pire : performance **0,95 / 0,98 / 0,89 / 0,95 /
  0,95 → pire 0,89 < 0,95**, `npm run lhci` sort **1**. Le critique obtient la même chose deux fois
  sur deux, machine calme (0,90 à 0,98). Accessibilité 0,93, bonnes pratiques 1,00, SEO 1,00, CLS
  0,018, `font-size` 1 : tenus. Le seul défaut est le **LCP** — 1,98 s à 3,36 s selon l'exécution —
  attribué à B (préchargement des deux polices du premier rendu, feuilles bloquantes, amorçage).
- Leçon consignée : une précédente version de cette entrée annonçait « `npm run lhci` sort 0 » sur la
  foi d'**une** exécution favorable. Un résultat obtenu une fois n'est pas un résultat ; on n'écrit
  un vert qu'après l'avoir reproduit (trois fois, comme D21 l'exige des audits).

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

## ADR-21 — Contrôle du paquet en liste blanche, et plafond de poids du précache

- Contexte : le contrôle du job `paquet` vérifiait l'absence de sept chemins d'outillage nommés. Il
  n'a donc pas vu quatorze captures de débogage (2,6 Mo) versionnées par erreur à la racine, qui
  seraient parties en production. Une liste noire ne voit que ce qu'elle a prévu.
- Décision : le contrôle est **inversé en liste blanche**. Tout fichier du paquet qui n'est ni une
  entrée du précache, ni un actif déclaré dans `manifest-st.json` (icônes, captures, icônes de
  raccourcis, lues dynamiquement), ni l'un des actifs justifiés un par un dans `ALLOWED_UNCACHED`
  (`.nojekyll`, `sw-st.js`, `favicon.png`, `LICENSES.md`, `sprite.svg`, les deux logos,
  `favicon-32.png`) fait **échouer la construction**. Symétriquement, un actif déclaré mais absent
  du paquet échoue aussi : la liste ne peut pas pourrir sans qu'on le sache.
- Preuve (D17) : sept dégradations volontaires rejouées le 19 septembre 2026, script extrait tel quel
  du YAML — capture de débogage publiée, `package.json` publié, dossier `docs/` publié, capture du
  manifeste absente, entrée de précache absente, plafond abaissé sous le poids courant, emoji dans
  l'interface / `sw-st.js` périmé (rejoués sur copie) — donnent toutes un code 1 ; l'état sain donne 0.
  La même liste, dans le même ordre, figure dans `docs/SECURITE.md` § 3.
- Plafond de poids : `PRECACHE_MAX_BYTES` borne ce que l'utilisateur télécharge à la **première
  visite**, pas le comptage du jour. Il est fixé à **900 000 octets**, ce qui correspond à **18,0 s**
  sur le profil « Slow 3G » des outils de développement Chrome (400 kbit/s, RTT 2 s), **9,6 s** sur le
  profil 3G de Lighthouse (750 kbit/s) et **4,4 s** sur « 4G lente » de Lighthouse (1,6 Mbit/s). Au-delà,
  l'installation initiale dépasse ce qu'un utilisateur attend d'une application qui se présente comme
  légère ; l'app reste utilisable pendant ce téléchargement, qui se fait en arrière-plan après le
  premier rendu (~445 Kio). Poids mesuré le 19 septembre 2026 à 14 h : **744 335 octets** (82,7 %), soit
  14,9 s en Slow 3G — le job `paquet` affiche la valeur exacte à chaque construction.
- Alerte : un avertissement explicite (`::warning::` dans le journal du job `paquet`) est émis dès
  **90 %** du plafond (810 000 octets). Le seuil est placé **au-dessus** du poids courant, sinon
  l'avertissement se déclencherait à chaque construction et ne préviendrait plus personne (esprit de
  D17) : il reste 65 665 octets de marge avant qu'il ne parle, et 155 665 avant l'échec. La première
  piste de réduction si l'alerte se déclenche : sous-ensembles de polices (244 Kio aujourd'hui).

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

## ADR-19 — Captures de la documentation : générées, déterministes, comparées en CI

- Contexte : le README a d'abord embarqué huit captures prises à la main le 16 septembre 2026,
  périmées deux commits visuels plus tard (numéros de siège, rétablissement, icônes cerclées) ; puis
  trois captures du manifeste, dont la légende annonçait douze joueurs sur une image qui en montrait
  quatre, et qu'aucune vérification ne comparait à l'interface. Deux fois de la documentation fausse
  (D15), et une documentation qui n'illustrait ni les prénoms, ni le pavé, ni le récapitulatif, ni
  les thèmes, ni douze joueurs.
- Décision (19 septembre 2026) : une seule source, `scripts/build-screenshots.mjs`, produit **huit
  captures** — les trois du manifeste dans `assets/screenshots/` (accueil, table à 4, tablette) et
  cinq de documentation dans `docs/img/` (prénoms, pavé numérique, récapitulatif, douze joueurs
  nommés, thème clair). Le rendu est rendu déterministe : polices auto-hébergées attendues
  (`document.fonts.status === 'loaded'` avant chaque capture, y compris après un changement de
  thème), animations désactivées, curseur de saisie masqué, service worker bloqué, gestes réels
  par événements tactiles.
- Garde-fou : `npm run check:screenshots` régénère les huit captures dans `test-results/` et échoue
  si un octet diffère des fichiers versionnés ou si l'un manque ; le job `paquet` l'exécute à chaque
  PR. Après tout changement visuel : `npm run build:screenshots` et versionner le résultat.
- Preuves (D17, D21) : trois générations consécutives sous une charge machine de 3,7 à 4,1 →
  **8 captures sur 8 identiques à l'octet** ; un octet ajouté à une capture versionnée → code 1 ;
  état sain → code 0. Une version antérieure du script sans attente des polices avait produit une
  divergence d'anticrénelage sur le thème clair : c'est ce qui a motivé l'attente explicite.
- Limite connue : le rendu dépend du binaire Chromium et de la plateforme. La référence est le
  runner Ubuntu de la CI, avec la version de Playwright du `package-lock.json` (1.56.1, Chromium
  1194). Un contributeur sous macOS ou Windows verra `npm run check:screenshots` **rouge en local**
  (anticrénelage différent) sans que rien ne soit faux : il ne versionne pas ses captures, laisse
  la CI trancher, et s'il doit régénérer, le fait depuis Linux (conteneur Ubuntu, ou l'artefact
  `captures-regenerees` que le job `paquet` publie à chaque écart).
- Montée de version de Playwright : elle change Chromium, donc les octets des huit captures.
  `@playwright/test` est **exclu du groupe Dependabot** (PR dédiée) et sa montée s'accompagne
  obligatoirement de `npm run build:screenshots` dans la même PR — sinon le job `paquet` la refuse,
  ce qui est le comportement voulu.
