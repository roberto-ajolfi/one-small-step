/**
 * Stats tests — aggregation math, the tuning-loop band verdicts and the
 * rendered report (spec §6: "prints a band report (target vs observed)").
 */

import { describe, expect, it } from 'vitest';
import { content } from '../../src/data';
import {
  aggregate,
  evaluateBands,
  renderReport,
  type GameRecord,
  type RunMeta,
} from '../../src/sim';

function record(patch: Partial<GameRecord> = {}): GameRecord {
  return {
    seed: 's#0',
    policy: 'baseline',
    result: 'moon',
    vp: 70,
    tier: 'Distinguished Service Medal',
    turn: 28,
    apollo11Turn: 28,
    sovietLandingTurn: null,
    apolloHardwareTurn: 26,
    missionFails: Array(12).fill(0),
    missionReached: Array(12).fill(true),
    sideMissions: { AH: { flown: true, fails: 1 } },
    milestoneVpBites: 6,
    milestoneMoneyBites: 3,
    resourcesByYear: [{ year: 1960, money: 5, rd: 2 }],
    moveCount: 300,
    ...patch,
  };
}

function meta(patch: Partial<RunMeta> = {}): RunMeta {
  return {
    policy: 'baseline',
    games: 4,
    seed: 'sim',
    workers: 1,
    elapsedMs: 1000,
    gamesPerSecond: 4,
    ...patch,
  };
}

describe('aggregate (spec §6 stats list)', () => {
  it('collects result and tier distributions and the win rate', () => {
    const stats = aggregate(
      [
        record({ result: 'moon' }),
        record({ result: 'moon' }),
        record({ result: 'timedOut', vp: 50, tier: 'Good Effort', apollo11Turn: null, turn: 30 }),
        record({ result: 'sovietsWon', vp: 0, tier: 'Total Loss', apollo11Turn: null, sovietLandingTurn: 26, turn: 26 }),
      ],
      [],
      meta(),
      content,
    );
    expect(stats.results).toEqual({ moon: 2, timedOut: 1, sovietsWon: 1 });
    expect(stats.winRate).toBe(0.5);
    expect(stats.tiers).toEqual({
      'Distinguished Service Medal': 2,
      'Good Effort': 1,
      'Total Loss': 1,
    });
    expect(stats.scores.mean).toBeCloseTo(47.5);
    expect(stats.scores.max).toBe(70);
    expect(stats.scores.min).toBe(0);
  });

  it('reports per-mission failure and retry rates', () => {
    const stats = aggregate(
      [
        record({ missionFails: Array(12).fill(0) }),
        record({ missionFails: [0, 2, ...Array(10).fill(0)] }),
        record({ missionFails: Array(12).fill(0), missionReached: Array(12).fill(false) }),
      ],
      [],
      meta({ games: 3 }),
      content,
    );
    expect(stats.missions).toHaveLength(12);
    expect(stats.missions[1].reached).toBe(2);
    expect(stats.missions[1].fails).toBe(2);
    expect(stats.missions[1].failRate).toBe(1); // 2 fails / 2 reached
    expect(stats.missions[1].retryRate).toBe(0.5); // 1 of 2 reached games retried
  });

  it('summarizes race turns, hardware timing and milestone bites', () => {
    const stats = aggregate(
      [
        record({ apollo11Turn: 26, turn: 26 }),
        record({ apollo11Turn: 30, turn: 30 }),
        record({
          result: 'sovietsWon',
          apollo11Turn: null,
          sovietLandingTurn: 24,
          turn: 24,
          apolloHardwareTurn: null,
        }),
      ],
      [],
      meta({ games: 3 }),
      content,
    );
    expect(stats.apollo11Turns.games).toBe(2);
    expect(stats.apollo11Turns.mean).toBe(28);
    expect(stats.apollo11Turns.histogram[26]).toBe(1);
    expect(stats.sovietLandingTurns.games).toBe(1);
    expect(stats.sovietLandingTurns.mean).toBe(24);
    expect(stats.apolloHardwareTurn.games).toBe(2);
    expect(stats.apolloHardwareTurn.coverage).toBeCloseTo(2 / 3);
    expect(stats.milestoneBites.meanVp).toBe(6);
    expect(stats.milestoneBites.meanMoney).toBe(3);
  });

  it('averages resources per year over the games reporting that year', () => {
    const stats = aggregate(
      [
        record({ resourcesByYear: [{ year: 1960, money: 10, rd: 4 }] }),
        record({ resourcesByYear: [{ year: 1960, money: 0, rd: 2 }] }),
      ],
      [],
      meta({ games: 2 }),
      content,
    );
    expect(stats.resourcesByYear).toEqual([{ year: 1960, meanMoney: 5, meanRd: 3 }]);
  });
});

describe('band report (target vs observed)', () => {
  it('passes baseline inside the 30–40% win-rate band with hardware by ~turn 27', () => {
    const stats = aggregate([record()], [], meta({ policy: 'baseline' }), content);
    const bands = evaluateBands({ ...stats, winRate: 0.35 });
    expect(bands).toHaveLength(2);
    expect(bands.every((b) => b.pass)).toBe(true);
    expect(bands[0].target).toBe('30–40%');
    expect(bands[1].target).toBe('≤ 27.5');
  });

  it('fails baseline outside the band or with late hardware', () => {
    const base = aggregate([record()], [], meta({ policy: 'baseline' }), content);
    expect(evaluateBands({ ...base, winRate: 0.5 })[0].pass).toBe(false);
    const late = aggregate(
      [record({ apolloHardwareTurn: 29 })],
      [],
      meta({ policy: 'baseline' }),
      content,
    );
    expect(evaluateBands(late)[1].pass).toBe(false);
  });

  it('caps aggressive at 60% and leaves conservative informational', () => {
    const aggressive = aggregate([record()], [], meta({ policy: 'aggressive' }), content);
    expect(evaluateBands({ ...aggressive, winRate: 0.55 })).toHaveLength(1);
    expect(evaluateBands({ ...aggressive, winRate: 0.55 })[0].pass).toBe(true);
    expect(evaluateBands({ ...aggressive, winRate: 0.75 })[0].pass).toBe(false);
    const conservative = aggregate([record()], [], meta({ policy: 'conservative' }), content);
    expect(evaluateBands(conservative)).toHaveLength(0);
  });
});

describe('renderReport', () => {
  it('prints every section and the band verdicts', () => {
    const stats = aggregate([record()], [], meta(), content);
    const report = renderReport(stats, evaluateBands(stats));
    for (const section of [
      'Results',
      'Tiers',
      'Scores (VP)',
      'Campaign ladder',
      'Side missions',
      'Race',
      'Economy',
      'Bands (target vs observed)',
      'Anomalies: 0',
    ]) {
      expect(report).toContain(section);
    }
    expect(report).toMatch(/\[(PASS|FAIL)\]/);
  });
});
