# E-critique-round2 — Élément E : PWA, dépendances externes, vie privée

Agent critique indépendant, round 2. Cible auditée : commit `eb73132`
(« Audit AAA — round 1 : critiques E/F, correction du P0 fetch SW mort »),
tête de branche `claude/audit-qualite-aaa-lmthte` au moment de cette
vérification. Toute exécution a eu lieu dans un `git worktree --detach`
isolé sur ce commit (supprimé en fin de mission) ; seul ce fichier est écrit
dans le dépôt partagé. Round précédent : `docs/audit/E-critique-round1.md`
(non modifié).

## Verdict

**AAA : oui**, avec une réserve mineure documentée (§3.3, un sous-test de
`tests/sw-worker.test.ts` ne peut structurellement pas détecter la mutation
qu'il prétend couvrir — les deux autres tests du même fichier la détectent
bien, donc la régression réelle reste couverte, mais ce sous-test précis
devrait être corrigé).

Le P0 du round 1 (service worker contactant réellement
`fonts.googleapis.com` à l'installation) est corrigé et vérifié disparu par
la même méthode indépendante qu'au round 1 (proxy MITM voyant tout le trafic
sortant du navigateur, y compris les `CONNECT` émis par le service worker
lui-même). Le cycle SW install→activate→offline→reload fonctionne toujours
intégralement. L'arbitrage sur le poids du bundle (D24, pas de chargement
différé de jsPDF) est un compromis techniquement solide et honnêtement
documenté, pas un renoncement caché — je suis d'accord avec cette décision,
détail en §2.

---

## 1. Preuve indépendante que le P0 du round 1 est corrigé

### 1.1 Lecture du code corrigé

`src/sw-worker.ts` (état `eb73132`) : `FONT_CSS_URLS`, `FONT_HOSTS`,
`FONTS_CACHE` et la branche `fetch` dédiée à Google Fonts ont disparu
intégralement (`grep -c "googleapis\|gstatic" src/sw-worker.ts` → 0). Le
handler `install` ne fait plus qu'un seul `precache(STATIC)` (fichiers
same-origin uniquement) ; `activate` ne purge plus qu'une seule clé de cache
(`CACHE_VERSION`, l'ancien `FONTS_CACHE` a disparu du code, donc plus créé —
les éventuelles clés `st-fonts-v4` résiduelles chez d'anciens visiteurs
restent purgées par le filtre générique `k !== CACHE_VERSION`, comportement
correct).

### 1.2 Preuve empirique par proxy MITM — même méthode qu'au round 1, reproduite indépendamment

Comme au round 1, `page.on('request')`/`context.on('request')`/
`context.route('**/*')` ne peuvent structurellement pas voir un `fetch()`
émis depuis le contexte d'exécution propre du service worker (limitation
Playwright déjà démontrée au round 1). J'ai donc repris exactement le même
script `sw-proxy-probe.mjs` qu'au round 1 (Chromium lancé derrière un proxy
HTTP local qui voit tout le trafic sortant, y compris les `CONNECT` HTTPS) :
build propre (`rm -rf dist && npm run build`), chargement de la page,
`navigator.serviceWorker.ready`, 4 secondes de marge pour le `waitUntil` de
l'event `install`.

**3 exécutions consécutives, résultat identique** (méthodologie BRIEF §3.5) :

```
--- run 1 ---
CONNECT vus par le proxy: []
Requêtes HTTP en clair vers un hôte externe: []
Hôtes interdits réellement CONTACTÉS pendant install SW : AUCUN
--- run 2 ---
CONNECT vus par le proxy: []
Requêtes HTTP en clair vers un hôte externe: []
Hôtes interdits réellement CONTACTÉS pendant install SW : AUCUN
--- run 3 ---
CONNECT vus par le proxy: []
Requêtes HTTP en clair vers un hôte externe: []
Hôtes interdits réellement CONTACTÉS pendant install SW : AUCUN
```

Au round 1, le même script donnait `["fonts.googleapis.com:443"]` à 3/3.
**Le défaut a bien disparu, confirmé par la même méthode qui l'avait détecté
la première fois** — pas seulement par relecture du code.

### 1.3 Cycle SW install→activate→offline→reload : toujours intégralement fonctionnel

Reproduit moi-même de bout en bout (script repris du round 1, adapté),
build propre préalable :

