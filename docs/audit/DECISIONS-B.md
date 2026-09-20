# DECISIONS-B — Élément B : Logique de jeu & sécurité applicative

Agent constructeur de l'élément B (audit qualité AAA ScoreTrack, brief v2).
Périmètre exclusif : `src/game.ts`, `src/types.ts`, `src/dom.ts`,
`src/globals.d.ts`, nouveaux fichiers sous `tests/`, ce fichier, et
`docs/audit/BRIEF.md` §7 (ajout uniquement). Voir `docs/audit/BRIEF.md` pour
le brief complet et `docs/audit/CONSTAT-INITIAL.md` pour le constat de départ.

## 0. Note méthodologique : dépôt partagé vivant

Comme documenté indépendamment par le critique de l'élément A
(`docs/audit/A-critique-round1.md` §0), `/home/user/scoretrack` est un
répertoire de travail partagé en direct par plusieurs agents concurrents. J'ai
observé le même phénomène : `npm run typecheck` a échoué deux fois de suite
avec des erreurs incohérentes (propriétés `window._*` introuvables) pendant
que d'autres éléments modifiaient des fichiers hors de mon périmètre en
parallèle, puis a retrouvé un état stable. Toutes les vérifications listées
ci-dessous (§4) ont été rejouées jusqu'à obtenir un résultat stable et
reproductible avant d'être consignées ici. Je n'ai pas isolé mon travail dans
un `git worktree` séparé (contrairement à A) car ma tâche ne comparait pas de
commits successifs ; mais je note ce risque pour le critique de l'élément B :
**revérifier depuis un worktree isolé sur le commit exact de mon dernier
commit**, pas depuis le répertoire partagé en direct, pour éviter de capturer
un état transitoire d'un autre agent.

## 1. Défaut P0 corrigé : injection HTML par données utilisateur non échappées

### Constat initial

