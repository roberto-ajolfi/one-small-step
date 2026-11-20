/**
 * Card-table cross-checks (spec §5): the 54-row table must satisfy the design
 * doc's hybrid skeleton — s-ladder and suit→mode mapping (FR1.2), values
 * formulas (FR1.3), the named bands and roster (FR1.2/FR6.2), ability shapes
 * (FR6.6), the four aces (FR7.2) and the two jokers (FR9.1).
 */

import { describe, expect, it } from 'vitest';
import { content } from '../../src/data';
import type { Card, Rank } from '../../src/engine';
import { bonusValue, crewValue, moneyValue, rdValue, repairValue } from '../../src/engine';

const cards = content.cards;
const byId = new Map(cards.map((card) => [card.id, card]));

/** FR1.2 named band: 9–K ♥ + J–K ♦ = astronauts, 9–K ♣ + J–K ♠ = techs. */
const ASTRONAUT_BAND = ['9H', '10H', 'JH', 'QH', 'KH', 'JD', 'QD', 'KD'];
const TECH_BAND = ['9C', '10C', 'JC', 'QC', 'KC', 'JS', 'QS', 'KS'];

/** FR1.2 ladder: pip for 2–10, 10 for J/Q/K, 12 for A. */
function ladder(rank: Rank): number {
  if (rank === 'A') return 12;
  return typeof rank === 'number' ? rank : 10;
}

describe('deck structure', () => {
  it('has 54 unique rows: 13 per suit plus two jokers (FR1.1)', () => {
    expect(cards).toHaveLength(54);
    expect(new Set(cards.map((card) => card.id)).size).toBe(54);
    for (const suit of ['H', 'D', 'S', 'C']) {
      expect(cards.filter((card) => card.suit === suit)).toHaveLength(13);
    }
    expect(cards.filter((card) => card.suit === 'JOKER')).toHaveLength(2);
  });

  it('derives every id from rank+suit; jokers use the JOKER- prefix', () => {
    for (const card of cards) {
      if (card.suit === 'JOKER') expect(card.id.startsWith('JOKER-')).toBe(true);
      else expect(card.id).toBe(`${card.rank}${card.suit}`);
    }
  });

  it('s follows the FR1.2 ladder; jokers hold s 0 (never resolve a check)', () => {
    for (const card of cards) {
      if (card.suit === 'JOKER') expect(card.s).toBe(0);
      else expect(card.s).toBe(ladder(card.rank));
    }
  });

  it('kind follows the suit mapping with named/ace overrides (FR1.2/FR1.3)', () => {
    for (const card of cards) {
      if (card.suit === 'JOKER') {
        expect(card.kind).toBe('event');
      } else if (card.rank === 'A') {
        expect(card.kind).toBe('sideMission');
      } else if (card.named) {
        expect(card.kind).toBe('person'); // named band rows keep the Person mode
      } else {
        expect(card.kind).toBe({ H: 'person', D: 'bonus', S: 'equipment', C: 'action' }[card.suit]);
      }
    }
  });
});

