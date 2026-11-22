/**
 * Policy tests — the three bracketing auto-players (spec §6) against real
 * content: every chosen move must be legal, every game must finish, and the
 * window decisions (crew pick, repair payment, ability prompt, hand trim)
 * must follow the documented heuristics.
 */

import { describe, expect, it } from 'vitest';
import {
  currentMission,
  legalMoves,
  newGame,
  type ActiveMission,
  type CardId,
  type GameState,
} from '../../src/engine';
import { content } from '../../src/data';
import { bestCrew, coverWith, playTrial, policies, type CardInstance, type PolicyName } from '../../src/sim';
import { moveToHand, recruit } from '../helpers/rig';

const base = () => newGame('policy-test', content);

/** Stitches a hand-built decision window onto a real game state. */
function windowState(patch: Partial<GameState>): GameState {
  return { ...base(), ...patch } as GameState;
}

/** Minimal in-flight mission for window decisions. */
function activeMission(patch: Partial<ActiveMission> = {}): ActiveMission {
  return {
    missionId: 'freedom-7',
    crew: [],
    supportTechs: [],
    reservedPrebid: [],
    phaseIndex: 0,
    results: [],
    kraftUsed: false,
    rerollUsed: false,
    ...patch,
  };
}

describe('bracketing policies play complete games (spec §6)', () => {
  for (const name of Object.keys(policies) as PolicyName[]) {
    it(`${name} finishes games with legal moves only`, () => {
      for (const seed of [`${name}-one`, `${name}-two`]) {
        const outcome = playTrial(seed, content, policies[name]);
        expect(outcome.anomaly, outcome.anomaly?.error).toBeUndefined();
        const record = outcome.record!;
        expect(['moon', 'timedOut', 'sovietsWon']).toContain(record.result);
        expect(record.missionFails).toHaveLength(content.missions.length);
        expect(record.moveCount).toBeGreaterThan(30);
        expect(record.resourcesByYear[0].year).toBe(1960);
      }
    });
  }

  it('records race turns consistently with the ending', () => {
    const { record } = playTrial('race-record', content, policies.baseline);
    const game = record!;
    if (game.result === 'moon') expect(game.apollo11Turn).toBe(game.turn);
    if (game.result === 'sovietsWon') expect(game.sovietLandingTurn).toBe(game.turn);
    if (game.result === 'timedOut') expect(game.turn).toBe(30);
  });
});

describe('crew selection (FR6.6)', () => {
  it('prefers the chain-matched named astronaut over generic crew', () => {
    // Freedom 7's chain includes Launch: Shepard (+2) beats a generic 5H (+2 raw).
    const state = recruit(recruit(base(), '9H'), '5H');
    const crew = bestCrew(state, currentMission(state));
    expect(crew).toHaveLength(1);
    expect(crew[0]).toBe('9H');
  });

  it('fills exactly the program crew slots', () => {
    const state = recruit(recruit(base(), '9H'), '5H');
    expect(bestCrew(state, currentMission(state))).toHaveLength(1); // mercury: 1 slot
  });
});

describe('coverWith (pre-bid / repair fuel selection)', () => {
  const inst = (id: CardId, value: number): CardInstance => ({ id, value, tier: 1 });

  it('covers with the smallest sufficient set, trimming overshoot', () => {
    const stock = [inst('a', 2), inst('b', 3), inst('c', 10)];
    expect(coverWith(stock, 5).map((i) => i.id)).toEqual(['a', 'b']);
    expect(coverWith(stock, 6).map((i) => i.id)).toEqual(['c']); // 2+3+10 trims to 10
  });

  it('returns nothing when the stock cannot cover the need', () => {
    expect(coverWith([inst('a', 2), inst('b', 3)], 6)).toEqual([]);
  });
});

describe('repair window (FR5.5)', () => {
  const repairWindow = (hand: CardId[], cost: number): GameState => {
    let state = windowState({
      phase: 'repair',
      pending: { kind: 'repair', phaseIndex: 0, outcome: 'minor', cost },
      mission: activeMission(),
    });
    for (const id of hand) state = moveToHand(state, id);
    return state;
  };

  it('pays with the cheapest fuel that covers the cost', () => {
    const state = repairWindow(['5S', '10S'], 3);
    expect(policies.baseline.choose(state, legalMoves(state))).toEqual({
      t: 'payRepair',
      cards: ['5S'],
    });
  });

  it('declines when repair is unaffordable (mission fails instead)', () => {
    const state = repairWindow(['2H'], 3);
    expect(policies.baseline.choose(state, legalMoves(state))).toEqual({ t: 'payRepair', cards: [] });
  });
});

describe('ability window (ruling 9)', () => {
  it('uses Kraft when its +2 flips the phase to a success', () => {
    const state = windowState({
      phase: 'mission',
      pending: { kind: 'ability', phaseIndex: 0, canKraft: true, canReroll: false },
      mission: activeMission({ supportTechs: ['QC'], currentBase: 2, drawnCard: '2H' }),
    });
    // Pre-launch difficulty 3: base 2 + Kraft 2 = 4 ≥ 3 → flip.
    expect(policies.baseline.choose(state, legalMoves(state))).toEqual({
      t: 'resolveAbility',
      use: 'kraft',
    });
  });

  it('declines the prompt when no option rescues the phase', () => {
    const state = windowState({
      phase: 'mission',
      pending: { kind: 'ability', phaseIndex: 0, canKraft: true, canReroll: false },
      mission: activeMission({ supportTechs: ['QC'], currentBase: 0, drawnCard: '2H' }),
    });
    // base 0 + Kraft 2 = 2 < 3 → fall through to the repair window.
    expect(policies.baseline.choose(state, legalMoves(state))).toEqual({ t: 'resolveAbility' });
  });
});

describe('hand-limit window (ruling 27)', () => {
  it('drops exactly the excess lowest-value cards', () => {
    let state = windowState({
      phase: 'upkeep',
      pending: { kind: 'handLimit', excess: 2 },
    });
    for (const id of ['KH', 'AS', '3H', '2H']) state = moveToHand(state, id);
    const move = policies.baseline.choose(state, legalMoves(state));
    expect(move).toEqual({ t: 'discardForLimit', cards: ['2H', '3H'] });
  });
});
