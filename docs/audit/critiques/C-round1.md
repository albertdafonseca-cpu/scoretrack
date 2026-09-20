# CRITIQUE — Élément C (setup / noms / réglages / confidentialité, accessibilité) — tour 1

Date : 17 septembre 2026. Aucune modification du dépôt. Preuves : `scratchpad/critic/C/`.
Contexte : les agents A, D et F modifient l'écran de jeu, `js/core` et les docs pendant l'audit.

---

## 0. Ce qui attend l'élément A (non imputable à C)

- **D1.1 / D1.2 / D1.4** dépendent du premier tap sur une carte. Mesurable côté C : 1 clic sur
  `#go-btn` suffit pour atteindre l'écran de jeu à froid ; le 2ᵉ tap est celui de A.
- Premier passage de `npx playwright test tests/e2e/setup.spec.js tests/e2e/a11y.spec.js`
  (19:30, `critic/C/pw-run1.log`) : **2 échecs**, `#sc-0` valait `2` au lieu de `1` après un tap
  (double déclenchement pointeur, `js/ui/game.js`). À 19:47 le même commandement donne
  **10 passed (17,4 s)** : A avait corrigé entre-temps. Échecs **ignorés**, imputés à A.
- L'application était aussi **entièrement cassée** entre 19:34 et 19:45
  (`PAGEERROR: The requested module './history.js' does not provide an export named 'groupsFromLog'`,
  `js/core/save-schema.js:17`, chantier de D). Les sondes ont été relancées après rétablissement.

---

## 1. Les tests de C sont-ils exigeants ? — NON, ils sont calibrés pour passer

| Faiblesse                                                 | Preuve                                                                                                                                                                              |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Plancher typographique testé à 11 px, pas 12 px (D10)** | `tests/e2e/a11y.spec.js:140` → `undersizedTexts(page, sel, 11)`, et le filtre est `px < min` : 11,000 px passe. Le test valide exactement ce que D10 interdit.                      |
| **axe sans `best-practice`**                              | `a11y.spec.js:18` `withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa'])`. Avec `best-practice`, `landmark-one-main` remonte sur setup, noms et réglages (aucun `<main>`).            |
| **axe filtré à serious/critical**                         | `a11y.spec.js:23` — tout `moderate` est invisible.                                                                                                                                  |
| **2 thèmes sur 14**                                       | `a11y.spec.js` n'audite que le thème par défaut et `cards.nth(10)` (= `light`). Les deux thèmes qui échouent (`mono-light`, `ldm-day`) ne sont jamais audités.                      |
| **Un seul viewport**                                      | `playwright.config.js` n'a qu'un projet `mobile-chromium` (iPhone 13, 390×844). Rien à 320 px ni 768 px : le débordement à 320 px (§4) n'est pas vu.                                |
| **Assertion creuse sur `aria-describedby`**               | `setup.spec.js:152` vérifie `#max-custom[aria-describedby=max-error]` — l'attribut est **statique dans `index.html:145`**, il est vrai même sans erreur. L'assertion ne teste rien. |
| **Le test clavier entérine le défaut**                    | `a11y.spec.js:73` : `expect(order.filter(c => c === 'player-chip on').length).toBeLessThanOrEqual(1)` — le test **exige** qu'un seul contrôle sur douze soit atteignable par Tab.   |
| **Aucun état d'erreur audité par axe**                    | l'erreur « max < départ » n'est jamais passée à axe ni à la mesure de police.                                                                                                       |
| **Aucun test d'export/import réel**                       | `settings.js` (export, import, fichier invalide) n'est couvert par aucun e2e.                                                                                                       |

---

## 2. Plancher typographique — D10 (12 px) : **NON**, sur les quatre écrans

`css/tokens.css:22` → `--fs-1: 11px`. Tous les repli CSS écrivent `var(--fs-1, 11px)`
(`css/base.css:127`, `css/setup.css` ×17). Mesure `getComputedStyle` (`critic/C/probe-a11y.log`) :

