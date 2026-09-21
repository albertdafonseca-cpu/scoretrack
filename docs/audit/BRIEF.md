# BRIEF — Audit qualité AAA de ScoreTrack (v2, base réelle `main`)

Document de pilotage pour la suite d'agents constructeurs/critiques. Toute
décision numérotée ci-dessous (Dn) est définitive : un agent ne la remet pas
en question, il l'applique. Une décision ne se déplace qu'avec une nouvelle
entrée numérotée qui l'amende explicitement, jamais par suppression silencieuse.

## 0. Pourquoi ce document existe (contexte, à ne pas rouvrir)

Un premier audit complet (méthodologie identique à celle décrite plus bas) a
été mené sur un instantané isolé du projet (commit `3452b66`), en JavaScript
natif sans build. Pendant cet audit, cinq fusions indépendantes ont eu lieu
sur la vraie branche par défaut `main` : migration TypeScript complète, moteur
de dés 3D en Three.js, dix-huit langues d'interface, export PDF. L'instantané
audité ne représente donc plus le produit réel. Sur instruction explicite de
l'utilisateur (« Reprends l'audit avec les nouvelles données »), cet audit
reprend intégralement sur la base réelle de `main`. L'ancien travail est
conservé sans être perdu sur la branche `archive/audit-aaa-obsolete-js-monolithe`
mais ne s'applique plus telle quelle : ce brief le remplace.

## 1. Décisions verrouillées héritées de `CLAUDE.md` (projet) — non négociables

- **D-CLAUDE-1 — Moteur de dés 3D figé visuellement.** `CLAUDE.md` documente des
  choix explicitement arbitrés et validés par l'utilisateur : 14 types de dés,
  pipeline de géométrie unifié, rayon d'arrondi arêtes/sommets 0.18 plafonné à
  30 % du plus petit rayon inscrit, approche solide de Catalan pour d48/d60/d120
  avec facteur de sphérisation t=1 (d48) et t=0.85 (d120), formule de
  dimensionnement des plaques numériques avec bornes et ajustement polygonal
  pour les petites plaques, pose du d4 à 30° de lacet avec rayon d'arrondi 0.18
  (alternatives déjà essayées et rejetées), conventions d10/d100 (le zéro est
  écrit pour les dizaines « 10 », le résultat du d100 est un total de points,
  jamais un pourcentage), feuille du lanceur de dés à hauteur fixe 88dvh avec
  seul l'historique défilant, fermeture par tapotement du fond ou glissement
  vers le bas aux mêmes seuils (120px / 0,3px·ms) que le pavé numérique.
  Rendus validés : d2, d3, d6, d8, d10, d12, d20, d24, d30.
  **Portée pour cet audit : aucune modification esthétique sans demande
  explicite.** Seule la qualité d'ingénierie est de notre ressort : robustesse
  géométrique, typage, gestion d'erreurs, testabilité, performance de rendu —
  jamais l'apparence, l'angle, le rayon, les proportions ou les couleurs.
- **D-CLAUDE-2 — Accessibilité daltonienne par luminance.** Toute distinction
  d'information par la couleur doit rester lisible en luminance (contraste),
  jamais seulement par la teinte. Convention déjà en vigueur sur le moteur de
  dés ; à généraliser au reste de l'interface, jamais à contredire.

## 2. Préférences permanentes de l'utilisateur (rappel, ne pas rouvrir)

- **D-PREF-1** — Toute création/document doit être adapté aux daltoniens tout
  en restant joli (pas de solution uniquement fonctionnelle et moche).
  Concrètement : distinction non chromatique obligatoire (forme, texte, motif,
  icône) partout où la couleur porte une information, y compris dans les
  rapports d'audit et les captures de preuve.
- **D-PREF-2** — Toute décision clairement actée est mémorisée et ne doit
  jamais être re-débattue par un agent futur ; seul un amendement numéroté
  explicite peut la faire évoluer.
- **D-PREF-3** — En cas de demande imprécise de l'utilisateur (pas d'un
  agent constructeur/critique entre eux), poser jusqu'à 3 questions de
  clarification plutôt que de deviner.

## 3. Méthodologie (héritée de l'audit v1, reconduite à l'identique)

1. **Un élément = un agent constructeur.** Le périmètre fichiers de chaque
   élément est défini en section 5 (contrat de propriété) pour permettre le
   travail en parallèle sans collision d'édition.
2. **Un agent critique indépendant par élément.** Le critique ne modifie
   jamais le code. Il doit prouver chaque verdict par une mesure, une capture,
   un test reproductible — zéro crédit pour une affirmation non prouvée. Il
   doit tenter une mutation testing minimale : casser volontairement le code
   pour vérifier qu'un test censé le couvrir échoue réellement (un test qui ne
   peut structurellement pas échouer ne vaut rien — D17 de l'audit v1,
   reconduite ici).
3. **Boucle constructeur ↔ critique jusqu'à AAA.** Le critique rend un verdict
   « AAA : oui/non » avec justification. Si non, il liste des défauts précis
   et actionnables ; le constructeur corrige ; nouvelle passe. On continue
   jusqu'à « AAA : oui ».
4. **Comparaison à l'aveugle contre le marché.** Une fois AAA atteint sur les
   critères internes, le critique compare à l'aveugle le résultat face à une
   application de référence du même type (compteur de score / lanceur de dés
   grand public) et déclare laquelle est la meilleure, sans savoir laquelle
   est ScoreTrack. Tant que ScoreTrack ne gagne pas la comparaison, la boucle
   continue.
