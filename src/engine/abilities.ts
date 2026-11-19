/**
 * Abilities — the single application path for every named ability and perk
 * (spec §4.3: no ability may be hard-coded into phase math or economy).
 *
 * Callers describe the situation (`AbilityContext`) and receive an effect or
 * null when the ability does not apply there. This keeps FR6.6's locked ability
 * shapes with tunable numbers entirely data-driven (OQ12).
 */

import type { Ability, Card, Mission, PhaseName, PerkId, TechItem } from './content';

/** Situation in which an ability is being evaluated. */
export type AbilityContext =
  | { kind: 'phase'; phase: PhaseName; side: 'campaign' | 'side' }
  | { kind: 'purchase'; item: TechItem }
  | { kind: 'yearEnd' }
  | { kind: 'difficulty'; mission: Mission; firstAttemptOfProgram: boolean };

/** What an ability contributes in a context. */
export type AbilityEffect =
  | { kind: 'add'; amount: number }
  | { kind: 'discount'; amount: number }
  | { kind: 'crewBonusAdd'; amount: number }
  | { kind: 'prompt'; ability: 'kraft' | 'reroll' };

/**
 * Evaluates one ability in one context — the engine's only ability dispatch.
 *
 * @param ability - structured ability from card content (FR6.6 shapes).
 * @param ctx - what is being computed right now.
 * @returns the effect, or null when the ability does not apply in this context.
 */
export function applyAbility(ability: Ability, ctx: AbilityContext): AbilityEffect | null {
  switch (ability.kind) {
    case 'phaseBoost':
      if (ctx.kind !== 'phase' || ctx.side !== 'campaign') return null;
      if (ability.phases === 'all') return { kind: 'add', amount: ability.amount };
      return ability.phases.includes(ctx.phase) ? { kind: 'add', amount: ability.amount } : null;

    case 'devDiscount': {
      if (ctx.kind !== 'purchase') return null;
      const domains = ability.domains;
      const match = domains === 'any' || domains.some((d) => ctx.item.tags.includes(d));
      return match ? { kind: 'discount', amount: ability.amount } : null;
    }

    case 'kraft':
      return ctx.kind === 'phase' ? { kind: 'prompt', ability: 'kraft' } : null;

    case 'reroll':
      return ctx.kind === 'phase' ? { kind: 'prompt', ability: 'reroll' } : null;

    case 'crewBonusAdd':
      return ctx.kind === 'phase' ? { kind: 'crewBonusAdd', amount: ability.amount } : null;

    case 'phaseDrawAdd':
      // DSN is campaign-only (ruling 17): null for side missions.
      if (ctx.kind !== 'phase' || ctx.side !== 'campaign') return null;
      return { kind: 'add', amount: ability.amount };

    case 'yearEndMoney':
      return ctx.kind === 'yearEnd' ? { kind: 'add', amount: ability.amount } : null;

    case 'firstMissionDifficulty':
      // UTP applies only to the program's first mission on its first attempt (ruling 18).
      if (ctx.kind !== 'difficulty') return null;
      return ctx.firstAttemptOfProgram ? { kind: 'add', amount: ability.amount } : null;
  }
}

/** Collects all abilities of a card (named rows may carry several). */
export function abilitiesOf(card: Card): Ability[] {
  return card.named?.abilities ?? [];
}

/**
 * The perks currently earned (state.perks) as concrete abilities, resolved from
 * the ace rows that grant them. Perks are additive wordings only (FR7.3).
 */
export function earnedPerkAbilities(
  perks: readonly PerkId[],
  cards: readonly Card[],
): Ability[] {
  const earned = new Set(perks);
  const abilities: Ability[] = [];
  for (const card of cards) {
    if (card.kind === 'sideMission' && card.sideMission && earned.has(card.id)) {
      abilities.push(card.sideMission.perk);
    }
  }
  return abilities;
}

/** The side-mission payload on an ace row, if present. */
export function sideMissionOf(card: Card): { name: string; perk: Ability } | undefined {
  return card.kind === 'sideMission' ? card.sideMission : undefined;
}
