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
  sémantique ; script `scripts/audit-cvd.mjs` (simulation CVD) et `audit-contrast.mjs` en CI.

## D2 — Zéro dépendance à l'exécution, zéro bundler

- Contexte : projet léger, pérenne, hébergé sur GitHub Pages ; un build fragilise et opacifie.
- Décision : modules ES natifs et CSS séparés, servis tels quels depuis la racine du dépôt ; npm
  uniquement pour lint, tests, génération.
- Conséquences : « deploy from branch » fonctionne toujours ; le workflow Pages ne fait que
  filtrer l'outillage ; `npm audit --omit=dev` audite un arbre vide ; pas de minification (le poids
  total reste < 512 Ko, asserté par Lighthouse).

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
  texte (≥ 11 px CSS, chiffres lisibles à 1 m), `prefers-reduced-motion` respecté.
- Conséquences : l'audit Lighthouse `meta-viewport` (poids 10/72) échoue **structurellement** ; la
  catégorie accessibilité plafonne à 0,86. Le budget CI asserte donc chaque audit d'accessibilité
  individuellement à 1 et désactive `meta-viewport` (ADR-15).

## D8 — Niveau visé : meilleur compteur de score du marché

- Décision : la grille `RUBRIC.md` (recherche) et le protocole de comparaison à l'aveugle font foi ;
  un critère n'est « AAA » que prouvé (capture, mesure, sortie de test).

## D9 — Aucune donnée fictive, aucun identifiant de modèle IA

- Décision : pas de scores, captures ou mesures inventés dans les livrables ; ni le code, ni les
  commits, ni les docs ne mentionnent d'identifiant de modèle d'IA.

## ADR-10 — CSP déclarée en `<meta>` (pas d'en-têtes sur Pages)

- Contexte : GitHub Pages n'autorise aucun en-tête HTTP personnalisé.
- Décision : CSP stricte en `<meta http-equiv>` en tête du `<head>` ; `script-src 'self'` sans
  inline ; `style-src 'unsafe-inline'` toléré (styles calculés).
- Conséquences : plus aucun `onclick` inline (table `ACTIONS`) ; `frame-ancestors`/`report-to`
  inapplicables (voir SECURITE § 2.2) ; l'audit Lighthouse `csp-xss` reste informatif.

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

## ADR-15 — Budget Lighthouse et exception documentée

- Décision : `lighthouserc.json` à la racine, collecte mobile ×3 sur `http-server` local
  (port 8799), agrégation médiane ; budget : performance ≥ 0,95, best-practices ≥ 0,95, SEO ≥ 0,9,
  accessibilité ≥ 0,86 **et** chaque audit d'accessibilité à 1 sauf `meta-viewport` (D7) ;
  `font-size` = 1, `errors-in-console` = 1, CLS ≤ 0,1, poids total ≤ 512 Ko.
- Lighthouse ≥ 12 n'a plus de catégorie « PWA » ni d'audit `installable-manifest` :
  l'installabilité est garantie par le test e2e `pwa.spec.js` (manifest valide, SW actif, hors
  ligne), pas par LHCI.
- `uses-text-compression`, `is-on-https`, `redirects-http`, `uses-http2` sont ignorés : ils
  dépendent de l'hébergeur (Pages compresse et sert en HTTPS/HTTP2), pas du dépôt.
- `@lhci/cli` appelé par `npx` avec version épinglée plutôt qu'ajouté aux devDependencies
  (≈ 300 paquets transitifs pour un outil de mesure).

## ADR-16 — Déploiement Pages par GitHub Actions

- Décision : `deploy-pages.yml` (push sur `master` + manuel) empaquette le dépôt sans outillage
  dans `dist/` (`tar` avec liste d'exclusion explicite), `configure-pages` → `upload-pages-artifact`
  → `deploy-pages`, environnement `github-pages`, permissions minimales, aucun secret.
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

## ADR-18 — Dependabot hebdomadaire, groupé

- Décision : npm (devDependencies) et github-actions, le lundi, mises à jour mineures/correctifs
  groupées, préfixes `deps`/`ci`. Un bump majeur reste une PR séparée à relire.

## ADR-19 — Captures de la documentation

- Décision : les captures du README sont produites par Playwright (iPhone 13, thème par défaut),
  réduites à 390 px de large, stockées dans `docs/img/` ; elles portent la date de prise et sont
  régénérées à chaque changement visuel notable (script `shoot.mjs` conservé hors dépôt par
  l'auditeur ; à versionner dans `scripts/` si le besoin devient récurrent).
