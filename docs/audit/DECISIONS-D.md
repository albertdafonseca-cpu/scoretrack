# DECISIONS-D — Élément D : interface, accessibilité, i18n

Périmètre (BRIEF.md §5) : `index.html`, `src/i18n.ts`, `src/i18n/translations.ts`,
`src/icons.ts`, `src/animations.ts`, `src/splash.ts`, nouveaux fichiers de
tests sous `tests/` et `e2e/`, ce fichier. Rien d'autre n'a été touché :
`src/game.ts`, `src/dom.ts`, `src/globals.d.ts` (élément B), `src/dice3d/*`,
`src/dice-ui.ts` (élément C), `src/sw.ts`, `src/sw-worker.ts`,
`src/recap-pdf.ts` (élément E), `package.json`/`tsconfig*`/CI (élément A),
`build.mjs`/`vercel.json` (élément F) restent intégralement hors de mon
périmètre — même quand une correction aurait été plus simple en les touchant.

`git status`/`git log` vérifiés avant de commencer : `docs/audit/DECISIONS-B.md`
et `A-critique-round1.md` étaient déjà présents (non commités), `game.ts`,
`dom.ts`, `globals.d.ts`, `dice3d/*`, `dice-ui.ts` déjà modifiés par B/C — je
ne les ai pas ouverts en écriture, seulement lus pour comprendre les
interfaces (`window.ScoreTrack.*`) que j'utilise dans mes tests.

---

## 1. Handoff de l'élément E — les 2 actions P0 obligatoires (faites, vérifiées)

### 1.1 — Balise CDN jsPDF résiduelle (`index.html:1363`) — supprimée

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js" onerror="console.warn('jsPDF non chargé')"></script>
```
Ligne intégralement retirée (elle ne servait plus à rien depuis que
`src/recap-pdf.ts` importe `jspdf` en dépendance npm — élément E, D10/D11 du
journal `BRIEF.md`). Un `grep -n "cdnjs.cloudflare.com" index.html` après
correctif ne retourne plus rien.

**Preuve** : le test e2e de l'élément E, `e2e/pdf-export-offline.spec.ts`,
était rouge uniquement à cause de cette ligne (confirmé par E dans
`DECISIONS-E.md` §1, revérifié moi-même avant toute correction : échec
reproductible). Après suppression et `npm run build` :
```
✓ e2e/pdf-export-offline.spec.ts:68:1 › export PDF récapitulatif hors ligne,
  sans requête vers un CDN externe (1.2s)
```
Passe au vert, 0 requête vers `cdnjs.cloudflare.com` observée (espion
`page.on('request', ...)` du test lui-même), export PDF valide généré hors
ligne (`context.setOffline(true)`).

### 1.2 — `@import` Google Fonts remplacé par la feuille auto-hébergée de E

Dans `<style>` (`index.html`, ancienne ligne 20) :
```css
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=Share+Tech+Mono&family=Inter:wght@400;600;700;800&family=Press+Start+2P&family=Cinzel:wght@400;600;700&family=Bebas+Neue&family=Ballet&family=Permanent+Marker&family=Dancing+Script:wght@600;700&display=swap');
```
supprimé, remplacé dans `<head>` par :
```html
<link rel="stylesheet" href="./fonts/fonts.css">
```
(`fonts/fonts.css` + les 25 `.woff2` existent déjà à la racine du dépôt,
livrés par l'élément E — voir `DECISIONS-E.md` §2 — je n'ai rien créé ni
modifié dans `/fonts/`.)

**Vérification réseau réelle** (pas seulement lue dans le code) : nouveau
test `e2e/fonts-self-hosted.spec.ts` — sert `dist/` en HTTP local, espionne
toutes les requêtes réseau de la page, échoue si une seule contient
`fonts.googleapis.com` ou `fonts.gstatic.com`. Résultat :
```
✓ e2e/fonts-self-hosted.spec.ts › aucune requête externe vers Google Fonts
  au chargement de la page (1.2s)
