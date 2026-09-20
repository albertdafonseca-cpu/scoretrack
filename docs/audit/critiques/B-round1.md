# Critique de l'élément B — système visuel, thèmes, daltonisme, icônes (tour 1)

Auditeur : critique B. Dépôt **non modifié** (lecture, exécution de scripts et de tests seulement).
Date : 17 septembre 2026. Preuves : `scratchpad/critic/B/` (scripts, mesures, captures).
Viewport de référence : 390 × 844, DPR 3, Chromium de Playwright 1.56.1, serveur `http://localhost:8765/`.

> **Avertissement de chantier.** Les agents A, D et F modifiaient `js/ui/game.js`, `css/game.css`,
> `js/core/**`, `index.html` et la CI pendant la mesure. À un moment l'application ne démarrait plus
> (`PAGEERROR : './history.js' does not provide an export named 'groupsFromLog'`) — en réalité un
> cache HTTP d'`http-server` (`max-age`) ; toutes mes mesures sont refaites avec `cache-control: no-cache`.
> Les défauts de l'écran de jeu qui relèvent de A sont **étiquetés « attend A »** et ne sont pas
> comptés contre B.

---

## 0. Méthode et outillage du critique

| Fichier                                                                     | Rôle                                                                                                                                                                                                              |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `critic/B/wcag.mjs`                                                         | **Ma propre** implémentation WCAG 2.x (sRGB→linéaire, luminance relative, ratio, composition alpha), écrite sans réutiliser `scripts/lib/color.mjs`. Contrôles : noir/blanc = 21,00 ; `#767676` sur blanc = 4,54. |
| `critic/B/pixels.mjs`                                                       | Contraste mesuré sur les **pixels réellement rendus** : le texte est masqué, la page est capturée, l'image est redécodée dans un canvas, et la moyenne de chaque quadrant de la boîte du score sert de fond.      |
| `critic/B/isolate.mjs`                                                      | Isole la contribution de chaque couche (moitiés tactiles, texture) au fond réel.                                                                                                                                  |
| `critic/B/full.mjs`                                                         | Tailles de texte calculées, familles rendues, `document.fonts`, emoji du DOM, sur 4 écrans × 7 thèmes.                                                                                                            |
| `critic/B/cls.mjs`, `cls2.mjs`, `cls3.mjs`                                  | CLS par `PerformanceObserver`, avec polices retardées puis bloquées.                                                                                                                                              |
| `critic/B/icons.mjs`                                                        | Boîte d'encre peinte, épaisseur de trait et centrage optique des 31 icônes à 400 %.                                                                                                                               |
| `critic/B/signs.mjs`, `grid.mjs`, `targets.mjs`, `splash2.mjs`, `shots.mjs` | Signes +/−, grille de 4 px, cibles tactiles, premier rendu, captures CVD.                                                                                                                                         |
| `critic/B/shots/`                                                           | 82 captures (setup, réglages, noms, jeu 4 et 12 joueurs, 5 thèmes × 5 simulations CVD, zooms 400 %).                                                                                                              |

### 0.1 Reproduction des audits de B

```
node scripts/audit-contrast.mjs → 1600 paires, 0 échec, code 0   (critic/B/contrast-repro.md)
node scripts/audit-cvd.mjs      → 30 paires ΔE < 15, code 0      (critic/B/cvd-repro.md)
```

Les deux rapports de `scratchpad/B/` sont **exactement reproductibles**. L'arithmétique aussi :
j'ai recalculé 10 paires avec mon implémentation, écart maximal 0,01.

| #   | Thème · élément                                 | Annoncé par B | Recalculé (wcag.mjs) |
| --- | ----------------------------------------------- | ------------- | -------------------- |
| 1   | cyber · carte 1 · score `#00ffe0`/`#11293a`     | 11,68         | 11,68                |
| 2   | cyber · signes +/− (alpha 0,72 composé)         | 8,41          | 8,41                 |
| 3   | light · carte 4 · score `#2f4fc4`/`#e6cee2`     | 4,71          | 4,71                 |
| 4   | light · état sélectionné `#4477aa`/`#c8d4f0`    | 3,16          | 3,16                 |
| 5   | ldm · carte 6 · bulle perte `#ff8844`/`#424f4e` | 3,60          | 3,60                 |
| 6   | nature · carte 6 · score `#50c850`/`#1d4343`    | 5,02          | 5,02                 |
| 7   | sobre · carte 7 · score `#e8e8e8`/`#474748`     | 7,57          | 7,57                 |
| 8   | arcade · carte 7 · score `#ffdc00`/`#37362b`    | 8,98          | 8,98                 |
| 9   | ldm-day · état sélectionné `#4477aa`/`#ddd5c0`  | 3,21          | 3,21                 |
| 10  | mono · carte 1 · nom `#ffffff`/…                | conforme      | conforme             |

