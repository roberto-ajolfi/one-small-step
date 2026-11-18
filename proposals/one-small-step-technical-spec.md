# One Small Step — Prototype Technical Specification

Companion to [`one-small-step.md`](one-small-step.md). This document specifies the digital prototype only: the rules engine, content data, balance harness, web UI, and print pipeline. Game rules are owned by the design doc; where this spec and the design doc disagree, the design doc wins.

**Status**: first full draft for review. Decisions below are settled unless marked *open*.

## 1. Goals & Constraints (from the design doc's NFRs)

- **Single source of truth**: the engine encodes the physical ruleset 1:1. UI and harness never bypass it.
- **Determinism**: every game reproducible from `(seed, tuning, move log)`.
- **Data-driven content**: cards/missions/tech-tree/events/tuning live in JSON, schema-validated at load, shared by engine, UI, harness, and the print generator.
- **Performance**: instant UI response; ≥ 1,000 auto-played games/second for the harness.
- **Engine purity**: zero React/DOM dependencies in `src/engine` and `src/sim`.
- **UI styling**: TailwindCSS is the styling system (utility classes + one theme config; no ad-hoc CSS files beyond the Tailwind entry and print styles).
- **Responsive**: the web app is fully playable on **mobile and tablet**, not just desktop — layout adapts at Tailwind breakpoints with touch-first interactions.
- **No raster images**: visual identity comes from typography, Unicode card-suit symbols, and **icons from an icon library** (Tabler Icons primary, FontAwesome fallback) — no image assets.
- **Code structure & comments**: layered, feature-first structure (§8); comments explain *why* and document public APIs — never line-by-line narration.

## 2. Tech Stack & Tooling

| Concern | Choice | Notes |
|---|---|---|
| Language | TypeScript (strict) | one `tsconfig.json`, `strict: true` |
| Build / dev | Vite | dev server + production build for the web app |
| UI | React 18+ | function components, no state library (engine owns state) |
| CSS | TailwindCSS | theme tokens (NASA palette, type scale) in `tailwind.config.ts`; `@layer` print styles |
| Icons | `@tabler/icons-react` | tree-shakable, MIT, consistent stroke set; FontAwesome (`@fortawesome/react-fontawesome`) only as glyph fallback |
| Validation | zod | schemas for all JSON content; TS types inferred via `z.infer` |
| Tests | Vitest | unit + integration; `fast-check` optional later (not in v1) |
| RNG | seeded PRNG (`sfc32` or `mulberry32` behind a tiny wrapper) | all randomness through one `Rng` interface; seed is a string |
| Package manager | npm (single package) | no workspaces |
| Lint/format | ESLint + Prettier | defaults |

## 3. Repository Layout

```
one-small-step/
├── package.json               # single package, scripts: dev, build, test, sim, print
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts         # theme tokens: palette, type scale, breakpoints, print plugin
├── src/
│   ├── engine/                # PURE rules — no React, no I/O
│   │   ├── state.ts           # GameState type + constructors
│   │   ├── moves.ts           # Move union type + validation
│   │   ├── reducer.ts         # apply(state, move): GameState
│   │   ├── legal.ts           # legalMoves(state): Move[]
│   │   ├── phases.ts          # mission/phase resolution math
│   │   ├── economy.ts         # Money/R&D/repair/crew-value formulas
│   │   ├── soviet.ts          # track advance, milestones, bites
│   │   ├── events.ts          # event table application
│   │   ├── scoring.ts         # scoreGame(), tiers
│   │   ├── rng.ts             # seeded PRNG wrapper
│   │   └── invariants.ts      # assertInvariants(state) (dev/test)
│   ├── data/                  # JSON content + zod schemas
│   │   ├── cards.json         # 54-row mapping table
│   │   ├── missions.json      # 12-mission campaign ladder
│   │   ├── tech-tree.json     # 11 hardware items
│   │   ├── events.json        # d6 event table (6 entries)
│   │   ├── tuning.json        # all tuning constants
│   │   └── schema.ts          # zod schemas + loaders (validate on import)
│   ├── sim/                   # balance harness — no React
│   │   ├── policy.ts          # Policy interface + baseline/aggressive/conservative
│   │   ├── runner.ts          # runTrials(), parallel via worker_threads
│   │   ├── stats.ts           # aggregation + report rendering
│   │   └── cli.ts             # `npm run sim -- --games 10000 --policy baseline`
│   ├── web/                   # React UI
│   │   ├── App.tsx
│   │   ├── components/        # feature components: BoardLayout, HandFan, TechTreePanel,
│   │   │                      # SovietTrack, MissionPanel, CrewPool, ResourceCounters,
│   │   │                      # ActionLog, Header, RulesOverlay, GameOverModal…
│   │   ├── ui/                # dumb primitives: Button, Panel, Modal, Icon, Tooltip…
│   │   ├── store.ts           # engine session wrapper (apply/undo/save/load)
│   │   └── styles/            # Tailwind entry (theme.css) + print styles only
│   └── print/                 # printable-kit generator
│       ├── generate.ts        # data/*.json → 4-page HTML (port of the kit draft)
│       └── template.ts        # layout matching proposals/one-small-step-printable-kit.html
├── tests/
│   ├── engine/                # unit tests: phases, economy, soviet, scoring…
│   ├── integration/           # full auto-played games, determinism, save/replay
│   └── data/                  # schema + cross-reference tests (missions ↔ tech items)
└── proposals/                 # design docs (this file, the kit draft) — not shipped
```

