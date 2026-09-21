# DECISIONS-G — Élément G (round 3, post-clôture) : retrait des `onclick` inline

Agent constructeur de l'élément G, ouvert sur demande explicite de
l'utilisateur après la clôture de l'audit AAA v2 (les six éléments A-F ont
chacun un verdict AAA, voir `docs/audit/BRIEF.md` §7). Périmètre exclusif :
`index.html`, `src/main.ts`, `vercel.json` (CSP uniquement, en toute fin de
tâche), nouveaux tests sous `tests/`/`e2e/`, `docs/audit/DECISIONS-G.md`,
`docs/audit/BRIEF.md` §7/§8 (ajout uniquement). Aucun autre fichier touché
(confirmé par `git diff --stat` en fin de tâche, voir §6).

## 0. Rappel du problème (P1 #4 du constat initial, non traité par D/F)

`index.html` contenait 65 attributs `onclick="..."` statiques. Aucun
`<script>` inline n'existe dans le fichier (seul `<script src="dist/app.js"
defer>`), donc les 65 `onclick` étaient la SEULE raison documentée
(`docs/audit/DECISIONS-F.md` §4, D7) de garder `'unsafe-inline'` dans
`script-src` de la CSP de `vercel.json`. Objectif de ce chantier : les
remplacer par un câblage `addEventListener` explicite dans `src/main.ts`,
puis retirer `'unsafe-inline'` de `script-src` (uniquement — `style-src` le
garde à cause du `<style>` inline d'`index.html`, hors périmètre).

## 1. Inventaire exhaustif des 65 `onclick` et leur traitement

Inventaire réalisé par `grep -n 'onclick=' index.html` avant toute
modification (65 correspondances, une par ligne — confirmé par
`grep -c`/`grep -o | wc -l`, les deux à 65). Chaque cas a été reproduit à
l'identique dans `src/main.ts`, jamais via un mécanisme générique de
dispatch par `data-action` (cohérent avec le précédent de l'élément B pour
`deleteProfile` dans `src/game.ts`, qui reste à la fois exposé dans
`handlers` et câblé par `addEventListener` ailleurs — voir §3).

### Cas 1 — appels simples (42 éléments)

`element.addEventListener('click', () => fn())`. Liste complète des ids
traités ainsi : `theme-gear-btn`, `lang-flag-btn`, `restore-btn-yes`,
`restore-btn-no`, `row-last-loser`, `row-single-winner` (id ajouté, voir
§2), `go-btn`, `theme-back-btn`, `btn-privacy-txt`, `privacy-back-btn`,
`lang-flag-btn-privacy`, `btn-cleardata`, `btn-privacy-accept`,
`btn-shuffle`, `btn-memorize`, `btn-clearfields`, `btn-clearnames`,
`names-go-btn`, `btn-back-names`, `bar-rotate-btn` (id ajouté),
`bar-recap-btn` (id ajouté), `bar-theme-btn` (id ajouté), `dice-fab`,
`dice-config-toggle`, `dice-roll-btn`, `dice-pick-back`, `dice-close-btn`,
`score-modal-confirm-btn`, `score-modal-cancel-btn`, `btn-seerecap`,
`btn-newgame`, `btn-returnmenu`, `btn-newgame-reset`, `btn-menu-reset`,
`btn-elim-confirm-txt`, `btn-cancel-elim`, `endgame-modal-confirm-btn`,
`endgame-btn-cancel`, `btn-pdf-dl`, `fin-anim-overlay`, `win-anim-overlay`,
`elim-anim-overlay`.

### Cas 2 — argument littéral capturé dans la closure (8 éléments)

`element.addEventListener('click', () => fn(valeur))`, valeur identique à
celle de l'ancien attribut, jamais un changement de signature de la
fonction appelée : `dice-faces-minus` (`diceFacesStep(-1)`),
`dice-faces-plus` (`diceFacesStep(1)`), `dice-count-minus`
(`diceCountStep(-1)`), `dice-count-plus` (`diceCountStep(1)`),
`dice-add-btn` (`dicePickPlayer('add')`), `dice-sub-btn`
(`dicePickPlayer('sub')`), `sign-minus` (`setSign(-1)`), `sign-plus`
(`setSign(1)`).

### Cas 3 — évènement réel transmis (3 éléments)

`saveAsDefault(event)`, `restoreSavedDefaults(event)`,
`clearSavedDefaults(event)` (`btn-savedefault`, `btn-restoredefault`,
`btn-cleardefault`). Ces trois fonctions (`src/game.ts`, non modifié) lisent
`event.currentTarget` via `_getFooterBtn` (`src/i18n.ts:154`) pour flasher
le libellé du bouton précisément cliqué. Le vrai évènement de clic est
transmis (`(e) => game.saveAsDefault(e)`), pas un évènement vide ni absent —
vérifié par mutation testing (§4, mutation 2 : sans l'évènement, le flash ne
s'affiche plus, silencieusement, car `_getFooterBtn(undefined)` renvoie
`null` et `_flashBtnLabel(null, …)` est un no-op).

### Cas 4 — appels composés, même ordre (3 éléments)

`clearPresetSelection();selectObjectif('win'|'elim'|'none')` sur
`obj-win`/`obj-elim`/`obj-none` : les deux appels sont exécutés dans le même
ordre dans le listener (`() => { game.clearPresetSelection();
game.selectObjectif('win'); }`, etc.).

### Cas 5 — condition sur la cible du clic (1 élément)

`dice-overlay` : `onclick="if(event.target===this)closeDice()"` (fermeture
en tapotant le fond flouté, jamais en tapotant la feuille elle-même)
reproduit par `(e) => { if (e.target === e.currentTarget) diceUi.closeDice();
}`.

### Cas 6 — manipulation DOM inline, sans appel de fonction (2 éléments)

`bar-reset-btn` (`document.getElementById('reset-modal').classList
.remove('hidden')`) et `btn-back-reset` (`...classList.add('hidden')`) :
aucune fonction dédiée n'existe pour ce chemin précis dans `game.ts` (qui
n'est pas dans mon périmètre) — le même toggle de classe est reproduit tel
quel dans `main.ts`, pas de nouvelle fonction créée ailleurs.

### Cas 7 — groupe d'éléments similaires par `data-*` (6 éléments)

Les 6 `points-chip` de `#objectif-presets` (`data-oval="0|10|20|50|100|150"`)
partageaient le même schéma d'appel composé que le cas 4. Câblés en une
boucle `document.querySelectorAll('#objectif-presets .points-chip[data-oval]')
.forEach(...)`, valeur lue depuis `chip.dataset.oval` — un seul point de
câblage explicite et lisible, pas un dispatcher générique par `data-action`.

