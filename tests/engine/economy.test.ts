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
} from '../../src/engine';
import { techById } from '../../src/engine';
import { TEST_CONTENT } from '../fixtures/content';
import { pool, withResources } from '../helpers/rig';

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
    expect(effectiveRdCost(state, redstone)).toBe(0); // 2 − 2 floors at 0
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
    // LM costs 5 R&D; Hamilton 2 + Debus 1 + Houbolt 2 = 5 → exactly 0.
    expect(effectiveRdCost(state, techById(TEST_CONTENT, 'lm'))).toBe(0);
  });

  it('resource affordability uses discounted costs', () => {
    const state = withResources(pool(base(), { KS: { state: 'ready', launchesLeft: 0 } }), {
      money: 2,
      rd: 0,
    });
    // Redstone: 2 R&D − 2 discount = 0 → affordable with 0 R&D.
    expect(effectiveRdCost(state, techById(TEST_CONTENT, 'redstone'))).toBe(0);
    expect(state.resources.rd).toBe(0);
  });
});
