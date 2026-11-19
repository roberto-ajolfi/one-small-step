/**
 * GameState — the single immutable value every engine transition produces (spec §4.1).
 *
 * `state.content` carries the validated ruleset so `apply(state, move)` keeps its
 * two-argument signature; saves reconstitute games from `{seed, content, moves}`
 * by replay (§4.2). Zones partition the 108-card deck: hand + deck + discard +
 * crewPool + inPlay always sum to `content.cards.length * 2` (§4.4).
 *
 * Phase machine:
 *   draw → actions → (endTurn) → mission chain [prebid/mission/repair windows] → upkeep → draw …
 * `phase` mirrors the open decision window where the spec lists one ('prebid',
 * 'repair'); the Kraft/Kranz prompt (ruling 9) uses phase 'mission' + pending
 * {kind:'ability'} because the spec's phase union has no ability phase.
 */

import type { CardId, Content, MissionId, PerkId, Program, TechId } from './content';
import type { Move } from './moves';
import { createRng, shuffle, type RngState } from './rng';

/** Structural phase of the turn/state machine (spec §4.1). */
export type Phase = 'draw' | 'actions' | 'mission' | 'upkeep' | 'repair' | 'prebid' | 'gameOver';

/** Terminal result of a game (FR10). */
export type GameResult = 'moon' | 'timedOut' | 'sovietsWon';

/** Crew pool entry: injured = 2 launches, stunned = 1 launch (FR6.5, kit p.4). */
export interface CrewStatus {
  state: 'ready' | 'injured' | 'stunned';
  /** Launches the member must sit out; only meaningful when not 'ready'. */
  launchesLeft: number;
}

/** Per-mission ladder status; `failCount` drives the flat +2 retry penalty (FR5.1). */
export interface MissionStatus {
  state: 'pending' | 'active' | 'done';
  failCount: number;
}

/** Side-mission record: `fails` drives the flat +1 retry penalty (FR7.1). */
export interface SideMissionStatus {
  status: 'open' | 'flown';
  fails: number;
}

/** One recorded phase resolution (spec §4.1 PhaseResolution sketch). */
export interface PhaseResult {
  phase: string;
  drawnCard: CardId;
  total: number;
  difficulty: number;
  margin: number;
  outcome: 'success' | 'minor' | 'major' | 'minorRepaired' | 'majorRepaired';
  repairPaid: CardId[];
}

/** Mission declared at launchMission (ruling 29: resolved at endTurn). */
export interface PendingLaunch {
  missionId: MissionId;
  crew: CardId[];
  /** Support techs ready at launch, snapshotted before timer decrements (FR6.5). */
  supportTechs: CardId[];
  /**
   * Equipment pre-bid for phase 1 chosen at launch (ruling 3). Cards stay in
   * `hand` but are reserved — unspendable until the phase-1 window resolves them.
   */
  reservedPrebid: CardId[];
}

/** In-flight mission resolution state (created at endTurn, cleared on completion/failure). */
export interface ActiveMission {
  missionId: MissionId;
  crew: CardId[];
  /** Techs providing support, snapshotted at launch (FR6.5 timing, ruling 7). */
  supportTechs: CardId[];
  /** Reserved pre-bid carried from launch; spent when phase 1 draws. */
  reservedPrebid: CardId[];
  phaseIndex: number;
  results: PhaseResult[];
  kraftUsed: boolean;
  rerollUsed: boolean;
  /** The card drawn for the current phase (while an ability/repair window is open). */
  drawnCard?: CardId;
  /**
   * Check total for the current phase excluding Kraft, stored so ability-window
   * moves can recompute after a +2 (kraft) or a fresh draw (reroll) without
   * re-deriving the already-spent pre-bid/boost values.
   */
  currentBase?: number;
}

/**
 * An open decision window. `phase` on GameState mirrors the window where the
 * spec names one; `pending` always carries the discriminating detail.
 */
export type PendingDecision =
  | { kind: 'prebid'; phaseIndex: number }
  | { kind: 'ability'; phaseIndex: number; canKraft: boolean; canReroll: boolean }
  | { kind: 'repair'; phaseIndex: number; outcome: 'minor' | 'major'; cost: number }
  | { kind: 'handLimit'; excess: number };

