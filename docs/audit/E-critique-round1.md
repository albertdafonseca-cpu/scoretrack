# E-critique-round1 — Élément E : PWA, dépendances externes, vie privée

Agent critique indépendant, round 1. Cible auditée : état intégré actuel de
la branche `claude/audit-qualite-aaa-lmthte`, commit `2456730` (« Intégration :
corrige 3 défauts d'intégration entre éléments A/D/E/F »), qui inclut le
commit propre de l'élément E `adf4b1d` (« jsPDF bundlé, auto-hébergement des
polices ») plus les correctifs de câblage appliqués depuis par D (`index.html`)
et l'orchestrateur (`build.mjs`, `cpSync('fonts','dist/fonts')`).

Toute vérification ci-dessous a été exécutée dans un `git worktree --detach`
isolé sur `2456730` (`/tmp/.../wt-critique-e`, supprimé en fin d'audit), jamais
dans `/home/user/scoretrack` (dépôt partagé, potentiellement modifié en
parallèle par d'autres agents). Seul ce fichier de verdict est écrit dans le
dépôt partagé.

## Verdict

**AAA : non.**

Le constructeur a réellement fait ce qu'il annonce pour jsPDF (CDN éliminé,
bundlé, testé) et pour l'auto-hébergement des polices (câblage D/F confirmé,
0 requête Google Fonts *depuis le document/la page*). Le test hors-ligne le
plus important (cycle SW réel install→activate→coupure réseau→rechargement→
usage complet) **passe** et le poids du bundle a bien été mesuré comme
annoncé. Mais deux défauts empêchent le verdict AAA :

- **P0 (persistant, cœur du mandat de cet élément)** : `src/sw-worker.ts`
  contacte encore réellement `fonts.googleapis.com` à chaque installation du
  service worker — code mort que l'élément E avait lui-même identifié et
  documenté comme « à supprimer une fois l'auto-hébergement câblé », mais
  qu'il n'a pas supprimé, ni revérifié après que D/F ont câblé (D18/D11 du
  journal). Ceci contredit directement le texte de politique de
  confidentialité maintenant en ligne (« ne contacte aucun serveur tiers »).
- **P1** : jsPDF est importé statiquement en tête de `src/main.ts` (via
  `src/recap-pdf.ts`), donc chargé et exécuté au tout premier affichage de
  l'app, alors qu'il n'est utilisé qu'au clic sur « exporter en PDF » depuis
  le récapitulatif de fin de partie. Mesuré : jsPDF seul pèse **798,6 Ko**
  minifié, soit **~49 % des 1 632 Ko** de `dist/app.js`. Aucun `import()`
  dynamique n'a été mis en place ; ce n'était ni fait ni même mentionné comme
  piste par le constructeur.

Voir §1 pour la preuve du P0 (la plus importante de ce round), §2 pour le
sniffing réseau complet, §3 pour le bundle, §4 pour la mutation testing, §5
pour les dettes mineures (globals.d.ts, CSP), §6 pour le respect du périmètre,
§7 pour la comparaison à l'aveugle.

---

## 1. Preuve du P0 : le service worker contacte réellement Google Fonts à l'installation

### 1.1 Pourquoi ce n'était pas visible dans les tests du constructeur

Les deux tests e2e existants (`e2e/pdf-export-offline.spec.ts`,
`e2e/fonts-self-hosted.spec.ts`) écoutent `page.on('request')` — cette API ne
capte que les requêtes émises par le document/la page, **jamais celles
émises par le service worker lui-même depuis son propre contexte d'exécution**
(ex. un `fetch()` dans le handler `install`). C'est une limitation connue de
Playwright (confirmée empiriquement ci-dessous : ni `page.on('request')`, ni
`context.on('request')`, ni `context.route('**/*')` ne voient ce trafic).
Aucun des deux tests existants n'exerce non plus le cycle complet
install→activate→**reload**→offline : ils font un seul chargement de page
puis coupent le réseau *dans la même session*, sans jamais recharger — donc
sans jamais forcer une installation fraîche du SW à observer.

