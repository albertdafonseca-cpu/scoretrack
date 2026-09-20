# Références du marché — compteurs de score / de vie sur table

Dossier de l'agent RECHERCHE (16 septembre 2026). Sert de base à `RUBRIC.md`, `BLIND-PROTOCOL.md` et `GAPS.md`.

## Méthode et limites d'honnêteté

- Aucune application tierce n'a été exécutée. Tout ce qui suit provient de **sources publiques** : fiches App Store / Google Play, sites éditeurs, dépôts GitHub, articles de critiques (Draftsim, Denexa Games, MakeUseOf, Roll Dice, TheStack.gg), fils BoardGameGeek.
- Le proxy réseau de la session **bloque** apps.apple.com, play.google.com, draftsim.com, denexa.com, makeuseof.com, mtgsalvation.com, boardgamegeek.com, lifecounter.app, getscory.com, slie.ch, justuseapp.com, thestack.gg. Les citations de ces pages viennent donc des **extraits renvoyés par le moteur de recherche**, pas d'une lecture intégrale. Seuls les dépôts GitHub ont pu être lus directement. Chaque fait est marqué : [F] fiche store/site éditeur, [C] critique tierce, [U] avis utilisateurs agrégés, [G] dépôt GitHub.
- Les notes chiffrées (étoiles, téléchargements) sont celles visibles dans les extraits à la date de la recherche ; elles ne sont pas vérifiées.
- « Score Counter (Dev Things) » cité dans la mission n'a pas été retrouvé sous ce nom d'éditeur. Deux applications Android homonymes existent : **Score Counter: Count Anything** (éditeur napps, `ua.napps.scorekeeper`) et **Score Counter** (Martin Váňa, `cz.vanama.scorecounter`). La première, la plus citée par les critiques (MakeUseOf, Denexa), est retenue comme référence.
- Aucune application officielle Mattel (Uno) ni Magilano (Skyjo) de comptage n'a été trouvée ; les compteurs Skyjo/Uno du marché sont tous tiers. Scory est retenu comme meilleur représentant « compteur de rounds à règles » (Skyjo Classic/Action, Yahtzee, fléchettes).

---

## 1. Carbon — MTG Tabletop Utility (Nanotube LLC)

- **Plateforme** : iOS, Android (gratuit, Pro 4,99 $). Jusqu'à 6 joueurs.
- **Loué** : [C] « simple design with plain flat colors for each player's life total », « intuitive controls… most players pick up how to modify their life totals immediately by tapping above and below the number » (Draftsim) ; [U] « very sleek and futuristic look », « very responsive, clean and intuitive » ; [C] « focuses on essentials, cross-platform usability, with a fair pricing model » (Roll Dice) ; [C] « the ol' tried-and-true » (TheStack).
- **Reproché** : [U] plantages occasionnels ; [U] le tirage du premier joueur « the finger color doesn't match where they pressed », perçu comme biaisé « always chooses the person whose finger is closest to the top » ; [U] le geste « dragging across the life total » pour ouvrir le menu compteurs oblige à traverser tout l'écran → déclenchements accidentels ; [U] noms de joueurs indisponibles même en Pro pendant une période ; [U] minuteur par match seulement, pas par tour.
- **3 détails d'exécution** :
  1. Panneaux plats colorés, un par joueur, **orientés vers le joueur** ; tap au-dessus/en dessous du nombre = ±1, sans bouton visible.
  2. **Gestes configurables** : secousse (optionnelle), tap à deux doigts, appui long à un doigt, appui long à deux doigts (notes de version [F]).
  3. **Historique** de partie incluant compteurs, monarque, bénédiction, morts ; **minuteur de match** ; marquage « joueur mort » avec animation « kill players » (Pro).
- **Sources** : https://apps.apple.com/us/app/carbon-mtg-tabletop-utility/id1209153225 · https://draftsim.com/best-mtg-life-counter-app/ · https://www.rolldice.games/blog/magic-the-gathering-life-counter-apps-reviewed/ · https://justuseapp.com/en/app/1209153225/carbon-mtg-utility/reviews · https://appgrooves.com/app/carbon-mtg-tabletop-utility-by-nanotube-llc

