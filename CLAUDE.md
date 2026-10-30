# ScoreTrack — consignes pour les sessions Claude

Compteur de points pour jeux de société, en PWA, publié sur Vercel. Un seul
dépôt produit deux sites :

- **`pro`** : https://scoretrack.newgames.app, le site unique (gratuit et
  limité sans licence, complet avec la licence Pro) ;
- **`test`** : https://scoretrack-test.newgames.app, la pré-production.

**À lire avant toute modification : `docs/ARCHITECTURE.md`** (organisation,
build, variantes, et surtout la section « Décisions prises (ne pas revenir
dessus) ») et, pour l'achat et les licences, **`docs/PAIEMENT.md`**. Ce fichier
n'en recopie que les règles qui se paient cher quand on les oublie.

## Règles qui ne se discutent pas

- **Éditer `src/`, jamais `dist/` ni `site/`** : ils sont produits par
  `tools/build.mjs`.
- **Ne rien incrémenter à la main** : la version du service worker et la meta
  `app-version` sont l'empreinte du contenu publié, calculée au build.
- **Ne jamais changer un `APP_ID`** (`main`, `test`) : les clés de stockage
  `st:<APP_ID>:…` changeraient, et toutes les parties enregistrées seraient
  perdues.
- Le **modèle payant** (gratuit de 2 à 6 joueurs, licence Pro à 4,99 € en
  achat unique), le prix et ce que verrouille la version gratuite
  (`src/js/light-lock.js`) sont des **décisions de l'utilisateur** : n'en rien
  changer sans sa demande.
- **Daltonisme** : palette bleu/orange (Okabe-Ito), toujours doublée d'un repère
  (▲/▼, forme, texte). Le score critique = contour **et** symbole ⚠.
- Une demande imprécise : poser 3 questions avant d'agir. Tout en français ;
  l'interface est traduite en 18 langues (`src/i18n/strings.js`) : un texte
  ajouté s'y ajoute dans toutes.

## Secrets

Jamais dans le dépôt. `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID` et
`LICENCE_PRIVATE_KEY` vivent dans les variables d'environnement des projets
Vercel. La clé privée de licence est aussi dans `~/.scoretrack/licence-privee.pem`
sur le poste de l'utilisateur : **la perdre empêche d'émettre des licences, la
divulguer permet d'en fabriquer.** Seule la clé PUBLIQUE est versionnée
(`LICENCE_PUBKEY` de `variants/*.json`).

## Construire et tester

```sh
node tools/build.mjs                  # dist/pro et dist/test
node --test tests/api/*.test.mjs      # fonctions de paiement, faux Stripe
cd tests && npm ci && npm run test:gratuit   # ou test:pro, test:test (Playwright 1.56.1)
```

La CI (`.github/workflows/tests.yml`, sur PR et poussée vers `main`) vérifie :
- un build **reproductible** (deux builds identiques à l'octet près, sinon
  chaque déploiement viderait le cache hors ligne des joueurs) ;
- les **garde-fous de domaine** (`--vercel`) : le domaine de production impose
  sa variante, et un écart fait échouer le build plutôt que de publier la
  mauvaise ;
- les tests `api/` ;
- les tests E2E des trois cas (`gratuit`, `pro`, `test`) sur Chromium, WebKit
  et Firefox.

## Publier

Les projets Vercel construisent ce dépôt (`vercel.json` :
`node tools/build.mjs --vercel`, sortie `site/`) ; la variante vient de
`SCORETRACK_VARIANT`. Une session travaille sur sa branche et passe par une PR
vers `main`, fusionnée seulement sur demande explicite. Messages de commit en
français, une phrase qui dit ce qui change (« Licence Pro payante (4,99 €,
Stripe) sur un site unique »).

## Sessions Claude Code

- `.claude/hooks/fichiers-sensibles.mjs` (PreToolUse) refuse la lecture et
  l'écriture des secrets (`.env*`, `*.pem`, clés…). Essai :
  `node .claude/hooks/fichiers-sensibles.essai.mjs`.
