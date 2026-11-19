/**
 * Legal moves — `validateMove` (authoritative, with human-readable reasons)
 * and `legalMoves` (canonical enumeration for UI hints and auto-play policies).
 *
 * Spec §4.1 phrases apply() as "validates against legalMoves"; combinatorial
 * windows (pre-bid subsets, crew sets, repair payments) make full enumeration
 * exponential, so validation is a direct predicate and legalMoves returns one
 * canonical move per available action (empty selections where choices exist).
 * Policies may construct richer moves — apply() re-validates them either way.
 */

import { cardById } from './content';
import type { CardId, TechItem } from './content';
import { effectiveRdCost } from './economy';
import { canKraft, canReroll } from './phases';
import type { GameState } from './state';
import { currentMission, crewSlots } from './state';
import type { Move } from './moves';

/** Returns null when the move is legal, else the reason it is rejected. */
export function validateMove(state: GameState, move: Move): string | null {
  if (state.phase === 'gameOver') return 'the game is over';

  switch (move.t) {
    case 'playCard':
      return validatePlayCard(state, move.card, move.mode);
    case 'developTech':
      return validateDevelopTech(state, move.tech);
    case 'launchMission':
      return validateLaunchMission(state, move.mission, move.crew, move.prebid);
    case 'resolvePhase':
      return validateResolvePhase(state, move.prebid ?? [], move.boost ?? []);
    case 'resolveAbility':
      return validateResolveAbility(state, move.use);
    case 'payRepair':
      return validatePayRepair(state, move.cards);
    case 'flySideMission':
      return validateFlySideMission(state, move.ace, move.prebid ?? [], move.boost ?? []);
    case 'discardForLimit':
      return validateDiscardForLimit(state, move.cards);
    case 'endTurn':
      return state.phase === 'actions' ? null : 'endTurn is only legal during the action phase';
    default: {
      const exhaustive: never = move;
      return `unknown move: ${JSON.stringify(exhaustive)}`;
    }
  }
}

function inActions(state: GameState): string | null {
  return state.phase === 'actions' ? null : 'action is only legal during the action phase';
}

function hasAction(state: GameState): string | null {
  return state.actionsLeft >= 1 ? null : 'no actions left this turn';
}

function validatePlayCard(state: GameState, card: CardId, mode: string): string | null {
  const phaseReason = inActions(state);
  if (phaseReason) return phaseReason;
  const actionReason = hasAction(state);
  if (actionReason) return actionReason;
  if (!state.hand.includes(card)) return 'card not in hand';
  if (state.pendingLaunch?.reservedPrebid.includes(card)) {
    return 'card is reserved for the mission pre-bid';
  }
  const row = cardById(state.content, card);
  if (row.kind === 'event') return 'jokers resolve on draw and never enter the hand';
  if (mode === 'money' || mode === 'rd') return null;
  if (row.kind === 'sideMission') return 'use flySideMission to fly a side mission';
  if (row.kind === 'person' && card in state.crewPool) {
    return `${row.named?.name ?? card} is already in the crew pool (one person, one slot)`;
  }
  return null;
}

function validateDevelopTech(state: GameState, tech: string): string | null {
  const phaseReason = inActions(state);
  if (phaseReason) return phaseReason;
  const actionReason = hasAction(state);
  if (actionReason) return actionReason;
  const item = state.content.techTree.find((t) => t.id === tech);
  if (!item) return `unknown tech: ${tech}`;
  if (state.tech[tech]) return `${item.name} is already developed`;
  const gate = unlockReason(state, item);
  if (gate) return gate;
  const rd = effectiveRdCost(state, item);
  if (state.resources.rd < rd) return `not enough R&D (need ${rd}, have ${state.resources.rd})`;
  if (state.resources.money < item.moneyCost) {
    return `not enough Money (need ${item.moneyCost}, have ${state.resources.money})`;
  }
  return null;
}

