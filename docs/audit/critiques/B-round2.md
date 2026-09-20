# Critique de l'élément B — tour 2 (système visuel, thèmes, daltonisme, icônes)

Dépôt **non modifié** (lecture, exécution de scripts et de tests). Preuves : `scratchpad/critic/B2/`.
Viewport 390 × 844, DPR 3, Chromium Playwright 1.56.1, `http://localhost:8765/`, 18 septembre 2026.
Tous les scripts de mesure sont les miens (`wcag.mjs` = implémentation WCAG indépendante du tour 1).

> Chantier : A, C et F modifiaient `css/setup.css`, `js/ui/settings.js`, `js/ui/game.js` et les tests
> pendant la mesure (horodatages 17:05 → 17:38). Les défauts de l'écran de jeu qui relèvent de A sont
> étiquetés comme tels.

---

## 1. Ce qui est réellement corrigé (vérifié, pas cru)

| Point du tour 1                   | Vérification indépendante                                                                                                                                                                                                                                                                                                                                                                                                    | Verdict                      |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Plancher 11 px                    | `B2/rem200.mjs` : sur setup, réglages, noms, jeu 4 j. et 7 thèmes, **min = 12,0 px**. Les 8 sélecteurs à 11 px ont disparu.                                                                                                                                                                                                                                                                                                  | **corrigé**                  |
| Échelle absolue (D19)             | `--fs-*` en `max(0.75rem, 12px)` … `2.5rem`. Base système portée à **32 px par CDP `Page.setFontSizes`** (le vrai réglage, pas une injection CSS) : setup 24/26/30/35/36, réglages 24/26/27, noms 24/26/27/30, jeu 24/26. **Débordement horizontal 0 px, 0 texte tronqué, aucune nouvelle cible sous 44 px.**                                                                                                                | **corrigé**                  |
| Emoji du premier rendu            | `grep` Unicode sur `index.html` : **aucun emoji**. `#splash` porte le SVG en ligne. `ALLOWED_HTML` supprimé de `scripts/lint-no-emoji.mjs`. `visual.spec.js` assert `found == []` **sans garde**.                                                                                                                                                                                                                            | **corrigé**                  |
| `VISUAL_STRICT`                   | La variable n'existe plus dans `tests/e2e/visual.spec.js`. `npx playwright test visual.spec.js` → **5 passed**, dont un nouveau test D19.                                                                                                                                                                                                                                                                                    | **corrigé**                  |
| Porte du daltonisme               | J'ai **dégradé volontairement la palette dans une copie** (`B2/copie`, `--tol-4` = `--tol-1`) : `node scripts/audit-cvd.mjs` → **code 1**, « Séparabilité **ÉCHEC** (ΔE 0,0 < 14) » + « Budget de régression **ÉCHEC** ». Sur le dépôt intact : code 0. **La porte fonctionne.**                                                                                                                                             | **corrigé**                  |
| 9ᵉ couleur                        | Recalcul indépendant : `#0077BB` → `#332288` fait passer les paires ΔE < 15 de **33 à 28** et les minima de 4,4/3,6/4,2/2,0 à 6,5/5,1/6,3/3,2. Surtout, l'**ordre** a été refait : ΔE ≥ 14 sous les trois dichromaties tient désormais **jusqu'à 6 joueurs** (2 j. 40,2 · 3 j. 29,9 · 4 j. 20,1 · 5 j. 15,7 · 6 j. 15,1 · 7 j. 11,2) contre 4 avant. Les chiffres du commentaire de `tokens.css` sont **exacts au dixième**. | **corrigé**                  |
| `--muted` / courbe plate          | Jeton porté de 40 % à 62 % du texte. Mesure sur pixels rendus, `line.recap-spark-flat` : **3,63 à 5,93** sur les 16 variantes (16/16 sous 3:1 au tour 1).                                                                                                                                                                                                                                                                    | **corrigé**                  |
| Taille optique des icônes         | `B2/icons.mjs`, rendu à 96 px : boîte d'encre **67,5 → 80,0 px** (16,9 → 20 u) contre **56 → 92 px** (14 → 23 u) au tour 1. `close` 56 → 78, `gear` 88 → 80, `warning` 92 → 80. Décentrages : `play` +7,8 → **+0,5**, `edit` −3,0 → −0,5.                                                                                                                                                                                    | **corrigé**                  |
| D18 (identifiant non chromatique) | `B2/shots/jeu12-light-achromatopsia.png` : les **12 cartes portent un numéro de siège encadré**, lisible en achromatopsie. `audit-cvd.mjs` le vérifie et le bloque (12 lignes « N · Nom », ≥ 16 px).                                                                                                                                                                                                                         | **corrigé**                  |
| Métriques de police / CLS         | `css/fonts.css` : 6 faces de repli locales avec `size-adjust`, `ascent-override`, `descent-override`, `line-gap-override` ; `index.html` précharge les **deux** polices du premier rendu. Mesure : CLS **0,317 → 0,018**.                                                                                                                                                                                                    | **corrigé, mais voir § 2.4** |