### 1.2 Lecture du code : le fetch mort est toujours là

`src/sw-worker.ts`, handler `install` (état actuel du dépôt, inchangé depuis
le commit `adf4b1d` de l'élément E lui-même — vérifié : `git log --oneline --
src/sw-worker.ts` ne montre aucun commit après `adf4b1d`) :

```ts
const FONT_CSS_URLS = [
  'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=Share+Tech+Mono&family=Inter:wght@400;600;700;800&family=Press+Start+2P&family=Cinzel:wght@400;600;700&family=Bebas+Neue&family=Ballet&family=Permanent+Marker&family=Dancing+Script:wght@600;700&display=swap',
];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
...
sw.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    await precache(await caches.open(CACHE_VERSION), STATIC);
    // 2. Filet de sécurité Google Fonts (cache séparé, tant que non retiré — voir FONT_CSS_URLS)
    await precache(await caches.open(FONTS_CACHE), FONT_CSS_URLS, { mode: 'cors' });
    await sw.skipWaiting();
  })());
});
```

`DECISIONS-E.md` §2.3/§5 dit explicitement : *« Une fois l'auto-hébergement en
place, ce bloc (FONT_CSS_URLS/FONT_HOSTS et la branche fetch "Polices Google")
devient mort et doit être supprimé »*. L'auto-hébergement **est** en place
(`index.html` ne référence plus que `./fonts/fonts.css`, confirmé par
`grep -n "googleapis\|gstatic\|cdnjs" index.html` → aucune occurrence). Le
bloc mort n'a pourtant **pas** été supprimé, et personne (E, D, F, ni
l'intégration `2456730`) ne l'a fait depuis.

### 1.3 Preuve empirique par proxy MITM (méthode indépendante des limites de Playwright)

Ni `page.on('request')`, ni `context.on('request')`, ni `context.route('**/*')`
ne remontent la requête du service worker (vérifié : les trois donnent 0 hit
sur `googleapis`/`gstatic` malgré le code ci-dessus). J'ai donc placé
Chromium derrière un proxy HTTP local (`chromium.launch({proxy:{server:...}})`)
qui voit **tout** le trafic sortant du process navigateur, y compris les
`CONNECT` (tunnel HTTPS) — sans avoir besoin de déchiffrer le contenu, la
simple demande de `CONNECT host:443` suffit à prouver la tentative de contact.

Script (`sw-proxy-probe.mjs`, worktree isolé) : sert `dist/` en HTTP local,
charge la page, attend `navigator.serviceWorker.ready`, attend 4 s (marge
large pour le `waitUntil` de l'event `install`), relève les `CONNECT` vus par
le proxy. **3 exécutions consécutives, résultat identique** (méthodologie
BRIEF §3.5) :

```
--- CONNECT (HTTPS) vus par le proxy pendant install+ready+attente ---
[
  "fonts.googleapis.com:443"
]
Hôtes interdits réellement CONTACTÉS (CONNECT émis) pendant install SW : [ 'fonts.googleapis.com:443' ]
```
(run 1, run 2, run 3 : même résultat, `fonts.googleapis.com:443` à chaque
fois, 0 exception.)

Ce `CONNECT` a lieu **en ligne**, à chaque première installation du service
worker (et à chaque mise à jour de version, `CACHE_VERSION` changeant). Le
navigateur de l'utilisateur tente donc réellement d'ouvrir une connexion vers
un serveur Google à ce moment précis — avant même que la page n'ait affiché
quoi que ce soit d'utile — exactement la classe de défaut (fuite non déclarée
vers un tiers) que le P0 originel de l'audit visait à éliminer. Que la requête
aboutisse ou échoue selon le réseau réel ne change rien : l'IP et le
user-agent du visiteur sont exposés à Google dès la tentative de connexion.

### 1.4 Conséquence sur le texte de politique de confidentialité

`src/i18n/translations.ts` (élément D, D19), 18 langues, ex. français
(`privacyIntro`) :

> « ScoreTrack ne collecte, ne suit ni ne transmet aucune donnée
> personnelle — **et ne contacte aucun serveur tiers** : polices de
> caractères et export PDF sont livrés avec l'application elle-même, y
> compris hors ligne dès la toute première ouverture. »

Cette affirmation est **fausse** dans l'état actuel du dépôt, pour la raison
prouvée en §1.3. C'est exactement le type de défaut (politique de
confidentialité inexacte) que le P0 originel de l'audit visait à corriger —
il n'a pas disparu, il a changé d'endroit (d'`index.html`/CDN vers le service
worker).

### 1.5 Preuve que le cycle SW install→activate→offline→reload, lui, fonctionne réellement

C'est le test demandé en premier lieu par la mission — reproduit moi-même de
bout en bout (`critique-e-check.mjs`, worktree isolé, build propre
`rm -rf dist && npm run build` préalable) :

1. **Phase 1** — première visite en ligne : `navigator.serviceWorker.ready`
   résout, SW actif (`state:"activating"` puis actif après la marge d'attente).
2. **Phase 2** — rechargement en ligne pour que le client passe sous contrôle
   du SW (`navigator.serviceWorker.controller` devient vrai — un premier
   chargement n'est jamais contrôlé par le SW qui vient de s'installer, c'est
   un comportement standard du spec Service Worker, pas un bug).
3. **Phase 3** — parcours en ligne : acceptation de la confidentialité,
   démarrage d'une partie (preset + noms).
4. **Phase 4** — `context.setOffline(true)` puis **rechargement complet de la
   page** hors ligne : réussi (`Reload hors ligne réussi : true`), page
   effectivement rendue (`hasScoreTrack: true`, `bodyLen: 196875`), partie en
   cours retrouvée depuis `localStorage` (`.pcard .score` visible).
5. **Phase 5** — hors ligne, après le rechargement : `showRecap()` puis
   export PDF via le bouton réel de l'UI (`#btn-pdf-dl`) → téléchargement
   réel intercepté par Playwright, fichier lu, **en-tête `%PDF-` confirmé**.