**Le calcul est juste. C'est le périmètre qui est faux.** Voir § 1.

---

## 1. Erreurs de méthode dans `scripts/audit-contrast.mjs`

### 1.1 Le fond audité n'est pas celui que l'utilisateur voit — **bloquant**

L'audit fabrique une carte hors écran et lit `getComputedStyle(card).backgroundColor`, c'est-à-dire
`--card-N` **nu**. Or l'écran de jeu superpose, sous le score :

- `.tap-half.minus { background: var(--half-minus) }` = `color-mix(in srgb, var(--bg) 14%, transparent)` ;
- `.tap-half.plus { background: var(--half-plus) }` = `color-mix(in srgb, var(--card-text) 8%, transparent)` ;
- `.card-inner::after` = texture du thème, opacité 0,07 à **0,50** (arcade).

Le score est centré : il chevauche **les deux moitiés**. Mesure sur pixels réels
(`critic/B/pixels.mjs`, 10 joueurs, seuil texte 4,5:1, pire quadrant de la boîte du score) :

| Thème                | B annonce | Mesuré, état normal | Mesuré, état **pressé** |
| -------------------- | --------- | ------------------- | ----------------------- |
| light / auto (clair) | 4,71      | **3,92**            | **2,92**                |
| ldm                  | 5,01      | **3,95**            | **2,76**                |
| nature               | 5,02      | **3,82**            | **2,56**                |
| dark                 | ≥ 4,87    | **4,18**            | **2,77**                |
| sobre                | 7,57      | 5,90                | **4,05**                |
| arcade               | 8,98      | 6,27                | **4,16**                |
| cyber                | 11,68     | 6,86                | 4,50                    |
| mono-light           | ≥ 3,24    | 11,41               | 8,51                    |

Causalité isolée (`critic/B/isolate.mjs`) — ce sont bien **les moitiés teintées**, pas la texture :

| Variante (thème light)    | Pire ratio |
| ------------------------- | ---------- |
| tel quel                  | 3,92       |
| sans texture              | 3,92       |
| **sans moitiés teintées** | **4,60**   |
| sans texture ni moitiés   | 4,61       |

Conclusion : `audit-contrast.mjs` **certifie « 0 échec » sur une composition qui n'existe pas**.
Quatre thèmes sur les quatorze échouent au repos, sept sur huit testés échouent sous le doigt.

### 1.2 États non couverts — **majeur**

Aucun état interactif n'est audité : `pressed` / `flash-pos` / `flash-neg` (`--half-press-plus`
= 22 % de `--card-text`), `blocked` (`--half-blocked` = 30 % de `--loss`), `:disabled`, `:hover`,
`.elim`. Le seul état « pressé » suffit à faire tomber sept thèmes sous 3:1 (tableau ci-dessus).
(Le `:disabled` est exempté par WCAG 1.4.3 ; je ne le compte pas.)

### 1.3 Deux états de score sur trois n'existent pas — **majeur**

L'audit vérifie `carte N · score bas` et `carte N · score critique` : **320 des 1600 paires**
(10 cartes × 2 états × 16 thèmes). Or `js/core/rules.js` expose bien `scoreAlert()` mais
**aucun code d'interface n'applique les classes `.low` / `.crit`** (`grep -rn "'low'\|'crit'" js/ui js/fx`
= aucun résultat). L'audit gonfle donc son propre volume de preuve de 20 %.
_Étiquette : le câblage relève de A ; la revendication « 3 états » est de B._

### 1.4 Exclusion de `--muted` justifiée par le mauvais critère — **majeur**

Le rapport exclut `--muted` en écrivant « gris décoratif, jamais utilisé pour du texte ».
C'est vrai pour le texte, mais `--muted` est le trait de `.recap-spark-flat` (`css/modals.css:511`),
un **objet graphique porteur d'information** (courbe plate d'un joueur), soumis à WCAG 1.4.11 (3:1) :

|                           | cyber | dark | sobre    | light | ldm-day  |
| ------------------------- | ----- | ---- | -------- | ----- | -------- |
| `--muted` sur `--surface` | 2,75  | 2,53 | **2,07** | 2,41  | **1,97** |

**16 thèmes sur 16 échouent**, sur les deux fonds. L'exclusion masque un vrai manquement.

