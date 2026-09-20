# CRITIQUE — Élément C — tour 2

18 septembre 2026. Aucune modification du dépôt. Preuves : `scratchpad/critic/C2/`
(sondes `p1`…`p8`, logs, ~60 captures). Base de comparaison : `critic/C-round1.md`.
Dépôt en mouvement : `js/ui/setup.js` et `js/platform/shortcuts.js` modifiés à 05:06, audit lancé à 05:07.

---

## 1. Les 25 corrections du tour 1, vérifiées une par une

| # tour 1 | Affirmation de C                                                                                                                                 | Ma vérification                                                                                                                                                                                                                                                                                                                                                                                                               | Verdict  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1        | Plancher 12 px                                                                                                                                   | `--fs-1: max(0.75rem, 12px)`. **Ma** mesure `getComputedStyle` sur 4 écrans × 6 états × 3 formats : **0 nœud < 12 px** (`p2.log`). Les 25 sélecteurs du tour 1 sont tous ≥ 12 px.                                                                                                                                                                                                                                             | **TENU** |
| 2        | Test du plancher à 12 px                                                                                                                         | `helpers.js:undersizedTexts(min=12)`, appelé avec `MIN_FONT_PX = 12` dans les 3 projets de format.                                                                                                                                                                                                                                                                                                                            | **TENU** |
| 3        | `.restore-title` ldm-day                                                                                                                         | axe : 0 violation sur ldm-day. Ma mesure indépendante : aucun échec.                                                                                                                                                                                                                                                                                                                                                          | **TENU** |
| 4        | `.points-chip.on` mono-light / ldm-day                                                                                                           | axe : 0 violation.                                                                                                                                                                                                                                                                                                                                                                                                            | **TENU** |
| 5        | axe 14 thèmes × 6 états, sans filtre                                                                                                             | **Mon** balayage indépendant : **84 audits, 0 violation** (tags wcag2a+2aa+21a+21aa+**best-practice**, aucun filtre de gravité, `meta-viewport` seul écarté au titre de D12). `landmark-one-main` a disparu.                                                                                                                                                                                                                  | **TENU** |
| 6        | Raccourcis D14                                                                                                                                   | `?action=resume` + sauvegarde → écran de jeu ; sans sauvegarde → accueil ; `?action=new` → accueil, bannière masquée, **sauvegarde conservée** ; URL nettoyée dans les 4 cas, y compris `?action=bidon` et `?ACTION=RESUME` (`p1.log`).                                                                                                                                                                                       | **TENU** |
| 7        | Débordement 320 px                                                                                                                               | 3 formats × 6 états, **tous** les éléments (pas seulement `button/input/p/h1/h2`) : **0 débordement, 0 défilement horizontal** (`p2.log`).                                                                                                                                                                                                                                                                                    | **TENU** |
| 8        | Fond de modale inerte                                                                                                                            | `#app-main.inert === true` ; `page.accessibility.snapshot()` modale ouverte ne contient ni « Exporter mes données » ni « Cyberpunk » ; inertie levée à la fermeture (`p4.log`, `ax-privacy-r2.json`).                                                                                                                                                                                                                         | **TENU** |
| 9        | Repère `<main>`                                                                                                                                  | `<main id="app-main">` (index.html:75) ; `landmark-one-main` absent des 84 audits.                                                                                                                                                                                                                                                                                                                                            | **TENU** |
| 10       | Focus après suppression                                                                                                                          | page = `setup-page`, focus = `#app-title`, `localStorage.length === 0`.                                                                                                                                                                                                                                                                                                                                                       | **TENU** |
| 11       | Double appui sur les actions destructrices                                                                                                       | Bannière « Effacer » → « Confirmer » puis suppression ; croix prénom → `aria-label` « Confirmer l'oubli du prénom Alice » puis suppression ; **désarmement automatique vérifié à 5,4 s** ; « Supprimer toutes les données » inchangé. Les **trois** sont en deux temps.                                                                                                                                                       | **TENU** |
| 12       | Textes sélectionnables                                                                                                                           | `getComputedStyle('.st-privacy-body').userSelect === 'text'`.                                                                                                                                                                                                                                                                                                                                                                 | **TENU** |
| 13       | Vrais groupes radio                                                                                                                              | `presets-grid`, `players-grid`, `start-presets`, `themes-grid` = `role="radiogroup"` + `role="radio"` + `aria-checked`, 1 arrêt Tab chacun ; `max-presets` reste `role="group"` de bascules `aria-pressed`, **6 arrêts Tab** (correct : ce sont des bascules, pas un choix exclusif). Atteignabilité aux flèches : **6/6, 12/12, 6/6, 14/14** thèmes avec bouclage correct (`p5.log`). Tabulations jusqu'au CTA : 9 → **14**. | **TENU** |
| 14       | CTA désactivé distinct                                                                                                                           | Style unifié ; aucun échec de contraste sur l'état « erreur » dans les 14 thèmes.                                                                                                                                                                                                                                                                                                                                             | **TENU** |
| 15       | `'Inter'` codé en dur                                                                                                                            | Plus de `font-family` littérale sur les écrans de C.                                                                                                                                                                                                                                                                                                                                                                          | **TENU** |
| 16–25    | Typographie française, libellés, états vides, croix espacée, « Personnalisé », poignée, code mort, couleurs JS, `#data-status`, assertion creuse | États vides : les 4 actions de la page Joueurs sont **`disabled`** quand il n'y a rien à traiter (`p4.log`). Pastille de siège : `style="--seat-color:…"`, le numéro est écrit en `--text` (la couleur ne porte plus le texte) et les deux pastilles sont mesurées d'office. Compteur `n/max` avec `aria-describedby`.                                                                                                        | **TENU** |

