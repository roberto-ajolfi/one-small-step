/**
 * Economy — every resource formula in one place (spec §4.3, FR1.3/FR4.2/FR5.5).
 *
 * Formulas are rules, not tuning: money = s, rd = ⌈s/2⌉, crew = ⌈s/3⌉,
 * repair = s, bonus = ⌈s/2⌉ (design doc FR1.3, OQ4). Everything tunable —
 * costs, discounts, repair window sizes — comes from `tuning`/content instead.
 */

import type { Card, TechItem } from './content';
import { applyAbility, abilitiesOf } from './abilities';
import type { GameState } from './state';

/** Money value of cashing a card = s (FR1.3). */
export function moneyValue(s: number): number {
  return s;
}

/** R&D value of investing a card = ⌈s/2⌉ (FR1.3). */
export function rdValue(s: number): number {
  return Math.ceil(s / 2);
}

/** Crew bonus an assigned person adds to every phase draw = ⌈s/3⌉ (FR1.3/FR6.1). */
export function crewValue(s: number): number {
  return Math.ceil(s / 3);
}

/** Repair points a Person/Equipment card is worth when burned = s (FR5.5). */
export function repairValue(s: number): number {
  return s;
}

/** Draw-boost / repair-reduction a held Bonus is worth = ⌈s/2⌉ (FR1.3). */
export function bonusValue(s: number): number {
  return Math.ceil(s / 2);
}

/**
 * R&D discount granted by recruited techs on a purchase (FR6.6, automatic per
 * ruling 7). Per-turn-limited discounts (Hamilton) are skipped once consumed
 * this turn. Discounts stack across matching techs and floor the cost at 0.
 *
 * @param state - current state (pool + this turn's consumed discounts).
 * @param item - the tech item being purchased.
 * @returns total R&D reduction, ≥ 0.
 */
export function devDiscountFor(state: GameState, item: TechItem): number {
  let total = 0;
  for (const cardId of Object.keys(state.crewPool)) {
    const card = state.content.cards.find((c) => c.id === cardId);
    if (!card || card.named?.role !== 'tech') continue;
    for (const ability of abilitiesOf(card)) {
      if (ability.kind !== 'devDiscount') continue;
      const effect = applyAbility(ability, { kind: 'purchase', item });
      if (!effect || effect.kind !== 'discount') continue;
      if (ability.perTurn && state.devDiscountsUsedThisTurn.includes(cardId)) continue;
      total += effect.amount;
    }
  }
  return total;
}

/**
 * Providers of a per-turn-limited discount for `item` that have NOT yet been
 * consumed this turn — used by the reducer to record consumption on purchase.
 * Stunned techs still discount (ruling 26); only support bonuses are blocked.
 */
export function perTurnDiscountProviders(state: GameState, item: TechItem): string[] {
  const providers: string[] = [];
  for (const [cardId] of Object.entries(state.crewPool)) {
    const card = state.content.cards.find((c) => c.id === cardId);
    if (!card || card.named?.role !== 'tech') continue;
    if (state.devDiscountsUsedThisTurn.includes(cardId)) continue;
    for (const ability of abilitiesOf(card)) {
      if (ability.kind !== 'devDiscount' || !ability.perTurn) continue;
      const effect = applyAbility(ability, { kind: 'purchase', item });
      if (effect && effect.kind === 'discount') providers.push(cardId);
    }
  }
  return providers;
}

/** Effective R&D cost of a purchase after automatic discounts (floors at 0). */
export function effectiveRdCost(state: GameState, item: TechItem): number {
  return Math.max(0, item.rdCost - devDiscountFor(state, item));
}

/**
 * Total value of a repair payment (FR5.5 + rulings 5/14): Person & Equipment
 * contribute their s from hand, crew pool (never assigned crew, ruling 24) or
 * in-play; held Bonuses contribute ⌈s/2⌉.
 *
 * @param state - current state.
 * @param cards - candidate cards, any mix of the sources above.
 * @returns the summed repair points.
 */
export function repairPaymentValue(state: GameState, cards: readonly Card[]): number {
  let total = 0;
  for (const card of cards) {
    if (card.kind === 'bonus') total += bonusValue(card.s);
    else total += repairValue(card.s);
  }
  return total;
}

/** Convenience: value of a hand/in-play card list by its content rows. */
export function cardsValue(state: GameState, ids: readonly string[], mode: 'money' | 'rd'): number {
  const total = ids.reduce((sum, id) => {
    const card = state.content.cards.find((c) => c.id === id);
    if (!card) throw new Error(`unknown card id: ${id}`);
    return sum + (mode === 'money' ? moneyValue(card.s) : rdValue(card.s));
  }, 0);
  return total;
}
