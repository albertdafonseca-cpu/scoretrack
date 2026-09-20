# Journal des modifications

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) ; versions selon
[SemVer](https://semver.org/lang/fr/). Les utilisateurs de la PWA reçoivent chaque version publiée
par la bannière de mise à jour ; la « version » visible dans le diagnostic est le hash du service
worker.

## [2.0.0] — Non publié

Refonte complète de la qualité sur la base de l'audit de septembre 2026 (voir
`docs/AUDIT-2026-09.md`). Aucune rupture pour les utilisateurs : les données existantes
(`scoretrack_settings`, `scoretrack_save`, `scoretrack_profiles`) sont lues et migrées, les URL
`sw-st.js` et `manifest-st.json` sont conservées, les anciens caches sont purgés automatiquement.

### Corrigé

- **Mode hors ligne** : le service worker précachait `favicon.png`, absent du dépôt, et ne
  s'installait donc jamais. Précache désormais généré à partir des fichiers réels et vérifié en CI.
- **Injection HTML par les prénoms** (cartes, récapitulatif, profils) : rendu par `textContent`,
  plus aucun gestionnaire `onclick` inline, CSP `script-src 'self'`.
- **Condition de victoire** : atteindre les « points maximum » termine la partie et désigne le
  vainqueur (auparavant le score était seulement plafonné en silence).
- **Politique de confidentialité inexacte** : plus aucune requête vers Google Fonts ; le texte
  redevient vrai.
- Lecture de `window.event` dans « Sauver comme défaut » (exception sous Firefox), fonctions
  mortes (`renderDefPlayers` en double, `syncDefPresets`), groupe d'actions « ouvert » réanimé
  après rechargement, `contextmenu` bloqué globalement.

### Ajouté

- Polices auto-hébergées en WOFF2 (Orbitron, Share Tech Mono, Inter, Press Start 2P, Cinzel,
  Bebas Neue — OFL, `assets/fonts/LICENSES.md`), `font-display: swap`.
- Logo vectoriel, icônes PWA 192/512 et maskable, `apple-touch-icon`, favicons ; manifest complété
  (`id`, `scope`, `lang`, icônes).
- Bannière « Nouvelle version disponible — Mettre à jour » ; le nouveau service worker n'interrompt
  jamais une partie.
- Sauvegarde atomique de la partie (`.tmp` → bascule), conservation de la dernière sauvegarde
  valide (`.prev`), quarantaine d'une sauvegarde illisible (`.corrupt`) proposée à la reprise au
  lieu d'un effacement silencieux, écritures coalescées, `navigator.storage.persist()`.
- Journal d'erreurs local (`scoretrack_errors`, borné, jamais transmis) et fonction de diagnostic
  `exportDiagnostics()` (version du service worker, navigateur, quota, journal). Elle n'est pas
  encore reliée à un bouton de l'interface : l'accès se fait par la console (voir
  `docs/EXPLOITATION.md` § 5).