**Dependency rules** (enforced by lint rule `import/no-restricted-imports`):
`engine` imports nothing from `sim/web/print`. `sim` imports `engine` + `data`. `web` imports `engine` + `data`. `print` imports `data` only.

## 4. Engine Design

### 4.1 Core types (sketch)

```ts
type CardId = string;                 // "KH", "10C", "JOKER-A"…
type Mode = 'money' | 'rd' | 'identity';

interface Card {                      // resolved from cards.json
  id: CardId; suit: 'H'|'D'|'S'|'C'|'JOKER';
  rank: 2|3|4|5|6|7|8|9|10|'J'|'Q'|'K'|'A';
  s: number;                          // strength: pip 2–10; faces 10; ace 12
  kind: 'person'|'equipment'|'bonus'|'action'|'sideMission'|'event';
  named?: { name: string; ability: AbilityId };
  values: { money: number; rd: number; crew?: number; repair?: number; bonus?: number };
}

interface GameState {
  seed: string; rngState: RngState;
  turn: number;                       // 1–30
  year: number;                       // 1960–69
  phase: 'draw'|'actions'|'mission'|'upkeep'|'repair'|'prebid'|'gameOver';
  hand: CardId[]; deck: CardId[]; discard: CardId[];
  resources: { money: number; rd: number };
  tech: Record<TechId, boolean>;      // developed flags
  crewPool: Record<CardId, 'ready'|'injured'|'stunned'>;  // + timers
  soviet: { position: number };       // 0–36
  campaign: { index: number; status: MissionStatus[] };   // pending/active/done + failCount
  sideMissions: Record<SideMissionId, 'open'|'flown'>;
  perks: PerkId[];                    // earned (unique)
  vp: { mission: number; side: number; program: number;
        penaltyFailures: number; penaltyMilestones: number };
  log: LogEntry[];
  pending?: PendingDecision;          // repair payment, pre-bid, event roll window…
}

type Move =
  | { t: 'playCard'; card: CardId; mode: Mode; target?: Target }
  | { t: 'developTech'; tech: TechId }
  | { t: 'launchMission'; mission: MissionId; crew: CardId[]; prebid: CardId[] }
  | { t: 'resolvePhase'; }            // engine draws; player-facing choices come as pending
  | { t: 'payRepair'; cards: CardId[] }
  | { t: 'flySideMission'; ace: CardId; crew: CardId[]; prebid: CardId[] }
  | { t: 'endTurn'; }
  | { t: 'undo'; } | { t: 'redo'; };
```

### 4.2 Reducer, determinism, undo