```
=== PHASE 1 : première visite en ligne ===
État SW après 1er chargement : {"registered":true,"active":true,"state":"activating"}
=== PHASE 2 : rechargement en ligne (client sous contrôle du SW) ===
Client contrôlé : {"controller":true}
=== PHASE 3 : parcours en ligne (partie) ===
  Partie démarrée.
=== PHASE 4 : COUPURE RÉSEAU puis RECHARGEMENT ===
Reload hors ligne réussi : true
État page après reload offline : {"hasScoreTrack":true,"bodyLen":196875}
=== PHASE 5 : jouer + exporter un PDF, HORS LIGNE ===
  Partie déjà reprise (localStorage) : OK
  Export PDF hors ligne : téléchargé = true | en-tête %PDF- = true

=== RÉSUMÉ FINAL ===
Requêtes hôtes interdits (toutes phases) : 0
Reload OFFLINE réussi : true
Partie jouable hors ligne : true
Export PDF hors ligne réussi (%PDF- valide) : true true
```

Aucune régression sur ce point acquis dès le round 1.

### 1.4 Cohérence du reste du dépôt

- `npm run typecheck` : vert (3 programmes : app, sw, test).
- `npm run build` : vert, `dist/sw.js` passe de 2,5 Ko à **1,8 Ko** (baisse
  cohérente avec le retrait du bloc mort).
- `npx vitest run` (suite complète) : **82/82 tests verts**, 9 fichiers.
- `npm run lint` : **0 erreur** sur les fichiers du dépôt (565 avertissements
  préexistants `no-var`/style, non nouveaux, hors périmètre de ce round).
- `src/globals.d.ts` : `jspdf?: {jsPDF: any}` confirmé retiré
  (`grep -c jspdf src/globals.d.ts` → 0). Dette du round 1 soldée.

---

## 2. `vercel.json` — CSP resserrée, vérifiée réellement (pas seulement lue)

La CSP ne référence plus `cdnjs.cloudflare.com`/`fonts.googleapis.com`/
`fonts.gstatic.com` dans aucune directive
(`script-src`/`style-src`/`font-src`/`connect-src`). Revérifié moi-même (pas
seulement confiance sur la lecture du fichier) : petit serveur HTTP local
servant `dist/` avec exactement les en-têtes de `vercel.json`, écouteur
`securitypolicyviolation` posé sur le document, parcours complet (accepter
confidentialité, démarrer une partie, ouvrir le récapitulatif, exporter un
PDF) **en ligne** :

```
CSP appliquée : default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; connect-src 'self'; worker-src 'self'; manifest-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'
Export PDF (en ligne, avec CSP resserrée) : OK
Violations CSP détectées : 0
```

Le P2 annexe relevé au round 1 (CSP encore permissive malgré le retrait des
CDN) est donc traité, et vérifié sans régression fonctionnelle.

---

## 3. Mutation testing indépendant

### 3.1 `tests/recap-pdf.test.ts` — revérifié, toujours valide

Baseline : 5/5 verts. Mutation (réintroduction de `window.jspdf`/suppression
de l'import npm dans `src/recap-pdf.ts`) → **2/5 échouent**, comme au
round 1 (sortie complète capturée, mêmes deux tests en échec : garde-fou
`import { jsPDF } from 'jspdf'` et garde-fou `window.jspdf`). Restauré
immédiatement, `git diff` revérifié vide, 5/5 verts à nouveau.

### 3.2 `tests/sw-worker.test.ts` — mutation testing du nouveau fichier

Baseline : 3/3 verts. Mutation appliquée : réintroduction complète du bloc
mort tel qu'il existait avant le correctif (`FONTS_CACHE`, `FONT_CSS_URLS`,
`FONT_HOSTS`, et le second `precache(FONTS_CACHE, FONT_CSS_URLS, {mode:'cors'})`
ajouté dans le handler `install`, exactement comme dans le code d'origine
critiqué au round 1).

Résultat : **2/3 tests échouent** — les deux tests d'inspection de source
(« ne référence aucun hôte tiers connu » et « ne contient plus de
précache/branche fetch dédiée à un hôte externe ») détectent bien la
régression. Restauré immédiatement après constat, `git diff` revérifié vide,
3/3 verts à nouveau.

### 3.3 Défaut trouvé dans le test lui-même : le 3ᵉ sous-test ne peut pas détecter cette mutation précise

En isolant le 3ᵉ test (« l'installation ne demande aucune URL absolue vers
un hôte tiers », l'« exécution réelle du fichier compilé dans un bac à
sable ») avec la même mutation appliquée, **il passe** — à 5/5 exécutions
répétées (donc pas un flake, un résultat structurel). J'ai isolé la cause
exacte par un script de diagnostic exécutant le même bac à sable avec une
trace des `requestedUrls` à deux instants :

```
Immediately after await listeners.install(): requestedUrls = [... 28 chemins STATIC ...]
After awaiting the REAL captured waitUntil promise: requestedUrls = [... mêmes 28 ..., "https://fonts.googleapis.com/css2?family=Orbitron"]
```

