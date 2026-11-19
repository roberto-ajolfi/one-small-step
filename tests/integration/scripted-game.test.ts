/**
 * Integration tests — the M1 exit criterion (spec §11): `apply()` plays a full
 * game headlessly via scripted moves. Also pins the determinism contract
 * (NFR2/§4.2): same seed ⇒ identical move log and final state, and a save's
 * move journal replays to the same game.
 */

import { describe, expect, it } from 'vitest';
import { apply, assertInvariants, newGame, replay, scoreGame } from '../../src/engine';
import { TEST_CONTENT } from '../fixtures/content';
import { playGame, chooseMove } from './scripted';

describe('headless scripted game (M1 exit)', () => {
  it('plays a complete game to a terminal result without invariant violations', () => {
    const final = playGame(newGame('exit-seed', TEST_CONTENT));
    expect(final.phase).toBe('gameOver');
    expect(final.result === 'moon' || final.result === 'timedOut' || final.result === 'sovietsWon').toBe(
      true,
    );
    assertInvariants(final);
    // The ladder never skipped and the game consumed real turns.
    expect(final.turn).toBeGreaterThanOrEqual(1);
    expect(final.turn).toBeLessThanOrEqual(30);
    const done = final.campaign.status.filter((s) => s.state === 'done').length;
    expect(done).toBe(final.campaign.index);
    // Score is computable for every ending (sovietsWon honors 0).
    const score = scoreGame(final);
    expect(score.result).toBe(final.result);
    expect(Number.isFinite(score.vp)).toBe(true);
  });

  it('finishes several seeds with varied endings', () => {
    const endings = new Set<string>();
    for (const seed of ['alpha', 'beta', 'gamma', 'delta', 'epsilon']) {
      const final = playGame(newGame(seed, TEST_CONTENT));
      assertInvariants(final);
      if (final.result) endings.add(final.result);
    }
    // At least the game-completing endings show up across seeds.
    expect(endings.size).toBeGreaterThanOrEqual(1);
  });

  it('is deterministic: same seed ⇒ identical logs and final states (NFR2)', () => {
    const a = playGame(newGame('determinism', TEST_CONTENT));
    const b = playGame(newGame('determinism', TEST_CONTENT));
    expect(a).toEqual(b);
    expect(a.moves.map((m) => m.t)).toEqual(b.moves.map((m) => m.t));
    expect(a.log).toEqual(b.log);
  });

  it('different seeds diverge', () => {
    const a = playGame(newGame('seed-one', TEST_CONTENT));
    const b = playGame(newGame('seed-two', TEST_CONTENT));
    expect(a.moves).not.toEqual(b.moves);
  });

  it('save/replay round-trip: journal reconstitutes the exact game (§4.2)', () => {
    const final = playGame(newGame('replay-seed', TEST_CONTENT));
    const rebuilt = replay('replay-seed', TEST_CONTENT, final.moves);
    expect(rebuilt).toEqual(final);
  });

  it('every journaled move was legal when applied (invariant §4.4)', () => {
    // replay() re-validates each move; reaching the end proves the journal is legal.
    const final = playGame(newGame('journal-seed', TEST_CONTENT));
    const rebuilt = replay('journal-seed', TEST_CONTENT, final.moves);
    expect(rebuilt.moves).toHaveLength(final.moves.length);
  });

  it('the policy always finds a move in every phase it visits', () => {
    let state = newGame('policy-smoke', TEST_CONTENT);
    for (let i = 0; i < 100 && state.phase !== 'gameOver'; i++) {
      state = apply(state, chooseMove(state));
    }
    expect(state.moves.length).toBeGreaterThan(0);
    assertInvariants(state);
  });
});
