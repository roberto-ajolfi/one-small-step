/**
 * Upkeep & game lifecycle — turn advancement, year end, game endings
 * (FR2.2 step 4, FR2.3, FR8.3/FR10 tie-breaks, rulings 27/28).
 *
 * Order inside upkeep (FR2.2): Soviet drift +1 → loss check (the player-wins-
 * ties rule is enforced by deferring loss to this point: Apollo 11 completing
 * ends the game with 'moon' before upkeep ever runs) → turn advance (turn 30 →
 * timedOut) → year-end maintenance (hand trim window when over the limit) →
 * action-loss carry into the next turn.
 */

import { applyAbility, earnedPerkAbilities } from './abilities';
import { resolveJokerDraw } from './events';
import { advanceSoviet } from './soviet';
import type { GameResult, GameState, Mutable } from './state';
import { appendLog, drawCardFromDeck, cardOf } from './state';

/** Marks the game over with `result` and closes every open window. */
export function gameOver(draft: Mutable<GameState>, result: GameResult): void {
  draft.phase = 'gameOver';
  draft.result = result;
  draft.pending = undefined;
  draft.mission = undefined;
  draft.pendingLaunch = undefined;
  const text =
    result === 'moon'
      ? 'Apollo 11 splashdown — the Moon is won!'
      : result === 'sovietsWon'
        ? 'Soviets land first — total loss'
        : 'Timeline complete — the program is graded';
  appendLog(draft, 'system', text);
}

/**
 * Runs upkeep for the turn that just ended: drift, endings, turn advance,
 * year end, action-loss carry. May rest in phase 'upkeep' (hand-limit window).
 */
export function runUpkeep(draft: Mutable<GameState>): void {
  const t = draft.content.tuning;

  advanceSoviet(draft, t.sovietDrift, 'drift');

  // Loss check: Apollo 11 already had its chance this turn (FR8.3 ties → player).
  if (draft.soviet.reachedFinal) {
    gameOver(draft, 'sovietsWon');
    return;
  }

  const prev = draft.turn;
  const totalTurns = 30; // FR2.1: 10 years (1960–1969) × 3 turns — a rule, not tuning.
  if (prev >= totalTurns) {
    gameOver(draft, 'timedOut');
    return;
  }
  draft.turn = prev + 1;
  draft.year = 1960 + Math.floor((draft.turn - 1) / t.turnsPerYear);

  if (prev % t.turnsPerYear === 0) {
    const excess = draft.hand.length - t.handLimit;
    if (excess > 0) {
      // Ruling 27: the player chooses what to drop before the refill.
      draft.phase = 'upkeep';
      draft.pending = { kind: 'handLimit', excess };
      appendLog(draft, 'turn', `Year end: discard down to ${t.handLimit}`);
      return;
    }
    doYearEnd(draft);
  }

  finishTurn(draft);
}

/**
 * Year-end maintenance (FR2.3): refill the hand to the limit (jokers resolve
 * inline — ruling 28), heal every crew member, and pay year-end money perks
 * (Telstar). Assumes any excess was already discarded.
 */
export function doYearEnd(draft: Mutable<GameState>): void {
  const t = draft.content.tuning;

  while (draft.hand.length < t.handLimit) {
    const id = drawCardFromDeck(draft);
    const row = cardOf(draft, id);
    if (row.kind === 'event') {
      resolveJokerDraw(draft, id);
      continue;
    }
    draft.hand = [...draft.hand, id];
  }

  const pool = { ...draft.crewPool };
  let healed = 0;
  for (const [cardId, status] of Object.entries(pool)) {
    if (status.state !== 'ready') {
      pool[cardId] = { state: 'ready', launchesLeft: 0 };
      healed++;
    }
  }
  draft.crewPool = pool;

  for (const ability of earnedPerkAbilities(draft.perks, draft.content.cards)) {
    const effect = applyAbility(ability, { kind: 'yearEnd' });
    if (effect?.kind === 'add') {
      draft.resources = { ...draft.resources, money: draft.resources.money + effect.amount };
      appendLog(draft, 'event', `Year-end income: +${effect.amount} Money`);
    }
  }

  appendLog(draft, 'turn', `Year ${draft.year} ends${healed > 0 ? ` — ${healed} crew healed` : ''}`);
}

/**
 * Closes the turn: carry Apollo 1 action loss into the next turn, reset
 * per-turn discount tracking, and open the next draw phase.
 */
export function finishTurn(draft: Mutable<GameState>): void {
  draft.turnActionLoss = draft.pendingActionLoss;
  draft.pendingActionLoss = 0;
  draft.devDiscountsUsedThisTurn = [];
  draft.phase = 'draw';
  draft.pending = undefined;
}
