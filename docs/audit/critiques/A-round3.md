# Critique de l'élément A — tour 3 (final)

Base : **arbre de travail au 19/09 08:20** (HEAD 57c88d9 + deux fichiers de A non committés :
`js/ui/game.js`, `tests/e2e/game.spec.js`), archivé dans `critic/A3/repo/` et servi sur un port
dédié. Scripts `critic/A3/w*.mjs`, mutations `critic/A3/patches/`, journaux `critic/A3/*.log|json`,
captures `critic/A3/shots/`. Aucun fichier du dépôt modifié par moi.

## 1. Suites sur l'arbre de travail

- `--project=mobile-chromium --workers=1` : **71 passés, 1 échec** — `a11y.spec.js › axe-core … contraste
sur les 14 thèmes` sur le thème `light` (`color-contrast`). C'est la feuille `css/themes.css` que B
  modifie encore (`--gain`/`--loss` des thèmes clairs) : chantier B/C, hors écran de jeu. **Tous les tests
  de A passent.**
- Projet `perf`, 2 exécutions sur machine au repos : 4/4 verts les deux fois (détail §2.4).

## 2. Les sept affirmations, vérifiées

**2.1 Thème arcade.** Partie neuve en arcade, 390×844, 12 joueurs, score 1234 : cartes latérales
« 1234 » à 32,4 px de corps → **32 px de capitale**, cartes centrales « 1⏎234 » → 39 px (`w8`,
`w11`). Même valeur avec le protocole du test (bascule + `remeasure`). À 7 chiffres : 25 px sur les
deux cartes centrales, 29 sur les latérales — c'est l'exception documentée et verrouillée (`≥ 24`).
Le test tourne sur les 14 thèmes ; son annotation donne le pire par cas : 98 (cyber) · 73 (arcade)
· 47 · 57 · 32 · 25. **Confirmé.** Remarque non annoncée par A : la bande réservée à la bulle a
coûté 3 px au cas vitrine — **101 → 98 px à 4 joueurs**, marge de 2 px sur le seuil de 96.

**2.2 Le 4,44 : qui avait raison ?** Mon 4,44 du tour 2 portait sur le **score** de la carte 9 en
thème clair (pire cellule sur 8, moyenne 4,51), pas sur le numéro de siège. Rejoué avec le même
instrument sur le snapshot du tour 2 : 4,51 pire / 4,57 moyenne / 4,70 mode ; couleurs du score et
de la carte identiques entre les deux snapshots ; sur l'arbre final : **5,69 / 5,75 / 5,93**. La
paire était donc réelle mais marginale et bruitée (±0,07 selon la densité de pixels), et elle a
disparu parce que la teinte d'état ne touche plus le chiffre. L'explication de A (bordure du numéro
polluant l'histogramme) décrit **son** faux échec à 1,7 sur le numéro de siège, pas ma mesure : sur
le numéro, boîte entière / bord exclu / centre du disque donnent 12,7 / 12,7 / 12,5 — jamais rien
d'approchant 4,5. Ce qu'un œil voit : un bleu saturé `#2b48b4` sur une carte gris-bleu pâle,
parfaitement lisible ; entre 4,5 et 4,7 la différence n'est pas perceptible. **Les deux
instruments avaient raison sur ce qu'ils mesuraient ; le litige est clos par la conception.**

**2.3 Test de contraste étendu.** 12 couleurs × 7 états × 3 textes vérifiés dans le code (1 176
mesures). Ma contre-mesure indépendante, pire cellule sur 8 : **3 528 mesures, 0 échec selon D20**,
score au repos ≥ 5,11, transitoire ≥ 3,45, numéro ≥ 8,86, prénom ≥ 6,45 ; **0 mesure à moins de
0,2 d'un seuil (D21)**. L'invariant « aucun état ne dégrade un fond de plus de 0,3 » est présent ;
je l'avais montré vrai par construction au tour 2 (teinte de bord opaque sans effet). **Confirmé.**

**2.4 Fluidité et sensibilité (vérifié par mutation).**

| Exécution                                                                                         | Résultat                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| perf sain ×2                                                                                      | réactivité médiane **28,5–29,0 ms**, p95 32,3–32,5 ; fluidité 0/148–150 trames perdues, durée cartes/témoin 1,00 ; sensibilité : +16 ms → rapport **1,198 / 1,247** (seuil 1,12), sain 1,006 / 1,037 |
| **S1** injection retirée du test de sensibilité                                                   | **ÉCHEC** attendu obtenu : « 16 ms de blocage par tap doivent être détectés », rapport 1,025                                                                                                         |
| **S2** 30 ms bloquants par tap dans l'application (l'angle mort du tour 2)                        | **ÉCHEC** attendu obtenu : durée 3 743 ms contre 2 650 (1,41), 9 trames perdues                                                                                                                      |
| Le plancher de 16 ms est écrit dans le code, mesuré à chaque exécution et défendu par un test qui |
| tombe si on lui retire son injection. **Confirmé, et l'angle mort du tour 2 est fermé.**          |