### 1.5 Sélecteur mort dans la sonde — **mineur**

L'audit fabrique `<span class="tap-sign-plus">` ; la classe réellement rendue est `.tap-sign`
(un SVG, `stroke: var(--card-sign)`, `opacity: .9`). `.tap-sign-plus` / `.tap-sign-minus`
n'existent plus que dans des règles `text-shadow` de `css/themes.css:506-555` — **règles mortes**.
L'alpha effectif réel est 0,72 × 0,9 = 0,648, pas 0,72.
Bonne nouvelle : mesuré sur pixels (`critic/B/signs.mjs`), le signe + tient partout
(**pire 3,73** sur light, médiane 3,84–6,44) ; seuil composant 3:1 **tenu**.

### 1.6 Angles morts sans conséquence (honnêteté)

L'anneau de focus sur un **fond de carte** n'est pas audité (seulement sur `bg`/`surface`/`surface2`).
Je l'ai calculé : 160 paires, **0 sous 3:1** (pire 3,72, thème dark). Trou de périmètre, pas de défaut.

---

## 2. D5 — Système visuel & thèmes

### 5.1 Zéro requête externe, aucune police de secours — **OUI**

- 0 requête hors `localhost` (routage bloquant dans `critic/B/full.mjs`, aucune interception).
- `document.fonts` : Orbitron, Share Tech Mono, Inter, Press Start 2P, Cinzel toutes `loaded`,
  `check()` vrai, largeur témoin ≠ largeur de secours.
- Aucun élément **porteur de texte propre** ne rend une police système sur 4 écrans × 7 thèmes.
- Réserve mineure : `button.preset-card` hérite d'`Arial` (pas de `font: inherit`) — aucun glyphe
  n'est peint dedans (le texte est dans des `<span>`), mais c'est ce faux positif qui fait échouer
  le test strict de B (§ 4). Propriétaire : C (`css/setup.css`).

### 5.2 Aucun emoji système, icônes sur la grille de 24 px — **NON**

**Preuve : `critic/B/shots/splash-avant-js.png`.** `index.html:39` et `:50` embarquent `🎯` (et `⚙️`)
comme contenu de repli de `<span class="icon" data-icon="target">`. Le premier rendu a lieu à
**FCP = 136 ms**, les modules ES s'exécutent après : avec `js/**` retardé, l'emoji couleur du système
est **effectivement peint en plein écran de démarrage**. Si le JS échoue, il reste.
`scripts/lint-no-emoji.mjs` autorise explicitement ce motif — la règle a été écrite pour laisser
passer le défaut.
Grille 24 px : les tracés respectent la grille (test unitaire), mais la **taille optique** varie de
14 u à 23 u (`critic/B/icons.mjs`, rendu à 96 px) : `close` 56 px d'encre contre `gear` 88,
`warning` 92, `rotate` 80 — dans la même barre d'action, le `×` fait 70 % du `rotate`
(`shots/zoom-barre.png`). `play` est décentré de +1,95 u, `edit` de −0,75 u.
L'épaisseur de trait est **uniforme à 2** (les 2,75–2,88 mesurés sont l'artefact des diagonales) ;
seule la marque `target` est plus fine (40/512 ≈ 1,88 u et 30/512 ≈ 1,41 u).

### 5.3 Tout en jetons, aucune couleur en dur ailleurs — **NON (mineur)**

`css/system.css` : 7 hexadécimaux du thème cyber en valeur de repli (`var(--surface2, #0a2030)`,
`var(--accent, #00ffe0)`, `#e0fff8`…) — propriétaire E.
`css/game.css:260,286,291,295,310,335` et `css/setup.css:115,312` : `rgb(0 0 0 / …)` littéraux —
propriétaires A et C. **Aucun lint n'existe** pour tenir la règle (le critère la demande explicitement).

### 5.4 ≤ 8 tailles, ≤ 2 familles, plancher typographique, hiérarchie identique — **NON**

- **8 sélecteurs sous 12 px** (plancher D10). Tous héritent de `--fs-1: 11px` (`css/tokens.css:22`) :

