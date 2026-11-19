/**
 * Events — the d6 news-event table, applied inline on every joker draw
 * (FR9.1/FR3.2, ruling 28: no window, engine rolls and logs immediately).
 *
 * Jokers never enter the hand: each draw loop resolves the event, discards the
 * joker, and redraws for a keepable card (rulings 2/23). Apollo 1 Fire is the
 * one composite effect: −2 actions next turn + every ready crew member stunned
 * for 1 mission launch (FR9.2 + FR6.5 timing).
 */

import type { EventEffect, EventEntry } from './content';
import { randomInt } from './rng';
import type { GameState, Mutable } from './state';
import { appendLog } from './state';
import { advanceSoviet } from './soviet';

/** Applies one event-table effect to a mutable state draft. */
function applyEffect(draft: Mutable<GameState>, effect: EventEffect): void {
  switch (effect.type) {
    case 'sovietShift':
      advanceSoviet(draft, effect.amount, 'event');
      break;
    case 'rdGain':
      draft.resources = { ...draft.resources, rd: draft.resources.rd + effect.amount };
      break;
    case 'moneyGain':
      draft.resources = { ...draft.resources, money: draft.resources.money + effect.amount };
      break;
    case 'loseActions':
      // "Next turn" relative to the turn the event fired in (carried at upkeep).
      draft.pendingActionLoss = draft.pendingActionLoss + effect.amount;
      break;
    case 'stunCrew': {
      const pool = { ...draft.crewPool };
      let stunned = 0;
      for (const [cardId, status] of Object.entries(pool)) {
        if (status.state === 'ready') {
          pool[cardId] = { state: 'stunned', launchesLeft: effect.launches };
          stunned++;
        }
      }
      draft.crewPool = pool;
      appendLog(draft, 'event', `${stunned} crew stunned for ${effect.launches} launch(es)`);
      break;
    }
  }
}

/**
 * Rolls the d6 table and applies the drawn event (FR9.1).
 *
 * @param draft - mutable state draft; advances rngState and appends log entries.
 * @returns the event row that fired (for callers that want the name).
 */
export function rollEvent(draft: Mutable<GameState>): EventEntry {
  const roll = randomInt(draft.rngState, 6);
  draft.rngState = roll.state;
  const face = (roll.value + 1) as 1 | 2 | 3 | 4 | 5 | 6;
  const entry = draft.content.events.find((e) => e.face === face);
  if (!entry) throw new Error(`event table missing face ${face}`);
  appendLog(draft, 'event', `d6 → ${face}: ${entry.name}`);
  for (const effect of entry.effects) applyEffect(draft, effect);
  return entry;
}

/**
 * Resolves a drawn joker (FR3.2): roll the event, discard the joker, return.
 * The caller redraws so the joker never occupies a hand/phase draw slot
 * (rulings 2/23).
 *
 * @param draft - mutable state draft.
 * @param jokerId - the joker card id that was drawn.
 */
export function resolveJokerDraw(draft: Mutable<GameState>, jokerId: string): void {
  rollEvent(draft);
  draft.discard = [...draft.discard, jokerId];
}
