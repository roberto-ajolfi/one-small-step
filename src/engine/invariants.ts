/**
 * Invariants — asserted after every apply() and by the test suite (spec §4.4).
 *
 * These encode the state-machine contracts the reducer must never break: the
 * 108-card zone partition, Soviet bounds, non-negative resources, ladder
 * monotonicity, phase ↔ pending ↔ mission coherence, and zone contents
 * (no jokers in hand, only persons in the pool, only holdables in play).
 */

import { cardById } from './content';
import type { GameState } from './state';

function fail(message: string): never {
  throw new Error(`invariant violated: ${message}`);
}

/**
 * Asserts every structural invariant of `state`.
 *
 * @param state - any state produced by `apply()` or `newGame()`.
 * @throws Error naming the first broken invariant.
 */
export function assertInvariants(state: GameState): void {
  const t = state.content.tuning;

  // 108-card partition (§4.4): every card instance lives in exactly one zone.
  const poolSize = Object.keys(state.crewPool).length;
  const zones =
    state.hand.length + state.deck.length + state.discard.length + state.inPlay.length + poolSize;
  const expected = state.content.cards.length * 2;
  if (zones !== expected) {
    fail(`card partition ${zones} !== ${expected} (hand/deck/discard/inPlay/pool)`);
  }

  // Soviet bounds and monotone max (bites fire once per milestone).
  if (state.soviet.position < 0 || state.soviet.position > t.sovietTrackLength) {
    fail(`soviet position ${state.soviet.position} outside [0, ${t.sovietTrackLength}]`);
  }
  if (state.soviet.maxPosition < state.soviet.position) {
    fail(`soviet max ${state.soviet.maxPosition} < position ${state.soviet.position}`);
  }
  if (state.soviet.reachedFinal !== state.soviet.maxPosition >= t.sovietTrackLength) {
    fail('soviet reachedFinal flag inconsistent with maxPosition');
  }

  // Resources and action counters never go negative (spending is pre-validated).
  if (state.resources.money < 0) fail(`money ${state.resources.money} < 0`);
  if (state.resources.rd < 0) fail(`rd ${state.resources.rd} < 0`);
  if (state.actionsLeft < 0) fail(`actionsLeft ${state.actionsLeft} < 0`);
  if (state.pendingActionLoss < 0 || state.turnActionLoss < 0) fail('negative action loss');

  // Campaign ladder: index never skips; completed prefix stays completed (§4.4).
  const n = state.content.missions.length;
  if (state.campaign.index < 0 || state.campaign.index > n) {
    fail(`campaign index ${state.campaign.index} outside [0, ${n}]`);
  }
  for (let i = 0; i < state.campaign.index; i++) {
    if (state.campaign.status[i].state !== 'done') fail(`mission ${i} skipped but index advanced`);
  }
  if (state.campaign.index < n && state.campaign.status[state.campaign.index].state === 'done') {
    fail('current mission already done');
  }

  // Phase ↔ pending ↔ mission ↔ result coherence.
  const pendingKind = state.pending?.kind;
  const expectedKind =
    state.phase === 'prebid'
      ? 'prebid'
      : state.phase === 'repair'
        ? 'repair'
        : state.phase === 'upkeep'
          ? 'handLimit'
          : state.phase === 'mission'
            ? 'ability'
            : undefined;
  if (pendingKind !== expectedKind) {
    fail(`phase ${state.phase} with pending ${pendingKind ?? 'none'}`);
  }
  if ((state.phase === 'gameOver') !== (state.result !== undefined)) {
    fail('gameOver phase and result field disagree');
  }
  if (state.phase !== 'gameOver' && state.result !== undefined) {
    fail('result set before game over');
  }
  const missionOpen = state.phase === 'prebid' || state.phase === 'repair' || state.phase === 'mission';
  if (missionOpen !== (state.mission !== undefined)) {
    fail(`phase ${state.phase} but mission ${state.mission ? 'present' : 'absent'}`);
  }
  if (state.pendingLaunch !== undefined && state.phase !== 'actions') {
    fail('pending launch outside the action phase');
  }

  // Zone contents: no jokers in hand, only holdables in play, only persons pooled.
  for (const id of state.hand) {
    const row = cardById(state.content, id);
    if (row.kind === 'event') fail(`joker ${id} in hand`);
  }
  for (const id of state.inPlay) {
    const row = cardById(state.content, id);
    if (row.kind !== 'equipment' && row.kind !== 'bonus') fail(`${id} in play is not holdable`);
  }
  for (const id of Object.keys(state.crewPool)) {
    const row = cardById(state.content, id);
    if (row.kind !== 'person') fail(`${id} in crew pool is not a person`);
  }

  // Reserved pre-bids and active crew stay inside their source zones.
  if (state.pendingLaunch) {
    for (const id of state.pendingLaunch.reservedPrebid) {
      if (!state.hand.includes(id)) fail(`reserved pre-bid ${id} left the hand`);
    }
    for (const id of state.pendingLaunch.crew) {
      if (!(id in state.crewPool)) fail(`assigned crew ${id} left the pool`);
    }
  }
  if (state.mission) {
    for (const id of state.mission.reservedPrebid) {
      if (!state.hand.includes(id)) fail(`mission pre-bid ${id} left the hand`);
    }
    for (const id of state.mission.crew) {
      if (!(id in state.crewPool)) fail(`mission crew ${id} left the pool`);
    }
  }

  // Per-turn discount tracking only references pooled techs.
  for (const id of state.devDiscountsUsedThisTurn) {
    if (!(id in state.crewPool)) fail(`discount provider ${id} not in pool`);
  }
}