```
Reload hors ligne réussi : true
Partie jouable hors ligne : true
Export PDF hors ligne réussi (fichier %PDF- valide) : true true
Requêtes vers hôtes interdits (cdnjs/googleapis/gstatic), TOUTES phases (page/context) : 0
```

Ce point précis (fonctionnement complet hors ligne dès l'installation) est
donc **confirmé et non un point de désaccord** avec le constructeur — la
preuve fournie par l'élément E pour `jsPDF`/l'auto-hébergement était réelle.
Le défaut P0 relevé en §1 est ailleurs : une requête *sortante* que ni le
constructeur ni ses propres tests n'ont détectée parce qu'elle échappe aux
API haut niveau de Playwright habituellement utilisées pour ce genre de
preuve — pas un problème avec le mécanisme offline lui-même.

---

## 2. Sniffing réseau complet, en ligne et hors ligne

Hôtes interdits testés : `cdnjs.cloudflare.com`, `fonts.googleapis.com`,
`fonts.gstatic.com`.

- Via `page.on('request')`/`context.on('request')`/`context.route('**/*')`
  (couvre tout trafic initié par le document, y compris changement de
  langue, démarrage de partie, export PDF, chargement initial) : **0**
  requête vers un hôte interdit, sur 3 exécutions.
- Via proxy MITM (couvre en plus le trafic initié directement par le service
  worker, cf. §1) : **1** hôte interdit contacté (`fonts.googleapis.com:443`,
  au moment de l'installation du SW), reproductible à 3/3.

Donc : le point 2 de la mission (« aucune requête vers ces hôtes ne part
JAMAIS ») **échoue**, uniquement à cause du service worker, pas de la page.
Un audit qui se limiterait aux API `page.on('request')` (ce qu'a fait le
constructeur) conclurait à tort que ce point est acquis.

---

## 3. Taille du bundle — mesure et défaut de chargement différé confirmé

- `dist/app.js` mesuré après `rm -rf dist && npm run build` propre :
  **1 642 170 octets** (≈ 1 604 KiB, cohérent avec les « 1 633 Ko » rapportés
  par le constructeur — écart d'arrondi Ko/Kio négligeable).
- Poids de jsPDF seul (mesuré en bundlant isolément
  `import { jsPDF } from 'jspdf'; export { jsPDF };` avec la même config
  esbuild — bundle, minify, iife) : **817 735 octets (798,6 Ko)**, soit
  **≈ 49,8 %** du poids total de `dist/app.js`.
- Poids de `three` seul, mesuré de la même façon : 603 747 octets (589,6 Ko),
  ≈ 36,8 % du bundle.
- Reste (code applicatif propre : `game.ts`, 18 langues de traductions,
  moteur de dés, i18n, animations, etc.) : ≈ 13,4 % du bundle.

**`import { jsPDF } from 'jspdf'` est un import statique en tête de
`src/recap-pdf.ts`, et `src/main.ts` importe `recap-pdf` statiquement aussi**
(`import * as recapPdf from './recap-pdf'`, ligne 9). jsPDF n'est utilisé que
par `exportRecapPDF()`, appelée uniquement au clic sur le bouton PDF du
récapitulatif de fin de partie — un chemin minoritaire et tardif dans
l'usage de l'app, jamais nécessaire au chargement initial. Aucun `import()`
dynamique n'a été mis en place : **la moitié du poids du bundle initial sert
une fonctionnalité que la majorité des sessions n'utilisera jamais au premier
affichage.**

C'est un vrai défaut de performance (pas de sécurité/confidentialité), à
traiter en P1 pour un futur tour : remplacer l'import statique par un
`import('./recap-pdf')` déclenché uniquement au clic sur le bouton d'export
PDF (le bouton existe déjà dans le DOM, indépendamment du module JS qui le
sert — le découplage est direct). Gain attendu : ~800 Ko retirés du chemin
de chargement initial, sans toucher au rendu du PDF lui-même. Seule
l'API utilisée par `recap-pdf.ts` (texte, rectangles, lignes, pagination —
pas d'images, pas de formulaires, pas d'unicode avancé, vérifié par
`grep -oE "doc\.[a-zA-Z]+\(" src/recap-pdf.ts`) ne justifie de toute façon
pas d'inclure jsPDF au complet dans le chemin critique, même si jsPDF ne
propose pas nativement un sous-module « core seul » à importer séparément
(vérifié : un seul point d'entrée `jspdf`, pas de sous-chemin documenté pour
un sous-ensemble de fonctionnalités) — le chargement différé reste donc la
seule optimisation disponible et suffisante.

Ce point n'a pas été traité, ni même évoqué comme option, ni comme dette
explicite par le constructeur (`DECISIONS-E.md` ne mentionne jamais
`import()` dynamique).

---

## 4. Mutation testing indépendant sur `tests/recap-pdf.test.ts`

Baseline : `npx vitest run tests/recap-pdf.test.ts` → **5/5 verts**.

Mutation appliquée à `src/recap-pdf.ts` (réintroduction du garde-fou CDN
d'origine) :

```diff
-import { jsPDF } from 'jspdf';
+// MUTATION DE TEST (critique E, round 1)
+if (!window.jspdf) { console.warn('jsPDF non chargé'); }
+const jsPDF = window.jspdf!.jsPDF;
```

Résultat : **2/5 tests échouent** (celui qui exige
`import { jsPDF } from 'jspdf'` et celui qui interdit `window.jspdf`) —
confirmé, sortie complète capturée. Le test n'est donc pas structurellement
incapable d'échouer (règle D17/BRIEF §3.2 respectée pour ce fichier
précisément). Mutation restaurée immédiatement après constat
(`cp` depuis une sauvegarde), `git diff` revérifié vide dans le worktree
isolé après restauration, tests re-vérifiés verts (5/5).

**Limite relevée** : ce test ne couvre que `src/recap-pdf.ts` — il ne
détecte à aucun moment le défaut du §1 (`src/sw-worker.ts` contactant
`fonts.googleapis.com`). Aucun test, unitaire ou e2e, du dépôt actuel ne
couvre ce fichier pour cette régression précise. Une mutation testing sur ce
point (retirer le bloc `FONT_CSS_URLS`/`FONT_HOSTS` mort) n'a pu être
tentée : il n'existe rien à casser puisqu'aucun test ne l'exerce.

---

## 5. Dettes mineures

### 5.1 `src/globals.d.ts` — `jspdf?: {jsPDF: any}` toujours présent

Confirmé non traité : `git log --oneline -- src/globals.d.ts` ne montre
aucun commit après la migration TypeScript initiale (`ba25f05`) — l'élément
B n'a pas retiré cette déclaration devenue obsolète, comme l'élément E le lui
avait signalé en `DECISIONS-E.md` §6 point 4. Dette mineure (P2), non
bloquante en soi (`any` mort, aucun code ne le lit), mais elle entretient une
confusion : elle laisse croire qu'un chemin `window.jspdf` existe encore, ce
qui est trompeur au vu du défaut réel trouvé en §1 (qui, lui, concerne le
service worker, pas cette déclaration de type).

### 5.2 `vercel.json` — CSP non resserrée malgré le retrait des CDN

`connect-src`/`script-src`/`style-src`/`font-src` de la CSP actuelle
autorisent encore explicitement `cdnjs.cloudflare.com`,
`fonts.googleapis.com` et `fonts.gstatic.com`, alors que `DECISIONS-E.md` §6
notait que ce resserrement deviendrait possible une fois §1/§2 câblés (ce qui
est le cas). Hors périmètre strict de l'élément E (`vercel.json` appartient à
l'élément F), mais cette CSP encore permissive est une circonstance
aggravante pour le défaut du §1 : elle n'offre aucune défense en profondeur
contre la connexion sortante du service worker documentée ci-dessus — une
CSP resserrée (`connect-src 'self'`) n'aurait pas empêché la tentative de
`CONNECT` TCP/TLS elle-même (la CSP ne s'applique qu'aux requêtes du contexte
document/fetch, pas de façon garantie à toutes les requêtes internes du
service worker selon la même sémantique), mais son maintien large est un
signal que personne n'a encore vérifié bout en bout que ces trois hôtes sont
réellement injoignables une fois §1/§2 terminés — ce qui est faux, cf. §1.
À signaler à l'élément F pour un futur tour, sans le lui imputer : la cause
racine est dans `src/sw-worker.ts` (élément E), pas dans `vercel.json`.

---

## 6. Respect du périmètre initial (`git show --stat adf4b1d`)

Fichiers touchés par le commit propre de l'élément E : `docs/audit/BRIEF.md`,
`docs/audit/DECISIONS-E.md`, `e2e/pdf-export-offline.spec.ts`, 25 fichiers
`fonts/*.woff2` + `fonts/fonts.css`, `package-lock.json`, `src/recap-pdf.ts`,
`src/sw-worker.ts`, `tests/recap-pdf.test.ts`. Conforme au contrat de
propriété (BRIEF §5, élément E) et à la note de périmètre explicite de
l'élément lui-même pour `/fonts/` (nouveau répertoire, aucune collision
déclarée). **Aucune modification d'`index.html` ni de `build.mjs` dans ce
commit** — confirmé, le constructeur a bien respecté l'interdiction qu'il
s'était lui-même fixée et documenté précisément ce qui restait à faire
ailleurs. Ce point est acquis, sans réserve.

---

## 7. Comparaison à l'aveugle contre une PWA de référence

Une PWA grand public de référence (compteur de score / lanceur de dés,
jeu ou utilitaire) garantit typiquement : (a) fonctionnement hors ligne
complet dès la première visite, (b) chargement initial rapide y compris sur
connexion lente, (c) aucune fuite de vie privée non déclarée, même
accidentelle/technique.

- (a) est acquis pour ScoreTrack (§1.5, preuve reproduite moi-même).
- (b) échoue : un bundle initial de 1,6 Mo dont la moitié sert une
  fonctionnalité non utilisée à l'ouverture (export PDF) est loin du standard
  d'une PWA optimisée grand public, où le JS critique du premier écran vise
  généralement quelques centaines de Ko.
- (c) échoue : une connexion sortante non déclarée vers un tiers (Google) à
  chaque installation du service worker est précisément le genre de défaut
  qu'une PWA professionnelle de référence ne laisserait pas subsister,
  surtout après avoir explicitement annoncé l'avoir éliminé.

**ScoreTrack ne gagne pas la comparaison sur ces deux critères.** Sur (a)
seul, il serait à égalité ; (b) et (c) le placent en dessous.

---

## 8. Défauts à corriger (actionnables pour le prochain tour)

- **P0** — `src/sw-worker.ts` : supprimer intégralement `FONT_CSS_URLS`,
  `FONT_HOSTS`, le second `precache(...)` du handler `install` (bloc
  « Filet de sécurité Google Fonts »), et la branche `fetch` associée
  (`if (FONT_HOSTS.includes(url.hostname)) {...}`) — code mort déjà identifié
  par l'élément E lui-même mais jamais retiré. Revérifier avec la même
  méthode qu'en §1.3 (proxy MITM + `CONNECT`, 3 exécutions identiques) que
  plus aucun `CONNECT` vers `fonts.googleapis.com`/`fonts.gstatic.com` ne se
  produit à l'installation. Ajouter un test qui l'aurait détecté (inspection
  de source de `src/sw-worker.ts`, sur le modèle de
  `tests/recap-pdf.test.ts` : `expect(swWorkerSource).not.toMatch(/fonts\.googleapis\.com/)`)
  puisque page.on('request') ne suffit structurellement pas à couvrir ce cas
  (cf. §1.1) — un test e2e seul ne peut pas être le seul filet ici.
- **P1** — Chargement différé de jsPDF : remplacer l'import statique de
  `src/recap-pdf.ts` par `import('./recap-pdf')` (ou équivalent) déclenché
  au clic sur le bouton d'export PDF, pas au chargement initial de l'app.
  Mesurer avant/après la taille du chunk initial (`dist/app.js` hors le
  chunk différé) pour prouver le gain (~800 Ko attendus).
- **P2** — `src/globals.d.ts` : retirer `jspdf?: {jsPDF: any}` sur `Window`,
  devenu obsolète (élément B, signalé depuis le round précédent, toujours en
  attente).
- **P2** — `vercel.json` : une fois le P0 ci-dessus corrigé, resserrer la CSP
  (`connect-src`/`script-src`/`style-src`/`font-src`) en retirant
  `cdnjs.cloudflare.com`/`fonts.googleapis.com`/`fonts.gstatic.com`, et
  revérifier 0 violation `securitypolicyviolation` (élément F).

## 9. Commandes exécutées (traçabilité)

```
git worktree add --detach <tmp> 2456730
rm -rf dist && npm install && npm run build
node critique-e-check.mjs        # cycle SW install→activate→offline→reload, §1.5/§2
node sw-proxy-probe.mjs (×3)      # preuve CONNECT fonts.googleapis.com, §1.3
node sw-fetch-probe.mjs           # démonstration que context.route() ne voit rien, §1.1
npx esbuild jspdf-entry.mjs ...   # poids isolé de jsPDF, §3
npx esbuild three-entry.mjs ...   # poids isolé de three, §3
npx vitest run tests/recap-pdf.test.ts   # baseline + mutation + restauration, §4
git show --stat adf4b1d           # périmètre, §6
git log --oneline -- src/sw-worker.ts src/globals.d.ts   # non-modification depuis, §1.2/§5.1
git worktree remove <tmp>
```
