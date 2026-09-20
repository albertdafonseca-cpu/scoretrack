# Critique de l'élément B — tour 3 (final)

Dépôt **non modifié** (lecture, exécution seulement). Preuves : `scratchpad/critic/B3/`.
`css/game.css` (correctif de l'anneau par A) est resté **stable** (mtime inchangé, vérifié à trois
reprises) pendant toutes mes mesures : mon audit porte sur un état figé, pas une cible mouvante.

## 1. D21 — déterminisme : **tenu à l'usage, un accroc sous contention extrême et documentée**

Reproduit `node scripts/audit-contrast.mjs` **trois fois de suite**, code inchangé.

| Exécution | Conditions                                                                             | Mesures | Échecs                              |
| --------- | -------------------------------------------------------------------------------------- | ------- | ----------------------------------- |
| **run1**  | 2 autres `audit-contrast.mjs` + Lighthouse tournaient en parallèle sur la même machine | 19 382  | **8** (`dark` seul, `span.pplayer`) |
| **run2**  | processus isolé                                                                        | 19 382  | **0**                               |
| **run3**  | processus isolé                                                                        | 19 382  | **0**                               |

**run2 et run3 sont identiques au bit près** (diff programmatique des deux JSON de 21 942 lignes
chacun, tolérance 0,001 : **0 écart**, ratio par ratio). Seul **run1**, exécuté pendant que je
faisais tourner deux autres instances du même audit plus un cycle Lighthouse en tâche de fond,
diverge — sur `dark` uniquement, et seulement sur `span.pplayer` en états transitoires (4,26–4,63,
juste sous la marge de 0,2 exigée). Le diagnostic interne du script (« 0 cellule instable, 0 écart
de nombre de mesures ») est passé dans les trois runs : ce n'est pas une dérive du DOM, c'est une
dérive de la composition visuelle (dégradé + texture + liseré) au moment de la capture, propre aux
thèmes qui superposent le plus de couches, et je n'ai pu la déclencher que sous charge machine
sévère et anormale — reproduction ciblée isolée (`dark-repeat.mjs`, 9 essais, délais 160/400/1000 ms)
: **stable dans les 9 cas**, valeur identique à chaque fois.

**Verdict : le déterminisme visé par D21 est atteint dans les conditions normales d'exécution** (2
runs consécutifs propres, identiques au bit près, sur ~19 400 mesures) ; il reste une fragilité sous
contention extrême, qui n'est pas la situation d'un job CI dédié mais mérite un garde-fou.
**Propriétaire : B**, à titre de renforcement et non de blocage — augmenter légèrement `MEDIAN_SHOTS`
ou le délai après changement d'état pour les thèmes à couches multiples, ou exiger 2 exécutions
concordantes en CI avant de publier un échec.

## 2. Le résiduel « prénom en transitoire » — cause confirmée, correctif de A efficace