## 2. Lifelinker (Collected Company / The Command Zone)

- **Plateforme** : iOS, Android (gratuit + achat unique 0,99 $ ; gratuit pour les patrons du podcast). 1 à 6 joueurs.
- **Loué** : [F] « the simplest and easiest to use Magic: the Gathering life counter » ; [U] interface propre et simple, profils sauvegardés, fonds personnalisables ; [F] « keep detailed match histories that you can review or **reset to any previous point** » ; [F] « spinning ticker to randomly select the first player ».
- **Reproché** : [U] consommation batterie « from full to 5 % during a 45 minute commander game » ; [U] randomiseur « off center », « flawed, especially in games with odd numbers of players » ; [U] dégâts de commandant : « borders around the clickable areas would prevent people from changing life total when trying to apply commander damage » → **mis-taps** faute de zones délimitées ; [C] « It counts life… but that's about it » (Draftsim).
- **3 détails d'exécution** :
  1. **Retour à n'importe quel point** de l'historique (rollback), pas seulement « annuler la dernière action ».
  2. **Roulette de premier joueur** animée et dé d6 intégré.
  3. Couleur de fond et emblème par joueur, noms mémorisés.
- **Sources** : https://apps.apple.com/us/app/lifelinker/id1204187272 · https://play.google.com/store/apps/details?id=com.collectedcompany.MatchTracker · https://appgrooves.com/app/lifelinker-by-collected-company/negative · https://www.patreon.com/posts/announcing-our-8745483 · https://draftsim.com/best-mtg-life-counter-app/

## 3. LifeLinked (HypeApps, open source)

- **Plateforme** : Android + iOS, Kotlin / Compose Multiplatform, code sur GitHub. 1 à 6 joueurs, « alternate four player layout ».
- **Loué** : [F] « highly customizable… lightweight, intuitive, and free » ; [G] « minimal yet intuitive, providing a clear picture of the gamestate from a glance » ; fonds par joueur (image locale ou **art de carte Scryfall**) ; 20+ compteurs, mode partenaire.
- **Reproché** : [G] le README ne documente ni undo ni historique ; peu d'avis critiques indépendants (application récente) ; dépendance réseau pour Scryfall.
- **3 détails d'exécution** :
  1. [G] **« Crash protection: App state is saved automatically to storage, allowing for recovery upon a crash »** — sauvegarde continue, restauration transparente.
  2. Outils intégrés : pièce, dés, choix du premier joueur, suivi du monarque, Planechase.
  3. Fond d'écran de joueur personnalisable par image, prévisualisé dans le panneau.
- **Sources** : https://github.com/ntietje1/MTG_Life_Total_App · https://play.google.com/store/apps/details?id=com.hypeapps.lifelinked · https://sites.google.com/view/lifelinked/home

## 4. Lotus — MTG Life Counter (Vanilla)

- **Plateforme** : iOS, Android, web (lifecounter.app). Gratuit sans pub. [U] 4,6/5, 250 k+ téléchargements. Jusqu'à 10 joueurs.
- **Loué** : [U] « the best Magic the Gathering companion app » ; [F] minuteur de partie **avec suivi des tours individuels** ; [C] « game history archive… saves previous games however you left them » (TheStack) ; fonds et « defeat messages » personnalisables.
- **Reproché** : [C] très riche (recherche de cartes, prix, légalité) → plus complexe qu'un compteur pur ; peu de détails publics sur l'accessibilité.
- **3 détails d'exécution** :
  1. [F] « manual life input by **tapping the life total display to bring up a numeric keypad** for precise adjustments ».
  2. [F] « **long taps** on the increase/decrease buttons for fast life count adjustments, **jumping by 10** at a time ».
  3. Animation de dés accélérée et identique sur l'écran principal et dans l'overlay (cohérence du motion).
- **Sources** : https://lifecounter.app/ · https://apps.apple.com/us/app/mtg-life-counter-app-lotus/id1498057193 · https://play.google.com/store/apps/details?id=com.vanilla.mtgcounter · https://www.thestack.gg/blog/best-mtg-life-counter-app-commander

## 5. Mutility (Kevin Sliech)

