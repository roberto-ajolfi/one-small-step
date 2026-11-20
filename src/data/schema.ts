/**
 * Content schemas — zod validation for the five files in `src/data/` (spec §5).
 *
 * Every JSON file is parsed at import time, so malformed content fails fast with
 * a row-level path (`cards[13].s: …`) instead of surfacing mid-game. Semantic
 * cross-checks that need the design doc's tables or the engine's formulas
 * (s-ladder, values vs `economy.ts`, mission ↔ tech ids, band counts) live in
 * `tests/data/`: this layer never imports engine code at runtime, so `print`
 * depends on `data` alone (spec §3 dependency rules) — the engine import below
 * is type-only and erased at build time.
 *
 * The exported `content` bundle is typed with the engine's `Content`, making
 * the M1/M2 contract (src/engine/content.ts) a compile-time check.
 */

import { z } from 'zod';
import type { Card, Content, EventEntry, Mission, TechItem, Tuning } from '../engine/content';
import cardsJson from './cards.json';
import eventsJson from './events.json';
import missionsJson from './missions.json';
import techTreeJson from './tech-tree.json';
import tuningJson from './tuning.json';

// ---------------------------------------------------------------------------
// Shared enums
// ---------------------------------------------------------------------------

/** The four suits plus the joker pseudo-suit (FR1.2). */
export const suitSchema = z.enum(['H', 'D', 'S', 'C', 'JOKER']);

/**
 * Card ranks: pips as numbers 2–10, faces/ace as letters (FR1.2). Literals —
 * not `z.number().int().min(2)` — so `z.infer` stays assignable to `Rank`.
 */
export const rankSchema = z.union([
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
  z.literal(8),
  z.literal(9),
  z.literal(10),
  z.enum(['J', 'Q', 'K', 'A']),
]);

/** The twelve mission phases, incl. `Descent` which only Apollo 10 flies (kit p.4). */
export const phaseNameSchema = z.enum([
  'Pre-launch',
  'Launch',
  'Orbit',
  'EVA',
  'Rendezvous',
  'TLI/Coast',
  'Lunar Orbit',
  'Landing',
  'Ascent',
  'Reentry',
  'Splashdown',
  'Descent',
]);

/** The three program tiers of the tech tree and campaign ladder (FR4.3). */
export const programSchema = z.enum(['mercury', 'gemini', 'apollo']);

/** What a row's identity mode does; mirrors `CardKind` (FR1.3). */
export const cardKindSchema = z.enum([
  'person',
  'equipment',
  'bonus',
  'action',
  'sideMission',
  'event',
]);

// ---------------------------------------------------------------------------
// Payload schemas
// ---------------------------------------------------------------------------

/**
 * One structured ability or perk — the locked FR6.6/FR7.2 shapes; numeric
 * values stay tunable data (OQ12). Strict: an unknown key is a content bug.
 */
export const abilitySchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('phaseBoost'),
      phases: z.union([z.array(phaseNameSchema), z.literal('all')]),
      amount: z.number(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('devDiscount'),
      domains: z.union([z.array(z.string()), z.literal('any')]),
      amount: z.number(),
      perTurn: z.boolean().optional(),
    })
    .strict(),
  z.object({ kind: z.literal('kraft'), amount: z.number() }).strict(),
  z.object({ kind: z.literal('reroll') }).strict(),
  z.object({ kind: z.literal('crewBonusAdd'), amount: z.number() }).strict(),
  z.object({ kind: z.literal('phaseDrawAdd'), amount: z.number() }).strict(),
  z.object({ kind: z.literal('yearEndMoney'), amount: z.number() }).strict(),
  z.object({ kind: z.literal('firstMissionDifficulty'), amount: z.number() }).strict(),
]);

/** One effect of a d6 event-table row (FR9.2); mirrors `EventEffect`. */
export const eventEffectSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('sovietShift'), amount: z.number() }).strict(),
  z.object({ type: z.literal('rdGain'), amount: z.number() }).strict(),
  z.object({ type: z.literal('moneyGain'), amount: z.number() }).strict(),
  z.object({ type: z.literal('loseActions'), amount: z.number() }).strict(),
  z.object({ type: z.literal('stunCrew'), launches: z.number() }).strict(),
]);