---

## 2. Ce qui ne tient pas

### 2.1 L'audit n'est pas reproductible — **bloquant**

B annonce « deux passages consécutifs donnant des ensembles d'échecs identiques ». J'ai lancé
`node scripts/audit-contrast.mjs` **deux fois de suite**, même machine, même code, rien d'autre :

|                                 | mesures comptées | échecs | code de sortie |
| ------------------------------- | ---------------- | ------ | -------------- |
| mon passage 1 (`B2/c-run1.log`) | 14 999           | **12** | 1              |
| mon passage 2 (`B2/c-run2.log`) | 15 050           | **10** | 1              |

`diff` des ensembles d'échecs : **11 entrées sur 22 diffèrent**. Les quatre `span.pplayer/butée`
de `nature`, `ocean`, `mono`, `sobre` du passage 1 disparaissent au passage 2 ; `ldm-day` et trois
`button.key-btn` apparaissent. Les propres traces de B disent la même chose :
`scratchpad/B/r1.log` = 15 030 / **22**, `r2.log` = 15 050 / **23** (ensembles différents d'une
ligne), et le rapport publié `contrast-report.md` annonce 15 096 / 22 tandis que le
`contrast.json` du même dossier contient 15 158 lignes et **26** échecs.
Cinq chiffres de mesures différents, quatre comptes d'échecs différents.

La cause est mécanique : **tous les échecs se situent entre 4,21 et 4,49**, soit à moins de 0,3 du
seuil, et l'échantillonnage par quadrant d'une capture varie de ±0,1 d'un tirage à l'autre. Le verdict
par thème est donc tiré au sort. « Deux sélecteurs instables sur mille » est vrai quant aux
sélecteurs (`span.pplayer` et `button.key-btn`), mais trompeur : ces deux-là **font 100 % des échecs**,
et c'est le résultat de la CI qui bascule, pas une ligne accessoire.

### 2.2 Un quart des échecs restants sont de faux positifs de l'instrument — **majeur**