- Export / import des données en JSON (validation stricte, jamais d'écrasement partiel).
- Journal d'actions v2 (`js/core/history.js`) : une entrée par modification atomique ; annulation
  par inversion, rétablissement (`redo`) et retour à un point de l'historique (`jumpTo`) câblés dans
  l'écran de jeu ; classement avec ex æquo (`ranking`) dans le récapitulatif.
- Placement des cartes sans cellule vide de 1 à 12 joueurs (`js/core/layout.js`), cartes centrales
  orientées.
- Animations isolées dans `js/fx/` (roulement du score, transition FLIP à la rotation, anneau
  d'appui long, confettis de victoire, ajustement des tailles) — toutes coupées sous
  `prefers-reduced-motion`.
- Icônes SVG (`currentColor`) à la place des emojis système ; couleurs sémantiques gain/perte
  daltonien-safe (bleu/orange) doublées d'un glyphe.
- Accessibilité : rôles et noms accessibles, focus visible, navigation clavier (puces, modales avec
  piège de focus, Échap), région live d'annonces, cibles ≥ 44 px, `prefers-reduced-motion`.
- Retour haptique (`navigator.vibrate`) : motifs distincts, préférence utilisateur respectée.
- Outillage : ESLint, Prettier, Vitest (+ couverture), Playwright (iPhone 13 tactile, axe-core),
  scripts de génération (`build-sw`, `build-icons`, `fetch-fonts`), audits contraste et CVD.
- CI GitHub Actions (lint, unit, e2e, Lighthouse avec budget, audit des dépendances), déploiement
  GitHub Pages par workflow, Dependabot, `.editorconfig`.
- Documentation : README, CONTRIBUTING, SECURITY, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`,
  `docs/EXPLOITATION.md`, `docs/SECURITE.md`, `docs/AUDIT-2026-09.md`.
- `css/critical.css` et `css/deferred.css` (`scripts/build-css.mjs`, `npm run build:css` /
  `check:css`) : les neuf feuilles sources sont fusionnées en une feuille critique (chargée en
  bloquant, nécessaire au premier écran) et une feuille différée (activée après la première
  trame). Corrige le job `lighthouse`, rouge depuis le 19 septembre à cause du délai d'affichage
  du plus grand élément (LCP 1,98–3,36 s pour neuf feuilles bloquantes de 111 Ko) : ramené à
  1,80–2,26 s, performance 0,98–0,99 sur trois séries de 5 exécutions pessimistes reproduites
  indépendamment. Les neuf sources restent la vérité et gardent leurs propriétaires ; les deux
  fichiers générés ne sont jamais modifiés à la main (`docs/ARCHITECTURE.md` § 5 bis).
- Les neuf feuilles CSS sources ne sont plus précachées ni publiées, n'étant plus référencées
  par rien d'exécuté (`scripts/build-sw.mjs`, `PRECACHE_EXCLUDE` ; `npm run build:dist`) :
  CSS embarqué ramené de 184 296 à 72 456 octets, précache total ramené à 712 174 octets
  (52 entrées), soit 111 840 octets économisés (`docs/DECISIONS.md`, ADR-21).

### Modifié

- `index.html` (106 Ko monolithique : CSS, JS et 39 `onclick` inline) découpé en une coquille de
  structure (38 Ko au 19 septembre 2026, sans une ligne de script ni de style inline), neuf feuilles
  CSS et des modules ES natifs (`js/core`, `js/ui`, `js/platform`, `js/fx`).
- Schéma de sauvegarde versionné : v0 (historique, sans version) → v1 (types assainis) → v2
  (journal d'actions) ; migrations testées sur fixtures.
- Service worker : cache `st-<hash>` versionné par le contenu, purge de `st-v1`/`st-fonts-v1`,
  navigation servie depuis le cache avec page hors ligne intégrée, réseau d'abord pour les
  ressources non précachées.

### Connu et non livré (au 19 septembre 2026)

Un travail d'intégration continue est **rouge** sur l'arbre courant et le reste tant que la ligne
ci-dessous n'a pas disparu ; il n'est pas rendu vert par un réglage.

- **Contraste (job `design`)** : `npm run audit:contrast` sort 1 — 40 écarts sur 18 502 mesures,
  tous sur le prénom du joueur (`span.pplayer`) pendant les états transitoires (appui, flash,
  butée), rapports de 4,10 à 4,69 pour 4,70 exigé, dans sept thèmes (`dark`, `nature`, `arcade`,
  `sunset`, `ocean`, `mono`, `sobre`). Appartient à B ; non corrigé. `docs/DECISIONS.md` D13.
- Fragilité de la mesure de performance : même corrigée (voir « Ajouté », 20 septembre), la mesure
  reste sensible à la charge de la machine ; un vert n'est tenu pour acquis qu'après trois passages
  consécutifs en agrégation pessimiste (D21).
- `exportDiagnostics()` (version du service worker, navigateur, quota, journal d'erreurs) n'est
  relié à aucun bouton de l'interface : l'accès se fait par la console, voir
  `docs/EXPLOITATION.md` § 5.
- Licence non choisie : `package.json` porte `UNLICENSED` en attendant la décision du propriétaire
  (`docs/DECISIONS.md`, ADR-17).
- Actions GitHub épinglées par tag majeur et non par empreinte (ADR-20).

### Supprimé

- Dépendance à `fonts.googleapis.com` / `fonts.gstatic.com`.
- Pile d'annulation par instantanés JSON (`undoStack`), remplacée par le journal v2 (l'ancien
  format reste lu à la migration).

## [1.0.0] — 2026-04-18

- Version initiale : PWA mono-fichier, 1 à 12 joueurs, préréglages, 14 thèmes, sauvegarde de la
  partie en cours, politique de confidentialité intégrée.

[2.0.0]: https://github.com/albertdafonseca-cpu/scoretrack/compare/3452b66...master
