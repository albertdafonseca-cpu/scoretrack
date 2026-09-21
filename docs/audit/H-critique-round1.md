# H-critique-round1 — Vérification indépendante de l'élément H (round 4, post-clôture)

Agent critique indépendant, isolé dans un `git worktree --detach` sur
`fe90c26` (`/tmp/claude-0/.../scratchpad/wt`, supprimé en fin de mission —
`git worktree remove --force` confirmé, `git worktree list` ne montre plus
que le dépôt principal). Aucun fichier du dépôt partagé n'a été modifié en
dehors de ce rapport. Toutes les commandes, captures et PDF ci-dessous ont
été réellement exécutés/générés/inspectés dans ce worktree (pas de rendu
« généré mais jamais regardé » — chaque image a été ouverte et regardée).

## Verdict

**AAA : non.**

Le cœur du correctif — les 4 icônes SVG de l'interface — est du travail
sérieux et vérifié : distinguables par la silhouette seule, en couleur et en
niveaux de gris, à la fois en grand format et à la taille réelle d'affichage
(24 px). Le grep de non-régression est propre, le `MutationObserver` du
cadenas fonctionne réellement dans toutes les langues testées (y compris
2 des 4 langues signalées comme moins fiables par l'élément D), le périmètre
fichier est respecté, et aucune régression d'accessibilité n'a été trouvée
(35 tests e2e / 113 tests unitaires tous verts, revérifiés indépendamment).

Mais l'audit a trouvé, en creusant précisément ce que la mission demandait
de creuser (rendu PDF réel, mutation testing indépendant sur des cas
différents de ceux du constructeur) :
- **un vrai bug latent non couvert par un seul test** : si quelqu'un
  inversait demain les icônes trophée/crâne dans `src/recap-pdf.ts`, aucun
  des 113 tests unitaires ni des 35 tests e2e ne le détecterait (P1-1) ;
- **la garantie « distinguable sans la couleur » n'est vérifiée qu'une seule
  fois, à la main, et n'est pas protégée par un test répétable** : une
  mutation géométrique qui rapproche visuellement le cadenas du crâne passe
  tous les tests sauf un, qui la détecte par coïncidence pour une tout
  autre raison (P1-2) ;
- **l'émoji ☠️ le plus visible de toute l'application (il occupe la quasi-
  totalité de l'écran pendant l'animation d'élimination) reste un vrai
  emoji système**, et la justification donnée pour ne pas le traiter est
  affaiblie par la propre preuve du constructeur, ailleurs dans le même
  commit, que le mécanisme qu'il redoute fonctionne déjà (P1-3) ;
- un défaut mineur de fidélité à l'échelle réelle d'impression du PDF (P2-1).

Ces défauts sont documentés ci-dessous avec preuves reproduites (sorties de
commandes réelles, captures inspectées). Aucun n'est une régression de
sécurité ni un émoji réapparu dans le périmètre déclaré — mais la mission
demandait explicitement une vérification adversariale « zéro crédit pour
une affirmation non prouvée », et sur ces trois points précis, la preuve
apportée par `DECISIONS-H.md` ne tient pas à l'examen.

---

## 1. Les 4 icônes SVG — vérification visuelle réelle (la plus importante, item 1)

Bundle `src/ui-icons.ts` compilé isolément (`esbuild`, IIFE), injecté dans
une page de test, capturé par Playwright/Chromium avec `--use-gl=swiftshader`
puis **réellement regardé** (pas seulement généré) — deux échelles :

**Grand format (120px), couleurs arbitrairement différentes puis
`filter:grayscale(100%) contrast(1.1)` sur toute la page :**

Couleur : trophée orange, drapeau bleu, crâne rose, cadenas vert.
Niveaux de gris : les 4 silhouettes restent immédiatement et
individuellement reconnaissables — coupe à anses/socle, drapeau à damier,
tête ronde à orbites/dents, cadenas à anse/trou de serrure. Confirmé par
inspection directe des deux images (`shot-color.png`/`shot-gray.png`).

**Taille réelle d'usage (24px, `deviceScaleFactor:4` pour rendre les pixels
lisibles dans ce rapport sans ajouter de faux détail), même filtre gris :**

Même verdict à cette échelle beaucoup plus contraignante : les 4 icônes
restent distinguables sans ambiguïté — c'est la vérification que
`DECISIONS-H.md` §3.1 ne fait qu'en grand format (« grille isolée »), sans
tester la taille réelle d'usage. **Ce point précis passe donc, et passe
même plus largement que ce que le constructeur avait vérifié.**

Aucune paire ne devient ambiguë. Ce point du brief (« la vérification la
plus importante de ce round ») est validé.

## 2. Absence réelle de tout émoji fonctionnel dans le périmètre déclaré

```
$ grep -rn '💀\|🏆\|🔒\|🏁' index.html src/game.ts src/recap-pdf.ts
$ echo $?
1
```

0 occurrence, confirmé. `translations.ts` (hors périmètre) :

```
$ grep -c '🔒' src/i18n/translations.ts
36
```

36 = 18 langues × 2 clés (`privacyTitle`, `btnPrivacy`), exactement ce que
`DECISIONS-H.md` §1/§4 annonce.

## 3. `MutationObserver` du cadenas — testé réellement dans 7 langues, dont 4 signalées peu fiables

Build réel (`dist/index.html`), `window.ScoreTrack.i18n.applyLang(code)`
appelé pour chaque langue, lecture de `textContent`/`innerHTML` des deux
éléments concernés après l'appel :

```
fr : btnText=" Politique de confidentialité"   (SVG présent, 0 émoji)
en : btnText=" Privacy policy"                  (SVG présent, 0 émoji)
ar : btnText=" سياسة الخصوصية"                  (SVG présent, 0 émoji)
ja : btnText=" プライバシーポリシー"             (SVG présent, 0 émoji)
ko : btnText=" 개인정보 정책"                    (SVG présent, 0 émoji)
zh : btnText=" 隐私政策"                         (SVG présent, 0 émoji)
de : btnText=" Datenschutzrichtlinie"           (SVG présent, 0 émoji)
```

`titleText`/`titleHTML` (page confidentialité) : même résultat pour les
7 langues. **`ar`/`ja`/`ko`/`zh` sont 4 des langues signalées à confiance de
traduction réduite par D19** (`BRIEF.md` D19) — testées ici spécifiquement
parce que la mission le demandait, et le correctif fonctionne bien pour
elles aussi (le `MutationObserver` détecte le préfixe par point de code,
indépendamment de la langue, donc c'était attendu, mais fallait le
vérifier). `page.on('pageerror')` : aucune erreur JS levée pendant le
cycle. **Ce point passe.**

## 4. Rendu PDF réel — généré, converti en image, regardé (item 3)

Un vrai export PDF a été généré via un vrai navigateur (pas une simulation) :
partie jouée jusqu'à une élimination réelle (`game.adjust()`), un joueur
forcé `winner=true` pour obtenir les deux statuts sur la même page,
`recapPdf.exportRecapPDF()` appelé réellement, téléchargement intercepté
(`page.on('download')`), sauvegardé en `.pdf`, converti en PNG avec
`pdftoppm` à deux résolutions.

**À 300 dpi (zoom d'inspection) :** trophée et crâne sont tous deux
clairement lisibles, formes cohérentes avec les SVG d'interface.

**À 96 dpi — l'échelle RÉELLE à laquelle un utilisateur verrait ces icônes
en ouvrant le PDF dans une visionneuse à 100 % de zoom, ou en l'imprimant
sur une page A4 et en le regardant à une distance normale (item 3 de la
mission, explicitement : « reconnaissables à l'échelle réelle
d'impression ») :**

Le trophée (crop 10× nearest-neighbor sur les pixels natifs, aucun détail
ajouté) reste net : coupe, anses, socle tous visibles même à ~15 px de
haut. **Le crâne, à la même taille absolue (2,6 mm, même paramètre
`size` dans `drawSkullIcon`), se réduit à une forme ronde grise avec deux
points blancs — le nez et les dents (le `doc.triangle(...)` du bas)
disparaissent complètement dans le rendu à cette résolution.** Le résultat
ressemble davantage à un visage/fantôme générique qu'à un crâne
spécifiquement identifiable, alors que le trophée conserve sa silhouette
distinctive à la même échelle.

`DECISIONS-H.md` §6 ne documente aucune vérification à l'échelle réelle
d'impression pour le PDF (contrairement à §3 pour les icônes d'écran, où le
constructeur a bien pris et regardé des captures) — l'affirmation implicite
de parité avec les SVG d'interface n'était donc pas vérifiée avant ce
round. Voir **P2-1**.

## 5. Accessibilité — aucune régression, `aria-hidden` correct

```
index.html:1675 <div class="winner-icon" id="winner-icon" aria-hidden="true"><svg class="ui-icon" ... aria-hidden="true" focusable="false">...
index.html:1699 <div class="winner-icon" aria-hidden="true"><svg ... aria-hidden="true" focusable="false">...      (#elim-modal)
index.html:1711 <div class="winner-icon" id="endgame-modal-icon" aria-hidden="true"><svg ... aria-hidden="true" focusable="false">...
```

Conteneur ET SVG interne portent `aria-hidden="true"` (redondant, sans
danger), le texte adjacent (nom du joueur, « Éliminé »/« Vainqueur »,
« PRIVACY ») porte seul le sens pour un lecteur d'écran — pas de silence, pas
de duplication.

```
$ npm run test        → Test Files 11 passed (11) / Tests 113 passed (113)
$ npx playwright test → 35 passed (30.4s)
```

Les 9 tests d'accessibilité de l'élément D (rôles ARIA, focus visible,
piège de focus, Échap, contraste) sont dans ces 35 et passent tous, sans
modification. **Aucune régression trouvée sur ce point.**

## 6. Périmètre (mesure indépendante)

```
$ git show --stat fe90c26
 docs/audit/BRIEF.md          |  40 ++++
 docs/audit/DECISIONS-H.md    | 429 +++++++++++++++++++++++++++++++++++++++++++
 e2e/functional-icons.spec.ts | 290 +++++++++++++++++++++++++++++
 index.html                   |  20 +-
 src/game.ts                  |  55 +++++-
 src/recap-pdf.ts             |  55 +++++-
 src/ui-icons.ts              | 124 +++++++++++++
 tests/game.icons.test.ts     | 164 +++++++++++++++++
 tests/support/loadGame.d.ts  |   7 +
 tests/ui-icons.test.ts       | 130 +++++++++++++
```

Exactement les fichiers autorisés par `BRIEF.md` §9 (`index.html`,
`src/game.ts`, `src/recap-pdf.ts`, `src/ui-icons.ts` nouveau, nouveaux
tests, `DECISIONS-H.md`) plus l'entrée D29 dans `BRIEF.md` §7 (pratique
déjà établie par les éléments précédents). `src/animations.ts` non touché
(confirmé absent du diff). **Périmètre respecté.**

## 7. Mutation testing indépendant — 3 cas différents de ceux du constructeur

Le constructeur avait testé : polarité de `victoryIcon`, point de code de
l'émoji cadenas surveillé, mapping icône↔état sur la tuile de carte
(`buildCard`). Les 3 cas ci-dessous sont volontairement différents, choisis
pour tester la **distinction** (pas seulement la présence) et des zones à
couverture de test incertaine. Pour chacun : build réel avant/après, suite
complète rejouée, restauration, `git diff --stat` vide confirmé.

### Mutation 1 — géométrie du cadenas rapprochée visuellement du crâne (`src/ui-icons.ts`)

Rayon d'arrondi du corps du cadenas porté de 2,5 à 7 (quasi maximal, rend le
corps presque circulaire) et anse réduite à un petit arceau discret, **sans
changer le nombre de `<path>`/`<rect>`/`fill-rule="evenodd"`/
`stroke="currentColor"`** (2/0/1/1, identique avant/après) :