**Cause racine** : le handler `install` réel fait
`e.waitUntil((async () => { await precache(STATIC); await precache(FONTS_CACHE, FONT_CSS_URLS); ... })())`
— la fonction *callback* elle-même (celle enregistrée par
`addEventListener`) ne `return`-e jamais cette promesse, elle la passe
seulement à `e.waitUntil(...)`. Le test fait
`await listeners.install({ waitUntil: (p) => p })` : il attend la valeur de
retour du *callback*, pas la promesse capturée par `waitUntil` — or le
callback retourne `undefined` immédiatement après avoir *lancé* le
`waitUntil`, sans attendre qu'il se résolve. Le test poursuit donc ses
assertions avant que le second `precache` (celui qui contacterait
Google Fonts) n'ait eu la moindre chance de s'exécuter, dans **toute**
mutation qui ajouterait une étape asynchrone *après* la première.

Ce n'est pas un défaut de la correction du P0 (le code réel, lui, fonctionne
comme démontré en §1.2/§1.3 par une méthode qui ne dépend pas de ce test),
mais un vrai défaut de mutation testing sur ce sous-test précis, au sens de
la règle D17 du BRIEF (« un test qui ne peut structurellement pas échouer ne
vaut rien ») — appliquée ici à un cas plus subtil qu'un test totalement inerte :
**ce sous-test échoue pour une mutation qui casse le tout premier appel
`fetch` de la chaîne (ex. dans STATIC lui-même) mais pas pour une mutation
ajoutée après**, ce qui est précisément la forme qu'avait le vrai bug du
round 1. Heureusement, les deux autres tests du même fichier (inspection de
source) couvrent cette régression de façon fiable et ne dépendent pas de ce
problème de timing — la suite dans son ensemble reste un filet valable,
mais ce sous-test spécifique ne l'est pas pour ce cas.

**Correctif suggéré pour un futur tour** (non appliqué, hors périmètre en
lecture seule de cette critique) : faire retourner au callback la promesse
capturée, par exemple en changeant la fixture `waitUntil` du test pour
stocker la promesse dans une variable externe capturée avant l'invocation,
puis l'attendre explicitement après l'appel — ou plus simplement, dans le
test, capturer `e.waitUntil` via un espion (`vi.fn(p => { captured = p; })`)
et faire `await captured` après avoir invoqué `listeners.install(...)`,
plutôt que de compter sur la valeur de retour du callback. C'est un défaut
mineur (P2) : la protection réelle contre la régression du P0 tient toujours,
portée par les deux autres tests.

---

## 4. `docs/audit/BRIEF.md` §7 D24 — l'arbitrage sur le poids du bundle est solide

Le raisonnement de D24 : le chargement différé par `import()` dynamique
n'apporterait aucun gain réel avec la chaîne de build actuelle (`esbuild`,
format IIFE, un seul fichier de sortie — pas de découpage de code sans
passer en modules ES avec `splitting: true`), et l'alternative (un second
`<script>` injecté au clic, chargé par le réseau) casserait la garantie déjà
testée d'export PDF hors ligne dès la toute première visite
(`e2e/pdf-export-offline.spec.ts` coupe le réseau juste après le tout
premier chargement, avant toute activation du service worker qui aurait pu
précacher ce second fichier).

**Vérifications indépendantes de ce raisonnement :**

- **Format IIFE et code-splitting** : confirmé exact. `esbuild` ne supporte
  le découpage de code (`splitting: true`) qu'en format `esm`, jamais en
  `iife` (documentation esbuild) — un `import()` dynamique dans un bundle
  IIFE unique reste inline dans le même fichier de sortie, esbuild ne créant
  pas de second chunk séparé : aucun gain de poids initial n'en résulterait,
  seulement une exécution différée du même code déjà téléchargé. Le
  diagnostic est juste.
- **L'alternative écartée (second `<script>` réseau au clic) est bien
  incompatible avec la garantie testée** : confirmé en relisant
  `e2e/pdf-export-offline.spec.ts` — il coupe le réseau
  (`context.setOffline(true)`) immédiatement après le tout premier
  chargement de page, avant toute navigation supplémentaire qui laisserait
  le temps au service worker de s'activer et de précacher un second
  fichier. Un `<script>` chargé à la demande échouerait donc bien à coup
  sûr dans ce scénario exact (aucune ambiguïté à vérifier par la mesure ici,
  la logique du test suffit à la démontrer).
