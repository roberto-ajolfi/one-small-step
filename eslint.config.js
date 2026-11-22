import js from '@eslint/js';
import importPlugin from 'eslint-plugin-import';
import tseslint from 'typescript-eslint';

// Layered, feature-first structure (spec §3/§8.1): engine → data → sim/web/print.
// Cross-layer imports must go through each layer's index.ts barrel — deep
// cross-layer paths are forbidden — and `import/no-cycle` keeps the graph acyclic.
//
// `forbidden` layers may not be imported at all; `barrelOnly` layers may be
// imported through their barrel (`../engine`) but never deep (`../engine/rng`).
// The `[.][.]/**/` prefix anchors the pattern to relative specifiers so npm
// packages that happen to share a layer name stay importable.
const layering = ({ message, forbidden = [], barrelOnly = [] }) => ({
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        ...forbidden.map((layer) => ({
          group: [`[.][.]/**/${layer}`, `[.][.]/**/${layer}/*`, `[.][.]/**/${layer}/**`],
          message: `${message}: may not import src/${layer}`,
        })),
        ...barrelOnly.map((layer) => ({
          group: [`[.][.]/**/${layer}/*`, `[.][.]/**/${layer}/**`],
          message: `${message}: import the src/${layer} barrel (index.ts), never a deep path`,
        })),
      ],
    },
  ],
});

// Spec §1 "engine purity": the rules layer and the harness are headless — no
// DOM globals may creep in, however harmless the call looks.
const noDomGlobals = {
  'no-restricted-globals': [
    'error',
    ...['document', 'window', 'localStorage', 'sessionStorage', 'navigator', 'location', 'history'].map(
      (name) => ({ name, message: 'headless layer (spec §1): DOM access lives in src/web' }),
    ),
  ],
};

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
    rules: {
      ...layering({ message: 'engine is pure rules (spec §1)', forbidden: ['data', 'sim', 'web', 'print'] }),
      ...noDomGlobals,
    },
  },
  // sim: engine + data only.
  {
    files: ['src/sim/**'],
    rules: {
      ...layering({
        message: 'balance harness is headless (spec §6)',
        forbidden: ['web', 'print'],
        barrelOnly: ['engine', 'data'],
      }),
      ...noDomGlobals,
    },
  },
  // web: engine + data only; nothing in ui/ may import from components/ (enforced
  // by review + this graph).
  {
    files: ['src/web/**'],
    rules: layering({
      message: 'the UI talks to the engine and the content only (spec §3)',
      forbidden: ['sim', 'print'],
      barrelOnly: ['engine', 'data'],
    }),
  },
  // data: JSON content + zod schemas; engine types only (type imports are
  // erased), never sim/web/print — keeps `print` dependent on `data` alone.
  {
    files: ['src/data/**'],
    rules: layering({
      message: 'content stays consumable by every layer (spec §5)',
      forbidden: ['sim', 'web', 'print'],
    }),
  },
  // print: data only (spec §3).
  {
    files: ['src/print/**'],
    rules: layering({
      message: 'the print generator is data-driven (spec §3)',
      forbidden: ['engine', 'sim', 'web'],
      barrelOnly: ['data'],
    }),
  },
);