```
$ npm run test
 ❯ tests/ui-icons.test.ts (1 failed)
   ✘ les deux helpers sont bien ceux utilisés par ICON_SKULL/ICON_LOCK
     expect(ICON_LOCK).toContain(_roundedRectSubpath(5, 10, 14, 11, 2.5))
 Test Files  1 failed | 10 passed (11)
      Tests  1 failed | 112 passed (113)

$ npx playwright test e2e/functional-icons.spec.ts   → 7 passed (5.6s)
```

**112/113 tests unitaires et 7/7 tests e2e passent malgré la mutation**,
y compris le test explicitement conçu pour ça
(« les 4 icônes restent 4 silhouettes structurellement distinctes »
— sa « signature » ne compte que les types de balises, pas la géométrie
réelle). Le seul test qui échoue le fait **par coïncidence** : c'est un
test de non-duplication de code (« le helper `_roundedRectSubpath` est bien
réutilisé, pas recopié »), qui code en dur le rayon d'origine (2,5) sans
rapport avec la distinguabilité visuelle — un rayon changé différemment
(ex. en passant par une nouvelle constante plutôt qu'en modifiant l'appel
existant) l'aurait laissé passer aussi.

Capture réelle de la mutation, regardée en niveaux de gris :

Le cadenas devient visuellement un blob rond avec un petit renflement en
haut — nettement plus proche, par la silhouette, du crâne rond que
l'original à anse/corps rectangulaire net. **La garantie « distinguable
sans la couleur » (D-CLAUDE-2/D-PREF-1, non négociable) repose donc
aujourd'hui uniquement sur une inspection humaine ponctuelle faite une
fois à la construction (§3.1 de `DECISIONS-H.md`), pas sur un test
répétable qui protège contre une régression future de la géométrie.**
Mutation restaurée, `git diff --stat src/ui-icons.ts` vide confirmé,
113/113 tests re-verts.