- **Plateforme** : iOS. 1 à 4 joueurs. Achat unique 3,99 $ pour l'historique éditable, compteurs secondaires, personnalisation.
- **Loué** : [F] « designed to be used on the gaming surface with **large, beautiful life totals and tap targets** » ; [C] « utilitarian… blisteringly bright colors… roll-off mechanic with simple animation » (Draftsim) ; [U] « the best life counter app available on the platform » ; **accessibilité déclarée** [F] : « supports shapes or text, in addition to or instead of color », schéma sombre, « modifies or reduces certain types of animation that may cause motion sickness ».
- **Reproché** : [C] « Most customization… locked behind a $3.99 paywall » ; limité à 4 joueurs.
- **3 détails d'exécution** :
  1. [F] « To decrease life, tap the **left** side of a player's life total; to increase, tap the **right** » — convention spatiale unique et stable.
  2. [F] « **Tap and hold** to continuously increase or decrease life » — répétition continue sous le doigt.
  3. **Historique éditable** de la partie en cours (premium) ; formes/texte doublant la couleur (daltonisme) ; motion réduit.
- **Sources** : https://apps.apple.com/us/app/mutility-mtg-life-counter/id741336884 · https://slie.ch/mutility/ · https://draftsim.com/best-mtg-life-counter-app/

## 6. Keep Score: Game Score Tracker / GameKeeper (Aaron Orr)

- **Plateforme** : iOS. [U] 4,7/5 sur 4 100+ notes. Gratuit, « Unlimited Games » 3,99 $. Aucune collecte de données.
- **Loué** : [U] « fantastic, simple, intuitive scorekeeping app » ; [F] manches, classements, **Game Stats** (graphes), minuteur, tirage de joueur, buzzer ; [C] « ad-free and has no limit on players or scoring events » ; [F] calcul « directly on the score entry screen… with a single tap ».
- **Reproché** : [U] paywall ; [U] suppression d'une partie peu découvrable (swipe gauche) ; [C] « there is a way to look at an individual's score for every round, but it only works while the game is in progress » (Denexa) ; [U] suppression d'une manche cachée derrière un **appui long** sur « manche suivante » ; pas de date éditable.
- **3 détails d'exécution** :
  1. [C] « you touch each player's name to add a new scoring event… Each prior scoring event is still stored, and the user can **edit** these ».
  2. Saisie arithmétique en ligne (« 12+7 ») validée d'un tap.
  3. Graphes d'évolution par joueur et « Player Picker » aléatoire.
- **Sources** : https://apps.apple.com/us/app/keep-score-gamekeeper/id1140300229 · https://www.denexa.com/blog/5-scorekeeping-apps-reviewed/ · https://searchman.com/ios/app/us/1140300229/en/aaron-orr/keep-score-gamekeeper/

## 7. Score Counter: Count Anything (napps)

- **Plateforme** : Android. Gratuit, sans pub, sans version premium. [F] « trusted by over 150,000 players ».
- **Loué** : [F] « tracks points in seconds with no ads and no clutter », joueurs illimités, grandes valeurs ; [F] **historique de session avec graphe**, bascule Liste/Graphe par compteur ; dés, « Who goes first? », minuteur ; UI Material 3 ; [C] retenu par MakeUseOf parmi les 6 meilleurs.
- **Reproché** : [U] dés limités (somme seulement, un seul type) ; pas de mode multi-manches structuré.
- **3 détails d'exécution** :
  1. **Graphe d'évolution** des scores pendant la session (vue Liste ↔ Graphe).
  2. **Réinitialisation d'un compteur en un tap** (note de version) et compteurs nommables.
  3. Trio d'outils de table intégrés : dé, tirage du premier joueur, minuteur.
- **Sources** : https://play.google.com/store/apps/details?id=ua.napps.scorekeeper · https://www.makeuseof.com/best-score-counter-apps-android/ · https://www.denexa.com/blog/5-scorekeeping-apps-reviewed/ · https://cafebazaar.ir/app/ua.napps.scorekeeper?l=en

## 8. Scory — Score Keeper (Sinoapps) — référence Skyjo / Yahtzee / fléchettes