**2.5 Coûts de rendu.** Proxy : lectures de géométrie (`scrollWidth`/`clientWidth`/`clientHeight`)
par tap à 12 joueurs (`w4`). Arbre de travail : **0 par tap**, 84 lors d'un changement de longueur
(999 → 1000). **HEAD 57c88d9 : 84 par tap** — la régression (comparaison de texte) est bien dans le
dernier commit et n'est corrigée que dans le `js/ui/game.js` **non committé**. `trace: 'off'` sur le
projet perf : vérifié. **Confirmé — à condition de committer.**

**2.6 Bulle, encre, cible, texte système.** Bulle : apparition sans aucun décalage du score ni du
nom (0,0 px, corps inchangé) à 2/4/9/12 joueurs, visible de 150 à 1 550 ms, 0 intersection avec la
boîte du score, corps ≥ 13,9 px (`w3`, `w7`) ; le test échoue sans la correction (mutation M1 du
tour 2). Encre : 0 rognage sur les 14 thèmes à 12 joueurs / 7 chiffres (`v6`, tour 2, refait). Cible
du nom : boîte visible 24×71 px mais **zone atteignable ≥ 96×45 px à 12 joueurs, 45×120 à 4**,
point central atteint 12/12 (`w9`) ; à 200 % de texte système : prénom **23 → 47 px** à 4 joueurs
(exact), 0 tronqué, 0 encre de score sous le bloc nom, zone atteignable ≥ 45×45 (`w10`, `w11`).
**Confirmé.** Réserve : à 12 joueurs et 200 %, certains prénoms passent de 16 à **12 px** —
agrandir le texte système les rétrécit, car le numéro doublé prend la largeur. Mineur, à noter.

**2.7 Icônes de signe.** 14 thèmes × 24 signes × 3 états, couleur **composée** avec l'opacité sur le
fond peint (`w6`) : plancher **8,90 au repos, 8,69 pressé**, 0 mesure sous 4,5. Le 2,63 de l'autre
critique ne peut venir que de l'état **désactivé** (`opacity: 0.25` → 1,57 composé), c'est-à-dire
une carte éliminée, recouverte par le voile noir à 82 % et le cartouche « Éliminé » : contrôle
inactif, hors champ du critère. **Artefact confirmé** (avec un plancher plus élevé que les 4,26 annoncés).

## 3. Jouer, casser

Les 22 scénarios du tour 1 rejoués (`w5`) : salve de 20 taps, deux doigts, tap pendant l'animation,
rotation pendant un appui long, annulation pendant les confettis, pavé + rechargement, élimination
puis annulation, −1 234 567 à 12 joueurs, undo/redo ×40, reprise : **tout passe, 0 erreur console.**
Un défaut résiduel trouvé : la minuterie de groupe d'une partie survit à un reset. Tap, reset,
nouvelle partie, tap dans les 1,5 s : la première bulle de la nouvelle partie disparaît à **900 ms**
au lieu de 1 500 (`w11`, cas 1). Cause : les minuteries de `js/fx/score.js` vivent dans un `WeakMap`
par nœud, mais `closeGroupFor(pi)` cible `df-${pi}` par identifiant, et `leaveGame`/`buildGrid` ne
les purgent pas. **Mineur** (fenêtre de 1,5 s, une seule bulle), correction : vider les minuteries
de bulle dans `leaveGame()`.

## 4. Regard de directeur artistique (captures `scratchpad/A/after2/`)