### Mutation 2 — un seul des deux éléments cadenas surveillé (`src/game.ts`, `initFunctionalIcons`)

Suppression de `_watchLockIcon('privacy-title-txt');` (le bouton reste
surveillé, le titre de page non) :

```
$ npm run test
 ❯ tests/game.icons.test.ts
   ✘ (test sur #privacy-title-txt, ICON_LOCK absent)
 Tests  1 failed | 112 passed (113)

$ npx playwright test e2e/functional-icons.spec.ts -g "confidentialité"
 ✘ confidentialité : icône cadenas SVG dans le bouton et dans le titre de la page
   expect(await bodyHtml(page)).not.toMatch(EMOJI_RE)  → échoue (émoji réapparu)
```

**Détecté aux deux niveaux (unitaire ET e2e)** — bonne couverture ici,
contrairement à la mutation 1. Restauré, `git diff --stat src/game.ts` vide
confirmé, 113/113 et 35/35 re-verts.

### Mutation 3 — trophée/crâne inversés dans le PDF (`src/recap-pdf.ts`)

```ts
if(p.winner){... drawSkullIcon(...); ...}
else if(p.eliminated){... drawTrophyIcon(...); ...}
```

```
$ npm run typecheck   → vert
$ npm run test        → Tests 113 passed (113)   (AUCUN échec)
$ npx playwright test → 35 passed (29.3s)         (AUCUN échec, y compris
                                                    e2e/pdf-export-offline.spec.ts)
```

