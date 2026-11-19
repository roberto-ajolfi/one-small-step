/**
 * Scoring — scoreGame() and the named victory tiers (FR10, spec §4.1).
 *
 * Score = mission VP + program completion bonuses + side-mission VP
 * − failure penalties − Soviet milestone bites. The ledger accumulates
 * incrementally on GameState; scoreGame is a pure function of state (§4.4).
 * Maximum with all content: 61 + 10 + 16 = 87 (ruling 25).
 */

import type { GameState } from './state';
import type { GameResult } from './state';
import type { Program } from './content';

/** Named tier per ending + score band (FR10.2). */
export interface ScoreResult {
  vp: number;
  tier: string;
  result: GameResult;
}

/** Total of the current VP ledger before penalties. */
function grossVp(state: GameState): number {
  return state.vp.mission + state.vp.side + state.vp.program;
}

/**
 * Computes the final score and tier for a finished game.
 *
 * @param state - a state whose `result` is set (phase 'gameOver').
 * @returns vp, named tier, and the ending type.
 * @precondition `state.phase === 'gameOver'` — scoring only exists at an ending
 *   (FR10); Soviets-win honors no score (vp 0, "Total Loss").
 */
export function scoreGame(state: GameState): ScoreResult {
  const result = state.result;
  if (!result) throw new Error('scoreGame requires a finished game (phase gameOver)');

  if (result === 'sovietsWon') {
    return { vp: 0, tier: 'Total Loss', result };
  }

  const vp =
    grossVp(state) - state.vp.penaltyFailures - state.vp.penaltyMilestones;
  const thresholds = state.content.tuning.tierThresholds;

  if (result === 'moon') {
    const tier =
      vp >= thresholds.moon.distinguished
        ? 'Distinguished Service Medal'
        : vp >= thresholds.moon.administrator
          ? 'NASA Administrator'
          : 'Mission Accomplished';
    return { vp, tier, result };
  }

  const tier =
    vp >= thresholds.timedOut.honorable
      ? 'Honorable Mention'
      : vp >= thresholds.timedOut.good
        ? 'Good Effort'
        : 'Budget Overrun';
  return { vp, tier, result };
}

/** Program completion bonus check (FR10.1): every mission of the program done. */
export function programCompleted(state: GameState, program: Program): boolean {
  const missions = state.content.missions.filter((m) => m.program === program);
  return missions.every((m) => {
    const idx = state.content.missions.findIndex((x) => x.id === m.id);
    return state.campaign.status[idx].state === 'done';
  });
}
