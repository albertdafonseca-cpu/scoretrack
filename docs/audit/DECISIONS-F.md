# DECISIONS-F — Élément F : CI/CD, déploiement, documentation

Agent constructeur de l'élément F (audit qualité AAA ScoreTrack, brief v2).
Périmètre exclusif : `vercel.json`, `build.mjs`, `.gitignore`, `README.md`
(créé ici, absent auparavant), `docs/audit/BRIEF.md` §7 (ajout uniquement),
ce fichier, et `docs/AUDIT-V2.md` en toute fin de tâche. Voir
`docs/audit/BRIEF.md` §7 pour les décisions numérotées référencées
ci-dessous (D4 et suivantes ; D1-D3 sont de l'élément A).

## Constat de départ (vérifié avant toute action)

- `.gitignore` ne contenait que `node_modules/` et `dist/` — pas les
  artefacts Playwright (`test-results/`, `playwright-report/`) déjà signalés
  comme dette par l'élément A dans `docs/audit/DECISIONS-A.md`.
- Pas de `README.md` à la racine (vérifié : `test -f README.md` → absent).
- `build.mjs` construisait `src/main.ts` et `src/sw-worker.ts` de façon
  séquentielle (`await esbuild.build(options); await esbuild.build(swOptions);`),
  sans gestion explicite d'un échec partiel.
- `vercel.json` ne définissait que `buildCommand`/`outputDirectory`, aucun
  en-tête HTTP.
- Pas de licence dans `package.json` (`node -e "console.log(require('./package.json').license)"`
  → `undefined`), pas de fichier `LICENSE` à la racine.

## 1. `.gitignore` complété (D4)

Ajouté, avec un commentaire par ligne pour dire d'où vient l'artefact :
`coverage/` (Vitest, `--coverage`), `test-results/` et `playwright-report/`
(Playwright, signalés par l'élément A comme actuellement supprimés à la main
avant chaque commit), `.vercel/` (config locale de la CLI Vercel,
`vercel dev`/`vercel link`), `.DS_Store` (artefact Finder macOS). Rien
d'autre trouvé en cherchant `incremental`/`tsBuildInfoFile` dans les
`tsconfig*.json` (absent, pas de `.tsbuildinfo` à ignorer) ni de config
`coverage` déjà présente dans `vitest.config.ts` (l'élément A ne l'a pas
activée par défaut — `coverage/` est ajouté par anticipation, inoffensif si
jamais utilisé).

## 2. `README.md` créé (D5)

N'existait pas. Contenu strictement vérifié dans le dépôt au moment de
l'écriture : scripts npm recopiés depuis le `package.json` réel (pas
devinés), structure des dossiers listée depuis `ls src/`, description reprise
du `package.json` (`"Compteur de scores universel + lanceur de dés 3D"`).
Aucune fonctionnalité non vérifiée par moi-même n'y est décrite (pas de
détail sur le moteur de dés ou l'i18n au-delà de ce que confirment les noms
de fichiers eux-mêmes). Une section « État du projet » renvoie vers
`CLAUDE.md` et `docs/audit/` plutôt que de dupliquer leur contenu.

## 3. `build.mjs` — robustesse d'un échec partiel (D6)

**Comportement AVANT modification, mesuré réellement** (pas supposé) : deux
tests, chacun avec une erreur de syntaxe temporaire injectée puis restaurée
(`git diff --stat` vide vérifié après coup dans les deux cas) :

- Erreur dans `src/main.ts` (1ʳᵉ cible) : `esbuild.build(options)` rejette,
  l'exception non interceptée fait sortir le process avec le code 1. La
  2ᵉ cible (`src/sw-worker.ts`) n'est **jamais tentée** (séquentiel avec
  `await`) : on ne sait pas si elle aurait, elle aussi, échoué. `dist/`
  reste sans `app.js` ni `sw.js` (aucun fichier de sortie écrit par esbuild
  en cas d'erreur, le plugin `copy-html` ne copie pas `index.html` non plus
  — `if (result.errors.length) return;`).
- Erreur dans `src/sw-worker.ts` (2ᵉ cible) : la 1ʳᵉ cible réussit et écrit
  `dist/app.js` + `dist/index.html`, puis la 2ᵉ échoue et fait sortir le
  process avec le code 1 — **mais `dist/` contient alors une application
  complète sans `sw.js`** (absent, ou périmé s'il existait déjà d'un build
  précédent). Le code de sortie est bien non nul dans les deux cas :
  **aucun cas où le script continuait silencieusement avec un code 0 après
  un échec n'a été trouvé.** C'est la bonne nouvelle du constat.

**Le point faible réel, corrigé ici** : le mode séquentiel masque
partiellement l'information (on ne voit qu'une erreur à la fois, jamais les
deux), et rien n'annonçait explicitement *laquelle* des deux cibles avait
échoué en cas d'échec — seule la trace brute d'esbuild (`Build failed with
1 error: ...`) remontait, sans dire à quel fichier de sortie (`dist/app.js`
ou `dist/sw.js`) elle correspondait, ce qui oblige à relire l'erreur pour le
déduire.