/** Entry for the scrolling action log (FR11.2). */
export interface LogEntry {
  turn: number;
  kind: 'system' | 'action' | 'mission' | 'event' | 'soviet' | 'turn';
  text: string;
}

/** Running VP ledger (FR10.1); penalties are subtracted by scoreGame. */
export interface VpLedger {
  mission: number;
  side: number;
  program: number;
  penaltyFailures: number;
  penaltyMilestones: number;
}

/** The complete game state; all fields are replaced copy-on-write by apply(). */
export interface GameState {
  readonly seed: string;
  readonly rngState: RngState;
  readonly content: Content;
  readonly turn: number;
  readonly year: number;
  readonly phase: Phase;
  readonly result?: GameResult;
  readonly hand: CardId[];
  readonly deck: CardId[];
  readonly discard: CardId[];
  readonly inPlay: CardId[];
  readonly resources: { money: number; rd: number };
  readonly actionsLeft: number;
  /** Action loss accumulated by Apollo 1 Fire, applied to the next action phase. */
  readonly pendingActionLoss: number;
  /** Action loss carried into the current turn (applied when the draw phase opens). */
  readonly turnActionLoss: number;
  readonly tech: Record<TechId, boolean>;
  readonly crewPool: Record<CardId, CrewStatus>;
  readonly soviet: {
    readonly position: number;
    /** Highest position ever reached; milestones bite once each (interpretation 1). */
    readonly maxPosition: number;
    readonly reachedFinal: boolean;
  };
  readonly campaign: { readonly index: number; readonly status: MissionStatus[] };
  readonly sideMissions: Record<string, SideMissionStatus>;
  readonly perks: PerkId[];
  readonly vp: VpLedger;
  readonly pending?: PendingDecision;
  readonly pendingLaunch?: PendingLaunch;
  readonly mission?: ActiveMission;
  /** Per-turn-limited dev discounts already consumed this turn (e.g. Hamilton). */
  readonly devDiscountsUsedThisTurn: CardId[];
  readonly log: LogEntry[];
  readonly moves: readonly Move[];
}

/**
 * Mutable view of GameState for reducer internals: copy-on-write handlers clone
 * the state shallowly and replace only the collections they touch, preserving
 * structural sharing across snapshots (spec §4.2).
 */
export type Mutable<T> = { -readonly [K in keyof T]: T[K] };

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/** Builds the per-mission status table in ladder order. */
function initialMissionStatus(content: Content): MissionStatus[] {
  return content.missions.map(() => ({ state: 'pending' as const, failCount: 0 }));
}

/** Builds the side-mission table from the four ace rows. */
function initialSideMissions(content: Content): Record<string, SideMissionStatus> {
  const table: Record<string, SideMissionStatus> = {};
  for (const card of content.cards) {
    if (card.kind === 'sideMission') table[card.id] = { status: 'open', fails: 0 };
  }
  return table;
}

/** All tech flags start undeveloped. */
function initialTech(content: Content): Record<TechId, boolean> {
  const tech: Record<TechId, boolean> = {};
  for (const item of content.techTree) tech[item.id] = false;
  return tech;
}

/**
 * Creates a new game: shuffled fate deck, empty hand, turn 1 / 1960, phase 'draw'.
 *
 * @param seed - shareable seed string; identical seeds give identical games.
 * @param content - validated content bundle (cards, missions, tech, events, tuning).
 * @returns the initial GameState, ready for `resolvePhase` to open the first draw.
 */
export function newGame(seed: string, content: Content): GameState {
  const instances: CardId[] = content.cards.flatMap((card) => [card.id, card.id]);
  const rngState = createRng(seed);
  const shuffled = shuffle(rngState, instances);
  const t = content.tuning;
  return {
    seed,
    rngState: shuffled.state,
    content,
    turn: 1,
    year: 1960 + Math.floor((1 - 1) / t.turnsPerYear),
    phase: 'draw',
    hand: [],
    deck: shuffled.value,
    discard: [],
    inPlay: [],
    resources: { money: t.startingMoney, rd: t.startingRd },
    actionsLeft: 0,
    pendingActionLoss: 0,
    turnActionLoss: 0,
    tech: initialTech(content),
    crewPool: {},
    soviet: { position: 0, maxPosition: 0, reachedFinal: false },
    campaign: { index: 0, status: initialMissionStatus(content) },
    sideMissions: initialSideMissions(content),
    perks: [],
    vp: { mission: 0, side: 0, program: 0, penaltyFailures: 0, penaltyMilestones: 0 },
    devDiscountsUsedThisTurn: [],
    log: [{ turn: 1, kind: 'system', text: `New game (seed ${seed})` }],
    moves: [],
  };
}