**Accueil (11 sélecteurs à 11 px, 22 nœuds)** — `.logo-sub`, `#lbl-presets`, `#lbl-players`,
`#lbl-start`, `#lbl-max`, `.preset-card-name`, `.preset-card-detail`,
`#preset-custom .preset-card-name`, `#preset-custom .preset-card-detail`, `#neg-sub`,
`.setup-btn-row .ghost-btn .btn-text`.
**Joueurs (3)** — `.names-action-btn .btn-text`, `.name-avatar`, `.setup-btn-row .ghost-btn .btn-text`.
**Réglages (5)** — `#lbl-theme`, `#lbl-data`, `#lbl-privacy`, `.settings-row .ghost-btn .btn-text`,
`#settings-page .ghost-btn .btn-text`.
**Confidentialité (3)** — `#btn-clear-all .btn-text`, `.st-privacy-date`, `.st-privacy-close`.
**Bannière de reprise (3)** — `#restore-when`, `.restore-btn.yes`, `.restore-btn.no`.

Aggravant : `user-scalable=no` est conservé (D7/D12) _en échange_ du respect des tailles minimales.
Cette contrepartie n'est pas honorée. Et le texte n'est pas redimensionnable : toutes les tailles
sont en px, `html{font-size:32px}` ne change rien (`#lbl-presets` reste à 11 px —
`critic/C/probe-layout.log`). Sur mobile, l'utilisateur n'a donc **aucun** moyen d'agrandir le texte.

## 3. Raccourcis du manifeste — D14 : **NON IMPLÉMENTÉS**

`grep -rn "location.search\|URLSearchParams" js/ index.html` → **0 occurrence**.
Vérifié en exécution (`critic/C/probe-d1.log`) :

- `?action=new` → page active `setup-page`, écran de jeu non affiché ;
- `?action=resume` → page active `setup-page`, la partie n'est **pas** reprise (simple bannière).

