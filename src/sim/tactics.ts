/**
 * Tactics — the shared decision core behind the three bracketing policies
 * (spec §6): the pre-bid / ability / repair / hand-limit windows and the
 * action-phase priority steps, each parameterised by a `Tactics` profile so
 * `policy.ts` stays a thin priority-ordering layer over one code path.
 *
 * Sits above the engine and uses only its public surface (spec §3 layering).
 * Decisions are deterministic — ties break on card id — so a seed fully
 * determines a game (NFR2). Choices against the unknown fate card use the
 * deck's expected draw value; policies plan against averages, never peek.
 */

import {
  applyAbility,
  abilitiesOf,
  bonusValue,
  canKraft,
  canReroll,
  cardById,
  crewSlots,
  crewValue,
  currentMission,
  effectiveRdCost,
  kraftAmount,
  missionById,
  missionPhaseTotal,
  phaseDifficulty,
  sideMissionDifficulty,
  supportTechsAtLaunch,
  techById,
  type ActiveMission,
  type CardId,
  type Content,
  type GameState,
  type Mission,
  type Move,
  type PhaseName,
  type TechItem,
} from '../engine';

// ---------------------------------------------------------------------------
// Tunable decision profile
// ---------------------------------------------------------------------------

/** Action-phase priority ordering (spec §6: rush / steady / hoard). */
export type Flow = 'rush' | 'steady' | 'hoard';

/** How aggressive a policy is at each decision point. */
export interface Tactics {
  flow: Flow;
  /** Cards kept back as repair/pre-bid fuel instead of cashed (baseline "hold ~2"). */
  fuelReserve: number;
  /** Margin added to the expected draw when pre-bidding (higher = pre-bid more). */
  prebidSafety: number;
  /** Spare ready astronauts kept beyond the current mission's crew slots. */
  spareCrew: number;
  /** Repair fuel tiers this policy burns: 1 = hand, 2 = +in play, 3 = +pool spares. */
  repairTiers: 1 | 2 | 3;
  /** Fly a side mission when the pass chance is at least this (FR7.1). */
  sideMissionChance: number;
}

// ---------------------------------------------------------------------------
// Deck statistics — expectations over the fate deck's keepable rows
// ---------------------------------------------------------------------------

interface DeckStats {
  mean: number;
  /** Strength values of keepable rows (jokers redraw, FR3.2), sorted asc. */
  values: number[];
}

const deckStatsCache = new WeakMap<Content, DeckStats>();

function deckStats(content: Content): DeckStats {
  const cached = deckStatsCache.get(content);
  if (cached) return cached;
  const values: number[] = [];
  for (const card of content.cards) {
    if (card.kind === 'event') continue;
    for (let copy = 0; copy < 2; copy++) values.push(card.s);
  }
  values.sort((a, b) => a - b);
  const stats: DeckStats = {
    mean: values.reduce((sum, s) => sum + s, 0) / values.length,
    values,
  };
  deckStatsCache.set(content, stats);
  return stats;
}

/** Expected strength of one fate draw (jokers redraw, so only keepable rows count). */
export function expectedDrawValue(content: Content): number {
  return deckStats(content).mean;
}

/** Probability that a fate draw meets or beats `target`. */
export function drawAtLeastChance(content: Content, target: number): number {
  const { values } = deckStats(content);
  let hit = 0;
  for (const s of values) if (s >= target) hit++;
  return hit / values.length;
}

// ---------------------------------------------------------------------------
// Mission-chain math (reuses the engine's phase formulas verbatim)
// ---------------------------------------------------------------------------

/** Any card row works as the draw placeholder — its s is subtracted again. */
function placeholderCard(content: Content): { id: CardId; s: number } {
  const row = content.cards.find((c) => c.kind !== 'event') ?? content.cards[0];
  return { id: row.id, s: row.s };
}

/**
 * The fixed part of a phase check (crew + tech support + perks) with the
 * fate draw, pre-bid and boosts at zero — what the mission contributes no
 * matter which card turns up.
 */