describe('named people (FR1.2/FR6.2/FR6.6)', () => {
  it('places all 8 astronauts and 8 techs in their exact bands', () => {
    const astronauts = cards.filter((card) => card.named?.role === 'astronaut').map((c) => c.id);
    const techs = cards.filter((card) => card.named?.role === 'tech').map((c) => c.id);
    expect(astronauts.sort()).toEqual([...ASTRONAUT_BAND].sort());
    expect(techs.sort()).toEqual([...TECH_BAND].sort());
    // no named rows outside the two bands
    const named = cards.filter((card) => card.named).map((c) => c.id);
    expect(named.sort()).toEqual([...ASTRONAUT_BAND, ...TECH_BAND].sort());
  });

  it('uses exactly the FR6.2 roster names', () => {
    const namesOf = (role: 'astronaut' | 'tech') =>
      new Set(
        cards
          .filter((card) => card.named?.role === role)
          .map((card) => card.named?.name as string),
      );
    expect(namesOf('astronaut')).toEqual(
      new Set([
        'Alan Shepard',
        'John Glenn',
        'Gus Grissom',
        'Ed White',
        'Neil Armstrong',
        'Frank Borman',
        'Buzz Aldrin',
        'Michael Collins',
      ]),
    );
    expect(namesOf('tech')).toEqual(
      new Set([
        'Wernher von Braun',
        'Robert Gilruth',
        'Kurt Debus',
        'Chris Kraft',
        'Gene Kranz',
        'John Houbolt',
        'Margaret Hamilton',
        'Max Faget',
      ]),
    );
  });

  it('locks ability shapes to the FR6.6 role split', () => {
    for (const card of cards) {
      if (!card.named) continue;
      for (const ability of card.named.abilities) {
        if (card.named.role === 'astronaut') {
          expect(ability.kind, card.id).toBe('phaseBoost');
        } else {
          expect(['devDiscount', 'phaseBoost', 'kraft', 'reroll'], card.id).toContain(
            ability.kind,
          );
        }
      }
    }
    // Spot-checks against the FR6.6 table (equivalence with the M1 fixture in wiring.test.ts).
    expect(byId.get('KH')?.named?.abilities).toEqual([
      { kind: 'phaseBoost', phases: ['Landing', 'Ascent'], amount: 2 },
    ]);
    expect(byId.get('KS')?.named?.abilities).toEqual([
      { kind: 'devDiscount', domains: ['propulsion'], amount: 2 },
      { kind: 'phaseBoost', phases: ['Launch'], amount: 1 },
    ]);
  });
});

describe('values (FR1.3)', () => {
  it('stored values match the engine formulas for every row', () => {
    for (const card of cards) {
      expect(card.values.money, card.id).toBe(moneyValue(card.s));
      expect(card.values.rd, card.id).toBe(rdValue(card.s));
      if (card.kind === 'person') {
        expect(card.values.crew, card.id).toBe(crewValue(card.s));
        expect(card.values.repair, card.id).toBe(repairValue(card.s));
        expect(card.values.bonus, card.id).toBeUndefined();
      } else if (card.kind === 'equipment') {
        expect(card.values.repair, card.id).toBe(repairValue(card.s));
        expect(card.values.crew, card.id).toBeUndefined();
        expect(card.values.bonus, card.id).toBeUndefined();
      } else if (card.kind === 'bonus') {
        expect(card.values.bonus, card.id).toBe(bonusValue(card.s));
        expect(card.values.crew, card.id).toBeUndefined();
        expect(card.values.repair, card.id).toBeUndefined();
      } else {
        expect(card.values.crew, card.id).toBeUndefined();
        expect(card.values.repair, card.id).toBeUndefined();
        expect(card.values.bonus, card.id).toBeUndefined();
      }
    }
  });
});

describe('aces and jokers (FR7/FR9)', () => {
  it('carries the four FR7.2 side missions with their unique perks', () => {
    const aces = cards.filter((card) => card.kind === 'sideMission');
    expect(aces.map((card) => card.id).sort()).toEqual(['AC', 'AD', 'AH', 'AS']);
    const perksById = Object.fromEntries(aces.map((card) => [card.id, card.sideMission?.perk]));
    expect(perksById).toEqual({
      AC: { kind: 'firstMissionDifficulty', amount: -1 },
      AD: { kind: 'yearEndMoney', amount: 2 },
      AH: { kind: 'crewBonusAdd', amount: 1 },
      AS: { kind: 'phaseDrawAdd', amount: 1 },
    });
    expect(aces.map((card) => card.sideMission?.name).sort()).toEqual(
      ['Deep Space Network', 'Telstar', 'The New Nine', 'Unmanned Test Program'].sort(),
    );
  });

  it('attaches a payload to every ace and to nothing else', () => {
    for (const card of cards) {
      expect(card.sideMission !== undefined, card.id).toBe(card.kind === 'sideMission');
    }
  });

  it('has exactly two joker rows, both kind event (FR1.2/FR9.1)', () => {
    const jokers = cards.filter((card) => card.suit === 'JOKER');
    expect(jokers.map((card) => card.id)).toEqual(['JOKER-A', 'JOKER-B']);
    expect(jokers.every((card) => card.kind === 'event')).toBe(true);
  });

  it('gives every row a flavor name from the kit reference (spec §5)', () => {
    const withoutFlavor = cards.filter((card) => !card.flavor) as Card[];
    expect(withoutFlavor).toEqual([]);
  });
});
