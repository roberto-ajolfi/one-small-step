/**
 * Moves — the Move union vocabulary, modes, and the IllegalMove error
 * (spec §4.1: `moves.ts # Move union type + validation`).
 *
 * Deviations from the §4.1 sketch, each traceable to a ruling or spec section:
 * - `resolvePhase` carries optional `prebid`/`boost` so per-phase windows
 *   (ruling 3) and held-bonus boosts (ruling 15) have a submission move.
 * - `resolveAbility` (ruling 9) and `discardForLimit` (ruling 27) are new moves:
 *   the sketch predates those decision windows.
 * - `flySideMission` drops `crew` (side missions take no crew, ruling 16) and
 *   adds `boost` for held bonuses.
 * - `playCard` drops `target` (no rule needs one).
 * - `undo`/`redo` are NOT engine moves: they are session operations over the
 *   move journal + snapshots, owned by the store (spec §4.2/§7), keeping
 *   `apply()` a pure forward transition.
 */

import type { CardId, MissionId, TechId } from './content';

/** Universal + identity modes a card can be played in (FR1.3). */
export type Mode = 'money' | 'rd' | 'identity';

export type Move =
  | { t: 'playCard'; card: CardId; mode: Mode }
  | { t: 'developTech'; tech: TechId }
  | { t: 'launchMission'; mission: MissionId; crew: CardId[]; prebid: CardId[] }
  | {
      /** Draws: 2 hand cards in 'draw'; a fate card for the phase in 'prebid'. */
      t: 'resolvePhase';
      prebid?: CardId[];
      boost?: CardId[];
    }
  /** Kraft/Kranz window (ruling 9): omit `use` to finalize the failure. */
  | { t: 'resolveAbility'; use?: 'kraft' | 'reroll' }
  /** Repair window (ruling 5): cards may underpay or be empty — both decline. */
  | { t: 'payRepair'; cards: CardId[] }
  | { t: 'flySideMission'; ace: CardId; prebid?: CardId[]; boost?: CardId[] }
  /** Year-end hand trim (ruling 27): must drop exactly `pending.excess` cards. */
  | { t: 'discardForLimit'; cards: CardId[] }
  | { t: 'endTurn' };

/**
 * Thrown by `apply()` when a move is not legal in the current state.
 * The message is the human-readable reason shown by the UI (spec §7).
 */
export class IllegalMove extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'IllegalMove';
  }
}

/** Type guard: move is a card play. */
export function isPlayCard(move: Move): move is Extract<Move, { t: 'playCard' }> {
  return move.t === 'playCard';
}

/** Type guard: move is a tech purchase. */
export function isDevelopTech(move: Move): move is Extract<Move, { t: 'developTech' }> {
  return move.t === 'developTech';
}

/** Type guard: move is a mission launch declaration. */
export function isLaunchMission(move: Move): move is Extract<Move, { t: 'launchMission' }> {
  return move.t === 'launchMission';
}

/** Type guard: move drives a draw/phase resolution. */
export function isResolvePhase(move: Move): move is Extract<Move, { t: 'resolvePhase' }> {
  return move.t === 'resolvePhase';
}

/** Type guard: move answers the Kraft/Kranz prompt. */
export function isResolveAbility(move: Move): move is Extract<Move, { t: 'resolveAbility' }> {
  return move.t === 'resolveAbility';
}

/** Type guard: move answers the repair window. */
export function isPayRepair(move: Move): move is Extract<Move, { t: 'payRepair' }> {
  return move.t === 'payRepair';
}

/** Type guard: move flies a side mission. */
export function isFlySideMission(move: Move): move is Extract<Move, { t: 'flySideMission' }> {
  return move.t === 'flySideMission';
}

/** Type guard: move trims the hand at year end. */
export function isDiscardForLimit(move: Move): move is Extract<Move, { t: 'discardForLimit' }> {
  return move.t === 'discardForLimit';
}

/** Type guard: move ends the action phase. */
export function isEndTurn(move: Move): move is Extract<Move, { t: 'endTurn' }> {
  return move.t === 'endTurn';
}
