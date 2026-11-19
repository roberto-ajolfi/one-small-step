/**
 * Soviet track — drift, pushes and milestone bites (FR8, spec §4.1).
 *
 * The track is 0–36; drifting/pushing forward crosses milestones that bite once
 * each (−1 VP, every 6th also −3 Money clamped at 0 — rulings 19/interpretation 1:
 * a milestone is a historical achievement, so re-crossing after a Soyuz relief
 * push does not re-bite — tracked via maxPosition). Space 36 is the Soviet Moon
 * landing; the player-wins-ties rule (FR8.3) is enforced by the reducer, which
 * defers loss evaluation to the end of the turn.
 */

import type { GameState, Mutable } from './state';
import { appendLog } from './state';

/**
 * Advances the Soviet track by `amount` (negative = Soyuz relief), applying
 * milestone bites for each newly reached milestone and clamping to [0, length].
 * Sets `reachedFinal` when space 36 is reached — the reducer decides whether
 * that means a loss or a same-turn player win (FR8.3).
 *
 * @param draft - mutable state draft (copy-on-write on touched fields).
 * @param amount - signed movement; can be negative.
 * @param reason - log annotation, e.g. 'drift', 'Gagarin Orbits!', 'mission failure'.
 */
export function advanceSoviet(draft: Mutable<GameState>, amount: number, reason: string): void {
  if (amount === 0) return;
  const t = draft.content.tuning;
  const before = draft.soviet.position;
  const after = Math.max(0, Math.min(t.sovietTrackLength, before + amount));

  draft.soviet = { ...draft.soviet, position: after };
  if (after !== before) {
    appendLog(draft, 'soviet', `Soviets ${amount > 0 ? '+' : ''}${amount} → ${after} (${reason})`);
  }

  if (amount > 0) {
    // Bite each milestone in (maxPosition, after] exactly once per game.
    const start = draft.soviet.maxPosition;
    const end = Math.max(start, after);
    for (
      let m = (Math.floor(start / t.milestoneEvery) + 1) * t.milestoneEvery;
      m <= end;
      m += t.milestoneEvery
    ) {
      if (m > t.sovietTrackLength) break;
      draft.vp = { ...draft.vp, penaltyMilestones: draft.vp.penaltyMilestones + t.milestoneVpBite };
      if (m % t.moneyBiteEvery === 0) {
        draft.resources = {
          ...draft.resources,
          money: Math.max(0, draft.resources.money - t.milestoneMoneyBite),
        };
      }
      appendLog(draft, 'soviet', `Milestone bite at ${m}: −${t.milestoneVpBite} VP`);
    }
    if (end > start) draft.soviet = { ...draft.soviet, maxPosition: end };
  }

  if (after >= t.sovietTrackLength && !draft.soviet.reachedFinal) {
    draft.soviet = { ...draft.soviet, reachedFinal: true };
    appendLog(draft, 'soviet', 'Soviets reach the final space — Moon landing');
  }
}

/** Convenience read of the current position. */
export function sovietPosition(state: GameState): number {
  return state.soviet.position;
}