export function phaseFixedBonus(state: GameState, mission: ActiveMission, phase: PhaseName): number {
  const dummy = placeholderCard(state.content);
  return (
    missionPhaseTotal(state, mission, phase, dummy.id, [], [], false) -
    cardById(state.content, dummy.id).s
  );
}

/** Expected phase-check total with no pre-bid, for launch-readiness gating. */
function expectedPhaseMargin(state: GameState, mission: Mission): number {
  const active: ActiveMission = {
    missionId: mission.id,
    crew: bestCrew(state, mission),
    supportTechs: supportTechsAtLaunch(state),
    reservedPrebid: [],
    phaseIndex: 0,
    results: [],
    kraftUsed: false,
    rerollUsed: false,
  };
  const draw = expectedDrawValue(state.content);
  let worst = Infinity;
  for (const phase of mission.chain) {
    const margin = phaseFixedBonus(state, active, phase) + draw - phaseDifficulty(state, mission, phase);
    worst = Math.min(worst, margin);
  }
  return worst;
}

/**
 * Best crew fill for a launch: exactly `crewSlots` ready non-tech pool
 * members, ranked by crew bonus plus named phase boosts over the mission's
 * chain (FR6.1/FR6.6). Ties break on card id (determinism).
 */
export function bestCrew(state: GameState, mission: Mission): CardId[] {
  const phases = mission.chain;
  const score = (id: CardId): number => {
    const card = cardById(state.content, id);
    let total = crewValue(card.s);
    for (const ability of abilitiesOf(card)) {
      for (const phase of phases) {
        const effect = applyAbility(ability, { kind: 'phase', phase, side: 'campaign' });
        if (effect?.kind === 'add') total += effect.amount;
      }
    }
    return total;
  };
  return Object.entries(state.crewPool)
    .filter(([id, status]) => status.state === 'ready' && cardById(state.content, id).named?.role !== 'tech')
    .map(([id]) => id)
    .sort((a, b) => score(b) - score(a) || a.localeCompare(b))
    .slice(0, crewSlots(state, mission.program));
}

// ---------------------------------------------------------------------------
// Spendable-card enumeration (mirrors legal.ts's multiset source rules)
// ---------------------------------------------------------------------------

/** One spendable instance with the points it contributes where it is spent. */
export interface CardInstance {
  id: CardId;
  /** Check points as pre-bid/boost, or repair points as fuel. */
  value: number;
  /** 1 = hand, 2 = in play, 3 = crew pool (repair fuel tiers). */
  tier: 1 | 2 | 3;
}

function countIn(zone: readonly CardId[], id: CardId): number {
  let n = 0;
  for (const x of zone) if (x === id) n++;
  return n;
}

/** Equipment spendable as pre-bid (hand + in play, minus reserved instances). */
export function availableEquipment(state: GameState): CardInstance[] {
  const reserved = new Map<string, number>();
  for (const id of state.mission?.reservedPrebid ?? []) reserved.set(id, (reserved.get(id) ?? 0) + 1);
  const out: CardInstance[] = [];
  for (const id of new Set([...state.hand, ...state.inPlay])) {
    const row = cardById(state.content, id);
    if (row.kind !== 'equipment') continue;
    const available = countIn(state.hand, id) + countIn(state.inPlay, id) - (reserved.get(id) ?? 0);
    for (let i = 0; i < available; i++) out.push({ id, value: row.s, tier: countIn(state.hand, id) > 0 ? 1 : 2 });
  }
  return out;
}

/** Held bonuses spendable as boosts (in play only, rulings 4/15). */
export function availableBonuses(state: GameState): CardInstance[] {
  const out: CardInstance[] = [];
  for (const id of state.inPlay) {
    const row = cardById(state.content, id);
    if (row.kind !== 'bonus') continue;
    out.push({ id, value: bonusValue(row.s), tier: 2 });
  }
  return out;
}