/** Precomputed display values of a row (print kit columns; formulas in economy.ts). */
export const cardValuesSchema = z
  .object({
    money: z.number(),
    rd: z.number(),
    crew: z.number().optional(),
    repair: z.number().optional(),
    bonus: z.number().optional(),
  })
  .strict();

/** A named person row: role picks the FR6.2 roster band the abilities came from. */
export const namedPersonSchema = z
  .object({
    name: z.string().min(1),
    role: z.enum(['astronaut', 'tech']),
    abilities: z.array(abilitySchema).min(1),
  })
  .strict();

/** Side-mission payload of an ace row: display name + the unique perk (FR7.2). */
export const sideMissionSchema = z
  .object({
    name: z.string().min(1),
    perk: abilitySchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// Row + file schemas
// ---------------------------------------------------------------------------

/** One of the 54 mapping-table rows (FR1.4, spec §5). */
export const cardSchema = z
  .object({
    id: z.string().min(1),
    suit: suitSchema,
    rank: rankSchema,
    s: z.number(),
    kind: cardKindSchema,
    named: namedPersonSchema.optional(),
    sideMission: sideMissionSchema.optional(),
    values: cardValuesSchema,
    flavor: z.string().optional(),
  })
  .strict();

/** `cards.json`: the full 54-row mapping table (FR1.1). */
export const cardsSchema = z.array(cardSchema).length(54);

/** One rung of the fixed 12-mission campaign ladder (FR5.1). */
export const missionSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    year: z.number().int(),
    program: programSchema,
    requires: z.array(z.string().min(1)).min(1),
    chain: z.array(phaseNameSchema).min(1),
    vp: z.number().int(),
    flavor: z.string().optional(),
  })
  .strict();

/** `missions.json`: the 12-mission ladder in order (FR5.1). */
export const missionsSchema = z.array(missionSchema).length(12);

/** One of the 11 hardware items on the tech tree (FR4.2). */
export const techItemSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    program: programSchema,
    rdCost: z.number().int(),
    moneyCost: z.number().int(),
    tags: z.array(z.string().min(1)).min(1),
    unlocksAfter: z
      .object({ program: programSchema, minCompleted: z.number().int() })
      .strict()
      .optional(),
  })
  .strict();

/** `tech-tree.json`: all 11 hardware items (FR4.2). */
export const techTreeSchema = z.array(techItemSchema).length(11);

/** One row of the 6-entry event table, keyed by d6 face (FR9.1). */
export const eventEntrySchema = z
  .object({
    face: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
      z.literal(6),
    ]),
    name: z.string().min(1),
    effects: z.array(eventEffectSchema).min(1),
  })
  .strict();

/** `events.json`: exactly the six d6 faces (FR9.2). */
export const eventsSchema = z.array(eventEntrySchema).length(6);

/** Every tunable constant of the ruleset (design-doc tuning list, spec §5). */
export const tuningSchema = z
  .object({
    drawPerTurn: z.number(),
    actionsPerTurn: z.number(),
    handLimit: z.number(),
    turnsPerYear: z.number(),
    repairCostMinor: z.number(),
    repairCostMajor: z.number(),
    majorFailureMinShortfall: z.number(),
    sovietTrackLength: z.number(),
    sovietDrift: z.number(),
    sovietPushFailure: z.number(),
    sovietPushSideMission: z.number(),
    milestoneEvery: z.number(),
    milestoneVpBite: z.number(),
    moneyBiteEvery: z.number(),
    milestoneMoneyBite: z.number(),
    sideMissionDifficulty: z.number(),
    sideMissionRetry: z.number(),
    sideMissionVp: z.number(),
    programDifficulty: z
      .object({ mercury: z.number(), gemini: z.number(), apollo: z.number() })
      .strict(),
    phaseOffsets: z
      .object({
        'Pre-launch': z.number(),
        Launch: z.number(),
        Orbit: z.number(),
        Splashdown: z.number(),
        EVA: z.number(),
        Rendezvous: z.number(),
        'TLI/Coast': z.number(),
        'Lunar Orbit': z.number(),
        Reentry: z.number(),
        Landing: z.number(),
        Ascent: z.number(),
        Descent: z.number(),
      })
      .strict(),
    retryPenalty: z.number(),
    finalMissionBonus: z.number(),
    crewSlots: z.object({ mercury: z.number(), gemini: z.number(), apollo: z.number() }).strict(),
    crewInjuryLaunches: z.number(),
    crewStunLaunches: z.number(),
    apollo1ActionLoss: z.number(),
    programBonuses: z.object({ mercury: z.number(), gemini: z.number(), apollo: z.number() }).strict(),
    tierThresholds: z
      .object({
        moon: z.object({ distinguished: z.number(), administrator: z.number() }).strict(),
        timedOut: z.object({ honorable: z.number(), good: z.number() }).strict(),
      })
      .strict(),
    startingMoney: z.number(),
    startingRd: z.number(),
  })
  .strict();