**Décisions du brief** — D10 : tenu. D11 : tenu et mieux qu'annoncé (§2). D14 : tenu. D16 : tenu, mais méthode perfectible (§4). D17 : tenu à deux réserves près (§5). D19 : appliqué par B, **mais sa clause de vérification n'est pas satisfaite** (§3).

---

## 2. Décalage cumulé de mise en page — mesuré par moi

`PerformanceObserver({type:'layout-shift', buffered:true})`, `hadRecentInput=false`, 5 chargements
par configuration, iPhone 13 (`p1.log`) :

- sans throttling : **0,0000 | 0,0000 | 0,0000 | 0,0000 | 0,0000**
- CPU ×4 : **0,0000 | 0,0000 | 0,0000 | 0,0000 | 0,0000**
- sources cumulées : **aucune**

C annonce 0,0171 (probablement Lighthouse, autre environnement) ; **je mesure zéro**, ce qui est
meilleur que l'annonce. Objectif D11 (≤ 0,1) tenu avec trois ordres de grandeur de marge. Les deux
causes du tour 1 ont bien disparu : les préréglages et les puces sont écrits dans `index.html`
(vérifié lignes 160-341) et la bannière est sortie du flux — voir §3, c'est là qu'est le prix.

## 3. **RÉGRESSION BLOQUANTE** : la bannière de reprise en `position: fixed`

`css/setup.css:433` — `position: fixed; bottom: 12px; z-index: 50`, hauteur **137 px**, soit
**16 % de l'écran à 390×844 et 24 % à 320×568**. Le contenu défile dessous.

**a) Obstruction au doigt** (`p6.log`, captures `ban-*.png`). Nombre de contrôles dont le **centre
géométrique est intercepté par la bannière** (`document.elementFromPoint`), par position de défilement :

| Format   | 0 %                                | 35 %                            | 70 %                                   | 100 % |
| -------- | ---------------------------------- | ------------------------------- | -------------------------------------- | ----- |
| 390×844  | 7 (dont `#points-custom`, 6 puces) | 1 (`#neg-toggle`)               | 3 (`#names-btn`, 2 `ghost-btn`)        | 0     |
| 320×568  | 6 puces joueurs                    | 7 (dont les 6 puces « départ ») | 2 (**`#go-btn` à 97 %**, `#names-btn`) | 0     |
| 768×1024 | 2 (`#max-custom`, `#neg-toggle`)   | 1 (**`#go-btn` à 100 %**)       | 2                                      | 0     |

