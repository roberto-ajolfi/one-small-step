/**
 * Scoring tests — the FR10.1 ledger arithmetic, FR10.2 tier bands at their
 * exact boundaries, the ruling-25 maximum of 87, and sovietsWon honoring no
 * score (FR10.3).
 */

import { describe, expect, it } from 'vitest';
import { newGame, programCompleted, scoreGame } from '../../src/engine';
import { TEST_CONTENT } from '../fixtures/content';
import { finished, withIndex, withVp } from '../helpers/rig';

const base = () => newGame('scoring-test', TEST_CONTENT);

describe('scoreGame (FR10)', () => {
  it('sums the ledger minus penalties (FR10.1)', () => {
    const s = withVp(finished(base(), 'moon'), {
      mission: 61,
      side: 16,
      program: 10,
      penaltyFailures: 3,
      penaltyMilestones: 5,
    });
    expect(scoreGame(s).vp).toBe(61 + 16 + 10 - 3 - 5);
  });

  it('moon tier bands at exact boundaries (FR10.2)', () => {
    const at = (vp: number) =>
      scoreGame(withVp(finished(base(), 'moon'), { mission: vp })).tier;
    expect(at(75)).toBe('Distinguished Service Medal');
    expect(at(74)).toBe('NASA Administrator');
    expect(at(65)).toBe('NASA Administrator');
    expect(at(64)).toBe('Mission Accomplished');
  });

  it('timedOut tier bands at exact boundaries (FR10.2)', () => {
    const at = (vp: number) =>
      scoreGame(withVp(finished(base(), 'timedOut'), { mission: vp })).tier;
    expect(at(55)).toBe('Honorable Mention');
    expect(at(54)).toBe('Good Effort');
    expect(at(45)).toBe('Good Effort');
    expect(at(44)).toBe('Budget Overrun');
  });

  it('maximum achievable score is 87 (ruling 25: 61 + 10 + 16)', () => {
    const max =
      TEST_CONTENT.missions.reduce((sum, m) => sum + m.vp, 0) +
      Object.values(TEST_CONTENT.tuning.programBonuses).reduce((a, b) => a + b, 0) +
      4 * 2 * TEST_CONTENT.tuning.sideMissionVp; // 4 aces × 2 copies
    expect(max).toBe(87);
    // The kit's printed 69/79 totals are typos; tiers need the full range.
    expect(max).toBeGreaterThanOrEqual(75);
  });

  it('sovietsWon honors no score (FR10.3)', () => {
    const s = withVp(finished(base(), 'sovietsWon'), { mission: 61 });
    expect(scoreGame(s)).toEqual({ vp: 0, tier: 'Total Loss', result: 'sovietsWon' });
  });

  it('requires a finished game', () => {
    expect(() => scoreGame(base())).toThrow(/finished game/);
  });
});

describe('programCompleted (FR10.1)', () => {
  it('is true only when every mission of the program is done', () => {
    expect(programCompleted(base(), 'mercury')).toBe(false);
    expect(programCompleted(withIndex(base(), 3), 'mercury')).toBe(true); // missions 1–3
    expect(programCompleted(withIndex(base(), 3), 'gemini')).toBe(false);
    expect(programCompleted(withIndex(base(), 7), 'gemini')).toBe(true); // missions 4–7
    expect(programCompleted(withIndex(base(), 12), 'apollo')).toBe(true);
  });
});
