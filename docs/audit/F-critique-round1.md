# Critique élément F — CI/CD, déploiement, documentation (round 1)

Agent critique indépendant. Vérification faite dans un `git worktree` détaché
isolé (`git worktree add --detach <tmp>/wt-F 2456730`), jamais dans le dépôt
partagé. Aucun fichier du dépôt principal n'a été modifié par cet agent, à
l'exception du présent rapport. Base vérifiée : commit d'intégration
`2456730` (état complet après fusion de A-F), avec relecture de
`docs/audit/BRIEF.md`, `docs/audit/DECISIONS-F.md`, `docs/AUDIT-V2.md`,
`git show 3413bdc` (commit F) et `git show 2456730` (intégration).

## Verdict

**AAA : non.**

Le pipeline de build (`build.mjs`) est réellement robuste, la CI GitHub
Actions reflète fidèlement ce qu'un contributeur exécute en local, et
`.gitignore` est complet et vérifié. Mais deux défauts réels et actionnables
subsistent, l'un d'eux invalidant la prémisse même de la mission (« D et E
ont éliminé tous les CDN externes ») :

1. **P0 — Le service worker contacte encore réellement Google Fonts, en
   contradiction avec la politique de confidentialité affichée.** La CSP
   n'est donc pas « trop permissive par excès de prudence » : elle autorise
   une origine **toujours activement contactée**, pour une fonctionnalité
   devenue inutile.
2. **P1 — Le `README.md` de l'élément F a pris du retard** sur l'état réel
   du dépôt : il décrit encore jsPDF comme « chargé depuis un CDN », ce qui
   est faux depuis le commit de l'élément E (jsPDF est une dépendance npm
   bundlée).

Détail des 7 points de mission ci-dessous, avec preuves reproductibles.

---

## 1. La CSP de `vercel.json` est-elle obsolète/trop permissive ?

**Réponse : non — pire que ça. Elle est encore strictement nécessaire,
parce qu'une origine qu'elle autorise est encore réellement contactée par
le service worker.**

### Ce qui est confirmé retiré
`grep -rn "cdnjs\|fonts.googleapis\|fonts.gstatic" index.html` → **aucune
occurrence**. La page elle-même (styles, scripts) ne référence plus aucun
CDN externe. `src/recap-pdf.ts` importe `jspdf` en dépendance npm bundlée
(`import { jsPDF } from 'jspdf'`, `package.json` → `"dependencies":
{"jspdf":"4.2.1", "three":"0.149.0"}`). Un test Playwright dédié
(`e2e/fonts-self-hosted.spec.ts`) passe et confirme 0 requête externe **au
niveau de la page**.

### Ce qui NE l'est PAS, et que ce test ne peut structurellement pas détecter
`src/sw-worker.ts` contient toujours, non retiré malgré que l'élément E l'ait
lui-même documenté comme dette restante (`docs/audit/DECISIONS-E.md` §6,
point 5 : « une fois §2.1/2.2 appliqués, retirer de `src/sw-worker.ts` le
bloc Google Fonts devenu mort ») :

```ts
const FONT_CSS_URLS = ['https://fonts.googleapis.com/css2?family=Orbitron:...'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
...
await precache(await caches.open(FONTS_CACHE), FONT_CSS_URLS, { mode: 'cors' });
```

Ce code s'exécute **à chaque installation du service worker** (chaque
premier chargement, chaque changement de version d'app puisque
`CACHE_VERSION` inclut `__APP_VERSION__`), déclenché sans condition par
`src/sw.ts` (`navigator.serviceWorker.register('./sw.js', {scope: './'})`,
appelé sur toute page servie en HTTP réel, pas seulement `file://`).

**Preuve déterministe, indépendante du bac à sable réseau** : plutôt que de
me fier à `page.on('request')` de Playwright — qui, vérifié empiriquement,
**ne remonte pas** les requêtes émises depuis l'intérieur d'un service
worker (testé avec `context.on('request')`, `context.on('requestfailed')`
et `context.route('https://fonts.googleapis.com/**', ...)` : zéro
interception dans les trois cas alors que le code list plus bas prouve que
la requête part bel et bien) — j'ai exécuté le **vrai fichier compilé
`dist/sw.js`** (celui que Vercel sert) dans un bac à sable Node minimal
(`vm.createContext`, `self`/`caches`/`fetch` simulés), et déclenché
l'événement `install` exactement comme le ferait un navigateur :