**Total : 42 + 8 + 3 + 3 + 1 + 2 + 6 = 65.** Confirmé après coup :
`grep -c 'onclick=' index.html` → `0`.

## 2. `id` ajoutés à des éléments qui n'en avaient pas

5 éléments portaient un `onclick` mais aucun `id` unique permettant de les
cibler proprement en JS (décompte corrigé — round 1 du critique en avait
trouvé 5 pour un texte qui n'en annonçait que 4) : la ligne "Fin dès la
première victoire" de `#win-options` (id ajouté : `row-single-winner`,
symétrique de `row-last-loser` qui existait déjà) et les 4 boutons
`.bar-btn` sans id de la barre d'actions de l'écran de jeu
(`bar-rotate-btn`, `bar-recap-btn`, `bar-theme-btn`, `bar-reset-btn`). Les 6
chips
`data-oval` de `#objectif-presets` n'ont PAS reçu d'id individuel : elles
sont déjà distinguables sans ambiguïté par leur attribut `data-oval`
existant, câblées en groupe (cas 7) — ajouter 6 id supplémentaires n'aurait
rien apporté. Aucun changement de structure, de contenu texte, de classe
CSS ou d'attribut ARIA au-delà de ces ajouts d'`id` et du retrait des
`onclick` eux-mêmes.

## 3. `handlers`/`Object.assign(window, handlers)` conservés (compatibilité)

`src/main.ts` conservait avant ce chantier un objet `handlers` exposant
toutes les fonctions sur `window` (nécessaire à l'époque puisque c'était la
cible des attributs `onclick`). Ce mécanisme n'est plus nécessaire pour
`index.html` (plus aucun `onclick`), mais je l'ai **conservé tel quel**
plutôt que de le supprimer, pour deux raisons mesurées, pas supposées :