| Taille | Sélecteur                             | Écran                 | Feuille / propriétaire  |
| ------ | ------------------------------------- | --------------------- | ----------------------- |
| 11 px  | `p.logo-sub`                          | setup                 | `css/setup.css:11` — C  |
| 11 px  | `h2.setup-label`                      | setup, réglages       | `css/setup.css:45` — C  |
| 11 px  | `span.preset-card-name`               | setup                 | `css/setup.css:171` — C |
| 11 px  | `span.preset-card-detail`             | setup                 | `css/setup.css:179` — C |
| 11 px  | `div.toggle-sub`                      | setup                 | `css/setup.css:276` — C |
| 11 px  | `span.btn-text`                       | setup, réglages, noms | `css/setup.css:556` — C |
| 11 px  | `span.name-avatar`                    | noms                  | `css/setup.css:609` — C |
| 11 px  | `span.btn-label` (**barre d'action**) | jeu                   | `css/game.css:383` — A  |

D10 cite nommément « les libellés de la barre d'action » : `span.btn-label` est en plein dedans.
**Un seul changement les corrige tous : `--fs-1: 12px` (propriétaire B).** Note : `tokens.css`
écrit encore en commentaire « plancher 11 px (D7) » et `tests/unit/themes.test.js:92` assert
`toBeGreaterThanOrEqual(11)` — le test ne peut donc pas détecter la régression D10.

- Tailles rendues distinctes : **6** (11, 13, 15, 18, 22, 32) + le score dynamique → ≤ 8 tenu.
  16 px n'apparaît que sur `label.sr-only` (hors écran).
- Hiérarchie **identique sur tous les thèmes** (1 seul profil de tailles par écran) — tenu.
- ≤ 2 familles à l'écran : tenu partout **sauf l'écran Réglages** en cyber et arcade, où
  `span.theme-card-name` force `Inter` en plus des deux familles du thème (3 familles).
  Défendable (aperçu des thèmes), mais c'est une entorse au critère tel qu'il est écrit.

### 5.5 Alignement au pixel — **NON**

`critic/B/grid.mjs` : à 4 joueurs, les 5 `.bar-btn` ont des bords fractionnaires même à DPR 3
(`x = 5,984 / 82,391 / 158,797…`, `width = 72,406`) ; à 12 joueurs, **17 rects sur 18** sont
fractionnaires (`y = 336,797`, `height = 146,391`). Aucun rect n'est sur la grille de 4 px
(195 × 366 à 4 joueurs, 130 × 146 à 12).
Honnêteté : au zoom 400 % (`shots/zoom-jonction-12.png`) la bordure `--card-edge` de 1 px absorbe
la fraction et **aucune couture floue n'est visible** ; c'est la lettre du critère qui tombe, pas
la perception. Propriétaires : A (`css/game.css`, `layout-fit`) et C (barre).

**D5 = 1 / 5.**

---

## 3. D6 — Accessibilité & daltonisme

### 6.1 Contraste 4,5:1 texte / 3:1 composants, 14 thèmes × 5 écrans — **NON**

Voir § 1.1 (4 thèmes échouent au repos, 7 sous le doigt) et § 1.4 (`--muted` : 16/16 sous 3:1).
Les écrans setup / réglages / noms, eux, tiennent : aucune paire mesurée sous le seuil.

### 6.2 Cibles ≥ 44 × 44 px — **attend A**

setup, réglages, noms : **aucun** contrôle sous 44 px (`critic/B/targets.mjs`).
Écran de jeu : `button.pname` mesure **28 × 12 px** — parce que le nom du joueur n'est pas rendu
du tout (seul `.pplayer-ghost` subsiste, cf. § 3.1). Défaut de A en cours, non imputé à B.

### 6.3 / 6.4 Clavier, focus, sémantique — hors périmètre B

`tests/e2e/a11y.spec.js` (axe-core) existe et couvre ces critères ; c'est le domaine de C et A.

### 6.5 12 couleurs joueurs séparables (ΔE2000 ≥ 15) + signe non chromatique — **NON**

Reproduit à l'identique : **30 paires sous 15**, minimum **ΔE = 2,0** (paires 1/9 en tritanopie,
3,6 en protanopie, 4,2 en deutéranopie). B le documente honnêtement et invoque la décision D1.
Mais la compensation invoquée — « position, nom et **numéro de siège** » — **n'existe pas à l'écran** :

- les fonds de cartes ne sont **pas distinguables même en vision normale** : ΔE min 1,9 à 3,4
  selon le thème (1,9 pour mono-light), et 0,4 à 1,5 sous simulation ;
- aucun numéro de siège n'est affiché ;
- le nom n'est pas rendu (voir `shots/jeu12-light-achromatopsia.png` : douze cartes d'un gris
  identique, sans un seul libellé — et deux cartes sans score).

La partie « gain / perte porte un signe » est en revanche **tenue** : `js/fx/score.js:69` écrit
`(sum > 0 ? '+' : '') + fmtNum(sum)`, et la carte éliminée porte l'icône `skull` + le mot « Éliminé ».