```
Appels fetch() déclenchés par le gestionnaire "install" du VRAI dist/sw.js :
 - ./  ... (fichiers statiques de l'app, attendu)
 - https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&...  {"mode":"cors"}

1 appel(s) fetch() vers une origine externe cdnjs/Google Fonts trouvé(s) au démarrage du service worker.
```

Rejoué **3 fois consécutives**, résultat identique à chaque fois (conforme
à la règle de mesure D16/D21 du brief). Le script harnais est reproductible
(vm Node, exécute `dist/sw.js` verbatim, aucune dépendance réseau).

### Conséquence sur le verdict CSP
- Retirer maintenant `fonts.googleapis.com`/`fonts.gstatic.com` de
  `connect-src` **bloquerait silencieusement** ce fetch résiduel (capturé
  par un `.catch()` existant, donc aucune régression fonctionnelle visible)
  — mais ce n'est pas un « resserrement propre », c'est un correctif de
  fait qui masquerait un bug réel plutôt que de le corriger à la racine.
- Le vrai correctif est dans `src/sw-worker.ts` (hors périmètre F,
  propriété de l'élément E) : supprimer `FONT_CSS_URLS`, `FONT_HOSTS`, l'appel
  `precache(..., FONT_CSS_URLS, ...)` et la branche `fetch` associée dans le
  gestionnaire `'fetch'` — exactement ce qu'E avait déjà noté comme reste à
  faire et qui ne l'a jamais été.
- **Tant que ce nettoyage n'est pas fait, la politique de confidentialité
  actuelle d'`index.html` est fausse** : `privacyIntro` affirme « ScoreTrack
  ne collecte aucune donnée personnelle » et `privacyS2` « Aucune donnée
  n'est envoyée à un serveur [...] » (texte de la Variante A de
  `DECISIONS-E.md` §4, qui suppose explicitement que l'auto-hébergement est
  *entièrement* câblé, y compris ce nettoyage). Une requête vers
  `fonts.googleapis.com` transmet une adresse IP et un user-agent à Google à
  chaque installation du SW — c'est une transmission à un tiers au sens du
  texte affiché. **Le P0 #1 du constat initial (« politique de
  confidentialité fausse ») n'est donc pas totalement refermé**, contrairement
  à ce que les journaux D10-D12/E laissent penser.

### Verdict actionnable (P0, cross-équipe E + F)
1. Élément E (ou qui reprend `src/sw-worker.ts`) : supprimer le bloc Google
   Fonts mort de `src/sw-worker.ts` (`FONT_CSS_URLS`, `FONT_HOSTS`,
   `FONTS_CACHE` et la branche fetch dédiée) — ou, à défaut de retrait
   immédiat, corriger la politique de confidentialité en variante B en
   attendant.
2. Élément F (une fois 1. fait) : resserrer `vercel.json` —
   `style-src 'self' 'unsafe-inline'`, `font-src 'self' data:`,
   `connect-src 'self'`, `script-src 'self' 'unsafe-inline'` (retirer
   `cdnjs.cloudflare.com`, `fonts.googleapis.com`, `fonts.gstatic.com`
   partout). Revalider avec le même harnais Node exécutant `dist/sw.js`
   (pas seulement `page.on('request')`, structurellement aveugle à ce cas —
   à corriger aussi dans `e2e/fonts-self-hosted.spec.ts`, qui devrait
   attendre l'installation du SW et inspecter son trafic, sans quoi le test
   ne peut pas échouer sur une régression de ce type précis — leçon
   « mutation testing » du brief, §3.2).

---

## 2. Reproduction du test de fiabilité de `build.mjs`

Confirmé, comportement exactement conforme à ce qui est annoncé dans
`DECISIONS-F.md` §3.

**Erreur injectée dans `src/main.ts` seul** (`echo "@@@INVALID SYNTAX @@@" >> src/main.ts`), `rm -rf dist && node build.mjs` :
```
✘ [ERROR] Expected identifier but found "@"
    src/main.ts:73:1: ...
  dist/sw.js  2.5kb          ← l'autre cible est bien construite
✘ Échec du build (src/main.ts -> dist/app.js) :
Build failed with 1 error: src/main.ts:73:1: ERROR: Expected identifier but found "@"
1/2 cible(s) de build en échec — dist/ n'est pas fiable, arrêt (code 1).
EXIT_CODE=1
```
`ls dist/` → seul `sw.js` présent, `app.js` absent (esbuild n'écrit rien en
échec) : cohérent. Restauration (`cp` de la sauvegarde) puis
`git diff --stat src/main.ts` → **vide**, confirmé.

