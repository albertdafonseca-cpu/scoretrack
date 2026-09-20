# Grille d'évaluation « meilleur compteur de score du marché »

8 dimensions × 5 critères binaires (OUI/NON, chacun vérifiable par capture, mesure ou test). Une dimension est **AAA** quand ScoreTrack atteint le seuil « bat la référence » indiqué. Les références sont celles documentées dans `REFERENCES.md` (décrites depuis des sources publiques, non exécutées — voir `BLIND-PROTOCOL.md` §Limites).

Conventions de vérification :

- **Capture** = capture Playwright (viewport 390×844, DPR 3, puis 768×1024) archivée dans le dossier de preuves.
- **Mesure** = valeur numérique obtenue par script (`page.evaluate`, `getBoundingClientRect`, `getComputedStyle`, `document.fonts`, `performance`, `getAnimations`, trace Chrome) et consignée avec la commande qui l'a produite.
- **Test** = test vitest/playwright versionné qui passe en CI.
- « 1 m » : à 1 m, l'acuité 10/10 résout ~0,29 mm ; un chiffre est confortablement lisible si sa hauteur ≥ 9 mm (≈ 30 px CSS sur un écran de 6,1" à 390 px CSS de large, soit ~3,3 px CSS/mm). Les seuils en px ci-dessous découlent de ce calcul.

---

## D1. Première prise en main

**Meilleure référence** : Carbon — l'application s'ouvre directement sur la table de jeu, les panneaux plats orientés se comprennent « immédiatement… en tapant au-dessus et en dessous du nombre » ; Lifelinker revendique « the simplest and easiest to use ».

| #   | Critère binaire                                                                                                                                                              | Comment vérifier                                                                                                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 | Depuis un lancement à froid (stockage vide), on modifie un premier score en **≤ 2 taps** (hors éventuel splash).                                                             | Test Playwright : compter les `click()` nécessaires avant que `#sc-0` change ; capture de chaque étape.                                                           |
| 1.2 | Temps entre `navigationStart` et premier score modifiable **< 1 500 ms** sur CPU ×4 throttling, aucune attente artificielle (splash ≤ 300 ms ou sautable).                   | Mesure : `performance.mark` posé par l'app à la fin du rendu de l'écran de jeu + trace Chrome avec throttling ; grep de tout `setTimeout` bloquant la navigation. |
| 1.3 | Le CTA principal est **actif par défaut** (valeurs sensées préremplies) ; aucun écran n'exige un choix avant de pouvoir avancer.                                             | Capture de l'écran d'accueil à froid ; test : `#go-btn` n'est pas `disabled` au chargement.                                                                       |
| 1.4 | L'affordance +/− se comprend **sans texte** : signes ≥ 24 px CSS, orientés comme le joueur, et **frontière visible** entre zone + et zone − (contraste ≥ 3:1 ou séparateur). | Mesure `getBoundingClientRect` des signes ; capture 4 joueurs ; mesure du contraste entre les deux moitiés ou présence d'un séparateur ≥ 1 px.                    |
| 1.5 | Une partie en cours est **reprise en 1 tap** après rechargement, avec aperçu (noms, scores, date).                                                                           | Test : jouer, `page.reload()`, capture de la bannière, un clic → écran de jeu identique (scores, sièges).                                                         |

**Seuil « bat la référence »** : 5/5 ET ≤ 2 taps (égal à Carbon) ET reprise avec aperçu (Carbon n'affiche pas d'aperçu documenté).

## D2. Écran de jeu & lisibilité à distance

**Meilleure référence** : Mutility — « designed to be used on the gaming surface with large, beautiful life totals and tap targets » ; Carbon — aplats de couleur plats, un nombre par panneau, aucune décoration.

