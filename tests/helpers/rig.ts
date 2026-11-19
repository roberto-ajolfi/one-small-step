/**
 * State rigging helpers for engine tests.
 *
 * GameState is a plain readonly object; these helpers produce derived states
 * that preserve the 108-card zone partition (moving one instance between
 * zones), so `assertInvariants` still holds on rigged states and `apply()`
 * can be exercised from any situation without playing a full game.
 */

import {
  apply,
  createRng,
  newGame,
  randomInt,
  type CardId,
  type GameState,
  type RngState,
} from '../../src/engine';
import { TEST_CONTENT } from '../fixtures/content';

/** Removes one instance of `id` from deck/discard/inPlay/hand (pool untouched). */
function extract(state: GameState, id: CardId): GameState | null {
  for (const zone of ['deck', 'discard', 'inPlay', 'hand'] as const) {
    const idx = state[zone].indexOf(id);
    if (idx >= 0) {
      return {
        ...state,
        [zone]: [...state[zone].slice(0, idx), ...state[zone].slice(idx + 1)],
      };
    }
  }
  return null;
}

/** Ensures one instance of `id` is in the hand (borrowed from another zone). */
export function moveToHand(state: GameState, id: CardId): GameState {
  if (state.hand.includes(id)) return state;
  const taken = extract(state, id);
  if (!taken) throw new Error(`no instance of ${id} available to move`);
  return { ...taken, hand: [...taken.hand, id] };
}

/** Ensures the given ids are in the hand. */
export function hands(state: GameState, ids: CardId[]): GameState {
  return ids.reduce((s, id) => moveToHand(s, id), state);
}

/** Recruits one instance of `id` into the crew pool (from another zone). */
export function recruit(state: GameState, id: CardId): GameState {
  if (id in state.crewPool) return state;
  const taken = extract(state, id);
  if (!taken) throw new Error(`no instance of ${id} available to recruit`);
  return { ...taken, crewPool: { ...taken.crewPool, [id]: { state: 'ready', launchesLeft: 0 } } };
}

/** Places `id` on top of the fate deck: the next draw pops it (deck is LIFO). */
export function deckTop(state: GameState, id: CardId): GameState {
  const taken = extract(state, id);
  if (!taken) throw new Error(`no instance of ${id} available to rig on deck top`);
  return { ...taken, deck: [...taken.deck, id] };
}

/**
 * Sets crew-pool entries directly. An id already pooled is updated in place
 * (one pool entry ↔ one instance); otherwise its instance is pulled from
 * another zone first, preserving the card partition.
 */
export function pool(
  state: GameState,
  entries: Record<CardId, { state: 'ready' | 'injured' | 'stunned'; launchesLeft: number }>,
): GameState {
  let next = state;
  for (const [id, status] of Object.entries(entries)) {
    if (id in next.crewPool) {
      next = { ...next, crewPool: { ...next.crewPool, [id]: status } };
    } else {
      const taken = extract(next, id);
      if (!taken) throw new Error(`no instance of ${id} available for the pool`);
      next = { ...taken, crewPool: { ...taken.crewPool, [id]: status } };
    }
  }
  return next;
}

/**
 * Finds a seed whose FIRST d6 roll yields `face` (1–6) — lets tests pin each
 * event-table row deterministically without exposing rng internals.
 */
export function rngForFace(face: number): RngState {
  for (let i = 0; i < 10_000; i++) {
    const candidate = createRng(`face-${face}-${i}`);
    const roll = randomInt(candidate, 6);
    if (roll.value + 1 === face) return candidate;
  }
  throw new Error(`no seed found for face ${face}`);
}

/**
 * A state in the action phase with a deterministic, joker-free opening draw
 * (two known keepables on top) — no event side effects on resources/track.
 */
export function actionsState(seed = 'actions'): GameState {
  let s = newGame(seed, TEST_CONTENT);
  const keep = ['5H', '6H'];
  const indices = keep.map((id) => s.deck.indexOf(id));
  if (indices.some((i) => i < 0)) throw new Error('keepables missing from fresh deck');
  let deck = [...s.deck];
  for (const idx of [...indices].sort((a, b) => b - a)) {
    deck = [...deck.slice(0, idx), ...deck.slice(idx + 1)];
  }
  s = { ...s, deck: [...deck, keep[1], keep[0]] }; // pops 5H then 6H
  return apply(s, { t: 'resolvePhase' });
}

/** Marks tech ids as developed (free — costs are not charged in rigs). */
export function withTech(state: GameState, ids: string[]): GameState {
  const tech = { ...state.tech };
  for (const id of ids) tech[id] = true;
  return { ...state, tech };
}

/** Sets resources directly. */
export function withResources(
  state: GameState,
  resources: { money: number; rd: number },
): GameState {
  return { ...state, resources: { ...resources } };
}

/** Grants perks directly. */
export function withPerks(state: GameState, perks: string[]): GameState {
  return { ...state, perks: [...perks] };
}

/** Advances the campaign index, marking earlier missions done. */
export function withIndex(state: GameState, index: number): GameState {
  const status = state.campaign.status.map((s, i) =>
    i < index ? { ...s, state: 'done' as const } : s,
  );
  return { ...state, campaign: { index, status } };
}

/** Forces a finished game. */
export function finished(
  state: GameState,
  result: 'moon' | 'timedOut' | 'sovietsWon',
): GameState {
  return { ...state, phase: 'gameOver', result, pending: undefined };
}

/** Builds a state with an explicit vp ledger (scoring tests). */
export function withVp(
  state: GameState,
  vp: Partial<GameState['vp']>,
): GameState {
  return { ...state, vp: { ...state.vp, ...vp } };
}
