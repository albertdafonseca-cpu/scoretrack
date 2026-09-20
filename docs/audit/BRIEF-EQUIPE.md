# BRIEF COMMUN — Audit & montée en qualité ScoreTrack (septembre 2026)

Tu fais partie d'une équipe de sous-agents pilotée par un auditeur principal. Lis ce brief EN ENTIER avant d'agir.

## 1. Le projet (état initial, commit 3452b66)

- Dépôt : /home/user/scoretrack, branche `claude/audit-qualite-aaa-lmthte` (ne jamais changer de branche, ne jamais committer toi-même sauf instruction explicite : l'auditeur principal commit).
- ScoreTrack = PWA mono-fichier de comptage de scores pour jeux de société/cartes (1 à 12 joueurs), UI en français.
  Écrans : splash → setup (préréglages, nb joueurs, points de départ, max, scores négatifs) → noms → écran de jeu (cartes tactiles orientées vers chaque joueur, tap + / −, appui long = pavé numérique, élimination à 0, vainqueur = dernier survivant) → récap, undo (appui long = répétition), rotation des sièges, reset. Réglages : 14 thèmes. Politique de confidentialité intégrée (stockage local uniquement).
- Stack : HTML/CSS/JS vanilla, zéro dépendance, zéro build, zéro test, zéro CI. `index.html` (106 Ko, 1675 lignes), `manifest-st.json`, `sw-st.js`. Hébergement statique (GitHub Pages présumé). PAS de backend, PAS d'auth, PAS de serveur.
- Captures de référence AVANT travaux : /tmp/claude-0/-home-user-scoretrack/600391ed-7dfc-5cbd-85c8-2b4a98249abe/scratchpad/baseline/*.png (script : scratchpad/shoot.mjs).

## 2. Décisions déjà prises (ne pas rediscuter)

D1. Palette daltonien-safe obligatoire partout : couleurs des joueurs = palette Paul Tol « bright/vibrant » (déjà en place, à conserver). Toute information portée par une couleur DOIT aussi être portée par un signe non-chromatique (glyphe +/−, icône, forme, texte, position). Gain/perte : ne jamais reposer sur vert/rouge seuls.
D2. Zéro dépendance runtime, zéro bundler. Le dépôt doit rester servable tel quel depuis sa racine par un hébergeur statique (GitHub Pages « deploy from branch »). Modules ES natifs (`<script type="module">`) et fichiers CSS séparés sont autorisés. Les outils de dev (npm) ne servent qu'au lint, aux tests, aux scripts de génération.
D3. Conserver les noms de fichiers `sw-st.js` et `manifest-st.json` (les PWA déjà installées y sont liées). Le nouveau SW doit purger les anciens caches (`st-v1`, `st-fonts-v1`) et prendre la main (skipWaiting + clients.claim) pour que les utilisateurs existants reçoivent la mise à jour.
D4. Vie privée : aucune donnée ne quitte l'appareil. Corollaire : les polices Google (fonts.googleapis.com / gstatic) doivent être auto-hébergées (fuite d'IP vers Google, jurisprudence LG München 2022, et dépendance réseau). Aucun analytics, aucun CDN.
D5. Compatibilité des données : les clés localStorage `scoretrack_settings`, `scoretrack_save`, `scoretrack_profiles` existantes doivent rester lisibles (migration de schéma avec numéro de version, jamais de perte de partie en cours).
D6. Langue : UI, docs, commentaires et messages de commit en français ; identifiants de code en anglais.
D7. `user-scalable=no` est conservé sur l'écran de jeu (un pinch-zoom accidentel en pleine partie est inacceptable) ; en contrepartie, tous les textes doivent respecter les tailles minimales et l'app doit respecter `prefers-reduced-motion`.
D8. Le zoom de qualité visé = « le meilleur compteur de score du marché » (Carbon, Lifelinker, Keep Score, Scorekeeper, compteurs Skyjo/Uno) : sensation tactile, lisibilité à 1 m de distance sur une table, 60 fps, zéro bug, hors-ligne parfait, accessibilité AA.
D9. Aucune donnée fictive dans les livrables. Aucun identifiant de modèle IA dans le code, les commits ou les docs.

## 3. Arborescence cible (propriété par élément — ne modifie QUE tes fichiers, sauf accord de l'auditeur)

```
index.html                    # coquille HTML (fondation, puis C pour setup/noms, A pour écran de jeu)
sw-st.js, manifest-st.json    # élément E
css/fonts.css                 # assets (polices auto-hébergées)
css/tokens.css css/themes.css # élément B
css/base.css css/setup.css    # élément C
css/game.css css/modals.css   # élément A
css/motion.css                # élément A
js/main.js                    # fondation (bootstrap, câblage des modules)
js/core/*.js                  # logique pure sans DOM (élément D) : rules.js, history.js, layout.js, save-schema.js, format.js
js/ui/dom.js                  # helpers DOM sûrs (escape, h(), qs) — fondation
js/ui/setup.js js/ui/names.js js/ui/settings.js   # élément C
js/ui/game.js js/ui/modals.js js/ui/recap.js js/fx/*.js  # élément A
js/platform/storage.js js/platform/sw-client.js js/platform/errors.js js/platform/haptics.js  # élément E
assets/fonts/*.woff2 assets/icons/*.svg icons/*.png   # assets / élément B
tests/unit/*.test.js (vitest) tests/e2e/*.spec.js (playwright)  # élément D (+ chaque élément ajoute ses tests)
scripts/*.mjs                 # génération (précache SW, icônes, audit contraste)
.github/workflows/*.yml docs/*.md README.md  # élément F
package.json eslint.config.js .prettierrc playwright.config.js vitest.config.js .gitignore  # fondation
```

## 4. Environnement technique

- Node 22, npm 10. Playwright 1.56.1 global avec Chromium dans /opt/pw-browsers (PLAYWRIGHT_BROWSERS_PATH déjà défini ; NE PAS lancer `playwright install`). Épingle `@playwright/test@1.56.1`.
- Serveur statique local : `npx http-server -p 8765 -s .` (déjà lancé sur http://localhost:8765/ ; relance-le si besoin).
- Les polices Google échouent dans le sandbox (certificat proxy) : c'est normal, les captures utilisent les polices de secours tant que les polices ne sont pas auto-hébergées.
- Réseau sortant : npm registry OK, fonts.googleapis.com OK via curl. GitHub Pages injoignable d'ici.
- Fichiers temporaires : uniquement dans /tmp/claude-0/-home-user-scoretrack/600391ed-7dfc-5cbd-85c8-2b4a98249abe/scratchpad/<ton-nom>/.

## 5. Définition de « AAA » (grille du critique)

Un élément est AAA quand un critique très dur, comparant à l'aveugle avec la meilleure app du marché sur le même critère, préfère ScoreTrack ou ne peut pas trancher. Critères :

1. Zéro défaut fonctionnel sur les cas limites (1 et 12 joueurs, noms de 18 caractères, scores à 7 chiffres, négatifs, élimination, undo x40, rotation, restauration après rechargement, hors-ligne).
2. Rendu : cohérence typographique, hiérarchie, alignements au pixel, aucune police de secours visible, aucun emoji système (rendu variable selon OS) dans l'interface finale — icônes SVG.
3. Mouvement : chaque interaction a une réponse < 100 ms, animations à ressort/ease crédibles, 60 fps mesurés, `prefers-reduced-motion` respecté, retour haptique quand disponible.
4. Accessibilité : contraste AA (4.5:1 texte, 3:1 UI) sur les 14 thèmes, cibles tactiles ≥ 44 px, focus visible, navigation clavier, rôles ARIA corrects, lisible en simulation protanopie/deutéranopie/tritanopie.
5. Robustesse : aucune erreur console, aucune exception non gérée, sauvegarde atomique, récupération d'une sauvegarde corrompue, mise à jour PWA signalée à l'utilisateur.
6. Code : modules courts, logique pure testée, aucune duplication, aucune fonction morte, lint propre.
   Le critique doit PROUVER ses verdicts : captures Playwright, mesures (contraste calculé, timings), sorties de tests. Pas d'impression.

## 6. Règles de collaboration

- Ne casse jamais la suite de tests des autres : lance `npm run check` (lint + unit + e2e) avant de rendre la main.
- Rapport final de chaque agent : ≤ 40 lignes, en français : ce qui a été fait, preuves (chemins des captures/mesures), ce qui reste NON AAA et pourquoi.

## 7. Décisions d'arbitrage de l'auditeur (vague 3) — prévalent sur toute décision antérieure contraire

D10. **Plancher typographique porté de 11 px à 12 px.** Le plancher à 11 px était incompatible avec l'audit `font-size` de Lighthouse et, surtout, avec la lisibilité à 1 m visée par D8. Tous les textes rendus doivent mesurer au moins 12 px (jeton `--fs-1`). Les jetons de B sont décalés en conséquence ; aucune exception, y compris les libellés de la barre d'action et les mentions légales.
D11. **Le décalage cumulé de mise en page (CLS) est un défaut, pas un budget à assouplir.** Le CLS de 0,33 mesuré sur l'écran d'accueil provient du chargement des polices : il se corrige par `size-adjust`/`ascent-override` dans `css/fonts.css`, préchargement (`<link rel=preload>`) des deux polices du premier rendu, et réservation de la hauteur des blocs. Le budget Lighthouse ne bouge pas (performance ≥ 0,95, CLS ≤ 0,1).
D12. **`user-scalable=no` est conservé** (D7) et l'audit `meta-viewport` reste désactivé dans le budget, avec justification écrite. C'est la seule dérogation Lighthouse admise.
D13. **Les scripts d'audit `audit-contrast.mjs` et `audit-cvd.mjs` doivent réellement tourner en intégration continue** et faire échouer la construction en cas de régression. Une garantie documentée mais non exécutée est un mensonge de documentation.
D14. **Les raccourcis annoncés dans le manifeste doivent être implémentés** (`?action=new` et `?action=resume`) ou retirés du manifeste. Rien d'annoncé ne reste non câblé.
D15. **Aucune documentation ne décrit un état futur au présent.** Chaque affirmation du README, des décisions, du journal des modifications et de l'architecture doit être vraie à l'instant du commit, chiffres compris (poids, tailles, scores).

## 8. Rectificatif de l'auditeur (D11 corrigé) et décisions supplémentaires

D11-rectifié. **Mon diagnostic initial du décalage de mise en page était faux et je le corrige.** Mesures du critique B : décalage total 0,317, dont **0,289 causé par la grille de préréglages remplie en JavaScript** (`#presets-grid`, la section passe de 41 px à 154 px vers 310 ms) et seulement 0,031 imputable aux polices. Conséquences : le correctif principal appartient à **C** (réserver la hauteur de la grille de préréglages, ou rendre les préréglages directement dans le HTML plutôt qu'en JavaScript au chargement) ; B reste responsable de sa part (métriques de police et préchargement). L'objectif ≤ 0,1 est inchangé. Leçon générale, applicable à tous : **un correctif ne se décide pas sans avoir mesuré la cause.**

D16. **Un audit doit mesurer ce que l'utilisateur voit réellement.** L'audit de contraste lisait une couleur de fond théorique en ignorant les moitiés teintées des zones plus/moins et la texture, ce qui rendait ses 1600 résultats faux là où ça compte. Tout audit automatique doit désormais échantillonner les **pixels rendus** dans les états réels (repos, pressé, éliminé), sous peine d'être un faux témoignage.

D17. **Un test désactivé par défaut n'est pas un test.** Les assertions fortes des tests visuels étaient conditionnées à une variable d'environnement posée nulle part ; un script d'audit sortait en succès malgré trente paires en échec. Tout contrôle de qualité doit échouer par défaut en cas de régression. Interdiction des garde-fous silencieux.

D18. **Distinction non chromatique obligatoire sur l'écran de jeu.** En simulation d'achromatopsie, les douze cartes apparaissent identiques et ne portent ni nom ni numéro de siège lisible. Chaque carte doit porter en permanence un identifiant non chromatique (numéro de siège et/ou nom, taille suffisante) afin que l'appartenance d'une carte à un joueur ne dépende jamais de la couleur. C'est l'application directe de D1.

## 9. Décision D19 — l'échelle typographique passe en unités relatives

Constat soulevé par l'agent C et retenu par l'auditeur : l'application cumule deux verrous. Le zoom par pincement est désactivé (D7, conservé pour éviter un zoom accidentel en pleine partie), et l'échelle typographique est exprimée en pixels absolus. Résultat : un utilisateur qui agrandit la taille du texte dans les réglages de son système n'obtient aucun effet. C'est un échec du critère « redimensionnement du texte » des règles d'accessibilité, et cela vide de sa substance la contrepartie que j'avais posée en D7.

Décision : les jetons `--fs-*` passent en unités relatives (rem), calés sur une base de 16 px, avec un plancher effectif de 12 px conservé. Propriétaire : B (css/tokens.css). Les feuilles de A et de C suivent. Vérification exigée : avec une taille de police système portée à 200 %, l'application reste utilisable, aucun texte n'est tronqué, aucune cible ne descend sous 44 px, et la zone de jeu reste jouable. C'est la seule façon de tenir à la fois D7 et l'accessibilité.

## 10. Décisions D20 et D21 — ratification du seuil transitoire et déterminisme des audits

D20. **Seuil de contraste en état transitoire, ratifié explicitement.** Les règles d'accessibilité accordent un rapport de 3:1 aux grands textes sans condition. Le score de l'écran de jeu, qui dépasse largement la taille de grand texte, relève donc de ce seuil. Nous appliquons une règle plus stricte que la norme : 4,5:1 exigé au repos pour tout texte, score compris, et 3:1 toléré uniquement pendant les états transitoires et brefs que sont la pression, le flash et la butée. Cette tolérance ne s'applique jamais à un état stable. Elle doit être écrite en toutes lettres dans l'en-tête du script d'audit, dans son rapport et dans la documentation des décisions : l'en-tête qui affirme encore 4,5:1 pour tout texte contredit le code et tombe sous l'interdiction de documenter un état faux.

D21. **Un audit dont le verdict varie d'une exécution à l'autre ne vaut rien.** Deux passages consécutifs de l'audit de contraste ont donné des ensembles d'échecs différant sur onze entrées sur vingt-deux, parce que tous les échecs se situent à moins de trois dixièmes du seuil et que l'échantillonnage varie d'un dixième. Le verdict de l'intégration continue est alors tiré au sort. Exigence : trois exécutions consécutives doivent produire des ensembles d'échecs identiques, l'échantillonnage doit être stabilisé, par exemple par médiane de plusieurs captures, et tout élément mesuré à moins de deux dixièmes du seuil doit être traité comme un défaut de conception à corriger, pas comme un résultat à publier. La même exigence s'applique à tout audit automatique du projet.
