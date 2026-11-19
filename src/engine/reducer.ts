/**
 * Reducer — `apply(state, move)` is the engine's only transition function
 * (spec §4.1, NFR1): validate against `validateMove`, run the handler, append
 * the move journal, assert invariants, return a new GameState.
 *
 * Handlers are copy-on-write: the shallow draft shares every untouched
 * collection with the previous state (structural sharing, §4.2). All randomness
 * flows through `state.rngState`; `Math.random` never appears here.
 */

import { missionById, techById } from './content';
import type { Content } from './content';
import {
  effectiveRdCost,
  moneyValue,
  perTurnDiscountProviders,
  rdValue,
} from './economy';
import { resolveJokerDraw } from './events';
import { IllegalMove } from './moves';
import { validateMove } from './legal';
import {
  resolveAbilityChoice,
  resolvePrebidDraw,
  resolveRepair,
  startMission,
} from './mission';
import { sideMissionDifficulty, sideMissionTotal, supportTechsAtLaunch } from './phases';
import { advanceSoviet } from './soviet';
import { doYearEnd, finishTurn, runUpkeep } from './upkeep';
import { appendLog, cardOf, drawCardFromDeck, newGame } from './state';
import {
  spendFromHand,
  spendFromHandOrPlay,
  spendFromPlay,
} from './state';
import type { GameState, Mutable } from './state';
import type { Move } from './moves';
import { assertInvariants } from './invariants';

/**
 * Applies one move to a game state.
 *
 * @param state - current state (never mutated).
 * @param move - the move to apply.
 * @returns the next GameState with the move journaled.
 * @throws IllegalMove with a human-readable reason when the move is illegal.
 */
export function apply(state: GameState, move: Move): GameState {
  const reason = validateMove(state, move);
  if (reason !== null) throw new IllegalMove(reason);

  const draft: Mutable<GameState> = { ...state, moves: [...state.moves, move] };

  switch (move.t) {
    case 'playCard':
      handlePlayCard(draft, move.card, move.mode);
      break;
    case 'developTech':
      handleDevelopTech(draft, move.tech);
      break;
    case 'launchMission':
      handleLaunchMission(draft, move.mission, move.crew, move.prebid);
      break;
    case 'resolvePhase':
      if (draft.phase === 'draw') openActionPhase(draft);
      else resolvePrebidDraw(draft, move.prebid ?? [], move.boost ?? []);
      break;
    case 'resolveAbility':
      resolveAbilityChoice(draft, move.use);
      break;
    case 'payRepair':
      resolveRepair(draft, move.cards);
      break;
    case 'flySideMission':
      handleFlySideMission(draft, move.ace, move.prebid ?? [], move.boost ?? []);
      break;
    case 'discardForLimit':
      handleDiscardForLimit(draft, move.cards);
      break;
    case 'endTurn':
      handleEndTurn(draft);
      break;
  }

  const next = draft as GameState;
  assertInvariants(next);
  return next;
}

/** Removes exactly one occurrence of `card` from the hand. */
function removeFromHand(draft: Mutable<GameState>, card: string): void {
  const idx = draft.hand.indexOf(card);
  if (idx < 0) throw new Error(`card not in hand: ${card}`);
  draft.hand = [...draft.hand.slice(0, idx), ...draft.hand.slice(idx + 1)];
}

/** Opens the action phase: apply the carried action loss, then draw (FR2.2). */
function openActionPhase(draft: Mutable<GameState>): void {
  const t = draft.content.tuning;
  draft.actionsLeft = Math.max(0, t.actionsPerTurn - draft.turnActionLoss);
  draft.turnActionLoss = 0;
  draft.phase = 'actions';
  draft.pending = undefined;

  let drawn = 0;
  while (drawn < t.drawPerTurn) {
    const id = drawCardFromDeck(draft);
    const row = cardOf(draft, id);
    if (row.kind === 'event') {
      // Ruling 23: jokers resolve inline and never occupy a hand slot.
      resolveJokerDraw(draft, id);
      continue;
    }
    draft.hand = [...draft.hand, id];
    drawn++;
  }
  appendLog(draft, 'turn', `Turn ${draft.turn} (${draft.year}) — drew ${t.drawPerTurn}`);
}

function handlePlayCard(draft: Mutable<GameState>, card: string, mode: string): void {
  draft.actionsLeft -= 1;
  removeFromHand(draft, card);
  const row = cardOf(draft, card);

  if (mode === 'money') {
    draft.resources = { ...draft.resources, money: draft.resources.money + moneyValue(row.s) };
    draft.discard = [...draft.discard, card];
    appendLog(draft, 'action', `Cashed ${card} for ${moneyValue(row.s)} Money`);
    return;
  }
  if (mode === 'rd') {
    draft.resources = { ...draft.resources, rd: draft.resources.rd + rdValue(row.s) };
    draft.discard = [...draft.discard, card];
    appendLog(draft, 'action', `Invested ${card} for ${rdValue(row.s)} R&D`);
    return;
  }

  // Identity mode (FR1.3): recruit, hold, or take the extra action.
  if (row.kind === 'person') {
    draft.crewPool = { ...draft.crewPool, [card]: { state: 'ready', launchesLeft: 0 } };
    appendLog(draft, 'action', `Recruited ${row.named?.name ?? card} to the crew pool`);
    return;
  }
  if (row.kind === 'equipment' || row.kind === 'bonus') {
    draft.inPlay = [...draft.inPlay, card];
    appendLog(draft, 'action', `Held ${card} in play`);
    return;
  }
  // Extra action: costs 1 action and refunds 1 → net-free play, +1 total play.
  draft.actionsLeft += 1;
  draft.discard = [...draft.discard, card];
  appendLog(draft, 'action', `Extra action from ${card}`);
}

