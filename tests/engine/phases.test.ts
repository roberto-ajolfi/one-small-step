/**
 * Phase math tests — difficulty formula (FR5.3 + rulings 10/18), outcome
 * bands with exact boundaries (ruling 1), and one phase check's total
 * composition (FR5.4: drawn rank + crew + support + perks + pre-bid + boost + Kraft).
 */

import { describe, expect, it } from 'vitest';
import {
  canKraft,
  canReroll,
  missionPhaseTotal,
  newGame,
  outcomeFor,
  phaseDifficulty,
  sideMissionDifficulty,
  sideMissionTotal,
} from '../../src/engine';
import { missionById } from '../../src/engine';
import { TEST_CONTENT } from '../fixtures/content';
import { withIndex, withPerks } from '../helpers/rig';

const state = () => newGame('phases-test', TEST_CONTENT);
const mission = (id: string) => missionById(TEST_CONTENT, id);

describe('phaseDifficulty (FR5.3)', () => {
  it('applies program base + phase offset', () => {
    const s = state();
    // Mercury base 3: Pre-launch 0, Reentry +1 (kit p.2 offset table).
    expect(phaseDifficulty(s, mission('freedom-7'), 'Pre-launch')).toBe(3);
    expect(phaseDifficulty(s, mission('freedom-7'), 'Reentry')).toBe(4);
    // Gemini base 5, EVA +1.
    expect(phaseDifficulty(s, mission('gemini-4'), 'EVA')).toBe(6);
    // Apollo base 7, Landing +2, +1 because Apollo 11 is Apollo's final mission.
    expect(phaseDifficulty(s, mission('apollo-11'), 'Landing')).toBe(10);
    // Apollo 9 is not final: Landing would be… (it has no Landing phase) — use Reentry.
    expect(phaseDifficulty(s, mission('apollo-9'), 'Reentry')).toBe(8); // 7 + 1
  });

  it('adds +1 on the program final mission (FR5.3)', () => {
    const s = state();
    // Faith 7 is final Mercury: Pre-launch 3 + 1 = 4.
    expect(phaseDifficulty(s, mission('faith-7'), 'Pre-launch')).toBe(4);
    // Apollo 11 final Apollo: Landing 7 + 2 + 1 = 10.
    expect(phaseDifficulty(s, mission('apollo-11'), 'Landing')).toBe(10);
    // Gemini 12 final Gemini: Orbit 5 + 0 + 1 = 6.
    expect(phaseDifficulty(s, mission('gemini-12'), 'Orbit')).toBe(6);
  });

  it('adds the flat +2 retry penalty after any failure (FR5.1)', () => {
    let s = state();
    const idx = TEST_CONTENT.missions.findIndex((m) => m.id === 'freedom-7');
    const status = [...s.campaign.status];
    status[idx] = { state: 'pending', failCount: 2 };
    s = { ...s, campaign: { index: idx, status } };
    // Flat, not stacking: still +2 after two failures.
    expect(phaseDifficulty(s, mission('freedom-7'), 'Pre-launch')).toBe(5);
  });

  it('UTP perk: −1 on first attempt of first mission of a program only (ruling 18)', () => {
    const s = withPerks(state(), ['AC']);
    expect(phaseDifficulty(s, mission('freedom-7'), 'Pre-launch')).toBe(2);
    // Not the program's first mission → no discount.
    expect(phaseDifficulty(s, mission('friendship-7'), 'Pre-launch')).toBe(3);
    // Apollo 7 is Apollo's first mission → discounted even at the ladder's end.
    expect(phaseDifficulty(s, mission('apollo-7'), 'Pre-launch')).toBe(6); // 7 + 0 − 1
    // Apollo 11 is not Apollo's first mission → no UTP, only the final +1.
    expect(phaseDifficulty(s, mission('apollo-11'), 'Pre-launch')).toBe(8); // 7 + 0 + 1
    // Retry loses the discount (ruling 18).
    const idx = TEST_CONTENT.missions.findIndex((m) => m.id === 'freedom-7');
    const status = [...s.campaign.status];
    status[idx] = { state: 'pending', failCount: 1 };
    const retried = { ...s, campaign: { index: idx, status } };
    expect(phaseDifficulty(retried, mission('freedom-7'), 'Pre-launch')).toBe(5); // 3+0+0+2 retry, no −1
  });

  it('Descent offset is +2 (ruling 10)', () => {
    const s = state();
    expect(phaseDifficulty(s, mission('apollo-10'), 'Descent')).toBe(9); // 7 + 2
  });
});

describe('outcome bands (ruling 1: minor shortfall 1–3, major ≥4)', () => {
  const major = TEST_CONTENT.tuning.majorFailureMinShortfall;
  it('classifies exact boundaries', () => {
    expect(outcomeFor(0, major)).toBe('success');
    expect(outcomeFor(5, major)).toBe('success');
    expect(outcomeFor(-1, major)).toBe('minor');
    expect(outcomeFor(-3, major)).toBe('minor');
    expect(outcomeFor(-4, major)).toBe('major');
    expect(outcomeFor(-20, major)).toBe('major');
  });
});