`button.key-btn` est rapporté à **1,10** (sobre), **1,61** (ldm), **1,81** (gold) au passage 1, et sur
`mono`/`ocean`/`sunset` au passage 2 — jamais les mêmes thèmes, alors que la feuille de style ne change
pas. Mesure directe (`B2/keypad.mjs`, pavé ouvert par appui long réel, relevé **1,2 s après** la fin de
l'animation) : les touches sont `#f2f2f7` sur `#3a3a3c` (sobre), `#fff8e0` sur `#1e1800` (gold),
`#fff8e8` sur `#3d3020` (ldm) — soit **9:1 et plus**. L'audit échantillonne un fond `#e8e8e8` /
`#ddb800` / `#f0c040` qui est l'**accent** du thème : il lit une couche qui n'est pas sous le texte.
`settle()` attend bien les animations, donc le défaut est ailleurs (couche du pavé, ou capture d'un
calque composé obsolète). Preuve : `B2/shots/pave-{sobre,gold,ldm}.png`.

Les échecs `span.pplayer` (4,21 à 4,49 sous le voile `butée` = 30 % de `--loss`) sont, eux,
**réels mais marginaux**.

### 2.3 Le seuil transitoire à 3:1 : recevable, mais c'est bien un assouplissement — **majeur**

La règle (`audit-contrast.mjs:542`) : texte ≥ 24 px dans l'un des quatre états transitoires
(`pressé`, `flash-gain`, `flash-perte`, `butée`) → 3:1 au lieu de 4,5:1.

- **Recevable** : WCAG 2.x accorde 3:1 au grand texte **sans condition** ; B l'accorde seulement en
  transitoire et garde 4,5:1 au repos. La règle est donc **plus stricte que WCAG**, pas moins.
- **Mais** : elle n'est pas ce que dit le projet. D2.2 exige 4,5:1 « quelle que soit la taille », et
  **l'en-tête du script lui-même écrit encore** « 4,5:1 pour tout texte (le score compris, cible du
  projet, plus exigeant que les 3:1 que WCAG accorde aux grands textes) » — en contradiction directe
  avec le code situé 520 lignes plus bas. C'est un manquement à D15.
- **Portée** : sur mon passage 1, la règle transforme **91 lignes en succès** (103 échecs deviennent 12),
  sur 7 thèmes, le pire à **3,69** (light, score pressé). Ce n'est pas un détail de bord.

Chiffres annoncés par B : **4,63 au repos** et **3,69 en transitoire**. Mes propres passages donnent
**4,62** et **3,69**. Les deux nombres sont exacts.

Verdict : à accepter **seulement si l'auditeur le ratifie explicitement** comme une décision nouvelle,
car ce n'est pas D2.2. En l'état, le script se contredit et le rapport publié affirme le contraire de
ce qu'il fait.

### 2.4 « CLS ramené à 0,000 » : non reproduit — **mineur**

`B2/cls.mjs` / `cls2.mjs`, cache froid :

| Condition                   | CLS       |
| --------------------------- | --------- |
| normale                     | **0,018** |
| polices retardées de 300 ms | 0,059     |
| polices retardées de 800 ms | 0,054     |
| polices bloquées            | 0,025     |

Le gain est spectaculaire (0,317 → 0,018) et le budget ≤ 0,1 est tenu, mais **0,000 est faux** :
il y a toujours 0,018 au repos et jusqu'à 0,059 quand les polices arrivent tard (décalages résiduels
sur `H1.logo-name` et `P.preset-note` à 850–864 ms). Corriger le chiffre, pas le code.

### 2.5 La CI est rouge — **bloquant**

`.github/workflows/ci.yml`, job `design`, exécute `npm run audit:contrast` sans tolérance.
L'audit sort **code 1** à chacun de mes deux passages. Le job échoue aujourd'hui, et il échouerait
de façon **intermittente** même après correction des faux positifs, à cause du § 2.1.

### 2.6 Reliquats du tour 1 non traités — **mineur**

- **5.3** : `css/system.css` garde 7 hexadécimaux cyber en repli (E), `css/game.css` et
  `css/setup.css` gardent des `rgb(0 0 0 / …)` littéraux (A, C), et **aucun lint** ne garde la règle,
  que le critère D5.3 demande pourtant nommément.
