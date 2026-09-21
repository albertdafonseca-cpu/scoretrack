# D-critique-round2 — Élément D : interface, accessibilité, i18n

Agent critique indépendant, round 2. Cible auditée : tête de la branche
`claude/audit-qualite-aaa-lmthte` au moment de cette vérification, commit
`de0582b`, qui inclut le commit de réponse de l'élément D `8b7a42e` (« focus
visible, piège de focus/Échap, contraste mono-light ») répondant à
`docs/audit/D-critique-round1.md`.

Toute vérification a été exécutée dans un nouveau `git worktree --detach`
isolé (`/tmp/.../scratchpad/d-critique-wt-r2`, supprimé en fin de round),
jamais dans `/home/user/scoretrack`. `npm install && npm run build` propres
exécutés dans ce worktree. Seul ce nouveau fichier est écrit dans le dépôt
partagé ; `docs/audit/D-critique-round1.md` n'a pas été modifié.

## Verdict

**AAA : oui**, sur les 3 défauts qui étaient miens à revérifier (P1-1 focus
visible, P1-2 piège de focus/Échap, P2 contraste mono-light). Les 3
corrections tiennent sous des conditions réelles de clavier/tactile, pas
seulement en lecture de code, et ne régressent ni le geste de glissement du
lanceur de dés ni les autres thèmes. Le P0 (fetch service worker vers
Google Fonts, hors périmètre D) est bien retiré à l'état actuel — confirmé
par la disparition de toute référence `googleapis`/`gstatic` dans
`src/sw-worker.ts` et `dist/sw.js`, poids du fichier compilé passé de
2,5 Ko à 1,8 Ko.

Aucun nouveau défaut P0/P1 trouvé. Deux observations mineures, non
bloquantes, à noter pour un futur tour (§5) : le focus n'est pas restitué à
l'élément déclencheur à la fermeture d'une boîte (revient sur `<body>`), et
deux thèmes préexistants (`light` 3.16:1, `ldm-day` 3.21:1, ni l'un ni
l'autre touchés par ce round) restent proches du seuil WCAG — sans
régression, mais à garder à l'œil si la règle du BRIEF (« une valeur proche
du seuil est un défaut ») doit un jour s'appliquer strictement à eux aussi.

---

## 1. P1-1 — Anneau de focus réellement peint, sans délai (clavier réel, capture non rognée)

Parcours 100 % clavier réel (`page.keyboard.press('Tab')`, jamais `.focus()`
programmatique) depuis le tout premier chargement :

- `Tab` ×2 → `#btn-privacy-accept` ; capture d'écran prise **immédiatement**
  après le 2ᵉ `Tab` (pas d'attente ajoutée, pour retomber dans le même piège
  de mesure que round 1 si le correctif ne tenait pas) : anneau visible dès
  cette capture (zoom ×3 fourni en preuve dans le scratchpad). `getComputedStyle`
  au même instant : `outlineWidth: "2px"`, `transitionDuration: "0s"` (contre
  `"0px"` en round 1).
- Diff pixel par pixel (avant Tab vs immédiatement après) : bande de
  différence exactement alignée sur le rectangle du bouton (`y:696-756`,
  le bouton mesure `y:700-753`) — la différence n'est pas un artefact, c'est
  bien l'anneau qui apparaît.
- Contraste de l'anneau (`--accent:#9965A9`) contre le fond de page
  (`rgb(10,10,15)`) : **4.5:1**, au-dessus du seuil WCAG 1.4.11 (3:1) pour
  un indicateur non textuel.
- Même vérification sur `#go-btn` (« NEXT → ») après un vrai parcours
  clavier (clic souris sur un préréglage, puis 3×`Tab` réels) :
  `outlineWidth: "2px"`, anneau visible à l'écran.
- Effet de bord relevé en cours de vérification (non bloquant) : la
  correction ne fixe `transition-duration:0s` que dans la règle
  `:focus-visible` elle-même — quand le focus **quitte** un bouton, la
  disparition de son anneau reste soumise à la transition normale de sa
  classe (`transition:all 0.18s` sur `.go-btn`/`.lang-flag-btn`), d'où un
  bref « fantôme » de l'anneau précédent observable sur un screenshot pris
  à l'instant exact du changement de focus. Sans conséquence pratique
  (l'anneau du nouvel élément est déjà visible en simultané, et le
  fantôme s'estompe d
e lui-même) — mentionné pour mémoire, pas un défaut.

