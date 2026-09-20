// Configuration ESLint (flat config, ESLint 10 + typescript-eslint 8).
//
// Analyse de SYNTAXE uniquement (pas de linting « type-aware » avec
// `parserOptions.project`) : au 20/09/2026, typescript-eslint 8.70 refuse
// explicitement de démarrer avec TypeScript >= 7 (voir la note sur la
// version de `typescript` dans package.json). Le linting type-aware
// resterait la prochaine étape utile (il aurait immédiatement remonté les
// nombreux `any` non sûrs de l'intégration jsPDF dans recap-pdf.ts) une fois
// typescript-eslint compatible — voir docs/audit/DECISIONS-A.md.
//
// Sévérités choisies pour un premier lint sur une base de 7 750 lignes qui
// n'en avait jamais eu : les règles qui repèrent des bugs réels restent en
// `error` (CI rouge) ; celles qui ne font que constater un style hérité
// pré-TypeScript (largement répandu, dans des fichiers hors du périmètre de
// cet agent) restent en `warn` (visibles, non bloquantes) pour ne pas
// imposer une réécriture de masse hors sujet à cet audit. Voir
// docs/audit/DECISIONS-A.md pour le détail et la dette assumée.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Style historique (pré-TypeScript) très répandu dans src/ : signalé,
      // pas bloquant. À la charge de chaque élément de le réduire dans les
      // fichiers qu'il possède, au fil de ses propres correctifs.
      'no-var': 'warn',
      'prefer-const': 'warn',
      // `any` explicite : autorisé par convention documentée (CLAUDE.md,
      // « any explicite seulement là où le typage n'apporte rien »), par
      // exemple pour jsPDF chargé depuis un CDN sans types. Signalé pour
      // repérer les usages non commentés, jamais bloquant.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Ternaire utilisé comme un if/else compact pour son effet de bord
      // (ex. `cond ? doA() : doB();`) : pattern volontaire du style existant
      // (game.ts, dice-ui.ts...), pas une expression orpheline oubliée.
      'no-unused-expressions': ['error', { allowShortCircuit: true, allowTernary: true }],
      '@typescript-eslint/no-unused-expressions': ['error', { allowShortCircuit: true, allowTernary: true }],
      // - args:'none' : les gestionnaires d'événements (onclick, listeners)
      //   partagent une signature commune même quand l'event n'est pas
      //   utilisé par tel handler précis (cohérent avec main.ts).
      // - caughtErrors:'none' : de nombreux `catch(e){}` avalent
      //   volontairement une erreur non actionnable (ex. localStorage
      //   indisponible) ; ce n'est pas une variable oubliée.
      '@typescript-eslint/no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      // Même raison que caughtErrors ci-dessus : `catch(e){}` volontairement
      // vide avale une erreur non actionnable, ce n'est pas un bloc oublié.
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Une occurrence actuelle (dice-ui.ts:403, initialisation à `null`
      // jamais lue avant réaffectation) : bénin, signalé sans bloquer.
      'no-useless-assignment': 'warn',
    },
  },
  {
    // Le worker du service worker tourne dans un contexte WebWorker distinct
    // (tsconfig.sw.json, lib WebWorker) et n'est pas un module ES ordinaire.
    files: ['src/sw-worker.ts'],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    // Config d'outillage et scripts Node (build, vitest, playwright...).
    files: ['**/*.config.{js,ts,mjs,cts}', 'build.mjs'],
    languageOptions: { globals: globals.node },
  },
);