**D6 = 0 / 5** (6.2 non imputable à B, 6.3/6.4 hors périmètre B mais comptés dans la dimension).

---

## 4. D2.2 — Contraste score / fond de carte, 14 thèmes × 10 couleurs × 3 états

**NON.** Le tableau de 1600 lignes existe et affiche 0 échec, mais :
(a) le fond est faux (§ 1.1) → 4 thèmes échouent au repos, 7 sous le doigt ;
(b) deux des trois « états » audités ne sont jamais rendus (§ 1.3).
Le critère demande 420 lignes sans échec sur les **couleurs calculées** ; ce sont les couleurs
calculées d'une carte fictive.

---

## 5. Décalage de mise en page (D11) — le domaine de B n'est pas la cause

`critic/B/cls.mjs` / `cls2.mjs` / `cls3.mjs`, écran d'accueil, cache froid :

| Condition                        | CLS       |
| -------------------------------- | --------- |
| normale                          | **0,317** |
| polices retardées de 300 ms      | 0,322     |
| polices retardées de 800 ms      | 0,322     |
| **polices entièrement bloquées** | **0,291** |

**92 % du CLS survit à la suppression totale des polices.** La prémisse de D11
(« le CLS de 0,33 provient du chargement des polices ») est **fausse**. Décomposition :

- **0,289** à ~310 ms : `SECTION.setup-section` passe de 41 px à 154 px de haut quand
  `js/ui/setup.js` remplit `#presets-grid` (6 préréglages) ; tout le reste descend de 232 à 345 px
  et `#go-btn` sort du viewport. **Propriétaire C** (réserver la hauteur de la grille, ou rendre les
  préréglages dans `index.html`).
- **0,027 – 0,031** au moment exact du `swap` de la police (168 ms sans retard, 914 ms avec 800 ms
  de retard), sur `H1.logo-name` et `DIV.presets-grid`. **C'est la part de B**, et elle n'est pas traitée :
  `css/fonts.css` **ne contient ni `size-adjust`, ni `ascent-override`, ni `descent-override`,
  ni `line-gap-override`, ni face de repli locale**, et `index.html` ne contient **aucun**
  `<link rel="preload" as="font">` (vérifié par grep).

Autrement dit : B n'a rien fait de ce que D11 lui demande, **et** même fait à la perfection cela
ramènerait le CLS de 0,317 à ~0,29 — le budget ≤ 0,1 restera inatteignable sans le correctif de C.

---

## 6. Ce qui est enseigné en CI (D13)

- `audit:contrast` et `audit:cvd` **tournent désormais en CI** (`.github/workflows/ci.yml`, job
  `design`, ajouté par F pendant mon audit). Bien.
- Mais `scripts/audit-cvd.mjs:239` fait `process.exit(pairOk ? 0 : 1)` : **une régression de la
  palette joueurs ne fait pas échouer la construction** — seule la paire gain/perte est bloquante.
  Les 30 paires ΔE < 15 passent en vert. Garantie affichée, gardien absent.
- `tests/e2e/visual.spec.js` : les quatre assertions fortes (aucun emoji dans le DOM, ≤ 2 familles,
  plancher typographique, police auto-hébergée déclarée) sont derrière `process.env.VISUAL_STRICT`,
  **qui n'est posé nulle part** (grep dans `.github/`, `package.json`, `playwright.config.js` : rien).
  Preuve :
  ```
  npx playwright test tests/e2e/visual.spec.js              → 4 passed
  VISUAL_STRICT=1 npx playwright test tests/e2e/visual.spec.js → 2 failed, 2 passed
  ```
  (échec : « cyber/setup : Inter, Orbitron, Share Tech Mono, Arial » — 4 familles).
  Une suite verte parce que ses assertions sont éteintes est un mensonge de test.
- `tests/unit/themes.test.js:92` assert un plancher de **11** px : le test ne peut pas détecter
  la violation de D10.

---

## 7. Comparaison à l'aveugle (BLIND-PROTOCOL) — D5 et D6

Application du protocole avec ses limites d'honnêteté §6 : **App A** = mes captures et mesures
réelles ; **App B** = la meilleure référence documentée (`REFERENCES.md`), décrite depuis des
sources publiques, **jamais exécutée, sans capture disponible**. Tout critère que le dossier de la
référence ne prouve pas est noté **INDÉTERMINÉ** et n'est jamais converti en « NON ».

