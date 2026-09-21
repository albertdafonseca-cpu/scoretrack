# Audit qualité AAA — ScoreTrack, base réelle `main` (v2, 20 septembre 2026)

Rapport final de l'audit qualité mené sur le code réellement déployé du
projet (TypeScript, moteur de dés 3D Three.js, i18n 18 langues, export PDF,
déploiement Vercel). Remplace, pour ce qui concerne le produit actuel, un
premier audit conduit par erreur sur un instantané isolé et obsolète
(commit `3452b66`) : ce travail antérieur reste consultable sur la branche
`archive/audit-aaa-obsolete-js-monolithe` mais ne s'applique plus au code
réel. Contexte complet : `docs/audit/BRIEF.md` §0, constat de départ :
`docs/audit/CONSTAT-INITIAL.md`.

## Méthode

Six éléments disjoints (contrat de propriété des fichiers dans
`docs/audit/BRIEF.md` §5), chacun confié à un agent constructeur puis
vérifié par un agent critique indépendant qui ne modifie jamais le code et
doit prouver chaque verdict par une mesure, une capture ou un test
reproductible exécuté par lui-même (jamais une confiance sur parole envers
le constructeur). Boucle constructeur ↔ critique jusqu'à verdict
« AAA : oui » sur chaque élément, avec mutation testing systématique
(casser volontairement le correctif pour vérifier qu'un test dédié échoue
réellement, puis restaurer). Journal détaillé, round par round :
`docs/audit/{A,B,C,D,E,F}-critique-round{1,2}.md` et
`docs/audit/DECISIONS-{A..F}.md`.

**Limite assumée sur la comparaison au marché** (méthodologie §3.4) :
l'environnement d'exécution de cet audit n'a pas d'accès à une application
concurrente réelle à installer et manipuler côte à côte. Les critiques ont
donc jugé chaque élément contre des référentiels objectifs et communément
admis du marché grand public plutôt que par un test à l'aveugle littéral
contre une appli nommée : OWASP (neutralisation des entrées utilisateur),
WCAG 2.1 AA (contraste, navigation clavier, nommage accessible), les
garanties habituelles d'une PWA professionnelle (fonctionnement hors ligne
dès la première visite, absence de fuite de données non déclarée), et les
bonnes pratiques Three.js/WebGL (gestion mémoire GPU). C'est une différence
honnête à signaler par rapport à l'esprit initial de la demande d'audit, et
elle est documentée ici plutôt que tue.

## Résultat : 8/8 éléments AAA

| Élément | Périmètre | Rounds | Verdict final |
|---|---|---|---|
| A | Outillage (tests, lint, CI) | 1 | AAA — `A-critique-round1.md` |
| B | Logique de jeu & sécurité applicative | 1 | AAA — `B-critique-round1.md` |
| C | Moteur de dés 3D (ingénierie uniquement) | 2 | AAA — `C-critique-round2.md` |
| D | Accessibilité, interface, i18n | 2 | AAA — `D-critique-round2.md` |
| E | PWA, dépendances externes, vie privée | 2 | AAA — `E-critique-round2.md` |
| F | CI/CD, déploiement, documentation | 2 | AAA — `F-critique-round2.md` |
| G | Retrait des `onclick` inline, CSP `script-src` (round 3, post-clôture) | 1 | AAA — `G-critique-round1.md` |
| H | Émojis système → icônes SVG (round 4, post-clôture) | 5 + 1 correctif | AAA — `H-critique-round5.md` + correctif D34 |

État vérifié sur le dernier commit de la branche `claude/audit-qualite-aaa-lmthte` :
`npm run typecheck` (3 configurations), `npm run lint` (0 erreur),
`npm run test` (122 tests unitaires), `npm run build`, et
`npx playwright test` (42 tests e2e) — tous verts.

## Élément H (round 4, post-clôture, ajouté sur demande explicite)

