/**
 * Event tests — all six d6 rows applied inline on joker draws (FR9, ruling 28),
 * jokers never entering the hand (rulings 2/23), and Apollo 1 Fire stunning
 * only ready crew while costing next turn's actions (FR9.2 + FR6.5).
 */

import { describe, expect, it } from 'vitest';
import {
  apply,
  newGame,
  resolveJokerDraw,
  type GameState,
} from '../../src/engine';
import { TEST_CONTENT } from '../fixtures/content';
import { deckTop, pool, rngForFace } from '../helpers/rig';

const base = () => newGame('events-test', TEST_CONTENT);

/** State with JOKER-A on top of the deck and the RNG primed for `face`. */
function jokerDraw(face: number, patch: Partial<GameState> = {}): GameState {
  const seeded = { ...base(), ...patch };
  return { ...deckTop(seeded, 'JOKER-A'), rngState: rngForFace(face) };
}

describe('event table (FR9.2)', () => {
  it('1 Gagarin Orbits: Soviet +6 (crosses milestones 3 and 6 → −2 VP)', () => {
    const d = jokerDraw(1);
    resolveJokerDraw(d, 'JOKER-A');
    expect(d.soviet.position).toBe(6);
    expect(d.vp.penaltyMilestones).toBe(2);
    expect(d.discard).toContain('JOKER-A');
  });

  it('2 Soviet Lunar Probe: Soviet +4 (crosses milestone 3 → −1 VP)', () => {
    const d = jokerDraw(2);
    resolveJokerDraw(d, 'JOKER-A');
    expect(d.soviet.position).toBe(4);
    expect(d.vp.penaltyMilestones).toBe(1);
  });

  it('3 Apollo 1 Fire: −2 actions next turn + ready crew stunned 1 launch', () => {
    const d = pool(jokerDraw(3), {
      '5H': { state: 'ready', launchesLeft: 0 },
      '6H': { state: 'injured', launchesLeft: 2 },
    });
    resolveJokerDraw(d, 'JOKER-A');
    expect(d.pendingActionLoss).toBe(2);
    expect(d.crewPool['5H']).toEqual({ state: 'stunned', launchesLeft: 1 });
    // Injured crew are untouched — the fire stuns every READY member (FR6.5).
    expect(d.crewPool['6H']).toEqual({ state: 'injured', launchesLeft: 2 });
  });

  it("4 Kennedy's Moon Speech: +4 R&D", () => {
    const d = jokerDraw(4);
    resolveJokerDraw(d, 'JOKER-A');
    expect(d.resources.rd).toBe(4);
  });

  it('5 Congressional Windfall: +6 Money', () => {
    const d = jokerDraw(5);
    resolveJokerDraw(d, 'JOKER-A');
    expect(d.resources.money).toBe(6);
  });

  it('6 Soyuz 1 Setback: Soviet −3 clamped at 0', () => {
    const d = jokerDraw(6);
    resolveJokerDraw(d, 'JOKER-A');
    expect(d.soviet.position).toBe(0);
    expect(d.soviet.maxPosition).toBe(0);
  });
});

describe('jokers in draws (FR3.2, rulings 2/23)', () => {
  it('hand draw: the joker resolves inline and never occupies a hand slot', () => {
    let s = base();
    s = { ...s, rngState: rngForFace(4) };
    // At newGame every card is in the deck. Pull the joker to the top with two
    // keepables directly beneath it (deck pops from the end).
    const ids = ['JOKER-A', '5H', '6H'];
    const indices = ids.map((id) => s.deck.indexOf(id));
    expect(indices.every((i) => i >= 0)).toBe(true);
    let deck = [...s.deck];
    for (const idx of [...indices].sort((a, b) => b - a)) {
      deck = [...deck.slice(0, idx), ...deck.slice(idx + 1)];
    }
    s = { ...s, deck: [...deck, '6H', '5H', 'JOKER-A'] };

    const after = apply(s, { t: 'resolvePhase' });
    expect(after.hand).toEqual(['5H', '6H']); // joker replaced, draw count still 2
    expect(after.discard).toContain('JOKER-A');
    expect(after.resources.rd).toBe(4); // primed face 4: Kennedy +4 R&D
    expect(after.phase).toBe('actions');
  });
});
