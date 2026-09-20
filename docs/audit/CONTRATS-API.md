# Propriété des fichiers et contrats d'API — vague 2 (après fondation, commit « Restructuration en modules ES natifs »)

Lis d'abord BRIEF.md, puis research/RUBRIC.md et research/GAPS.md. Tu ne modifies QUE tes fichiers. Si tu as besoin d'un changement ailleurs, écris-le dans ton rapport final (l'auditeur l'orchestre). Toujours `npm run build:sw` après tout ajout/modification de fichier servi, puis `npm run check` avant de rendre la main. Ne commit jamais.

## Propriété

- **B (visuel)** : css/tokens.css, css/themes.css, assets/icons/**, js/ui/icons.js (nouveau), scripts/audit-contrast.mjs, scripts/audit-cvd.mjs, scripts/lint-no-emoji.mjs, tests/unit/themes.test.js, tests/e2e/visual.spec.js. Une seule ligne autorisée dans js/main.js : `import { hydrateIcons } from './ui/icons.js';` + appel dans init. Aucune modification d'index.html (les emojis sont déjà encapsulés dans `<span class="icon" data-icon="…">` : remplace-les au chargement par le SVG correspondant via hydrateIcons(), et expose `icon(name)` pour le JS qui crée des éléments — remplace l'implémentation `icon()` de dom.js UNIQUEMENT si dom.js n'est pas touché par un autre agent : il ne l'est pas, tu peux modifier la fonction `icon` de js/ui/dom.js, rien d'autre dans ce fichier).
- **C (parcours & accessibilité)** : index.html (UNIQUEMENT les sections #splash, #setup-page, #settings-page, #privacy-modal, #names-page ; ne touche pas au <head>, ni à #game-screen, #bar, aux modales de jeu, #recap), js/ui/setup.js, js/ui/names.js, js/ui/settings.js, js/ui/a11y.js (nouveau), css/base.css, css/setup.css, tests/e2e/setup.spec.js, tests/e2e/a11y.spec.js. Peut ajouter des entrées dans la table ACTIONS de js/main.js (édits ciblés uniquement).
- **D (logique & tests)** : js/core/**, js/store.js, tests/unit/**, vitest.config.js. Aucun fichier UI.
- **E (PWA & résilience)** : sw-st.js, manifest-st.json, scripts/build-sw.mjs, js/platform/** (storage, sw-client, errors, haptics, backup nouveau), js/ui/update-banner.js (nouveau, auto-monté depuis main.js par UNE ligne d'import), css/system.css (nouveau ; ajoute le <link> dans le <head> d'index.html : seule modification d'index.html autorisée à E), tests/e2e/pwa.spec.js, playwright.config.js si nécessaire.
- **F (CI/CD & docs)** : .github/**, docs/**, README.md, CONTRIBUTING.md, CHANGELOG.md, .editorconfig, lighthouserc/budget si utilisé, package.json (scripts et devDependencies seulement, édits ciblés). Aucun fichier d'application.
- **A (game feel)** — démarre après D : index.html (#game-screen, #bar, #score-modal, #winner-modal, #reset-modal, #elim-modal, #recap et nouvelles modales de jeu), js/ui/game.js, js/ui/modals.js, js/ui/recap.js, js/fx/**, css/game.css, css/modals.css, css/motion.css, tests/e2e/game.spec.js, tests/e2e/motion.spec.js.

## Contrats d'API (à respecter des deux côtés)

### D → A/C : js/core/history.js (v2)

- `createLog()` → `{ entries: [], cursor: 0 }` ; entrée = `{ id, t (Date.now), playerIdx, delta, from, to, via: 'tap'|'keypad'|'rotate'|'elim'|'unelim'|'rename', groupId }`.
- `record(log, entry)` (tronque le redo), `undo(log)` / `redo(log)` renvoient l'entrée inversée à appliquer (ou null), `canUndo(log)`, `canRedo(log)`, `jumpTo(log, entryId)` renvoie la liste des entrées à inverser/réappliquer, `groups(log)` regroupe les taps rapprochés (GROUP_DELAY = 1500 ms) en actions numérotées, `playerRecap(log, playerIdx)`, `timeline(log)` chronologique.
- Compatibilité : `parseGame` (save-schema v2) migre l'ancien `history` (groupes) + `undoStack` vers ce journal ; les fonctions v1 restent exportées tant qu'un module UI les utilise (D les marque @deprecated).

### D → A : js/core/rules.js

- Ajout `isMaxReached(score, maxPoints)`, `findWinner(players, {maxPoints, allowNeg})` → `{ index, reason: 'last-alive'|'max-reached' } | null`, `ranking(players)` (classement avec ex æquo et écart au premier), `applyDelta` inchangé.

### D → A : js/core/layout.js

- `computeLayout(n, seatOrder)` sans cellule vide pour n = 1..12 (aire vide ≤ 10 %) : propriété testée. Les cellules centrales des layouts 7/9/11 deviennent des cartes (rotation 180°) ou sont fusionnées.

### E → C : js/platform/backup.js

- `exportData()` → string JSON `{ app:'scoretrack', v:2, exportedAt, settings, save, profiles }` ; `importData(text)` → `{ ok: true, summary } | { ok: false, error }` (validation stricte, jamais d'écrasement partiel) ; `downloadExport()` (Blob + <a download>) ; `pickAndImport()` (input file).

### E → tous : js/platform/sw-client.js

- `registerServiceWorker()`, `onUpdateAvailable(cb)`, `applyUpdate()` (postMessage SKIP_WAITING puis reload à controllerchange), la bannière (`js/ui/update-banner.js`) écoute et affiche « Nouvelle version disponible — Mettre à jour » sans perdre la partie.

### E → A : js/platform/haptics.js

- `haptic('tap'|'floor'|'ceiling'|'elim'|'win'|'undo'|'longpress')`, no-op silencieux si `navigator.vibrate` absent ; dédoublonnage souris/tactile géré par l'appelant.

### C → A : js/ui/a11y.js

- `trapFocus(container)` → fonction de libération (Tab cyclique, Échap = callback optionnel), `announce(text, 'polite'|'assertive')` (région live unique), `onKey(map)` helper.

### B → tous : js/ui/icons.js

- `icon(name)` → SVGElement 24×24 `currentColor`, `hydrateIcons(root=document)`. Noms : target, gear, gamepad, save, lock, trash, shuffle, rotate, list, trophy, skull, check, close, undo, redo, plus, minus, back, play, dice, clock, edit, download, upload, info, warning, refresh, share, copy, users, palette.

### Tokens (B) utilisés par A et C

- Durées/courbes : `--dur-1: 120ms; --dur-2: 220ms; --dur-3: 360ms; --ease-out: cubic-bezier(.2,.8,.2,1); --ease-spring: linear(...)` ; échelle typographique `--fs-1 … --fs-8` (min 11 px) ; `--tap-min: 44px` ; couleurs sémantiques daltonien-safe `--gain` / `--loss` (paire bleu/orange Tol : #0077BB / #EE7733 par défaut sur fond sombre, déclinées par thème) qui remplacent l'usage sémantique de `--green`/`--red` (ces deux variables restent définies pour compatibilité).