**Zéro test, unitaire ou e2e, sur 148 au total, ne détecte cette
inversion.** Confirmé visuellement en régénérant un vrai PDF avec la
mutation active et en le convertissant en image : le badge « Winner #1 »
affiche un crâne vert, le joueur éliminé affiche un trophée gris — une
inversion sémantique complète, invisible pour toute la suite de tests
committée. C'est exactement le genre de régression que `DECISIONS-H.md`
§7.4 revendique avoir testé pour la tuile de carte (« mapping icône↔état »,
mutation 3 du constructeur) mais **la même classe de bug existe, non
testée, dans `recap-pdf.ts`** — fichier explicitement dans le périmètre de
ce chantier. Restauré, `git diff --stat src/recap-pdf.ts` vide confirmé,
113/113 et 35/35 re-verts après restauration.

## 8. `#elim-anim-skull` (☠️) laissé intact — jugement (item 7)

Décision de scope **procéduralement défendable** : `src/animations.ts`
n'est pas dans la liste de fichiers autorisés par `BRIEF.md` §9, et la
discipline de périmètre exclusif est la méthode même de cet audit.

Mais capture réelle d'une élimination jouée jusqu'au bout (pas une
supposition) :

**L'emoji ☠️ occupe la quasi-totalité de l'écran pendant l'animation
d'élimination** — de très loin l'occurrence la plus visible, la plus
grande et la plus longtemps affichée de tout émoji fonctionnel restant
dans l'application, largement plus proéminente que le petit badge SVG à
côté du texte « ELIMINATED » sur la même capture.