function handleDevelopTech(draft: Mutable<GameState>, tech: string): void {
  draft.actionsLeft -= 1;
  const item = techById(draft.content, tech);
  const rd = effectiveRdCost(draft as GameState, item);
  const providers = perTurnDiscountProviders(draft as GameState, item);

  draft.resources = {
    money: draft.resources.money - item.moneyCost,
    rd: draft.resources.rd - rd,
  };
  draft.tech = { ...draft.tech, [tech]: true };
  if (providers.length > 0) {
    draft.devDiscountsUsedThisTurn = [...draft.devDiscountsUsedThisTurn, ...providers];
  }
  const discount = item.rdCost - rd;
  appendLog(
    draft,
    'action',
    `Developed ${item.name} (${rd} R&D${discount > 0 ? `, −${discount} discount` : ''}, ${item.moneyCost} Money)`,
  );
}

function handleLaunchMission(
  draft: Mutable<GameState>,
  missionId: string,
  crew: string[],
  prebid: string[],
): void {
  draft.actionsLeft -= 1;

  // Snapshot support BEFORE timer decrements: a tech stunned for this launch
  // sits it out (FR6.5), so it must not support the very launch it missed.
  const supportTechs = supportTechsAtLaunch(draft as GameState);

  const pool = { ...draft.crewPool };
  for (const [cardId, status] of Object.entries(pool)) {
    if (status.state === 'ready') continue;
    const left = status.launchesLeft - 1;
    pool[cardId] = left <= 0 ? { state: 'ready', launchesLeft: 0 } : { ...status, launchesLeft: left };
  }
  draft.crewPool = pool;

  draft.pendingLaunch = {
    missionId,
    crew: [...crew],
    supportTechs,
    reservedPrebid: [...prebid],
  };

  const idx = draft.campaign.index;
  const status = [...draft.campaign.status];
  status[idx] = { ...status[idx], state: 'active' };
  draft.campaign = { index: idx, status };

  appendLog(draft, 'mission', `${missionById(draft.content, missionId).name} declared`);
}

function handleFlySideMission(
  draft: Mutable<GameState>,
  ace: string,
  prebid: string[],
  boost: string[],
): void {
  draft.actionsLeft -= 1;
  removeFromHand(draft, ace);

  // One instance per selection: boosts held in play, pre-bids hand or in play.
  const missingBoost = spendFromPlay(draft, boost);
  if (missingBoost.length > 0) throw new Error(`held bonus unavailable: ${missingBoost.join(', ')}`);
  const missingPrebid = spendFromHandOrPlay(draft, prebid);
  if (missingPrebid.length > 0) throw new Error(`pre-bid unavailable: ${missingPrebid.join(', ')}`);

  // Single fate draw (jokers inline), read then discarded (FR7.1, FR3.1).
  let drawn = drawCardFromDeck(draft);
  while (cardOf(draft, drawn).kind === 'event') {
    resolveJokerDraw(draft, drawn);
    drawn = drawCardFromDeck(draft);
  }
  draft.discard = [...draft.discard, ace, ...prebid, ...boost, drawn];

  const record = draft.sideMissions[ace] ?? { status: 'open' as const, fails: 0 };
  const difficulty = sideMissionDifficulty(draft as GameState, record.fails);
  const total = sideMissionTotal(draft as GameState, drawn, prebid, boost);

  if (total >= difficulty) {
    draft.vp = { ...draft.vp, side: draft.vp.side + draft.content.tuning.sideMissionVp };
    draft.sideMissions = {
      ...draft.sideMissions,
      [ace]: { status: 'flown', fails: record.fails },
    };
    if (!draft.perks.includes(ace)) {
      draft.perks = [...draft.perks, ace];
      appendLog(draft, 'mission', `Side mission ${ace} flown — perk earned`);
    }
    appendLog(
      draft,
      'mission',
      `Side mission ${ace}: ${total} vs ${difficulty} — success +${draft.content.tuning.sideMissionVp} VP`,
    );
  } else {
    draft.sideMissions = { ...draft.sideMissions, [ace]: { ...record, fails: record.fails + 1 } };
    draft.vp = { ...draft.vp, penaltyFailures: draft.vp.penaltyFailures + 1 };
    advanceSoviet(draft, draft.content.tuning.sovietPushSideMission, 'side mission failure');
    appendLog(draft, 'mission', `Side mission ${ace}: ${total} vs ${difficulty} — failure`);
  }
}

function handleDiscardForLimit(draft: Mutable<GameState>, cards: string[]): void {
  spendFromHand(draft, cards);
  draft.discard = [...draft.discard, ...cards];
  doYearEnd(draft);
  finishTurn(draft);
}

function handleEndTurn(draft: Mutable<GameState>): void {
  if (draft.pendingLaunch) {
    startMission(draft, draft.pendingLaunch);
    return;
  }
  runUpkeep(draft);
}

// ---------------------------------------------------------------------------
// Replay (save/replay round-trips, determinism tests — spec §4.2, §9)
// ---------------------------------------------------------------------------

/**
 * Reconstitutes a game from a seed + content + move journal — the save format's
 * replay half (`{version, seed, tuningHash, moves[]}` re-supplies content).
 *
 * @param seed - the original seed.
 * @param content - the content bundle the game was played with.
 * @param moves - the journal to replay in order.
 * @returns the final state.
 * @throws IllegalMove if any journaled move no longer validates (content drift).
 */
export function replay(seed: string, content: Content, moves: readonly Move[]): GameState {
  let state = newGame(seed, content);
  for (const move of moves) state = apply(state, move);
  return state;
}