1. **Un test e2e existant en dépend, hors de mon périmètre d'édition.**
   `e2e/pdf-export-offline.spec.ts:103` (élément E) appelle
   `(window as unknown as {...}).showRecap()` directement, pas
   `window.ScoreTrack.game.showRecap()`. Constaté réellement en supprimant
   `Object.assign(window, handlers)` : ce test passait de vert à
   `TypeError: window.showRecap is not a function` (`npm run test:e2e`
   revérifié après restauration — voir §5, aucun autre test affecté).
   Le brief interdit explicitement de modifier un test existant en dehors
   d'un ajout ; la seule option compatible était de garder l'exposition.
2. **Aucune incidence sur la CSP.** `Object.assign(window, handlers)` est une
   simple affectation de propriétés JS exécutée par `dist/app.js`, un script
   externe déjà autorisé par `script-src 'self'` — ce n'est ni un attribut
   d'évènement inline (`onclick="..."`) ni un `<script>` inline, donc cela
   ne requiert à aucun moment `'unsafe-inline'`. Revérifié concrètement :
   `e2e/csp-script-src.spec.ts` (créé pour ce chantier, voir §4) tourne avec
   `handlers`/`Object.assign` toujours présents dans le bundle et **zéro**
   violation CSP sur script-src.

C'est exactement le même principe que `deleteProfile` (élément B) : exposé
dans `handlers` ET câblé par un `addEventListener` dédié ailleurs
(`renderProfileChips`, `src/game.ts:515`) — deux chemins d'accès à la même
fonction ne sont pas contradictoires, l'un pour la compatibilité historique
(tests/scripts externes), l'autre pour le câblage réel des éléments
statiques d'`index.html`.

## 4. `onclick` construits dynamiquement en JavaScript (hors périmètre)

Vérifié par `grep -rn '\.onclick\s*=' src/*.ts` (property assignment, pas un
attribut HTML) : 9 occurrences restantes (6+2+1 — décompte total corrigé,
l'addition d'origine était fausse), TOUTES hors de mon périmètre
d'édition (`src/game.ts` ×6, `src/dice-ui.ts` ×2, `src/sw.ts` ×1) —
`applyPreset`/carte de préréglage, chip de nom mémorisé, ligne "récap"
fermée, chip de joueur/points de départ à l'écran de démarrage, bouton
"type de dé" rapide du lanceur, bouton de rechargement de la bannière de
mise à jour. Aucune n'est un attribut `onclick="..."` dans du HTML : ce sont
des affectations `element.onclick = fn` faites par du JS déjà exécuté
(`dist/app.js`), donc **elles ne nécessitent à aucun moment
`'unsafe-inline'`** — un attribut d'évènement inline est interprété par le
parseur HTML au moment où l'attribut est rencontré dans le balisage,
jamais par une simple affectation de propriété DOM depuis un script déjà
autorisé. Confirmé concrètement : `e2e/csp-script-src.spec.ts` clique sur
`.preset-card` (chemin qui passe par `applyPreset`, câblé via
`c.onclick=...` dans `game.ts:296`) sans déclencher aucune violation CSP.
`deleteProfile` (seul `onclick` dynamique documenté par l'élément B comme
« traité ») avait déjà été migré vers `addEventListener` — confirmé qu'aucun
autre ne l'a été depuis, et que cela n'a plus d'incidence sur la CSP de
toute façon (voir ci-dessus) : aucune action requise ici, dette nulle.

## 5. Vérifications mécaniques

- `grep -c 'onclick=' index.html` → **`0`** (65/65 retirés).
- `npm run typecheck` → vert (0 erreur, les 3 programmes `tsc`).
- `npm run lint` → vert, **0 erreur** (565 avertissements `no-var`
  préexistants, tous dans des fichiers hors de mon périmètre — `npx eslint
  src/main.ts` seul : 0 avertissement, 0 erreur).
- `npm run test` (Vitest) → **87/87** verts, inchangé par rapport à l'état
  de clôture de l'audit v2.
- `npm run build` → vert (`dist/app.js` 1,6 Mo, `dist/sw.js` 1,8 Ko, taille
  inchangée par ce chantier — le câblage ajouté est de l'ordre de quelques
  Ko avant minification).