5. **Règles de mesure (héritées, D16/D21 de l'audit v1) :** mesurer les pixels
   rendus réels, jamais une valeur théorique ; tout verdict non déterministe
   entre deux exécutions est jugé invalide — exiger 3 exécutions identiques
   consécutives et traiter une valeur proche du seuil comme un défaut, pas
   comme une réussite.
6. **Aucune prescription de correctif sans mesure de la cause réelle**
   (leçon D11 de l'audit v1 : un correctif basé sur une hypothèse non vérifiée
   a corrigé le mauvais composant une fois ; toujours mesurer la cause avant
   d'assigner un correctif).

## 4. Constat initial (résumé — détail complet dans `CONSTAT-INITIAL.md` archivé)

**P0 (bloquant) :**
1. Politique de confidentialité fausse : `index.html` affirme n'aucune collecte
   de données alors que Google Fonts et jsPDF (CDN cdnjs) sont contactés à
   l'exécution, et même précachés par le service worker.
2. Injection HTML par nom de joueur non neutralisé : `src/game.ts:510` et 5
   autres constructions `innerHTML` interpolent des données utilisateur sans
   échappement générique (seule l'apostrophe est protégée).
3. Aucun test, aucune CI, aucun lint : `npm run check` ne fait que typechecker
   et construire.

**P1 (majeur) :**
4. Accessibilité quasi nulle : 1 seul attribut aria/role dans tout
   `index.html`, 65 `onclick` inline, textes jusqu'à 4px.
5. État mutable global dispersé : `src/game.ts` (1988 lignes) mélange état,
   réglages, logique, rendu de carte, récapitulatif ; state partagé via
   `window._*` (voir `src/globals.d.ts`).
6. jsPDF chargé par CDN sans figeage de version dans le dépôt, absent hors
   ligne au premier lancement (documenté comme défaut connu dans `CLAUDE.md`).
7. Émojis système comme icônes (💀 🏆 🔒), rendu non maîtrisé selon plateforme.

## 5. Découpage en éléments et contrat de propriété des fichiers

| # | Élément | Fichiers en propriété exclusive | Rôle |
|---|---|---|---|
| A | Fondation & outillage (tests, lint, CI, sécurité build) | `package.json` (scripts/devDeps seulement), `tsconfig*.json`, `.eslintrc*`/`eslint.config.*`, `.github/workflows/*`, nouveaux `vitest.config.ts`/`playwright.config.ts`, `docs/audit/A-*.md` | Poser l'outillage de test/lint/CI absent aujourd'hui, sans lequel aucun autre élément n'est vérifiable durablement |
| B | Logique de jeu & sécurité applicative | `src/game.ts`, `src/types.ts`, `src/dom.ts`, `src/globals.d.ts`, `docs/audit/B-*.md` | Corriger l'injection HTML, découpler l'état global, couvrir par tests unitaires |
| C | Moteur de dés 3D (qualité d'ingénierie uniquement) | `src/dice3d/*`, `src/dice-ui.ts`, `docs/audit/C-*.md` | Robustesse/typage/tests géométriques — **zéro changement visuel** (D-CLAUDE-1) |
| D | Interface, accessibilité, i18n | `index.html`, `src/i18n.ts`, `src/i18n/translations.ts`, `src/icons.ts`, `src/animations.ts`, `src/splash.ts`, `docs/audit/D-*.md` | Aria/roles, contraste, tailles de police, cohérence des 18 langues |
| E | PWA, dépendances externes, vie privée | `src/sw.ts`, `src/sw-worker.ts`, `src/recap-pdf.ts`, section confidentialité de `index.html` (coordination avec D), `docs/audit/E-*.md` | Rendre la politique de confidentialité exacte, traiter la dépendance jsPDF/Fonts |
| F | CI/CD, déploiement, documentation | `vercel.json`, `build.mjs`, `.gitignore`, `README.md` (à créer si absent), `docs/audit/F-*.md`, rapport final | Fiabiliser le pipeline de build/déploiement et documenter l'état réel |

Chaque élément a son propre fichier de décisions `docs/audit/DECISIONS-<lettre>.md`
et ses verdicts critiques `docs/audit/<lettre>-critique-round<N>.md`.

## 6. Définition AAA pour cet audit

Un élément est AAA quand, simultanément :
- Le critique indépendant ne trouve plus aucun défaut P0/P1 reproductible.
- Toute correction est couverte par un test qui échoue si on annule le
  correctif (mutation testing minimale, cf. §3.2).
- La comparaison à l'aveugle contre une application de référence du marché
  place ScoreTrack au moins à égalité, idéalement au-dessus, sur le critère
  jugé.
- Aucune régression sur les décisions verrouillées (D-CLAUDE-1, D-CLAUDE-2,
  D-PREF-1/2/3).
- `npm run check` (typecheck + build) reste vert.

## 7. Journal des décisions (Dn) — vide au démarrage, alimenté au fil de l'audit

(À compléter par chaque agent au fur et à mesure ; numérotation continue,
jamais réutilisée même si une décision est amendée.)

- **D1** — Élément A : `typescript` rétrogradé de `^7.0.2` à `^6.0.3`
  (devDependency, `npm run typecheck` revérifié vert à l'identique après coup)
  car `typescript-eslint` 8.70 (dernière stable, seule ligne compatible ESLint
  10) refuse explicitement de démarrer avec TypeScript ≥ 7. TS 6.0.3 est la
  version stable la plus récente dans la plage acceptée par son peerDependency
  (`>=4.8.4 <6.1.0`). Décision réversible dès que `typescript-eslint` supporte
  TS 7 (voir `docs/audit/DECISIONS-A.md`, élément A, pour le détail).
- **D2** — Élément A : lint ESLint volontairement en analyse de syntaxe
  (pas de linting « type-aware ») pour la même raison que D1 : impossible
  d'activer `parserOptions.project`/`projectService` sans revenir sur le choix
  ci-dessus de façon plus large. À revisiter avec D1.
- **D3** — Élément A : test e2e Playwright ajouté (`npm run test:e2e`) mais
  volontairement absent du pipeline CI GitHub Actions (qui n'exécute que
  install/lint/typecheck/tests unitaires/build) — un runner CI n'a pas
  Chromium préinstallé et l'ajouter alourdirait une CI que la mission veut
  minimale. Reste disponible en local/manuel pour tout élément qui en a
  besoin ; à intégrer en CI plus tard si un élément le juge utile.
- **D4** — Élément F : `.gitignore` complété avec `test-results/` et
  `playwright-report/` (Playwright, dette signalée par l'élément A dans
  `docs/audit/DECISIONS-A.md`), `coverage/` (Vitest, par anticipation),
  `.vercel/` (CLI Vercel) et `.DS_Store`. Voir `docs/audit/DECISIONS-F.md` §1.
- **D5** — Élément F : `README.md` créé (absent auparavant) — installation,
  scripts npm réels, déploiement, structure des dossiers, rien de non
  vérifié. Voir `docs/audit/DECISIONS-F.md` §2.
- **D6** — Élément F : `build.mjs` — mesuré réellement qu'un échec d'une des
  deux cibles esbuild (`src/main.ts`→`dist/app.js`, `src/sw-worker.ts`→
  `dist/sw.js`) faisait déjà sortir le script avec un code non nul dans les
  deux sens (pas de masquage silencieux constaté). Corrigé malgré tout pour
  plus de robustesse : les deux cibles sont désormais construites en
  parallèle (`Promise.allSettled`) pour rapporter toutes les erreurs en un
  passage (au lieu de s'arrêter à la première), avec message explicite par
  cible en échec et `process.exit(1)` explicite. Revérifié réellement après
  correctif (erreur de syntaxe temporaire injectée puis restaurée, `git
  diff` vide confirmé). Voir `docs/audit/DECISIONS-F.md` §3.
- **D7** — Élément F : `vercel.json` — ajout d'en-têtes de sécurité HTTP
  (X-Content-Type-Options, X-Frame-Options, Referrer-Policy,
  Permissions-Policy, Content-Security-Policy) calibrés sur les origines
  externes réellement contactées (`fonts.googleapis.com`/`fonts.gstatic.com`,
  `cdnjs.cloudflare.com` pour jsPDF, `data:`/`blob:` pour les icônes/manifeste
  générés par `src/icons.ts`). CSP validée réellement (serveur HTTP local +
  Playwright avec écouteur `securitypolicyviolation`), pas seulement écrite :
  0 violation après ajustement. `'unsafe-inline'` conservé en `script-src`/
  `style-src` tant que les 65 `onclick` inline et le `<style>` inline
  d'`index.html` existent (P1 #4, hors de mon périmètre) — défense en
  profondeur complémentaire au correctif d'échappement HTML attendu de
  l'élément B (P0 #2), pas un substitut. `DECISIONS-B.md` n'existait pas
  encore au moment de cette décision. Voir `docs/audit/DECISIONS-F.md` §4
  pour le détail et la recommandation de resserrement une fois E/D auront
  retiré les dépendances CDN.
- **D8** — Élément F : absence de licence dans `package.json` (P1 documenté
  au constat initial) — recommandation seulement, non appliquée : hors de
  mon périmètre d'édition (`package.json` = élément A). Voir
  `docs/audit/DECISIONS-F.md` §5.
- **D9** — Élément A : correction des deux défauts P2 relevés par le critique
  indépendant (`docs/audit/A-critique-round1.md`, round 1, verdict AAA:oui) :
  (1) `tests/dom.test.ts` — la fixture du test de `root` pour `$$`/`$q`
  plaçait tous les `.item` à l'intérieur de `#list`, donc une implémentation
  qui ignorerait totalement `root` passait le test sans être détectée ;
  ajout d'un `.item` hors de `#list` pour que `$$('.item', list)` diverge
  réellement de `$$('.item')` en cas de régression — mutation testing
  indépendant rejoué (root ignoré → échec confirmé, restauré, `git diff`
  vide). (2) ajout de `"pretest:e2e": "npm run build"` (npm exécute
  automatiquement un script `pre<nom>` avant `<nom>`) pour que
  `npm run test:e2e` ne teste plus silencieusement un `dist/` périmé —
  vérifié réellement (`dist/app.js` supprimé, `npm run test:e2e` le
  régénère avant de lancer les tests). Voir `docs/audit/DECISIONS-A.md`
  §« Corrections round 1 » pour le détail.
- **D10** — Élément E : jsPDF n'est plus chargé par CDN (P0 #1 et P1 #6 du
  constat initial) : `npm install jspdf@4.2.1` (dépendance npm, version
  exacte figée — même convention que `three`), importé directement dans
  `src/recap-pdf.ts` (`import { jsPDF } from 'jspdf'`) et bundlé par
  esbuild comme `three`. Plus de `window.jspdf` ni de garde
  « jsPDF non chargé ». Mesuré réellement : `dist/app.js` passe de 801,7 Ko
  à 1 633 Ko (jsPDF bien inclus). Couvert par un test unitaire réel
  (`tests/recap-pdf.test.ts`, inspection de source anti-régression +
  génération d'un vrai PDF avec espion réseau qui ferait échouer le test au
  moindre `fetch`) et un test e2e Playwright réel
  (`e2e/pdf-export-offline.spec.ts`, export PDF vérifié hors ligne via
  `context.setOffline(true)`, PDF téléchargé validé par son en-tête
  `%PDF-`). **Action requise, hors de mon périmètre** : `index.html`
  contient encore la balise `<script src="https://cdnjs.cloudflare.com/
  ajax/libs/jspdf/2.5.1/jspdf.umd.min.js">` (ligne 1363), désormais inutile
  mais qui continue de déclencher une vraie requête réseau à chaque
  ouverture — à supprimer par l'élément D. Voir `docs/audit/DECISIONS-E.md`
  §1 pour le texte exact et la preuve (test e2e rouge pour cette seule
  raison, confirmé en supprimant la ligne sur une copie non committée de
  `dist/index.html`).
- **D11** — Élément E : Google Fonts (P0 #1, deuxième moitié) — auto-
  hébergement complet préparé plutôt que simplement documenté. Neuf
  familles utilisées par `index.html` téléchargées depuis les URLs
  `fonts.gstatic.com` réellement servies (25 fichiers `.woff2` uniques,
  560 Ko au total) et placées dans un nouveau répertoire `/fonts/` à la
  racine du dépôt (hors du périmètre fichier strict de l'élément E, mais
  sans collision avec aucun périmètre déclaré — voir la note de périmètre
  en tête de `docs/audit/DECISIONS-E.md`), avec une feuille `fonts/
  fonts.css` locale identique à celle de Google (mêmes `unicode-range`/
  poids/`font-display`, seuls les `url()` pointent en local). Vérifié
  réellement par Playwright (serveur HTTP local, câblage appliqué sur une
  copie non committée de `dist/`) : polices effectivement chargées
  (`document.fonts` → `loaded` pour les graisses utilisées), zéro requête
  externe. **Action requise, hors de mon périmètre** : 2 lignes dans
  `index.html` (élément D, remplacer l'`@import` Google Fonts par
  `<link rel="stylesheet" href="./fonts/fonts.css">`) et 1 ligne dans
  `build.mjs` (élément F, `cpSync('fonts', 'dist/fonts', {recursive:true})`)
  — extraits exacts et texte de politique de confidentialité honnête
  (variante avec/sans auto-hébergement) dans `docs/audit/DECISIONS-E.md`
  §2/§4. Une fois câblé, ceci referme aussi la recommandation de
  resserrement de la CSP notée en D7 (`vercel.json`, élément F) pour
  `fonts.googleapis.com`/`fonts.gstatic.com`/`cdnjs.cloudflare.com`,
  puisque plus aucune des deux origines externes ne serait contactée.
- **D12** — Élément E : `src/sw-worker.ts` — suppression du cache CDN
  jsPDF devenu inutile (`CDN_CACHE`/`CDN_URLS`/`CDN_HOSTS` et la branche
  fetch associée) et correction d'une incohérence déjà repérée au constat
  initial : `FONT_CSS_URLS` précachait une URL Google Fonts
  (`Orbitron:wght@700`+`Share+Tech+Mono`+`Exo+2:wght@400;600`) qui ne
  correspondait à AUCUNE police réellement utilisée par l'app (« Exo 2 »
  n'existe nulle part ailleurs dans le code ; six familles réellement
  utilisées — Inter, Press Start 2P, Cinzel, Bebas Neue, Ballet, Permanent
  Marker, Dancing Script — étaient absentes du précache) : corrigée pour
  correspondre exactement à l'`@import` actuel d'`index.html`. `STATIC`
  liste aussi, par anticipation et sans risque (précache tolérant), les 25
  chemins de polices auto-hébergées de D11. Voir `docs/audit/DECISIONS-E.md`
  §3.
- **D13** — Élément B : injection HTML par nom de joueur (P0 #2 du constat
  initial) corrigée aux 5 points d'interpolation non protégée trouvés dans
  `src/game.ts` (`renderProfileChips` : reconstruction complète par DOM,
  plus d'attribut `onclick` construit à partir du nom ; `buildCard` ×3
  variantes et `showRecap` : nouvelle fonction `escapeHtml` dans
  `src/dom.ts`). Aucun changement d'interface `window` pour C/D. Extraction
  de `computeClampedScore` (fonction pure, testée) pour dédupliquer le
  plafonnement de score entre `adjust()` et `confirmScoreModal()`. Voir
  `docs/audit/DECISIONS-B.md` pour le détail, les preuves de mutation
  testing, et un défaut d'outillage cross-cutting découvert en cours de
  route (`tsconfig.test.json`/`src/i18n.ts` : conflit de types
  `number`/`NodeJS.Timeout` dès qu'un test importe `src/game.ts` ou
  `src/i18n.ts` — hors du périmètre de B, correctif suggéré aux éléments A/D
  dans `DECISIONS-B.md` §4, contourné pour mes propres tests via
  `tests/support/loadGame.{js,d.ts}`).
- **D14** — Élément C : fuite mémoire GPU réelle sur les dés reconstruits
  (`src/dice-ui.ts`) — `renderer.dispose()` (three@0.149) ne libère jamais
  lui-même les géométries/matériaux/textures (vérifié en lisant le code
  source : `WebGLProperties.dispose()` remplace juste sa `WeakMap` interne,
  sans `gl.deleteBuffer`/`gl.deleteTexture`) ; la libération réelle reposait
  entièrement sur `forceContextLoss()`, un no-op silencieux si l'extension
  `WEBGL_lose_context` est indisponible. Nouvelle fonction
  `_disposeSceneResources(scene)` : dispose explicitement chaque
  géométrie/matériau/texture de la scène avant destruction, sauf les
  textures marquées `userData.shared` (cache `_numTexCache` de
  `src/dice3d/die.ts`, réutilisées par tous les dés vivants — les disposer
  casserait l'affichage des chiffres des autres dés encore affichés).
  Couvre aussi un oubli distinct : le sol de la scène (`ShadowMaterial` +
  `PlaneGeometry`) n'était référencé nulle part pour disposal. **Zéro
  changement visuel** : 16 captures Playwright/swiftshader (14 types de dés +
  aperçu multi-dés + résultat de lancer, RNG figé pour la reproductibilité)
  identiques **octet pour octet** avant/après, 3 exécutions consécutives
  reproductibles. Voir `docs/audit/DECISIONS-C.md` §1.1/1.2/§4.
- **D15** — Élément C : même défaut cross-cutting que celui documenté par
  l'élément B en D13 (`tsconfig.test.json`, `"types":["node"]`, atteint
  transitivement par les tests → `setTimeout()` résout en `NodeJS.Timeout` au
  lieu de `number`), rencontré indépendamment dans `src/dice-ui.ts`
  (`_diceRollGuard`). Corrigé localement avec
  `ReturnType<typeof setTimeout>` plutôt que `number`, sans toucher à
  `tsconfig.test.json` (hors périmètre C). Convergence à noter pour A/D :
  deux éléments indépendants (B et C) ont buté sur le même symptôme dans
  deux fichiers différents. Voir `docs/audit/DECISIONS-C.md` §1.4.
- **D16** — Élément C : fuite DOM sur `_cardBgHex` (`src/dice3d/die.ts`) —
  la sonde `<div>` temporaire (mesure de la couleur de fond d'une carte
  joueur pour teinter le corps du dé) n'était retirée qu'en chemin heureux ;
  une exception en cours de route (`getComputedStyle`, `.match()`) laissait
  un `<div>` orphelin dans `<body>`, jusqu'à 10× par dé construit. Corrigé
  par `try/finally`. Voir `docs/audit/DECISIONS-C.md` §1.3.
- **D17** — Élément C : 47 tests unitaires ajoutés
  (`tests/dice3d.color.test.ts`, `tests/dice3d.geometry.test.ts`,
  `tests/dice3d.dispose.test.ts`) sur les fonctions pures du moteur de dés
  (colorimétrie/luminance D-CLAUDE-2, extraction/appariement des faces,
  rayon d'arrondi plafonné D-CLAUDE-1, solides d'Archimède, libération de
  ressources) — zéro test préexistant sur `src/dice3d/*`/`src/dice-ui.ts`
  avant cet élément. 8 mutations testées (cassées puis restaurées), chacune
  confirmée en échec avant restauration (D17 de l'audit v1 : aucun test ne
  peut structurellement pas échouer). Aucune dépendance npm ajoutée. Voir
  `docs/audit/DECISIONS-C.md` §3.
- **D18** — Élément D : les 2 actions P0 obligatoires du handoff de
  l'élément E appliquées dans `index.html` — balise `<script>` CDN jsPDF
  résiduelle (ligne 1363) supprimée, `@import` Google Fonts remplacé par
  `<link rel="stylesheet" href="./fonts/fonts.css">` (polices auto-hébergées
  déjà livrées par E dans `/fonts/`). Revérifié réellement : le test e2e de
  E (`e2e/pdf-export-offline.spec.ts`), rouge à cause de cette seule ligne,
  passe maintenant au vert ; nouveau test
  `e2e/fonts-self-hosted.spec.ts` confirme 0 requête réseau vers
  `fonts.googleapis.com`/`fonts.gstatic.com` au chargement. **Point de
  vigilance pour l'intégration finale** : `build.mjs` (élément F) ne copie
  pas encore `fonts/` vers `dist/fonts/` (action D11/D-E§2.2 déjà spécifiée
  par E) — sans ce `cpSync`, `dist/fonts/fonts.css` répond 404 en
  production réelle (régression visuelle silencieuse, pas une fuite,
  l'app retombant sur les polices système). Voir `docs/audit/DECISIONS-D.md`
  §1.
- **D19** — Élément D : politique de confidentialité (`privacyIntro`,
  Variante A proposée par E en `DECISIONS-E.md` §4, puisque D18 rend
  l'affirmation vraie) corrigée dans les 18 langues de
  `src/i18n/translations.ts`. Langues à confiance de traduction réduite
  signalées : `ar`, `ja`, `ko`, `zh` (nuances de registre les moins sûres) ;
  confiance modérée pour `ru`, `tr`, `fi`, `sv`, `da`, `nb`. Revérifié avec
  `tests/translations.test.ts` (élément A) : 4/4 verts, aucune clé
  manquante dans aucune langue. Voir `docs/audit/DECISIONS-D.md` §2.
- **D20** — Élément D : accessibilité généralisée à `index.html` (P1 #4 du
  constat initial, 1 seul attribut aria/role dans tout le fichier
  auparavant) : rôles ARIA (`dialog`/`alertdialog`, `aria-live="assertive"`
  sur les annonces de fin de partie) sur les 7 boîtes de dialogue/overlays
  principales, `aria-label` traduit dynamiquement (7 nouvelles clés i18n
  dans les 18 langues) sur les 12 boutons ne portant qu'une icône/un
  symbole, `aria-hidden` sur les icônes purement décoratives, focus clavier
  visible (`:focus-visible`) généralisé, tailles de texte illisibles
  remontées (7px/8px/9px → 9-10px, 8 sélecteurs, aucune casse de mise en
  page vérifiée par capture d'écran), coche non chromatique ajoutée sur le
  seul bouton où deux états opposés (Gain/Perte) ne se distinguaient que
  par la couleur (D-CLAUDE-2/D-PREF-1) — les autres distinctions par
  couleur de l'interface (chips/cartes sélectionnées) ont déjà, à l'audit,
  une vraie différence de luminance et/ou une coche existante, donc
  laissées telles quelles. `#elim-anim-skull{font-size:4px}` volontairement
  non modifié (état de départ d'une animation JS, pas un texte lu au repos).
  5 nouveaux tests e2e (`e2e/accessibility-basics.spec.ts`), chacun
  mutation-testé manuellement (règle cassée puis restaurée, échec confirmé
  avant restauration). Voir `docs/audit/DECISIONS-D.md` §3.
- **D21** — Élément D : émojis système comme icônes (💀 🏆 🔒 🏁 ☠️, P1 #7
  du constat initial) — **dette documentée, non traitée** : `src/icons.ts`
  ne contient aucune icône SVG équivalente, et la plupart des occurrences
  sont assignées dynamiquement par `src/game.ts` (élément B) et
  `src/recap-pdf.ts` (élément E), hors du périmètre de l'élément D ; un
  remplacement partiel limité à `index.html` créerait une incohérence
  (l'icône changerait de style en cours de partie). Nécessite un tour
  coordonné B+D+E. Voir `docs/audit/DECISIONS-D.md` §4.
- **D22** — Élément D : correctif du défaut cross-cutting documenté par
  l'élément B en D13/`DECISIONS-B.md` §4, dans la partie qui était de mon
  périmètre : `src/i18n.ts:160`, `FlashBtn._flashTimer` retypé
  `ReturnType<typeof setTimeout> | null` (au lieu de `number | null`) —
  l'erreur `TS2322` correspondante sous `tsc -p tsconfig.test.json` a bien
  disparu, revérifié avant/après. Les erreurs restantes du même programme
  (`src/game.ts`/`src/animations.ts` : `window._xxx` introuvable ;
  `src/i18n.ts:22` : `navigator.userLanguage`) partagent une racine commune
  identifiée indépendamment : `src/globals.d.ts` (augmentation ambiante,
  élément B) n'est jamais inclus dans le programme
  `tsconfig.test.json` (`tests/**/*.ts` + `e2e/**/*.ts` uniquement) tant
  qu'aucun fichier de ce programme ne le référence explicitement — un
  `import` de valeur ne suffit pas à tirer une augmentation globale.
  Correctif possible dans `tsconfig.test.json` (élément A) ou
  `src/globals.d.ts` (élément B), ni l'un ni l'autre dans mon périmètre.
  Voir `docs/audit/DECISIONS-D.md` §7.
- **D23** — Intégration : le bloc mort Google Fonts (`FONT_CSS_URLS`,
  `FONT_HOSTS`, la branche `fetch` associée) laissé dans `src/sw-worker.ts`
  par l'élément E a été retiré. Ce bloc contactait réellement
  `fonts.googleapis.com` à chaque installation du service worker — un vrai
  P0 (confidentialité), trouvé indépendamment par les critiques des
  éléments E et F au round 1 (aucun test Playwright classique ne le
  détecte : les fetch émis depuis un service worker n'apparaissent pas dans
  `page.on('request')`/`context.route()`). Ajout de
  `tests/sw-worker.test.ts` : inspection de source (aucun hôte tiers connu
  référencé) + exécution réelle du fichier compilé dans un bac à sable
  minimal, qui échoue si l'installation demande une URL absolue. Les deux
  angles ont été mutation-testés (bloc réintroduit temporairement →
  échec confirmé des deux tests → restauré, `git diff` vide).
- **D24** — Intégration : le poids initial de `dist/app.js` (1,6 Mo, dont
  jsPDF ~800 Ko) relevé en P1 par le critique de l'élément E n'est **pas**
  résolu par un chargement différé (`import()` dynamique). Étudié et rejeté
  après mesure : la chaîne de build actuelle (`build.mjs`, esbuild, format
  IIFE, un seul fichier de sortie) ne permet pas de découpage de code réel
  sans passer en modules ES avec `splitting: true` (changement de
  l'architecture de build, hors de portée d'un correctif d'intégration).
  Une alternative testée en pensée — charger `recap-pdf.ts`/jsPDF depuis un
  second fichier injecté par balise `<script>` au moment du clic — a été
  écartée : `e2e/pdf-export-offline.spec.ts` (déjà vert, contrat déjà
  vérifié par la critique de l'élément E) part hors ligne immédiatement
  après le tout premier chargement de la page, avant toute activation du
  service worker — un chargement différé par le réseau échouerait alors à
  coup sûr, un régression jugée pire que le poids actuel du bundle. Décision
  assumée : garder l'import statique de jsPDF (voir commentaire dans
  `src/recap-pdf.ts`), au prix du poids de bundle, pour préserver la
  garantie d'export PDF hors ligne dès la première visite. Un futur tour
  pourrait rouvrir ce compromis en migrant tout le build vers l'ESM avec
  découpage de code ET un précache de service worker qui couvre le nouveau
  chunk avant la première coupure réseau — hors de portée ici.
- **D25** — Élément C, round 2 : réponse à `docs/audit/C-critique-round1.md`
  (verdict round 1 : AAA non, 1 P1 + 2 P2, zéro régression visuelle déjà
  confirmée indépendamment). P1 corrigé : `catalanDie` n'était jamais
  exercé avec son paramètre `onSphere` non trivial — celui qui porte
  EXACTEMENT la sphérisation verrouillée du d48 (t=1) et du d120 (t=0,85)
  par D-CLAUDE-1 ; le critique a démontré qu'aucun des 79 tests d'alors ne
  détectait une mutation sur `t`. Nouveau describe dans
  `tests/dice3d.geometry.test.ts` (5 tests) : mesure quantitative de
  l'écart-type des rayons des sommets (silhouette bosselée vs ronde),
  vérifié monotone en `t`, plus un test de bout en bout sur
  `dieGeometryFor(48)`/`dieGeometryFor(120)` qui attraperait un échange des
  arguments entre les deux cas. La mutation exacte du critique (`t*0.1`) est
  désormais détectée (confirmé non détectée avant l'ajout, détectée après).
  Les deux P2 sont traités en nuançant la documentation (pas en rouvrant la
  mesure) : `DECISIONS-C.md` §1.1 et le commentaire de `_disposeSceneResources`
  ne présentent plus le correctif de fuite mémoire GPU comme une fuite
  « réelle dans tous les cas » mais comme une bonne pratique dont l'effet
  mesuré (par le critique) est dans le bruit quand `WEBGL_lose_context` est
  disponible (environnement de test prescrit par `CLAUDE.md`) et net mais
  modeste seulement quand l'extension est indisponible ; le garde-fou div/0
  de `catalanDie` est désormais explicitement noté comme non couvert par
  mutation testing sur les 5 solides réels (`DECISIONS-C.md` §1.5), écarté du
  décompte de mutations testées. Zéro régression visuelle réintroduite :
  16/16 captures identiques octet pour octet à `index.html` constant (une
  comparaison temporelle naïve avait d'abord montré une différence sur
  `rolled-d20`, tracée à un changement d'`index.html`/polices par un autre
  élément entre-temps, pas à ce correctif — comparaison refaite avec un
  `git stash` scopé aux seuls fichiers de l'élément C pour isoler la cause).
  `npm run typecheck`/`lint`/`test` (87/87)/`build` tous revérifiés verts.
  Voir `docs/audit/DECISIONS-C.md` §8 pour le détail complet.
- **D26** — Élément D, round 2 : réponse à `docs/audit/D-critique-round1.md`
  (verdict round 1 : AAA non, 2 P1 + 1 P2 ; le P0 relevé — fetch mort vers
  Google Fonts dans `src/sw-worker.ts` — était hors de mon périmètre et déjà
  corrigé par l'orchestrateur avant ce round, commit `eb73132`). Cause exacte
  du P1-1 (aucun focus visible sur `.go-btn` malgré `:focus-visible` qui
  matchait) diagnostiquée par isolation : `.go-btn{transition:all 0.18s}`
  anime aussi `outline`/`box-shadow`, retardant l'apparition du focus de
  180 ms — invisible sur une capture prise sans délai après `Tab` (piège de
  mesure reproduit puis expliqué). Corrigé par `transition-duration:0s`
  dans la règle `:focus-visible` elle-même (la CSS Transitions spec résout
  la durée d'après le style *après* le changement d'état). P1-2 (aucune
  gestion clavier des 7 boîtes `dialog`/`alertdialog`) implémenté dans
  `src/animations.ts` (`initDialogA11y`) sans toucher `game.ts`/`dice-ui.ts` :
  focus déplacé à l'ouverture, piège de focus, Échap — en réutilisant tel
  quel les fonctions de fermeture déjà exportées de ces deux modules
  (`closeScoreModal`, `cancelElim`, `cancelEndgame`, `closeDice`), ou le
  geste déjà utilisé ailleurs (`classList.add('hidden')`) pour
  `reset-modal`/`recap` qui n'ont pas de fonction dédiée ; `winner-modal`
  volontairement sans fermeture Échap (aucun « Annuler » n'existe pour
  cette boîte, inventer un mécanisme aurait contredit la consigne). P2
  (contraste chip mono-light mesuré à 2,93:1) corrigé en réutilisant
  `--accent` du même thème comme `--chip-on` (4,28:1 mesuré). Les 3
  correctifs vérifiés sur les pixels/comportement réellement rendus
  (Playwright), chacun mutation-testé (régression réintroduite puis
  confirmée détectée par le test, restaurée). Aucune régression sur le
  geste de fermeture par glissement du lanceur de dés (seuils 120px/
  0,3px·ms, CLAUDE.md) : `src/dice-ui.ts` non modifié, `git diff --stat`
  vide confirmé, tout comme `game.ts`/`dom.ts`/`globals.d.ts`/`dice3d/*`.
  `npm run typecheck`/`lint`/`test` (87/87)/`build`/`playwright test`
  (12/12) tous revérifiés verts. Voir `docs/audit/DECISIONS-D.md` §10 pour
  le détail complet.
- **D27** — Élément G (round 3, post-clôture, voir §8) : les 65 attributs
  `onclick="..."` d'`index.html` (P1 #4 du constat initial, dette non
  bloquante laissée par D/F) remplacés par un câblage `addEventListener`
  explicite dans `src/main.ts` (aucun mécanisme générique par `data-action`
  — chaque élément câblé nommément, même principe que `deleteProfile` de
  l'élément B). 4 `id` ajoutés à des éléments qui n'en avaient pas
  (`row-single-winner`, `bar-rotate-btn`, `bar-recap-btn`, `bar-theme-btn`),
  aucun autre changement de structure/contenu/style. `Object.assign(window,
  handlers)` conservé (dette documentée, §12 de `DECISIONS-G.md`) : un test
  e2e existant hors périmètre (`e2e/pdf-export-offline.spec.ts`, élément E)
  en dépend encore ; mesuré sans incidence sur la CSP resserrée (une
  affectation de propriété par un script externe déjà autorisé n'est pas un
  attribut d'évènement inline). `grep -c 'onclick=' index.html` → `0`.
  `npm run typecheck`/`lint`/`test` (87/87)/`build` tous verts.
  14 nouveaux tests e2e (`e2e/onclick-wiring.spec.ts`) couvrant chaque
  écran/parcours, 3 mutations testées (cassées puis restaurées, échec
  confirmé avant restauration, catégories distinctes : appel simple,
  transmission d'évènement réel, argument littéral d'un appel composé).
  Zéro régression visuelle (captures identiques octet pour octet, RNG figée
  pour le lanceur de dés) ; les 9 tests d'accessibilité de l'élément D
  (rôles ARIA, focus visible, piège de focus/Échap) revérifiés verts sans
  modification. Une fois tout ceci vert : `'unsafe-inline'` retiré de
  `script-src` dans `vercel.json` (`style-src` conservé, hors périmètre) et
  vérifié par un nouveau test e2e committé (`e2e/csp-script-src.spec.ts`,
  en-têtes lus dynamiquement depuis `vercel.json`, écouteur
  `securitypolicyviolation` sur un parcours complet incluant l'export PDF
  et le lanceur de dés) : 0 violation CSP, 0 erreur JS ; mutation testée
  (`'unsafe-inline'` réintroduit → le test échoue, restauré). Voir
  `docs/audit/DECISIONS-G.md` pour le détail complet (inventaire exhaustif
  des 65 cas, dette restante).
- **D28** — Correction de décompte dans D27, relevée par le critique de
  l'élément G (`G-critique-round1.md`, verdict AAA : oui, 3 P2 sans impact
  fonctionnel) : il y a bien **5** `id` ajoutés, pas 4 (`bar-reset-btn`
  manquait au décompte de D27, bien que déjà câblé et mentionné dans le
  corps de `DECISIONS-G.md`) ; et **9** occurrences restantes de
  `.onclick=` dynamique hors périmètre, pas 8 (l'addition 6+2+1 du texte
  d'origine était fausse). Comportement réel non affecté dans les deux cas
  (mesuré, pas supposé) — corrections purement documentaires, appliquées
  dans `docs/audit/DECISIONS-G.md` §2/§4 ; D27 n'est pas réécrit, cette
  entrée l'amende conformément à la règle du préambule de ce document.

- **D29** — Élément H (round 4, post-clôture) : les émojis système utilisés
  comme icônes fonctionnelles (🏆 victoire, 🏁 fin de manche / dernier
  perdant, 💀 élimination, 🔒 confidentialité — P1 #7 du constat initial,
  dette documentée en D21) remplacés par de vraies icônes SVG inline
  dessinées à la main, un seul nouveau fichier (`src/ui-icons.ts`, séparé
  d'`icons.ts` qui reste dédié à l'icône d'app/favicon/manifest — deux
  responsabilités différentes). 4 silhouettes structurellement distinctes
  (trophée à anses/socle, drapeau à damier, crâne à orbites/nez/dents,
  cadenas à anse/trou de serrure), toutes en `currentColor` (sauf le
  damier, volontairement achromatique noir/blanc-transparent, cohérent
  avec un vrai drapeau à damier) : distinction vérifiée par capture
  Playwright désaturée (`filter:grayscale(100%)`) — les 4 formes restent
  individuellement reconnaissables en niveaux de gris (D-CLAUDE-2/D-PREF-1).
  `src/recap-pdf.ts` : émojis remplacés par un dessin vectoriel minimaliste
  via l'API de dessin de jsPDF (`doc.triangle`/`doc.circle`/`doc.rect`), pas
  par du texte ni par un SVG (sans rendu fiable dans un PDF) ; pas d'icône
  « drapeau » ajoutée là où aucune distinction champion/finisher n'existait
  déjà (pas un manque introduit par ce chantier). Cas particulier du
  cadenas : `src/i18n/translations.ts` (18 langues, hors périmètre, élément
  D) préfixe encore sa traduction par l'émoji — neutralisé à l'exécution
  par un `MutationObserver` posé dans `src/game.ts` (aucune modification
  d'`i18n.ts`/`translations.ts`), qui remplace ce préfixe par l'icône SVG
  dès qu'il apparaît, quel que soit l'appelant (`loadSettings()` au
  démarrage ou le sélecteur de langue d'`i18n.ts`). `#elim-anim-skull`
  (☠️, `src/animations.ts`) volontairement non traité : état de départ
  d'une animation JS (agrandissement calculé), hors périmètre d'édition de
  ce chantier — documenté comme dette pour un futur tour qui aurait mandat
  sur `animations.ts`. 26 nouveaux tests unitaires (`tests/ui-icons.test.ts`,
  `tests/game.icons.test.ts`) + 7 tests e2e
  (`e2e/functional-icons.spec.ts`, build réel + Chromium, parties
  réellement jouées jusqu'à victoire/élimination) ; 3 mutations testées
  (cassées puis restaurées, échec confirmé avant restauration : polarité
  `victoryIcon`, point de code de l'émoji surveillé, mapping icône↔état sur
  la tuile d'élimination — cette dernière détectée à la fois en unitaire et
  en e2e). `npm run typecheck`/`lint` (0 erreur, même total d'avertissements
  qu'avant)/`test` (113/113)/`build` tous verts ; les 35 tests e2e
  (28 préexistants + 7 nouveaux) tous verts sans modification des specs
  existantes. Voir `docs/audit/DECISIONS-H.md` pour le détail complet,
  l'inventaire exhaustif des 16 occurrences trouvées et la dette restante.
- **D30** — Élément H, round 2 : réponse à `docs/audit/H-critique-round1.md`
  (verdict round 1 : AAA non, 3 P1 + 1 P2). P1-1 (aucun test sur
  l'association icône↔statut de `src/recap-pdf.ts`, une inversion trophée/
  crâne passait 113 tests unitaires + 35 e2e) : mapping extrait en fonction
  pure exportée `statusIconKind()`, testée directement et via un vrai
  `exportRecapPDF()` dont les appels `doc.circle`/`doc.triangle` sont
  espionnés (nouveau `tests/recap-pdf.icons.test.ts` + façade
  `tests/support/loadRecapPdf.{js,d.ts}`) ; 2 mutations testées (dispatch
  inversé façon critique, puis `statusIconKind` elle-même inversée), les
  deux détectées, restaurées. P1-2 (distinction non chromatique protégée
  par aucun test répétable, une mutation géométrique du cadenas — corps
  quasi circulaire, anse réduite — passait le test de « signature » du
  round 1 sans broncher) : nouveau `e2e/icon-shape-metrics.spec.ts`,
  rastérisation réelle des 4 icônes à 24×24 px (taille d'usage) et mesure
  de 8 propriétés géométriques (couverture d'encre, aspect de la boîte
  englobante, centre de masse, répartition par quadrant), seuil de distance
  minimale entre chaque paire fixé avec marge sous le minimum réel mesuré
  (0,276) ; reproduction fidèle de la mutation du critique itérée jusqu'à
  confirmer un cas réaliste détecté (distance 0,197 < seuil 0,20), restauré.
  P1-3 (`#elim-anim-skull`, l'émoji le plus visible de toute l'app pendant
  l'animation d'élimination) : périmètre étendu à `src/animations.ts`
  uniquement pour ce remplacement (voir §9) — traité SANS modifier ce
  fichier (`git diff --stat` vide confirmé), le mécanisme existant
  (`fontSize` dynamique + `.ui-icon{width:1em;height:1em}`) fonctionnant
  à l'identique pour un `<svg>` que pour le glyphe emoji qu'il remplace ;
  2 lignes changées dans `index.html` (markup + `color:#fff` pour garantir
  la visibilité, ce conteneur n'ayant pas de fond de secours contrairement
  aux modales). Dette découverte et documentée sans être traitée (hors
  mandat strict) : deux autres occurrences d'émojis dans
  `src/animations.ts` (☠️ en particules canvas dans `spawnFragments`, et
  🏁 dans une autre animation, jamais inventorié au round 1). P2-1 (crâne
  PDF peu lisible à l'échelle réelle d'impression, 96 dpi) : orbites et nez
  agrandis dans `drawSkullIcon`, crâne rendu légèrement plus grand que le
  trophée (3,2 mm vs 2,6 mm) ; revérifié par la même méthode que le
  critique (PDF réel régénéré, crop en pixels natifs sans interpolation).
  `npm run typecheck`/`lint` (0 erreur, même total)/`test` (118/118)/
  `build` tous verts ; `npx playwright test` 37/37 verts sur 3 exécutions
  consécutives (un échec isolé non reproductible d'un test préexistant sans
  rapport, sous exécution parallèle, écarté après nouvelles exécutions
  toutes vertes). Voir `docs/audit/DECISIONS-H.md` §10 pour le détail
  complet et les preuves de mutation testing.

## 8. Élément G (round 3, post-clôture) — retrait des `onclick` inline

Les six éléments A-F ont chacun atteint AAA (§7 ci-dessus). Sur demande
explicite de l'utilisateur après clôture de l'audit, un septième chantier
ciblé traite un point de dette documenté comme non bloquant à l'époque
(P1 #4 du constat initial, note de l'élément F dans `docs/AUDIT-V2.md`) :
les 65 attributs `onclick="..."` statiques d'`index.html` empêchent de
retirer `'unsafe-inline'` de `script-src` dans la CSP de `vercel.json`
(confirmé : aucun `<script>` inline dans `index.html`, seulement
`<script src="dist/app.js">` — les attributs `onclick` sont la seule
raison restante). Le `<style>` inline (P1 #4, `style-src 'unsafe-inline'`)
n'est PAS dans le périmètre de ce chantier, uniquement les `onclick`.

Périmètre exclusif de cette tâche : `index.html`, `src/main.ts`,
`vercel.json` (CSP uniquement, en toute fin de tâche une fois les onclick
retirés), `docs/audit/DECISIONS-G.md`, `docs/audit/G-critique-round*.md`.
Ne touche à aucun autre fichier (`game.ts`, `dice-ui.ts`, `animations.ts`,
`i18n*`, `sw*.ts`, `recap-pdf.ts`, `dice3d/*`, `build.mjs`, `.gitignore`,
`README.md`, `package.json`, tests existants sauf ajout de nouveaux tests).

## 9. Élément H (round 4, post-clôture) — émojis système remplacés par des icônes SVG

Sur demande explicite de l'utilisateur, suite du traitement de la dette
documentée : les émojis système utilisés comme icônes fonctionnelles
(🏆 victoire, 🏁 fin de manche, 💀 élimination, 🔒 confidentialité — P1 #7
du constat initial) ont un rendu non maîtrisé selon la plateforme/l'OS et
sont incohérents avec le reste de la charte visuelle du projet (le moteur
de dés notamment). Contrairement aux éléments A-G, ce chantier touche du
code réparti dans plusieurs fichiers pour une seule et même décision
visuelle cohérente (le style des 4 icônes) : il est donc confié à UN SEUL
agent constructeur plutôt que découpé en plusieurs (éviter une incohérence
de style entre 3 agents qui dessineraient chacun leur propre icône).

Contrainte D-PREF-1/D-CLAUDE-2 (rappel, non négociable) : les icônes
doivent rester distinguables sans la couleur (forme claire, pas seulement
une pastille colorée) et être adaptées aux daltoniens tout en restant
jolies — cohérentes avec l'esthétique sombre/nette déjà en place (voir le
moteur de dés, non modifiable, comme référence de style à égaler, pas à
copier littéralement).

Périmètre : `index.html`, `src/game.ts`, `src/recap-pdf.ts`, `src/icons.ts`
(ou un nouveau fichier `src/ui-icons.ts` si plus propre), nouveaux tests,
`docs/audit/DECISIONS-H.md`, `docs/audit/H-critique-round*.md`.

**Extension de périmètre pour le round 2** (suite au verdict AAA : non de
`H-critique-round1.md`) : `src/animations.ts` est ajouté au périmètre
autorisé, mais UNIQUEMENT pour remplacer `#elim-anim-skull` (☠️, l'émoji le
plus visible de toute l'app pendant l'animation d'élimination, mécanisme de
dimensionnement déjà prouvé réutilisable par le même commit) — aucune autre
modification d'`animations.ts` n'est dans le mandat.

**Extension de périmètre pour le round 3** (suite au verdict AAA : non de
`H-critique-round2.md`, qui a trouvé un contournement du test de distance
géométrique ET deux émojis supplémentaires très visibles jamais
inventoriés) : `src/animations.ts` reste dans le périmètre, cette fois
UNIQUEMENT pour les deux points précis relevés par le critique :
1. `spawnFragments`/`animateFragments` (fragments de l'explosion
   d'élimination, dessinés sur `<canvas>`, PAS en DOM) : `☠️`
   (☠️) dessiné ~28 fois par élimination via `fillText` — à remplacer par un
   petit dessin vectoriel canvas (chemins/arcs, pas de texte emoji),
   cohérent avec la silhouette du crâne déjà établie dans `src/ui-icons.ts`.
2. L'animation du finisher (`_FIN_RACERS`, voitures 🏎️) a DÉJÀ un rendu
   vectoriel de secours entièrement dessiné (`_finEmojiOk` false → une
   silhouette de F1 complète par chemins canvas, déjà présente dans le
   code) pour les plateformes sans emoji couleur — il suffit de forcer ce
   chemin vectoriel en permanence et de retirer la détection
   `_finEmojiOk`/la branche emoji devenue inutile, pas de dessiner une
   nouvelle icône.
Aucune autre modification d'`animations.ts` n'est dans le mandat (ne touche
pas à la timing, aux autres animations, ni au reste du fichier).
