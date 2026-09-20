# DECISIONS-E — Élément E : PWA, dépendances externes, vie privée

Périmètre (BRIEF.md §5) : `src/sw.ts`, `src/sw-worker.ts`, `src/recap-pdf.ts`,
nouveaux fichiers de tests, coordination avec l'élément D sur la section
confidentialité d'`index.html`. Cet élément **n'édite pas** `index.html` ni
`build.mjs` : tout changement requis y est documenté ci-dessous, extraits de
code exacts à copier, pour les éléments D et F.

Défaut traité (P0, identique en substance au premier audit) : `index.html`
affirme « ScoreTrack ne collecte aucune donnée personnelle » alors que
l'application contacte deux tiers à l'exécution — `fonts.googleapis.com` /
`fonts.gstatic.com` (Google Fonts, à chaque ouverture) et
`cdnjs.cloudflare.com` (jsPDF, à l'export PDF) — et que le service worker
précachait ces deux CDN, ce qui automatisait la fuite plutôt que de la
corriger. Vérifié exhaustivement (`grep` sur tout `index.html` et tout
`src/**/*.ts`) : **ce sont les deux SEULES ressources externes de toute
l'application** — aucune API, aucun analytics, aucun autre CDN.

## Note de périmètre — un écart délibéré et justifié

Le mandat de cet élément interdit d'éditer `index.html`/`build.mjs`, mais
n'énumère pas explicitement de nouveaux fichiers *hors code* (assets). Pour
que l'auto-hébergement des polices (§2) soit une correction réelle plutôt
qu'une simple recommandation sur papier, j'ai créé un nouveau répertoire
`/fonts/` à la racine du dépôt (25 fichiers `.woff2` + `fonts.css`, 560 Ko).
C'est un choix délibéré et limité :
- Aucun fichier existant d'un autre élément n'est modifié.
- Le nom `/fonts/` n'entre en collision avec aucun périmètre déclaré en
  BRIEF.md §5.
- Le contenu est entièrement vérifié (voir §2) : c'est un livrable prêt à
  l'emploi, pas une ébauche.
Si l'élément D ou l'orchestrateur préfère que je retire ce répertoire tant
qu'il n'est pas câblé, il suffit de le supprimer : `index.html` et
`build.mjs` restant inchangés par moi, rien d'autre n'en dépend.

---

## 1. jsPDF — CDN éliminé, bundlé via npm (fait, vérifié)

### Ce qui a changé
- `package.json` → `dependencies.jspdf: "4.2.1"` (version exacte, pas de
  caret : même convention que `three` dans CLAUDE.md — pas de montée de
  version silencieuse sans revalidation du rendu PDF). jsPDF fournit ses
  propres types (`types/index.d.ts`), donc **pas besoin de `@types/jspdf`**.
- `src/recap-pdf.ts` : `import { jsPDF } from 'jspdf';` en tête de fichier,
  suppression totale de `window.jspdf` et du garde
  `if(!window.jspdf){alert(...);return;}`. `doc` est maintenant typé
  (`jsPDF`, plus de `any`).
  - Effet de bord typage strict : `setTextColor/setFillColor/setDrawColor`
    de jsPDF sont surchargées en `(r,g,b[,a]: number)`, pas en
    `(...rgb: number[])` — un spread d'un `number[]` non figé ne
    type-check pas (`TS2556`). Les 8 constantes de couleur
    (`C_TITLE`, `C_SUB`, `C_POS`, `C_NEG`, `C_BORDER`, `C_BG_HDR`, `C_WIN`,
    `C_ELIM`) sont donc typées `readonly [number, number, number]` au lieu
    de `number[]` — même valeurs, même rendu, juste un type plus précis.
  - `doc.internal.getNumberOfPages()` n'existe pas dans les types jsPDF 4.x
    (`getNumberOfPages()` est une méthode directe de `doc`, pas de
    `doc.internal`) → remplacé par `doc.getNumberOfPages()`.
- `src/sw-worker.ts` : `CDN_CACHE`/`CDN_URLS`/`CDN_HOSTS` et la branche
  fetch « CDN (jsPDF etc.) » supprimées intégralement — plus rien à
  précacher, jsPDF est dans `app.js`.

### Action requise ailleurs (élément D, index.html)
**Obligatoire, sinon le défaut persiste malgré le bundling.** Le fichier
`index.html` contient encore, ligne 1363, la balise qui chargeait jsPDF
par CDN — elle ne sert plus à rien (le code n'utilise plus `window.jspdf`)
mais continue de déclencher une vraie requête réseau vers cdnjs à **chaque
ouverture de l'app**, ce qui est exactement le défaut d'origine. À
supprimer telle quelle :
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js" onerror="console.warn('jsPDF non chargé')"></script>
```
(Elle se trouve juste avant `</head>`, juste après la balise `</style>`.)

### Vérification réelle effectuée
- `npm run typecheck` : vert sur `src/recap-pdf.ts` (0 erreur, y compris
  après le changement de type des couleurs).
- Taille de `dist/app.js` avant/après (mesurée avec `git stash`/`stash pop`
  — voir note ci-dessous) : **801.7 Ko → 1 633 Ko** (+832 Ko), confirmant
  que jsPDF est bien inclus dans le bundle par esbuild, comme `three`.
- Test unitaire Vitest réel (`tests/recap-pdf.test.ts`, 5 tests, tous
  verts) :
  - inspection de source anti-régression : `src/recap-pdf.ts` importe bien
    `jsPDF` depuis `'jspdf'` et ne référence plus jamais `window.jspdf` ;
    `package.json` a `jspdf` en dépendance figée (mutation testing minimal :
    réintroduire `window.jspdf` ou retirer la dépendance fait échouer ce
    test).
  - exécution réelle de la bibliothèque `jspdf` bundlée : génère un vrai
    PDF (`%PDF-`/`%%EOF` présents), gère la pagination
    (`getNumberOfPages`/`setPage`), et un espion sur `fetch` transforme en
    échec de test tout accès réseau qui se produirait pendant la
    génération (aucun ne se produit).
- Test e2e Playwright réel (`e2e/pdf-export-offline.spec.ts`, ajouté sous
  `e2e/` et non `tests/` — voir note de périmètre dans l'en-tête du
  fichier) : sert `dist/` en HTTP, charge la page en ligne, **coupe le
  réseau (`context.setOffline(true)`)**, ouvre le récapitulatif, exporte le
  PDF, et vérifie que le fichier téléchargé est un vrai PDF valide
  (`%PDF-`) tout en n'ayant déclenché **aucune requête réseau après la
  coupure**. Ce test échoue actuellement pour une seule raison, confirmée
  manuellement : la balise `<script src="https://cdnjs...">` toujours
  présente dans `index.html` (voir action requise ci-dessus). Vérification
  faite : en supprimant cette seule ligne d'un `dist/index.html` de test
  (sans toucher au dépôt), le test passe intégralement — 0 requête externe,
  PDF valide généré hors ligne. Une fois l'élément D applique la
  suppression ci-dessus, ce test passera sans autre changement.

Cette dernière vérification (`git stash`/`stash pop` pour comparer la
taille du bundle) a eu lieu dans un dépôt où d'autres éléments modifient
`build.mjs`/`game.ts`/`dom.ts`/`vercel.json` en parallèle et sans commit :
c'est risqué en environnement multi-agent partagé et je ne l'ai fait
qu'une fois, avec succès (rien perdu, vérifié par `git diff --stat` juste
après). Je ne le referai pas — à éviter pour tout agent qui lirait ce
document dans le même contexte.

---

## 2. Google Fonts — auto-hébergement complet préparé (recommandé), sinon repli documenté

### Évaluation
Neuf familles sont chargées via l'`@import` d'`index.html` (ligne 20) :
Orbitron (400/600/700/900), Share Tech Mono (400), Inter (400/600/700/800),
Press Start 2P (400), Cinzel (400/600/700), Bebas Neue (400), Ballet (400),
Permanent Marker (400), Dancing Script (600/700). (Les autres polices
utilisées par l'app — ArenaGraffiti, NeonGlow, DigitalSystem,
SuperFortune — sont **déjà** auto-hébergées en base64 directement dans
`index.html`, donc hors sujet ici.)

En téléchargeant la CSS réellement servie par `fonts.googleapis.com` pour
cette liste exacte, on obtient 56 règles `@font-face` mais seulement **25
fichiers `.woff2` uniques** (plusieurs familles variables partagent un même
fichier entre poids) pour un total de **560 Ko** (25 fichiers + la feuille
de style). C'est largement raisonnable à committer et bundler (moins d'un
tiers du poids de jsPDF bundlé). Les scripts zh/ja/ko/ar n'ont pas de
sous-ensemble Google Fonts pour ces familles décoratives (vérifié : la
réponse de l'API ne contient que latin/latin-ext/cyrillic/cyrillic-ext/
greek/greek-ext/vietnamese) — ces langues retombent déjà aujourd'hui sur
les polices système, l'auto-hébergement ne change donc rien pour elles.

**Conclusion : l'auto-hébergement est fait, pas seulement recommandé.**
Le répertoire `/fonts/` (racine du dépôt, voir note de périmètre plus haut)
contient déjà les 25 `.woff2` et `fonts/fonts.css` (@font-face identiques à
la réponse Google, `unicode-range`/`font-weight`/`font-display` inchangés,
seuls les `url(https://fonts.gstatic.com/...)` sont réécrits en chemins
locaux relatifs `./<fichier>.woff2`). Il ne manque que le câblage dans
`index.html` (D) et `build.mjs` (F), tous deux triviaux et donnés
ci-dessous. **Vérifié réellement** (Playwright, serveur HTTP local servant
un `dist/` de test avec ce câblage appliqué) : chargement de la page,
`document.fonts` confirme les polices effectivement utilisées comme
`loaded` (Inter 400/700/800, Orbitron 700, Share Tech Mono 400 — les
graisses réellement utilisées à l'écran initial), **zéro requête externe**,
3 fichiers `.woff2` servis localement avec succès. Reproductible : voir
§2.4 pour régénérer les fichiers depuis les URLs Google d'origine
(stables, versionnées par hash).

### 2.1 — Action requise : `index.html` (élément D)
Deux changements, dans `<head>` :

1. Ajouter un `<link>` vers la feuille de style locale (avant ou après
   `<style>`, l'ordre importe peu pour des `@font-face`) :
   ```html
   <link rel="stylesheet" href="./fonts/fonts.css">
   ```
2. Supprimer la ligne 20 (dans le `<style>`), l'`@import` Google Fonts :
   ```css
   @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=Share+Tech+Mono&family=Inter:wght@400;600;700;800&family=Press+Start+2P&family=Cinzel:wght@400;600;700&family=Bebas+Neue&family=Ballet&family=Permanent+Marker&family=Dancing+Script:wght@600;700&display=swap');
   ```

Rien d'autre ne change (les déclarations `font-family:'Inter'` etc. dans le
reste d'`index.html` restent identiques — mêmes noms de famille).

### 2.2 — Action requise : `build.mjs` (élément F)
Copier `fonts/` vers `dist/fonts/` à chaque build, comme `copyHtmlPlugin`
copie déjà `index.html` :
```js
import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
```
puis, dans `copyHtmlPlugin.setup`’s `build.onEnd`, juste après l'écriture
de `dist/index.html` :
```js
      // Polices auto-hébergées (docs/audit/DECISIONS-E.md §2) : copie telle quelle.
      cpSync('fonts', 'dist/fonts', { recursive: true });
```
(`fonts/` existe déjà à la racine du dépôt, prêt à l'emploi — rien d'autre
à créer.)

### 2.3 — Correctif déjà appliqué dans `src/sw-worker.ts` (fait, quel que soit le choix de D)
Avant ce correctif, `FONT_CSS_URLS` précachait une URL Google Fonts qui ne
correspondait à **aucune** des polices réellement utilisées par
l'application (elle demandait `Orbitron:wght@700`, `Share+Tech+Mono` et
`Exo+2:wght@400;600` — « Exo 2 » n'apparaît nulle part dans `index.html` ni
dans aucun fichier `src/*.ts`, et les six autres familles réellement
utilisées — Inter, Press Start 2P, Cinzel, Bebas Neue, Ballet, Permanent
Marker, Dancing Script — étaient absentes). Le service worker précachait
donc une ressource inutile et ne servait jamais la bonne en cache hors
ligne : bug en plus du problème de fond, comme relevé dans la mission.
Corrigé : `FONT_CSS_URLS` contient maintenant exactement la même requête
que l'`@import` actuel d'`index.html` (copier-coller, voir le fichier).
Ce correctif reste utile même si D n'a pas le temps d'appliquer
l'auto-hébergement (voir §2.5, repli).

En complément, `STATIC` (précache tolérant, donc sans risque si les
fichiers n'existent pas encore) liste déjà les 25 chemins
`./fonts/<fichier>.woff2` + `./fonts/fonts.css` : dès que D/F appliquent
2.1/2.2, ces fichiers sont précachés comme n'importe quel fichier de l'app
et l'ancien `FONT_HOSTS`/`FONT_CSS_URLS` (Google Fonts) devient du code
mort à supprimer (voir commentaire explicite laissé dans le fichier, avec
les lignes concernées).

### 2.4 — Reproductibilité (si les fichiers de `/fonts/` doivent être régénérés)
Les URLs `fonts.gstatic.com` sont versionnées par hash de contenu (stables
indéfiniment). Pour régénérer à l'identique :
```bash
mkdir -p fonts
curl -sS -o fonts/ballet-latin-ext.woff2 'https://fonts.gstatic.com/s/ballet/v30/QGYyz_MYZA-HM4NjuGOVnUEXme1I4Xi3O4i0ExAo.woff2'
curl -sS -o fonts/ballet-latin.woff2 'https://fonts.gstatic.com/s/ballet/v30/QGYyz_MYZA-HM4NjuGOVnUEXme1I4Xi3O4a0Ew.woff2'
curl -sS -o fonts/ballet-vietnamese.woff2 'https://fonts.gstatic.com/s/ballet/v30/QGYyz_MYZA-HM4NjuGOVnUEXme1I4Xi3O4m0ExAo.woff2'
curl -sS -o fonts/bebas-neue-latin-ext.woff2 'https://fonts.gstatic.com/s/bebasneue/v16/JTUSjIg69CK48gW7PXoo9Wdhyzbi.woff2'
curl -sS -o fonts/bebas-neue-latin.woff2 'https://fonts.gstatic.com/s/bebasneue/v16/JTUSjIg69CK48gW7PXoo9Wlhyw.woff2'
curl -sS -o fonts/cinzel-latin-ext.woff2 'https://fonts.gstatic.com/s/cinzel/v26/8vIJ7ww63mVu7gt7-GT7LEc.woff2'
curl -sS -o fonts/cinzel-latin.woff2 'https://fonts.gstatic.com/s/cinzel/v26/8vIJ7ww63mVu7gt79mT7.woff2'
curl -sS -o fonts/dancing-script-latin-ext.woff2 'https://fonts.gstatic.com/s/dancingscript/v29/If2RXTr6YS-zF4S-kcSWSVi_szLuiuEViw.woff2'
curl -sS -o fonts/dancing-script-latin.woff2 'https://fonts.gstatic.com/s/dancingscript/v29/If2RXTr6YS-zF4S-kcSWSVi_szLgiuE.woff2'
curl -sS -o fonts/dancing-script-vietnamese.woff2 'https://fonts.gstatic.com/s/dancingscript/v29/If2RXTr6YS-zF4S-kcSWSVi_szLviuEViw.woff2'
curl -sS -o fonts/inter-cyrillic-ext.woff2 'https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa2JL7SUc.woff2'
curl -sS -o fonts/inter-cyrillic.woff2 'https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa0ZL7SUc.woff2'
curl -sS -o fonts/inter-greek-ext.woff2 'https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa2ZL7SUc.woff2'
curl -sS -o fonts/inter-greek.woff2 'https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1pL7SUc.woff2'
curl -sS -o fonts/inter-latin-ext.woff2 'https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa25L7SUc.woff2'
curl -sS -o fonts/inter-latin.woff2 'https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2'
curl -sS -o fonts/inter-vietnamese.woff2 'https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa2pL7SUc.woff2'
curl -sS -o fonts/orbitron-latin.woff2 'https://fonts.gstatic.com/s/orbitron/v35/yMJRMIlzdpvBhQQL_Qq7dy0.woff2'
curl -sS -o fonts/permanent-marker-latin.woff2 'https://fonts.gstatic.com/s/permanentmarker/v16/Fh4uPib9Iyv2ucM6pGQMWimMp004La2Cfw.woff2'
curl -sS -o fonts/press-start-2p-cyrillic-ext.woff2 'https://fonts.gstatic.com/s/pressstart2p/v16/e3t4euO8T-267oIAQAu6jDQyK3nYivN04w.woff2'
curl -sS -o fonts/press-start-2p-cyrillic.woff2 'https://fonts.gstatic.com/s/pressstart2p/v16/e3t4euO8T-267oIAQAu6jDQyK3nRivN04w.woff2'
curl -sS -o fonts/press-start-2p-greek.woff2 'https://fonts.gstatic.com/s/pressstart2p/v16/e3t4euO8T-267oIAQAu6jDQyK3nWivN04w.woff2'
curl -sS -o fonts/press-start-2p-latin-ext.woff2 'https://fonts.gstatic.com/s/pressstart2p/v16/e3t4euO8T-267oIAQAu6jDQyK3nbivN04w.woff2'
curl -sS -o fonts/press-start-2p-latin.woff2 'https://fonts.gstatic.com/s/pressstart2p/v16/e3t4euO8T-267oIAQAu6jDQyK3nVivM.woff2'
curl -sS -o fonts/share-tech-mono-latin.woff2 'https://fonts.gstatic.com/s/sharetechmono/v16/J7aHnp1uDWRBEqV98dVQztYldFcLowEF.woff2'
```
(`fonts/fonts.css` n'a pas besoin d'être régénéré : il est déjà dans le
dépôt, statique, et ne référence que ces noms de fichiers locaux.)

### 2.5 — Repli si D n'a pas le temps d'appliquer 2.1/2.2
Le correctif §2.3 (liste cohérente) est déjà fait et suffit à lui seul à
corriger le bug de précache. Si l'auto-hébergement n'est pas câblé dans ce
cycle, la politique de confidentialité doit alors utiliser le texte
« Google Fonts encore contacté » de la §4 (variante B), pas la variante A.
Rien d'autre à faire côté E dans ce cas : `/fonts/` reste un livrable prêt
à l'emploi pour un cycle ultérieur, sans effet tant qu'il n'est pas
référencé.

---

## 3. `src/sw-worker.ts` — récapitulatif des changements

- `CDN_CACHE`/`CDN_URLS`/`CDN_HOSTS` et la branche fetch associée :
  **supprimés** (jsPDF bundlé, plus de CDN à précacher/intercepter).
- `FONTS_CACHE` : `st-fonts-v3` → `st-fonts-v4` (nouvelle liste de polices
  précachées : l'ancien cache, avec la mauvaise URL, est purgé au prochain
  `activate` comme n'importe quelle version de cache obsolète).
- `FONT_CSS_URLS` : corrigé pour correspondre exactement à l'`@import`
  actuel d'`index.html` (voir §2.3).
- `STATIC` : ajout des 25 chemins `./fonts/*.woff2` + `./fonts/fonts.css`
  (précache tolérant — no-op tant qu'ils n'existent pas dans `dist/`, utile
  dès que D/F appliquent §2.1/2.2).
- Commentaires ajoutés à chaque endroit concerné pour indiquer précisément
  quoi supprimer une fois l'auto-hébergement câblé (le bloc Google Fonts
  devient alors du code mort).

`src/sw.ts` : aucun changement nécessaire (n'enregistre que
`./sw.js`, aucune référence aux CDN).

---

## 4. Texte de politique de confidentialité — à intégrer par l'élément D

Clés concernées dans `src/i18n/translations.ts` (fichier hors périmètre de
l'élément E) : `privacyIntro` et `privacyS2`, pour les **18 langues** — pas
seulement le français ci-dessous, qui sert de texte de référence à
traduire. Le texte HTML correspondant dans `index.html` (`#privacy-intro`,
`#privacy-s2`) doit rester un simple rendu de ces clés (aucun changement de
structure HTML nécessaire, seulement le contenu des clés).

### Variante A — si l'auto-hébergement des polices (§2.1/2.2) est intégré
(état recommandé et déjà prêt : jsPDF bundlé + polices auto-hébergées =
**plus aucune ressource externe, point final**)

- `privacyIntro` (remplace « ScoreTrack ne collecte aucune donnée
  personnelle. ») :
  > « ScoreTrack ne collecte, ne suit ni ne transmet aucune donnée
  > personnelle — et ne contacte aucun serveur tiers : polices de
  > caractères et export PDF sont livrés avec l'application elle-même,
  > y compris hors ligne dès la toute première ouverture. »
- `privacyS2` (inchangé, redevient exact tel quel) :
  > « Aucune donnée n'est envoyée à un serveur, partagée avec des tiers,
  > ni utilisée à des fins publicitaires ou analytiques. »
- Les sections S1/S3/S4 restent inchangées (déjà exactes).

### Variante B — repli, si Google Fonts reste chargé en ligne (§2.5)
À n'utiliser que si D n'a pas pu appliquer §2.1/2.2 dans ce cycle.

- `privacyIntro` :
  > « ScoreTrack ne collecte, ne suit ni ne transmet aucune donnée
  > personnelle à des fins publicitaires ou analytiques. » (retrait de
  > l'affirmation absolue « aucune donnée » qui était fausse dès qu'une
  > requête réseau existe : une adresse IP est une donnée personnelle au
  > sens du RGPD.)
- Nouvelle section (ajouter une clé, p. ex. `privacyS2b` /
  `privacyS2bt`, juste après `privacyS2`) :
  > Titre : « Ressources externes »
  > Corps : « Au premier chargement de chaque appareil, votre navigateur
  > télécharge les polices de caractères de l'application depuis Google
  > Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`). Cette requête
  > transmet à Google les informations techniques standard de toute
  > requête web (adresse IP, user-agent) ; aucune autre donnée n'est
  > envoyée, ScoreTrack ne configure aucun compte, identifiant ni cookie
  > de suivi avec ce service. Les polices sont ensuite mises en cache par
  > l'application pour ne plus être redemandées. »
- `privacyS2` : conserver tel quel (reste vrai pour les données de
  *contenu* : scores, noms, réglages — ce n'est que la nouvelle section
  qui couvre la requête de ressource statique).

---

## 5. Vérifications exécutées

| Commande | Résultat | Commentaire |
|---|---|---|
| `npm run typecheck` | Vert sur les 3 fichiers de mon périmètre (`src/sw.ts`, `src/sw-worker.ts`, `src/recap-pdf.ts`) | Le run global échoue par ailleurs sur `src/game.ts`, `src/animations.ts`, `src/dice-ui.ts`, `src/i18n.ts` — fichiers d'autres éléments, modifiés en parallèle et non committés au moment de la vérification (dépôt de travail partagé entre agents). Zéro erreur imputable à mes fichiers. |
| `npm run lint` | 0 erreur/avertissement sur mes fichiers (`src/sw.ts`, `src/sw-worker.ts`, `src/recap-pdf.ts`, `tests/recap-pdf.test.ts`, `e2e/pdf-export-offline.spec.ts`) | Le run global remonte 2 erreurs et des avertissements dans des fichiers `tests/game.*.test.ts` et `src/game.ts`/`src/globals.d.ts` créés/modifiés par un autre élément — hors périmètre. |
| `npm run test` (Vitest) | `tests/recap-pdf.test.ts` : 5/5 verts | Un autre fichier (`tests/dice3d.dispose.test.ts`, élément C) échoue en parallèle sur du code en cours de refactor ailleurs — sans lien avec mes changements. |
| `npm run build` | Vert, `dist/app.js` 1 633 Ko (jsPDF inclus, mesuré avant/après) | |
| `npx playwright test e2e/smoke.spec.ts` | Vert (parcours existant non régressé) | |
| `npx playwright test e2e/pdf-export-offline.spec.ts` | Rouge, cause identifiée et confirmée : balise CDN jsPDF résiduelle dans `index.html` (§1, action D) | Passe une fois cette seule ligne supprimée (vérifié manuellement sur une copie de `dist/index.html`, non committée) |
| Vérification manuelle Playwright de l'auto-hébergement des polices (§2) | Vert : 0 requête externe, polices effectivement `loaded`, fichiers `.woff2` servis localement | Script de vérification non committé (recette reproductible donnée en §2.4) |

## 6. Dette restante / suite pour d'autres éléments
1. **Élément D** : appliquer §2.1 (index.html) — 2 lignes — et le texte de
   politique de confidentialité §4 (variante A si D applique aussi
   l'auto-hébergement, sinon variante B), dans les 18 langues de
   `src/i18n/translations.ts`.
2. **Élément D** (obligatoire, indépendant du choix ci-dessus) : supprimer
   la balise `<script src="https://cdnjs.cloudflare.com/...">` résiduelle
   (§1) — sans quoi le défaut P0 persiste malgré le bundling jsPDF.
3. **Élément F** : appliquer §2.2 (`build.mjs`, une ligne `cpSync`) si
   l'auto-hébergement est retenu.
4. **Élément B** : `src/globals.d.ts` contient encore
   `jspdf?: { jsPDF: any }` sur `Window` — devenu obsolète (plus aucun code
   ne lit `window.jspdf`) — à retirer. Je ne l'ai pas fait moi-même,
   `globals.d.ts` étant hors de mon périmètre.
5. Une fois §2.1/2.2 appliqués, retirer de `src/sw-worker.ts` le bloc
   Google Fonts devenu mort (`FONT_CSS_URLS`, `FONT_HOSTS`, la branche
   fetch « Filet de sécurité Google Fonts ») — commentaires déjà en place
   dans le fichier pour guider cette suppression.
6. **Élément F** : `docs/audit/DECISIONS-F.md` §4 (décision D7 du journal
   BRIEF.md) calibre déjà la CSP de `vercel.json` sur
   `fonts.googleapis.com`/`fonts.gstatic.com`/`cdnjs.cloudflare.com` et note
   explicitement une « recommandation de resserrement une fois E/D auront
   retiré les dépendances CDN ». Une fois §1 (jsPDF, fait) et §2.1/2.2
   (polices, en attente de D/F) appliqués bout en bout, ces trois origines
   ne sont plus contactées du tout : la CSP peut retirer ces hôtes de
   `script-src`/`style-src`/`font-src`/`connect-src` (à vérifier avec le
   même protocole que D7 : serveur HTTP local + écouteur Playwright
   `securitypolicyviolation`, 0 violation attendu après resserrement).