- `npm run test:e2e` (Playwright) → **27/27** verts : les 12 tests
  préexistants (`smoke`, `accessibility-basics` ×9, `fonts-self-hosted`,
  `pdf-export-offline`) **inchangés et toujours verts**, plus 14 nouveaux
  tests dans `e2e/onclick-wiring.spec.ts` et 1 nouveau test dans
  `e2e/csp-script-src.spec.ts`.

## 6. Fichiers touchés (confirmé par `git diff --stat`/`git status`)

`index.html` (retrait des 65 `onclick`, 4 `id` ajoutés), `src/main.ts`
(câblage complet), `vercel.json` (CSP, 1 ligne, §7), `e2e/onclick-wiring.
spec.ts` (nouveau), `e2e/csp-script-src.spec.ts` (nouveau),
`docs/audit/DECISIONS-G.md` (nouveau), `docs/audit/BRIEF.md` §7 (une
nouvelle entrée numérotée ajoutée, aucune décision existante modifiée).
Aucun autre fichier modifié — en particulier `src/game.ts`, `src/dice-ui.ts`,
`src/animations.ts`, `src/i18n*.ts`, `src/sw*.ts`, `src/recap-pdf.ts`,
`src/dice3d/*`, `build.mjs`, `.gitignore`, `README.md`, `package.json` et
les tests existants sont restés intacts (`git diff --stat` de ces fichiers :
vide).

## 7. Filet de sécurité e2e : `e2e/onclick-wiring.spec.ts` (14 tests)

Ce fichier ne re-teste pas la logique métier de `game.ts`/`dice-ui.ts`/
`animations.ts` (déjà couverte par les tests Vitest et les e2e existants) :
il prouve que chaque bouton/élément qui portait un `onclick` déclenche
encore, après le refactor, exactement le même comportement observable.
Regroupé par écran :

- **Démarrage** (3 tests) : chips objectif Victoire/Défaite/No limit +
  chips de points (cas 4/7), options de victoire mutuellement exclusives
  (`row-single-winner`/`row-last-loser`, avec la règle réelle de
  désactivation `pointer-events` déjà en place — round-trip complet sans
  jamais cliquer un élément rendu inerte), réglages par défaut
  enregistrer/restaurer/effacer avec le VRAI évènement de clic (cas 3).
- **Thème/langue/confidentialité** (3 tests) : ouverture/retour du thème,
  drapeau de langue (démarrage + confidentialité), « Supprimer toutes les
  données » (localStorage vidé, retour au démarrage).
- **Écran des noms** (1 test) : mélanger (déterministe via
  `Math.random` figé), mémoriser, vider les cases, tout effacer, retour.
- **Écran de jeu** (3 tests) : barre d'actions (rotation — vérifiée sur
  l'ordre RÉEL des `.pcard` dans le DOM rendu, pas une valeur théorique —,
  récap, thème), bouton Reset (cas 6, ouverture/retour/nouvelle
  partie/menu), modal de score (signes cas 2, confirmer/annuler — ciblé par
  `#sc-0`, l'id réel posé par `updateDisplay()`, pas par position DOM : pour
  2 joueurs le rendu place le joueur 1 avant le joueur 0, piège identifié
  et documenté en commentaire dans le test).
- **Fin de partie** (2 tests) : élimination (annuler restaure le score via
  `undoLast()`, confirmer élimine réellement le joueur), fin de partie
  vainqueur unique (annuler puis confirmer, puis les 3 boutons du modal
  vainqueur : voir récap, nouvelle partie, retour au menu).
- **Lanceur de dés** (1 test) : ouverture, cas 5 (fond flouté ferme, feuille
  ne ferme pas), config dépliée/repliée, pas de faces/nombre (cas 2), lancer
  réel (attend `#dice-post` visible, jusqu'à 10 s pour l'animation 3D),
  choix du joueur ajouter/retirer, retour, fermeture par bouton et par le
  fond.