```
0 requête externe observée ; `document.fonts` confirme `Inter` chargée
(`status: 'loaded'`) depuis le fichier local.

**Note de robustesse multi-agent** : au moment de ce commit, `build.mjs`
(élément F, hors de mon périmètre) ne copie pas encore `fonts/` vers
`dist/fonts/` (action documentée par E en `DECISIONS-E.md` §2.2, toujours à
faire par F). Pour que mon test ne dépende pas de ce commit tiers pas
encore fait, son petit serveur HTTP sert `dist/` en priorité et retombe sur
le répertoire `fonts/` du dépôt pour tout chemin `/fonts/*` absent de
`dist/` — il teste donc les vrais fichiers auto-hébergés de E, pas une
simulation, et restera valide sans changement une fois que F aura ajouté le
`cpSync`. **Rappel pour l'intégration finale** : sans ce `cpSync` dans
`build.mjs`, le `dist/` réellement déployé sur Vercel n'aura pas
`dist/fonts/`, donc `fonts/fonts.css` répondra 404 en production et
l'application retombera silencieusement sur les polices système (pas de
fuite de confidentialité — juste une régression visuelle). **Ce n'est pas
encore fait, ce n'est pas dans mon périmètre, mais c'est bloquant pour que
la politique de confidentialité §2 ci-dessous soit vraie en production.**

---

## 2. Politique de confidentialité — texte corrigé dans les 18 langues (`privacyIntro`)

Puisque les points 1.1/1.2 ci-dessus sont faits (jsPDF bundlé + polices
auto-hébergées **côté code** — sous réserve du `cpSync` de F en production,
voir note ci-dessus), j'ai appliqué la **Variante A** proposée par E dans
`DECISIONS-E.md` §4. Référence française (`privacyIntro`, clé `fr`) :

> « ScoreTrack ne collecte, ne suit ni ne transmet aucune donnée
> personnelle — et ne contacte aucun serveur tiers : polices de caractères
> et export PDF sont livrés avec l'application elle-même, y compris hors
> ligne dès la toute première ouverture. »

`privacyS2` reste inchangé dans toutes les langues (déjà exact selon E,
aucune modification nécessaire). Traduit fidèlement (sens, pas mot-à-mot)
dans les 17 autres langues de `src/i18n/translations.ts` : `en`, `es`, `de`,
`it`, `pt`, `nl`, `pl`, `ru`, `zh`, `ja`, `ko`, `ar`, `tr`, `sv`, `da`, `fi`,
`nb`.

**Langues à confiance réduite** (traduction correcte à ma connaissance mais
sans validation par un locuteur natif, signalées comme demandé) : **ar**
(arabe), **ja** (japonais), **ko** (coréen), **zh** (chinois simplifié) —
langues où les nuances de registre/formulation me sont les moins sûres.
Confiance modérée mais raisonnable pour **ru**, **tr**, **fi**, **nb**/`da`/`sv`
(scandinaves) — grammaticalement correctes à ma connaissance, formulation
peut-être perfectible. Confiance haute pour `en`, `es`, `de`, `it`, `pt`,
`nl`, `pl` (langues latines/germaniques proches du français de référence).