// ---------------------------------------------------------------------------
// Small pure helpers used across modules
// ---------------------------------------------------------------------------

/** Looks up a card in the content bundle (throws on unknown ids). */
export function cardOf(state: GameState, id: CardId) {
  const card = state.content.cards.find((c) => c.id === id);
  if (!card) throw new Error(`unknown card id: ${id}`);
  return card;
}

/** The mission the campaign index currently points at (the next to fly). */
export function currentMission(state: GameState) {
  const mission = state.content.missions[state.campaign.index];
  if (!mission) throw new Error('campaign exhausted');
  return mission;
}

/** Number of crew slots for a program (FR6.1: Mercury 1, Gemini 2, Apollo 3). */
export function crewSlots(state: GameState, program: Program): number {
  return state.content.tuning.crewSlots[program];
}

/** Appends a log entry onto a mutable draft (copy-on-write on `log`). */
export function appendLog(draft: Mutable<GameState>, kind: LogEntry['kind'], text: string): void {
  draft.log = [...draft.log, { turn: draft.turn, kind, text }];
}

/**
 * Draws one card from the fate deck, reshuffling the discard pile when the deck
 * is exhausted (FR2.3). Does NOT resolve jokers — callers handle events (FR3.2).
 *
 * @throws if deck and discard are both empty (unreachable with legal play; §4.4).
 */
export function drawCardFromDeck(draft: Mutable<GameState>): CardId {
  if (draft.deck.length === 0) {
    if (draft.discard.length === 0) {
      throw new Error('invariant violated: no cards left to draw (108-card partition broken)');
    }
    const rng = shuffle(draft.rngState, draft.discard);
    draft.rngState = rng.state;
    draft.deck = rng.value;
    draft.discard = [];
  }
  const deck = [...draft.deck];
  const card = deck.pop();
  if (card === undefined) throw new Error('deck empty after reshuffle');
  draft.deck = deck;
  return card;
}

// ---------------------------------------------------------------------------
// Card spending — two deck copies may share a row id, so spending must remove
// exactly ONE instance from the named zone(s), never a value-filter over a
// whole zone (that would eat both copies and break the 108-card partition).
// Source convention when an id exists in several zones: hand first, then
// in-play; pool persons only when found nowhere else.
// ---------------------------------------------------------------------------

/** Removes one instance of `id` from a zone copy, or null when absent. */
function withoutOne(zone: readonly CardId[], id: CardId): CardId[] | null {
  const idx = zone.indexOf(id);
  if (idx < 0) return null;
  return [...zone.slice(0, idx), ...zone.slice(idx + 1)];
}

/**
 * Spends `ids` from the hand (preferred) or in-play zone.
 *
 * @returns ids that were in neither zone — callers treat those as pool persons.
 */
export function spendFromHandOrPlay(
  draft: Mutable<GameState>,
  ids: readonly CardId[],
): CardId[] {
  const missing: CardId[] = [];
  for (const id of ids) {
    const fromHand = withoutOne(draft.hand, id);
    if (fromHand) {
      draft.hand = fromHand;
      continue;
    }
    const fromPlay = withoutOne(draft.inPlay, id);
    if (fromPlay) {
      draft.inPlay = fromPlay;
      continue;
    }
    missing.push(id);
  }
  return missing;
}

/** Spends `ids` from the in-play zone only (held bonuses/boosts). */
export function spendFromPlay(draft: Mutable<GameState>, ids: readonly CardId[]): CardId[] {
  const missing: CardId[] = [];
  for (const id of ids) {
    const fromPlay = withoutOne(draft.inPlay, id);
    if (fromPlay) draft.inPlay = fromPlay;
    else missing.push(id);
  }
  return missing;
}

/** Spends `ids` from the hand only; throws when an id is absent. */
export function spendFromHand(draft: Mutable<GameState>, ids: readonly CardId[]): void {
  for (const id of ids) {
    const fromHand = withoutOne(draft.hand, id);
    if (!fromHand) throw new Error(`card not in hand: ${id}`);
    draft.hand = fromHand;
  }
}