- **Superpositions d'animation** (1 test) : clic sur `fin-anim-overlay`/
  `win-anim-overlay`/`elim-anim-overlay` interrompt réellement l'animation
  (`display` repasse à `none`). Note technique : `playWinAnim(i)` ne joue
  l'animation de victoire sur `win-anim-overlay` que si le joueur est
  `winRank===1` **et** que le mode est à vainqueur unique — sinon elle
  délègue silencieusement à `playFinAnim` (`src/animations.ts`, code non
  modifié) ; le test configure donc une vraie partie en mode victoire avec
  « vainqueur unique » avant d'appeler `playWinAnim`, pour exercer le bon
  overlay.

**Piège transverse rencontré et contourné sans toucher au code applicatif** :
plusieurs de mes premiers essais de test ont expiré (timeout) à cause d'une
bannière `#update-banner` (`src/sw.ts`, hors périmètre) qui apparaît à
**chaque** activation du service worker, pas seulement lors d'une vraie
mise à jour — elle interceptait des clics sans rapport avec elle sur des
scénarios un peu longs. Neutralisé côté test uniquement
(`navigator.serviceWorker.register` remplacé par une fonction qui rejette,
posé par `page.addInitScript` avant le chargement de la page) : aucune
incidence sur les 65 gestionnaires testés, aucun fichier applicatif touché.

## 8. Mutation testing (3 mutations, casser → constater l'échec → restaurer)

Pour chacune, `npm run build` a été relancé avant de rejouer le test ciblé,
puis le code a été restauré et `git diff` vérifié vide avant de continuer.

1. **Cas 1 (appel simple).** `main.ts` : `dice-close-btn` appelait
   `diceUi.openDice()` au lieu de `diceUi.closeDice()`. Test ciblé
   (`onclick-wiring.spec.ts`, groupe « lanceur de dés ») → **échec constaté**
   (`#dice-overlay` reste sans classe `hidden` après le clic sur Fermer).
   Restauré, `git diff` vide confirmé, test revert au vert.
2. **Cas 3 (évènement réel transmis).** `main.ts` : `btn-restoredefault`
   appelait `game.restoreSavedDefaults(undefined as unknown as Event)` au
   lieu de transmettre le vrai évènement. Test ciblé (groupe « réglages par
   défaut ») → **échec constaté** (`_getFooterBtn(undefined)` renvoie
   `null`, `_flashBtnLabel` est un no-op silencieux, le libellé du bouton ne
   flashe jamais « Restauré »). Restauré, revert au vert.
3. **Cas 4 (appel composé, argument littéral).** `main.ts` : `obj-elim`
   appelait `game.selectObjectif('win')` au lieu de `'elim'`. Test ciblé
   (groupe « chips objectif ») → **échec constaté** (`#obj-elim` ne reçoit
   jamais la classe `on`, `#obj-win` la reçoit à la place). Restauré, revert
   au vert.

Les 3 mutations couvrent 3 catégories distinctes de câblage (appel simple,
transmission d'évènement, argument littéral dans un appel composé), pas
trois variations du même cas.

## 9. Vérification visuelle (aucune régression, zéro changement voulu)

Captures Playwright/Chromium (420×860, 4 écrans : démarrage, noms, jeu,
lanceur de dés ouvert) avant/après ce chantier, sur le même commit de base
(`git stash`/`git stash pop` pour isoler EXACTEMENT les fichiers de cet
élément). Démarrage/noms/jeu : **identiques octet pour octet**
(`cmp -s`). Lanceur de dés : une différence de pixels a d'abord été
observée (bbox borné à la zone du canvas 3D du dé), tracée à la
non-déterminisme préexistant de l'aperçu du dé (`Math.random()` dans
`diceRenderPreview`/`diceAnimate3D`, `src/dice-ui.ts`, non modifié par ce
chantier — même principe que la « RNG figée » déjà utilisée par l'élément C
pour ses captures). Reproduit avec `Math.random` figé
(`page.addInitScript(() => { Math.random = () => 0.4242; })`) des deux
côtés : capture du lanceur de dés **identique octet pour octet** également.
Aucune régression visuelle réelle.

## 10. Focus clavier / rôles ARIA (élément D, non régressés)