### D5 — référence : « aplats plats cohérents, typographie unique » / « couleurs vives, thème sombre, cohérence des tailles »

| Critère                  | App A   | App B       | Preuve A                         |
| ------------------------ | ------- | ----------- | -------------------------------- |
| 5.1 zéro requête externe | OUI     | INDÉTERMINÉ | routage bloquant, 0 interception |
| 5.2 aucun emoji système  | **NON** | INDÉTERMINÉ | `shots/splash-avant-js.png`      |
| 5.3 tout en jetons       | **NON** | INDÉTERMINÉ | grep `css/system.css`            |
| 5.4 échelle et familles  | **NON** | INDÉTERMINÉ | 8 sélecteurs à 11 px             |
| 5.5 alignement pixel     | **NON** | INDÉTERMINÉ | `grid.mjs`, 17/18 rects          |

**Préférence : indécis, penchant A.** Confiance **2/5**. App A gagne sur l'étendue (14 thèmes
cohérents, hiérarchie identique partout, 0 requête externe : aucune référence ne documente cela) ;
App B est louée pour une qualité que A n'a pas encore, la **sobriété d'exécution** — « aplats plats,
un nombre par panneau, aucune décoration » — alors que A empile texture, liseré d'accent, deux
moitiés teintées et halo de texte, et c'est précisément cet empilement qui casse le contraste (§ 1.1).
Sur le seul critère où les deux dossiers sont comparables — **la cohérence perçue d'un panneau** —
je préfère aujourd'hui B.

### D6 — référence : seule application déclarant « shapes or text, in addition to or instead of color » et un mode motion réduit

| Critère                            | App A            | App B                               | Preuve A                        |
| ---------------------------------- | ---------------- | ----------------------------------- | ------------------------------- |
| 6.1 contraste mesuré               | **NON**          | INDÉTERMINÉ (aucune mesure publiée) | `pixels.mjs`                    |
| 6.2 cibles ≥ 44 px                 | attend A         | INDÉTERMINÉ                         | `targets.mjs`                   |
| 6.3 clavier                        | hors périmètre B | INDÉTERMINÉ                         | —                               |
| 6.4 sémantique                     | hors périmètre B | INDÉTERMINÉ                         | —                               |
| 6.5 12 couleurs séparables + signe | **NON**          | INDÉTERMINÉ (limitée à 4 joueurs)   | `cvd-repro.md`, `shots/jeu12-*` |

**Préférence : B.** Confiance **2/5**. App A **mesure** son daltonisme, ce que B ne fait pas — c'est
un vrai avantage de méthode. Mais App B **livre** ce que A promet : formes ou texte **en plus ou à la
place** de la couleur. Chez A, la simulation achromatopsie à 12 joueurs
(`shots/jeu12-light-achromatopsia.png`) donne douze panneaux gris identiques, sans nom, sans numéro
de siège : la couleur est le **seul** porteur, et elle ne porte rien (ΔE min 1,9 même en vision
normale). Le hors-périmètre de la référence (4 joueurs) est signalé, pas converti en victoire.

_Limites reproduites : asymétrie de preuve (§6.1), biais de rédaction (§6.2), biais de
reconnaissance (§6.3), périmètre (§6.4). Ce protocole ne remplace pas un essai sur table._

---

## 8. Verdict

| Dimension                           | Score     | Détail                                                    |
| ----------------------------------- | --------- | --------------------------------------------------------- |
| **D5 — Système visuel & thèmes**    | **1 / 5** | 5.1 OUI · 5.2 NON · 5.3 NON · 5.4 NON · 5.5 NON           |
| **D6 — Accessibilité & daltonisme** | **0 / 5** | 6.1 NON · 6.2 NON (A) · 6.3 hors B · 6.4 hors B · 6.5 NON |
| **D2.2 — Contraste score / carte**  | **0 / 1** | tableau valide, périmètre faux                            |

### AAA : **non.**

Un critique qui compare à l'aveugle préfère la référence sur D6 et ne tranche pas sur D5. Les deux
audits de B sont reproductibles et arithmétiquement justes, mais ils certifient une composition qui
n'est pas à l'écran ; la suite visuelle est verte parce que ses assertions sont désactivées ; le
plancher typographique de D10 n'est pas appliqué ; `css/fonts.css` ne fait rien de ce que D11 demande.

---

## 9. Corrections, classées et actionnables

### Bloquant