describe('missionPhaseTotal (FR5.4)', () => {
  const baseMission = {
    missionId: 'freedom-7',
    crew: [] as string[],
    supportTechs: [] as string[],
    reservedPrebid: [] as string[],
    phaseIndex: 0,
    results: [],
    kraftUsed: false,
    rerollUsed: false,
  };

  it('sums drawn rank + assigned crew ⌈s/3⌉', () => {
    const s = state();
    const total = missionPhaseTotal(
      s,
      { ...baseMission, crew: ['5H'] }, // s5 → crew +2
      'Pre-launch',
      '9D', // s9
      [],
      [],
      false,
    );
    expect(total).toBe(9 + 2);
  });

  it('adds named astronaut phase abilities only for their phases', () => {
    const s = state();
    // Armstrong (KH): crew ⌈10/3⌉=4, +2 Landing & Ascent only.
    const onLanding = missionPhaseTotal(s, { ...baseMission, crew: ['KH'] }, 'Landing', '2H', [], [], false);
    const onLaunch = missionPhaseTotal(s, { ...baseMission, crew: ['KH'] }, 'Launch', '2H', [], [], false);
    expect(onLanding).toBe(2 + 4 + 2);
    expect(onLaunch).toBe(2 + 4);
    // Grissom (JH) +1 to every phase.
    expect(missionPhaseTotal(s, { ...baseMission, crew: ['JH'] }, 'Splashdown', '2H', [], [], false)).toBe(
      2 + 4 + 1,
    );
  });

  it('adds tech support without crew bonus (ruling 8: no ⌈s/3⌉ for techs)', () => {
    const s = state();
    const total = missionPhaseTotal(
      s,
      { ...baseMission, supportTechs: ['KS'] }, // von Braun +1 Launch
      'Launch',
      '2H',
      [],
      [],
      false,
    );
    expect(total).toBe(2 + 1);
  });

  it('applies DSN +1 per campaign phase and New Nine +1 per crew (rulings 17/FR7.2)', () => {
    const s = withPerks(state(), ['AS', 'AH']);
    const total = missionPhaseTotal(
      s,
      { ...baseMission, crew: ['5H'] },
      'Pre-launch',
      '2H',
      [],
      [],
      false,
    );
    // 2 drawn + (2 crew + 1 New Nine) + 1 DSN = 6.
    expect(total).toBe(6);
  });

  it('adds equipment pre-bid (+s), held bonus boost (+⌈s/2⌉) and Kraft +2', () => {
    const s = state();
    const total = missionPhaseTotal(
      s,
      { ...baseMission, supportTechs: ['QC'], kraftUsed: true },
      'Pre-launch',
      '2H',
      ['7S'], // pre-bid +7
      ['5D'], // boost ⌈5/2⌉ = 3
      true,
    );
    // 2 drawn + 7 pre-bid + 3 boost + 2 Kraft = 14.
    expect(total).toBe(14);
  });

  it('rejects non-equipment pre-bid and unheld boosts', () => {
    const s = state();
    expect(() =>
      missionPhaseTotal(s, { ...baseMission }, 'Pre-launch', '2H', ['5H'], [], false),
    ).toThrow(/pre-bid must be equipment/);
    expect(() =>
      missionPhaseTotal(s, { ...baseMission }, 'Pre-launch', '2H', [], ['5S'], false),
    ).toThrow(/boost must be a held bonus/);
  });

  it('offers Kraft/Kranz only with supporting techs unused this mission (ruling 9)', () => {
    const s = state();
    expect(canKraft(s, baseMission)).toBe(false);
    expect(canReroll(s, baseMission)).toBe(false);
    expect(canKraft(s, { ...baseMission, supportTechs: ['QC'] })).toBe(true);
    expect(canKraft(s, { ...baseMission, supportTechs: ['QC'], kraftUsed: true })).toBe(false);
    expect(canReroll(s, { ...baseMission, supportTechs: ['KC'] })).toBe(true);
    expect(canReroll(s, { ...baseMission, supportTechs: ['KC'], rerollUsed: true })).toBe(false);
  });
});

describe('side missions (FR7.1, rulings 15/16)', () => {
  it('difficulty is 4, +1 flat after any failure', () => {
    const s = state();
    expect(sideMissionDifficulty(s, 0)).toBe(4);
    expect(sideMissionDifficulty(s, 1)).toBe(5);
    expect(sideMissionDifficulty(s, 2)).toBe(5); // flat, not stacking
  });

  it('total = drawn + pre-bid + boost, no crew/DSN (rulings 16/17)', () => {
    const s = withPerks(state(), ['AS']); // DSN must NOT apply
    expect(sideMissionTotal(s, '9D', ['2S'], ['5D'])).toBe(9 + 2 + 3);
  });
});

describe('campaign index rig sanity', () => {
  it('withIndex marks the prefix done', () => {
    const s = withIndex(state(), 3);
    expect(s.campaign.index).toBe(3);
    expect(s.campaign.status.slice(0, 3).every((m) => m.state === 'done')).toBe(true);
  });
});