| #   | Critère binaire                                                                                                                                                              | Comment vérifier                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 | À 4 joueurs (390×844), hauteur de cap du score **≥ 96 px** (≈ 29 mm) ; à 12 joueurs **≥ 30 px** (≈ 9 mm).                                                                    | Mesure : `getBoundingClientRect()` du `.score` (corriger la rotation), capture annotée.                                                  |
| 2.2 | Contraste score/fond de carte **≥ 4,5:1** pour les 14 thèmes × 10 couleurs de carte × 3 états (normal, bas, critique).                                                       | Script d'audit contraste (WCAG 2.x relative luminance) sur les couleurs calculées ; tableau 420 lignes, 0 échec.                         |
| 2.3 | Nom de 18 caractères affiché **sans chevauchement** du score ni débordement, sur tous les layouts 1–12 et les 4 rotations.                                                   | Test Playwright : noms « Wxxxxxxxxxxxxxxxxx » ; comparaison des rects nom/score (intersection = 0) ; captures 1, 2, 3, 4, 6, 12 joueurs. |
| 2.4 | Surface d'écran **inutilisée ≤ 10 %** de la zone de jeu pour chaque nombre de joueurs 1–12 (pas de cellule vide).                                                            | Mesure : somme des aires des cellules sans joueur / aire de `#players-wrap`.                                                             |
| 2.5 | Le score, le nom et l'état (éliminé, bas) restent lisibles sur capture réduite à **25 %** (simulation de distance) : test de lecture par le critique sur la capture réduite. | Capture 4 joueurs redimensionnée à 25 % ; le critique doit transcrire les 4 scores sans erreur.                                          |

**Seuil « bat la référence »** : 5/5. Mutility ne gère que 4 joueurs : réussir 2.1 et 2.4 jusqu'à 12 joueurs place ScoreTrack devant.

## D3. Gestes & réactivité

**Meilleure référence** : Mutility (tap gauche = −, droite = + ; « tap and hold to continuously increase or decrease ») et Lotus (« tapping the life total display… numeric keypad », « long taps… jumping by 10 »). Contre-exemple : Lifelinker (mis-taps faute de bordures).

| #   | Critère binaire                                                                                                                                                                                            | Comment vérifier                                                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 3.1 | Premier retour visuel **< 100 ms** après `pointerdown` (pas `pointerup`), mesuré sur 20 taps.                                                                                                              | Mesure : `PerformanceObserver` (`event` timing) ou horodatage `pointerdown` → première mutation de style ; p95 < 100 ms.            |
| 3.2 | Chaque zone + et − mesure **≥ 44×44 px** et les deux zones sont **visuellement délimitées** ; un tap à 4 px de la frontière produit l'effet attendu de son côté.                                           | Mesure des rects ; test Playwright de taps à ±4 px de la médiane sur les 4 rotations.                                               |
| 3.3 | L'appui long donne un **retour progressif visible avant 300 ms** (anneau, remplissage) puis déclenche une action de « grande amplitude » (répétition continue ou pavé) ; relâcher avant annule sans effet. | Capture à 250 ms après `pointerdown` ; test : hold 200 ms → score inchangé ; hold 600 ms → action déclenchée.                       |
| 3.4 | Saisie d'une valeur exacte en **≤ 4 gestes** depuis la carte (ouvrir, chiffres, valider) ; fermeture par geste (glisser vers le bas) ou touche Échap.                                                      | Test Playwright : appliquer « −17 » en comptant les actions ; test clavier `Escape`.                                                |
| 3.5 | **Retour haptique** sur chaque changement de score quand `navigator.vibrate` existe, distinct pour butée/élimination ; aucun double déclenchement souris+tactile.                                          | Test : espionner `navigator.vibrate` ; test : émettre `touchstart/touchend` puis `click` synthétique → un seul changement de score. |

**Seuil « bat la référence »** : 5/5. Aucune référence ne documente à la fois retour progressif d'appui long (3.3) et zones délimitées (3.2) ; les deux réunis = supériorité.

## D4. Motion & feel

**Meilleure référence** : Carbon (animations sobres, « kill players » animation, réactivité louée) ; Spell Counter (« obvious animation to show users to tap up or down ») ; Mutility (« reduces certain types of animation that may cause motion sickness »).