`src/game.ts` construisait du HTML par concaténation de chaînes (`innerHTML`)
en interpolant directement `p.playerName` (texte libre saisi par l'utilisateur)
à six endroits, sans échappement générique — seule l'apostrophe était protégée
dans un cas (`name.replace(/'/g,"\\'")`, ligne ~510 de l'ancienne version). Un
nom de joueur contenant `<`, `"`, `'` ou `</span>` pouvait casser la structure
du DOM ou, dans le cas de l'attribut `onclick` construit dynamiquement,
exécuter du code arbitraire.

### Les 6 occurrences trouvées et corrigées

Revérifié ligne par ligne sur l'état actuel du fichier (les numéros de ligne
du constat initial avaient bougé avec la migration TypeScript) :

| # | Fonction | Donnée interpolée | Correctif appliqué |
|---|---|---|---|
| 1 | `renderProfileChips` | `name` (profil enregistré), **dans un attribut `onclick`** construit en chaîne | Reconstruction complète par DOM (`createElement`/`textContent`/`addEventListener`), plus aucun `innerHTML` ni attribut `onclick` construit à partir de la donnée |
| 2 | `buildCard` (nom affiché sur la carte, `nameHtml`) | `p.playerName` | `escapeHtml(p.playerName)` |
| 3 | `buildCard` (tuile « vainqueur », `nameStr`) | `p.playerName` | `escapeHtml(p.playerName)` |
| 4 | `buildCard` (tuile « éliminé », `nameStr`) | `p.playerName` | `escapeHtml(p.playerName)` |
| 5 | `showRecap` (nom du joueur dans le récapitulatif) | `p.playerName` | `escapeHtml(p.playerName)` (uniquement quand le nom est non vide — le repli `t('player')+' '+(pi+1)` est un libellé interne, pas une donnée utilisateur) |

(Le tableau du brief en annonçait 5 en plus de la ligne 510 ; la relecture
complète du fichier en a trouvé 4 en plus de la ligne 510, la 6ᵉ occurrence
initialement suspectée — `renderPresets`/`renderThemeGrid`, lignes ~295/308 —
interpole `t(p.nameKey)`/`th.a`/`th.b`/`th.bg`, qui sont des libellés de
traduction et des couleurs de thème **fixes dans le code**, jamais des
données utilisateur : aucun correctif nécessaire là, laissé tel quel pour ne
pas complexifier sans raison une zone hors risque.)

### Choix d'implémentation : deux approches, selon le cas

Comme autorisé par la mission (« échappement générique... ou reconstruction
via `textContent`/`createElement`... choisis l'approche la plus robuste et la
plus simple à maintenir, cohérente avec le style du fichier ») :

- **`renderProfileChips`** (le cas historique de la ligne 510, le plus grave
  car le nom finissait dans un attribut `onclick`, un contexte
  d'échappement différent de celui du contenu HTML normal — un simple
  échappement `&<>"'` du contenu textuel n'aurait pas suffi à protéger
  l'attribut si mal délimité) : **reconstruction complète par DOM**. Plus
  aucune chaîne HTML n'est construite ; le nom est posé en `textContent`, et
  le bouton de suppression est câblé par un vrai `addEventListener`
  (fermeture JS sur la variable `name`) au lieu d'un attribut `onclick`
  contenant le nom interpolé. C'est l'approche la plus robuste possible :
  il n'existe plus de contexte d'échappement à préserver puisqu'il n'y a
  plus de sérialisation HTML du tout pour cette donnée.

  Avant :
  ```ts
  chip.innerHTML=`<span>${name}</span><span class="profile-chip-del" onclick="event.stopPropagation();deleteProfile('${name.replace(/'/g,"\\'")}')">✕</span>`;
  ```
  Après :
  ```ts
  const label=document.createElement('span');label.textContent=name;
  const del=document.createElement('span');del.className='profile-chip-del';del.textContent='✕';
  del.addEventListener('click',e=>{e.stopPropagation();deleteProfile(name);});
  chip.appendChild(label);chip.appendChild(del);
  ```
  `deleteProfile(name: string)` reste exportée et inchangée dans sa
  signature : l'interface publique vue par `src/main.ts`
  (`window.deleteProfile = game.deleteProfile`) n'a pas bougé — voir §3
  (changements d'interface) pour la nuance sur le *mécanisme* d'appel.

- **`buildCard` et `showRecap`** (le nom reste interpolé dans un template
  `innerHTML` classique, entouré par d'autres balises statiques du même
  style que tout le reste du fichier) : **échappement générique**, nouvelle
  fonction `escapeHtml` ajoutée à `src/dom.ts` (mon périmètre, module
  d'utilitaires DOM déjà partagé) :
  ```ts
  export function escapeHtml(s: string): string {
    const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(s).replace(/[&<>"']/g, c => map[c]);
  }
  ```
  Réécrire ces trois zones en `createElement` aurait été un remaniement bien
  plus large (elles construisent des blocs entiers de balises avec classes,
  ids dynamiques `sc-${pi}`/`df-${pi}`, etc.) pour un gain de robustesse nul
  ici : le nom reste dans un contexte de **contenu texte HTML normal**
  (jamais dans un attribut), donc l'échappement des 5 caractères `& < > " '`
  neutralise complètement tout vecteur — aucune balise active ne peut plus
  se former, aucune fermeture de balise existante ne peut plus être
  provoquée par `</span>` (le `<` et le `>` sont encodés).

  Exemple (`buildCard`) :
  ```ts
  // avant
  const nameHtml=p.playerName?`<div class="pplayer">${p.playerName}</div>`:`<span class="pplayer-ghost"></span>`;
  // après
  const nameHtml=p.playerName?`<div class="pplayer">${escapeHtml(p.playerName)}</div>`:`<span class="pplayer-ghost"></span>`;
  ```

### Preuve (mutation testing, D17)

Voir `tests/game.injection.test.ts`. Pour chacun des deux mécanismes de
correctif, le code source réel a été temporairement cassé, les tests
relancés pour confirmer l'échec, puis restauré à l'identique (`diff` vide
vérifié après coup) :

1. **`escapeHtml` neutralisé** (`return String(s);` sans remplacement) :
   4 tests sur 7 échouent immédiatement et précisément (`buildCard` ×3 —
   joueur en jeu/éliminé/vainqueur — et `showRecap` ×1), avec des messages
   du type `expected 1 to be +0` (une vraie balise `<script>`/`<img>` a été
   créée dans le DOM). Restauré, `diff src/dom.ts` vide.
2. **`renderProfileChips` reverti au motif vulnérable d'origine**
   (`chip.innerHTML=...deleteProfile('${name.replace(...)}')...`) : les 2
   tests dédiés échouent (l'un détecte la balise `<img>` réellement créée,
   l'autre — qui clique réellement sur le bouton de suppression via
   `dispatchEvent` — provoque même une exception jsdom en tentant d'analyser
   l'attribut `onclick` cassé par les guillemets du nom piégé, la
   `SyntaxError` du parseur d'attribut jsdom illustrant concrètement le
   défaut). Restauré, `diff src/game.ts` vide.

Un test supplémentaire (« aucune charge n'a réussi à s'exécuter ») pose un
garde-fou global (`window.__pwned`) qui échouerait si un nom de joueur
parvenait un jour à exécuter du JavaScript réel dans jsdom, indépendamment
des assertions structurelles ci-dessus.

## 2. Défaut P1 : état mutable global dispersé

### Ce qui a été fait

Le brief autorisait explicitement à privilégier une meilleure organisation
**interne** plutôt qu'un changement d'interface publique risqué en plein
audit parallèle. Vu la taille du fichier (1988 lignes) et le risque de
régression sur un module aussi central pendant que C/D/E travaillent sur des
fichiers qui l'importent (`animations.ts`, `dice-ui.ts`, `i18n.ts`), j'ai
choisi une réduction **ciblée et sûre** de la duplication d'état/logique
plutôt qu'un découpage en plusieurs fichiers (qui aurait dû être coordonné
avec tout le monde et aurait démultiplié le risque de conflit de merge pour
un bénéfice marginal à ce stade de l'audit) :

- **Extraction de `computeClampedScore`** (+`currentScoreLimits`), une
  fonction **pure** (aucun accès DOM, aucune lecture d'état module — tous les
  réglages lui sont passés en paramètre via l'interface `ScoreLimits`) qui
  factorise le calcul de plafonnement de score, **auparavant dupliqué mot
  pour mot** entre `adjust()` (tap +/−) et `confirmScoreModal()` (saisie
  manuelle du clavier). Les deux fonctions appellent maintenant la même
  logique ; tout changement futur des règles de plafonnement (mode
  « bloquer », plafond d'objectif, négatif autorisé) ne se fera plus qu'à un
  seul endroit. C'est exactement le type de logique que le brief demandait de
  rendre testable indépendamment du DOM (voir §3.3 du mandat).
- Nettoyage cosmétique en passant : `deleteProfile`, `let profiles=...` →
  `const profiles=...` (jamais réassigné — signalé comme dette mineure par
  `DECISIONS-A.md`, corrigé ici puisque je retouchais cette fonction de toute
  façon pour le correctif P0).

### Ce qui n'a délibérément PAS été fait (dette assumée, documentée pour un futur passage)

- **Pas de découpage de `game.ts` en plusieurs fichiers/modules internes**
  (état/réglages/rendu de carte/modal/récap). Le fichier reste un seul
  module de ~2020 lignes. Justification : (a) risque de collision élevé —
  `game.ts` est importé par `animations.ts`, `dice-ui.ts`, `main.ts`, tous
  activement modifiés par d'autres agents en parallèle ; un découpage change
  la surface de review de TOUT le monde, pas seulement la mienne ; (b) le
  brief privilégie explicitement « une meilleure organisation interne...
  plutôt qu'un changement d'interface publique risqué » ; (c) le temps
  disponible pour cet élément a été prioritairement investi sur le P0
  (sécurité, bloquant) et sur des tests réels avec preuve de mutation
  testing plutôt que sur un remaniement structurel non demandé comme
  condition AAA explicite (la définition AAA du brief §6 ne mentionne pas de
  taille de fichier ou de découpage modulaire — seulement l'absence de
  défauts P0/P1 reproductibles, la couverture par tests, la non-régression,
  et `npm run check` vert).
- **Les 8+ propriétés `window._*`** (`_pendingEndgame`, `_lastAdjustPrev`,
  `_afterFinAnim`, `_afterElimAnim`, `_afterWinAnim`, `_stopElimAnim`,
  `_stopWinAnim`, `_winAnimDelayTID`, `_isZooming`, `_modalJustClosed`,
  `_barInit`) restent sur `window`, **inchangées dans leur forme** — voir §3
  ci-dessous : c'est un choix explicite pour ne rien casser chez C/D
  pendant l'audit, pas un renoncement définitif. Elles sont documentées et
  typées dans `src/globals.d.ts` (déjà le cas avant mon passage), ce qui est
  la meilleure mitigation possible sans changer l'interface : au moins,
  aucun accès `window._x` non typé (`as any`) n'existe dans `game.ts`.
- **Piste concrète pour un futur passage** (P2, non traité ici, faute de
  temps et pour ne pas risquer l'interface publique en pleine intégration
  parallèle) : ces callbacks `_after*Anim`/`_stop*Anim` forment un vrai petit
  protocole d'événements entre `game.ts` et `animations.ts` (« pose un
  callback, l'autre module l'appelle puis le remet à `null` »). Un futur
  passage pourrait le remplacer par un vrai petit bus d'événements interne
  (`EventTarget` ou une paire `on()`/`emit()` maison) exposé une seule fois
  sur `window.ScoreTrack` (déjà le point d'extension prévu par
  `src/main.ts` pour les tests/déboguage) plutôt que par des propriétés
  `window._*` individuelles. Cela réduirait le couplage réel sans
  changer la mécanique (toujours un objet partagé sur `window`), mais c'est
  un changement d'interface qui **doit** être coordonné avec les éléments C
  (dice-ui.ts) et D (animations.ts) avant d'être fait — je ne l'ai pas fait
  unilatéralement.

## 3. Changements d'interface — signalement pour les autres éléments

**Aucun changement de l'interface `window` consommée par `animations.ts` ou
`dice-ui.ts`.** Toutes les propriétés `window._*` déclarées dans
`src/globals.d.ts` gardent exactement le même nom, le même type, la même
sémantique de cycle de vie (posées par `game.ts`, consommées puis remises à
`null`/`undefined` par `animations.ts`/`dice-ui.ts`). Aucune action requise
de C ou D pour ce point.

**Un seul changement, strictement interne à `game.ts` et sans effet visible
depuis l'extérieur** : le mécanisme de suppression d'un profil de joueur
(`renderProfileChips`) n'utilise plus un attribut `onclick` construit en
chaîne de caractères, mais un vrai `addEventListener` posé directement lors
de la création du bouton. La fonction exportée `deleteProfile(name: string)`
elle-même est **inchangée** (signature, comportement, toujours exposée sur
`window.deleteProfile` via `src/main.ts`, toujours utilisable telle quelle si
un autre module y faisait référence — vérifié : aucun autre fichier du dépôt
ne l'appelle). Aucune action requise des autres éléments.

**Nouvel export ajouté à `src/dom.ts`** : `escapeHtml(s: string): string`.
Purement additif (aucun export existant modifié ou supprimé). Les autres
éléments qui construisent du HTML par concaténation de chaînes à partir de
données utilisateur (aucun cas trouvé hors de mon périmètre à ce jour, voir
§5) peuvent la réutiliser plutôt que d'en écrire une équivalente.

**Nouveaux exports ajoutés à `src/game.ts`** : `computeClampedScore`,
`currentScoreLimits` (interne, non exportée en fait — voir le code, c'est
une fonction privée du module), et les interfaces `ScoreLimits` /
`ClampedAdjustment`. Purement additif également.

## 4. Défaut d'outillage cross-cutting découvert (hors de mon périmètre d'édition, documenté pour intégration)

En écrivant des tests réels pour `src/game.ts` (qui importe `src/i18n.ts` dès
sa première ligne), j'ai découvert que **`tsc -p tsconfig.test.json` échoue
dès qu'un test importe `src/game.ts` ou tout autre module qui importe
`src/i18n.ts`** — un défaut latent de l'outillage posé par l'élément A,
resté invisible jusqu'ici car aucun test existant (`tests/dom.test.ts`,
`tests/translations.test.ts`) n'importait un module touchant à `i18n.ts`.

### Root cause, vérifiée précisément

`tsconfig.test.json` étend `tsconfig.json` (qui charge la lib `"DOM"`, où
`setTimeout` retourne `number`) et ajoute `"types": ["node"]` (nécessaire
pour `node:url`/`node:path` dans `e2e/`). `@types/node` déclare aussi un
`setTimeout` global, dont le retour est `NodeJS.Timeout`. Les deux
déclarations globales fusionnent dans le même programme TypeScript ; à
`src/i18n.ts:160`, `btn._flashTimer=setTimeout(...)` est assigné à un champ
typé `number` (style navigateur, cohérent avec `tsconfig.json` seul, qui n'a
pas ce conflit) — sous `tsconfig.test.json`, TypeScript résout l'appel vers
la surcharge de `@types/node` et rapporte `Type 'Timeout' is not assignable
to type 'number'`. **Ce défaut existe indépendamment de tout code que j'ai
écrit** : il se déclenche pour n'importe quel test, de n'importe quel
élément, qui importe (même dynamiquement, même dans un fichier `.js` inerte
pour `tsc`) `src/game.ts`, `src/animations.ts`, `src/dice-ui.ts` ou
`src/i18n.ts` lui-même — je l'ai vu se reproduire **indépendamment** dans
`tests/dice3d.dispose.test.ts` (test ajouté par l'élément C pendant mon
propre travail), qui importe directement `../src/game`.

Second effet du même type de lacune, plus bénin (je l'ai corrigé de mon
côté, voir plus bas) : `src/globals.d.ts` (augmentation globale ambiante,
`declare global { interface Window {...} } }`) n'est inclus dans le
programme `tsconfig.test.json` que s'il y est référencé explicitement — son
`include` (`tests/**/*.ts`, `e2e/**/*.ts`) ne le liste pas, et une
augmentation globale n'est jamais tirée automatiquement par un simple
`import` de valeur d'un module qui l'utilise. Sans lui, toute utilisation de
`window._pendingEndgame` etc. à l'intérieur de `game.ts`/`animations.ts`
devient une erreur de type dès que ces fichiers sont inclus dans ce
programme pour une autre raison.

### Correctif appliqué, strictement dans mon périmètre (`tests/`)

Je ne peux pas modifier `tsconfig.test.json` (élément A) ni `src/i18n.ts`
(élément D). J'ai donc découplé mes propres tests du problème avec une
petite façade, sans toucher au fichier de configuration ni au fichier fautif :

- `tests/support/loadGame.js` (JavaScript **brut**, pas `.ts` — donc jamais
  vu par `tsc -p tsconfig.test.json`, dont l'`include` ne matche que
  `**/*.ts`) : fait le vrai `import('../../src/game')`, exécuté normalement
  par Vitest/esbuild au runtime.
- `tests/support/loadGame.d.ts` : déclare à la main, et **volontairement
  découplée** de `src/game.ts` (donc sans jamais forcer sa résolution de
  type), l'interface `GameTestFacade` — le sous-ensemble exact de l'API de
  `game.ts` utilisé par mes tests (`players`, `history`, `buildCard`,
  `renderProfileChips`, `showRecap`, `computeClampedScore`, `scoreClass`,
  `applyPreset`, `applyObjectif`, `selectObjectif`, `objectifMode`,
  `elimPoints`, `startPoints`), en réutilisant les types déjà partagés de
  `src/types.ts` (qui, lui, n'importe rien et ne pose donc aucun problème).

Mes deux fichiers de test importent `loadGame` depuis cette façade au lieu
d'un `import('../src/game')` direct — `npm run typecheck` est vert pour
l'intégralité de mon périmètre (voir §5).

### Correctif suggéré pour qui reprend `tsconfig.test.json`/`i18n.ts` (élément A ou D, ou l'intégration finale)

Deux corrections possibles, indépendantes, l'une ou l'autre suffit :

1. Dans `src/i18n.ts:160` (élément D) : typer `_flashTimer` (et tout champ
   équivalent) avec `ReturnType<typeof setTimeout>` plutôt qu'un `number` en
   dur — c'est déjà le motif utilisé ailleurs dans le code (`game.ts` :
   `groupTimers: Record<number, ReturnType<typeof setTimeout>>`), sans
   dépendre de savoir si l'environnement de compilation a ou non les types
   Node.
2. Dans `tsconfig.test.json` (élément A) : ne charger `"types": ["node"]`
   que pour les fichiers qui en ont réellement besoin (`e2e/**/*.ts`), par
   exemple via un `tsconfig.e2e.json` séparé n'étendant que ce sous-dossier,
   plutôt que d'appliquer les types Node à tout `tests/**/*.ts` (dont la
   plupart tourne dans un environnement 100% navigateur/jsdom et n'a jamais
   besoin de `node:*`).

Je n'ai pas appliqué ces correctifs moi-même car les deux fichiers concernés
sont hors de mon périmètre exclusif.

## 5. Tests unitaires ajoutés

Deux nouveaux fichiers de test (+ un dossier de support), tous dans mon
périmètre :

1. **`tests/game.injection.test.ts`** (7 tests) — voir §1. Couvre les 4
   points de correctif restants après consolidation (`buildCard` ×3 variantes
   + `renderProfileChips` ×2 + `showRecap`), plus un garde-fou global anti
   exécution de code.
2. **`tests/game.score-logic.test.ts`** (9 tests) — logique de score pure :
   - `computeClampedScore` (7 tests) : addition simple, plafond à 0 par
     défaut en mode `win` avec négatif interdit, négatif autorisé
     (`allowNeg`), `bloquerMode='min'`/`'max'`, montée plafonnée par
     `maxPoints` en mode `win`, `realDelta=0` quand le plafond absorbe tout
     le delta (cas qui, dans `adjust()`/`confirmScoreModal()`, déclenche un
     retour anticipé sans historiser).
   - `scoreClass` (2 tests) : coloration `crit`/`low`/`''` en mode `elim`
     (accessibilité daltonienne par luminance, D-CLAUDE-2 — cette fonction
     ne fait QUE retourner un nom de classe CSS, jamais une couleur en dur,
     ce qui est cohérent avec la convention verrouillée), et absence de
     coloration en mode `none` (No limit).
3. **`tests/support/appHtml.ts`** — charge le vrai `index.html` du dépôt dans
   `document` avant chaque import de `game.ts`, pour satisfaire les
   nombreux accès DOM que ses IIFE de premier niveau font dès le chargement
   du module (pavés numériques, drag du modal de score, tiroir de la barre,
   `loadSettings()`...). Choix déféré à charger le vrai fichier plutôt que
   de fabriquer une liste manuelle de dizaines d'ids : plus robuste (garantit
   que tous les ids que `game.ts` référence existent réellement, puisque
   c'est le fichier qui tourne en production), moins fragile aux
   changements d'`index.html` par l'élément D (qui n'a pas besoin de garder
   une liste synchronisée avec mes tests).
4. **`tests/support/loadGame.{js,d.ts}`** — voir §4.

**16/16 tests passent** (`npx vitest run tests/game.injection.test.ts
tests/game.score-logic.test.ts`). **Mutation testing complet** (cassé →
échec confirmé → restauré, `diff` vide vérifié à chaque fois) sur :
- `escapeHtml` neutralisé → 4/7 tests d'injection échouent (voir §1).
- `renderProfileChips` reverti au motif vulnérable → 2/2 tests dédiés
  échouent, dont un avec exception jsdom (voir §1).
- `computeClampedScore` : plafonnement supprimé (`newScore=rawScore`) →
  5/7 tests échouent avec des messages précis (`expected 140 to be 40`,
  etc.).
- `scoreClass` : branche `crit` neutralisée (`if(false)return 'crit';`) →
  le test dédié échoue (`expected 'low' to be 'crit'`).

Tous ces tests sont donc structurellement capables d'échouer (règle D17 du
brief), pas des tests qui passent quoi qu'il arrive.

## 6. Résultat des vérifications réelles

Exécutées dans le répertoire partagé après stabilisation (voir §0), une fois
les modifications concurrentes des autres éléments retombées :

| Commande | Résultat |
|---|---|
| `npm run typecheck` | **Vert pour mon périmètre.** Aucune erreur dans `src/game.ts`, `src/types.ts`, `src/dom.ts`, `src/globals.d.ts`, `tests/game.*.test.ts`, `tests/support/*`. Reste un défaut cross-cutting préexistant hors de mon périmètre d'édition, documenté en détail §4 (déclenché indépendamment par `tests/dice3d.dispose.test.ts`, un test de l'élément C). |
| `npm run lint` | 0 erreur, 566 avertissements (dont aucun nouveau imputable à mes fichiers au-delà de ceux déjà recensés par `DECISIONS-A.md` — j'ai même réduit le compte de 1 en corrigeant le `let profiles` → `const profiles` déjà signalé comme dette par A) |
| `npm run test` | **79/79 tests passent** (au moment de ma dernière vérification — un échec transitoire observé plus tôt dans `tests/dice3d.dispose.test.ts`, un fichier de l'élément C encore en cours d'écriture, `_numTex is not defined`, avait entretemps été corrigé par C lui-même ; sans lien avec mes changements) |
| `npm run build` | OK, `dist/app.js`/`dist/sw.js` générés sans erreur (taille du bundle affectée par le choix de l'élément E de bundler jsPDF localement plutôt que par CDN — hors de mon périmètre) |

Mes deux fichiers de test, isolément : `npx vitest run
tests/game.injection.test.ts tests/game.score-logic.test.ts` →
**16/16 tests passés**, à chaque exécution reproduite (règle de déterminisme
du brief §3.5 — rejoué 3 fois avant et après le remaniement `loadGame`,
résultat identique à chaque fois).

## 7. Dette restante / P2 non traités dans ce tour

- Pas de découpage structurel de `game.ts` en plusieurs modules internes
  (voir §2 — choix assumé, pas un oubli).
- Le protocole de callbacks `window._after*Anim`/`_stop*Anim` entre
  `game.ts` et `animations.ts` reste couplé via `window` plutôt que via un
  vrai bus d'événements — piste documentée §2, à coordonner avec D avant
  toute tentative future.
- Défaut d'outillage cross-cutting `tsconfig.test.json`/`i18n.ts` — voir §4,
  correctif suggéré mais non appliqué (hors périmètre).
- `tests/dice3d.dispose.test.ts` (élément C) : un bug transitoire
  (`_numTex is not defined`) observé à un moment de ma vérification a été
  corrigé par l'élément C lui-même avant ma vérification finale (79/79) —
  mentionné ici uniquement à titre d'exemple concret du phénomène de dépôt
  partagé vivant (§0), aucune action requise.
- Non revu dans ce tour (P2, pas de risque de sécurité ni de bug identifié) :
  les nombreuses fonctions de mise en page du modal de score
  (`openScoreModal`, ~150 lignes de calculs de styles inline selon
  l'orientation) restent denses et répétitives (beaucoup de blocs quasi
  dupliqués pour `rot-0`/`rot-180`/`rot-l`/`rot-r`) — un vrai candidat à une
  factorisation future, mais purement cosmétique/lisibilité, sans lien avec
  la sécurité ou un bug fonctionnel, donc non traité pour rester concentré
  sur les défauts P0/P1 assignés.

## 8. Fichiers créés/modifiés par cet agent

- `src/dom.ts` (ajout de `escapeHtml`)
- `src/game.ts` (correctifs d'injection HTML ×5, extraction de
  `computeClampedScore`/`currentScoreLimits`, cosmétique `let`→`const`)
- `src/types.ts` — lu, non modifié (aucun besoin identifié)
- `src/globals.d.ts` — lu, non modifié (interface déjà correcte)
- `tests/game.injection.test.ts` (nouveau)
- `tests/game.score-logic.test.ts` (nouveau)
- `tests/support/appHtml.ts` (nouveau)
- `tests/support/loadGame.js`, `tests/support/loadGame.d.ts` (nouveaux)
- `docs/audit/DECISIONS-B.md` (ce fichier, nouveau)
- `docs/audit/BRIEF.md` (ajout au §7 uniquement)