/** Program-milestone gate (FR4.3, ruling 12). */
function unlockReason(state: GameState, item: TechItem): string | null {
  if (!item.unlocksAfter) return null;
  const { program, minCompleted } = item.unlocksAfter;
  const done = state.content.missions.filter((m, i) => m.program === program && state.campaign.status[i].state === 'done');
  if (done.length >= minCompleted) return null;
  return `${item.name} requires ${minCompleted} completed ${program} mission(s) (${done.length})`;
}

function validateLaunchMission(
  state: GameState,
  missionId: string,
  crew: CardId[],
  prebid: CardId[],
): string | null {
  const phaseReason = inActions(state);
  if (phaseReason) return phaseReason;
  const actionReason = hasAction(state);
  if (actionReason) return actionReason;
  if (state.pendingLaunch) return 'a mission is already in flight this turn';
  const mission = state.content.missions.find((m) => m.id === missionId);
  if (!mission) return `unknown mission: ${missionId}`;
  if (currentMission(state).id !== missionId) {
    return `the campaign is flying ${currentMission(state).name} next`;
  }
  for (const req of mission.requires) {
    if (!state.tech[req]) {
      const item = state.content.techTree.find((t) => t.id === req);
      return `missing hardware: ${item?.name ?? req}`;
    }
  }
  const slots = crewSlots(state, mission.program);
  if (new Set(crew).size !== crew.length) return 'duplicate crew selection';
  if (crew.length !== slots) return `requires exactly ${slots} crew for ${mission.program} missions`;
  for (const id of crew) {
    const status = state.crewPool[id];
    if (!status) return `${id} is not in the crew pool`;
    const row = cardById(state.content, id);
    if (row.named?.role === 'tech') return `techs cannot fill crew slots (${row.named.name})`;
    if (status.state !== 'ready') return `${row.named?.name ?? id} is ${status.state} and cannot fly`;
  }
  const prebidReason = validateSelection(state, prebid, 'equipment', false);
  if (prebidReason) return prebidReason;
  return null;
}

function validateResolvePhase(state: GameState, prebid: CardId[], boost: CardId[]): string | null {
  if (state.phase === 'draw') {
    if (prebid.length || boost.length) return 'the draw phase takes no selections';
    return null;
  }
  if (state.phase === 'prebid') {
    if (state.pending?.kind !== 'prebid' || !state.mission) return 'no pre-bid window is open';
    const prebidReason = validateSelection(state, prebid, 'equipment', true);
    if (prebidReason) return prebidReason;
    return validateSelection(state, boost, 'bonus', false);
  }
  if (state.phase === 'mission') return 'use resolveAbility to answer the ability prompt';
  if (state.phase === 'repair') return 'use payRepair to answer the repair window';
  if (state.phase === 'upkeep') return 'use discardForLimit to trim the hand';
  return 'resolvePhase is not legal now';
}

/** Occurrences of `id` inside a zone (two deck copies may share a row id). */
function countIn(zone: readonly string[], id: string): number {
  let n = 0;
  for (const x of zone) if (x === id) n++;
  return n;
}

/**
 * Validates a pre-bid/boost/repair selection as a MULTISET against its source
 * zones: duplicate row ids are legal (both deck copies may be selected), but a
 * selection may never claim more instances than exist in the allowed zones.
 *
 * @param reservedAware - when true, the phase-1 reserved instance (ruling 3)
 *   is excluded from the freely spendable count.
 */