| #   | Critère binaire                                                                                                                                                    | Comment vérifier                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1 | Le **chiffre s'anime** lors d'un changement (défilement/rouleau ou pop à ressort), il n'est pas remplacé sèchement ; durée 150–350 ms ; courbe non linéaire.       | Mesure : `element.getAnimations()` non vide après un tap ; lecture de `easing`/`duration` ; capture à mi-animation.                                         |
| 4.2 | **60 fps** : aucune frame > 16,7 ms (p95) pendant 20 taps consécutifs à 4 et 12 joueurs.                                                                           | Trace Chrome via Playwright (`browser.startTracing`) ou boucle `requestAnimationFrame` mesurant les deltas ; rapport p95/p99.                               |
| 4.3 | `prefers-reduced-motion: reduce` supprime les animations non essentielles (aucune animation infinie, transitions ≤ 1 frame) tout en conservant les retours d'état. | Test : `page.emulateMedia({reducedMotion:'reduce'})` puis `document.getAnimations().length === 0` hors animations `fill: forwards` de 0 ms ; capture.       |
| 4.4 | Un tap ou un undo **ne reconstruit pas le DOM** de la grille (les nœuds `.pcard` gardent leur identité) ; aucune animation n'est coupée par un re-rendu.           | Test : conserver une référence à `#card-0` avant/après tap et undo (`isSameNode`), `MutationObserver` compte les nœuds ajoutés/supprimés (0 sur la grille). |
| 4.5 | Le **delta cumulé** (+3, −5) reste visible **exactement tant que le groupe d'annulation est ouvert**, puis se fond ; couleur ET signe portent l'information.       | Test : durée d'affichage == `GROUP_DELAY` ± 50 ms ; captures à t = 0,3 s / 1,2 s / 1,8 s ; vérifier le glyphe +/− dans le texte.                            |

**Seuil « bat la référence »** : 5/5 avec preuves de 60 fps. Carbon n'expose aucune mesure publique de fps ; documenter 4.2 et 4.3 dépasse toute référence.

## D5. Système visuel & thèmes

**Meilleure référence** : Carbon (aplats plats cohérents, typographie unique) ; Mutility (couleurs vives, thème sombre, cohérence des tailles).

