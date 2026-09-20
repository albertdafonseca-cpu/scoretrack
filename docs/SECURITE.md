# Sécurité — modèle de menace d'une PWA locale

ScoreTrack n'a ni serveur, ni compte, ni réseau applicatif : la surface d'attaque est celle d'une
page statique servie par GitHub Pages et exécutée dans le navigateur de l'utilisateur. Ce document
décrit ce qui peut mal tourner, ce qui est en place, et ce qui reste hors de notre contrôle.

## 1. Actifs à protéger

| Actif                                        | Où                             | Impact d'une atteinte                          |
| -------------------------------------------- | ------------------------------ | ---------------------------------------------- |
| Partie en cours, réglages, prénoms           | `localStorage` de l'origine    | Perte d'une partie, prénoms exposés            |
| Intégrité de l'interface                     | DOM de `index.html`            | Faux scores, blocage de l'app                  |
| Intégrité du code servi                      | `sw-st.js` + cache `st-<hash>` | Code arbitraire persistant hors ligne          |
| Réputation « aucune donnée ne quitte l'app » | CSP, absence de réseau sortant | Rupture de la promesse de confidentialité (D4) |

Il n'y a **aucun secret** dans le projet : ni clé d'API, ni jeton, ni variable d'environnement,
y compris dans les workflows GitHub Actions (jeton implicite en lecture seule ; OIDC pour Pages).

## 2. Menaces et mesures

### 2.1 Injection HTML / XSS locale (auto-XSS)

- **Menace** : un prénom de joueur, un profil mémorisé ou un fichier importé contenant `<`, `"`,
  `</span>`… interpolé dans `innerHTML`. Au commit initial, c'était le cas (défaut P1 n° 4 du
  constat). L'attaquant est l'utilisateur lui-même ou quelqu'un qui saisit un nom sur son
  téléphone : l'impact reste confiné à l'appareil, mais la robustesse était nulle.
- **Mesures** : rendu par `textContent` et création d'éléments (`js/ui/dom.js` : `h()`,
  `escape()`), plus aucun gestionnaire `onclick` inline, `script-src 'self'` dans la CSP (aucun
  script inline ne peut s'exécuter même si une chaîne atteignait le DOM), validation stricte des
  données importées (`js/platform/backup.js` : schéma vérifié, aucun écrasement partiel).
- **Vérification** : test e2e avec un prénom `<img src=x onerror=…>` (élément C/D) ; lint
  `no-implied-eval`, `no-new-func`, `no-eval` (ESLint).

### 2.2 Content-Security-Policy en balise `<meta>` et ses limites

La CSP déclarée dans `index.html` (vérifiée le 19 septembre 2026, ligne 11) :

```
default-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none';
img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self';
script-src 'self'; worker-src 'self'; connect-src 'self'; manifest-src 'self'
```

- GitHub Pages **ne permet pas de définir d'en-têtes HTTP** : pas de `Content-Security-Policy`,
  `Strict-Transport-Security` personnalisé, `X-Frame-Options`, `Permissions-Policy`… La balise
  `<meta http-equiv>` est donc le seul levier.
- Limites connues d'une CSP en `<meta>` : les directives `frame-ancestors`, `report-uri`/
  `report-to` et `sandbox` y sont **ignorées** ; la politique ne s'applique qu'après l'analyse de la
  balise (ce qui précède dans le `<head>` n'est pas couvert, d'où sa position en tête) ; le
  service worker n'est pas gouverné par la CSP du document.
- `base-uri 'none'` et `form-action 'none'` sont **déclarés explicitement** parce qu'ils ne
  retombent pas sur `default-src` : sans eux, une balise `<base>` injectée détournerait toutes les
  URL relatives et un `<form>` injecté pourrait poster vers un tiers. `object-src 'none'` et
  `worker-src 'self'` retombent bien sur `default-src`, mais les écrire rend la politique lisible et
  la met à l'abri des évolutions de la spécification. (Vérifié : aucun `new Worker`, `<form>`,
  `<base>`, `<object>`/`<embed>` dans le code servi ; l'export passe par un `<a download>` + Blob.)
- `style-src 'unsafe-inline'` est requis tant que du style est posé via `element.style` (couleurs
  des joueurs, tailles adaptatives). Ce n'est pas un vecteur d'exécution de code ; le durcir
  (nonces) est impossible sans serveur. Lighthouse le signale en « informatif » uniquement.
- Le clickjacking (absence de `frame-ancestors`) est sans enjeu : aucune action de l'app n'a d'effet
  hors de l'appareil.

### 2.3 Intégrité du service worker et du cache

- **Menace** : un SW compromis (dépôt ou compte GitHub) servirait du code arbitraire hors ligne et
  survivrait à la correction tant que le cache n'est pas purgé ; un SW figé sur une vieille version
  masquerait un correctif.
- **Mesures** : origine unique (`sw-st.js` à la racine, portée `./`) ; précache **généré** par
  `scripts/build-sw.mjs` avec un hash de contenu (`VERSION`) et vérifié en CI (`npm run check:sw`) ;
  nom de cache `st-<hash>` ; purge de tout autre cache à l'activation (y compris `st-v1`,
  `st-fonts-v1`, `st-v2`) ; mise à jour explicite (bannière → `SKIP_WAITING`) ; le SW ne répond
  qu'aux requêtes `GET` de sa propre origine ; les réponses non `ok` ne sont jamais mises en cache.