function validateSelection(
  state: GameState,
  cards: CardId[],
  kind: 'equipment' | 'bonus' | 'fuel',
  reservedAware: boolean,
): string | null {
  const reserved = new Set(
    reservedAware ? (state.mission?.reservedPrebid ?? state.pendingLaunch?.reservedPrebid ?? []) : [],
  );
  const tally = new Map<string, number>();
  for (const id of cards) tally.set(id, (tally.get(id) ?? 0) + 1);

  for (const [id, need] of tally) {
    const row = cardById(state.content, id);

    if (kind === 'fuel') {
      if (row.kind === 'person') {
        const assigned = state.mission?.crew.includes(id) ?? false;
        const available =
          countIn(state.hand, id) + (id in state.crewPool && !assigned ? 1 : 0);
        if (available >= need) continue;
        return assigned && countIn(state.hand, id) < need
          ? `${row.named?.name ?? id} is assigned to this mission and cannot be burned`
          : `${id} is not available repair fuel`;
      }
      if (row.kind === 'equipment') {
        const available = countIn(state.hand, id) + countIn(state.inPlay, id);
        if (available >= need) continue;
        return `${id} is not available repair fuel`;
      }
      if (row.kind === 'bonus') {
        if (countIn(state.inPlay, id) >= need) continue;
        return `${id} must be held in play first`;
      }
      return `${id} is not repair fuel`;
    }

    if (kind === 'equipment') {
      if (row.kind !== 'equipment') return `${id} is not equipment`;
      const reservedCount = reserved.has(id) ? 1 : 0;
      const available = countIn(state.hand, id) + countIn(state.inPlay, id) - reservedCount;
      if (available >= need) continue;
      return reserved.has(id)
        ? `${id} is already committed as the phase-1 pre-bid`
        : `${id} is not in hand or in play`;
    }

    // kind === 'bonus': held bonuses only (in play).
    if (row.kind !== 'bonus') return `${id} is not a bonus card`;
    if (countIn(state.inPlay, id) >= need) continue;
    return `${id} must be held in play first`;
  }
  return null;
}

function validateResolveAbility(state: GameState, use: 'kraft' | 'reroll' | undefined): string | null {
  if (state.phase !== 'mission' || state.pending?.kind !== 'ability' || !state.mission) {
    return 'no ability window is open';
  }
  if (use === 'kraft' && !canKraft(state, state.mission)) return 'Kraft is not available';
  if (use === 'reroll' && !canReroll(state, state.mission)) return 'Kranz reroll is not available';
  return null;
}

function validatePayRepair(state: GameState, cards: CardId[]): string | null {
  if (state.phase !== 'repair' || state.pending?.kind !== 'repair') return 'no repair window is open';
  return validateSelection(state, cards, 'fuel', false);
}

function validateFlySideMission(
  state: GameState,
  ace: CardId,
  prebid: CardId[],
  boost: CardId[],
): string | null {
  const phaseReason = inActions(state);
  if (phaseReason) return phaseReason;
  const actionReason = hasAction(state);
  if (actionReason) return actionReason;
  const row = cardById(state.content, ace);
  if (row.kind !== 'sideMission') return `${ace} is not a side mission`;
  if (!state.hand.includes(ace)) return 'side mission not in hand';
  const prebidReason = validateSelection(state, prebid, 'equipment', false);
  if (prebidReason) return prebidReason;
  return validateSelection(state, boost, 'bonus', false);
}

