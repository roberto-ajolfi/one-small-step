/**
 * Cross-reference tests (spec §5, §9): content files must agree with each
 * other and with the design doc's normative tables — the FR5.1 ladder, the
 * FR4.2 tech costs + FR4.3 gates, the FR9.2 event table, and the mission ↔
 * tech-id references that let a mission actually launch (FR4.4).
 */

import { describe, expect, it } from 'vitest';
import { content } from '../../src/data';

/** [id, year, chain length, vp] per FR5.1. */
const FR51_LADDER = [
  ['freedom-7', 1961, 4, 2],
  ['friendship-7', 1962, 5, 3],
  ['faith-7', 1963, 5, 4],
  ['gemini-3', 1965, 5, 3],
  ['gemini-4', 1965, 6, 4],
  ['gemini-8', 1966, 6, 5],
  ['gemini-12', 1966, 6, 5],
  ['apollo-7', 1968, 5, 5],
  ['apollo-8', 1968, 6, 7],
  ['apollo-9', 1969, 6, 6],
  ['apollo-10', 1969, 7, 7],
  ['apollo-11', 1969, 8, 10],
] as const;

/** [id, rdCost, moneyCost] per FR4.2 (harness-calibrated costs, M3 tuning pass). */
const FR42_COSTS: Record<string, [number, number]> = {
  redstone: [5, 5],
  atlas: [8, 8],
  mercury: [8, 5],
  titan: [8, 8],
  gemini: [10, 8],
  agena: [5, 5],
  'saturn-ib': [10, 10],
  'saturn-v': [18, 18],
  csm: [12, 10],
  lm: [12, 12],
  'eva-suit': [5, 2],
};

describe('campaign ladder (FR5)', () => {
  it('matches FR5.1 in order, years, chain length and VP', () => {
    const rows = content.missions.map((m) => [m.id, m.year, m.chain.length, m.vp]);
    expect(rows).toEqual([...FR51_LADDER]);
    expect(content.missions.reduce((sum, m) => sum + m.vp, 0)).toBe(61); // FR10.1 max
  });

  it('walks the programs in ladder order: 3 Mercury, 4 Gemini, 5 Apollo', () => {
    expect(content.missions.map((m) => m.program)).toEqual([
      ...Array(3).fill('mercury'),
      ...Array(4).fill('gemini'),
      ...Array(5).fill('apollo'),
    ]);
  });

  it('opens every chain with Pre-launch and closes with Splashdown (FR5.2)', () => {
    for (const mission of content.missions) {
      expect(mission.chain[0], mission.id).toBe('Pre-launch');
      expect(mission.chain[mission.chain.length - 1], mission.id).toBe('Splashdown');
    }
  });

  it('requires only hardware that exists (spec §5 cross-check, FR4.4)', () => {
    const techIds = new Set(content.techTree.map((item) => item.id));
    for (const mission of content.missions) {
      for (const req of mission.requires) {
        expect(techIds.has(req), `${mission.id} → ${req}`).toBe(true);
      }
    }
  });
});

describe('tech tree (FR4)', () => {
  it('costs match the FR4.2 list exactly', () => {
    expect(content.techTree).toHaveLength(11);
    const costs = Object.fromEntries(
      content.techTree.map((item) => [item.id, [item.rdCost, item.moneyCost]]),
    );
    expect(costs).toEqual(FR42_COSTS);
  });

  it('gates purchases by program milestone, not calendar (FR4.3)', () => {
    for (const item of content.techTree) {
      const expected =
        item.program === 'mercury'
          ? undefined
          : { program: item.program === 'gemini' ? 'mercury' : 'gemini', minCompleted: 1 };
      expect(item.unlocksAfter, item.id).toEqual(expected);
    }
  });

  it('has no dead hardware: every item is required by some mission', () => {
    const required = new Set(content.missions.flatMap((mission) => mission.requires));
    for (const item of content.techTree) {
      expect(required.has(item.id), item.id).toBe(true);
    }
  });
});

describe('event table (FR9)', () => {
  it('matches the FR9.2 d6 rows: names and effects', () => {
    expect(content.events.map((e) => [e.face, e.name, e.effects])).toEqual([
      [1, 'Gagarin Orbits!', [{ type: 'sovietShift', amount: 6 }]],
      [2, 'Soviet Lunar Probe', [{ type: 'sovietShift', amount: 4 }]],
      [3, 'Apollo 1 Fire', [{ type: 'loseActions', amount: 2 }, { type: 'stunCrew', launches: 1 }]],
      [4, "Kennedy's Moon Speech", [{ type: 'rdGain', amount: 4 }]],
      [5, 'Congressional Windfall', [{ type: 'moneyGain', amount: 6 }]],
      [6, 'Soyuz 1 Setback', [{ type: 'sovietShift', amount: -2 }]],
    ]);
  });
});

describe('score ceiling (FR10.1, ruling 25)', () => {
  it('ships content worth exactly 87 max: 61 mission + 10 program + 16 side', () => {
    const missionVp = content.missions.reduce((sum, m) => sum + m.vp, 0);
    const programVp = Object.values(content.tuning.programBonuses).reduce((a, b) => a + b, 0);
    // Two deck copies of each of the four aces: 8 flights × 2 VP (FR1.1 + FR7.1).
    const sideRows = content.cards.filter((card) => card.kind === 'sideMission').length;
    const sideVp = sideRows * 2 * content.tuning.sideMissionVp;
    expect([missionVp, programVp, sideVp]).toEqual([61, 10, 16]);
    expect(missionVp + programVp + sideVp).toBe(87);
  });
});