- **`visual.spec.js:229`** assert toujours `minFont ≥ 11`, pas 12 ; le commentaire au-dessus parle
  encore d'un « mode strict » qui n'existe plus. Le test ne peut donc pas attraper une régression D10
  (c'est `a11y.spec.js` de C qui le fait maintenant, à 12 px).
- **`audit-cvd.mjs:53`** : `SEPARABLE_MAX = 4` alors que la palette tient la porte **jusqu'à 6**
  (vérifié § 1). Le commentaire dit « elle passera à 6 le jour où l'ordre changera » — l'ordre **a**
  changé. La porte est plus lâche que ce que le produit sait faire.
- **5.5** : les rects de cartes se sont nettement assainis (17 → 5 fractionnaires à 12 joueurs), mais
  les 5 `.bar-btn` restent fractionnaires (`x = 5,984`, `width = 72,406`) et rien n'est sur la grille
  de 4 px. Aucune couture visible à 400 % ; la lettre du critère tombe, pas la perception.

### 2.7 La suite d'accessibilité ne visite pas l'écran de jeu — **majeur**

`tests/e2e/a11y.spec.js` : **9 passed** (5,8 min), dont axe-core sur les 14 thèmes, `cibles ≥ 44 px`,
`textes ≥ 12 px` et un quatrième jeu de conditions « texte système 200 % ». C'est du bon travail (C),
et le plancher y est bien à 12 px. **Mais `forEachState` ne couvre que six écrans** — `#setup-page`
(trois états), `#names-page`, `#settings-page`, `#privacy-modal` — et **jamais l'écran de jeu**.
D'où le paradoxe : le test « cibles ≥ 44 px » est vert alors que ma propre mesure
(`B2/targets.mjs`) trouve **`button.pname` à 38,9 × 49,5 px** sur les quatre cartes, à 100 % comme à
200 %. Une assertion qui ne visite pas l'écran concerné n'est pas une garantie : c'est la même faute
que `VISUAL_STRICT` au tour 1, déplacée. **Propriétaire : C** (couverture), **A** (la cible).

### 2.8 Ce que les changements de B n'ont pas cassé

`tests/unit/themes.test.js` : **39 passed** (l'ordre `--tol-N` ↔ `COLORS` est verrouillé index par
index). `tests/e2e/visual.spec.js` : **5 passed**. `node scripts/audit-cvd.mjs` : **code 0**.
Aucune régression imputable au changement de palette ou au passage en rem n'a été observée.

---

## 3. Ce qui relève de A (mesuré, non imputé à B)

- **Le chiffre du score est écrasé et rogné.** À 4 et à 12 joueurs, le « 0 » est rendu comme un anneau
  aplati, coupé en haut et en bas (`B2/shots/jeu4-ldm-none.png`, `jeu12-light-achromatopsia.png`).
  C'est le défaut le plus visible de l'écran vitrine, et il fausse aussi la boîte d'encre lue par
  l'audit (le `Range` renvoie le texte non rogné).
- **`button.pname` mesure 38,9 × 49,5 px** (< 44 en largeur), à 100 % comme à 200 %.
- **Le nom du joueur n'est toujours pas rendu** à 4 ni à 12 joueurs ; seul le numéro de siège l'est.
  D18 est satisfait (« siège **et/ou** nom »), mais D2.3 attend le nom.
- `span.pseat` (23,4 px) et `.score` sont dimensionnés en px par `layout-fit` : ce sont les **deux
  seuls** textes qui ne suivent pas la taille système à 200 %.

---

## 4. Comparaison à l'aveugle (BLIND-PROTOCOL) — dernier passage

Mêmes limites d'honnêteté qu'au tour 1 : **App A** = mes captures et mesures réelles ; **App B** = la
meilleure référence documentée, décrite depuis des sources publiques, **jamais exécutée, sans capture**.
Tout critère que le dossier de la référence ne prouve pas reste **INDÉTERMINÉ** et n'est jamais
converti en « NON ».

### D5 — système visuel

| Critère                                           | App A | App B       | Preuve A                      |
| ------------------------------------------------- | ----- | ----------- | ----------------------------- |
| 5.1 zéro requête externe, polices chargées        | OUI   | INDÉTERMINÉ | `visual.spec` 5 passed        |
| 5.2 aucun emoji, icônes cohérentes                | OUI   | INDÉTERMINÉ | grep Unicode ; `B2/icons.mjs` |
| 5.3 tout en jetons                                | NON   | INDÉTERMINÉ | `css/system.css`              |
| 5.4 échelle, familles, plancher 12 px, hiérarchie | OUI   | INDÉTERMINÉ | `B2/rem200.mjs`               |
| 5.5 alignement pixel                              | NON   | INDÉTERMINÉ | `B2/grid.mjs`                 |

**Préférence : App A.** Confiance **3/5**. Quatorze thèmes dont la hiérarchie typographique est
strictement identique, zéro requête externe, une échelle qui suit le réglage système jusqu'à 200 %
sans un seul texte tronqué, et un jeu d'icônes dont la boîte d'encre tient dans 3 u d'écart : aucune
référence ne documente cet ensemble, et la sobriété que je préférais à la référence au tour 1 est
maintenant tenue côté A aussi. **Ce qui retient ma préférence d'être franche, c'est le chiffre du
score écrasé** — le défaut de A, pas de B : sur la seule chose qu'un compteur doit réussir, la
référence (« un nombre par panneau, aplats plats, aucune décoration ») reste meilleure.

### D6 — accessibilité et daltonisme

| Critère                                  | App A                  | App B       | Preuve A                                                               |
| ---------------------------------------- | ---------------------- | ----------- | ---------------------------------------------------------------------- |
| 6.1 contraste mesuré                     | NON                    | INDÉTERMINÉ | `B2/c-run1.log`, `c-run2.log`                                          |
| 6.2 cibles ≥ 44 px                       | NON                    | INDÉTERMINÉ | `button.pname` 38,9 × 49,5                                             |
| 6.3 clavier                              | OUI (hors périmètre B) | INDÉTERMINÉ | `a11y.spec.js` 9 passed                                                |
| 6.4 sémantique                           | OUI (hors périmètre B) | INDÉTERMINÉ | axe-core, 0 violation, 14 thèmes                                       |
| 6.5 séparabilité + signe non chromatique | OUI                    | INDÉTERMINÉ | `B2/cvd-repro.md`, `cvd-degrade.md`, `shots/jeu12-*-achromatopsia.png` |

**Préférence : App A. Je change d'avis par rapport au tour 1.** Confiance **3/5**.
Au tour 1 je préférais la référence parce qu'elle _livrait_ « formes ou texte en plus de la couleur »
là où A se contentait de le mesurer : douze panneaux gris identiques, sans nom ni siège. Ce n'est plus
vrai. Chaque carte porte un numéro de siège encadré, lisible en achromatopsie ; la porte est **prouvée
par ma propre dégradation volontaire de la palette** (code 1) ; la séparabilité chromatique tient
jusqu'à 6 joueurs sous les trois dichromaties. La référence déclare son accessibilité, A la **mesure,
la publie et la fait échouer en CI**. Le contraste reste le point faible (§ 2.1, § 2.2), mais il s'agit
d'un instrument bruité autour de 4,4:1, pas d'un texte illisible. À cela s'ajoute la navigation au
clavier complète et zéro violation axe sur les 14 thèmes et quatre conditions d'affichage, dont le
texte système à 200 % — que la référence ne documente nulle part.

---

## 5. Verdict

| Dimension                           | Tour 1 | **Tour 2** | Détail                                                      |
| ----------------------------------- | ------ | ---------- | ----------------------------------------------------------- |
| **D5 — Système visuel & thèmes**    | 1 / 5  | **3 / 5**  | 5.1 OUI · 5.2 OUI · 5.3 NON · 5.4 OUI · 5.5 NON             |
| **D6 — Accessibilité & daltonisme** | 0 / 5  | **3 / 5**  | 6.1 NON · 6.2 NON (A/C) · 6.3 OUI · 6.4 OUI · 6.5 OUI       |
| **D2.2 — Contraste score / carte**  | 0 / 1  | **0 / 1**  | instrument non reproductible, seuil transitoire non ratifié |

### AAA : **non.**

Le progrès est réel et massif — neuf des dix points du tour 1 sont corrigés et je l'ai vérifié
moi-même, y compris en cassant volontairement la palette pour éprouver la porte. Mais **l'audit de
contraste, qui est le cœur de mon premier verdict, n'est toujours pas un témoin fiable** : il donne
deux verdicts différents à deux minutes d'intervalle, un quart de ses échecs sont des faux positifs,
et son en-tête affirme un seuil que son code n'applique pas. Un instrument dont le résultat change
d'un passage à l'autre ne peut pas certifier quoi que ce soit, et la CI est rouge.

### 6. Corrections, classées

**Bloquant**

1. **Rendre l'audit déterministe.** `scripts/audit-contrast.mjs` : moyenner **n ≥ 3 captures** par
   (thème, écran, état) et ne retenir que la médiane, ou figer le tirage (désactiver toute animation
   par `prefers-reduced-motion` + `Emulation.setVirtualTimePolicy`). Critère de recette : **trois
   passages consécutifs, ensembles d'échecs strictement identiques**, joints au rapport. **B.**
2. **Corriger le faux positif du pavé numérique.** `button.key-btn` est lu sur l'accent du thème alors
   qu'il est sur `--surface`. Vérifier la couche échantillonnée quand une modale est ouverte
   (`layers` / `covered()` dans `collectForegrounds`). Recette : les touches du pavé doivent sortir
   à ≥ 9:1 sur `mono`, `sobre`, `gold`, `ldm`, comme la mesure directe. **B.**
3. **Remonter `span.pplayer` au-dessus de 4,5:1 sous les voiles d'état.** Aujourd'hui 4,21 à 4,49 sur
   `nature`, `sunset`, `ocean`, `mono`, `sobre`, `ldm`, `ldm-day`. Levier : `--half-blocked` de 30 % à
   20 % de `--loss` (`css/game.css`), ou assombrir le voile. **A**, seuil défini par **B**.
4. **Trancher le seuil transitoire.** Soit l'auditeur ratifie le 3:1 transitoire par une décision
   écrite, soit il est retiré (91 lignes redeviendraient des échecs sur 7 thèmes, pire 3,69).
   Dans les deux cas, **corriger l'en-tête de `audit-contrast.mjs` (lignes 13-15)** qui affirme
   aujourd'hui le contraire du code — c'est un manquement à D15. **auditeur + B.**
5. **Faire passer la CI.** Le job `design` est rouge. Aucun de ces points n'est tenable en l'état.

**Majeur**

6. **Corriger le chiffre du CLS partout où il est écrit** : 0,018 au repos, jusqu'à 0,059 polices
   retardées — pas 0,000 (D15). **B.**
7. **`SEPARABLE_MAX` de 4 à 6** dans `scripts/audit-cvd.mjs` : la palette réordonnée tient ΔE ≥ 14
   jusqu'à 6 joueurs sous les trois dichromaties (mesuré). La porte doit protéger ce qui est acquis. **B.**
8. **Le chiffre du score est écrasé et rogné** à 4 et 12 joueurs. C'est le défaut le plus voyant de
   l'application et il fausse la boîte lue par l'audit. **A.**

**Mineur**

9. `visual.spec.js:229` : `minFont ≥ 11` → `≥ 12` ; supprimer le commentaire « mode strict ». **B.**
10. Garde-fou « aucune couleur en dur hors `tokens.css`/`themes.css` » (script dans `npm run lint`) :
    demandé par D5.3, toujours absent. Nettoyer `css/system.css` (E), `css/game.css` (A), `css/setup.css` (C). **B** pour le garde-fou.
11. `button.pname` 38,9 px de large (< 44) **et** `forEachState` d'`a11y.spec.js` doit visiter l'écran de jeu, sans quoi l'assertion des cibles ne prouve rien. **A** et **C.**
12. Afficher le **nom** du joueur en plus du siège sur l'écran de jeu (D2.3). **A.**
13. Trois titres (`logo-name`, `settings-title`, `names-title`) ne suivent la base système qu'à
    ×1,10–1,24 (clamp) : intentionnel, mais à écrire dans le commentaire de `tokens.css`. **B/C.**
