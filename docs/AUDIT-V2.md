# Audit v2 — état du déploiement / CI-CD (élément F)

Rapport d'étape de l'élément F (CI/CD, déploiement, documentation) de
l'audit qualité AAA ScoreTrack. Ne couvre que son périmètre (`vercel.json`,
`build.mjs`, `.gitignore`, `README.md`) — pas le rapport final de l'audit
complet, dont les autres éléments (A-E) ont leurs propres journaux dans
`docs/audit/DECISIONS-*.md`. Détail complet des décisions de cet élément :
`docs/audit/DECISIONS-F.md`.

## Défauts traités

| # | Défaut | Statut | Preuve |
|---|---|---|---|
| 1 | `.gitignore` incomplet (artefacts Playwright non ignorés) | Corrigé | `test-results/`, `playwright-report/`, `coverage/`, `.vercel/`, `.DS_Store` ajoutés — `docs/audit/DECISIONS-F.md` §1 |
| 2 | Pas de licence dans `package.json` | Non corrigé (hors périmètre d'édition) | Recommandation documentée — `docs/audit/DECISIONS-F.md` §5 |
| 3 | Pas de `README.md` | Corrigé | Fichier créé, contenu vérifié contre le `package.json`/l'arborescence réels — `docs/audit/DECISIONS-F.md` §2 |
| 4 | Fiabilité `build.mjs` face à un échec partiel | Vérifié puis renforcé | Deux scénarios testés avant/après correctif (erreur de syntaxe injectée puis restaurée) — `docs/audit/DECISIONS-F.md` §3 |
| 5 | `vercel.json` sans en-têtes de sécurité | Corrigé | CSP + 4 autres en-têtes, validés via serveur local + Playwright (`securitypolicyviolation`) — `docs/audit/DECISIONS-F.md` §4 |
| 6 | Vérification réelle des commandes | Faite, résultat mitigé pour des raisons hors périmètre | Voir tableau ci-dessous |

## `build.mjs` : comportement face à un échec partiel, mesuré réellement

Avant toute modification, deux tests (erreur de syntaxe temporaire injectée
dans chaque cible, puis restaurée — `git diff` vide confirmé après coup) ont
montré que le script **s'arrêtait déjà avec un code de sortie non nul** dans
les deux cas (erreur dans `src/main.ts`, ou dans `src/sw-worker.ts`) : aucun
masquage silencieux d'échec n'a été trouvé. Le point faible réel identifié
était différent : en mode séquentiel, une erreur sur la première cible
empêchait de savoir si la seconde aurait, elle aussi, échoué, et le message
d'erreur ne précisait pas explicitcement quelle cible (`app.js` ou `sw.js`)
était en cause.

Correctif appliqué : les deux cibles esbuild sont construites en parallèle
(`Promise.allSettled`), chaque échec est rapporté explicitement par cible,
puis le script sort avec `process.exit(1)` si au moins une a échoué. Les deux
mêmes scénarios ont été rejoués après correctif et confirment : code de
sortie 1 dans les deux cas, message explicite nommant la cible en échec, et
— nouveauté — la cible qui n'a pas échoué est bien construite au lieu d'être
sautée. Le mode `--watch` (développement) n'a pas été touché : un échec de
compilation en veille continue de s'afficher sans tuer le processus, ce qui
est le comportement voulu pour le développement local.

## `vercel.json` : en-têtes de sécurité HTTP

Ajout de `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
`Permissions-Policy` et d'une `Content-Security-Policy` calibrée sur les
origines externes réellement contactées par l'application au moment de cette
tâche (`fonts.googleapis.com`/`fonts.gstatic.com` pour Google Fonts,
`cdnjs.cloudflare.com` pour jsPDF, `data:`/`blob:` pour les icônes et le
manifeste PWA générés par `src/icons.ts`). La CSP a été testée réellement
(pas seulement rédigée) : servie via un serveur HTTP local reproduisant les
mêmes en-têtes, la page a été chargée sous Playwright/Chromium avec un
écouteur d'évènements `securitypolicyviolation` ; un premier essai a révélé
une vraie violation (police de repli interne de Chromium en `data:`),
corrigée, puis un second essai confirme 0 violation CSP et un fonctionnement
normal de la génération d'icônes/manifeste.

Limite assumée et documentée : `'unsafe-inline'` reste nécessaire pour
`script-src`/`style-src` tant que les 65 gestionnaires `onclick` inline et le
`<style>` inline d'`index.html` existent (hors du périmètre de cet élément) ;
la CSP constitue une défense en profondeur complémentaire au correctif
d'échappement HTML attendu de l'élément B sur l'injection par nom de joueur,
pas un substitut à ce correctif. Une note de resserrement futur est laissée
pour le jour où les dépendances CDN externes (jsPDF, Google Fonts) seront
retirées — un autre agent (élément E) y travaillait déjà en concurrence de
cette tâche, sans que son propre journal (`DECISIONS-E.md`) existe encore au
moment de la rédaction.

## Vérification réelle des commandes (état au moment de la clôture de cette tâche)

Le dépôt était, au moment de cette vérification finale, en cours de
modification concurrente et non committée par d'autres éléments de l'audit
(B : suppression en cours des variables globales `window._*` dans
`src/game.ts`/`src/animations.ts`, non encore répercutée partout ;
C : `src/dice3d/*`, `src/dice-ui.ts` ; E : `src/sw-worker.ts`,
`src/recap-pdf.ts`). Cela relève de la méthodologie de l'audit (plusieurs
agents travaillent en parallèle sur des fichiers disjoints, voir
`docs/audit/BRIEF.md` §5) et non d'un défaut introduit par cet élément :
aucun des fichiers listés ci-dessus n'appartient à mon périmètre, et aucun
d'eux n'est du TypeScript touché par `build.mjs`/`vercel.json`/`.gitignore`/
`README.md`.

| Commande | Résultat mesuré (dernière exécution avant commit) | Commentaire |
|---|---|---|
| `npm run lint` | **OK** — 0 erreur (567 avertissements), code 0 | Les `.ts` modifiés en cours par les autres éléments restent conformes à la config syntaxique du lint |
| `npm run typecheck` | **Échec** (`tsc --noEmit`) | Erreurs dans `src/game.ts`/`src/animations.ts` (propriétés `window._pendingEndgame`, `_afterWinAnim`, etc. retirées de `globals.d.ts` mais encore référencées à certains points d'appel — refactor B en cours) et `src/i18n.ts` (`navigator.userLanguage`, type `Timeout`) — hors de mon périmètre d'édition, à charge de B/D de stabiliser avant de committer leur propre travail |
| `npm run test` | **OK** — 55/55 tests passés (6 fichiers) | Vitest transforme les `.ts` via esbuild (pas `tsc`), insensible aux erreurs de type ci-dessus. Le nombre de tests a augmenté d'une exécution à l'autre pendant la rédaction de ce rapport (autres éléments qui committent au fil de l'eau) — chiffre pris à la dernière exécution avant mon commit, pas figé |
| `npm run build` | **OK** — code 0, `dist/app.js`/`dist/sw.js` produits | esbuild ne type-checke pas : un build peut réussir pendant qu'un refactor de types est en cours ailleurs dans le dépôt |
| `npm run ci` (lint+typecheck+test+build) | **Échec**, uniquement à cause de l'étape `typecheck` ci-dessus | À revérifier une fois les autres éléments (notamment B) auront committé un état stable |

**`build.mjs` testé de façon isolée**, indépendamment de l'état du reste du
dépôt : deux scénarios d'échec injectés puis restaurés (voir plus haut),
build sain revérifié après chaque restauration (`git diff` vide confirmé à
chaque fois pour les fichiers temporairement modifiés).

## Recommandations laissées pour d'autres éléments

- **Élément A** (`package.json`) : ajouter un champ `"license"` (et un
  fichier `LICENSE`) — actuellement absent des deux côtés. Choix de licence
  laissé à l'auteur du projet.
- **Élément B** (`src/game.ts`, `src/globals.d.ts`) : au moment de la
  clôture de cette tâche, `npm run typecheck` échoue sur des propriétés
  `window._*` référencées dans `src/game.ts`/`src/animations.ts` mais qui
  semblent avoir été retirées de `src/globals.d.ts` en cours de refactor —
  probablement transitoire, à revérifier avant de committer ce module.
- **Élément D/E** (`index.html`, section confidentialité, `sw-worker.ts`) :
  si les dépendances CDN externes (jsPDF via `cdnjs.cloudflare.com`, Google
  Fonts via `fonts.googleapis.com`/`fonts.gstatic.com`) sont retirées
  d'`index.html`, resserrer en conséquence la `Content-Security-Policy` de
  `vercel.json` (retirer les origines devenues inutiles). Ce fichier n'est
  pas dans le périmètre de D/E : me solliciter ou rouvrir `vercel.json` à ce
  moment-là.
- **Tout élément qui retire les 65 `onclick` inline ou le `<style>` inline**
  (P1 #4) : la CSP de `vercel.json` pourra alors abandonner `'unsafe-inline'`
  sur `script-src`/`style-src`, ce qui neutraliserait beaucoup plus
  efficacement une éventuelle injection HTML non détectée (au lieu de
  seulement limiter les dégâts via `connect-src`/`frame-ancestors`).

## Dette restante (périmètre F)

- La `Content-Security-Policy` ne peut être validée en conditions réelles
  que sur un déploiement Vercel effectif (ou `vercel dev`) — la validation
  faite ici (serveur local + Playwright) reproduit fidèlement les mêmes
  en-têtes mais pas l'infrastructure Vercel elle-même (CDN, autres en-têtes
  ajoutés par la plateforme). Recommandation : revalider après le premier
  déploiement réel avec ces en-têtes (`curl -I` sur l'URL de prod, ou les
  outils navigateur), notamment que Vercel n'ajoute pas d'en-tête qui
  entrerait en conflit.
- Le nouveau comportement de `build.mjs` (deux cibles en parallèle) allonge
  légèrement le rapport d'erreur affiché en cas d'échec (deux blocs au lieu
  d'un), ce qui est le compromis voulu (plus d'information, pas moins) mais
  n'a pas été comparé à d'autres approches (ex. écrire un rapport JSON
  structuré pour un outil externe) — non jugé nécessaire pour la taille
  actuelle du projet (deux cibles).