| #   | Critère binaire                                                                                                                                                                       | Comment vérifier                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 5.1 | **Zéro requête réseau externe** : polices, icônes et images auto-hébergées ; `document.fonts.check()` vrai pour chaque famille utilisée après chargement hors ligne.                  | Test : `page.route('**', …)` bloque tout hôte externe ; lister `performance.getEntriesByType('resource')` ; `document.fonts.status === 'loaded'` et aucune police de secours (comparer la largeur d'un texte témoin à la valeur attendue). |
| 5.2 | **Aucun emoji système** dans l'interface : uniquement SVG inline/sprite ; icônes alignées sur la grille de 24 px.                                                                     | Grep du dépôt (plages U+1F300–1FAFF, U+2600–27BF) hors commentaires et docs ; capture des barres d'outils.                                                                                                                                 |
| 5.3 | **Tokens** : chaque couleur/rayon/durée est une variable CSS définie dans `tokens.css`/`themes.css` ; aucune couleur codée en dur dans les autres feuilles ni dans le JS.             | Lint (stylelint `color-no-hex` hors tokens) ou grep `#[0-9a-f]{3,8}` dans css/*.css sauf tokens/themes ; grep `style.color=` dans js/.                                                                                                     |
| 5.4 | Échelle typographique **≤ 8 tailles** et **≤ 2 familles par thème** ; aucun texte < 11 px ; hiérarchie identique sur les 14 thèmes (mêmes tailles, seules couleurs/polices changent). | Audit : extraire toutes les `font-size` calculées des éléments visibles sur 3 écrans × 14 thèmes ; compter les valeurs distinctes ; min ≥ 11 px.                                                                                           |
| 5.5 | **Alignement au pixel** : bords des cartes, barre d'outils et modales alignés sur une grille de 4 px ; pas de demi-pixel visible (rotation incluse).                                  | Mesure des `getBoundingClientRect()` (x, y, w, h modulo 4 = 0 après arrondi DPR) ; capture zoom 400 % des jonctions de cartes.                                                                                                             |

**Seuil « bat la référence »** : 5/5. Une référence à 14 thèmes cohérents et 0 requête externe n'existe pas sur le marché.

## D6. Accessibilité & daltonisme

**Meilleure référence** : Mutility — seule application déclarant « shapes or text, in addition to or instead of color » et motion réduit ; palette Paul Tol imposée par D1 du brief.

| #   | Critère binaire                                                                                                                                                                                                                                     | Comment vérifier                                                                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6.1 | Contraste **≥ 4,5:1 texte / 3:1 composants** pour tous les textes et bordures actives sur les 14 thèmes et les 5 écrans.                                                                                                                            | Script axe-core (`@axe-core/playwright`) + audit contraste maison sur couleurs calculées ; 0 violation `color-contrast`.                                      |
| 6.2 | Toutes les cibles tactiles **≥ 44×44 px** (chips, boutons de barre, touches du pavé, fermeture de modale).                                                                                                                                          | Mesure de tous les éléments `button, [role=button]` visibles ; liste des échecs vide.                                                                         |
| 6.3 | **Navigation clavier complète** : Tab atteint chaque contrôle, focus visible (anneau ≥ 2 px, contraste ≥ 3:1), +/−/Entrée/Échap fonctionnent sur l'écran de jeu, piège de focus dans les modales.                                                   | Test Playwright : parcours par `keyboard.press('Tab')` jusqu'au lancement d'une partie ; capture du focus ; test `Escape` ferme la modale et rend le focus.   |
| 6.4 | **Sémantique** : contrôles = `<button>` ou `role` correct avec `aria-label` (« Ajouter 1 à Alice »), `aria-live="polite"` pour les scores, `role="dialog"` + `aria-modal` sur les modales ; 0 violation axe « serious/critical ».                   | axe-core sur les 5 écrans ; lecture de l'arbre d'accessibilité (`page.accessibility.snapshot()`).                                                             |
| 6.5 | Sous simulation **protanopie, deutéranopie, tritanopie** (matrices Machado 2009), les 12 couleurs joueurs restent deux à deux distinctes (ΔE2000 ≥ 15) ET gain/perte, bas/critique sont portés par un signe non chromatique (glyphe, forme, texte). | Script : appliquer les matrices aux couleurs, calculer ΔE ; captures filtrées via `page.emulateVisionDeficiency()` ; vérification du glyphe sur les captures. |

**Seuil « bat la référence »** : 5/5 (Mutility ne documente ni clavier ni contraste mesuré).

## D7. Robustesse & hors-ligne

**Meilleure référence** : LifeLinked (« crash protection: app state is saved automatically… recovery upon a crash ») ; Scory (« offline… no internet or account ») ; Lotus (archive des parties).

| #   | Critère binaire                                                                                                                                                                                                                                       | Comment vérifier                                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7.1 | Après une première visite en ligne, l'application se **charge et joue entièrement hors ligne** (polices, icônes, manifeste inclus) ; le SW s'installe sans erreur (précache sans 404).                                                                | Test Playwright : visite → `context.setOffline(true)` → `reload` → partie complète ; vérifier `navigator.serviceWorker.controller` non nul ; lister les 404 du précache.  |
| 7.2 | **0 erreur / 0 avertissement console** et 0 `unhandledrejection` sur le parcours complet (1 et 12 joueurs, undo ×40, rotation, reload, hors-ligne).                                                                                                   | Test : collecter `page.on('console')` et `page.on('pageerror')` ; assertion tableau vide.                                                                                 |
| 7.3 | **Sauvegarde corrompue** (JSON tronqué, schéma inconnu, quota dépassé) → message clair, préférences conservées, proposition de restaurer la dernière sauvegarde valide.                                                                               | Test : injecter `scoretrack_save = '{"players":['` puis charger ; capture du message ; vérifier que `scoretrack_settings` est intact.                                     |
| 7.4 | **Mise à jour PWA signalée** (bannière « nouvelle version ») et appliquée sur action utilisateur sans perdre la partie en cours ; anciens caches `st-v1`/`st-fonts-v1` purgés.                                                                        | Test : publier un SW v2 sur le serveur local, recharger, capture de la bannière ; `caches.keys()` ne contient plus les anciens noms ; scores identiques après activation. |
| 7.5 | La restauration après rechargement conserve **scores, ordre des sièges, historique, pile d'annulation et joueurs éliminés** ; la sauvegarde est atomique (écriture dans une clé temporaire puis bascule, ou schéma versionné avec somme de contrôle). | Test : 10 actions + rotation + élimination → reload → `undo` fonctionne encore 10 fois ; lecture du code de `storage.js`.                                                 |

**Seuil « bat la référence »** : 5/5. Aucune référence ne documente 7.3 ni 7.4 ; LifeLinked documente 7.5 partiellement (état, pas undo).

## D8. Historique, récap & undo

**Meilleure référence** : Lifelinker (« review or reset to any previous point ») ; Score Anything (« chronological scoresheet… undo ») ; Keep Score (édition des événements passés, stats) ; Score Counter napps (graphe d'évolution).

| #   | Critère binaire                                                                                                                                                                                    | Comment vérifier                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 8.1 | **Undo ×40 puis redo ×40** sans erreur ; chaque undo n'annule qu'une action (un groupe de taps rapprochés = une action, une saisie au pavé = une action, une rotation = une action).               | Test unitaire `history.js` + test e2e : 40 actions, 40 undo, 40 redo → état identique ; comparer JSON.                   |
| 8.2 | **Journal chronologique** horodaté : n° d'action, joueur, delta, score résultant, moyen (tap/pavé) ; consultable pendant et après la partie.                                                       | Capture de l'écran d'historique ; test : après 3 actions sur 2 joueurs, l'ordre affiché est l'ordre réel.                |
| 8.3 | **Retour à un point** de l'historique (« revenir ici ») avec confirmation, sans perdre la possibilité de refaire.                                                                                  | Test e2e : 10 actions, retour à l'action 4, vérifier scores ; redo disponible.                                           |
| 8.4 | **Récap de fin** : classement, écart au premier, vainqueur mis en avant (élimination ou score max), graphe ou mini-courbe par joueur, **partage/copie texte** du résultat.                         | Capture du récap ; test : bouton « Copier » place un texte lisible dans le presse-papiers (`navigator.clipboard` mocké). |
| 8.5 | L'annulation **ne casse aucun état dérivé** : réintègre un éliminé, ferme les modales de victoire/élimination, rétablit l'ordre des sièges, met à jour l'état « bouton annuler » et la sauvegarde. | Test e2e : éliminer → vainqueur → undo → carte réactivée, modales fermées, `scoretrack_save` mis à jour.                 |

**Seuil « bat la référence »** : 5/5 ; redo + retour à un point + partage réunis n'existent dans aucune référence unique.

---

## Barème global

- Chaque critère vaut 1 point (0 = NON, 1 = OUI prouvé). Score max 40.
- **AAA** = 40/40 avec preuve attachée à chaque critère. Une dimension à < 5 reste « non AAA » même si les autres sont parfaites.
- Un critère sans preuve (capture/mesure/test) compte **0**, même si le critique « pense » qu'il est rempli.
- Le critique note aussi, hors barème, une **préférence globale** par dimension (A / B / indécis) selon `BLIND-PROTOCOL.md` ; une préférence pour la référence sur une dimension à 5/5 déclenche une revue de la grille (critère manquant).