`manifest-st.json:58-72` annonce pourtant « Nouvelle partie » → `./?action=new` et
« Reprendre la partie » → `./?action=resume`. Défaut imputé à C (routage des écrans d'entrée).

## 4. Accessibilité mesurée moi-même

### axe-core (wcag2a + wcag2aa + wcag21a + wcag21aa + best-practice)

- **3 violations `color-contrast` de gravité _serious_** sur les 14 thèmes × 5 états
  (`critic/C/probe-themes.log`) :
  1. `ldm-day` → `#restore-title` (accueil **et** état d'erreur). Contraste calculé :
     `--accent #7a5500` sur `color-mix(in srgb, #7a5500 10%, #ddd5c0)` = #d3c8ad → **4,04:1**
     pour un texte de 13 px gras (seuil 4,5:1). `css/setup.css:422`.
  2. `mono-light` → `.points-chip.on[data-val="40"]` (état d'erreur).
  3. `ldm-day` → `.points-chip.on[data-val="40"]` (état d'erreur).
- `landmark-one-main` (_moderate_) sur setup, noms et réglages : aucun `<main>` dans `index.html`.
- `meta-viewport` : dérogation admise (D12), écartée du décompte.
- Bannière de reprise, modale, thème clair, `mono-light`, `ldm` : RAS par ailleurs.

### Navigation 100 % clavier (390×844, `critic/C/kbd/tab-01..09`, `probe-kbd.log`)

Ordre : `.logo-gear` → `#preset-custom` → puce joueurs → puce départ → `#points-custom` →
puce max → `#max-custom` → `#neg-toggle` → `#go-btn`. **9 tabulations**, ordre logique,
anneau `outline: 3px solid var(--focus)` + halo, bien visible sur chaque capture.

- **Tab n'atteint pas chaque contrôle (D6.3 littéral : NON).** Le tabindex tournant est appliqué à
  des conteneurs `role="group"` (`index.html:75, 91, 98, 128` ; `js/ui/a11y.js:rovingGroup`).
  Le motif APG réserve le tabindex tournant aux widgets composites (`radiogroup`, `toolbar`,
  `listbox`, `tablist`) ; sur un simple `group`, rien n'annonce la navigation par flèches et
  **6/7 préréglages, 11/12 puces joueurs, 5/6 puces départ, 5/6 puces max et 13/14 thèmes
  restent hors de l'ordre de tabulation**.
- Deux arrêts (`points-chip.on`, `#go-btn`) sont amenés au ras du bord bas : l'anneau de focus est
  rogné (captures `tab-04`, `tab-09`). Mineur.

### Modale de confidentialité

- `role="dialog"`, `aria-modal="true"`, focus initial sur `#privacy-title`, piège de focus
  cyclique, **Échap ferme et rend le focus au déclencheur** ✔ (`probe-flow.log`).
- **Le fond n'est ni `inert` ni `aria-hidden`** : `settingsAriaHidden: null, settingsInert: false`.
  `page.accessibility.snapshot()` pris modale ouverte (`critic/C/ax-privacy.json`) contient
  **toute la page Réglages** (14 boutons de thème, export, import…). En mode exploration, un
  lecteur d'écran sort du dialogue : `aria-modal` seul ne suffit pas avec un piège JS.
- Le clic sur le fond de l'overlay ne ferme pas ; la `.modal-handle` (poignée de feuille) n'est
  associée à aucun geste et la boîte est centrée (`margin:auto`, `max-height:80vh`) : l'affordance
  est décorative et mensongère.
- **`user-select: none` s'applique au texte de la politique de confidentialité**
  (`css/base.css:4-12`, seuls `input/textarea` sont exemptés ; mesuré `userSelect: "none"` sur
  `.st-privacy-body`). Un texte juridique non copiable, clé `scoretrack_errors` comprise.

### Arbre d'accessibilité (`critic/C/ax-setup.json`)

Bon dans l'ensemble : `button "4 joueurs" pressed=true`, `switch "Scores négatifs" checked=false`,
`spinbutton "Points de départ, autre valeur"`, `aria-invalid` posé/retiré, `#setup-summary` en
`aria-live="polite"`, annonces via région live unique. Réserves :

- les noms accessibles sont exposés **en capitales** (`text-transform`) : « SCORETRACK »,
  « LANCER LA PARTIE », « LOI DU MILIEU 6j · 40pts · élim à 0 » ;
- deux titres « CONFIDENTIALITÉ » identiques (section Réglages + titre de la modale) ;
- après confirmation de « Supprimer toutes les données », **le focus retombe sur `<body>`**.

### Cibles tactiles

0 cible < 44×44 px sur les 4 écrans × 390×844, 768×1024 et 320×568 (`probe-d1.log`). ✔

## 5. Tailles d'écran et zoom

- 390×844 et 768×1024 : aucun débordement, aucun défilement horizontal (`probe-layout.log`).
- **320×568 : la 3ᵉ action de la page Joueurs déborde** —
  `button.names-action-btn left=249,7 right=338,1` pour `clientWidth=320`. `overflow-x:hidden`
  (`css/base.css:16, 26`) masque le dépassement : le bouton affiche « OUBLIE », tronqué, et sa
  moitié droite est hors écran, sans défilement possible (capture `v-320x568-noms.png`).
  Violation de **WCAG 1.4.10 Reflow (AA)**, qui impose 320 px CSS sans perte.
- Modale : `max-height: 80vh`, contenu défilant, « Fermer » et « Supprimer toutes les données »
  atteignables par défilement aux 3 tailles ; aucune ombre ni dégradé n'indique qu'il reste du
  contenu (le texte est coupé net au bord arrondi).
- Zoom texte 200 % : **inopérant** (§2). Zoom navigateur 200 % (viewport CSS 195 px) :
  `#app-title`, puces et `ghost-btn` débordent — hors seuil 1.4.10 mais symptomatique.

## 6. Parcours vérifiés moi-même

| Parcours                        | Résultat                                                                                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| À froid → premier score         | `#go-btn` actif, résumé « 4 joueurs · départ 0 · sans limite », 1 clic → table. **CPU ×4 : CTA actif à 341 ms, table prête à 572 ms** (seuil 1 500 ms). ✔                       |
| Parcours nommé                  | 18 caractères imposés, `enterkeyhint`, Entrée passe à la case suivante, noms mémorisés par préréglage. ✔                                                                        |
| Reprise après rechargement      | Bannière + aperçu « Alice 0 · Bob 0 · … », `<time datetime>` + « Sauvegardée à l'instant », 1 clic. ✔                                                                           |
| Erreur max < départ             | Bordure `--loss`, glyphe ⚠, message « Le maximum doit être au moins égal aux points de départ (40) », `aria-invalid`, CTA désactivé, résumé remplacé. ✔ (voir §7 pour le rendu) |
| Export → import                 | `scoretrack-2026-09-17.json` (829 o, schéma `v:2`), réimport → « Import réussi : … 1 partie en cours », rechargement, bannière restaurée. ✔                                     |
| Import invalide / fichier texte | « Import refusé : Ce fichier n'est pas un JSON valide. » ✔                                                                                                                      |
| Suppression en deux temps       | 1ᵉʳ appui → « Confirmer la suppression », désarmement automatique à 5 s, 2ᵉ appui → `localStorage` vidé, retour à l'accueil. ✔ (focus perdu)                                    |
| Erreurs console                 | **0** sur l'ensemble des parcours. ✔                                                                                                                                            |

## 7. Design, libellés, français

1. **Le CTA désactivé ne se lit pas comme désactivé** (`C/after/m390-01c-setup-error.png`) :
   « LANCER LA PARTIE » désactivé devient un bouton _outline_ gris, tandis que « NOMMER LES
   JOUEURS » — désactivé lui aussi — garde sa bordure bleue vive. Deux boutons dans le même état
   ont deux rendus différents, et le primaire désactivé ressemble à un secondaire actif.
2. **Actions destructrices sans garde-fou, incohérentes entre elles** : « Effacer » (bannière de
   reprise → `discardSave`) et la croix « Oublier le prénom X » (`names.js:deleteProfile`)
   suppriment en un tap, sans confirmation ni annulation, alors que « Supprimer toutes les
   données » impose deux temps. Sur la bannière, « Effacer » a exactement le même poids visuel
   que « Reprendre ».
3. **Page Joueurs : croix de suppression collée au prénom**, même hauteur, même bordure, aucun
   écart — mis-tap garanti (`C/after/m390-02-names.png`).
4. **États vides absents** : « Mélanger », « Mémoriser » et « Oublier » sont actifs même sans
   aucun prénom saisi ni mémorisé ; « Oublier » annonce « Prénoms mémorisés oubliés » alors que
   rien n'existait, « Mélanger » annonce « Ordre des joueurs mélangé » sur douze cases vides.
   `#profiles-list` est simplement masqué : rien n'explique à quoi sert « Mémoriser ».
5. **Trois familles typographiques sur les écrans de C** : `body { font-family: 'Inter' }`
   (`css/base.css:22`) et `.theme-card-name { font-family: 'Inter', sans-serif }`
   (`css/setup.css:496 env.`) codées en dur, alors que tout le reste utilise `--btn-font`
   (Orbitron) et `--score-font` (Share Tech Mono). Les noms de thèmes jurent avec le reste de
   l'écran Réglages (`C/after/m390-04-settings.png`) et D5.4 impose ≤ 2 familles par thème.
6. **État « pressé » incohérent** : un préréglage sélectionné = bordure pleine + fond ; la carte
   « Personnalisé » sélectionnée = **bordure pointillée**, qui se lit comme une zone de dépôt.
7. **Libellés discutables** : « Défauts » seul est ambigu en français (valeurs par défaut vs
   imperfections) ; « Sauver comme défaut » est un calque de _save as default_ (« Enregistrer
   comme réglages par défaut ») et passe à la ligne, déséquilibrant la rangée ; deux « Oublier »
   de portées différentes cohabitent sur la page Joueurs.
8. **Typographie française fautive** : **0 espace insécable** dans `index.html`
   (`grep -c '&nbsp;\|\xc2\xa0'` → 0) — d'où la coupure observée à 320 px entre « Joueur » et
   « n » dans `« Joueur n »`, et aucune protection avant « : » ni à l'intérieur des guillemets.
   **Apostrophes droites** dans tout le texte visible (`l'appareil`, `n'envoie`, `d'audience`,
   15 occurrences) alors que `js/ui/settings.js`/`backup.js` produisent des apostrophes courbes
   (« Ce fichier n'est pas un JSON valide. » s'affiche avec ’). Deux styles dans la même app.
9. **Rythme vertical** : `#data-status` réserve 18 px en permanence, creusant un blanc irrégulier
   entre la rangée Export/Import et la section Confidentialité ; le titre « Réglages » n'est pas
   aligné sur l'axe du bouton Retour.
10. **Code mort** : `#splash.hidden { opacity: 0 }` (`css/base.css`) ne s'exécute jamais, la règle
    générale `.hidden { display: none !important }` gagne — le fondu annoncé en commentaire
    n'existe pas.
11. **Couleurs codées en dur en JS** (D5.3) : `js/ui/names.js:nameRow` (`style: color:${color}`)
    et `js/ui/settings.js:themeCard` (`background:${t.bg}`, `color:${t.a}`, `border:1px solid`).

---

## 8. Verdict critère par critère

### D1 — Première prise en main (périmètre C)

| #                                                                                               | Verdict       | Preuve                                                                         |
| ----------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------ |
| 1.1 ≤ 2 taps                                                                                    | **OUI**       | `setup.spec.js:6` passe (10 passed, 17,4 s) ; 1 clic C + 1 tap A               |
| 1.2 < 1 500 ms CPU ×4                                                                           | **OUI**       | 341 ms / 572 ms (`probe-d1.log`)                                               |
| 1.3 CTA actif par défaut                                                                        | **OUI**       | `#go-btn` non `disabled`, résumé prérempli (`s1`, `C/after/m390-01-setup.png`) |
| 1.4 affordance +/−                                                                              | **ATTENTE A** | écran de jeu, hors périmètre C                                                 |
| 1.5 reprise 1 tap + aperçu                                                                      | **OUI**       | `s2-banniere-reprise.png`, `#restore-preview`, `<time datetime>`               |
| → **4/4 mesurables**, mais **D14 non tenu** : le raccourci système « Reprendre » n'aboutit pas. |

### D6 — Accessibilité (périmètre C)

| #                                 | Verdict               | Preuve                                                                                                 |
| --------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------ |
| 6.1 contraste 14 thèmes           | **NON**               | 3 `color-contrast` _serious_ (`probe-themes.log`), `#restore-title` ldm-day = 4,04:1                   |
| 6.2 cibles ≥ 44 px                | **OUI** (réserve)     | 0 échec × 3 viewports ; mais « Oublier » sort du viewport à 320 px                                     |
| 6.3 clavier complet               | **NON**               | 41 contrôles hors de l'ordre de tabulation ; fond de modale non inerte ; focus perdu après suppression |
| 6.4 sémantique, 0 serious         | **NON**               | 3 serious ci-dessus + `landmark-one-main` + arbre a11y de la modale non isolé                          |
| 6.5 CVD / signes non chromatiques | **OUI** (périmètre C) | erreur = ⚠ + texte ; pressé = coche + anneau + position                                                |
| → **2/5**.                        |

### Autres décisions du brief

- **D10 plancher 12 px : NON** (≈ 25 sélecteurs à 11 px, §2).
- **D14 raccourcis manifeste : NON** (§3).
- **D12 `meta-viewport`** : dérogation admise, mais la contrepartie (tailles minimales) n'est pas tenue.

### Note globale de l'élément C : **2,5 / 5** — **AAA : NON**

Le squelette est bon (parcours courts, erreurs claires, export/import robuste, piège de focus,
0 erreur console, cibles conformes, 341 ms au CTA). Il est disqualifié par deux décisions
d'arbitrage non appliquées (D10, D14), trois échecs de contraste AA mesurés, une navigation
clavier incomplète par construction, un débordement à 320 px, et une suite de tests calibrée
sur l'ancien plancher.

---

## 9. Comparaison à l'aveugle (BLIND-PROTOCOL) — App A = ScoreTrack, App B = référence

**Limites reproduites** (§6 du protocole) : asymétrie de preuve — A est mesurée en exécution
réelle, B est décrite depuis des sources publiques sans exécution ; les critères non prouvés côté
B sont **INDÉTERMINÉ** et ne deviennent jamais « NON » au bénéfice de A. Confiance faible.

**D1 — B = Carbon.** A : ≤ 2 taps mesurés, CTA prérempli, **reprise en 1 tap avec aperçu (noms,
scores, date relative)** — non documenté chez B. B : ouvre **directement** sur la table, aucun
écran intermédiaire ; A impose un écran de configuration de sept sections à faire défiler et
annonce des raccourcis système qui ne fonctionnent pas. 1.4 côté A : indéterminé (chantier A).
→ **Préférence : indécis.** L'aperçu de reprise de A compense l'immédiateté de B ; sans 1.4 et
avec des raccourcis morts, on ne peut pas trancher. Confiance 3/5.

**D6 — B = Mutility.** A prouve bien davantage : contraste mesuré sur 14 thèmes, clavier,
piège de focus, région live, `aria-pressed`/`aria-checked`/`aria-invalid`, cibles ≥ 44 px vérifiées
à trois tailles. B ne documente que « formes ou texte en plus de la couleur » et le motion réduit,
sans mesure : 4 critères sur 5 restent INDÉTERMINÉS côté B. Mais A a **trois échecs AA prouvés**,
une tabulation incomplète par construction et un débordement à 320 px.
→ **Préférence : indécis, léger penchant pour B.** Une prétention AAA ne survit pas à trois
violations AA mesurées face à un concurrent dont on ignore les défauts. Confiance 2/5.

---

## 10. Corrections, classées

### Bloquant

1. **`css/tokens.css:22`** — `--fs-1: 11px` → **12 px** (et décaler l'échelle si nécessaire).
   Remplacer les 20 replis `var(--fs-1, 11px)` / `var(--fs-2, 12px)` de `css/base.css` et
   `css/setup.css` par les valeurs réelles des jetons. Attendu : 0 nœud < 12 px sur les 4 écrans.
2. **`tests/e2e/a11y.spec.js:140-141`** — `undersizedTexts(page, sel, 11)` → `12`, et ajouter
   l'état d'erreur et la bannière de reprise à `forEachScreen`. Attendu : le test échoue avant
   le correctif 1, passe après.
3. **`css/setup.css:422` `.restore-title`** — contraste 4,04:1 en `ldm-day`. Utiliser `--text`
   (ou un accent assombri) sur `color-mix(--accent 10%, --surface)`. Attendu : ≥ 4,5:1.
4. **`css/themes.css` `[data-theme='mono-light']` et `[data-theme='ldm-day']`** — couple
   `--chip-on` / `--chip-on-text` de `.points-chip.on`. Attendu : ≥ 4,5:1 (axe : 0 `color-contrast`).
5. **`tests/e2e/a11y.spec.js:16`** — boucler axe sur **les 14 thèmes** × {accueil, erreur, noms,
   réglages, modale, bannière} avec `withTags([... , 'best-practice'])` et sans filtre
   `serious/critical`. Attendu : le test échoue aujourd'hui sur `mono-light`, `ldm-day` et
   `landmark-one-main`.
6. **`js/main.js:init`** — câbler `new URLSearchParams(location.search).get('action')` :
   `new` → `resetSetupForm()` + `showPage('setup-page')` et bannière masquée ;
   `resume` → `restoreGame()` si `has(KEYS.save)`, sinon repli sur l'accueil ; puis
   `history.replaceState` pour nettoyer l'URL. Sinon, retirer `shortcuts` de `manifest-st.json`.
   Attendu : test e2e ouvrant `/?action=resume` et atterrissant sur `#game-screen`.
7. **`css/setup.css` `.names-actions`** — débordement à 320 px. Passer la rangée en
   `grid-template-columns: repeat(auto-fit, minmax(0, 1fr))` (ou `flex-wrap: wrap`) avec
   `min-width: 0` sur `.names-action-btn`. Attendu : `right ≤ clientWidth` à 320 px ; ajouter un
   projet Playwright 320×568.

### Majeur

8. **`js/ui/settings.js:openPrivacy` / `js/ui/a11y.js:trapFocus`** — poser `inert` (repli
   `aria-hidden="true"`) sur `#setup-page` et `#settings-page` à l'ouverture, le retirer à la
   fermeture. Attendu : `page.accessibility.snapshot()` modale ouverte ne contient plus que le
   dialogue.
9. **`index.html`** — envelopper les pages dans un `<main>` (ou `role="main"` sur `.page.active`).
   Attendu : `landmark-one-main` disparaît.
10. **`js/main.js:clearAllData`** — après suppression, rendre le focus à un élément stable
    (`#go-btn` ou le titre de l'accueil) au lieu de `<body>`.
11. **`js/ui/game.js:discardSave` (bouton `.restore-btn.no`) et `js/ui/names.js:deleteProfile`**
    — armer en deux temps comme `armClearAll`, ou proposer une annulation. Attendu : un seul tap
    ne détruit plus de données.
12. **`css/base.css:4-12`** — exempter le texte long de `user-select: none` (ajouter
    `.st-privacy-body, .setup-help, .restore-preview { user-select: text }`). Attendu :
    `getComputedStyle(...).userSelect === 'text'`.
13. **`index.html:75, 91, 98, 128` + `#themes-grid`** — donner aux groupes à tabindex tournant un
    rôle composite (`role="radiogroup"` + `role="radio"`/`aria-checked` pour joueurs, départ, max,
    préréglages, thèmes), ou retirer le tabindex tournant et laisser chaque bouton dans l'ordre de
    tabulation. Attendu : Tab (ou flèches annoncées) atteint chaque contrôle ; corriger en
    conséquence `a11y.spec.js:73`.
14. **`css/setup.css` `.go-btn:disabled` / `.names-go-btn:disabled`** — un style désactivé
    unique et sans ambiguïté (opacité + suppression de la bordure vive), différent du secondaire actif.
15. **`css/base.css:22` et `css/setup.css` `.theme-card-name`** — supprimer `'Inter'` codé en dur
    au profit de `var(--font-ui)`. Attendu : ≤ 2 familles calculées par thème sur les écrans de C.

### Mineur

16. `index.html` — espaces insécables (`&nbsp;`/U+202F) avant « : », « ? », « ! » et à l'intérieur
    des guillemets ; apostrophes courbes `’` partout (15 occurrences), pour s'aligner sur les
    messages JS.
17. `index.html` — libellés : « Défauts » → « Valeurs par défaut » ; « Sauver comme défaut » →
    « Enregistrer par défaut » ; distinguer « Oublier » (tous) de la croix par prénom.
18. `js/ui/names.js` — états vides : désactiver « Mélanger »/« Mémoriser »/« Oublier » quand il n'y
    a rien à traiter, et afficher une ligne d'aide à la place de `#profiles-list` masqué.
19. `js/ui/names.js:profileChip` — espacer la croix du prénom (≥ 8 px) et réduire son poids visuel.
20. `css/setup.css` `#preset-custom` — aligner l'état pressé sur celui des autres préréglages
    (bordure pleine), la bordure pointillée se lisant comme une zone de dépôt.
21. `css/modals.css` — supprimer `.modal-handle` de la modale de confidentialité (aucun geste
    associé, boîte centrée) ou implémenter le glissé vers le bas ; ajouter un dégradé de bas de
    zone défilante.
22. `css/base.css` — supprimer `#splash.hidden { opacity: 0 }`, règle morte.
23. `js/ui/names.js:nameRow`, `js/ui/settings.js:themeCard` — sortir les couleurs en propriétés
    personnalisées (`style="--chip:…"`) plutôt qu'en `color:`/`background:` littéraux (D5.3).
24. `css/setup.css` `#data-status` — ne réserver la hauteur que lorsqu'un message existe.
25. `tests/e2e/setup.spec.js:152` — remplacer l'assertion `aria-describedby` statique par une
    vérification de l'apparition/disparition de la description.