**b) Focus clavier masqué — WCAG 2.2 SC 2.4.11 (AA)** (`p7.log`, captures `focus-masque-*.png`).
Tabulation complète à 320×568, bannière affichée : **8 arrêts de tabulation réels sont masqués à
64–100 %** par la bannière, dont 4 à 100 % (`player-chip`, `max-custom`, et les 6 `points-chip` à
64 %, `neg-toggle` à 73 %). L'utilisateur au clavier ne voit pas où il est. Rien dans le code ne
compense (`scroll-padding-bottom` absent).

Le correctif de CLS a donc échangé un défaut de performance contre un **échec AA mesuré**.
Aucun test de C ne peut le voir : le contrôle de débordement compare des `right` à `clientWidth`
et n'examine jamais le recouvrement ni l'ordre d'empilement, et axe n'implémente pas 2.4.11.
Le `padding-bottom: 196px` de `#setup-page` ne protège que le tout bas de page.

## 4. Texte système à 200 % — la clause de vérification de D19 n'est pas satisfaite

Jetons de B (`p1.log`) : `--fs-1: max(0.75rem, 12px)` … `--fs-8: 2.5rem`. À `Page.setFontSizes
standard=32` (= texte système 200 %), l'échelle suit bien : `#lbl-presets` 12 px → **24 px**,
`#go-btn` 15 → 30 px. D19 est donc appliqué côté jetons — ce n'est pas un défaut de C.

Mais D19 exige aussi « aucun texte n'est tronqué » et « aucune cible sous 44 px ». Mesure
(`p5.log`, captures `sys200-*.png`) :

- cibles < 44 px : **0** sur les 4 écrans ✔
- défilement horizontal : **non** ✔
- **débordements sur l'accueil : 2** — `#app-title` `right = 488` pour `clientWidth = 390`
  (le mot-symbole « ScoreTrack » sort de 98 px, rogné par `overflow-x: hidden`) et un
  `span.btn-text` `right = 412`. Les pages Joueurs, Réglages et la modale sont propres.

`--fs-7/--fs-8` sont des `rem` sans borne haute ; `.logo-name` n'a ni `clamp()` ni
`overflow-wrap`. Le jeton appartient à B, le cadrage du titre à C.

## 5. Ce que les tests de C ne prouvent toujours pas

Aucune assertion n'est conditionnée à une variable d'environnement (D17 respecté : `grep
process.env tests/` ne renvoie que des chemins de sortie). Il reste quatre faiblesses :

1. **`a11y.spec.js:172` `if (r.ratio === undefined) continue;`** — tout nœud qu'on ne sait pas
   mesurer est écarté en silence et n'est pas compté. Aucun plafond sur le nombre d'écartés.
2. **`expect(measured).toBeGreaterThan(100)`** — j'en mesure **308** sur le même périmètre. Une
   régression divisant la couverture par trois passerait le test.
3. **Contrôle de débordement restreint à `button, input, p, h1, h2`** — un `span` ou un `div`
   qui déborde n'est pas vu (c'est précisément un `span.btn-text` qui déborde à 200 %, §4).
4. **`a11y.spec.js` : `items.every(n => n.tabIndex === 0 || n.tabIndex === -1)`** — assertion
   tautologique (tout bouton géré a l'un ou l'autre) présentée comme « chaque puce reste
   atteignable ». De même, `setup.spec.js:286` compare `maxlength` au retour de `nameMaxLength`
   en appelant la fonction que l'interface appelle : cela prouve le câblage, pas la valeur.

Aucun test ne couvre : le recouvrement par la bannière fixe (§3), le texte système à 200 % (§4),
la perte de mémoire des prénoms (§6).

## 6. Ce que les corrections ont cassé ailleurs

**Perte silencieuse de données mémorisées** (`p5.log`, régression introduite par la limite issue
du cœur). `showNamesScreen` fait `currentMaxLen = nameMaxLength(n, innerWidth, innerHeight)` puis
`lastNamesFor(...).map(v => v.slice(0, currentMaxLen))`. Parcours reproduit :

```
2 joueurs  → saisie « Christophe-Alexan » (17 car.) → mémoire : ["Christophe-Alexan", ""]
12 joueurs → la case affiche « Christophe » (tronqué à 10, sans avertissement)
lancement  → mémoire réécrite : ["Christophe", "", … ]   ← les 7 caractères sont perdus
```

