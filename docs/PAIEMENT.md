# Licence ScoreTrack Pro (paiement Stripe)

Achat unique à **4,99 €**. Sans licence, scoretrack.newgames.app est la version gratuite (2 à 6 joueurs,
fonctions Pro verrouillées) ; avec une licence, tout est débloqué, sur le même site, sans perdre ses parties.

## Fonctionnement

- **Licence** = clé signée `ST1.<données>.<signature>` (ECDSA P-256). L'app la vérifie hors ligne avec la
  clé publique (`LICENCE_PUBKEY` de `variants/pro.json` et `variants/test.json`). Elle ne contient aucune
  donnée personnelle : `{v:1, id, iat}`, où `id` est l'identifiant de la session Stripe (`cs_…`) ou
  `gift-…` pour une licence offerte.
- **Achat** : « Débloquer pour 4,99 € » → `POST /api/checkout` → Stripe Checkout → retour sur
  `/?session_id=cs_…` → `GET /api/licence` vérifie auprès de Stripe que la session est payée pour le bon
  prix et renvoie la licence → l'app l'enregistre et se recharge en version Pro.
- La clé reste visible dans les réglages (« Copier ma clé de licence ») pour l'activer sur un autre
  appareil : fenêtre Pro → « J'ai déjà une clé de licence ».
- « Supprimer toutes les données » conserve la licence (l'achat n'est pas perdu).
- Limite assumée : une clé peut être partagée (pas de serveur de comptes). Pour un petit prix, c'est un
  compromis raisonnable ; une clé publiée pourrait être bloquée en changeant de paire de clés (toutes les
  licences devraient alors être réémises).

## Offrir l'accès

1. **Lien direct** (sans passer par Stripe) :
   `node tools/licence.mjs offrir "Pour Marie"` → affiche la clé et un lien
   `https://scoretrack.newgames.app/#licence=…` qui active la licence en un clic.
2. **Code promo Stripe** : Stripe → Produits → Coupons → créer un coupon de 100 %, puis un code promo
   (ex. `AMI2026`). La personne clique sur « Débloquer », saisit le code dans Checkout, paie 0 € et
   reçoit sa licence comme un acheteur.

## Mise en service (à faire une fois)

1. **Stripe** (https://dashboard.stripe.com) :
   - Produits → « ScoreTrack Pro », prix unique 4,99 € EUR → noter l'identifiant `price_…`.
   - Développeurs → Clés API → clé secrète `sk_live_…` (commencer en mode test avec `sk_test_…`).
   - Paramètres → Image de marque et adresse e-mail du support (affichées sur le reçu).
   - Facultatif : Paramètres → Checkout → lien vers les CGV, puis `STRIPE_TERMS=1` (case à cocher
     obligatoire dans Checkout).
2. **Vercel**, projets `scoretrack-pro` **et** `scoretrack-test`, Settings → Environment Variables
   (Production et Preview) :
   - `STRIPE_SECRET_KEY` = `sk_…`
   - `STRIPE_PRICE_ID` = `price_…`
   - `LICENCE_PRIVATE_KEY` = contenu du fichier `licence-privee.pem` (fourni hors du dépôt ; à garder
     aussi dans un gestionnaire de mots de passe : **le perdre empêche d'émettre des licences, le
     divulguer permet d'en fabriquer**).
3. Projet `scoretrack-light` : rien à changer, son domaine redirige vers le principal.

## Test : accès réservé

Le site Test exige aussi une licence. Pour y accéder : `node tools/licence.mjs offrir "Test"` puis ouvrir
`https://scoretrack-test.newgames.app/#licence=…` (même clé publique que le site principal). En mode
test Stripe (`sk_test_…` sur le projet Test), la carte `4242 4242 4242 4242` permet d'essayer l'achat.

## Obligations (France / UE) — à compléter par le vendeur

- **Mentions légales** et **CGV** (identité du vendeur, SIRET, contact, prix TTC, absence de
  rétractation pour un contenu numérique fourni immédiatement avec accord exprès : Checkout affiche ce
  message avant le paiement).
- **TVA** : franchise en base (« TVA non applicable, art. 293 B du CGI ») ou Stripe Tax selon votre statut.
- La politique de confidentialité doit mentionner Stripe comme prestataire de paiement.