Ce chantier touche les mêmes zones d'`index.html` que l'élément D
(round 1/2 : piège de focus, fermeture Échap, focus visible,
`initDialogA11y` dans `src/animations.ts`, non modifié). Revérifié
réellement, pas supposé : les 9 tests de `e2e/accessibility-basics.spec.ts`
(rôles ARIA des 7 boîtes de dialogue, aria-label des boutons icône-seule,
focus visible sur `#btn-privacy-accept`/`#go-btn`, piège de focus + Échap
sur `#score-modal` et `#dice-overlay`, contraste des chips) sont **tous
encore verts**, sans aucune modification de ce fichier de test. Le retrait
des attributs `onclick` n'a touché ni les rôles `role="dialog"`/
`"alertdialog"`, ni les `aria-label`, ni les classes CSS de focus — seuls
les attributs `onclick="..."` ont été retirés et 4 `id` ajoutés (§2), rien
d'autre dans le balisage.

## 11. Resserrement de la CSP (`vercel.json`)

Une fois tout ce qui précède vert et prouvé (jamais avant, pour ne pas
resserrer une CSP sur une base non vérifiée) :

```diff
- script-src 'self' 'unsafe-inline';
+ script-src 'self';
```

`style-src 'self' 'unsafe-inline'` **non touché** (hors périmètre, `<style>`
inline d'`index.html`). Vérifié réellement, pas seulement écrit :
`e2e/csp-script-src.spec.ts` (nouveau, committé — contrairement à la
vérification jetable de l'élément F en D7, celle-ci reste dans le dépôt
comme garde-fou permanent contre une régression future) sert `dist/` en
HTTP avec **exactement** les en-têtes lus dynamiquement depuis `vercel.json`
(jamais dupliqués en dur dans le test), pose un écouteur
`securitypolicyviolation` par `addInitScript` (actif dès le tout premier
script de la page) et parcourt : démarrage → thème → langue → préréglage →
noms → partie → modal de score → récapitulatif → **export PDF réel**
(jsPDF bundlé, téléchargement vérifié) → **lanceur de dés** (config, lancer,
choix du joueur, fermeture). Résultat : **0 violation CSP, 0 erreur JS**.

Mutation testing dédié : `'unsafe-inline'` réintroduit temporairement dans
`script-src` de `vercel.json` → le test lui-même échoue immédiatement (garde
explicite `expect(...).not.toContain('unsafe-inline')` en tête du test, une
CSP relâchée ne pourrait sinon jamais être « violée » et le test passerait
à tort) — restauré, `git diff vercel.json` revérifié : une seule ligne
changée, exactement celle voulue.

`onclick` dynamiques (§4) et `Object.assign(window, handlers)` (§3) :
confirmés sans incidence sur cette CSP resserrée, par construction (aucun
n'est un attribut d'évènement inline ni un `<script>` inline) et par mesure
(le parcours CSP ci-dessus clique un `.preset-card`, dont le gestionnaire
est un `onclick` dynamique, sans déclencher de violation).

## 12. Dette restante

Aucune dette nouvelle introduite par ce chantier. Dette déjà documentée et
non aggravée :

- **`style-src 'unsafe-inline'`** reste nécessaire tant que le `<style>`
  inline d'`index.html` existe (hors périmètre de ce chantier, qui ne
  portait que sur `script-src`/les `onclick`).
- **`handlers`/`Object.assign(window, handlers)`** dans `src/main.ts` :
  désormais un pur mécanisme de compatibilité (plus aucun `onclick` ne le
  consomme), conservé uniquement parce qu'un test existant hors de mon
  périmètre en dépend encore (§3). Une fois ce test e2e mis à jour pour
  utiliser `window.ScoreTrack.game.showRecap()` comme les autres (hors de
  mon périmètre d'édition, propriété de l'élément E/A), `handlers` et son
  `Object.assign` pourront être supprimés sans rien casser — je le signale
  ici plutôt que de le faire, conformément à la règle de périmètre stricte
  de ce chantier.
- **`CLAUDE.md`** (racine du dépôt, hors de mon périmètre d'édition
  autorisé) documente encore, à la ligne sur `src/main.ts`, que « les
  gestionnaires `onclick` du HTML doivent figurer dans la liste `handlers`
  de `main.ts` » — cette convention est maintenant obsolète (plus aucun
  `onclick` dans `index.html`) mais je n'ai pas le droit de modifier ce
  fichier dans ce chantier ; à mettre à jour par un futur tour ou par
  l'utilisateur directement.