- **Hors de notre contrôle** : TLS et intégrité du transport (GitHub Pages, HTTPS obligatoire),
  compromission du compte GitHub (recommandé : 2FA, protection de la branche par défaut,
  environnement `github-pages` restreint à cette branche).

### 2.4 Données locales : perte, corruption, éviction

- Écriture atomique de la partie (`scoretrack_save.tmp` → bascule), copie de la dernière
  sauvegarde valide (`.prev`), quarantaine d'une sauvegarde illisible (`.corrupt`, jamais effacée
  en silence), `navigator.storage.persist()` demandé après la première écriture, export/import
  JSON manuel. Détails dans [EXPLOITATION.md](EXPLOITATION.md) § « Récupérer ses données ».
- `localStorage` n'est pas chiffré : quiconque a accès à l'appareil déverrouillé lit les prénoms.
  Aucune donnée plus sensible n'est stockée ; c'est documenté dans la politique de confidentialité.

### 2.5 Fuite réseau involontaire

- **Mesure** : `connect-src 'self'`, `font-src 'self'`, polices auto-hébergées (`assets/fonts/`,
  licence OFL documentée), aucun CDN, aucun analytics, aucun `fetch` vers un tiers dans le code.
- **Vérification** : test e2e comptant les requêtes sortantes hors origine (élément E, `pwa.spec.js`).

### 2.6 Chaîne d'approvisionnement

- **Aucune dépendance à l'exécution** (D2) : rien de `node_modules` n'est servi. `npm audit
--omit=dev` audite donc un arbre vide et le prouve à chaque CI (job `audit`).
- Dépendances de développement (ESLint, Prettier, Vitest, Playwright, http-server, axe) : mises à
  jour hebdomadaires par **Dependabot** (`.github/dependabot.yml`, groupées mineures/correctifs),
  audit `critical` bloquant en CI, `package-lock.json` versionné et `npm ci` en CI.
- `@lhci/cli` est appelé par `npx` avec une **version épinglée** (`0.15.1`) pour ne pas exécuter
  une version inconnue sur le runner.
- Actions GitHub épinglées par tag majeur (mutable) et suivies par Dependabot ; le passage à un
  épinglage par SHA est décidé mais reporté faute d'accès à GitHub depuis l'environnement d'audit
  (ADR-20 — un SHA ne s'invente pas). `permissions: contents: read` sur les deux workflows ; seul le
  job `deploy` de `deploy-pages.yml` reçoit `pages: write` et `id-token: write`.

### 2.7 Déni de service local

- Quota `localStorage` (≈ 5 Mo) : détection `QuotaExceededError`, journal d'erreurs borné à 20
  entrées de 500 caractères, profils bornés à 30 prénoms, écritures coalescées (une par trame).
- Boucle d'annulation : historique borné et inversions pures (`js/core/history.js`).

## 3. Ce que la CI garantit

| Job          | Garantie de sécurité                                                                                                                                                                                                                                                         |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lint`       | Pas d'`eval`/`Function` ; précache SW cohérent avec les fichiers réels ; aucun emoji hors des exceptions déclarées ; jetons de conception non contournés                                                                                                                     |
| `unit`       | Migrations et validation de schéma (données hostiles ou corrompues)                                                                                                                                                                                                          |
| `e2e`        | Injection par prénom, hors-ligne, mise à jour SW, aucune requête tierce                                                                                                                                                                                                      |
| `paquet`     | **Liste blanche** : aucun fichier publié qui ne soit précaché, déclaré au manifeste ou justifié (ADR-21) ; chaque actif déclaré est présent ; poids de la première visite borné ; captures du manifeste et du README identiques à l'octet à ce que l'interface rend (ADR-19) |
| `design`     | Contraste AA sur les 14 thèmes et lisibilité en protanopie/deutéranopie/tritanopie, mesurés sur les pixels rendus du paquet publié (D13, D16)                                                                                                                                |
| `lighthouse` | `errors-in-console`, poids du chargement initial, budget de `lighthouserc.json` asserté sur la **pire** de 5 exécutions (D21)                                                                                                                                                |
| `audit`      | Aucune dépendance de production ; dev sans vulnérabilité critique                                                                                                                                                                                                            |

Chaque garde-fou de ce tableau est **prouvé par dégradation volontaire** avant d'être considéré
comme livré (D17) : on introduit exprès la régression qu'il est censé arrêter et on vérifie le
code 1. Journal des preuves du 19 septembre 2026 — sept dégradations, sept échecs constatés, dans
l'ordre d'ADR-21 : capture de débogage publiée, `package.json` publié, dossier `docs/` publié,
capture du manifeste absente, entrée de précache absente, plafond abaissé sous le poids courant,
emoji dans l'interface / `sw-st.js` périmé.

**Exception documentée (D17)** : `npm run audit:cvd` ne fait échouer la construction que sur la
paire gain/perte. Les écarts de séparabilité de la palette des douze joueurs sont **listés dans le
rapport sans bloquer**, parce que la palette est figée par D1 et qu'aucune palette de douze couleurs
n'est séparable deux à deux pour un dichromate : la distinction repose sur un identifiant non
chromatique par carte (D18), vérifié par les tests visuels. Ce n'est donc pas un garde-fou muet par
négligence, mais une limite assumée et écrite.

## 4. Signalement

Voir [SECURITY.md](../SECURITY.md) à la racine.
