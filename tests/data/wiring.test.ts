/**
 * Wiring tests — the M2 exit criterion (spec §11): the JSON bundle is a real
 * `Content` that drives `newGame()`/`replay()` through a full game, and it is
 * equivalent to the M1 hand-built fixture the engine's unit tests run on
 * (fixture stays as the unit-test fallback; the engine never imports data).
 */

import { describe, expect, it } from 'vitest';
import { content } from '../../src/data';
import { assertInvariants, newGame, replay, scoreGame, type Card } from '../../src/engine';
import { TEST_CONTENT } from '../fixtures/content';
import { playGame } from '../integration/scripted';

/** Drops the display-only flavor column so rules can be compared row-for-row. */
function rulesOf(cards: readonly Card[]): Omit<Card, 'flavor'>[] {
  return cards.map(({ flavor: _flavor, ...row }) => row);
}

describe('JSON content drives the engine (M2 wiring)', () => {
  it('newGame(seed, content) opens a legal game on the real data', () => {
    const state = newGame('m2-wiring', content);
    assertInvariants(state);
    expect(state.deck).toHaveLength(108); // 54 rows × 2 decks (FR1.1)
    expect(Object.keys(state.tech)).toHaveLength(11);
    expect(Object.keys(state.campaign.status)).toHaveLength(12);
    expect(Object.keys(state.sideMissions)).toEqual(['AH', 'AD', 'AS', 'AC']);
    expect(state.content).toBe(content);
  });

  it('plays a full scripted game to a terminal result', () => {
    const final = playGame(newGame('m2-full-game', content));
    expect(final.phase).toBe('gameOver');
    assertInvariants(final);
    const score = scoreGame(final);
    expect(score.result).toBe(final.result);
    expect(Number.isFinite(score.vp)).toBe(true);
  });

  it('replays the move journal to the identical game (NFR2)', () => {
    const final = playGame(newGame('m2-replay', content));
    expect(replay('m2-replay', content, final.moves)).toEqual(final);
  });
});

describe('JSON content ≡ M1 fixture', () => {
  it('card rules match the hand-built fixture (display flavor aside)', () => {
    expect(rulesOf(content.cards)).toEqual(rulesOf(TEST_CONTENT.cards));
  });

  it('missions, tech tree, events and tuning match the fixture', () => {
    expect(content.missions).toEqual(TEST_CONTENT.missions);
    expect(content.techTree).toEqual(TEST_CONTENT.techTree);
    expect(content.events).toEqual(TEST_CONTENT.events);
    expect(content.tuning).toEqual(TEST_CONTENT.tuning);
  });
});