**Correctif** : les deux `esbuild.build(...)` sont maintenant lancés en
parallèle via `Promise.allSettled` (mode non-watch uniquement — le mode
`--watch` est inchangé, un échec de compilation en développement ne doit pas
tuer le process de veille). Si au moins une cible échoue, le script :
1. affiche un message explicite par cible en échec (`✘ Échec du build
   (src/main.ts -> dist/app.js) :` suivi du message d'erreur d'esbuild) ;
2. affiche un résumé (`N/2 cible(s) de build en échec`) ;
3. sort avec `process.exit(1)` explicite (au lieu de compter implicitement
   sur le comportement par défaut de Node face à une exception non
   interceptée — plus robuste et plus lisible, sans trace de pile brute).

**Revérifié réellement après le correctif**, mêmes deux scénarios
(erreur temporaire dans chaque fichier, restaurée ensuite — `git diff
--stat` vide confirmé pour `src/main.ts` et `src/sw-worker.ts` après chaque
essai) :
- Erreur dans `src/main.ts` : `sw.js` est maintenant **bien construit**
  (les deux cibles sont tentées même si l'une échoue), message
  `✘ Échec du build (src/main.ts -> dist/app.js)`, résumé `1/2 cible(s)...`,
  code de sortie **1**. `dist/app.js` absent (esbuild n'écrit rien en cas
  d'erreur).
- Erreur dans `src/sw-worker.ts` : `app.js`/`index.html` construits, message
  `✘ Échec du build (src/sw-worker.ts -> dist/sw.js)`, résumé `1/2
  cible(s)...`, code de sortie **1**.
- Build sain (aucune erreur injectée) : `npm run build` toujours vert, code
  de sortie 0, les deux fichiers produits (revérifié après restauration).

Un `dist/` incomplet après un échec partiel (ex. `app.js` sans `sw.js`) reste
possible localement, mais n'est plus un problème *silencieux* : le code de
sortie non nul fait échouer `npm run build`/`npm run ci`, et donc le
`buildCommand` de Vercel — un déploiement ne peut pas passer avec un `dist/`
incomplet.

## 4. `vercel.json` — en-têtes de sécurité HTTP (D7)

### Constat
`DECISIONS-B.md` n'existe pas encore au moment de cette tâche (vérifié :
`docs/audit/` ne contient que `BRIEF.md`, `CONSTAT-INITIAL.md`,
`DECISIONS-A.md`) — l'injection HTML par nom de joueur (P0 #2) n'est donc pas
encore corrigée pendant que j'écris ceci. Conformément à la mission, je note
ici la recommandation plutôt que d'attendre : une fois B corrigé,
`Content-Security-Policy` (ci-dessous) reste une **défense en profondeur**
complémentaire, pas un substitut à l'échappement côté B.

### Origines externes réellement contactées (vérifiées par `grep`, pas supposées)
- `index.html:20` — `<style>@import url('https://fonts.googleapis.com/css2?...')`.
- `index.html:1363` — `<script src="https://cdnjs.cloudflare.com/.../jspdf.umd.min.js">`.
- `src/sw-worker.ts` — précache ces deux origines plus `fonts.gstatic.com`
  (hôte réel des fichiers de police servis par la feuille de style Google
  Fonts) via `fetch()` **exécuté dans le service worker**, qui hérite de la
  CSP du document qui l'a enregistré.
- `src/icons.ts` — favicon/icône PWA en `data:` (canvas → `toDataURL`),
  manifeste PWA en `blob:` (`URL.createObjectURL`).
- Aucun `eval`/`new Function` trouvé dans `src/` ni `index.html` (`grep -rn
  "eval(\|new Function("` → rien) : pas besoin de `'unsafe-eval'`.

### En-têtes ajoutés
`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`
(désactive caméra/micro/géolocalisation/paiement, inutilisés par l'app), et
une `Content-Security-Policy` :
```
default-src 'self';
script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com data:;
img-src 'self' data:;
connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com https://cdnjs.cloudflare.com;
worker-src 'self';
manifest-src 'self' blob:;
object-src 'none';
base-uri 'none';
frame-ancestors 'none';
form-action 'self'
```

### Validée réellement, pas seulement écrite
`vercel.json` s'applique uniquement sur un vrai déploiement Vercel (les en-
têtes HTTP ne s'appliquent pas en ouvrant `index.html` en `file://`, ni via
`npm run test:e2e` actuel). Pour vérifier la CSP avant de la committer sans
attendre un déploiement, j'ai servi `dist/` avec un petit serveur HTTP local
posant exactement les mêmes en-têtes, puis chargé la page sous
Playwright/Chromium avec un écouteur `securitypolicyviolation` posé par
`addInitScript` (script et serveur jetables, écrits dans le répertoire de
travail temporaire de l'agent, jamais commités) :
- 1ᵉʳ essai (`font-src 'self' https://fonts.gstatic.com` sans `data:`) : **4
  violations réelles remontées** (`font-src` bloque un `data:font/woff2`) —
  fallback interne de Chromium quand une police système est absente
  (confirmé : ce n'est pas une police chargée par l'app elle-même, seulement
  `img-src`/canvas utilisent des `data:` dans le code source ; aucune
  utilisation de `data:` en police trouvée dans `index.html`/`src/`). Plutôt
  que d'ignorer une violation réelle observée, `data:` a été ajouté à
  `font-src` (fuite de confidentialité nulle : une police encodée en base64
  n'exfiltre rien).
- 2ᵉ essai (avec `data:` ajouté) : **0 violation CSP**, 0 exception JS,
  favicon (`data:image/png...`) et manifeste (`blob:http://localhost...`)
  bien posés par `icons.ts` — la CSP proposée n'empêche pas l'app de
  fonctionner dans les parties observables sans réseau externe réel (le bac
  à sable de cet agent bloque les requêtes sortantes vers `fonts.googleapis.com`
  au niveau TLS/proxy, ce qui a produit deux erreurs `ERR_CERT_AUTHORITY_INVALID`/
  `ERR_TUNNEL_CONNECTION_FAILED` **sans rapport avec la CSP** — ce ne sont pas
  des refus CSP, juste l'échec réseau attendu de ce bac à sable coupé
  d'Internet ; non reproductible tel quel en production où ces domaines sont
  réellement joignables).

### Limite connue / à recoordonner
`src/sw-worker.ts` contient, au moment où j'écris ceci, des commentaires
d'un autre agent (élément E, en cours de modification concurrente, non
encore documentée dans un `DECISIONS-E.md`) indiquant que jsPDF serait
bundlé via npm (plus de CDN) et les polices auto-hébergées (plus de Google
Fonts). Si ce changement aboutit, `script-src`/`style-src`/`connect-src`
pourront être resserrés (retirer `cdnjs.cloudflare.com` et
`fonts.googleapis.com`/`fonts.gstatic.com`). Je n'ai **pas** anticipé ce
resserrement : `index.html` (propriété D/E, pas la mienne) référence encore
ces deux origines externes au moment où j'écris cette CSP, donc la retirer
maintenant aurait cassé le chargement réel des polices/PDF tant que E n'a pas
terminé. **Recommandation explicite pour l'élément qui finalise ce
changement** : une fois les CDN retirés d'`index.html`, resserrer la CSP de
`vercel.json` en conséquence (elle n'est pas dans son périmètre d'édition —
me notifier ou rouvrir ce fichier). Une CSP trop large qui autorise des
origines qui ne sont plus utilisées n'est pas un défaut de sécurité en soi
(elle n'élargit rien par rapport à la situation actuelle), juste une
optimisation différée.

Autre limite assumée : `script-src`/`style-src` gardent `'unsafe-inline'`,
nécessaire tant que les 65 gestionnaires `onclick` inline (P1 #4, périmètre
B/D) et le bloc `<style>` inline avec `@import` (périmètre D) existent. Une
CSP sans `'unsafe-inline'` casserait l'application entière aujourd'hui. Ce
n'est donc pas oublié mais un palier : la CSP actuelle bloque déjà l'exfiltration
vers un domaine arbitraire (`default-src 'self'`, `connect-src` restreint,
`frame-ancestors 'none'`, `object-src 'none'`), même si elle ne neutralise
pas encore un `<script>` injecté inline par une faille XSS non corrigée —
c'est la vraie raison pour laquelle le correctif d'échappement de B reste la
priorité, la CSP n'étant qu'une couche supplémentaire.

## 5. Recommandation non appliquée : licence dans `package.json` (D8)

Hors de mon périmètre d'édition (`package.json` appartient à l'élément A).
Recommandation : ajouter un champ `"license"` (et un fichier `LICENSE` à la
racine) — actuellement absents des deux côtés. Sans licence explicite, les
termes par défaut du droit d'auteur s'appliquent (tous droits réservés),
ce qui peut ne pas correspondre à l'intention réelle du projet ; seul
l'auteur peut choisir la licence (MIT, propriétaire, etc.), ce choix n'est
pas fait à sa place ici.

## 6. Vérifications réelles

Voir `docs/AUDIT-V2.md` pour le tableau final des commandes exécutées et
leurs résultats au moment de la clôture de cette tâche (l'état exact de
`npm run lint`/`typecheck`/`test`/`build`/`ci` évolue au fil des autres
éléments qui travaillent en parallèle sur `game.ts`, `sw-worker.ts`,
`recap-pdf.ts`, `package.json` — la vérification finale a été refaite juste
avant de committer, pas seulement au début de cette tâche).

## Fichiers créés/modifiés par cet agent

- `.gitignore` (modifié)
- `README.md` (créé)
- `build.mjs` (modifié)
- `vercel.json` (modifié)
- `docs/audit/BRIEF.md` (ajout au §7 uniquement — D4 à D8)
- `docs/audit/DECISIONS-F.md` (ce fichier, créé)
- `docs/AUDIT-V2.md` (créé en toute fin de tâche)