- `apply(state, move): GameState` is **pure**: validates the move against `legalMoves(state)` (throws `IllegalMove` with a human-readable reason), applies it, returns a new state. The engine keeps the immutable contract via structural sharing (`readonly` fields + copy-on-write of touched collections only).
- **All randomness** (shuffles, phase draws, event rolls, auto-rolls) comes from `state.rngState` advanced by the pure `rng` wrapper — never `Math.random`. Two runs with the same seed + move log produce byte-identical states.
- **Move log**: every applied move is appended (`log` + a separate `moves: Move[]` journal). **Snapshots** of `GameState` are taken every 10 moves (and at each turn boundary) to make `undo`/`seek` O(1)-ish.
  - `undo` = restore the latest snapshot ≤ target index, re-apply the journal from there.
  - **Saves are tiny**: `{ version, seed, tuningHash, moves[] }` reconstitutes the full game by replay. Full-state dumps are used only for snapshot checkpoints (kept in memory, not in saves).
  - **Replay/bug repro**: a seed + move log is a shareable bug report; the harness emits these for any anomalous game.
- **Turn state machine**: `phase` drives the pending-decision flow (`repair`, `prebid`, `eventRoll` windows). `endTurn` runs upkeep: Soviet drift +1, milestone bites, turn/year advance, year-end hand reset & crew heal, then `draw`.

### 4.3 Resolution math (mirrors the design doc)

- `economy.ts` owns every formula: `money = s`, `rd = ceil(s/2)`, `crew = ceil(s/3)`, `repair = s`, `bonus = ceil(s/2)`; named abilities are data-driven `AbilityId`s (e.g. `phaseBoost:Landing:2`, `devDiscount:rockets:2`, `rerollOncePerMission`) applied through one `applyAbility()` path — no ability is hard-coded in phase math.
- `phases.ts`: `difficulty(mission, phase)` = base + offset (+1 program-final, +2 retry) from `tuning.json`; `resolvePhase` computes `rank + crewBonus + prebid (+ perks) vs difficulty`, maps margin → Success / MinorFailure (3) / MajorFailure (6), opens the repair window when needed.

### 4.4 Invariants (asserted in dev + tests)

Deck is always 108 − hand − discard − deck − crewPool − inPlay; `soviet.position ∈ [0,36]`; resources ≥ 0; campaign index never skips; every `Move` in the journal replays legally; `scoreGame` is a pure function of state.

## 5. Data Layer

- All content files validated by zod on load (`schema.ts`); invalid content fails fast with row-level messages. Types for engine/UI are `z.infer<typeof …>`.
- **`cards.json`**: 54 rows — `id, suit, rank, s, kind, named?, values, flavor`. Must satisfy cross-checks: exactly 8 astronaut + 8 tech named rows, 4 aces with side-mission refs, 2 jokers; s-ladder consistent with rank.
- **`missions.json`**: 12 missions — `id, name, year, program, requires[] (TechId), chain[] (PhaseName), vp, flavor`. Cross-check: every `requires` exists in `tech-tree.json`.
- **`tech-tree.json`**: 11 items — `id, name, program, rdCost, moneyCost, unlocksAfter? (program milestone)`.
- **`events.json`**: 6 entries keyed by d6 face.
- **`tuning.json`**: every constant from the design doc's tuning list (draws, actions, hand limit, repair costs, track length, drift/pushes, difficulty bases, retry penalties, tier thresholds). The tuning panel in the UI and the harness's `--tuning` override both mutate/override this file's parsed value.
- **Print pipeline**: `src/print/generate.ts` renders the 4 pages (structure of `proposals/one-small-step-printable-kit.html`) from these same JSON files → standalone HTML → browser print-to-PDF. The kit draft is the visual golden reference.

## 6. Balance Harness (`src/sim`)

```ts
interface Policy { name: string; choose(state: GameState, legal: Move[]): Move; }
runTrials({ games, seed, tuning?, policy, workers? }): Stats
```

- **Three policies**: `baseline` (priority: develop when affordable → launch when hardware+crew ready → hold ~2 cards for repair/pre-bid → cash the rest), `aggressive` (rush the ladder, minimal repair hoarding), `conservative` (hoards repair/crew, delays launches). "Skilled win rate" = the best policy's rate; the 30–40% target must hold for `baseline` without exceeding ~60% for `aggressive`.
- **Stats reported**: result distribution (moon / timedOut / sovietsWon), tier distribution, score histogram, per-mission failure + retry rates, turn-of-Soviet-landing histogram, turn-of-Apollo-11 histogram, mean resources per year, milestone-bite totals.
- **Tuning loop**: `npm run sim -- --games 10000 --policy baseline --tuning overrides.json` prints a band report (target vs observed). CLI exits non-zero when win-rate bands are missed — usable as a CI-style regression check once tuned.
- **Performance**: pure-CPU, `worker_threads` pool over seeds; target ≥ 1,000 games/s across cores. Game size (30 turns, ~120 draws) makes this trivial; no memoization expected.
- **Anomaly capture**: any game whose state violates invariants is dumped as `{seed, moves[]}` into `tests/integration/fixtures/` for reproduction.