Le seul fait d'ouvrir la page Joueurs à un autre nombre de joueurs détruit définitivement le
prénom mémorisé. Contraire à D5 (« jamais de perte »). Corollaire : `maxlength` vaut **17 à 2
joueurs, 11 à 6, 10 à 12** sur 390×844 — les 18 caractères exigés par la grille D2.3 ne sont
**jamais** saisissables. Le critère n'est pas satisfait, il est rendu inatteignable.

Sinon, aucune casse : 0 erreur console et 0 `pageerror` sur tous mes parcours ; la suite complète
passe (`17 passed`).

## 7. Les deux limites signalées par C — avis tranché

**a) « Ma suite d'accessibilité dure cinq minutes et perturbe la mesure de fluidité de A une fois
sur deux. »** Mesuré : **377 s** au total, dont 2,8 min pour le balayage axe et 2,3 min pour le
contraste (`pw-run2.log`). Mon avis : **le coût est réel mais évitable, et la conclusion que C en
tire est la mauvaise.** Sur les 84 audits, une seule règle dépend du thème (`color-contrast`) ;
les 83 autres re-vérifient à l'identique des rôles, des noms et des repères qui ne changent pas
d'un thème à l'autre. Il faut exécuter le jeu complet de règles **une fois par état** et
restreindre les 13 thèmes suivants à `withRules(['color-contrast'])` — même pouvoir de détection,
coût divisé par cinq environ. Sur l'interférence : **une mesure de fluidité perturbée par un
processus voisin n'est pas une mesure**, et c'est le test de A qu'il faut isoler (projet dédié,
`workers: 1`, `fullyParallel: false`) et non la suite de C qu'il faut affaiblir. Refuser de
réduire la couverture pour protéger un chronomètre mal isolé.

**b) « Ma mesure sur pixels rendus reste approchée sur du texte très fin. »** **L'approximation
n'a pas lieu d'être, et son ampleur est sous-estimée.** J'ai réimplémenté la mesure autrement :
couleur de texte **déclarée** (`getComputedStyle(el).color` — c'est exactement ce que WCAG 1.4.3
évalue) contre fond **réellement rendu** (mode de l'histogramme des pixels de la boîte, pixels de
glyphe exclus). Résultat sur le même périmètre : **308 nœuds mesurés, 0 écarté, 0 échec**
(`p3.log`) — le verdict de C est confirmé, la méthode non. Comparaison des deux méthodes sur les
10 nœuds indéterminés de l'accueil en thème Cyberpunk :

```
#app-title    moi 11,64  C 11,08   #lbl-presets  moi 8,16  C 9,14  (+0,98)
.logo-sub     moi 10,93  C 11,28   #lbl-players  moi 8,87  C 9,20
#lbl-start    moi 8,86   C 9,26    #lbl-max      moi 8,87  C 9,26
#neg-label    moi 18,48  C 18,55   #neg-sub      moi 12,39 C 12,40
#setup-summary moi 18,48 C 18,55   #names-btn    moi 9,23  C 9,26
```

L'écart atteint **+0,98**, pas ±0,3, et il est **optimiste dans 7 cas sur 10** : c'est la
direction dangereuse, celle qui peut déclarer conforme un texte à 3,7:1. Le 1ᵉʳ/99ᵉ centile prend
les extrêmes de la boîte, donc le meilleur contraste possible et non le contraste réel. Un seul
changement suffit : remplacer le centile sombre par la couleur déclarée du texte. Le fond, lui,
doit bien rester échantillonné sur les pixels — c'est là que D16 a raison.

**Note hors périmètre C** : `css/game.css:401` conserve `clamp(11px, 3.5vmin, 22px)` — plancher à
11 px sur l'écran de jeu, contraire à D10. À signaler à A.

---

## 8. Verdict critère par critère

### D1 — Première prise en main (périmètre C)

