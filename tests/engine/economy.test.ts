/**
 * Economy tests — the FR1.3 value formulas verbatim, plus automatic tech
 * development discounts (FR6.6, rulings 7/26): stacking, domains, per-turn caps.
 */

import { describe, expect, it } from 'vitest';
import {
  bonusValue,
  crewValue,
  devDiscountFor,
  effectiveRdCost,
  moneyValue,
  repairValue,
  rdValue,
  newGame,
  validateMove,
} from '../../src/engine';
import { techById } from '../../src/engine';
import { TEST_CONTENT } from '../fixtures/content';
import { actionsState, pool, withResources } from '../helpers/rig';

const base = () => newGame('economy-test', TEST_CONTENT);

describe('economy formulas (FR1.3)', () => {
  it('money = s, rd = ⌈s/2⌉, crew = ⌈s/3⌉, repair = s, bonus = ⌈s/2⌉', () => {
    // Boundaries from the s-ladder: pips, faces (10), ace (12).
    expect(moneyValue(10)).toBe(10);
    expect(rdValue(2)).toBe(1);
    expect(rdValue(3)).toBe(2);
    expect(rdValue(10)).toBe(5);
    expect(rdValue(12)).toBe(6);
    expect(crewValue(2)).toBe(1);
    expect(crewValue(3)).toBe(1);
    expect(crewValue(4)).toBe(2);
    expect(crewValue(10)).toBe(4);
    expect(crewValue(12)).toBe(4);
    expect(repairValue(7)).toBe(7);
    expect(bonusValue(7)).toBe(4);
    expect(bonusValue(8)).toBe(4);
    expect(bonusValue(9)).toBe(5);
  });
});

describe('development discounts (FR6.6, automatic per ruling 7)', () => {
  it('von Braun discounts propulsion purchases by 2', () => {
    const state = pool(base(), { KS: { state: 'ready', launchesLeft: 0 } });
    const redstone = techById(TEST_CONTENT, 'redstone');
    const mercury = techById(TEST_CONTENT, 'mercury');
    expect(devDiscountFor(state, redstone)).toBe(2);
    expect(devDiscountFor(state, mercury)).toBe(0); // capsule domain, not propulsion
    expect(effectiveRdCost(state, redstone)).toBe(3); // 5 − 2
  });

  it('discounts stack across matching techs (von Braun + Debus)', () => {
    const state = pool(base(), {
      KS: { state: 'ready', launchesLeft: 0 },
      JC: { state: 'ready', launchesLeft: 0 },
    });
    expect(devDiscountFor(state, techById(TEST_CONTENT, 'saturn-v'))).toBe(3);
  });

  it('stunned techs still discount (ruling 26: stun blocks support only)', () => {
    const state = pool(base(), { KS: { state: 'stunned', launchesLeft: 1 } });
    expect(devDiscountFor(state, techById(TEST_CONTENT, 'atlas'))).toBe(2);
  });

  it('per-turn discounts (Hamilton) apply once per turn', () => {
    let state = pool(base(), { QS: { state: 'ready', launchesLeft: 0 } });
    const item = techById(TEST_CONTENT, 'saturn-v');
    expect(devDiscountFor(state, item)).toBe(2);
    state = { ...state, devDiscountsUsedThisTurn: ['QS'] };
    expect(devDiscountFor(state, item)).toBe(0);
  });

  it('effective cost never goes negative', () => {
    const state = pool(base(), {
      QS: { state: 'ready', launchesLeft: 0 },
      JC: { state: 'ready', launchesLeft: 0 },
      KS: { state: 'ready', launchesLeft: 0 },
      JS: { state: 'ready', launchesLeft: 0 },
    });
    // Agena costs 5 R&D; Hamilton 2 + Debus 1 + Houbolt 2 = 5 → exactly 0.
    expect(effectiveRdCost(state, techById(TEST_CONTENT, 'agena'))).toBe(0);
  });

  it('resource affordability uses discounted costs', () => {
    const poor = withResources(pool(actionsState('economy-afford'), { KS: { state: 'ready', launchesLeft: 0 } }), {
      money: 5,
      rd: 2,
    });
    // Redstone: 5 R&D − 2 (von Braun) = 3 → 2 R&D is still not enough …
    expect(validateMove(poor, { t: 'developTech', tech: 'redstone' })).toMatch(/R&D/);
    // … but the discounted 3 (not the printed 5) is what unlocks the buy.
    const rich = withResources(poor, { money: 5, rd: 3 });
    expect(validateMove(rich, { t: 'developTech', tech: 'redstone' })).toBeNull();
  });
});