- **Plateforme** : iOS + Android.
- **Loué** : [F] « clean & intuitive, distraction-free interface with **dark mode & offline functionality**, requiring no internet or account » ; [F] Skyjo « **automatic score doubling**, visual standings, and **threshold tracking** », variantes Classic et Action ; [F] « **Sheet View** for spreadsheet-style scoreboards to see every round at a glance and **edit past entries** » et « **Card View** with streamlined +/- buttons… with full action history » ; [F] « Every game is saved… continue later, **rematch instantly**, or replay with the same rules ».
- **Reproché** : orienté « feuilles de score par jeu » plus que compteur libre orienté table ; application récente, peu d'avis indépendants.
- **3 détails d'exécution** :
  1. Deux vues du même état : tableau (manches × joueurs, éditable) et cartes (+/−).
  2. Moteur de règles par jeu (doublement Skyjo, seuil de fin, bonus Yahtzee) + détection automatique du vainqueur.
  3. « Revanche » en un tap avec mêmes joueurs et mêmes règles.
- **Sources** : https://getscory.com/en · https://getscory.com/en/score-keeper/skyjo · https://apps.apple.com/us/app/score-keeper-scory/id6538715670 · https://play.google.com/store/apps/details?id=com.sinoapps.scorepal

---

## Mentions secondaires (utiles pour des critères précis)

- **Score Anything** (iOS, [U] 4,9/5 sur 769 avis) : « quick and accurate scoring with a **single natural gesture** », « chronological scoresheet » + undo, incréments personnalisables, 1–12 joueurs, couleurs par joueur, mode sombre OLED. https://apps.apple.com/us/app/score-anything-scorekeeper/id1541777240 · clone web : https://github.com/jdvlpr/Score-It-Web-App (« press a player's dot and swipe around the ring », undo/redo, localStorage, zéro build).
- **Spell Counter** (Android, open source, jusqu'à 8 joueurs) : [C] « has an **obvious animation to show users to tap up or down** » (Draftsim) ; thèmes, mode sombre, profils. https://github.com/seanKenkeremath/SpellCounter · https://play.google.com/store/apps/details?id=com.kenkeremath.mtgcounter
- **Dragon Counter** (iOS) : appui long pour compteurs/dégâts de commandant. **Lifetap** : undo par appui long. **bgLifecounter** : retour haptique ajouté, historique dans un tiroir latéral. (fiches App Store citées par la recherche)
- **Critique transversale** [C] TheStack.gg : « Most apps bury commander damage behind a long-press, which is the opposite of what a tracker… should do. Tools designed for shared table use need **large numerals, unambiguous layout, and no subtle UI gymnastics**. » https://www.thestack.gg/blog/best-mtg-life-counter-app-commander
- **Point Tracker – ScoreUp** : « multi-user score entry where players can enter their own scores from anywhere around the table without passing the phone ». https://apps.apple.com/us/app/point-tracker-scoreup/id6743008722

## Synthèse : ce que le marché récompense

| Attente                                                                  | Références qui l'incarnent le mieux                       |
| ------------------------------------------------------------------------ | --------------------------------------------------------- |
| Ouvrir → compter en ≤ 2 taps, panneaux plats orientés                    | Carbon, Mutility, Lifelinker                              |
| Zones +/− délimitées et convention stable (gauche/droite, haut/bas)      | Mutility, Carbon ; contre-exemple Lifelinker (mis-taps)   |
| Appui long = répétition continue ou pas de 10 ; tap sur le nombre = pavé | Mutility, Lotus                                           |
| Historique chronologique, retour à un point, édition a posteriori        | Lifelinker, Keep Score, Score Anything, Mutility          |
| Graphe d'évolution / stats de partie                                     | Score Counter (napps), Keep Score                         |
| Outils de table : dé, premier joueur, minuteur                           | Carbon, Lifelinker, LifeLinked, Score Counter, Keep Score |
| Sauvegarde continue, récupération après crash, hors-ligne sans compte    | LifeLinked, Scory, Lotus                                  |
| Accessibilité déclarée (formes en plus des couleurs, motion réduit)      | Mutility                                                  |
| Sobriété d'énergie (pas d'animations permanentes)                        | reproche récurrent à Lifelinker                           |