function validateDiscardForLimit(state: GameState, cards: CardId[]): string | null {
  if (state.phase !== 'upkeep' || state.pending?.kind !== 'handLimit') {
    return 'no hand-limit window is open';
  }
  if (cards.length !== state.pending.excess) {
    return `must discard exactly ${state.pending.excess} card(s)`;
  }
  // Multiset check: both copies of a row may be discarded together.
  const tally = new Map<string, number>();
  for (const id of cards) tally.set(id, (tally.get(id) ?? 0) + 1);
  for (const [id, need] of tally) {
    if (countIn(state.hand, id) < need) return `${id} is not in hand`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Canonical enumeration (UI hints + policy skeletons)
// ---------------------------------------------------------------------------

/**
 * Enumerates the canonical legal moves for the current state: every distinct
 * card play/mode, every purchasable tech, launch/side-mission with default
 * selections, window responses (skip/decline), endTurn. Combinatorial choices
 * (extra pre-bid cards, crew sets beyond the canonical fill, repair payments)
 * are omitted — construct them and let `validateMove` judge.
 */
export function legalMoves(state: GameState): Move[] {
  if (state.phase === 'gameOver') return [];
  const moves: Move[] = [];
  const canAct = state.actionsLeft >= 1;

  switch (state.phase) {
    case 'draw':
      moves.push({ t: 'resolvePhase' });
      break;

    case 'actions': {
      if (canAct) {
        const reserved = new Set(state.pendingLaunch?.reservedPrebid ?? []);
        for (const id of state.hand) {
          if (reserved.has(id)) continue;
          const row = cardById(state.content, id);
          moves.push({ t: 'playCard', card: id, mode: 'money' });
          moves.push({ t: 'playCard', card: id, mode: 'rd' });
          if (
            row.kind === 'equipment' ||
            row.kind === 'bonus' ||
            row.kind === 'action' ||
            (row.kind === 'person' && !(id in state.crewPool))
          ) {
            moves.push({ t: 'playCard', card: id, mode: 'identity' });
          }
        }
        for (const item of state.content.techTree) {
          if (validateDevelopTech(state, item.id) === null) {
            moves.push({ t: 'developTech', tech: item.id });
          }
        }
        const launch = canonicalLaunch(state);
        if (launch && validateLaunchMission(state, launch.mission, launch.crew, launch.prebid) === null) {
          moves.push({ t: 'launchMission', ...launch });
        }
        for (const id of state.hand) {
          if (cardById(state.content, id).kind === 'sideMission') {
            const fly: Move = { t: 'flySideMission', ace: id };
            if (validateFlySideMission(state, id, [], []) === null) moves.push(fly);
          }
        }
      }
      moves.push({ t: 'endTurn' });
      break;
    }

    case 'prebid':
      moves.push({ t: 'resolvePhase', prebid: [], boost: [] });
      break;

    case 'mission': {
      moves.push({ t: 'resolveAbility' });
      if (state.mission && canKraft(state, state.mission)) moves.push({ t: 'resolveAbility', use: 'kraft' });
      if (state.mission && canReroll(state, state.mission)) moves.push({ t: 'resolveAbility', use: 'reroll' });
      break;
    }

    case 'repair': {
      moves.push({ t: 'payRepair', cards: [] });
      const payment = canonicalRepairPayment(state);
      if (payment) moves.push({ t: 'payRepair', cards: payment });
      break;
    }

    case 'upkeep': {
      if (state.pending?.kind === 'handLimit') {
        const drop = state.hand.slice(-state.pending.excess);
        moves.push({ t: 'discardForLimit', cards: drop });
      }
      break;
    }
  }

  return moves;
}

/** Canonical launch: first N ready non-tech pool members, no pre-bid. */
function canonicalLaunch(state: GameState): { mission: string; crew: CardId[]; prebid: CardId[] } | null {
  if (state.pendingLaunch) return null;
  const mission = currentMission(state);
  const slots = crewSlots(state, mission.program);
  const crew = Object.entries(state.crewPool)
    .filter(([id, s]) => s.state === 'ready' && cardById(state.content, id).named?.role !== 'tech')
    .slice(0, slots)
    .map(([id]) => id);
  if (crew.length !== slots) return null;
  return { mission: mission.id, crew, prebid: [] };
}

/** Greedy affordable repair payment (highest value first), or null if unaffordable. */
function canonicalRepairPayment(state: GameState): CardId[] | null {
  if (state.pending?.kind !== 'repair' || !state.mission) return null;
  const assigned = new Set(state.mission.crew);
  const fuel: CardId[] = [];
  for (const id of state.hand) {
    const row = cardById(state.content, id);
    if (row.kind === 'person' || row.kind === 'equipment') fuel.push(id);
  }
  for (const id of Object.keys(state.crewPool)) {
    if (!assigned.has(id)) fuel.push(id);
  }
  for (const id of state.inPlay) {
    const row = cardById(state.content, id);
    if (row.kind === 'equipment' || row.kind === 'bonus') fuel.push(id);
  }
  const value = (id: CardId): number => {
    const row = cardById(state.content, id);
    return row.kind === 'bonus' ? Math.ceil(row.s / 2) : row.s;
  };
  fuel.sort((a, b) => value(b) - value(a) || a.localeCompare(b));
  const picked: CardId[] = [];
  let total = 0;
  for (const id of fuel) {
    if (total >= state.pending.cost) break;
    picked.push(id);
    total += value(id);
  }
  return total >= state.pending.cost ? picked : null;
}