1. **`css/tokens.css:22` — `--fs-1: 11px` → `12px`** ; corriger le commentaire ligne 21
   (« plancher 12 px (D10) ») et `tests/unit/themes.test.js:92`
   (`toBeGreaterThanOrEqual(11)` → `12`). Corrige d'un coup les 8 sélecteurs listés au § 5.4.
   **Propriétaire : B.**
2. **`scripts/audit-contrast.mjs` (`probeColors`) — auditer le fond RÉELLEMENT composé.**
   Reproduire dans la carte sonde `.tap-half.minus` / `.tap-half.plus` avec leurs fonds, et la
   texture `.card-inner::after`, puis composer ; ou, mieux, lire le pixel rendu comme
   `critic/B/pixels.mjs`. Résultat attendu : l'audit doit **échouer aujourd'hui** sur light, auto,
   ldm, nature et dark. **Propriétaire : B.**
3. **Contraste du score sur carte ≥ 4,5:1 fond composé inclus**, thèmes `light`, `auto (clair)`,
   `ldm`, `nature`, `dark`. Leviers, dans l'ordre de préférence :
   `--half-plus` de 8 % → 4 % et `--half-minus` de 14 % → 8 % (`css/game.css:45-50`, **A**) ;
   assombrir `--score-color` de ces thèmes (`css/themes.css`, **B**) ;
   `--card-mix` de 30 % → 24 % sur les thèmes sombres (**B**).
   Valeur cible : pire quadrant ≥ 4,5:1 au repos et ≥ 3:1 sous le doigt.
4. **`index.html:39` et `:50` — retirer `🎯` et `⚙️` du DOM initial.** Poser le SVG de la marque
   directement en ligne dans `#splash` et `.logo-mark` (le tracé existe déjà dans `ICONS.target`),
   et retirer l'exception « HTML » de `scripts/lint-no-emoji.mjs`.
   **Propriétaires : B (tracé + lint), fondation (`index.html`).**
5. **`tests/e2e/visual.spec.js` — supprimer la garde `VISUAL_STRICT`** et rendre les quatre
   assertions inconditionnelles ; corriger au passage la sonde `usedFamilies()` pour ne retenir que
   les éléments porteurs d'un **nœud texte propre** (sinon `button.preset-card` → `Arial` fait échouer
   à tort). **Propriétaire : B.**
6. **`scripts/audit-cvd.mjs:239` — `process.exit(pairOk && paletteFails === 0 ? 0 : 1)`**, ou
   introduire un seuil de régression explicite (« au plus N paires < 15, valeur figée ») afin qu'une
   dégradation de la palette casse la CI. Sinon D13 n'est pas tenu pour cet audit.
   **Propriétaire : B.**

### Majeur

7. **États interactifs dans l'audit** : ajouter `pressed`, `flash-pos`, `flash-neg`, `blocked`,
   `elim` (et documenter l'exemption `:disabled` de WCAG 1.4.3).
   `scripts/audit-contrast.mjs`, `UI_PAIRS` + sonde de carte. **Propriétaire : B.**
8. **`--muted` : soit l'amener à ≥ 3:1** sur `--surface` et `--bg2` (relever `40%` vers ~60 % dans
   `css/tokens.css:--muted`), **soit** cesser de l'utiliser comme trait de `.recap-spark-flat`
   (`css/modals.css:511`) et lui substituer `--muted2`. Puis retirer l'exclusion du rapport.
   **Propriétaires : B (jeton), A (`modals.css`).**
9. **`css/fonts.css` — appliquer D11** : `size-adjust`, `ascent-override`, `descent-override`,
   `line-gap-override` mesurés par famille, plus une face de repli locale
   (`@font-face { font-family: 'Inter fallback'; src: local('Arial'); size-adjust: … }`) et
   `<link rel="preload" as="font" type="font/woff2" crossorigin>` sur les **deux** polices du premier
   rendu du thème par défaut (Orbitron, Share Tech Mono). Gain attendu, mesuré : **0,031** de CLS.
   **Propriétaire : B.** Régénérer aussi `scripts/fetch-fonts.mjs` en conséquence.
10. **Signaler à l'auditeur que D11 repose sur un diagnostic faux** : 0,289 du CLS de 0,317 vient de
    `#presets-grid` rempli en JS (`SECTION.setup-section` 41 px → 154 px à ~310 ms). Réserver la
    hauteur (`min-height` calculée sur 6 cartes ou rendu statique dans `index.html`).
    **Propriétaire : C.** Sans cela le budget CLS ≤ 0,1 est hors d'atteinte.