- **4 joueurs (vitrine)** : deux « 40 » par colonne à 98–129 px selon le thème, prénoms complets
  jusqu'à 18 caractères, badges de siège, séparateur médian discret, signes cerclés. C'est au niveau
  de Carbon, avec plus de matière (texture hexagonale) que ses aplats — lisible à 1 m sur la capture
  à 25 %. `jeu4-ldm` (Cinzel or sur brun) est la plus belle image du produit.
- **12 joueurs / 7 chiffres** : le score sur deux lignes est la bonne décision, la bulle « +1 234 467 »
  trouve sa bande sans rien pousser. Point faible persistant : la colonne centrale — nom d'un côté,
  chiffre de l'autre, 400 px de texture entre les deux ; et la bulle du haut frôle les signes.
- **États** (`etats-presse-butee`) : cadre bleu (pressé) / cadre orange (butée) nets, hors du chiffre.
- **Pavé** : la valeur « −17 » en orange est désormais l'élément dominant — corrigé depuis le tour 1.
- **Récap** : le prénom « Bartho… » tronqué alors que la place existe (colonne de courbe à largeur
  fixe) et l'en-tête de journal qui se replie sur deux lignes sont les deux défauts cosmétiques restants.

## 5. Notes finales

| Dimension | Tour 1 | Tour 2 | **Tour 3** | Motif                                                                                                                                                                                                                                           |
| --------- | ------ | ------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1.4      | 5      | 5      | **5**      | inchangé                                                                                                                                                                                                                                        |
| D2        | 2      | 3      | **5**      | 2.1 : 98 px à 4 j sur le pire thème, ≥ 32 px à 12 j / 4 chiffres sur les 14, exception arcade > 10⁶ documentée et verrouillée ; 2.2 : 0 échec sur 3 528 mesures, aucune à moins de 0,2 du seuil ; 2.3 selon la méthode de la grille ; 2.4 ; 2.5 |
| D3        | 4      | 5      | **5**      | multitouch jusqu'à 5 doigts, 29 ms de retour, cible du nom 45 px réels                                                                                                                                                                          |
| D4        | 3      | 5      | **5**      | bulle en bande réservée, 0 trame perdue, instrument étalonné à 16 ms et prouvé par mutation dans les deux sens                                                                                                                                  |
| D8        | 5      | 5      | **5**      | inchangé ; défauts cosmétiques du récap listés                                                                                                                                                                                                  |

## 6. Aveugle (BLIND-PROTOCOL, asymétrie de preuve assumée)

| Dim. | T1      | T2      | **T3** | Confiance | Motif                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---- | ------- | ------- | ------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D2   | B       | Indécis | **A**  | 4/5       | Mutility tient « large life totals » à 4 joueurs ; A le tient aussi (98–129 px mesurés) et le tient encore à 12 joueurs, à 7 chiffres, sur 14 thèmes, avec un contraste mesuré sur pixels et une identité non chromatique. Ce qui m'empêchait de préférer A au tour 2 — un thème à 25 px sur un score courant, une paire à 4,44 — n'existe plus. Ce qui reste (composition de la colonne centrale, 18 caractères tronqués à 12 joueurs) est cosmétique ou physique. |
| D3   | Indécis | A       | **A**  | 4/5       | inchangé                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| D4   | Indécis | A       | **A**  | 5/5       | aucune référence ne publie une mesure de fluidité étalonnée et falsifiable                                                                                                                                                                                                                                                                                                                                                                                          |
| D8   | A       | A       | **A**  | 4/5       | inchangé                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

## 7. Verdict : **AAA — oui pour l'élément A**, sous deux conditions matérielles

1. **Committer `js/ui/game.js`** (comparaison de longueur) : sans lui, HEAD relit 84 fois la géométrie
   à chaque tap à 12 joueurs — le gain de 2.5 n'existe que dans l'arbre de travail.
2. L'échec `a11y › axe-core › light` appartient au chantier de B sur `css/themes.css` ; il doit être
   vert au commit final, mais il n'est pas imputable à l'écran de jeu.
   Mineurs, hors verdict : minuterie de bulle survivant au reset ; prénoms réduits à 12 px à 200 % et
   12 joueurs ; troncature du récap ; composition de la colonne centrale à 8/10/12 joueurs.
