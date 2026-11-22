/**
 * Policies — the three bracketing auto-players of the balance harness
 * (spec §6): `baseline` (the skilled-play reference whose 30–40% win-rate
 * band the tuning loop closes), `aggressive` (rushes the ladder) and
 * `conservative` (hoards repair/crew, delays launches).
 *
 * Each policy is a `Tactics` profile plus a flow ordering from `tactics.ts`;
 * the win-rate brackets come from profile differences, not from separate
 * code paths. "Skilled win rate" is the best policy's rate.
 */

import type { GameState, Move } from '../engine';
import { chooseMove, type Tactics } from './tactics';

/**
 * An auto-player (spec §6): given the state and the canonical legal moves,
 * picks the next move. May construct richer selections (crew sets, pre-bid,
 * repair fuel) — `apply()` re-validates whatever it returns.
 */
export interface Policy {
  name: string;
  choose(state: GameState, legal: readonly Move[]): Move;
}

/** The three shipped bracketing policies (spec §6). */
export type PolicyName = 'baseline' | 'aggressive' | 'conservative';

/** Spec §6 baseline: develop when affordable → launch when ready → hold ~2 → cash. */
const BASELINE: Tactics = {
  flow: 'steady',
  fuelReserve: 2,
  prebidSafety: 0,
  spareCrew: 1,
  repairTiers: 2,
  sideMissionChance: 0.8,
};

/** Spec §6 aggressive: rushes the ladder, minimal repair hoarding. */
const AGGRESSIVE: Tactics = {
  flow: 'rush',
  fuelReserve: 1,
  prebidSafety: -1,
  spareCrew: 0,
  repairTiers: 2,
  sideMissionChance: 0.7,
};

/** Spec §6 conservative: hoards repair/crew, delays launches. */
const CONSERVATIVE: Tactics = {
  flow: 'hoard',
  fuelReserve: 5,
  prebidSafety: 2,
  spareCrew: 3,
  repairTiers: 3,
  sideMissionChance: 0.95,
};

/** Builds a named policy around a tactics profile (exported for tests/experiments). */
export function makePolicy(name: string, tactics: Tactics): Policy {
  return {
    name,
    choose: (state, legal) => chooseMove(state, legal, tactics),
  };
}

/** The shipped policies by name (spec §6). */
export const policies: Record<PolicyName, Policy> = {
  baseline: makePolicy('baseline', BASELINE),
  aggressive: makePolicy('aggressive', AGGRESSIVE),
  conservative: makePolicy('conservative', CONSERVATIVE),
};

/** Looks up a shipped policy by name; throws on unknown names (CLI fail-fast). */
export function getPolicy(name: string): Policy {
  const policy = (policies as Record<string, Policy>)[name];
  if (!policy) {
    throw new Error(`unknown policy: ${name} (expected one of ${Object.keys(policies).join(', ')})`);
  }
  return policy;
}
