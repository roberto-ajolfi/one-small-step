/**
 * Tuning constants vs the design doc's tuning list (spec §5): every number a
 * balancer might move lives in `tuning.json`, and its shipped value encodes
 * the resolved rules — FR citations anchor each group. M3's harness tunes
 * these against the 30–40% win-rate band without touching engine code.
 */

import { describe, expect, it } from 'vitest';
import { content } from '../../src/data';

const t = content.tuning;

describe('turn structure (FR2)', () => {
  it('draws 2, spends 3 actions, trims to 7 at each of 3 turns per year', () => {
    expect([t.drawPerTurn, t.actionsPerTurn, t.handLimit, t.turnsPerYear]).toEqual([2, 3, 7, 3]);
  });
});

describe('mission economy (FR5)', () => {
  it('repairs cost 3/6; major failure starts at shortfall 4 (FR5.5, ruling 1)', () => {
    expect([t.repairCostMinor, t.repairCostMajor, t.majorFailureMinShortfall]).toEqual([3, 6, 4]);
  });

  it('difficulty = program base + offset, +1 program-final, +2 retry (FR5.3)', () => {
    expect(t.programDifficulty).toEqual({ mercury: 3, gemini: 5, apollo: 7 });
    expect([t.retryPenalty, t.finalMissionBonus]).toEqual([2, 1]);
    expect(t.phaseOffsets).toEqual({
      'Pre-launch': 0,
      Launch: 0,
      Orbit: 0,
      Splashdown: 0,
      EVA: 1,
      Rendezvous: 1,
      'TLI/Coast': 1,
      'Lunar Orbit': 1,
      Reentry: 1,
      Landing: 2,
      Ascent: 2,
      Descent: 2,
    });
  });
});

describe('Soviet track (FR8)', () => {
  it('36 spaces, +1 drift, +3 failure push, +1 side-mission push (FR8.1)', () => {
    expect(t.sovietTrackLength).toBe(36);
    expect([t.sovietDrift, t.sovietPushFailure, t.sovietPushSideMission]).toEqual([1, 3, 1]);
  });

  it('bites −1 VP every 3rd space, −3 Money every 6th (FR8.2)', () => {
    expect([t.milestoneEvery, t.milestoneVpBite, t.moneyBiteEvery, t.milestoneMoneyBite]).toEqual([
      3, 1, 6, 3,
    ]);
    expect(t.sovietTrackLength / t.milestoneEvery).toBe(12); // 12 milestones
    expect(t.moneyBiteEvery % t.milestoneEvery).toBe(0); // money bites ⊂ milestones
  });
});

describe('side missions (FR7)', () => {
  it('one draw vs difficulty 4, +1 retry, +2 VP (FR7.1)', () => {
    expect([t.sideMissionDifficulty, t.sideMissionRetry, t.sideMissionVp]).toEqual([4, 1, 2]);
  });
});

describe('crew and events (FR6/FR9)', () => {
  it('crew slots 1/2/3; injuries sit out 2 launches, stuns 1 (FR6.1/FR6.5)', () => {
    expect(t.crewSlots).toEqual({ mercury: 1, gemini: 2, apollo: 3 });
    expect([t.crewInjuryLaunches, t.crewStunLaunches]).toEqual([2, 1]);
  });

  it('Apollo 1 Fire costs 2 actions next turn (FR9.2)', () => {
    expect(t.apollo1ActionLoss).toBe(2);
  });
});

describe('scoring (FR10)', () => {
  it('program bonuses 2/3/5 (FR10.1)', () => {
    expect(t.programBonuses).toEqual({ mercury: 2, gemini: 3, apollo: 5 });
  });

  it('named victory tiers at 70/55 on a landing, 45/30 timed out (FR10.2)', () => {
    expect(t.tierThresholds).toEqual({
      moon: { distinguished: 70, administrator: 55 },
      timedOut: { honorable: 45, good: 30 },
    });
  });

  it('starts from zero resources (design-doc tuning list)', () => {
    expect([t.startingMoney, t.startingRd]).toEqual([0, 0]);
  });
});
