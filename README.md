# ScoreTrack

Application web mono-page : compteur de scores universel + lanceur de dés 3D
(Three.js). Dix-huit langues d'interface, export du récapitulatif de partie
en PDF, mode hors ligne via service worker.

## Installation

```
npm install
npm run build
```

`npm run build` compile `src/` (TypeScript) vers `dist/app.js` et
`dist/sw.js` avec esbuild, et copie `index.html` dans `dist/` en pointant le
script sur `./app.js`. `dist/` est le site statique prêt à être servi tel
quel. Ouvrir `index.html` à la racine du dépôt fonctionne aussi une fois le
build effectué (il référence `dist/app.js`).

## Scripts npm

| Script | Effet |
|---|---|
| `npm run build` | Build de production (esbuild) : `src/main.ts` → `dist/app.js`, `src/sw-worker.ts` → `dist/sw.js`, copie d'`index.html` dans `dist/`. |
| `npm run watch` | Même build, en mode watch (recompilation continue). |
| `npm run typecheck` | `tsc --noEmit` sur `tsconfig.json` (code applicatif), `tsconfig.sw.json` (service worker) et `tsconfig.test.json` (tests), en mode strict. |
| `npm run lint` | `eslint .` (analyse de syntaxe TypeScript, flat config). |
| `npm run test` | Tests unitaires Vitest (`tests/**/*.test.ts`), un seul passage. |
| `npm run test:watch` | Tests unitaires Vitest en mode watch. |
| `npm run test:e2e` | Test de bout en bout Playwright (`e2e/**/*.spec.ts`) sur `dist/index.html` — nécessite un `npm run build` préalable. |
| `npm run check` | `npm run typecheck && npm run build`. |
| `npm run ci` | `npm run lint && npm run typecheck && npm run test && npm run build` — la séquence exécutée par la CI GitHub Actions (`.github/workflows/ci.yml`). |

`npm run test:e2e` n'est volontairement pas exécuté par la CI (voir
`docs/audit/DECISIONS-A.md`) : il reste disponible en local ou à intégrer
plus tard.

## Déploiement

Hébergement Vercel. `vercel.json` définit la commande de build
(`npm run build`) et le répertoire de sortie (`dist`), ainsi que des en-têtes
de sécurité HTTP (Content-Security-Policy, X-Content-Type-Options,
X-Frame-Options, Referrer-Policy, Permissions-Policy) appliqués à toutes les
réponses. Voir `docs/audit/DECISIONS-F.md` pour le détail et les limites
connues de cette configuration.

## Structure

- `src/` — code source TypeScript :
  - `main.ts` — point d'entrée, expose sur `window` les gestionnaires appelés
    par les `onclick` du HTML et `window.ScoreTrack` (modules, pour les tests).
  - `game.ts` — état, réglages, logique de partie, cartes joueurs, modal de
    score, récapitulatif.
  - `dice3d/` — moteur de dés 3D (géométrie, matériaux) ; `dice-ui.ts` — feuille
    du lanceur de dés.
  - `i18n.ts`, `i18n/translations.ts` — internationalisation (18 langues).
  - `recap-pdf.ts` — export PDF du récapitulatif (jsPDF, chargé depuis un CDN).
  - `sw.ts` (enregistrement) / `sw-worker.ts` (le worker, compilé séparément
    vers `dist/sw.js`) — service worker, mode hors ligne.
  - `animations.ts`, `icons.ts`, `splash.ts`, `dom.ts`, `types.ts`,
    `globals.d.ts` — animations, icônes générées en canvas, écran de
    lancement, aides DOM, types partagés.
- `index.html` — page unique de l'application.
- `dist/` — sortie de build, non versionnée (`.gitignore`) : c'est le
  répertoire déployé.
- `tests/` — tests unitaires Vitest.
- `e2e/` — test de bout en bout Playwright.
- `docs/audit/` — journal de l'audit qualité en cours (décisions, constats).

## État du projet

Ce dépôt fait l'objet d'un audit qualité en plusieurs volets (sécurité,
accessibilité, outillage, déploiement — voir `docs/audit/`). `CLAUDE.md`
documente les conventions de contribution et les choix déjà arbitrés à ne
pas rouvrir sans demande explicite (notamment le rendu du moteur de dés 3D).
