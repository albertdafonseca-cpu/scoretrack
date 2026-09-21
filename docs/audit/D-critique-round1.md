# D-critique-round1 — Élément D : interface, accessibilité, i18n

Agent critique indépendant, round 1. Cible auditée : état intégré actuel de
la branche `claude/audit-qualite-aaa-lmthte`, commit `2456730` (« Intégration :
corrige 3 défauts d'intégration entre éléments A/D/E/F »), qui inclut le
commit propre de l'élément D `ab12597` (« confidentialité, 18 langues,
accessibilité de base »).

Toute vérification ci-dessous a été exécutée dans un `git worktree --detach`
isolé sur `2456730` (`/tmp/.../scratchpad/d-critique-wt`, supprimé en fin
d'audit), jamais dans `/home/user/scoretrack` (dépôt partagé, potentiellement
modifié en parallèle par d'autres agents). Seul ce fichier de verdict est
écrit dans le dépôt partagé. `npm install && npm run build` propres exécutés
dans ce worktree ; tous les scripts de vérification ponctuels (réseau,
clavier, focus, tailles de police) sont dans le scratchpad, pas commités.

## Verdict

**AAA : non.**

Le travail réel est solide sur plusieurs fronts vérifiés indépendamment :
zéro requête externe *depuis la page* (3 exécutions identiques), `dist/fonts/`
bien copié après un build propre, les 18 langues ont bien `privacyIntro`
sans clé manquante, le texte de confidentialité est sémantiquement correct
dans les 4 langues signalées comme moins fiables (ar/ja/ko/zh, à la limite de
ma propre compétence de lecture — voir §3), plus aucun texte visible au repos
sous 9px sur les 11 écrans/modales que j'ai balayés (pas seulement les 2
écrans testés par le constructeur), et les rôles ARIA/aria-label résistent à
la mutation testing. Mais quatre défauts bloquent le verdict AAA :

- **P0 (transverse, contredit directement le texte de confidentialité que D
  vient de corriger dans les 18 langues)** : le service worker
  (`src/sw-worker.ts`, hors périmètre d'édition de D mais qui invalide
  directement le §2 de son propre livrable) contacte réellement
  `fonts.googleapis.com` à chaque installation — code mort que E avait
  lui-même documenté « à supprimer une fois l'auto-hébergement câblé » et que
  ni D ni l'intégration finale n'ont retiré ni même re-testé après le
  câblage. **Confirmé indépendamment ici par une méthode différente** de
  celle du critique de l'élément E (probe Node direct sur `dist/sw.js` dans
  un faux `ServiceWorkerGlobalScope`, plutôt que l'instrumentation
  Playwright) — voir §1.2. Tant que ce point n'est pas réglé, l'affirmation
  « ScoreTrack ... ne contacte aucun serveur tiers » que D vient d'écrire
  dans 18 langues est fausse en production.
- **P1 (nouveau, propre à cet élément, non détecté par les 5 tests e2e du
  constructeur)** : les boutons d'action principaux de l'app
  (`#btn-privacy-accept` « GOT IT », `#go-btn` « NEXT → », classe `.go-btn`)
  **n'affichent aucun indicateur de focus visible à l'écran**, malgré
  `:focus-visible` qui matche bien l'élément (`el.matches(':focus-visible')
  === true`) et malgré la règle CSS généraliste ajoutée par D. Capture
  d'écran avant/after focus strictement identiques (voir §2.2). C'est
  exactement l'inverse de ce que D affirme avoir « généralisé ».
- **P1 (nouveau)** : les deux modales dotées d'un `role="dialog"`/
  `alertdialog` que j'ai pu tester en conditions réelles de clavier seul
  (`#score-modal`, `#dice-overlay`) **n'ont ni gestion de focus à
  l'ouverture, ni piège de focus, ni fermeture par Échap** : à l'ouverture le
  focus reste sur `<body>`/l'élément précédent ; Tab traverse 4 éléments de
  l'écran masqué DERRIÈRE l'overlay avant d'atteindre le contenu de la boîte
  de dialogue ; Échap ne ferme ni l'une ni l'autre. Voir §2.3.
