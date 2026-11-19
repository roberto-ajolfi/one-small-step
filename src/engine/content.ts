/**
 * Content types — the data-driven side of the rules engine (spec §4.1, §5).
 *
 * These structural interfaces are the contract between the engine and the content
 * layer: `src/data` validates JSON with zod and must produce values assignable to
 * these types (cross-checked by tests in M2). The engine never imports data, so a
 * hand-built fixture can drive unit tests before any JSON exists (M1 vs M2 split).
 */

/** Suits; JOKER covers both distinct joker identities (FR1.2). */
export type Suit = 'H' | 'D' | 'S' | 'C' | 'JOKER';

/** Ranks; strength s = pip for 2–10, 10 for J/Q/K, 12 for A (FR1.2). */
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 'J' | 'Q' | 'K' | 'A';

/** Row id of a card in the 54-row mapping table, e.g. `KH`, `10C`, `JOKER-A`. */
export type CardId = string;
export type TechId = string;
export type MissionId = string;
export type SideMissionId = CardId;
export type PerkId = string;

export type Program = 'mercury' | 'gemini' | 'apollo';

/** The twelve mission phases; `Descent` exists only on Apollo 10 (kit p.4). */
export type PhaseName =
  | 'Pre-launch'
  | 'Launch'
  | 'Orbit'
  | 'EVA'
  | 'Rendezvous'
  | 'TLI/Coast'
  | 'Lunar Orbit'
  | 'Landing'
  | 'Ascent'
  | 'Reentry'
  | 'Splashdown'
  | 'Descent';

export type CardKind = 'person' | 'equipment' | 'bonus' | 'action' | 'sideMission' | 'event';

/**
 * Named-ability shapes are locked (FR6.6) but numbers are tuning knobs (OQ12).
 * Abilities are structured data — one `applyAbility()` path consumes them so no
 * ability is hard-coded into phase math or economy (spec §4.3).
 */
export type Ability =
  /** Adds `amount` to a phase check when the phase matches; `phases: 'all'` = every phase. */
  | { kind: 'phaseBoost'; phases: PhaseName[] | 'all'; amount: number }
  /** Reduces a tech purchase's R&D cost when the item's tags match a domain (or 'any'). */
  | { kind: 'devDiscount'; domains: string[] | 'any'; amount: number; perTurn?: boolean }
  /** Kraft: once per mission, +2 to one failing phase (prompt, ruling 9). */
  | { kind: 'kraft'; amount: number }
  /** Kranz: once per mission, reroll one failed phase draw (prompt, ruling 9). */
  | { kind: 'reroll' }
  /** Perk: +1 to every assigned crew member's bonus (The New Nine). */
  | { kind: 'crewBonusAdd'; amount: number }
  /** Perk: +1 to every campaign phase draw (Deep Space Network; ruling 17). */
  | { kind: 'phaseDrawAdd'; amount: number }
  /** Perk: +2 Money at each year end (Telstar). */
  | { kind: 'yearEndMoney'; amount: number }
  /** Perk: −1 difficulty on the first attempt of each program's first mission (UTP; ruling 18). */
  | { kind: 'firstMissionDifficulty'; amount: number };

/** A named person row: astronauts fill crew slots, techs never do (ruling 8). */
export interface NamedPerson {
  name: string;
  role: 'astronaut' | 'tech';
  abilities: Ability[];
}

/**
 * One of the 54 mapping-table rows (FR1.4). `s` and `values` are derived from the
 * skeleton rules; the engine's formulas in `economy.ts` are authoritative and the
 * content layer cross-checks that stored values match them (spec §5).
 */
export interface Card {
  id: CardId;
  suit: Suit;
  rank: Rank;
  s: number;
  kind: CardKind;
  named?: NamedPerson;
  /** Side-mission (ace) payload: display name + the permanent perk it grants (FR7.2). */
  sideMission?: { name: string; perk: Ability };
  /** Precomputed display values (print kit columns); see economy.ts for formulas. */
  values: { money: number; rd: number; crew?: number; repair?: number; bonus?: number };
  flavor?: string;
}