**Erreur injectée dans `src/sw-worker.ts` seul**, même protocole :
```
✘ Échec du build (src/sw-worker.ts -> dist/sw.js) :
Build failed with 1 error: src/sw-worker.ts:150:1: ERROR: Expected identifier but found "@"
1/2 cible(s) de build en échec — dist/ n'est pas fiable, arrêt (code 1).
EXIT_CODE=1
```
`ls dist/` → `app.js`, `app.js.map`, `index.html`, `fonts/` présents, `sw.js`
absent : l'autre cible se construit bien indépendamment, comme annoncé.
Restauration confirmée (`git diff --stat` vide). Build sain rejoué ensuite
(`rm -rf dist && node build.mjs`) → code 0, `dist/app.js` et `dist/sw.js`
tous deux produits.

**Aucun défaut trouvé sur ce point.** Le message nomme précisément la cible
en échec (`src/main.ts -> dist/app.js` / `src/sw-worker.ts -> dist/sw.js`),
le code de sortie est non nul dans les deux cas, et la construction
parallèle (au lieu de séquentielle) fait bien ce qu'elle promet : l'autre
cible aboutit malgré l'échec de la première.

---

## 3. Le `README.md` est-il à jour ?

**Non — un défaut de staleness concret et vérifiable a été trouvé.**

