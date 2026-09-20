# C-critique-round2 — Audit qualité AAA, élément C (moteur de dés 3D)

Agent CRITIQUE indépendant, élément C, round 2. Commit constructeur revu :
`79bd8aa` (réponse à `docs/audit/C-critique-round1.md`). Toutes les
vérifications ci-dessous ont été reproduites **par moi-même**, dans un
`git worktree --detach` isolé sur ce commit exact, jamais dans le dépôt
principal partagé, puis supprimé une fois le travail terminé. Aucune
modification apportée à un fichier du dépôt partagé autre que ce
compte-rendu (`docs/audit/C-critique-round1.md` n'a pas été touché).

## Verdict

# **AAA : OUI**

Le P1 du round 1 est corrigé et vérifié indépendamment avec une mutation que
je n'avais pas soumise moi-même. Les deux reformulations P2 sont fidèles à
mes mesures du round 1, pas édulcorées. Zéro régression visuelle, à nouveau
confirmée indépendamment. Aucun nouveau défaut P0/P1 trouvé.

---

## 1. P1 — couverture de `catalanDie`/`onSphere` — CORRIGÉ, vérifié indépendamment

**Ce qui a été ajouté** (`tests/dice3d.geometry.test.ts`, +5 tests) : mesure
quantitative de l'écart-type des distances des sommets au centre (0 =
silhouette parfaitement ronde), appliquée aux deux configurations
réellement verrouillées par D-CLAUDE-1 (`onSphere=true` pour le d48,
`onSphere=0.85` pour le d120), un test de monotonicité sur `t`, et un test
de bout en bout sur `dieGeometryFor(48)`/`dieGeometryFor(120)` (le vrai
point d'entrée de production, pas seulement `catalanDie` appelé isolément).

**Vérifications indépendantes effectuées** (worktree isolé sur `79bd8aa`,
`npm run build` + `npm test` propres au préalable) :

1. **Reproduction exacte de ma mutation du round 1** (`t=(onSphere===true)?
   1:onSphere;` → `t=t*0.1`) : **2/22 tests géométrie échouent** (le test
   d48 dédié et le test de bout en bout `dieGeometryFor`), confirmant que la
   mutation qui passait inaperçue en round 1 (0/79) est bien attrapée
   maintenant. Restauré, `git diff --stat` vide reconfirmé.
2. **Mutation indépendante n°1 (différente de celle du constructeur et de
   la mienne du round 1)** : échange des arguments `onSphere` entre les cas
   `48` et `120` de `dieGeometryFor` (`catalanDie(archTruncCuboctahedron,
   1.35, 0.85)` / `catalanDie(archTruncIcosidodecahedron, 1.35, true)`) —
   exactement le scénario « copier-coller malheureux » cité dans
   `DECISIONS-C.md`. **1/22 test échoue** (le test de bout en bout), les 4
   tests qui appellent `catalanDie` directement avec les bons arguments
   restent verts sans surprise (preuve que le test de bout en bout apporte
   une couverture réellement distincte des tests unitaires sur
   `catalanDie`). Restauré, vérifié vide.
3. **Mutation indépendante n°2 (dérive du réglage plutôt qu'un échange
   grossier)** : `0.85` → `0.99` pour le d120 seul (valeur documentée par
   `CLAUDE.md` comme cassant visuellement le d120 — « à 1 ses faces
   fusionnent par paires »). **1/22 test échoue** (`stddev120 >
   1e-3` viole la borne basse : 0,00046 mesuré contre 1e-3 requis). Ceci
   montre que le test ne se contente pas d'attraper un échange grossier
   d48↔120, il détecte aussi une dérive fine du réglage lui-même. Restauré,
   vérifié vide.
4. **Solidité de la métrique** : j'ai extrait les valeurs réelles produites
   par le code de production via un test-sonde temporaire (jamais commité) :
   d48 (t=1) → écart-type 2,5·10⁻⁸ (≈0, conforme) ; d120 (t=0,85) → 6,88·10⁻³
   (entre les bornes 10⁻³ et 0,05 du test, avec marge confortable des deux
   côtés — ×6,9 et ÷6,9) ; d120 solide brut (sans sphérisation) → 4,58·10⁻²,
   qui correspond exactement au commentaire du constructeur (« stddev ~0,046
   ») ; d120 à t=1 → 1,5·10⁻⁸ (quasi 0, confirmant numériquement l'affirmation
   de `CLAUDE.md` : à t=1 les sommets de valence 4 deviennent coplanaires,
   même comportement dégénéré que si on forçait une sphère parfaite). Les
   chiffres documentés sont donc réels, pas inventés a posteriori.

**Conclusion §1** : le P1 est corrigé de façon solide. La couverture nouvelle
n'est pas un simple garde-fou contre LA mutation que j'avais soumise, elle
détecte un échange d'arguments et une dérive fine du réglage — deux classes
d'erreurs distinctes et plausibles dans un futur refactor.

## 2. P2 (fuite mémoire GPU) — reformulation fidèle aux mesures du round 1

Relu `DECISIONS-C.md` §1.1 et le commentaire de `_disposeSceneResources`
(`src/dice-ui.ts`) mot à mot contre mes propres chiffres du round 1. La
reformulation :
- ne prétend plus une « fuite réelle... pas seulement théorique » ;
- cite mes deux mesures exactes (+226 Ko vs +210 Ko avec extension
  disponible ; +268 Ko vs +248 Ko sans l'extension) sans les déformer ;
- qualifie correctement le premier écart de « dans le bruit de mesure » et
  le second de « net mais modeste, mesuré une seule fois » — ce qui
  correspond exactement à la réserve que j'avais moi-même formulée (absence
  de triple exécution pour cette mesure précise) ;
- conserve le texte original en dessous avec une note explicite de
  correction plutôt que de le réécrire silencieusement (traçabilité,
  conforme à D-PREF-2).

Je n'ai pas redemandé de nouvelle mesure : la correction attendue était une
reformulation honnête, pas une nouvelle campagne de mesure, et c'est
exactement ce qui a été fait. **Conforme.**

## 3. P2 (garde-fou division par zéro non testable) — reformulation fidèle

`DECISIONS-C.md` §1.5 précise maintenant explicitement, dans les mêmes
termes que mon round 1, que le garde-fou `(maxr||1e-6)` ne peut être mis en
échec par aucune mutation sur les 5 solides réels, et que cette ligne est
retirée du décompte des mutations testées (8 → 10 en incluant les 2
nouvelles du round 2, l'ancienne mutation #5 sur `catalanDie` reste comptée
car elle porte sur le facteur d'échelle général, pas sur le garde-fou lui-
même — distinction correcte). **Conforme.**

## 4. Régression visuelle round 2 — reproduite indépendamment, confirmée absente

**Point d'attention légitime signalé par le constructeur** : le dépôt étant
partagé, une comparaison temporelle naïve (captures round 1 vs captures
prises après round 2) peut capter une dérive d'un fichier hors périmètre —
en l'occurrence `index.html`/polices modifiés entre-temps par d'autres
éléments, qui déplacent le texte « Total : N » à côté du dé sans toucher au
dé lui-même. J'ai reproduit ce risque et la méthode d'isolation
indépendamment :

**Protocole** : worktree isolé sur `79bd8aa` (donc avec l'`index.html`
committé à CE commit, constant pour toute la comparaison — pas de mélange
avec un `index.html` d'un autre commit). `git show 961a9ce:src/dice-ui.ts`
(version d'avant le round 2) substituée temporairement à
`src/dice-ui.ts`, build, capture des 16 cibles habituelles
(`round2before`) ; fichier restauré à sa version round 2, build, capture
(`round2after`). `tests/dice3d.geometry.test.ts` n'entre pas dans cette
comparaison binaire dice-ui.ts/index.html car les fichiers de test ne sont
jamais bundlés dans `dist/app.js` — aucun risque qu'ils affectent le rendu.

**Résultat : 16/16 captures identiques octet pour octet** (sha256), y
compris `rolled-d20`. Confirme que le round 2 (commentaire réécrit dans
`src/dice-ui.ts`, tests ajoutés, documentation) n'a introduit strictement
aucun changement de rendu — attendu, puisque `git show 79bd8aa -- src/
dice-ui.ts` ne montre qu'un seul hunk, purement commentaire (vérifié :
`git show 79bd8aa -- src/dice-ui.ts | grep -c "^@@"` → 1), et que
`src/dice3d/die.ts`/`polyhedra.ts` ne sont touchés par aucun diff du round 2.

**Sur la demande de vérifier que les changements d'autres éléments
(accessibilité HTML/CSS dans `index.html`/`animations.ts`) ne cassent rien
du rendu des dés** : à `79bd8aa`, capture visuelle du dé roulé (`d20`)
inspectée manuellement — rendu identique à celui du round 1 (même corps
violet, même halo, même typographie du total). Le protocole `round2before`/
`round2after` ci-dessus utilise déjà l'`index.html` réel et actuel du commit
`79bd8aa` (celui qui inclut les changements d'accessibilité déjà fusionnés
à cette date) comme référence constante pour les deux captures — un
sélecteur CSS commun cassé par un autre élément aurait donc affecté
`round2before` ET `round2after` de façon identique et n'aurait pas pu se
cacher dans cette comparaison. Aucun signe d'un tel problème n'a été
observé (dé net, chiffres lisibles, halo correctement positionné).

## 5. Reconfirmation rapide de l'outillage

Reproduit dans le même worktree isolé, sur `79bd8aa` :
- `npm run typecheck` → 0 erreur dans `src/dice3d/*`/`src/dice-ui.ts` (`grep
  -E "^src/dice"` sur la sortie → aucune ligne).
- `npm run lint` → 0 erreur, 565 avertissements (les 21 « erreurs »
  apparues lors d'une première tentative provenaient exclusivement de mon
  propre script de capture temporaire laissé par erreur dans le worktree —
  supprimé, résultat propre reconfirmé, aucune fausse alerte imputable au
  constructeur).
- `npm run build` → succès.
- `npm test` → **87/87 tests verts**, 9 fichiers.
- Périmètre (`git show --stat 79bd8aa`) : uniquement
  `docs/audit/{BRIEF,DECISIONS-C}.md`, `src/dice-ui.ts`,
  `tests/dice3d.geometry.test.ts` — conforme.

## 6. Défauts restants

Aucun P0/P1. Aucun nouveau P2 introduit par le round 2. Les deux P2 du
round 1 sont clos par reformulation honnête (pas de nouvelle mesure requise,
ce n'était pas ce qui était demandé).

## Conclusion

Les quatre conditions AAA du mandat (§6 du brief) sont réunies pour
l'élément C : plus aucun défaut P0/P1 reproductible, la correction ajoutée
en round 2 est couverte par des tests qui échouent réellement quand on
l'annule (3 mutations indépendantes testées par moi, dont 2 que je n'avais
jamais suggérées), zéro régression sur D-CLAUDE-1/D-CLAUDE-2 confirmée deux
fois indépendamment (round 1 et round 2), `npm run check` reste vert.

**AAA : OUI.**