**Vérifié** : `npx vitest run tests/translations.test.ts` (posé par
l'élément A) — 4/4 tests verts, y compris « chaque langue traduit au moins
toutes les clés de la langue de référence » et « aucune traduction vide » :
aucune clé oubliée dans aucune des 18 langues après mes modifications.

---

## 3. Accessibilité (P1 #4 du constat initial)

Constat de départ : 1 seul attribut aria/role dans tout `index.html`, 65
`onclick` inline, textes jusqu'à 4/7/8/9px.

### 3.1 — Rôles ARIA sur les boîtes de dialogue principales

| Élément | Avant | Après |
|---|---|---|
| `#dice-overlay` (feuille du lanceur de dés) | rien | `role="dialog" aria-modal="true" aria-labelledby="dice-title"` |
| `#score-modal` | rien | `role="dialog" aria-modal="true" aria-labelledby="score-modal-player"` (le libellé pointe vers le nom + score du joueur, déjà mis à jour dynamiquement par `game.ts`) |
| `#winner-modal` | rien | `role="alertdialog" aria-modal="true" aria-live="assertive" aria-labelledby="winner-name"` |
| `#reset-modal` | rien | `role="alertdialog" aria-modal="true" aria-labelledby="reset-sub-txt"` |
| `#elim-modal` | rien | `role="alertdialog" aria-modal="true" aria-labelledby="elim-confirm-name" aria-describedby="elim-confirm-sub"` |
| `#endgame-modal` | rien | `role="alertdialog" aria-modal="true" aria-labelledby="endgame-modal-title" aria-describedby="endgame-modal-sub"` |
| `#recap` (récapitulatif plein écran) | rien | `role="dialog" aria-modal="true" aria-labelledby="recap-title-txt"` |
| `#fin-anim-overlay` / `#win-anim-overlay` / `#elim-anim-overlay` (animations de fin de partie) | rien | `role="alert" aria-live="assertive"` — ce sont exactement les « annonces de fin de partie » du mandat : victoire, élimination, classement final |

Tous les `aria-labelledby`/`aria-describedby` pointent vers des éléments
dont le texte est déjà mis à jour dynamiquement par `game.ts`/`animations.ts`
(hors de mon périmètre) : aucune duplication de traduction nécessaire, le
lecteur d'écran lit le texte visible existant.

### 3.2 — Libellés accessibles des boutons icône-seule (aucun mot lisible)

12 boutons ne portaient qu'un pictogramme ou un symbole (`←`, `✕`, `✅`,
`❌`, `−`, `+`, un drapeau emoji) sans aucun texte exploitable par un
lecteur d'écran. Ajout d'un `id` (pour ceux qui n'en avaient pas) + un
`aria-label`, **traduit dynamiquement avec le reste de l'interface** :
7 nouvelles clés i18n (`ariaBack`, `ariaClose`, `ariaLangPicker`,
`ariaDiceFacesPrev`, `ariaDiceFacesNext`, `ariaDiceCountMinus`,
`ariaDiceCountPlus`) ajoutées aux 18 langues de `translations.ts`, plus
réutilisation de `btnTheme`/`btnConfirm`/`btnCancel` déjà existants. Nouvelle
fonction exportée `_setAriaLabel(id, val)` dans `src/i18n.ts`, appelée
depuis `applyLang()` — donc rejouée à chaque changement de langue, pas
seulement au chargement.

Boutons concernés : `theme-gear-btn` (🎨), `lang-flag-btn` /
`lang-flag-btn-privacy` (drapeau), `theme-back-btn` / `privacy-back-btn`
(←), `dice-faces-minus` / `dice-faces-plus` / `dice-count-minus` /
`dice-count-plus` (−/+), `score-modal-confirm-btn` / `score-modal-cancel-btn`
(✅/❌), `recap-close-btn` (✕).

Icônes purement décoratives (répétant un texte déjà présent à côté) passées
en `aria-hidden="true"` sans toucher leur contenu (l'attribut survit aux
`textContent=` faits par `game.ts`/`animations.ts` hors de mon périmètre,
qui ne touchent que les enfants, pas les attributs du conteneur) : les 5
`.btn-icon` de la barre de jeu, `#winner-icon`, `#endgame-modal-icon`, le
💀 statique du modal d'élimination, `#win-anim-trophy-canvas`,
`#elim-anim-skull`.

### 3.3 — Focus clavier visible

Ajout d'une règle globale dans `index.html` :
```css
:focus-visible{outline:2.5px solid var(--accent,#66CCEE);outline-offset:2px;
  box-shadow:0 0 0 4px color-mix(in srgb,var(--accent,#66CCEE) 35%,transparent);}
```
S'applique à tous les éléments interactifs de l'application (aucun n'avait
de style de focus visible auparavant — le comportement par défaut du
navigateur était probablement supprimé ailleurs ou simplement invisible sur
fond sombre). `:focus-visible` (pas `:focus`) pour ne montrer l'anneau qu'à
la navigation clavier, pas au clic/tap tactile.

### 3.4 — Tailles de texte illisibles remontées

| Sélecteur | Avant | Après | Contexte vérifié sans hauteur fixe qui casserait |
|---|---|---|---|
| `.setup-label`, `.setup-divider-label` | 9px | 10px | titres de section, pas de conteneur à hauteur fixe |
| `.bar-btn` (libellés de la barre de jeu) | **7px** | 9px | `#bar.open #bar-buttons{max-height:80px}` — hauteur réelle mesurée après correctif (icône 18px + libellé + paddings) largement sous 80px, capture d'écran vérifiée |
| `.names-action-btn` | 8px | 10px | `flex:1`, pas de hauteur fixe |
| `.restore-btn` | 8px | 10px | pas de hauteur fixe |
| `#btn-savedefault/#btn-restoredefault/#btn-cleardefault .btn-label` | 9px | 10px | `min-height:2.6em` (relatif, s'adapte) |
| `.btn-clear-all` | 9px | 10px | pas de hauteur fixe |
| `.lang-flag-btn::after` (flèche ▾ décorative) | 9px | 10px | pseudo-élément, aucun impact de mise en page |
| `.objectif-chip` | 9px | 10px | pas de hauteur fixe |

**`#elim-anim-skull{font-size:4px}` volontairement NON modifié** : ce n'est
pas un texte statique lu au repos, c'est l'état de départ (quasi invisible)
d'une animation JS (`src/animations.ts`, ma propriété) qui fait grossir le
💀 jusqu'à occuper l'écran en quelques centaines de ms
(`skull.style.fontSize = ... + 'px'` recalculé à chaque frame). Le
« défaut » relevé au constat initial sur ce point n'est pas un problème de
lisibilité réelle — je le documente ici plutôt que de retoucher la courbe
de l'animation (risque inutile sur du code déjà validé visuellement).

**Vérifié visuellement** (Playwright + capture d'écran, `--use-gl` non
nécessaire ici car pas de rendu WebGL) : écran de configuration, écran des
joueurs, barre de jeu ouverte — aucun débordement, aucun texte tronqué,
aucun retour à la ligne cassant une mise en page après les hausses de
taille ci-dessus.

**Mutation testing** : `e2e/accessibility-basics.spec.ts` contient un test
qui échoue si une taille de texte visible repasse sous 9px. Vérifié
réellement : `.bar-btn` repassé à 7px → le test échoue en désignant
exactement `SPAN.btn-label "Undo"` comme coupable (`Expected: >= 9,
Received: 7`) ; remis à 9px → repasse au vert. Le même protocole a été
appliqué au test de rôle ARIA (rôle retiré de `#score-modal` → échec
désignant l'id fautif ; remis → vert) et au test de traduction dynamique
des `aria-label` (appel direct à `window.ScoreTrack.i18n.applyLang('en')`
puis `('fr')` : le libellé change bien de langue, preuve que ça vient du
câblage dynamique de `applyLang()` et pas d'un attribut figé).

### 3.5 — Distinctions par la couleur seule (D-CLAUDE-2 / D-PREF-1)

Audit systématique des classes d'état visuel (`.on`, `.active`, `.selected`)
dans `index.html` :

| Élément | Distinction déjà non-chromatique existante | Verdict |
|---|---|---|
| `.theme-card.selected` | `.theme-check` (coche) affichée en plus de la couleur | conforme, rien à faire |
| `.lang-opt.active` | `<span class="lang-opt-check">✓</span>` déjà injecté par `i18n.ts` (`renderLangDropdown`) | conforme, rien à faire |
| `.player-chip.on`, `.points-chip.on`, `.preset-card.on`, `.objectif-chip.on` | le contenu textuel/numérique reste identique et lisible (ce sont des chiffres/mots, pas des pastilles de couleur pure) ; chaque thème définit `--chip-on` nettement plus clair/saturé que `--chip-bg` (luminance réelle, pas un simple glissement de teinte isoluminant), et `--chip-on-text` est explicitement choisi noir ou blanc « selon luminosité » (commentaire du fichier lui-même, ligne ~32) | luminance déjà respectée par construction ; pas de retouche visuelle risquée sur un système de thèmes déjà validé |
| **`.sign-btn.active`** (Gain/Perte du modal de score) | **aucune avant correctif** — seule la couleur (vert/rouge) + un halo distinguaient le signe actuellement sélectionné entre deux boutons visibles simultanément | **corrigé** : `.sign-btn.active::after{content:' \2713'}` (coche) — cas isolé, à risque de mise en page minimal, capture d'écran vérifiée (`+ GAIN ✓` s'affiche proprement, pas de débordement) |

Je n'ai pas ajouté de coche aux grilles de puces nombreuses
(joueurs/points/objectifs) : le changement toucherait des dizaines
d'éléments dans un fichier déjà volumineux, pour un gain marginal vu que la
luminance y est déjà correctement différenciée par le système de thèmes
existant (validé visuellement, plusieurs thèmes vérifiés). Seul le bouton
Gain/Perte présentait un vrai déficit (deux états opposés visibles en
permanence, aucune coche, aucun signe distinctif au-delà du texte "－ Perte"
/"＋ Gain" qui ne change pas selon l'état actif).

---

## 4. Émojis système comme icônes (💀 🏆 🔒) — dette documentée, non traitée

`src/icons.ts` ne contient **aucune** icône SVG déjà prête pour cadenas,
trophée ou tête de mort (vérifié : le fichier ne génère que l'icône
d'application PNG/manifeste, rien d'autre). Une bonne partie des usages
concernés sont en dehors de mon périmètre d'édition :
- `src/game.ts` (élément B) : `winner-icon`, `.elim-icon`,
  `endgame-modal-icon` — assignés dynamiquement via `.textContent='🏆'`
  etc.
- `src/recap-pdf.ts` (élément E) : `'🏆 '+t('winner')`, `'💀 '+...`.

Seules 5 occurrences (🔒 ×2, 🏆/💀/🏁 ×3 statiques) sont dans `index.html`,
mon périmètre. Remplacer uniquement celles-là par des SVG créerait une
**incohérence** : au premier rendu de `winner-modal`/`endgame-modal`, un SVG
maison s'afficherait, puis `game.ts` l'écraserait avec l'emoji brut dès la
première mise à jour d'état — pire que la situation actuelle (un
utilisateur verrait l'icône changer de style en cours de partie). Une
correction cohérente nécessite de dessiner de vraies icônes SVG dans
`src/icons.ts` **et** de coordonner leur consommation dans `game.ts` (B) et
`recap-pdf.ts` (E), hors de mon mandat pour ce tour.

**Dette P2 documentée** : remplacer 💀/🏆/🔒/🏁/☠️ par des icônes SVG
maison cohérentes avec la charte du moteur de dés (contours, épaisseur de
trait, palette) nécessite un tour dédié coordonné B+D+E (ajout des SVG dans
`icons.ts`, consommation dans `game.ts`/`recap-pdf.ts`/`index.html`
simultanément).

---

## 5. Dette P2 déjà actée par le mandat — refonte des `onclick` inline

Comme demandé explicitement, **non traitée** : les 65 `onclick` inline
restent des attributs HTML appelant des fonctions exposées sur `window` par
`src/main.ts`. Les remplacer par `addEventListener` toucherait la surface
d'interface avec `main.ts`/`game.ts`, activement modifiés par l'élément B en
parallèle — risque de conflit de merge élevé pour un bénéfice qui n'est pas
au niveau P0/P1 une fois l'accessibilité sémantique (rôles/aria-label)
posée par-dessus. Uniquement l'accessibilité sémantique a été ajoutée
au-dessus du mécanisme `onclick` existant, sans y toucher.

---

## 6. Outillage de test

### 6.1 — Nouveaux tests e2e (Playwright, sous `e2e/`)

- **`e2e/fonts-self-hosted.spec.ts`** — voir §1.2. 1 test, vert.
- **`e2e/accessibility-basics.spec.ts`** — 5 tests, tous verts, tous
  mutation-testés manuellement (voir §3.4) :
  1. tout bouton/lien visible a un nom accessible (texte, `aria-label`, ou
     `aria-labelledby` résolu) ;
  2. les 12 boutons icône-seule du §3.2 portent un `aria-label` non vide ;
  3. ces `aria-label` suivent un changement de langue en direct
     (`window.ScoreTrack.i18n.applyLang`) — preuve que le câblage est
     dynamique, pas un attribut HTML figé en français ;
  4. aucun texte visible (écran de configuration + partie en cours, barre
     ouverte) ne descend sous 9px ;
  5. les 7 boîtes de dialogue principales du §3.1 portent un rôle ARIA
     `dialog`/`alertdialog`.

### 6.2 — `@axe-core/playwright` — recommandé, non ajouté (conflit de périmètre)

Le mandat suggère d'envisager `@axe-core/playwright` pour un contrôle de
contraste/accessibilité automatisé plus complet que mes vérifications
manuelles. **Je ne l'ai pas ajouté** : cela nécessite une nouvelle
`devDependency` dans `package.json`, qui est la propriété exclusive de
l'élément A (BRIEF.md §5 : « `package.json` (scripts/devDeps seulement) »).
**Recommandation pour coordination avec A** : ajouter
`@axe-core/playwright` (version stable actuelle : `4.13.0`) en
devDependency, puis un test e2e du type :
```ts
import AxeBuilder from '@axe-core/playwright';
const results = await new AxeBuilder({ page }).analyze();
expect(results.violations).toEqual([]);
```
sur les écrans principaux (configuration, partie, récap, modals). Je n'ai
pas voulu committer un `package.json` modifié qui ne m'appartient pas ni un
test qui échouerait faute de la dépendance installée.

### 6.3 — Vérification de non-régression sur `tests/translations.test.ts`

Aucun nouveau test vitest écrit dans `tests/` pour ce tour : le test
existant de l'élément A (`tests/translations.test.ts`) couvre déjà
exactement le risque de régression réaliste sur mon travail (clé manquante
dans une langue, traduction vide) — relancé après chaque changement de
`translations.ts`, toujours vert (4/4).

---

## 7. Défaut latent cross-cutting rencontré et corrigé (dans mon périmètre uniquement)

En creusant l'échec de `tsc -p tsconfig.test.json` déjà documenté par
l'élément B dans `DECISIONS-B.md` §4, j'ai appliqué le correctif suggéré
qui *était* dans mon périmètre : `src/i18n.ts:160`, `FlashBtn._flashTimer`
était typé `number | null` (au lieu de `ReturnType<typeof setTimeout>`),
ce qui provoquait `TS2322: Type 'Timeout' is not assignable to type
'number'` dès que `@types/node` est chargé (`tsconfig.test.json`). Corrigé :
```ts
interface FlashBtn extends HTMLElement {
  _flashTimer?: ReturnType<typeof setTimeout> | null;
  _flashOrig?: string | null;
}
```
**Vérifié réellement** : cette erreur précise a disparu de
`npx tsc --noEmit -p tsconfig.test.json` après le correctif (elle y était
avant, confirmé par une exécution avant/après).

**Reste, hors de mon périmètre, non corrigé** (racine identique, déjà
documentée en détail par B) : `tsc -p tsconfig.test.json` échoue encore sur
`src/i18n.ts:22` (`navigator.userLanguage` — TS2551) et sur une quarantaine
d'occurrences `window._xxx` dans `src/game.ts`/`src/animations.ts`
(TS2339). Root cause vérifiée par moi-même indépendamment de B : ce
programme TypeScript (`tests/**/*.ts` + `e2e/**/*.ts`) n'inclut jamais
directement `src/globals.d.ts` (augmentation ambiante de `Window`/
`Navigator`, propriété de l'élément B), qui n'est tiré que si un fichier du
programme le référence explicitement — un `import` de valeur (`import('../src/game')`)
ne suffit pas pour une augmentation globale. Confirmé par une expérience
isolée : `navigator.userLanguage` compile sans erreur dans **tous** les
autres programmes (`tsconfig.json` seul, `tsconfig.sw.json`, et une config
de test ad hoc incluant tout `src/**/*.ts` directement), et échoue
uniquement quand le programme n'inclut que `tests/**/*.ts`/`e2e/**/*.ts`
(sans `src/globals.d.ts` explicitement listé). Corriger ceci demande de
toucher soit `tsconfig.test.json` (élément A), soit `src/globals.d.ts`
(élément B) — aucun des deux dans mon périmètre. **Aucune nouvelle erreur
introduite par mon travail** : uniquement des erreurs déjà présentes et
déjà documentées par B avant mon intervention.

---

## 8. Vérifications exécutées (résultats réels)

| Commande | Résultat |
|---|---|
| `npx tsc --noEmit` (tsconfig.json, tout `src/`) | **Vert**, 0 erreur |
| `npx tsc --noEmit -p tsconfig.sw.json` | **Vert**, 0 erreur |
| `npx tsc --noEmit -p tsconfig.test.json` | Erreurs pré-existantes uniquement (voir §7 : `src/i18n.ts:22`, `src/game.ts`/`src/animations.ts` `window._xxx`) — **0 nouvelle erreur imputable à mon travail** ; l'erreur `src/i18n.ts:160` que j'ai corrigée a bien disparu |
| `npm run lint` | **0 erreur**, 566 avertissements pré-existants (`no-var`, essentiellement dans `dice3d/*` et `game.ts`, hors de mon périmètre) — exit code 0 |
| `npm run test` (Vitest) | **79/79 tests verts**, 8 fichiers, y compris `tests/translations.test.ts` (4/4) après mes modifications de `translations.ts` |
| `npm run build` | **Vert**, `dist/app.js` 1.6 Mo (inchangé par mon travail, jsPDF/three déjà inclus par B/E) |
| `npx playwright test` (les 8 specs de `e2e/`) | **8/8 verts** : `smoke`, `pdf-export-offline` (élément E, redevenu vert grâce à mon correctif §1.1), `fonts-self-hosted` (nouveau, §1.2), `accessibility-basics` ×5 (nouveau, §3) |

`npm run check` (= `typecheck && build`) n'a pas été relancé tel quel car
`typecheck` global inclut `tsconfig.test.json`, actuellement rouge pour une
raison décrite en §7 et déjà documentée par B avant mon tour — sans lien
avec mon travail, vérifié ligne par ligne.

---

## 9. Résumé de la dette restante (pour les tours suivants / l'intégration finale)

1. **Bloquant pour que la politique de confidentialité soit vraie en
   production** : `build.mjs` (élément F) doit copier `fonts/` vers
   `dist/fonts/` (`cpSync`, déjà spécifié par E en `DECISIONS-E.md` §2.2) —
   sans quoi `dist/fonts/fonts.css` répond 404 sur Vercel et l'app retombe
   sur les polices système (pas une fuite, mais une régression visuelle
   silencieuse à corriger avant mise en production).
2. **P2** — refonte des 65 `onclick` inline en `addEventListener`,
   volontairement non faite (risque de collision avec B en cours,
   confirmée par le mandat).
3. **P2** — émojis système (💀 🏆 🔒 🏁 ☠️) comme icônes : aucune icône SVG
   équivalente dans `icons.ts` ; remplacement cohérent nécessite un tour
   coordonné B (`game.ts`) + D (`icons.ts`/`index.html`) + E
   (`recap-pdf.ts`).
4. **P2** — `@axe-core/playwright` recommandé pour un contrôle de contraste
   automatisé plus complet ; nécessite une devDependency dans
   `package.json` (élément A) — coordination requise.
5. **Hors de mon périmètre, déjà documenté par B** —
   `tsc -p tsconfig.test.json` reste rouge pour la raison exposée en §7
   (`src/globals.d.ts` non inclus dans ce programme) ; deux correctifs
   indépendants possibles, ni l'un ni l'autre dans mon périmètre (voir
   `DECISIONS-B.md` §4 pour le détail).
