# Critique élément F — tour 3 (CI/CD, déploiement, sécurité, documentation)

Audité : arbre de travail du 19 septembre 2026 (HEAD `57c88d9` + modifications non commitées de F et de B),
copié dans `…/scratchpad/critic/F3/repo` ; sorties dans `…/critic/F3/*.log`. Dépôt non modifié par moi.
Réserve de contexte : B modifiait `css/themes.css`, `constants.js`, `game.js`, `audit-*.mjs`, `sw-st.js`, tests.
Trois échecs de l'arbre sale lui reviennent et ne sont **pas** comptés à F : `check:sw` périmé, unit 308/309
(15ᵉ thème), e2e 71/76 (`game.spec.js:832`, 14 thèmes).

## Scores : CI 7/10 · Déploiement 8/10 · Sécurité 9/10 · Documentation 7/10 — **AAA : non**

## 1. Liste blanche du paquet — PROUVÉ

Script extrait tel quel de `ci.yml` (`…/F3/paquet-gate.mjs`), six dégradations (`…/F3/gate3.sh`) :
état sain → **0** (69 fichiers, 59 entrées, 739 232 o = 82,1 %, avertissement émis) ; capture de débogage publiée
→ 1 ; `package.json` publié → 1 ; capture du manifeste absente → 1 ; entrée de précache absente → 1 ; plafond
abaissé → 1 ; dossier `docs/` publié → 1. Les icônes, captures et icônes de raccourcis du manifeste sont bien
lues dynamiquement. Incohérence de forme : ADR-21 dit « cinq dégradations », SECURITE § 3 dit « sept ».

## 2. Performance — NON acceptable, le domaine CI n'est pas conforme

`npm run lhci` (5 exécutions, `pessimistic`) exécuté **deux fois** :

- machine calme (loadavg 1,4–1,8, aucun autre navigateur) : perf **0,90 / 0,93 / 0,91 / 0,98 / 0,95**,
  LCP 2,0–3,2 s → `categories.performance` **✘ 0,90 < 0,95**, **EXIT=1** (`…/F3/lhci2.log`) ;
- machine chargée : 0,79–0,96, LCP 2,4–4,4 s, EXIT=1 (`…/F3/lhci.log`).
  CLS 0,018, a11y 0,93, BP 1,00, SEO 1,00, poids 446 Kio : tous tenus. Le seul défaut est le **LCP**, et F l'a
  nommé lui-même (« aucune marge », 1,96–2,58 s). L'agrégation pessimiste fait exactement son travail (D21) :
  elle montre que le vert de F était une exécution favorable. Un job qui passe chez son auteur et échoue deux
  fois sur deux chez le critique n'est pas conforme. À traiter avant toute conformité : ramener le LCP sous
  ≈ 1,8 s de façon stable (préchargement des deux polices du premier rendu, feuilles bloquantes réduites,
  premier rendu sans attendre `js/main.js`) — sans toucher au seuil. Propriétaires : B (polices), C (accueil),
  F (mesure). Budget vérifié **non relâché** : 0,95 / 0,1 / `font-size` 1 / 512 000 inchangés, `skipAudits` absent.

## 3. Journal des décisions — FIDÈLE, sans réécriture

D16–D21 présents ; chiffres clés identiques au brief (0,289 · 0,031 · 41 px → 154 px · 310 ms · 1 600 · onze
entrées sur vingt-deux · trente paires · 200 % · 44 px). D11 **conserve** l'ancien diagnostic (polices), le
marque « faux, rétracté » avec date et attribue la vraie cause à `#presets-grid` : l'histoire n'est pas réécrite.
Ajout propre à F dans D17 : l'exception `audit:cvd` (palette listée sans bloquer), cohérente avec SECURITE § 3.

## 4. Six affirmations et chiffres — CORRIGÉS, mais une nouvelle affirmation fausse