// z.infer types (spec §5) — the raw JSON shapes, before the engine's contract.
export type CardJson = z.infer<typeof cardSchema>;
export type MissionJson = z.infer<typeof missionSchema>;
export type TechItemJson = z.infer<typeof techItemSchema>;
export type EventEntryJson = z.infer<typeof eventEntrySchema>;
export type TuningJson = z.infer<typeof tuningSchema>;

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/** Formats a zod issue path as `cards[13].s` (array segments in brackets). */
function formatPath(source: string, path: readonly PropertyKey[]): string {
  const suffix = path
    .map((segment) => (typeof segment === 'number' ? `[${segment}]` : `.${String(segment)}`))
    .join('');
  return `${source}${suffix}`;
}

/**
 * Parses raw JSON against a schema, failing fast with row-level messages.
 * Also the entry point for ad-hoc content, e.g. the harness's `--tuning
 * overrides.json` file (spec §6).
 *
 * @param schema - zod schema defining the file's shape.
 * @param data - raw JSON value as imported.
 * @param source - file name used to prefix issue paths, e.g. `cards`.
 * @returns the validated value, typed by the schema.
 * @throws Error listing one `source[path]: message` line per issue (spec §5).
 */
export function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown, source: string): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const issues = result.error.issues
    .map((issue) => `  ${formatPath(source, issue.path)}: ${issue.message}`)
    .join('\n');
  throw new Error(`invalid ${source} content:\n${issues}`);
}

/** Validates `cards.json` and returns the mapping table (FR1.1). */
export function loadCards(): Card[] {
  return parseOrThrow(cardsSchema, cardsJson, 'cards');
}

/** Validates `missions.json` and returns the ladder in order (FR5.1). */
export function loadMissions(): Mission[] {
  return parseOrThrow(missionsSchema, missionsJson, 'missions');
}

/** Validates `tech-tree.json` and returns the 11 hardware items (FR4.2). */
export function loadTechTree(): TechItem[] {
  return parseOrThrow(techTreeSchema, techTreeJson, 'tech-tree');
}

/** Validates `events.json` and returns the six d6 rows (FR9.2). */
export function loadEvents(): EventEntry[] {
  return parseOrThrow(eventsSchema, eventsJson, 'events');
}

/**
 * Validates `tuning.json` and returns a fresh copy of every constant —
 * callers may mutate it (harness `--tuning` overrides, UI tuning panel).
 */
export function loadTuning(): Tuning {
  return parseOrThrow(tuningSchema, tuningJson, 'tuning');
}

/** Validates all five files and assembles the `Content` bundle (spec §5). */
export function loadContent(): Content {
  return {
    cards: loadCards(),
    missions: loadMissions(),
    techTree: loadTechTree(),
    events: loadEvents(),
    tuning: loadTuning(),
  };
}

/**
 * The shipped content bundle, validated once at import (spec §5). Engine
 * sessions take it as the `Content` argument: `newGame(seed, content)`.
 * The engine itself never imports it — content stays injected (spec §3).
 */
export const content: Content = loadContent();
