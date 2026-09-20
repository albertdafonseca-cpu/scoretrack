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
