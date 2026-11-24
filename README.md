# One Small Step

A solitaire space-race card game: fly the 1960s campaign against the Soviets.
This repository is the digital prototype — a pure rules engine, data-driven
content, a balance harness, a React web UI, and a printable-kit generator.

Design docs live in [`proposals/`](proposals/): `one-small-step.md` is the
**normative ruleset**, `one-small-step-technical-spec.md` is the prototype spec,
and `one-small-step-printable-kit.html` is the visual golden reference for the
print pipeline.

## Setup

```bash
npm install
npm run dev        # web UI at http://localhost:5173
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server for the web UI |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build |
| `npm test` | Vitest: engine, data, sim, integration and web tests |
| `npm run lint` | ESLint, including the layering rules below |
| `npm run sim` | Balance harness CLI (`npm run sim -- --help`) |
| `npm run print` | Generate the printable kit (`dist/one-small-step-printable-kit.html`) for browser print-to-PDF |

Type-check with `npx tsc --noEmit`.

## Architecture map

```
src/
├── engine/   pure rules (no React, no DOM, no I/O) — apply(), legalMoves(),
│             replay(), scoreGame(); content is injected via newGame(seed, content)
├── data/     cards / missions / tech-tree / events / tuning JSON + zod schemas
├── sim/      balance harness: policies, worker-pool runner, stats and CLI
├── web/      React UI: store.ts (session + save/load + share links),
│             useGameSession.ts (useSyncExternalStore binding), ui/ (dumb
│             primitives), components/ (board areas), styles/ (Tailwind entry)
└── print/    printable-kit generator: generate.ts (data → 4 kit pages),
│             template.ts (layout + kit prose), `npm run print`
tests/        engine · data · sim · integration · web · print
```

**Dependency rules** (enforced by `eslint.config.js`): `engine` imports nothing
outside itself; `sim` and `web` import the `engine` and `data` barrels only,
never deep paths; `data` never imports `sim`/`web`/`print`; `print` depends on
`data` alone. `ui/` never imports from `components/`.

## Determinism

Every game is reproducible from `(seed, tuning, move log)`. Saves are tiny —
`{version, seed, tuningHash, moves[]}` — and reconstitute by replay
(`engine/replay()`); `tuningHash` refuses to replay a journal under a different
tuning. Share a game with a `#/play?seed=…&tuning=…` link.