| #                                                               | Verdict              | Preuve                                                                                 |
| --------------------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------- |
| 1.1 ≤ 2 taps à froid                                            | **OUI**              | 2 taps mesurés, `#sc-0 = 1` (`p8.log`)                                                 |
| 1.2 < 1 500 ms CPU ×4                                           | **OUI**              | CTA actif 339–568 ms, premier score modifiable **605–941 ms** (3 exécutions, `p8.log`) |
| 1.3 CTA actif par défaut                                        | **OUI**              | `#go-btn` actif, résumé prérempli                                                      |
| 1.4 affordance +/−                                              | **HORS PÉRIMÈTRE C** | écran de jeu (A) ; le tap fonctionne, `.tap-half.plus`                                 |
| 1.5 reprise 1 tap + aperçu                                      | **OUI, dégradé**     | reprise et aperçu corrects ; la bannière obstrue l'écran (§3)                          |
| D14 raccourcis                                                  | **OUI**              | 4 cas vérifiés, URL nettoyée (`p1.log`)                                                |
| → **4/4 dans le périmètre**, avec une réserve sérieuse sur 1.5. |

### D6 — Accessibilité (périmètre C)

| #                                  | Verdict | Preuve                                                                                                                                     |
| ---------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 6.1 contraste 14 thèmes            | **OUI** | 84 audits axe → 0 violation ; **308 nœuds indéterminés mesurés indépendamment → 0 échec**                                                  |
| 6.2 cibles ≥ 44 px                 | **OUI** | 3 formats × 6 états → 0 ; et 0 à 200 % de texte système                                                                                    |
| 6.3 clavier complet, focus visible | **NON** | atteignabilité 38/38 contrôles ✔, piège de focus ✔, Échap ✔ — mais **8 arrêts de tabulation masqués à 64–100 % : échec 2.4.11** (`p7.log`) |
| 6.4 sémantique, 0 violation        | **OUI** | 0 violation toutes gravités + bonnes pratiques ; `<main>` ; modale inerte ; radiogroups `aria-checked`                                     |
| 6.5 signes non chromatiques        | **OUI** | pastille : numéro en `--text`, couleur sur l'anneau seul ; erreur = ⚠ + texte ; pressé = coche + anneau                                    |
| → **4/5**.                         |

### Autres

D10 **OUI** · D11 **OUI** (0,0000 mesuré) · D14 **OUI** · D16 **OUI** (méthode à corriger) ·
D17 **OUI** avec 2 garde-fous résiduels · D19 appliqué par B, **clause de vérification non satisfaite**.

### Note globale de l'élément C : **4 / 5** — **AAA : NON**

Vingt-cinq corrections sur vingt-cinq sont réellement en place, vérifiées par des mesures
indépendantes et non par la parole de C. Trois choses l'empêchent d'être AAA.

---

## 9. Ce qui manque — liste numérotée

### Bloquant

1. **`css/setup.css:433` `.restore-banner`** — sortir du `position: fixed`. Remettre la bannière
   dans le flux (elle est déjà écrite dans `index.html`, donc sans coût de CLS : réserver sa boîte
   avec `visibility: hidden` plutôt que `display: none`, ou poser une hauteur minimale sur son
   conteneur). Si elle doit rester fixe : `html { scroll-padding-bottom: 150px }` **et** un
   décalage de défilement au focus. Attendu : à 320×568, 390×844 et 768×1024, sur 4 positions de
   défilement, **0 contrôle dont le centre est intercepté** et **0 arrêt de tabulation masqué**.
2. **`tests/e2e/a11y.spec.js`** — ajouter le contrôle qui aurait attrapé le point 1 : pour chaque
   arrêt de tabulation et chaque bouton visible, `document.elementFromPoint(centre)` doit
   appartenir à l'élément lui-même. À faire tourner sur les 3 formats, avec et sans bannière.
3. **`js/ui/names.js:showNamesScreen`** — ne plus écraser la mémoire des prénoms par une valeur
   tronquée. Conserver le prénom complet dans `scoretrack_last_names` et ne tronquer qu'à
   l'affichage sur la carte. Attendu : test « saisir 17 caractères à 2 joueurs, rouvrir à 12,
   relancer à 2 » → le prénom d'origine est intact.

### Majeur

4. **`css/setup.css` `.logo-name`** — borner le mot-symbole (`clamp()` ou `max-width: 100%` +
   `overflow-wrap`). Attendu : à texte système 200 %, `right ≤ clientWidth` sur `#app-title`.