### Scripts : tous présents et à jour
Tous les scripts documentés dans le tableau du README existent bien dans le
`package.json` **actuel** : `build`, `watch`, `typecheck`, `lint`, `test`,
`test:watch`, `test:e2e`, `check`, `ci`. Le script `pretest:e2e` (ajouté par
l'élément A, round 1, D9) n'a pas de ligne dédiée dans le tableau, ce qui
est acceptable (npm l'exécute silencieusement, ce n'est pas un script que
l'utilisateur invoque directement) — mais la description de `test:e2e`
(« nécessite un `npm run build` préalable ») **a été rendue partiellement
obsolète** par D9 : ce n'est plus une précondition manuelle, `pretest:e2e`
le fait automatiquement. Défaut mineur (P2), la commande fonctionne
toujours, la description est juste imprécise plutôt que fausse.

### Défaut réel : description de `recap-pdf.ts` fausse
Section « Structure » du README :
> `recap-pdf.ts` — export PDF du récapitulatif (jsPDF, **chargé depuis un
> CDN**).

C'est faux dans l'état actuel du dépôt : `src/recap-pdf.ts` importe jsPDF
comme dépendance npm bundlée (`import { jsPDF } from 'jspdf'`), confirmé par
`package.json` (`"dependencies": {"jspdf": "4.2.1", ...}`) et par le
commentaire du fichier lui-même (`// jsPDF est une dépendance npm bundlée
par esbuild [...] plus de chargement CDN`). Le README de l'élément F a été
écrit **avant** le travail de l'élément E (jsPDF bundlé par E après le
commit F, cf. le commit d'intégration `2456730` qui liste précisément ce
type de dérive) et n'a jamais été resynchronisé — exactement le risque
anticipé dans la mission (« un README rédigé avant les rounds suivants peut
mentir sans que personne ne l'ait fait exprès »). Confirmé ici en pratique,
pas en théorie.

### Défaut mineur additionnel
Le répertoire `fonts/` (nouveau, racine du dépôt, ajouté par l'élément E
pour l'auto-hébergement des polices, copié vers `dist/fonts` par le
`cpSync` du commit d'intégration `2456730`) n'apparaît nulle part dans la
section « Structure » du README. P2.

### Verdict actionnable (P1)
Corriger la phrase sur `recap-pdf.ts` (retirer « chargé depuis un CDN »,
mentionner que jsPDF est une dépendance npm bundlée), ajouter `fonts/` à la
structure documentée, et nuancer la description de `test:e2e` pour refléter
`pretest:e2e`.

---

## 4. Cohérence de la CI GitHub Actions avec l'état actuel

**Confirmée, pipeline reproduit avec succès en local.**

Séquence exacte de `.github/workflows/ci.yml` (`npm ci && npm run lint &&
npm run typecheck && npm run test && npm run build`) rejouée dans le
worktree isolé, sur `node_modules` fraîchement installés :

| Étape | Résultat | Détail |
|---|---|---|
| `npm ci` | OK (exit 0) | 195 paquets, 0 vulnérabilité |
| `npm run lint` | OK (exit 0) | 0 erreur, 566 avertissements (`no-var`, `no-explicit-any` — tolérés par design, cf. D2) |
| `npm run typecheck` | OK (exit 0) | Les 3 `tsconfig` (`tsconfig.json`, `tsconfig.sw.json`, `tsconfig.test.json`) passent, y compris le défaut d'intégration corrigé par `2456730` (inclusion de `globals.d.ts`) |
| `npm run test` | OK (exit 0) | 79/79 tests, 8 fichiers |
| `npm run build` | OK (exit 0) | `dist/app.js` (1,6 Mo), `dist/sw.js`, `dist/fonts/` (25 fichiers), `dist/index.html` |
| `npm run test:e2e` (hors CI, vérifié en plus) | OK (exit 0) | 8/8, y compris `fonts-self-hosted.spec.ts` et `pdf-export-offline.spec.ts` |

**Note méthodologique** : ma première exécution de `npm run lint` a affiché
34 erreurs — dues à mes propres scripts de vérification temporaires
(`.mjs`) laissés par erreur à la racine du worktree, ramassés par
`eslint .`. Une fois supprimés, résultat propre confirmé (0 erreur). Signalé
ici pour transparence, ce n'est pas un défaut du dépôt.

**Aucun défaut trouvé sur ce point** : la CI est fidèle à ce qu'un
contributeur exécute réellement en local, la définition AAA §6 « `npm run
check` reste vert » et le point de comparaison à l'aveugle (§7 de la
mission) sont satisfaits ici.

---

## 5. `.gitignore` — fuite de fichiers générés ?

**Aucune fuite trouvée.** Après un cycle complet (`npm ci`, build, tests
unitaires, `npm run test:e2e` avec Playwright réellement exécuté, ce qui a
généré un vrai répertoire `test-results/` et un `dist/` complet) :

```
$ git status --short
(rien)
$ git status --short --ignored
!! dist/
!! test-results/
$ git check-ignore -v dist test-results .DS_Store
.gitignore:2:dist/          dist
.gitignore:8:test-results/  test-results
.gitignore:15:.DS_Store     .DS_Store
```

`git status --short` (sans `--ignored`) est vide : aucun fichier généré
n'apparaît comme non suivi visible. `playwright-report/` et `coverage/`
n'ont pas été générés dans cette exécution (pas de flag `--reporter=html`
ni `--coverage`), donc non testés en pratique, mais leurs entrées existent
bien dans `.gitignore` et suivent le même motif vérifié pour
`test-results/`.

---

## 6. Licence dans `package.json`

Toujours absente (`node -e "console.log(require('./package.json').license)"`
→ `undefined`), sans changement depuis D8 (round où F a documenté la
recommandation sans pouvoir agir, hors de son périmètre d'édition
`package.json`). Aucun élément suivant (A, qui possède `package.json`) ne
l'a ajoutée non plus dans les rounds suivants — `2456730` ne touche pas ce
champ.

**Jugement contextuel** : ScoreTrack est déployé publiquement (Vercel,
`vercel.json` présent, README documentant un déploiement réel), pas un
script à usage strictement privé — dans ce contexte, l'absence de licence
n'est pas anodine : par défaut, "tous droits réservés" s'applique. Ce n'est
cependant pas un défaut de *sécurité*, de *build* ni de *CI* — les trois
axes de l'élément F — et le choix de licence (MIT, propriétaire, etc.)
appartient à l'auteur, pas à un agent d'audit. **Classé P2** : à porter à la
connaissance de l'utilisateur pour décision explicite, pas bloquant pour un
verdict AAA sur ce seul point, mais notable que le sujet reste sans
réponse après plusieurs rounds malgré avoir été signalé dès le round 1.

---

## 7. Comparaison à l'aveugle

Sur les trois axes cités par la mission :
- **CI qui reflète fidèlement le local** : atteint (point 4 ci-dessus) —
  au niveau d'un projet professionnel sérieux.
- **CSP resserrée au strict nécessaire** : **non atteint**, et pour une
  raison plus grave que prévu — pas seulement « pas encore resserrée » mais
  « ne peut pas l'être correctement tant qu'un bug actif (fetch SW mort)
  n'est pas corrigé ailleurs ». Un projet grand public professionnel de
  référence n'aurait ni la CSP à revoir, ni un service worker qui contacte
  encore un tiers après avoir annoncé publiquement ne plus le faire.
- **Doc synchronisée avec le code** : **non atteint** — le README contient
  une affirmation factuellement fausse sur son propre pipeline de
  dépendances (jsPDF « CDN » vs npm bundlé), le genre d'incohérence qu'un
  audit professionnel détecterait avant publication.

Sur ces deux derniers critères, ScoreTrack est en dessous du niveau attendu
d'une doc/CSP de référence grand public.

---

## Défauts consolidés

| # | Sévérité | Défaut | Propriétaire du correctif | Preuve |
|---|---|---|---|---|
| 1 | **P0** | `src/sw-worker.ts` contacte encore réellement `fonts.googleapis.com` à chaque installation du service worker (code mort jamais retiré, déjà documenté comme dette par E lui-même) ; la politique de confidentialité affichée (« aucune donnée envoyée à un serveur ») est donc actuellement fausse | Élément E (`src/sw-worker.ts`) puis F (`vercel.json`, une fois le premier corrigé) | Exécution du vrai `dist/sw.js` dans un bac à sable Node, 3 runs identiques : fetch réel vers `fonts.googleapis.com` déclenché par `install` |
| 2 | **P1** | `README.md` décrit `recap-pdf.ts` comme utilisant jsPDF « chargé depuis un CDN » — faux, jsPDF est bundlé en dépendance npm depuis le travail de l'élément E | Élément F (`README.md`) | `package.json` → `dependencies.jspdf`, `src/recap-pdf.ts:1` (`import { jsPDF } from 'jspdf'`) |
| 3 | **P1** (dérivé de #1) | `e2e/fonts-self-hosted.spec.ts` ne peut structurellement pas détecter le défaut #1 : il n'observe que `page.on('request')`, qui ne remonte pas le trafic réseau émis depuis l'intérieur du service worker | Élément D/E (`e2e/fonts-self-hosted.spec.ts`) | `context.on('request')`/`route()` testés sans résultat sur le fetch pourtant réellement émis (prouvé par le harnais Node) |
| 4 | P2 | README ne mentionne pas le répertoire `fonts/` (ajouté par E, copié par F dans `build.mjs`) dans sa section Structure | Élément F (`README.md`) | Lecture de `README.md` §Structure vs présence réelle de `/fonts` |
| 5 | P2 | README dit `test:e2e` « nécessite un `npm run build` préalable », imprécis depuis l'ajout de `pretest:e2e` (D9) qui l'automatise | Élément F (`README.md`) | `package.json` → `"pretest:e2e": "npm run build"` |
| 6 | P2 | Pas de champ `license` dans `package.json`, ni de fichier `LICENSE`, signalé sans suite depuis le round 1 (D8) | Élément A (`package.json`) | `require('./package.json').license === undefined` |

**Aucun défaut trouvé** sur : fiabilité de `build.mjs` (point 2), fidélité
de la CI GitHub Actions (point 4), complétude de `.gitignore` (point 5).

## Recommandation pour le prochain tour

1. Élément E (ou qui reprend le fichier) : supprimer le bloc Google Fonts
   mort de `src/sw-worker.ts` (`FONT_CSS_URLS`, `FONT_HOSTS`, `FONTS_CACHE`,
   la branche `fetch` dédiée) ; renforcer `e2e/fonts-self-hosted.spec.ts`
   pour qu'il observe aussi le trafic du service worker (ex. attendre
   `navigator.serviceWorker.ready`, puis inspecter `caches.open('st-fonts-v4')`
   côté page — vide après retrait — ou rejouer un harnais équivalent au
   mien sur `dist/sw.js`), sans quoi une régression future resterait
   indétectable (leçon D17 du brief : un test qui ne peut pas échouer ne
   vaut rien).
2. Élément F : une fois 1. fait, resserrer `vercel.json` (retirer
   `cdnjs.cloudflare.com`/`fonts.googleapis.com`/`fonts.gstatic.com` de
   `script-src`/`style-src`/`font-src`/`connect-src`), revalider 0 requête
   externe et 0 violation CSP avec un test qui couvre aussi le service
   worker, et corriger les trois imprécisions du README (jsPDF, `fonts/`,
   `test:e2e`).
3. Élément A ou l'utilisateur : trancher la question de la licence.
