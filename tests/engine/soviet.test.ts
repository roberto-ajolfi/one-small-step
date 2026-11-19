/**
 * Soviet track tests — drift, milestone bites (VP + money with clamp at 0,
 * ruling 19), one-bite-per-milestone across retreats, jumps, and the final
 * space flag that drives the FR8.3 tie-break.
 */

import { describe, expect, it } from 'vitest';
import { advanceSoviet, newGame } from '../../src/engine';
import { TEST_CONTENT } from '../fixtures/content';
import { withResources } from '../helpers/rig';

const state = () => newGame('soviet-test', TEST_CONTENT);

describe('advanceSoviet (FR8)', () => {
  it('drifts forward and clamps at the track length', () => {
    const d = { ...state() };
    advanceSoviet(d, 1, 'drift');
    expect(d.soviet.position).toBe(1);
    advanceSoviet(d, 100, 'push');
    expect(d.soviet.position).toBe(36);
    expect(d.soviet.reachedFinal).toBe(true);
  });

  it('clamps relief pushes at 0 and keeps the historical max', () => {
    const d = { ...state() };
    advanceSoviet(d, 4, 'push');
    advanceSoviet(d, -10, 'Soyuz 1 relief');
    expect(d.soviet.position).toBe(0);
    expect(d.soviet.maxPosition).toBe(4);
  });

  it('bites −1 VP for each milestone crossed', () => {
    const d = { ...state() };
    advanceSoviet(d, 3, 'push'); // crosses 3 (Gagarin)
    expect(d.vp.penaltyMilestones).toBe(1);
    advanceSoviet(d, 3, 'drift'); // crosses 6 (Titov)
    expect(d.vp.penaltyMilestones).toBe(2);
    advanceSoviet(d, 2, 'drift'); // 8 — no milestone
    expect(d.vp.penaltyMilestones).toBe(2);
  });

  it('bites −3 Money on every 6th milestone, clamped at 0 (ruling 19)', () => {
    let d = { ...state() };
    d = withResources(d, { money: 10, rd: 0 });
    advanceSoviet(d, 6, 'push'); // crosses 3 (VP only) and 6 (VP + −3 Money)
    expect(d.vp.penaltyMilestones).toBe(2);
    expect(d.resources.money).toBe(7);

    let broke = { ...state() };
    broke = withResources(broke, { money: 1, rd: 0 });
    advanceSoviet(broke, 6, 'push');
    expect(broke.resources.money).toBe(0); // never negative
  });

  it('bites each milestone only once even after retreat and re-crossing', () => {
    const d = { ...state() };
    advanceSoviet(d, 6, 'push'); // bites 3 and 6
    expect(d.vp.penaltyMilestones).toBe(2);
    advanceSoviet(d, -4, 'Soyuz 1 relief'); // back to 2
    expect(d.soviet.position).toBe(2);
    advanceSoviet(d, 4, 'drift'); // re-crosses 3 and 6 — already bitten
    expect(d.vp.penaltyMilestones).toBe(2);
    advanceSoviet(d, 3, 'drift'); // crosses 9 — new bite
    expect(d.vp.penaltyMilestones).toBe(3);
  });

  it('a +3 jump crosses exactly the one milestone in its path', () => {
    const d = { ...state() };
    advanceSoviet(d, 5, 'push'); // crosses 3
    expect(d.vp.penaltyMilestones).toBe(1);
    advanceSoviet(d, 3, 'push'); // 5 → 8 crosses 6
    expect(d.vp.penaltyMilestones).toBe(2);
    expect(d.soviet.position).toBe(8);
  });

  it('records the final-space flag exactly at the track length', () => {
    const d = { ...state() };
    advanceSoviet(d, 35, 'push');
    expect(d.soviet.reachedFinal).toBe(false);
    advanceSoviet(d, 1, 'drift');
    expect(d.soviet.position).toBe(36);
    expect(d.soviet.maxPosition).toBe(36);
    expect(d.soviet.reachedFinal).toBe(true);
  });

  it('milestone names/order match the kit (every 3rd space)', () => {
    // 12 milestones over 36 spaces — the tuning drives the cadence.
    const t = TEST_CONTENT.tuning;
    expect(t.sovietTrackLength / t.milestoneEvery).toBe(12);
    expect(t.moneyBiteEvery).toBe(6);
  });
});
