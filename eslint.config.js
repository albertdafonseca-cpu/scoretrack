// Configuration ESLint (flat config). Code applicatif = navigateur (modules ES) ; scripts/tests = Node.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

const rules = {
  eqeqeq: ['error', 'always'],
  'no-var': 'error',
  'prefer-const': 'error',
  'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'all' }],
  'no-implicit-globals': 'error',
  'no-console': ['error', { allow: ['warn', 'error', 'log'] }],
  curly: ['error', 'multi-line'],
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
};

export default [
  {
    ignores: [
      'node_modules/**',
      'test-results/**',
      'playwright-report/**',
      '.lighthouseci/**',
      'coverage/**',
      'dist/**',
      'assets/**',
      'icons/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['js/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.browser } },
    rules,
  },
  {
    // Script classique (pas de module) : les déclarations de fonctions racine sont volontaires.
    files: ['sw-st.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: { ...globals.serviceworker },
    },
    rules: { ...rules, 'no-implicit-globals': 'off' },
  },
  {
    // Scripts Node et tests ; certains évaluent du code dans une page (globales navigateur incluses).
    files: ['scripts/**/*.{js,mjs}', '*.config.js', 'tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules,
  },
  prettier,
];
