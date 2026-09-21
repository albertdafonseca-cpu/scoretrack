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

## Résultat : 7/7 éléments AAA

| Élément | Périmètre | Rounds | Verdict final |
|---|---|---|---|
| A | Outillage (tests, lint, CI) | 1 | AAA — `A-critique-round1.md` |
| B | Logique de jeu & sécurité applicative | 1 | AAA — `B-critique-round1.md` |
| C | Moteur de dés 3D (ingénierie uniquement) | 2 | AAA — `C-critique-round2.md` |
| D | Accessibilité, interface, i18n | 2 | AAA — `D-critique-round2.md` |
| E | PWA, dépendances externes, vie privée | 2 | AAA — `E-critique-round2.md` |
| F | CI/CD, déploiement, documentation | 2 | AAA — `F-critique-round2.md` |
| G | Retrait des `onclick` inline, CSP `script-src` (round 3, post-clôture) | 1 | AAA — `G-critique-round1.md` |

État vérifié sur le dernier commit de la branche `claude/audit-qualite-aaa-lmthte` :
`npm run typecheck` (3 configurations), `npm run lint` (0 erreur),
`npm run test` (87 tests unitaires), `npm run build`, et
`npx playwright test` (28 tests e2e) — tous verts.

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

## Dette restante, documentée et assumée (non bloquante pour AAA)

- Émojis système comme icônes (💀 🏆 🔒) : nécessite un tour coordonné
  B+D+E (répartis entre plusieurs fichiers), non traité (`BRIEF.md` D21).
- Licence absente de `package.json` (P2, hors périmètre d'édition assigné).
- Le `<style>` inline d'`index.html` oblige `style-src` à garder
  `'unsafe-inline'` dans la CSP (`script-src` n'en a plus besoin depuis
  l'élément G) : non traité, changement de structure plus large qu'un
  simple retrait d'attribut.
- 9 affectations `element.onclick = fn` en JavaScript (pas des attributs
  HTML) subsistent dans `game.ts`/`dice-ui.ts`/`sw.ts` : mesuré sans
  incidence sur la CSP resserrée (élément G, `DECISIONS-G.md` §4), non
  refactorisées par cohérence de style avec `addEventListener`.
- 4 langues (arabe, japonais, coréen, chinois) signalées par leur propre
  traducteur (élément D) comme à confiance de traduction réduite, faute de
  relecture par un locuteur natif — sémantiquement correctes à la lecture
  du critique, mais non garanties idiomatiques.
- Lint en mode syntaxe uniquement (pas type-aware) tant que
  `typescript-eslint` ne supporte pas TypeScript 7.
- Validation de la CSP faite en local (serveur HTTP + Playwright), pas
  encore sur un déploiement Vercel réel.

## Conclusion

Les trois défauts P0 identifiés au départ (confidentialité fausse,
injection HTML, absence totale d'outillage de vérification) sont corrigés
et couverts par des tests qui échouent réellement si le correctif est
annulé (vérifié par mutation testing sur chaque élément, deux fois
indépendamment — une fois par le constructeur, une fois par le critique).
Les sept éléments (les six de l'audit initial, plus le chantier de retrait
des `onclick` inline ajouté ensuite sur demande explicite) ont atteint un
verdict AAA au sens de la méthodologie de cet audit (`BRIEF.md` §6), sans
aucune régression sur le rendu du moteur de dés ni sur les préférences
permanentes de l'utilisateur.