Vérifiés vrais : ADR-10 « écart refermé » (CSP complète en `index.html:11`) ; D10 « appliqué » ; D14 « câblés » ;
SECURITE § 2.2 montre la ligne réelle ; CHANGELOG « 38 Ko » = 38 630 o ; README « ≈ 738 Ko, 59 entrées » =
739 232 o / 59 ; SECURITE § 3 liste les 7 jobs ; ARCHITECTURE cite `toast`, `prepaint`, `shortcuts` ;
EXPLOITATION § 7 donne les noms d'affichage des checks. **Faux au commit** (D15) : ADR-15 « `npm run lhci` sort
0, performance 0,95 à 0,98 » et la ligne « 19 septembre » du tableau d'`AUDIT-2026-09.md` — publiés depuis
une exécution favorable, non reproduits (point 2). Incomplet : « Connu et non livré » du CHANGELOG ne cite ni
le job `design` rouge (66 échecs de contraste), ni le job `e2e` rouge, ni la fragilité du job `lighthouse`.

## 5. Plafond 750 000 → 900 000 — assouplissement transparent, justification insuffisante

Pour : documenté (ADR-21 + commentaire `ci.yml`), changement de nature assumé (cliquet → budget d'expérience),
poids réel 739 232 o sous l'ancien plafond. Contre : « une vingtaine de secondes sur réseau mobile lent » ne
nomme aucun profil — 900 000 o font 18 s à 400 kbit/s mais 4,5 s en « 4G lente » Lighthouse (1,6 Mbit/s) et
9 s en 3G (780 kbit/s) ; et l'avertissement à 80 % (720 000) est **déjà dépassé** : il se déclenchera à chaque
construction dès le premier jour, ce qui en fait un bruit permanent, pas une alerte (esprit D17). Verdict :
acceptable seulement avec un profil réseau nommé et un seuil d'alerte au-dessus du poids courant (ou un poids
ramené sous 720 000 par sous-ensembles de polices).

## 6. Captures de documentation — INSUFFISANTES et en partie FAUSSES

- **Légende fausse** : README « Écran large (12 joueurs) — Douze cartes sans cellule vide » désigne
  `game-1280x800.png`, qui montre **quatre** joueurs (Alice, Bruno, Chloé, David) ; le manifeste, lui, dit
  « 4 joueurs sur tablette ». D15.
- **« Régénérées avec l'interface, donc jamais en retard sur elle » est faux** : `node scripts/build-screenshots.mjs`
  rejoué depuis `git archive HEAD` donne des octets **différents** pour `game-390x844` (89 574 → 99 334) et
  `game-1280x800` (135 301 → 153 900) ; à l'image, les icônes ± sont désormais cerclées et l'attribution des
  couleurs de cartes a changé. Les captures versionnées datent de `f663e2c` (17/09 20:46), deux commits
  visuels en arrière. Rien ne les régénère ni ne les compare en CI (`pwa.spec.js` ne vérifie que nombre et
  dimensions). `setup-390x844` est identique.
- **Trois vues ne documentent pas un produit visuel** : ni prénoms, ni pavé numérique, ni récapitulatif, ni
  thèmes, ni 12 joueurs — tous annoncés dans « Fonctionnalités ». Le principe (source unique régénérée) est
  le bon ; l'exécution manque. Attendu : étendre `build-screenshots.mjs` (noms, pavé, récap, 12 joueurs, thème
  clair), l'exécuter dans le job `paquet` et **échouer** si les octets diffèrent des fichiers versionnés ;
  corriger la légende.

## 7. `lint:tokens` en CI — VÉRIFIÉ

Étape « Jetons de conception respectés » du job `lint` (`ci.yml`) et dans `npm run lint` ; EXIT=0, 32/32.

## Autres preuves du tour

`dist/` servi puis mode avion : SW actif, cache `st-3d2c0105`, **59 entrées**, écran visible, 0 erreur console.
Contraste : 18 502 mesures, **66 échecs**, « 0 cellule instable, 0 écart de nombre de mesures » (le dénominateur
est désormais auto-contrôlé, B) → job `design` rouge, reconnu et attribué. `audit:cvd` EXIT=0.

## Ce qui manque pour « AAA : oui »

1. LCP stable : `npm run lhci` vert trois fois de suite en pessimiste, chez le critique (B/C/F).
2. Captures régénérées et comparées en CI, jeu étendu, légende « 12 joueurs » corrigée (F).
3. ADR-15 et AUDIT : remplacer « sort 0 » par l'état mesuré rouge tant qu'il l'est ; « Connu et non livré »
   complété avec `design`, `e2e`, `lighthouse` (F).
4. Plafond : profil réseau nommé, alerte non permanente ; « cinq/sept dégradations » harmonisé (F).
5. Contraste 66 échecs et e2e rouges (A/B, en cours).