De plus, la justification donnée en `DECISIONS-H.md` §5 pour ne pas
traiter ce cas (« aucune garantie que `transform`/`clip-path` appliqués
dessus se comportent identiquement sur un `<svg>` plutôt qu'un caractère
de texte ») est affaiblie par la propre preuve du même commit : §2.5 de
`DECISIONS-H.md` démontre et vérifie que le mécanisme
`.ui-icon{width:1em;height:1em}` piloté par un `fontSize` défini
dynamiquement en JS (exactement ce que fait déjà
`skull.style.fontSize=...+'px'` dans `src/animations.ts:196` et suivantes)
fonctionne correctement pour les icônes de tuile de carte (`fitCard()`,
`iconEl.style.fontSize=iconSz+'px'`). Le risque technique invoqué pour ne
pas toucher `#elim-anim-skull` porte donc sur une technique déjà
validée dans ce même commit, pas sur une inconnue réelle.

**Jugement** : le respect du périmètre est correct et je ne demande pas de
le franchir dans ce tour. Mais ce résidu doit être requalifié en **P1**
(pas une simple note de dette) pour le prochain tour ayant mandat sur
`src/animations.ts` : c'est l'unique défaut visuel le plus flagrant qui
subsiste dans toute l'application vis-à-vis de l'objectif initial (P1 #7
du constat), avec une piste technique concrète déjà démontrée dans ce
commit (réutiliser `ICON_SKULL` + le mécanisme `fontSize`/`.ui-icon`).

## 9. Comparaison à l'aveugle (item 8)

Sur le point qui comptait le plus (les icônes d'interface, réellement
utilisées à chaque victoire/élimination/consultation de la confidentialité) :
4 silhouettes dessinées à la main, distinguables sans couleur à l'échelle
réelle d'usage, `currentColor` cohérent avec 22 thèmes — ce niveau est
comparable, voire supérieur, à ce qu'on trouve dans la plupart des
applications grand public (qui n'atteignent souvent même pas la
distinction non chromatique). Mais une application professionnelle mature
ne livre pas une fonctionnalité de ce type avec un chemin de code
(`recap-pdf.ts`) où une inversion totale de deux icônes sémantiquement
opposées peut passer inaperçue de 148 tests automatisés, ni avec l'émoji
système le plus visible de l'app volontairement intact au milieu de
l'écran. Sur ces deux points précis, le niveau de rigueur retombe en deçà
de la barre visée par cet audit (AAA), même s'il reste au-dessus de la
moyenne du marché sur le reste.

---

## Défauts trouvés