/** One rung of the fixed 12-mission campaign ladder (FR5.1). */
export interface Mission {
  id: MissionId;
  name: string;
  year: number;
  program: Program;
  /** Hardware ids that must be developed before launch (FR4.4). */
  requires: TechId[];
  /** Explicit phase chain in order (FR5.2). */
  chain: PhaseName[];
  vp: number;
  flavor?: string;
}

/** One of the 11 hardware items on the tech tree (FR4.2). */
export interface TechItem {
  id: TechId;
  name: string;
  program: Program;
  rdCost: number;
  moneyCost: number;
  /** Domains used by devDiscount abilities, e.g. 'propulsion', 'capsule'. */
  tags: string[];
  /**
   * Program milestone that unlocks purchase (FR4.3): at least `minCompleted`
   * missions of `program` must be completed. Omitted = available from the start.
   */
  unlocksAfter?: { program: Program; minCompleted: number };
}

/** Effect payload of one d6 event-table row (FR9.2). */
export type EventEffect =
  | { type: 'sovietShift'; amount: number }
  | { type: 'rdGain'; amount: number }
  | { type: 'moneyGain'; amount: number }
  | { type: 'loseActions'; amount: number }
  | { type: 'stunCrew'; launches: number };

/** One row of the 6-entry event table, keyed by d6 face (FR9.1). */
export interface EventEntry {
  face: 1 | 2 | 3 | 4 | 5 | 6;
  name: string;
  effects: EventEffect[];
}

/**
 * Every tunable constant (design-doc tuning list, spec §5). The harness overrides
 * these without code edits; the UI tuning panel mutates the parsed value.
 */
export interface Tuning {
  drawPerTurn: number;
  actionsPerTurn: number;
  handLimit: number;
  turnsPerYear: number;
  repairCostMinor: number;
  repairCostMajor: number;
  /** Shortfall ≥ this is a Major Failure (ruling 1: minor = 1–3, major = 4+). */
  majorFailureMinShortfall: number;
  sovietTrackLength: number;
  sovietDrift: number;
  sovietPushFailure: number;
  sovietPushSideMission: number;
  milestoneEvery: number;
  milestoneVpBite: number;
  moneyBiteEvery: number;
  milestoneMoneyBite: number;
  sideMissionDifficulty: number;
  sideMissionRetry: number;
  sideMissionVp: number;
  programDifficulty: Record<Program, number>;
  phaseOffsets: Record<PhaseName, number>;
  retryPenalty: number;
  finalMissionBonus: number;
  crewSlots: Record<Program, number>;
  crewInjuryLaunches: number;
  crewStunLaunches: number;
  apollo1ActionLoss: number;
  programBonuses: Record<Program, number>;
  tierThresholds: {
    moon: { distinguished: number; administrator: number };
    timedOut: { honorable: number; good: number };
  };
  startingMoney: number;
  startingRd: number;
}

/** The full content bundle shared by engine, UI, harness and print generator (spec §1). */
export interface Content {
  cards: Card[];
  missions: Mission[];
  techTree: TechItem[];
  events: EventEntry[];
  tuning: Tuning;
}

/** Looks up a card row; throws on missing ids (content bug, fail fast — spec §5). */
export function cardById(content: Content, id: CardId): Card {
  const card = content.cards.find((c) => c.id === id);
  if (!card) throw new Error(`unknown card id: ${id}`);
  return card;
}

/** Looks up a mission by id; throws on missing ids. */
export function missionById(content: Content, id: MissionId): Mission {
  const mission = content.missions.find((m) => m.id === id);
  if (!mission) throw new Error(`unknown mission id: ${id}`);
  return mission;
}

/** Looks up a tech item by id; throws on missing ids. */
export function techById(content: Content, id: TechId): TechItem {
  const item = content.techTree.find((t) => t.id === id);
  if (!item) throw new Error(`unknown tech id: ${id}`);
  return item;
}

/** First mission of a program in ladder order (UTP window — ruling 18). */
export function firstMissionOfProgram(content: Content, program: Program): Mission | undefined {
  return content.missions.find((m) => m.program === program);
}

/** Last mission of a program in ladder order (+1 difficulty, FR5.3). */
export function finalMissionOfProgram(content: Content, program: Program): Mission | undefined {
  const ofProgram = content.missions.filter((m) => m.program === program);
  return ofProgram[ofProgram.length - 1];
}