**Mutation testing (indépendant, différent de ce que le constructeur a
cassé)** : suppression de la seule ligne `transition-duration:0s;` ajoutée
dans la règle `:focus-visible` → le nouveau test
`anneau de focus réellement rendu (round 2)...` échoue immédiatement
(`Expected: >0, Received: 0`). Restauré → vert. `git diff --stat` vide
confirmé après restauration.

---

## 2. P1-2 — Piège de focus et Échap, clavier réel (15-20+ Tab consécutifs)

### 2.1 — `#score-modal` et `#dice-overlay` (les 2 demandés)

Ouverts via le même chemin que la vraie UI (`openScoreModal`/`openDice`
exportés, après un vrai parcours souris jusqu'à la partie en cours) :

| | `#score-modal` | `#dice-overlay` |
|---|---|---|
| Focus déplacé dans la boîte à l'ouverture | Oui (`sign-minus`) | Oui (`dice-config-toggle`) |
| 20× `Tab` réels, jamais sorti | **0/20** sorti | **0/20** sorti |
| 20× `Shift+Tab` réels, jamais sorti (score-modal, testé en plus de la demande) | **0/20** sorti | — |
| `Échap` ferme | Oui (`hidden` repasse `true`) | Oui |

Séquences de focus complètes consignées (boutons signe, pavé numérique,
confirmer/annuler pour le score ; +/- dés, sélecteurs, lancer, fermer pour
les dés) : aucune ne quitte jamais le conteneur. Le piège fonctionne dans
les deux sens (Tab et Shift+Tab), pas seulement dans le sens demandé au
round 1.

### 2.2 — Geste de glissement du lanceur de dés : non-régression confirmée

`src/dice-ui.ts` est absent du diff du commit `8b7a42e` (vérifié par
`git show --stat`), donc structurellement non affecté. Vérifié en plus
**fonctionnellement**, avec de vrais événements tactiles simulés
(`TouchEvent` réels, pas un simple clic) sur `.dice-sheet` :

- glissement de 60 px, lent (400 ms/segment, vitesse ≈0.075px/ms) → reste
  **en dessous** des deux seuils (120 px, 0.3 px/ms) → `dice-overlay` reste
  ouvert (attendu et confirmé).
- glissement de 150 px, rapide (20 ms/segment) → dépasse le seuil de
  distance → `dice-overlay` se ferme (attendu et confirmé).

Les deux seuils documentés dans `CLAUDE.md` (120 px / 0.3 px·ms) sont
inchangés et toujours respectés.

### 2.3 — Les 5 autres boîtes (`winner-modal`, `reset-modal`, `elim-modal`, `endgame-modal`, `recap`) : cohérence vérifiée

- `winner-modal` : focus déplacé à l'ouverture, **`Échap` ne ferme
  effectivement rien** (conforme au choix documenté — aucun bouton
  « Annuler » n'existe pour cette boîte), et **le piège de focus reste actif
  malgré tout** (10/10 `Tab` sans sortir) — cohérent : l'absence d'Échap
  n'ouvre pas de brèche dans le piège de focus.
- `reset-modal`, `elim-modal`, `endgame-modal`, `recap` : focus déplacé à
  l'ouverture et `Échap` ferme sur les 4, comme annoncé.

### 2.4 — Mutation testing (indépendant, mutation différente de celle du constructeur)

Dans `src/animations.ts`, la ligne `if (e.key !== 'Tab') return;` du piège
de focus a été remplacée par un `return;` inconditionnel (désactive
uniquement le piège Tab, sans toucher à la branche `Échap` juste
au-dessus) :
- Test `#score-modal : focus déplacé...` → échoue
  (`Tab ne devrait jamais faire sortir le focus... Received: true`).
- Test `#dice-overlay : focus déplacé...` → échoue également (timeout,
  autre symptôme de la même cause).

Restauré → les 12/12 tests e2e repassent verts, `git diff --stat` vide
confirmé.

### 2.5 — Vérification de non-régression (item 5 du mandat) : aucun nouveau défaut trouvé, une réserve mineure documentée

Testé au-delà de la demande explicite pour chercher un effet de bord du
`MutationObserver`/piège de focus global :
- Aucune exception JS (`pageerror`) lors de l'ouverture/fermeture de
  chacune des 7 boîtes, ni quand aucune n'est ouverte et qu'`Échap`/`Tab`
  sont pressés normalement sur la page.
- **Cas limite relevé, non bloquant** : `currentOpenDialog()` retourne la
  première boîte trouvée ouverte dans l'ordre du tableau `DIALOGS`
  (`dice-overlay` en premier). Si deux boîtes étaient ouvertes
  simultanément (forcé ici via un appel direct à
  `openScoreModal`+`openDice` à la suite, sans passer par l'UI réelle), le
  piège de focus/Échap ne s'applique qu'à la première trouvée. **Non
  exploitable en usage normal** : `.modal-overlay{position:fixed;inset:0;
  z-index:200}` couvre tout l'écran et intercepterait tout clic/tap vers le
  FAB des dés tant que le modal de score est affiché — ce cas n'est
  atteignable qu'en contournant l'UI par API JS directe, jamais par un
  utilisateur réel. Mentionné pour mémoire, pas un défaut à corriger dans
  l'immédiat.

---

## 3. P2 — Contraste chip off/on `mono-light` : corrigé et mesuré sur les pixels réels

`--chip-on` de `mono-light` est passé de `#4477AA` à `#0050d0` (=
`--accent` déjà utilisé par ce thème). Mesuré indépendamment de deux façons :

1. Sur les valeurs CSS effectivement appliquées au DOM après
   `applyTheme('mono-light')` (`getComputedStyle(document.documentElement)`) :
   **4.28:1** — identique à la valeur annoncée par le constructeur.
2. Sur `background-color` réellement calculé de vrais éléments `.points-chip`
   / `.points-chip.on` présents dans la page (pas une variable CSS isolée) :
   `rgb(204,204,204)` / `rgb(0,80,208)`, même ratio.

Au-dessus du seuil WCAG 1.4.11 (3:1), avec une marge confortable (+46 %).

**Vérification de non-régression sur les autres thèmes** (demande du
mandat, formulée comme « light-blue »/« sépia » — après vérification ces
deux noms ne correspondent à aucun `data-theme` du projet ; les thèmes que
j'avais mesurés au round 1 avec des ratios de 3.16:1 et 3.21:1 sont en
réalité **`light`** et **`ldm-day`**, ni l'un ni l'autre touchés par ce
commit) : recalculé la table complète des 21 thèmes déclarant
`--chip-bg`/`--chip-on` dans `index.html` — tous identiques au round 1 sauf
`mono-light`. Aucune régression. **Observation non bloquante** : `light`
(3.16:1) et `ldm-day` (3.21:1) restent proches du plancher WCAG — je ne les
avais pas signalés comme défaut au round 1 (seul `mono-light`, alors sous
3:1, l'était) et je ne le fais pas non plus ici puisqu'ils sont
numériquement conformes et non régressés, mais je les note pour un futur
tour si la marge de tolérance venait à se resserrer.

**Mutation testing (indépendant)** : `--chip-on` de `mono-light` remis à
`#4477AA` → le test `contraste chip off/on du thème mono-light >= 3:1`
échoue en réaffichant exactement **2.93:1** (même valeur qu'au round 1,
confirmant la cohérence de la mesure). Restauré → vert.

---

## 4. Non-régression générale

`npm run typecheck` (3 tsconfig), `npm run lint` (0 erreur, mêmes 565
avertissements préexistants), `npx vitest run` (87/87), `npm run build`,
`npx playwright test` (12/12, y compris les 4 nouveaux tests du round 2)
tous revérifiés verts indépendamment après chaque restauration de mutation.
`git diff --stat` vide dans le worktree à la fin de la vérification.

---

## 5. Résumé pour mémoire (non bloquant, aucun défaut ouvert)

1. Focus non restitué à l'élément déclencheur à la fermeture d'une boîte
   (revient sur `<body>` plutôt que sur le bouton/carte qui a ouvert la
   boîte) — recommandation ARIA APG, jamais demandée explicitement dans les
   rounds précédents, à envisager si un futur tour approfondit encore
   l'accessibilité clavier.
2. Thèmes `light` (3.16:1) et `ldm-day` (3.21:1) : contraste chip off/on
   proche du plancher WCAG 1.4.11, non régressé, non corrigé (hors demande
   des deux rounds).
3. Cas limite théorique §2.5 (deux boîtes ouvertes simultanément) :
   inatteignable par l'UI réelle, documenté par précaution.

Aucun de ces trois points ne bloque le verdict AAA de cet élément sur les
critères effectivement audités dans les rounds 1 et 2.