**P1-1 — Zéro couverture de test sur l'association icône↔statut dans
`src/recap-pdf.ts`.** Une inversion complète trophée/crâne (`drawTrophyIcon`
sur `p.winner`, `drawSkullIcon` sur `p.eliminated` → l'inverse) passe les
113 tests unitaires et les 35 tests e2e sans un seul échec (démontré en
section 7, mutation 3). **Correctif suggéré** : un test qui génère un vrai
PDF avec un joueur gagnant et un joueur éliminé, extrait le flux de dessin
jsPDF (ou au minimum espionne les appels à `drawTrophyIcon`/`drawSkullIcon`
avec les bons paramètres de couleur/position selon `p.winner`/
`p.eliminated`), à l'image de ce qui existe déjà pour la tuile de carte
dans `tests/game.icons.test.ts`.

**P1-2 — La distinction non chromatique de `src/ui-icons.ts` n'est
protégée par aucun test répétable, seulement par une inspection humaine
ponctuelle.** Une mutation purement géométrique (rayon d'arrondi du
cadenas porté à 7, anse réduite) qui rapproche visuellement sa silhouette
de celle du crâne (démontré par capture, section 7, mutation 1) est
détectée par un seul test, et par coïncidence (un test de non-duplication
de helper qui code en dur un paramètre numérique sans rapport avec la
distinguabilité) — pas par le test dédié à cette exigence (« les 4 icônes
restent 4 silhouettes structurellement distinctes »), qui ne compte que des
types de balises. **Correctif suggéré** : renforcer le fingerprint de
`tests/ui-icons.test.ts` avec une mesure géométrique réelle (ex. rapport
largeur/hauteur de la bounding box, aire occupée par les trous
`evenodd` vs aire totale, ou un vrai test de rendu pixel/capture comparée
à un budget de similarité, comme le fait déjà `tests/dice3d.geometry.test.ts`
pour la sphérisation du d48/d120 selon D25) — pas seulement un comptage de
balises SVG.

**P1-3 — `#elim-anim-skull` (☠️, `src/animations.ts`) : l'émoji système le
plus visible de toute l'application reste intact.** Capture réelle
(section 8) : il occupe la quasi-totalité de l'écran pendant l'animation
d'élimination, largement plus proéminent que la nouvelle icône SVG à côté.
Le report hors périmètre est procéduralement correct pour ce tour, mais la
justification technique donnée (`DECISIONS-H.md` §5) est affaiblie par la
propre preuve du commit que le mécanisme redouté (`fontSize` dynamique +
`.ui-icon{width:1em;height:1em}`) fonctionne déjà pour un autre usage.
**Correctif suggéré** : premier point à traiter par le prochain tour ayant
mandat sur `src/animations.ts` — remplacer `#elim-anim-skull` par
`ICON_SKULL` en réutilisant ce mécanisme déjà validé, revérifier
`transform-origin`/le calcul de `maxSize()`/le `drop-shadow` sur un `<svg>`
plutôt qu'un caractère.

**P2-1 — Crâne PDF peu reconnaissable à l'échelle réelle d'impression/
d'affichage (96 dpi, taille configurée 2,6 mm).** À cette échelle, le nez et
les dents du crâne (`doc.triangle` du bas de `drawSkullIcon`) disparaissent
et l'icône se réduit à un disque gris avec deux points, moins distinctif
que le trophée à la même taille (démontré par capture, section 4).
N'affecte pas la distinction couleur/forme de façon critique (le rond reste
différent du triangle), mais l'affirmation de parité avec les SVG
d'interface n'était pas vérifiée à cette échelle avant ce round.
**Correctif suggéré** : agrandir légèrement `STATUS_ICON_W`/le paramètre
`size` passé à `drawSkullIcon` spécifiquement (le trophée peut rester à sa
taille actuelle), ou simplifier le contour de la mâchoire pour qu'il
survive à la réduction.

---

## Fichiers/preuves produits pendant cette vérification

Tout le travail a eu lieu dans un worktree détaché sur `fe90c26`
(`/tmp/claude-0/.../scratchpad/wt`), **supprimé** en fin de mission
(`git worktree remove --force`, confirmé par `git worktree list` qui ne
montre plus que le dépôt principal). Aucun fichier de ce worktree ne
subsiste. Le seul fichier ajouté au dépôt partagé par cette critique est le
présent rapport, `docs/audit/H-critique-round1.md`.