/**
 * Repair fuel per validateSelection 'fuel' rules (FR5.5): persons and
 * equipment from hand, equipment/bonuses in play, and pool persons that are
 * not assigned to the in-flight mission (ruling 24).
 */
export function repairFuel(state: GameState): CardInstance[] {
  const out: CardInstance[] = [];
  const assigned = new Set(state.mission?.crew ?? []);
  for (const id of new Set(state.hand)) {
    const row = cardById(state.content, id);
    if (row.kind === 'person' || row.kind === 'equipment') {
      const n = countIn(state.hand, id);
      for (let i = 0; i < n; i++) out.push({ id, value: row.s, tier: 1 });
    }
  }
  for (const id of state.inPlay) {
    const row = cardById(state.content, id);
    if (row.kind === 'equipment') out.push({ id, value: row.s, tier: 2 });
    else if (row.kind === 'bonus') out.push({ id, value: bonusValue(row.s), tier: 2 });
  }
  for (const id of Object.keys(state.crewPool)) {
    if (assigned.has(id)) continue;
    out.push({ id, value: cardById(state.content, id).s, tier: 3 });
  }
  return out;
}

/**
 * Cheapest cover for `need` points: smallest instances first, then a trim
 * pass dropping any instance the cover no longer needs. Returns the picked
 * instances; their summed value may exceed `need` but is minimal-ish for the
 * available sizes (never worse than one overshooting card).
 */