## 7. Web UI (`src/web`)

- **Store**: `store.ts` wraps the engine session — `{ state, moves, snapshots }`, exposing `dispatch(move)`, `undo/redo`, `save/load/export/import`, `newGame(seed?)`. React re-renders on state version bump. No Redux/Zustand: a `useSyncExternalStore` over the session object is enough.
- **Board layout** (table simulation): Header (year/turn, seed field, undo/redo, save/load, rules, tuning panel in dev) · HandFan (click-to-select → mode picker; HTML5 drag optional) · DrawPile/Discard · ResourceCounters (Money/R&D/actions left) · TechTreePanel (checkboxes, costs, afford-highlight) · SovietTrack (36 spaces, milestone names, bites) · MissionPanel (current mission, phase chain with live difficulty + outcome history, launch controls: crew slots + pre-bid selection) · CrewPool (16 slots with R/I/S status) · ActionLog (scrolling, "why illegal?" reasons on disabled actions) · GameOverModal (result, score ledger, tier, replay/share seed).
- **Interaction model**: every gesture compiles to a `Move`; illegal moves are disabled with a reason string from `IllegalMove`, never silently swallowed. Pending windows (pre-bid, repair, event roll) render as modal step panels driven by `state.pending`.
- **Save/load**: `localStorage` (slot-based) + JSON file export/import; seed sharing via URL hash (`#/play?seed=…&tuning=…`).
- **Theme**: Tailwind theme tokens carry the 60s NASA-poster style (serif display type, muted mission-patch palette). Color is decorative only — all information is typographic (mirrors the B&W kit). No raster images anywhere: suits are Unicode symbols, everything else is type or icons.
- **Icons**: `@tabler/icons-react` (tree-shakable) for actions and status (launch, wrench, coins, flask, users, alert…); FontAwesome only if a specific glyph is missing. Icons always pair with text or an `aria-label` — never the sole carrier of meaning.
- **Responsive (mobile / tablet / desktop)**: mobile-first Tailwind breakpoints (`sm/md/lg/xl`).
  - *Mobile (360–640px)*: single-column stack — sticky compact header (year/turn, resources, menu), hand as a horizontally scrollable card strip, collapsible sections (tech tree, Soviet track, crew pool, log) via accordion panels, mission panel prominent, bottom action bar for the primary action. Tap-to-select instead of drag; touch targets ≥ 44px.
  - *Tablet (640–1024px)*: two-column board (mission + track left, tech tree + crew right), hand strip fixed at the bottom; drag & drop enabled alongside tap.
  - *Desktop (1024px+)*: full table simulation layout (§7 board layout).
  - The 36-space Soviet track and the 30-turn tracker wrap into rows at every breakpoint; no horizontal page scrolling anywhere.
- **Accessibility**: keyboard operability (tab/enter to select & play cards), colorblind-safe encoding (suits carried by symbol+text), ARIA labels on interactive cards, focus rings via Tailwind's `focus-visible`.

## 8. Code Structure & Documentation Standards

### 8.1 Structure principles

- **Layered dependencies** (§3): `engine` → `data` → `sim`/`web`/`print`, enforced by lint (`import/no-restricted-imports`, `import/no-cycle`). No circular imports, ever.
- **Feature-first inside `web/`**: each folder owns one board area (`MissionPanel/`, `SovietTrack/`, `HandFan/`…) with its components and local hooks. Shared dumb primitives live in `ui/`; nothing in `ui/` imports from `components/` (one-way dependency).
- **One concern per file**, files kept small (~≤300 lines); each module exports its public surface through an `index.ts` barrel; deep cross-layer imports are forbidden.
- **I/O stays at the edges**: engine modules are side-effect-free; `localStorage`, file export, and CLI concerns live only in `web/store.ts`, `sim/cli.ts`, `print/generate.ts`.
- **Config over code**: anything a balancer/designer might tweak lives in `tuning.json` or content JSON — no magic numbers sprinkled through the engine (formula constants like `ceil(s/2)` are the exception; they *are* the rules).
- **Naming**: PascalCase types/React components, camelCase fields and hooks (`useGameSession.ts`), move discriminants tagged by `t`, JSON ids in card-id style (`KH`) or kebab-case (`lunar-module`).

