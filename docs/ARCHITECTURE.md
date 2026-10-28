# Dépôt commun ScoreTrack

Dépôt GitHub : `albertdafonseca-cpu/scoretrack` (anciennement `scoretrack-light`, renommé ; l'ancien
nom redirige). Les anciens dépôts `scoretrack-legacy` (ex-site principal) et `scoretrack-test` sont
archivés, en lecture seule.

Ce dépôt produit trois sites à partir d'une même base :

| Variante | Domaine | Projet Vercel | Rôle | APP_ID (clé de stockage) |
|---|---|---|---|---|
| `pro`   | https://scoretrack.newgames.app | scoretrack-pro | **site principal** : version complète, gratuite pour l'instant (payante plus tard) | `main` |
| `light` | https://scoretrack-light.newgames.app | scoretrack-light | version limitée (2 à 6 joueurs, fonctions Pro verrouillées) | `light` |
| `test`  | https://scoretrack-test.newgames.app | scoretrack-test | pré-production des évolutions, invisible des moteurs (`noindex`) | `test` |

## Organisation

```
src/index.html      gabarit de la page : balises, « @include chemin », blocs « @if [!]drapeau » … « @endif »
src/html/           en-têtes SEO par site (head-pro, head-light, head-test), corps, superpositions,
                    fenêtre « Passer à Pro » (Light seul, lien {{PRO_URL}})
src/css/            base, thèmes, mise en page, cartes, interface, animations, accessibilité
src/i18n/strings.js dictionnaire des 18 langues
src/js/             stockage, verrous Light, configuration, rendu, saisie, récap/PDF, animations, partie, accessibilité
src/sw.js           service worker commun ({{VERSION}} et {{PRECACHE}} remplis au build)
variants/<nom>.json dossier statique, drapeaux (pro) et jetons {{APP_ID}}, {{APP_NAME}}, {{IS_PRO}}, {{HEAD}}…
apps/<variante>/    fichiers statiques publiés tels quels (manifest, robots, sitemap, icônes, polices, vendor…)
tools/build.mjs     assemble et publie dans dist/<variante>/
```

Pour modifier l'app : éditer `src/`, jamais `dist/`. Light : IS_PRO=false, verrous et fenêtre « Passer à Pro »
qui renvoie vers https://scoretrack.newgames.app. Pro et Test : IS_PRO=true, sans verrous.
Chaque suite de `tests/e2e/<variante>` tourne sur son site construit.

## Construction

```
node tools/build.mjs          # dist/pro, dist/light et dist/test
node tools/build.mjs pro      # une seule variante
cd tests && npm run test:pro     # ou test:light, test:test ; VARIANT=… npx playwright test --project=chromium
```

Sur Vercel, `vercel.json` lance `node tools/build.mjs --vercel`, qui publie dans `site/` la variante
indiquée par la variable d'environnement du projet `SCORETRACK_VARIANT` (`light` par défaut). Garde-fou :
le domaine de production impose sa variante (`scoretrack.newgames.app` → pro, `scoretrack-light.` → light,
`scoretrack-test.` → test) ; en cas d'écart le build échoue et la version en ligne reste inchangée.

| Projet Vercel | Dépôt | SCORETRACK_VARIANT |
|---|---|---|
| scoretrack-pro (ex-score-track) | ce dépôt | `pro` |
| scoretrack-light | ce dépôt | `light` (valeur par défaut, à indiquer quand même pour la lisibilité) |
| scoretrack-test | ce dépôt | `test` |

Le service worker et la meta `app-version` reçoivent au build la même version : les 10 premiers
caractères du sha-256 du contenu publié. Elle change d'elle-même dès qu'un fichier change ; ne rien
incrémenter à la main. La liste des fichiers mis en cache est elle aussi produite au build (tout le site
sauf `robots.txt`, `sitemap.xml` et l'image de partage).

Cache HTTP (`headers` de `vercel.json`) : polices `.woff2` 1 an (`immutable`, leur nom est l'empreinte du
contenu) ; feuilles de polices, icônes et `vendor/` 1 jour (nom fixe : un fichier mis à jour doit être
repris vite, y compris par le service worker) ; page, `sw.js` et manifest toujours revalidés.

## Décisions prises (ne pas revenir dessus)

- **scoretrack.newgames.app = site principal, version complète (Pro)**, gratuite pour l'instant ; un paiement
  (store ou clé de licence) viendra plus tard sans changer les sources. Il garde l'APP_ID `main` pour que ses
  utilisateurs actuels conservent leurs données. Remplace la décision antérieure « principal figé ».
- **Light = version limitée**, reste en ligne sur son domaine ; sa fenêtre « Passer à Pro » renvoie vers le principal.
- **SEO : les deux sites sont indexés, chacun pour lui-même** (canonical vers sa propre adresse, titres et
  descriptions distincts : « jusqu'à 12 joueurs, 14 thèmes, export PDF » contre « 2 à 6 joueurs »). Remplace
  la décision antérieure « Light référence SEO, canonical du principal vers Light ».
- **Test = pré-production des évolutions**, invisible des moteurs.
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
