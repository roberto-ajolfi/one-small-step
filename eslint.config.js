import js from '@eslint/js';
import importPlugin from 'eslint-plugin-import';
import tseslint from 'typescript-eslint';

// Layered, feature-first structure (spec §3/§8.1): engine → data → sim/web/print.
// Cross-layer imports must go through each layer's index.ts barrel (deep cross-layer
// imports are forbidden); `import/no-cycle` keeps the graph acyclic.
const layeringRules = (forbidden) => ({
  'no-restricted-imports': [
    'error',
    {
      patterns: forbidden.map((group) => ({
        group: [group, `${group}/**`],
        message: `layer restriction: this zone may not import ${group}`,
      })),
    },
  ],
});

export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { import: importPlugin },
    settings: { 'import/resolver': { typescript: true } },
    rules: {
      'import/no-cycle': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  // engine: pure rules — imports nothing outside itself (content types live here).
  {
    files: ['src/engine/**'],
    rules: layeringRules(['../data', '../sim', '../web', '../print']),
  },
  // sim: engine + data only.
  {
    files: ['src/sim/**'],
    rules: layeringRules(['../web', '../print', '../engine/', '../data/']),
  },
  // web: engine + data only; nothing in ui/ may import from components/ (enforced by review + this graph).
  {
    files: ['src/web/**'],
    rules: layeringRules(['../sim', '../print', '../engine/', '../data/']),
  },
  // print: data only (spec §3).
  {
    files: ['src/print/**'],
    rules: layeringRules(['../engine', '../sim', '../web', '../data/']),
  },
);