export function coverWith(instances: readonly CardInstance[], need: number): CardInstance[] {
  const sorted = [...instances].sort((a, b) => a.value - b.value || a.id.localeCompare(b.id));
  const picked: CardInstance[] = [];
  let total = 0;
  for (const inst of sorted) {
    if (total >= need) break;
    picked.push(inst);
    total += inst.value;
  }
  if (total < need) return []; // cannot cover — caller decides to skip/decline
  const trimmed = [...picked].sort((a, b) => b.value - a.value || b.id.localeCompare(a.id));
  for (const inst of trimmed) {
    if (total - inst.value >= need) {
      picked.splice(picked.indexOf(inst), 1);
      total -= inst.value;
    }
  }
  return picked.sort((a, b) => a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------------------
// Window decisions
// ---------------------------------------------------------------------------

/** Pre-bid window: cover the expected shortfall against the phase difficulty. */
function choosePrebid(state: GameState, tactics: Tactics): Move {
  const mission = state.mission;
  if (!mission) throw new Error('pre-bid window without a mission');
  const def = missionById(state.content, mission.missionId);
  const phase = def.chain[mission.phaseIndex];
  const difficulty = phaseDifficulty(state, def, phase);
  const shortfall =
    difficulty + tactics.prebidSafety - phaseFixedBonus(state, mission, phase) - expectedDrawValue(state.content);
  if (shortfall <= 0) return { t: 'resolvePhase', prebid: [], boost: [] };

  const prebid = coverWith(availableEquipment(state), shortfall);
  const covered = prebid.reduce((sum, inst) => sum + inst.value, 0);
  const boost =
    covered < shortfall ? coverWith(availableBonuses(state), shortfall - covered) : [];
  return { t: 'resolvePhase', prebid: prebid.map((inst) => inst.id), boost: boost.map((inst) => inst.id) };
}

/**
 * Kraft/Kranz window (ruling 9): use Kraft when its +2 turns the phase into a
 * success; else Kranz when a fresh draw wins at least half the time; else let
 * the failure fall through to the repair window.
 */
function chooseAbility(state: GameState): Move {
  const mission = state.mission;
  if (!mission) throw new Error('ability window without a mission');
  const def = missionById(state.content, mission.missionId);
  const phase = def.chain[mission.phaseIndex];
  const difficulty = phaseDifficulty(state, def, phase);
  const base = mission.currentBase ?? 0;

  if (canKraft(state, mission) && base + kraftAmount(state, mission) >= difficulty) {
    return { t: 'resolveAbility', use: 'kraft' };
  }
  if (canReroll(state, mission) && mission.drawnCard !== undefined) {
    const needed = difficulty - (base - cardById(state.content, mission.drawnCard).s);
    if (drawAtLeastChance(state.content, needed) >= 0.5) {
      return { t: 'resolveAbility', use: 'reroll' };
    }
  }
  return { t: 'resolveAbility' };
}

/**
 * Repair window (FR5.5): paying salvages the phase and always beats losing
 * the mission, so pay with the cheapest fuel the tactics allow — and on the
 * final mission burn anything that is not flying (endgame desperation).
 */
function chooseRepair(state: GameState, tactics: Tactics): Move {
  const pending = state.pending;
  if (pending?.kind !== 'repair') throw new Error('repair window without a repair pending');
  const finalMission = currentMission(state) === state.content.missions[state.content.missions.length - 1];
  const tiers = finalMission ? 3 : tactics.repairTiers;
  const usable = repairFuel(state).filter((inst) => inst.tier <= tiers);
  const payment = coverWith(usable, pending.cost);
  if (payment.length === 0) return { t: 'payRepair', cards: [] };
  return { t: 'payRepair', cards: payment.map((inst) => inst.id) };
}

/** Hand-limit window (ruling 27): drop exactly `excess` lowest-value cards. */
function chooseDiscard(state: GameState): Move {
  const pending = state.pending;
  if (pending?.kind !== 'handLimit') throw new Error('hand-limit window without a pending trim');
  const drop = [...state.hand]
    .sort((a, b) => keepValue(state, a) - keepValue(state, b) || a.localeCompare(b))
    .slice(0, pending.excess);
  return { t: 'discardForLimit', cards: drop };
}

// ---------------------------------------------------------------------------
// Action-phase steps
// ---------------------------------------------------------------------------

/** Keep-score of a card: how worth holding onto it is (fuel > crew > cash). */
function keepValue(state: GameState, id: CardId): number {
  const row = cardById(state.content, id);
  const weight =
    row.kind === 'equipment' ? 50 : row.kind === 'bonus' ? 45 : row.kind === 'person' ? 40 : row.kind === 'sideMission' ? 35 : 5;
  return weight + row.s;
}

function recruitScore(state: GameState, id: CardId): number {
  const row = cardById(state.content, id);
  let total = row.named?.role === 'tech' ? 1 : 0;
  total += crewValue(row.s);
  const mission = currentMission(state);
  for (const ability of abilitiesOf(row)) {
    for (const phase of mission.chain) {
      const effect = applyAbility(ability, { kind: 'phase', phase, side: 'campaign' });
      if (effect?.kind === 'add') total += effect.amount;
    }
  }
  return total;
}

type Step = (state: GameState, legal: readonly Move[], tactics: Tactics) => Move | null;

function pickBest<T extends Move>(moves: readonly T[], score: (move: T) => number): T | null {
  if (moves.length === 0) return null;
  return [...moves].sort(
    (a, b) => score(b) - score(a) || JSON.stringify(a).localeCompare(JSON.stringify(b)),
  )[0];
}

function stepRecruit(state: GameState, legal: readonly Move[], tactics: Tactics): Move | null {
  const people = legal.filter(
    (m): m is Extract<Move, { t: 'playCard' }> =>
      m.t === 'playCard' && m.mode === 'identity' && cardById(state.content, m.card).kind === 'person',
  );
  if (people.length === 0) return null;
  const slots = crewSlots(state, currentMission(state).program);
  const ready = Object.entries(state.crewPool).filter(
    ([id, s]) => s.state === 'ready' && cardById(state.content, id).named?.role !== 'tech',
  ).length;
  const isTech = (m: Extract<Move, { t: 'playCard' }>) => cardById(state.content, m.card).named?.role === 'tech';
  const astronauts = people.filter((m) => !isTech(m));
  const techs = people.filter(isTech);

  if (astronauts.length > 0 && ready < slots + tactics.spareCrew) {
    return pickBest(astronauts, (m) => recruitScore(state, m.card));
  }
  if (techs.length > 0) {
    return pickBest(techs, (m) => recruitScore(state, m.card));
  }
  return null;
}

/**
 * Development priority: hardware the current mission needs first, then later
 * missions' requirements in ladder order (nothing skips — FR4.3).
 */
function stepDevelop(state: GameState, legal: readonly Move[]): Move | null {
  const moves = legal.filter((m): m is Extract<Move, { t: 'developTech' }> => m.t === 'developTech');
  if (moves.length === 0) return null;
  const rank = (tech: TechItem): number => {
    for (let i = state.campaign.index; i < state.content.missions.length; i++) {
      const idx = state.content.missions[i].requires.indexOf(tech.id);
      if (idx >= 0) return (i - state.campaign.index) * 10 + idx;
    }
    return 999;
  };
  return pickBest(moves, (m) => -rank(techById(state.content, m.tech)));
}

/** Conservative launch gate: wait for a solid margin or decent fuel stocks. */
function launchGatePasses(state: GameState): boolean {
  const mission = currentMission(state);
  if (mission === state.content.missions[state.content.missions.length - 1]) return true;
  if (expectedPhaseMargin(state, mission) >= 1) return true;
  const fuel = repairFuel(state)
    .filter((inst) => inst.tier <= 2)
    .reduce((sum, inst) => sum + inst.value, 0);
  return fuel >= 8 || state.turn >= 24;
}

function stepLaunch(state: GameState, legal: readonly Move[], tactics: Tactics): Move | null {
  const canonical = legal.find((m) => m.t === 'launchMission');
  if (!canonical) return null;
  if (tactics.flow === 'hoard' && !launchGatePasses(state)) return null;
  const mission = currentMission(state);
  return { t: 'launchMission', mission: mission.id, crew: bestCrew(state, mission), prebid: [] };
}

function stepSideMission(state: GameState, legal: readonly Move[], tactics: Tactics): Move | null {
  for (const move of legal) {
    if (move.t !== 'flySideMission') continue;
    const record = state.sideMissions[move.ace];
    const difficulty = sideMissionDifficulty(state, record?.fails ?? 0);
    if (drawAtLeastChance(state.content, difficulty) >= tactics.sideMissionChance) {
      return { t: 'flySideMission', ace: move.ace, prebid: [], boost: [] };
    }
    // Find the smallest pre-bid that lifts the pass chance over the threshold.
    for (let extra = 1; extra <= 12; extra++) {
      if (drawAtLeastChance(state.content, difficulty - extra) < tactics.sideMissionChance) continue;
      const prebid = coverWith(availableEquipment(state), extra);
      const boost =
        prebid.reduce((sum, inst) => sum + inst.value, 0) < extra
          ? coverWith(availableBonuses(state), extra - prebid.reduce((sum, inst) => sum + inst.value, 0))
          : [];
      const total = [...prebid, ...boost].reduce((sum, inst) => sum + inst.value, 0);
      if (drawAtLeastChance(state.content, difficulty - total) >= tactics.sideMissionChance) {
        return {
          t: 'flySideMission',
          ace: move.ace,
          prebid: prebid.map((inst) => inst.id),
          boost: boost.map((inst) => inst.id),
        };
      }
      break;
    }
  }
  return null;
}

/** Move held Bonus cards into play — they only boost or repair from there. */
function stepHold(state: GameState, legal: readonly Move[], tactics: Tactics): Move | null {
  if (state.inPlay.length >= tactics.fuelReserve) return null;
  const reserved = new Set(state.pendingLaunch?.reservedPrebid ?? []);
  const bonus = state.hand.find((id) => !reserved.has(id) && cardById(state.content, id).kind === 'bonus');
  if (!bonus) return null;
  return legal.find((m) => m.t === 'playCard' && m.card === bonus && m.mode === 'identity') ?? null;
}

/** Resource mode toward the next wanted tech's remaining cost (cash the rest). */
function preferredMode(state: GameState): 'money' | 'rd' {
  let want: TechItem | undefined;
  for (let i = state.campaign.index; i < state.content.missions.length && !want; i++) {
    for (const req of state.content.missions[i].requires) {
      if (!state.tech[req]) {
        want = techById(state.content, req);
        break;
      }
    }
  }
  if (!want) return state.resources.rd < state.resources.money ? 'rd' : 'money';
  const rdNeed = Math.max(0, effectiveRdCost(state, want) - state.resources.rd);
  const moneyNeed = Math.max(0, want.moneyCost - state.resources.money);
  return rdNeed > moneyNeed ? 'rd' : 'money';
}

function stepCash(state: GameState, legal: readonly Move[], tactics: Tactics): Move | null {
  const reserved = new Set(state.pendingLaunch?.reservedPrebid ?? []);
  const keepCount = Math.min(tactics.fuelReserve, state.hand.length);
  const keepers = new Set(
    [...state.hand]
      .filter((id) => !reserved.has(id))
      .sort((a, b) => keepValue(state, b) - keepValue(state, a) || a.localeCompare(b))
      .slice(0, keepCount),
  );
  const cashables = legal.filter(
    (m): m is Extract<Move, { t: 'playCard' }> =>
      m.t === 'playCard' && m.mode !== 'identity' && !keepers.has(m.card) && !reserved.has(m.card),
  );
  if (cashables.length === 0) return null;
  const worst = [...new Set(cashables.map((m) => m.card))].sort(
    (a, b) => keepValue(state, a) - keepValue(state, b) || a.localeCompare(b),
  )[0];
  const mode = preferredMode(state);
  return (
    cashables.find((m) => m.card === worst && m.mode === mode) ??
    cashables.find((m) => m.card === worst) ??
    null
  );
}

function stepEndTurn(): Move {
  return { t: 'endTurn' };
}

const FLOWS: Record<Flow, Step[]> = {
  // Rush the ladder: launch the moment it is legal, hold almost nothing.
  rush: [stepRecruit, stepLaunch, stepDevelop, stepSideMission, stepHold, stepCash, stepEndTurn],
  // Spec §6 baseline: develop when affordable → launch when ready → hold ~2 → cash.
  steady: [stepRecruit, stepDevelop, stepLaunch, stepSideMission, stepHold, stepCash, stepEndTurn],
  // Hoards repair/crew and delays launches behind a readiness gate.
  hoard: [stepRecruit, stepDevelop, stepHold, stepSideMission, stepLaunch, stepCash, stepEndTurn],
};

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Picks the next move for `state` under `tactics` (spec §6 Policy.choose).
 *
 * @param state - current game state (any phase).
 * @param legal - canonical enumeration from `legalMoves(state)`; richer
 *   selections (crew sets, pre-bid, repair fuel) are constructed here and
 *   re-validated by `apply()` (legal.ts contract).
 * @param tactics - the calling policy's decision profile.
 * @returns the move to apply; always legal for `state`.
 */
export function chooseMove(state: GameState, legal: readonly Move[], tactics: Tactics): Move {
  switch (state.phase) {
    case 'draw':
      return { t: 'resolvePhase' };
    case 'prebid':
      return choosePrebid(state, tactics);
    case 'mission':
      return chooseAbility(state);
    case 'repair':
      return chooseRepair(state, tactics);
    case 'upkeep':
      return chooseDiscard(state);
    case 'actions': {
      if (state.actionsLeft <= 0) return { t: 'endTurn' };
      for (const step of FLOWS[tactics.flow]) {
        const move = step(state, legal, tactics);
        if (move) return move;
      }
      return { t: 'endTurn' };
    }
    case 'gameOver':
      throw new Error('chooseMove called after game over');
  }
}
