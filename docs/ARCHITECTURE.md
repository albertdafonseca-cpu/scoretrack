# Dépôt commun ScoreTrack

Dépôt GitHub : `albertdafonseca-cpu/scoretrack` (anciennement `scoretrack-light`, renommé ; l'ancien
nom redirige). Les anciens dépôts `scoretrack-legacy` (ex-site principal) et `scoretrack-test` sont
archivés, en lecture seule.

Ce dépôt produit deux sites à partir d'une même base :

| Variante | Domaine | Projet Vercel | Rôle | APP_ID (clé de stockage) |
|---|---|---|---|---|
| `pro`  | https://scoretrack.newgames.app | scoretrack-pro | **site unique** : gratuit (2 à 6 joueurs) sans licence, complet avec la licence Pro à 4,99 € | `main` |
| `test` | https://scoretrack-test.newgames.app | scoretrack-test | pré-production, invisible des moteurs (`noindex`), licence exigée aussi | `test` |

L'ancienne adresse https://scoretrack-light.newgames.app redirige (301) vers le site principal
(règle `redirects` de `vercel.json`, limitée à cet hôte). Paiement et licences : voir `docs/PAIEMENT.md`.

## Organisation

```
src/index.html      gabarit de la page : balises, « @include chemin », blocs « @if [!]drapeau » … « @endif »
src/html/           en-têtes SEO par site (head-pro, head-test), corps, superpositions,
                    fenêtre « Passer à Pro » (achat, activation d'une clé)
src/css/            base, thèmes, mise en page, cartes, interface, animations, accessibilité
src/i18n/strings.js dictionnaire des 18 langues
src/js/             stockage, licence (licence.js), verrous de la version gratuite (light-lock.js), configuration,
                    rendu, saisie, récap/PDF, animations, partie, accessibilité
src/sw.js           service worker commun ({{VERSION}} et {{PRECACHE}} remplis au build)
variants/<nom>.json dossier statique, drapeaux (pro) et jetons {{APP_ID}}, {{APP_NAME}}, {{IS_PRO}}, {{HEAD}}…
apps/<variante>/    fichiers statiques publiés tels quels (manifest, robots, sitemap, icônes, polices, vendor…)
api/                fonctions Vercel : checkout.js (ouvre Stripe Checkout), licence.js (délivre la licence payée)
tools/build.mjs     assemble et publie dans dist/<variante>/
tools/licence.mjs   paire de clés, licences offertes, vérification
```

Pour modifier l'app : éditer `src/`, jamais `dist/`. `IS_PRO` vaut `licenceActive()` : sans licence valide,
verrous de la version gratuite et fenêtre « Passer à Pro » ; avec, version complète.
Tests : `tests/e2e/gratuit` (site principal sans licence), `tests/e2e/pro` (même site, licence de test),
`tests/e2e/test` (pré-production, licence de test), `tests/api` (fonctions de paiement, faux Stripe).

## Construction

```
node tools/build.mjs          # dist/pro et dist/test
node tools/build.mjs pro      # une seule variante
cd tests && npm run test:gratuit # ou test:pro, test:test, test:api ; VARIANT=… npx playwright test --project=chromium
```

Sur Vercel, `vercel.json` lance `node tools/build.mjs --vercel`, qui publie dans `site/` la variante
indiquée par la variable d'environnement du projet `SCORETRACK_VARIANT` (`pro` par défaut ; `light`, ancien
nom, construit `pro`). Garde-fou : le domaine de production impose sa variante (`scoretrack.newgames.app` et
`scoretrack-light.` → pro, `scoretrack-test.` → test) ; en cas d'écart le build échoue et la version en ligne
reste inchangée.

| Projet Vercel | Dépôt | SCORETRACK_VARIANT |
|---|---|---|
| scoretrack-pro (ex-score-track) | ce dépôt | `pro` + variables Stripe et licence (`docs/PAIEMENT.md`) |
| scoretrack-light | ce dépôt | `light` ou rien (le domaine redirige vers le principal) |
| scoretrack-test | ce dépôt | `test` + variables Stripe (mode test) et licence |

Le service worker et la meta `app-version` reçoivent au build la même version : les 10 premiers
caractères du sha-256 du contenu publié. Elle change d'elle-même dès qu'un fichier change ; ne rien
incrémenter à la main. La liste des fichiers mis en cache est elle aussi produite au build (tout le site
sauf `robots.txt`, `sitemap.xml` et l'image de partage).

Cache HTTP (`headers` de `vercel.json`) : polices `.woff2` 1 an (`immutable`, leur nom est l'empreinte du
contenu) ; feuilles de polices, icônes et `vendor/` 1 jour (nom fixe : un fichier mis à jour doit être
repris vite, y compris par le service worker) ; page, `sw.js` et manifest toujours revalidés.

## Décisions prises (ne pas revenir dessus)

- **Modèle payant (remplace « gratuit pour l'instant »)** : un seul site, scoretrack.newgames.app, gratuit et
  limité (2 à 6 joueurs) sans licence, complet avec la **licence Pro, achat unique 4,99 €** (clé signée,
  Stripe Checkout). Tout le monde passe à ce modèle. L'accès peut être offert (lien d'activation ou code
  promo Stripe à 100 %). Détails : `docs/PAIEMENT.md`. APP_ID `main` conservé.
- **scoretrack-light.newgames.app redirige** (301) vers le principal : un acheteur garde ses parties et
  réglages en se débloquant sur place. Les données de l'ancienne adresse Light ne suivent pas : accepté.
- **SEO** : le principal est indexé (titre et description présentent le gratuit et la version Pro).
- **Test = pré-production des évolutions**, invisible des moteurs, **licence exigée** (sinon ce serait une porte gratuite).
- Stockage isolé par app : clés `st:<APP_ID>:…`, cache du service worker `st-<APP_ID>-…`. Ne jamais changer
  un APP_ID (les parties enregistrées seraient perdues).
- Accessibilité daltonisme : palette bleu/orange (Okabe-Ito), toujours doublée d'un repère (▲/▼, forme, texte).
- Export PDF : **jsPDF** (dessiné) pour toutes les variantes ; html2canvas a été retiré.
- Plus de code minifié à la main : tout est produit par le build depuis les sources lisibles.
- Comportements unifiés : pavé 7-8-9 en haut ; touches + / − de la saisie = boutons ± (changent le signe,
  valident si un nombre est saisi) ; Échap ferme la fenêtre de victoire ; bande de couleur en haut de la
  carte ; repère « score critique » = contour + symbole ⚠ ; prénom jusqu'à 12 caractères (ce que la carte
  affiche à taille normale ; 18 rendait les noms illisibles à 7-12 joueurs).

## Historique de la migration

1. ✅ Regrouper Light et Test dans ce dépôt, sortie identique à l'octet près.
2. ✅ Brancher le projet Vercel Test sur ce dépôt (`SCORETRACK_VARIANT=test`).
3. ✅ Découper la page en sources (`src/css`, `src/html`, `src/js`, `src/i18n`) — sortie identique à l'octet près.
4. ✅ Variantes (`variants/*.json`, blocs `@if [!]drapeau` … `@endif`) : version Pro depuis les sources.
5. ✅ Test produit par le build ; page minifiée supprimée.
6. ✅ Bugs relevés par l'analyse de duplication corrigés une fois ; comportements unifiés.
7. ✅ Version du service worker calculée à partir du contenu.
8. ✅ Le site principal (scoretrack.newgames.app) passe sur la base commune en version complète.
9. ✅ Licence Pro payante (Stripe), site unique, Light redirigé vers le principal.