### 8.2 Comment & documentation policy

- **Module header** (3–8 lines) on every non-trivial file: what it owns, where it sits in the architecture, key invariants.
- **JSDoc on every exported function/type** in `engine/` and `data/schema.ts`: purpose, params, returns, preconditions ("must be called in the repair window").
- **Inline comments only for the non-obvious**: intent, trade-offs, math derivations ("+1 = program-final nudge, see FR5.3"), gotchas. Never narrate what the next line does.
- **Spec cross-references** (`FR5.3`, `OQ10`) anchor rules to their source — the design doc is the normative ruleset.
- No commented-out code; no TODOs without a tracking note; generated artifacts (kit HTML) are marked `// generated — do not hand-edit`.
- Root `README.md` (setup, scripts, architecture map) and nothing more unless a subsystem outgrows its module header. Target level: *a new contributor can navigate the engine without reading it end-to-end* — not *every line explained*.

## 9. Testing Strategy

- **Engine unit tests** (`tests/engine`): economy formulas; difficulty formula incl. retry/program-final; outcome bands incl. exact-boundary cases; repair payment & failure; milestone bites & money bites; tie-break; event application incl. Apollo 1 stun vs injured crew; scoring + tiers; injury/stun timers.
- **Integration tests** (`tests/integration`): 100+ auto-played games complete without invariant violations; determinism test (same seed ⇒ identical move log & final state); save/replay round-trip; undo/redo walk; schema cross-reference tests (mission requirements ↔ tech ids, ace ↔ side-mission ids).
- **Golden tests**: `scoreGame` on a few recorded end states (from harness fixtures) to catch scoring regressions.
- **Print snapshot**: generated kit HTML compared against the golden draft structure (selected text content, not pixel-exact).
- **UI checks** (M4+): responsive spot-checks at 360 / 768 / 1280 px (manual viewport walk; automated screenshot tests optional later), keyboard-operability walk-through, icon-only controls verified to have accessible names.

## 10. Performance Budgets

- UI: move application < 5 ms, render < 16 ms (no perceptible lag); save/load < 50 ms.
- Harness: ≥ 1,000 games/s aggregate; 10,000-game report < 30 s on a laptop.
- Bundle: web app < 1 MB gzipped (React + engine + data ≈ well under).

## 11. Implementation Milestones

1. **M1 — Engine core**: state, reducer, rng, economy, phases, soviet, scoring + full unit tests. Exit: `apply()` loop plays a game headlessly via scripted moves.
2. **M2 — Data + schemas**: all five JSON files with zod validation + cross-reference tests; wire content into the engine.
3. **M3 — Harness**: policies, runner, stats, CLI; first tuning pass closes the Open Questions validation checklist (win-rate band, economy feasibility, tier thresholds).
4. **M4 — Web UI**: full table simulation with undo/save/seed; Tailwind responsive layout (mobile / tablet / desktop), Tabler icon set, playable end-to-end game.
5. **M5 — Print pipeline + polish**: kit generator from JSON, rules overlay, theme, a11y pass.

## 12. Risks & Mitigations

- **Rules drift between engine and print/docs** — mitigated: print generator consumes the same JSON as the engine; design doc is the normative source; unit tests encode the doc's formulas verbatim.
- **Balance numbers wrong out of the gate** (OQ10 already proved this can happen) — mitigated: everything numeric lives in `tuning.json`; harness runs before any UI work (M3 before M4).
- **Policy quality skews win-rate conclusions** — mitigated: three bracketing policies; reports show per-policy bands.
- **Ability sprawl** — mitigated: abilities are `AbilityId` data with one application path; new named people can't add new code paths.

## 13. Open Technical Questions

- PRNG pick (`sfc32` vs `mulberry32`) — trivial, decided at implementation start.
- `fast-check` property tests — deferred until after M3 unless invariants prove fragile.
- Save-file versioning/migration policy — only matters once saves exist in the wild; v1 saves are dev-only.
- Whether the harness auto-tunes (grid search over `tuning.json`) or tuning stays manual with reports — manual-first, auto-search as a stretch tool.