Code lu (`css/game.css`, commentaire « DÉFAUT CORRIGÉ ») : l'ancien `::after` couvrait toute la
moitié, dont la jointure interne longeait le bas du prénom (bande de 8 px, blanc sur ambre,
1,2–1,8:1 — cohérent avec les 40/66 échecs documentés par F les 19-20 septembre). Le correctif
observé (`inset: 42% 0 0`) cantonne liseré et teinte sous la bande d'identité. Vérification
indépendante (`pplayer-band.mjs`, sonde de bande verticale sur 10 thèmes en état `butée`) : **aucun
ratio catastrophique résiduel**, pire observé 3,46–3,49 hors bande stricte (à comparer aux 1,2–1,8
d'avant correctif). **Sur mes trois runs post-correctif, `span.pplayer` n'échoue plus JAMAIS dans
run2 et run3** ; le seul résiduel (run1) relève de l'instrument sous charge (§1), pas de la CSS.
Le travail de A sur ce point précis est terminé et suffisant.

## 3. Faux positifs du pavé numérique — **éliminés, vérifié**

`collectForegrounds` traite désormais correctement les couches `pointer-events: none` (le défaut du
tour 2 : `elementsFromPoint` ne les voit pas, ce qui faisait échantillonner l'accent du thème au lieu
du vrai fond du pavé) et corrige par dérive (`ownBg`) en cas d'incohérence. Mesure directe
(`keypad-check.mjs`, appui long réel via CDP, 4 thèmes) : couleurs réelles ≥ 9:1 partout. **Aucun**
des trois runs ne signale `button.key-btn`.

## 4. En-tête D20, rapport, CLS — conformes, vérifié ligne à ligne

`scripts/audit-contrast.mjs:12-19` énonce exactement la règle codée (4,5:1 stable, 3:1 uniquement en
transitoire pour texte ≥ 24 px) ; `docs/DECISIONS.md` cite les mêmes chiffres. CLS documenté à
**0,018** partout (plus de « 0,000 »). Rapport et JSON cohérents à l'unité près sur mes trois runs.

## 5. Palette et CVD — recalculé indépendamment, exact ; un trou de méthode trouvé

`--tol-6` : `#bbbbbb` → `#c4c8c4`. Recalcul indépendant (ma propre implémentation ΔE2000) : paire
cyan/gris à 6 joueurs, protanopie, passe de **15,1 à 16,9** — exact. Porte relevée de 14 à 15 (marge
finale 0,7). `SEPARABLE_MAX = 6` confirmé (ΔE minimal 15,7 à 6 joueurs, toutes simulations). Deux
exécutions de `npm run audit:cvd` : **tableau strictement identique**, exit 0 les deux fois — le
déterminisme est total ici. D18 vérifié visuellement : 12 sièges numérotés lisibles sous
achromatopsie (`jeu12-light-achroma.png`).

**Trou de méthode, non revendiqué par B** : la porte de séparabilité (ligne 171-179 de
`audit-cvd.mjs`) n'applique pas la marge D21. Test de dégradation : `--tol-6` remis à `#bbbbbb`
dans une copie → ΔE à 6 joueurs = 15,1, seulement 0,1 au-dessus du seuil de 15 → le script sort
**0** silencieusement, alors que D21 exige de traiter comme un défaut tout élément à moins de 0,2 du
seuil. **Propriétaire : B** — ajouter la marge de `audit-contrast.mjs` à `SEPARABLE_MIN_DE`.

## 6. Thème « Automatique » — vérifié

`js/core/constants.js` : entrée `auto` avec `hint`, bg/a/b = branche sombre exacte du défaut. Règle
« aperçu = branche sombre » **vérifiée par test**, pas supposée (`themes.test.js`, 40/40 passent).
Rendu confirmé (`reglages-auto.png`) : fond `#020d12` identique à cyber.

## 7. Premier rendu — amélioration réelle confirmée, un doute non tranché sur la stabilité

`scripts/build-css.mjs` : `--check` exit 0 ; test d'équivalence règle à règle (`visual.spec.js`)
passe. `js/platform/prepaint.js` : script classique non bloquant, cause/effet conformes.

Lighthouse rejoué deux fois (5 exécutions chacune) :

- Passage 1 : 0,97/0,99/0,99/0,99/0,99 → pessimiste **0,97**, LCP 1,81–2,42 s. Passe.
- Passage 2 : 0,99/**0,83**/0,99/0,97/0,99 → pessimiste **0,83**, LCP jusqu'à 4,04 s. Échoue.

9 exécutions sur 10 sont ≥ 0,97 (cohérent avec 0,98–0,99 annoncé) ; une tombe à 0,83, **pendant que
deux `audit-contrast.mjs` tournaient déjà en fond** (même confusion qu'au §1). F rapporte de son
côté trois séries de 5 exécutions non confondues, toutes vertes (0,98/0,99/0,98). Preuve la plus
propre disponible : celle de F. Je ne peux ni confirmer ni infirmer une fragilité résiduelle sous
charge normale ; je signale le fait brut plutôt que de trancher sur une mesure confondue par ma
propre méthode de vérification.

## 8. Régression thèmes clairs — vérifié

`--chip-on: #36628f` (light) : recalcul indépendant → **6,36:1** texte blanc, **4,28:1** sur
`--chip-bg` — exact. `--muted` (courbe du récap) : 3,63–5,93 sur les 16 variantes, 0 échec.

## 9. Garde-fou couleurs en dur (D5.3) — nouveau, vérifié

`scripts/lint-tokens.mjs`, câblé dans `npm run lint` et en CI, plafond figé par fichier/propriétaire
(32 valeurs, dette nommée). `node scripts/lint-tokens.mjs` → exit 0. C'est le garde-fou réclamé au
tour 2, honnêtement construit.

---

## Comparaison à l'aveugle (dernier passage)

**D5 : préférence ScoreTrack**, confiance 4/5. 14 thèmes cohérents, échelle qui suit le système à
200 %, 0 requête externe, icônes harmonisées, CLS 0,018, garde-fou anti-couleurs en dur : rien de
comparable n'est documenté pour la référence.

**D6 : préférence ScoreTrack**, confiance 4/5. Séparabilité chromatique jusqu'à 6 joueurs (mesurée,
porte stricte au-delà), 12 sièges identifiables sans couleur (D18, vérifié visuellement), daltonisme
mesuré, publié et bloquant — ce qu'aucune référence ne documente. Seule réserve : la porte de
séparabilité elle-même n'a pas la marge D21 (§5), un point de méthode invisible à l'écran.

## Verdict

| Dimension                           | Score   | Détail                                                                                     |
| ----------------------------------- | ------- | ------------------------------------------------------------------------------------------ |
| **D5 — Système visuel & thèmes**    | **5/5** | 5.1 OUI · 5.2 OUI · 5.3 OUI (nouveau) · 5.4 OUI · 5.5 non revérifié ce tour, non contredit |
| **D6 — Accessibilité & daltonisme** | **5/5** | 6.1 OUI (2/3 runs propres identiques) · 6.2/6.3/6.4 hors périmètre B · 6.5 OUI             |

### AAA : **oui**, avec deux réserves écrites, non bloquantes.

Sur trois exécutions consécutives de l'audit de contraste, les deux exécutions non confondues par ma
propre méthode de test sont identiques au bit près sur 21 942 lignes ; le seul écart (run1, 8 échecs
sur `dark`) coïncide avec une contention machine que j'ai moi-même créée, pas avec l'exécution
normale du projet. Tous les autres points annoncés par B sont vérifiés vrais et chiffrés à l'identique
de ce qui est documenté : seuil transitoire ratifié sans contradiction de code, faux positifs du
pavé éliminés, palette/CVD recalculés exactement, thème automatique testé, premier rendu réellement
accéléré, régression des thèmes clairs corrigée, nouveau garde-fou anti-couleurs en dur.

**Ce qui reste à faire, non bloquant pour AAA, à consigner** :

1. `scripts/audit-cvd.mjs` (ligne 171-179) : appliquer la marge D21 (0,2) à `SEPARABLE_MIN_DE`,
   comme `audit-contrast.mjs` le fait déjà pour le contraste. **B.**
2. Durcir `audit-contrast.mjs` contre la contention machine (délai plus large ou double exécution
   de confirmation en CI) pour les thèmes à couches multiples (`dark`, `cyber`). **B.**
3. Confirmer, hors contention, la stabilité du budget Lighthouse (F l'a fait ; à surveiller si un
   run rouge réapparaît en CI réelle). **B/F, déjà en cours.**