- **P2 (mesuré, nouveau)** : le thème clair `mono-light` a un contraste de
  luminance chip-off/chip-on de **2.93:1**, sous le seuil WCAG 1.4.11 (3:1)
  pour les composants non textuels — à traiter comme un défaut, pas une
  quasi-réussite (règle de mesure du BRIEF §3.5).

Voir §1 pour la vérification réseau (item 1 du mandat), §2 pour
l'accessibilité clavier/focus (item 3), §3 pour les 18 langues (item 2), §4
pour les distinctions non chromatiques (item 4), §5 pour le moteur de dés
(item 5), §6 pour le périmètre (item 6), §7 pour la mutation testing, §8 pour
la comparaison à l'aveugle (item 7).

---

## 1. Vérification réseau et `dist/fonts/`

### 1.1 — Zéro requête externe depuis la page (confirmé, 3 exécutions identiques)

Build propre (`rm -rf dist node_modules && npm install && npm run build`)
puis page servie en HTTP local (petit serveur Node, pas de proxy), toutes
les requêtes réseau écoutées (`page.on('request')`), 3 exécutions
consécutives :

```
RUN 1: TOTAL_REQUESTS 6  EXTERNAL_REQUESTS []
RUN 2: TOTAL_REQUESTS 6  EXTERNAL_REQUESTS []
RUN 3: TOTAL_REQUESTS 6  EXTERNAL_REQUESTS []
```
Les 6 requêtes : `index.html`, `app.js`, `fonts/fonts.css` et 3 `.woff2`
réellement utilisés à l'écran initial (`share-tech-mono-latin`,
`orbitron-latin`, `inter-latin`). Zéro appel vers `fonts.googleapis.com`,
`fonts.gstatic.com` ou `cdnjs.cloudflare.com`. `document.fonts` confirme des
polices chargées localement.

`dist/fonts/` existe bien après un build propre (répertoire supprimé avant
le build) : 26 fichiers (25 `.woff2` + `fonts.css`). Le `cpSync('fonts',
'dist/fonts', {recursive:true})` ajouté dans `build.mjs` par l'intégration
finale (`2456730`, hors périmètre de D) fonctionne — le point de vigilance
que D avait lui-même soulevé dans `DECISIONS-D.md` §1.2 est bien résolu à
l'état actuel.

### 1.2 — P0 : le service worker contacte réellement Google Fonts (persiste)

Les deux tests e2e existants (`e2e/fonts-self-hosted.spec.ts`,
`e2e/pdf-export-offline.spec.ts`) n'écoutent que `page.on('request')`, qui
**ne capte pas** les requêtes émises par le service worker depuis son propre
contexte d'exécution (`fetch()` dans un handler `install`). Vérifié
empiriquement : ni `page.on('request')`, ni `context.on('request')`, ni
`context.route('**/*')` (Playwright) ne voient ce trafic — d'où le faux
sentiment de sécurité des tests actuels.

Pour ne pas dépendre des limites d'instrumentation de Playwright, j'ai
chargé `dist/sw.js` (le fichier réellement déployé, compilé depuis
`src/sw-worker.ts`) dans un faux `ServiceWorkerGlobalScope` (module Node
`vm`, `self`/`caches`/`fetch` simulés) et déclenché son handler `install` :

```
N_INSTALL_HANDLERS 1
TOTAL_FETCH_CALLS 30
 ... (29 fichiers locaux ./fonts/*, ./app.js, etc.)
 - https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=Share+Tech+Mono&family=Inter:wght@400;600;700;800&family=Press+Start+2P&family=Cinzel:wght@400;600;700&family=Bebas+Neue&family=Ballet&family=Permanent+Marker&family=Dancing+Script:wght@600;700&display=swap {"mode":"cors"}
GOOGLE_FONTS_FETCH_ATTEMPTS 1
```