- **Le compromis est honnêtement documenté**, pas une esquive : le
  commentaire dans `src/recap-pdf.ts` renvoie à l'arbitrage (bien que la
  référence soit erronée, voir ci-dessous), et D24 explicite l'option
  laissée ouverte pour un futur tour (migration complète vers l'ESM avec
  `splitting: true` + précache du nouveau chunk par le service worker
  **avant** la première coupure réseau possible — cohérent et correct comme
  piste, pas creux).

**Je suis d'accord avec cet arbitrage** : entre un gain de poids qui
n'existe pas dans la chaîne de build actuelle et une régression certaine
sur une garantie déjà testée (offline dès la première visite), garder
l'import statique est le bon choix *tant que le format de sortie reste
IIFE*. Je n'ai pas identifié de meilleure option que celle déjà envisagée
par D24 (migration ESM + `splitting` + précache du chunk avant coupure) pour
un futur tour — c'est la seule voie qui obtiendrait à la fois le gain de
poids et la garantie offline, et elle est correctement identifiée comme hors
de portée d'un correctif d'intégration.

**Défaut mineur trouvé dans la documentation de l'arbitrage (P2, pas
substantiel)** : le commentaire ajouté dans `src/recap-pdf.ts` renvoie à
« `docs/audit/BRIEF.md` §7 (D23) », mais **D23 est la décision sur la
correction du bloc mort SW (§1 de ce rapport), pas celle sur le poids du
bundle** — la bonne référence est **D24**. Une lecture future de ce
commentaire pointera vers la mauvaise décision. Correctif trivial suggéré
(non appliqué, périmètre en lecture seule) : remplacer « D23 » par « D24 »
dans le commentaire de `src/recap-pdf.ts`.

---

## 5. Respect du périmètre

`git show --stat eb73132` : `README.md`, `docs/audit/BRIEF.md`,
`docs/audit/E-critique-round1.md` (nouveau, ajouté par le critique — cohérent),
`docs/audit/F-critique-round1.md` (nouveau, élément F), `src/globals.d.ts`,
`src/recap-pdf.ts`, `src/sw-worker.ts`, `tests/sw-worker.test.ts`,
`vercel.json`. Tous ces fichiers sont soit dans le périmètre de l'élément E
(`src/sw-worker.ts`, `src/recap-pdf.ts`, nouveaux tests, `docs/audit/E-*.md`),
soit des fichiers d'intégration cross-cutting explicitement justifiés par la
correction du P0 partagé (E/F) trouvé indépendamment par les deux critiques
(`src/globals.d.ts` — dette signalée par E pour B, traitée ici ;
`vercel.json` — CSP, périmètre F ; `README.md` — description, périmètre F).
Aucune modification hors de ce cadre. Conforme.

---

## 6. Défauts restants (aucun bloquant pour AAA)

- **P2** — `tests/sw-worker.test.ts`, 3ᵉ sous-test : ne détecte pas une
  mutation ajoutée *après* le premier `fetch` de la chaîne d'installation
  (cf. §3.3) — à corriger en faisant attendre la promesse réellement
  capturée par `waitUntil`, pas la valeur de retour du callback. Les deux
  autres tests du fichier couvrent déjà la régression réelle : ce n'est pas
  un trou de couverture aujourd'hui, mais un test qui donnerait un faux
  sentiment de sécurité si les deux autres disparaissaient un jour.
- **P2** — `src/recap-pdf.ts` : commentaire renvoyant à tort à « D23 » au
  lieu de « D24 » pour l'arbitrage sur le poids du bundle (cf. §4).

Aucun des deux n'affecte la véracité des affirmations de confidentialité, la
robustesse du mode hors ligne, ni la sécurité — d'où le verdict AAA malgré
ces deux points, qui restent à corriger par hygiène documentaire/tests.

## 7. Commandes exécutées (traçabilité)

```
git worktree add --detach <tmp> eb73132
rm -rf dist && npm install && npm run build   # dist/sw.js 2,5 Ko → 1,8 Ko
npm run check                                  # typecheck + build, vert
npx vitest run                                 # 82/82 verts
npm run lint                                   # 0 erreur (fichiers du dépôt)
node sw-proxy-probe.mjs (×3)                   # §1.2 : 0 CONNECT interdit
node critique-e-check.mjs                      # §1.3 : cycle SW complet
node csp-check.mjs                             # §2 : 0 violation CSP
npx vitest run tests/recap-pdf.test.ts         # §3.1 : baseline + mutation + restauration
npx vitest run tests/sw-worker.test.ts (×5 isolé sur le 3e test)  # §3.2/§3.3
node diag-sw-test.mjs                          # §3.3 : diagnostic du timing waitUntil
git show --stat eb73132                        # §5
git worktree remove <tmp>
```
