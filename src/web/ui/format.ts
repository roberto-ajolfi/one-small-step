/**
 * Display formatting for card content (spec §7 "Theme": colour is decorative
 * only — every fact is carried by type, symbol + text).
 *
 * The suit legend mirrors the printable kit (page 1): ♥ Person · ♠ Equipment ·
 * ♦ Bonus · ♣ Extra Action · Aces Side Mission · Jokers News Event.
 */

import type { Ability, Card, CardKind, Suit } from '../../engine';

export interface SuitMeta {
  /** Unicode suit symbol — the colourblind-safe half of the encoding. */
  symbol: string;
  /** Decorative tint (Tailwind class); never the only carrier of meaning. */
  tint: string;
}

const SUITS: Record<Suit, SuitMeta> = {
  H: { symbol: '\u2665', tint: 'text-patch-red' }, // ♥
  D: { symbol: '\u2666', tint: 'text-patch-gold' }, // ♦
  S: { symbol: '\u2664', tint: 'text-patch-navy' }, // ♠
  C: { symbol: '\u2663', tint: 'text-patch-teal' }, // ♣
  JOKER: { symbol: '\u2605', tint: 'text-ink' }, // ★
};

export function suitMeta(suit: Suit): SuitMeta {
  return SUITS[suit];
}

const KINDS: Record<CardKind, string> = {
  person: 'Person',
  equipment: 'Equipment',
  bonus: 'Bonus',
  action: 'Extra Action',
  sideMission: 'Side Mission',
  event: 'News Event',
};

export function kindLabel(kind: CardKind): string {
  return KINDS[kind];
}

/** Face label for a rank (numbers pass through, faces are single letters). */
export function rankLabel(card: Card): string {
  return String(card.rank);
}

/** Display name: named person, side-mission title, else the flavour identity. */
export function cardName(card: Card): string {
  return card.named?.name ?? card.sideMission?.name ?? card.flavor ?? card.id;
}

/** One-line summary of an ability, for tech rows and named-person tooltips. */
export function abilityLabel(ability: Ability): string {
  switch (ability.kind) {
    case 'phaseBoost': {
      const where = ability.phases === 'all' ? 'every phase' : ability.phases.join(' / ');
      return `+${ability.amount} to ${where}`;
    }
    case 'devDiscount': {
      const where = ability.domains === 'any' ? 'any hardware' : ability.domains.join(' / ');
      return `-${ability.amount} R&D on ${where}${ability.perTurn ? ' (once per turn)' : ''}`;
    }
    case 'kraft':
      return `+${ability.amount} to one failing phase, once per mission`;
    case 'reroll':
      return 'reroll one failed phase draw, once per mission';
    case 'crewBonusAdd':
      return `+${ability.amount} to every crew bonus`;
    case 'phaseDrawAdd':
      return `+${ability.amount} to every phase draw`;
    case 'yearEndMoney':
      return `+${ability.amount} Money at each year end`;
    case 'firstMissionDifficulty':
      return `-${ability.amount} difficulty on each program's first mission`;
  }
}

/**
 * The card's identity-mode line (kit page 1 "Identity mode" column): what the
 * card does when it is not cashed for Money or invested for R&D.
 */
export function cardIdentity(card: Card): string {
  const v = card.values;
  switch (card.kind) {
    case 'person': {
      const named = card.named ? ` \u00b7 ${card.named.abilities.map(abilityLabel).join(' \u00b7 ')}` : '';
      return `Crew +${v.crew ?? 0} \u00b7 burn ${v.repair ?? 0}${named}`;
    }
    case 'equipment':
      return `Repair ${v.repair ?? 0} \u00b7 pre-bid +${v.repair ?? 0}`;
    case 'bonus':
      return `Hold: bonus +${v.bonus ?? 0} to a draw`;
    case 'action':
      return '+1 action this turn';
    case 'sideMission':
      return card.sideMission ? abilityLabel(card.sideMission.perk) : 'side mission';
    case 'event':
      return 'Roll d6 on the event table';
  }
}

/** Cash / R&D line shown on every card tile. */
export function cardValues(card: Card): string {
  return `$${card.values.money} \u00b7 R&D ${card.values.rd}`;
}
