# Dépôt commun ScoreTrack

Ce dépôt produit deux sites à partir d'une même base :

| Variante | Domaine | Rôle | APP_ID (clé de stockage) |
|---|---|---|---|
| `light` | https://scoretrack-light.newgames.app | version publique, référence SEO | `light` |
| `test`  | https://scoretrack-test.newgames.app  | pré-production de la version Pro, invisible des moteurs (`noindex`) | `test` |

Le site principal (https://scoretrack.newgames.app, dépôt `scoretrack`) est **figé tel quel** : il ne
reçoit plus d'évolution et ne fait pas partie de ce dépôt.

## Construction

```
node tools/build.mjs          # dist/light et dist/test
node tools/build.mjs light    # une seule variante
cd tests && npm run test:light   # ou test:test ; VARIANT=… npx playwright test --project=chromium
```

Sur Vercel, `vercel.json` lance `node tools/build.mjs --vercel`, qui publie dans `site/` la variante
indiquée par la variable d'environnement du projet `SCORETRACK_VARIANT` (`light` par défaut). Le projet
Test **doit** définir `SCORETRACK_VARIANT=test` : sinon le build échoue (garde-fou sur le domaine) et la
version en ligne reste inchangée.

## Décisions prises (ne pas revenir dessus)

- Stockage isolé par app : clés `st:<APP_ID>:…`, cache du service worker `st-<APP_ID>-…`. Ne jamais changer un APP_ID (les parties enregistrées seraient perdues).
- Accessibilité daltonisme : palette bleu/orange (Okabe-Ito), toujours doublée d'un repère (▲/▼, forme, texte).
- Test est invisible des moteurs ; le canonical du site principal pointe vers Light.
- Export PDF : **jsPDF** (dessiné) pour toutes les variantes ; html2canvas sera retiré de Test.
- Plus de code minifié à la main : Test sera produit par le build depuis les sources lisibles.
- Comportements unifiés (étape 6) : pavé 7-8-9 en haut ; touche + / − = changer le signe ; Échap ferme la fenêtre de victoire ; bande de couleur en haut de la carte ; repère « score critique » = contour + symbole ⚠ ; prénom jusqu'à 18 caractères (coupé par « … » sur la carte).

## Plan de migration

1. ✅ Regrouper Light et Test dans ce dépôt, sortie identique à l'octet près (`apps/<variante>/` recopié).
2. Brancher le projet Vercel Test sur ce dépôt (`SCORETRACK_VARIANT=test`), archiver `scoretrack-test`.
3. Découper Light en sources (`src/css`, `src/html`, `src/js`, `src/i18n`) — sortie toujours identique.
4. Variantes (`variants/*.json`, blocs `/*@if PRO*/ … /*@endif*/`) : produire la version Pro depuis les sources.
5. Générer Test par le build ; supprimer `apps/test/index.html` minifié.
6. Corriger une seule fois les bugs relevés par l'analyse de duplication et unifier les comportements ci-dessus.
7. Version du service worker calculée à partir du contenu.