5. **`css/setup.css` `.btn-text`** — même correctif sur le libellé de bouton qui déborde à 200 %.
6. **`tests/e2e/a11y.spec.js`** — ajouter un quatrième cas de format « texte système 200 % »
   (`Page.setFontSizes` ou `html{font-size:32px}`) avec les mêmes assertions que les trois autres,
   comme l'exige la clause de vérification de D19.
7. **`tests/e2e/helpers.js:renderedContrast`** — remplacer le centile sombre par
   `getComputedStyle(el).color` (le fond reste échantillonné). Attendu : l'écart avec un calcul
   par couleur déclarée tombe sous 0,05 ; supprime l'approximation au lieu de la documenter.
8. **`tests/e2e/a11y.spec.js:172-180`** — compter les nœuds écartés, les afficher, et échouer
   au-delà d'un seuil ; remplacer `measured > 100` par une valeur proche du réel (≥ 300).
9. **`tests/e2e/a11y.spec.js:auditScreen`** — jeu de règles complet une fois par état, puis
   `withRules(['color-contrast'])` pour les 13 thèmes suivants (couverture identique, ~5× plus
   rapide) ; et isoler le test de fluidité de A dans son propre projet `workers: 1` plutôt que
   d'alléger celui-ci.

### Mineur

10. **`tests/e2e/a11y.spec.js`** — étendre le contrôle de débordement à `*` plutôt qu'à
    `button, input, p, h1, h2`.
11. **`tests/e2e/a11y.spec.js`** — supprimer l'assertion tautologique sur `tabIndex` et la
    remplacer par un vrai parcours aux flèches comptant les éléments distincts atteints.
12. **`css/base.css`** — au focus, amener l'élément entièrement dans la vue : deux arrêts
    (`points-chip` pressé, `#go-btn`) restent au ras du bord bas, l'anneau y est rogné
    (`C2/kbd/t04`, `t14`) — défaut inchangé depuis le tour 1.
13. À signaler à A, hors périmètre C : `css/game.css:401` `clamp(11px, …)` viole D10.

---

## 10. Comparaison à l'aveugle — dernière application

Limites du protocole reproduites : ScoreTrack est mesuré en exécution réelle, les références sont
**décrites depuis des sources publiques sans exécution** ; tout critère non prouvé côté référence
reste INDÉTERMINÉ et n'est jamais converti en « NON » au bénéfice de ScoreTrack.

**D1 — App A = ScoreTrack, App B = Carbon.** A : 2 taps mesurés, premier score modifiable en
605–941 ms sous CPU ×4, CTA prérempli, reprise en 1 tap **avec aperçu daté**, raccourcis système
fonctionnels, décalage de mise en page nul. B : ouvre directement sur la table, sans écran
intermédiaire ; rien de public sur son aperçu de reprise ni ses temps. Contre A : l'écran de
configuration reste un préalable, et sa bannière de reprise recouvre désormais jusqu'à sept
contrôles. → **Préférence : indécis.** Ce que A ajoute (aperçu, raccourcis, reprise) compense
l'immédiateté de B ; l'obstruction de la bannière interdit de trancher en faveur de A.
**Confiance 3/5.**

**D6 — App A = ScoreTrack, App B = Mutility.** Au tour 1 je penchais pour B. **Je change d'avis :
je préfère A**, et je dis pourquoi. Ce n'est pas mon exigence qui a bougé, c'est la preuve. A
apporte désormais : 84 audits axe sans aucun filtre de gravité et sans violation sur 14 thèmes ×
6 états ; 308 mesures de contraste sur pixels rendus, vérifiées par une seconde méthode
indépendante ; 38 contrôles tous atteignables au clavier avec des groupes radio conformes au
motif APG ; un dialogue réellement isolé ; des cibles ≥ 44 px tenues jusqu'à 200 % de texte
système ; une échelle typographique en unités relatives. B ne documente que « formes ou texte en
plus de la couleur » et un mouvement réduit, sans une seule mesure : **4 critères sur 5 restent
INDÉTERMINÉS** de son côté. A conserve un échec AA prouvé (2.4.11, §3), localisé à un seul
composant et corrigeable en une règle CSS, contre trois échecs de contraste, un repère manquant,
un dialogue poreux et quarante et un contrôles injoignables au tour 1. → **Préférence :
ScoreTrack. Confiance 3/5** — plafonnée par l'asymétrie de preuve, pas par le résultat.