`src/sw-worker.ts` contient toujours (lignes ~66-70, 86-87, 113-131) :
```ts
const FONT_CSS_URLS = ['https://fonts.googleapis.com/css2?family=...'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
// install:
await precache(await caches.open(FONTS_CACHE), FONT_CSS_URLS, { mode: 'cors' });
```
C'est exactement le bloc que l'élément E avait lui-même identifié dans
`DECISIONS-E.md` §2.3/§6.5 comme « devenant mort et devant être supprimé une
fois l'auto-hébergement câblé » — jamais retiré, ni par D (qui a fait le
câblage `index.html` déclenchant cette obsolescence), ni par l'intégration
finale. **Ce point a été trouvé indépendamment par le critique de l'élément
E** (méthode différente : instrumentation live plutôt que ce probe direct
`vm`) ; je le confirme ici parce que le mandat de cette revue me demande
explicitement de vérifier moi-même le point 1, et parce qu'il invalide
directement le texte que D vient d'écrire dans les 18 langues (§3). J'ai
aussi vérifié que l'environnement de test a bien un accès réseau sortant
réel (un `curl` direct vers `fonts.googleapis.com` répond 200), donc en
production réelle (navigateur d'un utilisateur avec accès Internet normal)
cette requête part bel et bien à chaque installation/mise à jour du service
worker — ce n'est pas un artefact de mon bac à sable.

**Conséquence pour D** : le fichier n'est pas dans le périmètre d'édition de
D, mais le texte de confidentialité que D a corrigé dans 18 langues
(`privacyIntro`, D19) affirme maintenant « ne contacte aucun serveur tiers »
— une affirmation que D avait la responsabilité de revérifier de bout en
bout avant de l'écrire, puisque c'est justement la condition posée par
`DECISIONS-E.md` §4 (« Variante A ... si l'auto-hébergement est intégré »)
que D a lui-même déclaré remplie en D18/D19. Le point n'a pas été revérifié
au niveau service worker.

---

## 2. Accessibilité clavier — vérification adversariale

### 2.1 — Écran de confidentialité et parcours de base : OK

`Tab` × 2 atteint `#btn-privacy-accept`, `Enter` déclenche `acceptPrivacy()`
et fait apparaître l'écran de configuration. Le parcours minimal fonctionne
au clavier.

### 2.2 — P1 : focus visible absent sur les boutons d'action principaux

`DECISIONS-D.md` §3.3 affirme le focus clavier « généralisé » via
`:focus-visible{outline:2.5px solid var(--accent,#66CCEE);...}`. Vérifié à
l'écran (pas seulement dans le CSS, comme demandé) : capture d'écran
recadrée sur `#btn-privacy-accept` **avant** tabulation et **après** 2×`Tab`
(focus confirmé dessus par `document.activeElement`) — **pixels strictement
identiques**, aucun anneau, aucun halo, aucun changement de couleur. Même
constat sur `#go-btn` (« NEXT → », capture après un vrai parcours clavier de
3×`Tab` depuis un preset sélectionné). Pourtant :
```js
el.matches(':focus-visible') // true
getComputedStyle(el).outlineWidth // "0px"
```
Le sélecteur matche bien, mais l'`outline` ne se rend jamais pour ces
boutons précis (classe `.go-btn`, utilisée par les 2 boutons d'action les
plus fréquents de toute l'app : accepter la politique de confidentialité, et
passer à l'écran suivant de la configuration). Vérification qu'il ne s'agit
pas d'un défaut de rendu général du navigateur : un autre contrôle de la
même page (le stepper +/- du nombre de joueurs) affiche, lui, un halo
lumineux net et visible sur capture d'écran au focus clavier — donc le
défaut est bien localisé à `.go-btn`, pas un artefact de l'environnement de
test. J'ai poussé la vérification jusqu'à forcer `outline`/`outline-width`/
`border` en `!important` directement sur le nœud DOM réel via JavaScript :
la valeur calculée ne change toujours pas (alors qu'un clone du même nœud
accepte la même règle sans problème) — signe d'une interaction CSS non
identifiée propre à cet élément/cette classe, à charge du constructeur de
diagnostiquer avant de corriger (BRIEF §3.6 : ne pas prescrire de correctif
sans mesure de la cause réelle — je documente la mesure, pas une hypothèse
de cause).

**Impact concret** : un utilisateur au clavier seul ne voit jamais où se
trouve le focus sur les deux boutons qu'il doit précisément presser pour
avancer dans l'app (accepter la politique de confidentialité, passer à
l'écran des noms) — alors même que ces deux boutons sont accessibles par
Tab et activables par Entrée. C'est un vrai défaut WCAG 2.4.7 (Focus
Visible), pas une nuance cosmétique.

### 2.3 — P1 : modales `dialog`/`alertdialog` sans gestion de focus ni Échap

Testé en conditions réelles (partie démarrée, `openScoreModal(0)` déclenché
comme le fait un vrai appui long sur une carte ; lanceur de dés ouvert comme
au clic sur le FAB) :

| Vérification | `#score-modal` | `#dice-overlay` |
|---|---|---|
| Focus déplacé dans la boîte à l'ouverture | **Non** — reste sur `<body>` | **Non** — reste sur `<body>` |
| Piège de focus (Tab ne sort pas de la boîte) | **Non** — 4 `Tab` sur les 5 premiers atteignent des boutons de l'écran masqué derrière l'overlay (`theme-gear-btn`, `lang-flag-btn`, `points-custom`, `objectif-custom`) avant d'entrer dans `#score-modal` | **Non** — 4 des 10 premiers `Tab` sortent de `#dice-overlay` |
| `Échap` ferme la boîte | **Non** — `#score-modal` reste ouvert (`hidden` absent) après `Escape` | **Non** — `#dice-overlay` reste ouvert après `Escape` |

Reproductible : `grep -rn "Escape\|keydown\|keyup" src/*.ts index.html` ne
retourne **aucun résultat** dans tout le projet — il n'existe nulle part de
gestion clavier pour fermer une boîte de dialogue, malgré le rôle
`dialog`/`alertdialog` ajouté par D sur 7 boîtes. C'est contraire au ARIA
Authoring Practices Guide (le patron « Dialog (Modal) » exige : focus
déplacé à l'ouverture, piège de focus tant qu'elle est ouverte, `Échap` la
ferme et restitue le focus). `CLAUDE.md` documente bien deux mécanismes de
fermeture pour la feuille de dés — tapotement du fond flouté, glissement
vers le bas — mais aucun des deux n'est utilisable au clavier seul, et
aucun clavier de secours (`Échap`) n'a été ajouté en clôturant l'audit
d'accessibilité. Un utilisateur clavier seul PEUT techniquement fermer ces
boîtes (le bouton Annuler/Fermer reste atteignable par Tab, après avoir
d'abord traversé l'écran masqué), mais l'expérience contredit tout patron
ARIA standard et le mandat même de la vérification (« est-ce vraiment
utilisable sans souris ? »).

Ceci n'était pas testé par les 5 tests e2e du constructeur
(`e2e/accessibility-basics.spec.ts`), qui vérifient la présence du rôle
ARIA et du `aria-label`, jamais le comportement clavier réel une fois la
boîte ouverte.

### 2.4 — Tailles de texte < 9px : balayage étendu à 11 écrans (pas seulement les 2 du constructeur)

Le test du constructeur ne couvre que l'écran de configuration et la partie
(barre ouverte). J'ai balayé, avec le même critère (nœud avec texte propre,
visible, `offsetParent` non nul), 11 états d'interface : écran de
confidentialité, configuration, sélecteur de thème, dropdown de langue,
écran des noms, partie (barre fermée/ouverte), **modal de score**,
**lanceur de dés (aperçu et après lancer)**, **récapitulatif**. Résultat :
**0 élément sous 9px sur les 11 écrans**. Confirmé aussi au niveau CSS
source (`grep` de toutes les déclarations `font-size` < 9px dans
`index.html`) : une seule occurrence dans tout le fichier,
`#elim-anim-skull{font-size:4px}`, qui est bien l'état de départ documenté
d'une animation JS (grossit en quelques centaines de ms), pas un texte lu au
repos — je suis d'accord avec le constructeur pour l'exclure. Ce point du
mandat est donc validé, plus largement que ce que le constructeur avait
lui-même vérifié.

---

## 3. Politique de confidentialité — 18 langues

`grep -c "privacyIntro:"` = 18, une entrée par langue déclarée
(`ar,da,de,en,es,fi,fr,it,ja,ko,nb,nl,pl,pt,ru,sv,tr,zh`). `npx vitest run
tests/translations.test.ts` : 4/4 verts (aucune clé manquante, aucune
traduction vide dans aucune langue, y compris après les modifications de
D). Mutation testing sur ce test : voir §7.

Lecture sémantique des 4 langues signalées par D comme moins fiables :

- **zh** : « ScoreTrack不收集、不追踪、也不传输任何个人数据——且不会联系任何第三方服务器... » —
  sens correct (« ne collecte, ne suit ni ne transmet aucune donnée
  personnelle — et ne contactera aucun serveur tiers »), grammaticalement
  cohérent.
- **ja** : « ScoreTrackは個人データを収集・追跡・送信することは一切なく、外部サーバーにも一切アクセスしません。»
  — sens correct et formulation naturelle (« ne collecte, ne suit ni ne
  transmet absolument aucune donnée personnelle, et n'accède à absolument
  aucun serveur externe »).
- **ko** : « ScoreTrack는 개인 데이터를 수집·추적·전송하지 않으며, 어떤 제3자 서버에도 접속하지
  않습니다. » — sens correct ; nuance mineure de particule (« 는 » après une
  consonne finale latine, usage courant pour un nom translittéré, pas une
  erreur bloquante).
- **ar** : « لا يقوم ScoreTrack بجمع أي بيانات شخصية أو تتبعها أو نقلها، ولا يتصل
  بأي خادم خارجي... » — sens correct (« ScoreTrack ne collecte, ne suit ni
  ne transmet aucune donnée personnelle, et ne se connecte à aucun serveur
  externe »).

Dans les 4 cas, **aucune inversion de sens** trouvée (pas de contresens du
type « collecte des données »). Je ne suis pas locuteur natif de ces 4
langues : cette lecture s'appuie sur ma connaissance du vocabulaire de base
et de la structure grammaticale, pas sur une validation par un locuteur
natif — **limite de vérification à documenter explicitement**, comme prévu
par le mandat, sans bloquer l'AAA sur ce seul point. Ce qui bloque
réellement l'AAA sur la confidentialité, c'est le point 1.2 ci-dessus (le
texte, dans les 18 langues, est actuellement inexact en production).

---

## 4. Distinctions non chromatiques (D-CLAUDE-2 / D-PREF-1) au-delà du bouton Gain/Perte

Recherche indépendante dans `index.html`/`game.ts` de toute information
portée uniquement par la couleur :

- `.modal-score-display.pos/.neg` (total affiché dans le modal de score) et
  `.recap-delta.pos/.neg` (récapitulatif) : vérifié dans `src/game.ts`
  (`updateModalDisplay()` L1641-1645, génération du récap L1795) — le signe
  `+`/`-` est **toujours** préfixé au texte, la couleur n'est qu'un renfort.
  Conforme, rien à ajouter.
- `.sign-btn` (Gain/Perte) : déjà corrigé par D (coche non chromatique),
  vérifié présent dans `index.html`.
- `.recap-player-dot` (pastille colorée par joueur dans le récapitulatif,
  `COLORS[pi%12]`) : couleur pure sans forme/motif distinctif, **mais** le
  nom du joueur en texte est toujours accolé — la couleur n'est qu'un
  renfort décoratif redondant avec le texte, pas le seul canal
  d'information. Acceptable.
- Chips joueurs/points/objectifs (`.player-chip.on`, etc.) : vérifié
  **par la mesure**, pas seulement affirmé (BRIEF §3.5 — mesurer les pixels
  réels) — calcul du ratio de contraste WCAG (luminance relative) entre
  `--chip-bg` et `--chip-on` pour les 13 thèmes déclarés dans `index.html` :

  | Thème | Contraste bg/on |
  |---|---|
  | cyan (par défaut) | 8.58:1 |
  | violet/rose | 5.91:1 |
  | jaune ×2 | 9.07:1 |
  | vert | 8.74:1 |
  | orange ×2 | 6.25–6.32:1 |
  | mono (sombre) | 16.29:1 |
  | **mono-light (clair)** | **2.93:1** |
  | light-blue | 3.16:1 |
  | ios-dark | 6.44:1 |
  | brun (LDM) | 6.55:1 |
  | sépia | 3.21:1 |

  12 des 13 thèmes dépassent nettement le seuil WCAG 1.4.11 (3:1, composants
  non textuels). **`mono-light` est en dessous (2.93:1)** — sur ce thème
  précis, la distinction chip sélectionnée/non sélectionnée n'a *presque*
  que la couleur pour se distinguer (le contenu textuel du chip reste
  identique dans les deux états). Le BRIEF (§3.5) demande explicitement de
  traiter une valeur proche du seuil comme un défaut, pas une réussite :
  **P2** à corriger (soit assombrir `--chip-bg` soit éclaircir/foncer
  `--chip-on` de `mono-light`, soit ajouter une coche comme pour le bouton
  Gain/Perte).

---

## 5. Non-régression du moteur de dés 3D

`git show ab12597 --stat` (voir §6) confirme que D n'a touché ni
`src/dice3d/*` ni `src/dice-ui.ts`. Vérifié en complément qu'aucun risque de
débordement CSS n'existe : les classes du balisage du lanceur de dés
(`dice-sheet`, `dice-title`, `dice-roll-btn`, `dice-history`, `dice-value`,
etc. — liste complète extraite d'`index.html` L1560-1632) ne recoupe
**aucun** des sélecteurs dont D a changé la taille de police
(`.setup-label`, `.setup-divider-label`, `.bar-btn`, `.names-action-btn`,
`.restore-btn`, `#btn-savedefault/#btn-restoredefault/#btn-cleardefault
.btn-label`, `.btn-clear-all`, `.lang-flag-btn::after`, `.objectif-chip`) :
aucun débordement CSS possible par construction. Le balayage de tailles de
police du §2.4 a inclus l'aperçu du lanceur de dés et l'écran de résultat
après un lancer réel : 0 élément sous 9px, aucune régression visuelle
constatée. Le rendu WebGL des dés (canvas Three.js) est structurellement
hors d'atteinte d'un changement de `font-size` CSS DOM. Point du mandat
validé sans réserve.

---

## 6. Respect du périmètre

```
$ git show --stat ab12597
 docs/audit/BRIEF.md              |  66 +++++++
 docs/audit/DECISIONS-D.md        | 417 +++++++++++++++++++++++++++++++++++++++
 e2e/accessibility-basics.spec.ts | 223 +++++++++++++++++++++
 e2e/fonts-self-hosted.spec.ts    | 110 +++++++++++
 index.html                       |  95 +++++----
 src/i18n.ts                      |  21 +-
 src/i18n/translations.ts         | 198 +++++++++++++++----
 7 files changed, 1050 insertions(+), 80 deletions(-)
```
Conforme au contrat de propriété du BRIEF §5 (`index.html`, `src/i18n.ts`,
`src/i18n/translations.ts`, `docs/audit/D-*.md`, plus de nouveaux fichiers
`e2e/*.ts` qui n'appartiennent à personne en exclusivité). Aucun fichier
d'un autre élément touché (`game.ts`, `dom.ts`, `globals.d.ts`, `dice3d/*`,
`dice-ui.ts`, `sw.ts`, `sw-worker.ts`, `recap-pdf.ts`, `package.json`,
`tsconfig*`, `build.mjs`, `vercel.json` absents du diff). **Aucun défaut de
périmètre.**

---

## 7. Mutation testing (3 tests existants cassés puis restaurés)

Toutes les mutations ci-dessous ont été appliquées et annulées uniquement
dans le worktree isolé (`git diff --stat` vide confirmé après restauration
à chaque fois, jamais dans le dépôt partagé) :

1. **`role="dialog"` retiré de `#score-modal`** → le test
   `les boîtes de dialogue principales portent un rôle ARIA` échoue
   (`Received has value: null`, désigne l'id fautif). Restauré → vert.
2. **`.bar-btn{font-size:9px}` repassé à `7px`** → le test
   `aucun texte visible sous 9px...` échoue précisément
   (`taille la plus petite trouvée : SPAN.btn-label "Undo"`, `Expected: >=9,
   Received:7`). Restauré → vert.
3. **`<link rel="stylesheet" href="./fonts/fonts.css">` remplacé par un
   `@import` Google Fonts résiduel** → le test
   `aucune requête externe vers Google Fonts...` échoue en listant l'URL
   externe interceptée. Restauré → vert.

Les 3 tests réagissent réellement à la régression qu'ils prétendent
couvrir (aucun n'est structurellement increassable). Après chaque
restauration : `npm run typecheck` (3 tsconfig) vert, `npm run lint` 0
erreur, `npx vitest run` 79/79, `npx playwright test` 8/8 — état identique
à celui annoncé par le constructeur, reconfirmé indépendamment.

---

## 8. Comparaison à l'aveugle (critères WCAG 2.1 AA usuels)

Sur les trois critères que le mandat demande de comparer (contraste,
navigation clavier, nommage accessible) face à une application grand public
réputée pour son accessibilité :

- **Nommage accessible** : à égalité ou au-dessus du marché — 12 boutons
  icône-seule avec `aria-label` traduit dynamiquement dans 18 langues, 7
  boîtes de dialogue avec rôle ARIA correct, aucune app grand public de ce
  segment (compteurs de score, lanceurs de dés) n'atteint typiquement ce
  niveau de granularité i18n sur l'accessibilité.
- **Contraste** : globalement au-dessus du marché (12/13 thèmes largement
  au-dessus de 3:1 sur les composants non textuels, mesuré), à l'exception
  ponctuelle du thème `mono-light` (§4, P2).
- **Navigation clavier** : **nettement en dessous** du standard qu'impose
  n'importe quelle application professionnelle sérieuse sur l'accessibilité
  (Focus visible manquant sur les boutons d'action principaux, aucun piège
  de focus ni fermeture par Échap sur les boîtes de dialogue modales — deux
  manquements que la moindre checklist WCAG 2.1 AA/ARIA APG détecterait
  immédiatement sur les tout premiers écrans testés). **Sur ce critère,
  ScoreTrack perd la comparaison** face à une application de référence
  correctement outillée sur l'accessibilité clavier.

Verdict global de la comparaison : **ScoreTrack ne gagne pas** la
comparaison sur le critère navigation clavier — condition explicite du
BRIEF §3.4 pour continuer la boucle constructeur/critique.

---

## Résumé actionnable pour le prochain tour du constructeur

**P0**
1. `src/sw-worker.ts` (hors périmètre D mais bloquant pour son propre
   livrable) : retirer `FONT_CSS_URLS`/`FONT_HOSTS` et la branche fetch
   associée (code mort documenté par E depuis `DECISIONS-E.md` §2.3/§6.5),
   puis revérifier avec un test qui instrumente réellement le cycle
   `install` du service worker (pas seulement `page.on('request')` —
   voir §1.2 pour une méthode qui fonctionne). Nécessite une coordination
   D/E/F puisque le fichier n'appartient à aucun des deux au sens strict
   après le câblage.

**P1**
2. Diagnostiquer pourquoi `.go-btn` (`#btn-privacy-accept`, `#go-btn`) ne
   rend jamais son `outline`/`box-shadow` de focus malgré
   `:focus-visible` qui matche (même un `!important` inline forcé via JS
   échoue sur le nœud réel mais réussit sur un clone identique — piste de
   départ pour le constructeur, cause exacte non identifiée par ce round de
   critique). Revérifier par capture d'écran avant/après focus, pas
   seulement par lecture du CSS.
3. Ajouter une gestion clavier minimale sur les boîtes modales
   (`#score-modal`, `#dice-overlay` au moins) : focus déplacé vers un
   élément de la boîte à l'ouverture, piège de focus tant qu'elle reste
   ouverte, `Échap` la ferme. Une seule fonction utilitaire réutilisable sur
   les 7 boîtes suffirait.

**P2**
4. Thème `mono-light` : contraste chip off/on à 2.93:1, sous le seuil WCAG
   1.4.11 (3:1) — ajuster `--chip-bg`/`--chip-on` ou ajouter un indicateur
   non chromatique comme pour `.sign-btn`.

**Limite de vérification déclarée**
5. Lecture sémantique de ar/ja/ko/zh faite sans locuteur natif (§3) —
   n'a pas révélé de contresens, mais ne vaut pas validation native.