11. **Retirer ou câbler `.score.low` / `.score.crit`.** `js/core/rules.js:52` fournit `scoreAlert()` ;
    aucun code d'interface ne l'applique. Tant que c'est mort, l'audit doit cesser de compter ces
    320 paires. **Propriétaires : A (câblage), B (audit).**
12. **Taille optique des icônes.** Normaliser la boîte d'encre autour de ~20 u (±1) :
    `close` (14 u) et `check` (18 × 12,5 u) sont trop petits face à `gear` (22 u), `warning` (23 u),
    `gamepad` (22 u). `js/ui/icons.js` + régénérer `assets/icons/sprite.svg`.
    Ajouter au test unitaire une borne sur la boîte englobante, pas seulement `max ≤ 24`.
    **Propriétaire : B.**

### Mineur

12 bis. **`tests/e2e/a11y.spec.js:149` — seuil de texte 11 → 12 px** (`undersizedTexts(page, sel, 11)`),
pour que D10 soit gardé par un test. **Propriétaire : C** (coordonné avec la correction 1 de B).

13. **`assets/icons/sprite.svg` est mort** : référencé par **aucune** page ni aucun script, mais
    précaché par `sw-st.js:28`. Soit l'utiliser (`<use href>`), soit le sortir du précache et du dépôt.
    **Propriétaires : B (sprite), E (précache).**
14. **Règles mortes `css/themes.css:506, 509, 555`** : `.tap-sign-plus` / `.tap-sign-minus`
    n'existent plus dans le DOM (la classe rendue est `.tap-sign`). À supprimer ou à renommer.
    **Propriétaire : B.**
15. **Couleurs en dur hors jetons** : `css/system.css` (7 hexadécimaux cyber en repli, **E**),
    `css/game.css:260,286,291,295,310,335` et `css/setup.css:115,312` (`rgb(0 0 0 / …)`, **A** et **C**).
    Ajouter le garde-fou que le critère D5.3 demande (règle stylelint ou script maison dans `npm run lint`).
    **Propriétaire du garde-fou : B.**
16. **`play` décentré de +1,95 u**, `edit` de −0,75 u, `copy` de −0,57 u (`critic/B/icons.mjs`).
    **Propriétaire : B.**
17. **Écran Réglages : 3 familles à l'écran** en cyber et arcade (`span.theme-card-name` en `Inter`).
    Soit assumer l'aperçu et l'écrire dans le rapport de B, soit aligner sur la police du thème.
    **Propriétaires : B (décision), C (`css/setup.css`).**
18. **`button.preset-card` sans `font: inherit`** (`css/setup.css`) → hérite d'`Arial`. Aucun glyphe
    peint, mais c'est ce bruit qui rend le test strict de B inexploitable. **Propriétaire : C.**

---

## 10. Ce qui relève de A et n'est pas compté contre B

- Le nom du joueur n'est pas rendu sur l'écran de jeu (`.pname` contient un seul
  `.pplayer-ghost`) → `button.pname` = 28 × 12 px (< 44 px), et la compensation non chromatique
  invoquée par B disparaît. `shots/jeu4-*.png`, `shots/jeu12-*.png`.
- Le chiffre du score est **rogné** à 4 joueurs (bords gauche/droit coupés) et **absent** sur
  2 cartes sur 12 à 12 joueurs. `shots/jeu4-light-none.png`, `shots/jeu12-light-achromatopsia.png`.
- Aucun numéro de siège affiché (exigé par le raisonnement de D1 que B invoque pour justifier
  la palette non séparable).
- Rects de cartes fractionnaires (`layout-fit`) — § 5.5.

## 11. Ce qui n'a pas pu être jugé

- `tests/e2e/a11y.spec.js` : **4 échecs sur 5** pendant mon exécution, tous au même endroit
  (`helpers.js:24`, `#splash` jamais retiré), donc un artefact de cache HTTP / de fichier en chantier,
  **pas un verdict**. Relancé hors suite avec `cache-control: no-cache`, l'application démarre
  normalement. Les critères **6.3 et 6.4 restent non prouvés de mon côté** — à refaire quand A a rendu
  la main. À noter au passage : ce fichier assert `undersizedTexts(page, sel, 11)`
  (`a11y.spec.js:149`) — comme `themes.test.js`, il ne peut pas détecter la violation de D10.
- Les thèmes autres que les 8 mesurés au pixel (`neon-pink`, `sunset`, `ocean`, `gold`, `ldm-day`)
  n'ont pas été passés au banc `pixels.mjs` ; leurs marges au § 1.1 laissent penser que
  `ldm-day` et `sunset` sont également en dessous, mais **je ne l'affirme pas sans mesure**.