Les émojis système utilisés comme icônes fonctionnelles (🏆 victoire, 🏁
fin de manche, 💀 élimination, 🔒 confidentialité, plus deux occurrences
non inventoriées au départ dans des animations canvas) ont été remplacés
par des icônes SVG/vectorielles dessinées à la main, distinguables par la
forme seule sans dépendre de la couleur (D-PREF-1/D-CLAUDE-2). Ce chantier
a nécessité 5 rounds constructeur/critique : à chaque round, le critique a
trouvé un contournement réel et démontré (jamais théorique) du test censé
garantir la distinction daltonienne — d'abord des métriques géométriques
globales trop permissives, puis un dessin en contour fin exploitant un
seuillage relatif à la luminance de chaque image, puis une silhouette
ronde exploitant l'absence de mesure de la structure interne, puis enfin
un test de topologie des trous internes lui-même trop permissif (seuil
relatif au lieu d'absolu) — chacun corrigé et revérifié avant de passer au
suivant. Un dernier contournement mineur trouvé au round 5 a été corrigé
directement par l'orchestrateur (seuil resserré, mutation testée) plutôt
que de rouvrir un round complet. Limite assumée et documentée à chaque
étape : ce n'est pas une preuve formelle d'impossibilité contre toute
géométrie adverse future, seulement un effort sérieux et répété. Détail
complet : `docs/audit/DECISIONS-H.md`, `docs/audit/BRIEF.md` §9.

## Élément G (round 3, post-clôture, ajouté sur demande explicite)

Après clôture des six premiers éléments, l'utilisateur a demandé de traiter
un point de dette documenté comme non bloquant : les 65 attributs
`onclick="..."` statiques d'`index.html` obligeaient `vercel.json` à garder
`'unsafe-inline'` dans `script-src` de sa Content-Security-Policy. Tous ont
été remplacés par un câblage `addEventListener` explicite dans
`src/main.ts` (même principe que `deleteProfile`, déjà posé par l'élément
B), sans changement de comportement — prouvé par 15 nouveaux tests e2e
couvrant chaque écran/parcours et par mutation testing (7 mutations
distinctes entre constructeur et critique, toutes détectées). `'unsafe-inline'`
a ensuite été retiré de `script-src` (`style-src` le garde, à cause du
`<style>` inline d'`index.html`, hors périmètre de ce chantier), vérifié
sans aucune violation CSP sur un parcours complet incluant l'export PDF et
le geste de fermeture par glissement tactile du lanceur de dés. Détail :
`docs/audit/DECISIONS-G.md`, `docs/audit/BRIEF.md` §8.

## Défauts P0 (bloquants) trouvés et corrigés

1. **Politique de confidentialité fausse.** `index.html` affirmait n'aucune
   collecte de données alors que Google Fonts et jsPDF (CDN) étaient
   contactés à l'exécution et même précachés par le service worker.
   Corrigé en deux temps par l'élément E (auto-hébergement des polices,
   `jsPDF` en dépendance npm bundlée, plus aucun CDN) puis par l'élément D
   (texte de confidentialité réécrit dans les 18 langues, balise CDN
   résiduelle retirée d'`index.html`).
2. **Fetch mort vers Google Fonts à chaque installation du service worker**
   (trouvé indépendamment par les critiques des éléments D, E et F au
   round 1, après la correction n°1 ci-dessus) : un bloc de code que
   l'élément E avait documenté comme « à retirer » mais jamais retiré
   contactait réellement `fonts.googleapis.com` à chaque installation,
   invisible des écouteurs réseau Playwright classiques (un service worker
   émet ses fetch hors de leur portée). Retiré ; couverture ajoutée par
   inspection de source et exécution réelle du fichier compilé en bac à
   sable (`tests/sw-worker.test.ts`), le tout mutation-testé.
3. **Injection HTML par nom de joueur.** `src/game.ts` construisait un
   `onclick` et plusieurs blocs `innerHTML` en interpolant le nom du joueur,
   protégé seulement contre l'apostrophe. Corrigé par l'élément B :
   reconstruction DOM pure (plus d'`onclick` généré dynamiquement) et une
   fonction `escapeHtml` générique appliquée à tous les autres points
   d'affichage — vérifié par le critique avec 10 charges adversariales
   distinctes de celles du constructeur, toutes neutralisées.
4. **Aucun test, aucune CI, aucun lint.** Posé par l'élément A : Vitest,
   ESLint (analyse de syntaxe — le mode type-aware n'est pas encore
   démarrable, `typescript-eslint` ne supportant pas encore TypeScript 7 au
   moment de l'audit), Playwright, CI GitHub Actions.

## Défauts P1 (majeurs) trouvés et corrigés

- État mutable global dispersé dans `src/game.ts` (élément B) : logique de
  score dédupliquée (`computeClampedScore`), organisation interne
  améliorée sans casser l'interface `window` consommée par les autres
  modules.
- Fuite mémoire GPU sur les dés reconstruits et fuite DOM sur une sonde
  temporaire (élément C) : dispose explicite des ressources Three.js,
  try/finally sur la sonde. Sévérité reformulée après contre-mesure du
  critique (nette seulement si `WEBGL_lose_context` est indisponible).
- Accessibilité quasi nulle (élément D) : rôles ARIA/aria-label sur
  dialogues et boutons icône-seule, `:focus-visible` réellement visible à
  l'écran (une transition CSS retardait son affichage de 180ms — corrigé),
  piège de focus et fermeture Échap sur les dialogues principaux, tailles
  de police remontées, contraste du thème `mono-light` corrigé
  (2,93:1 → 4,28:1).
- Couverture manquante sur un paramètre visuel verrouillé (`onSphere` du
  d48/d120, élément C) : un correctif futur incorrect y serait passé
  inaperçu de tous les tests ; couverture quantitative ajoutée.

## Décisions verrouillées, non rediscutées (rappel)

- **Moteur de dés 3D** : aucune modification esthétique. Comparaison
  binaire (sha256) de 16 captures × plusieurs exécutions confirme un rendu
  strictement identique avant/après les deux rounds de l'élément C.
- **Accessibilité daltonienne par luminance**, jamais par teinte seule.
- Le poids de `dist/app.js` (1,6 Mo, dont ~800 Ko pour jsPDF) reste
  volontairement chargé de façon statique plutôt que différée : un
  chargement différé casserait la garantie déjà testée d'export PDF hors
  ligne dès la première visite, avant toute activation du service worker
  (`docs/audit/BRIEF.md` D24). Un futur tour pourrait rouvrir ce compromis
  en migrant tout le build vers l'ESM avec découpage de code réel.

## Dette fermée après la clôture initiale (sur demande explicite)

Six points de dette documentée ci-dessus ont depuis été traités directement
par l'orchestrateur (hors du formalisme élément/critique, pour des
correctifs bien spécifiés et à faible risque, chacun revérifié
typecheck/lint/tests unitaires/build/e2e) — détail complet dans
`docs/audit/BRIEF.md` D35-D36 :

- Licence du projet ajoutée (propriétaire, choix explicite de l'utilisateur).
- Émoji cadenas retiré des 18 langues de `src/i18n/translations.ts` (source
  nettoyée, plus seulement neutralisé à l'écran).
- `fillText('🏁',...)` mort retiré de `src/animations.ts`.
- 9 affectations `element.onclick = fn` converties en `addEventListener`
  (dont une, `recap-close-btn`, migrée vers un câblage unique dans
  `main.ts` plutôt qu'une conversion naïve — l'ancien pattern
  `.onclick=` y évitait justement un empilement de gestionnaires à
  chaque ouverture du récapitulatif).
- Le `<style>` inline d'`index.html` extrait vers `css/app.css`, et
  `'unsafe-inline'` retiré de `style-src` — remplacé par les directives CSP
  de niveau 3 `style-src-elem 'self'` / `style-src-attr 'unsafe-inline'`
  après avoir mesuré (pas supposé) qu'un retrait complet casserait les
  innombrables mutations `.style.xxx=` légitimes du projet.

## Dette restante, documentée et assumée (non bloquante pour AAA, hors de portée de cet audit)

- 4 langues (arabe, japonais, coréen, chinois) signalées par leur propre
  traducteur (élément D) comme à confiance de traduction réduite, faute de
  relecture par un locuteur natif — sémantiquement correctes à la lecture
  du critique, mais non garanties idiomatiques. Nécessite un locuteur natif.
- Lint en mode syntaxe uniquement (pas type-aware) tant que
  `typescript-eslint` ne supporte pas TypeScript 7. Dépend d'une mise à
  jour amont hors du contrôle du projet.
- Validation de la CSP faite en local (serveur HTTP + Playwright), pas
  encore sur un déploiement Vercel réel. Nécessite un déploiement effectif.

## Conclusion

Les trois défauts P0 identifiés au départ (confidentialité fausse,
injection HTML, absence totale d'outillage de vérification) sont corrigés
et couverts par des tests qui échouent réellement si le correctif est
annulé (vérifié par mutation testing sur chaque élément, deux fois
indépendamment — une fois par le constructeur, une fois par le critique).
Les huit éléments (les six de l'audit initial, plus les deux chantiers de
dette ajoutés ensuite sur demande explicite — retrait des `onclick` inline
et remplacement des émojis système) ont atteint un verdict AAA au sens de
la méthodologie de cet audit (`BRIEF.md` §6), sans aucune régression sur le
rendu du moteur de dés ni sur les préférences permanentes de l'utilisateur.
Six points de dette supplémentaires ont ensuite été fermés directement
(licence, émoji cadenas en source, code mort, style de câblage des
évènements, extraction du `<style>` inline et resserrement de `style-src`).
Il ne reste que de la dette qui dépasse la portée de cet audit : la
relecture de 4 traductions par un locuteur natif, une limite d'un outil
tiers (`typescript-eslint`) hors du contrôle du projet, et la validation de
la CSP sur un déploiement réel.
