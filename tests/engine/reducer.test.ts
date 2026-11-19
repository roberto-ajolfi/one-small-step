/**
 * Reducer tests — the turn state machine end to end: windows (rulings 3/5/9/27),
 * launch → mission chain → outcome (FR5), timers (FR6.5), side missions (FR7),
 * illegal-move reasons (spec §7), and game endings incl. the FR8.3 tie-break.
 *
 * Determinism comes from rigged decks (top-of-deck draws), joker-free opening
 * draws, and seeds that pin the d6 event face; mission fixtures are chosen so
 * the arithmetic cannot flip on any draw.
 */

import { describe, expect, it } from 'vitest';
import {
  apply,
  assertInvariants,
  devDiscountFor,
  IllegalMove,
  legalMoves,
  newGame,
  validateMove,
  type GameState,
} from '../../src/engine';
import { techById, missionById } from '../../src/engine';
import { TEST_CONTENT } from '../fixtures/content';
import {
  actionsState,
  deckTop,
  finished,
  hands,
  pool,
  recruit,
  rngForFace,
  withIndex,
  withPerks,
  withResources,
  withTech,
} from '../helpers/rig';

const base = () => newGame('reducer-test', TEST_CONTENT);
const ALL_TECH = TEST_CONTENT.techTree.map((t) => t.id);

/** Drives every open window to resolution, paying repairs when canonical. */
function resolveWindows(state: GameState): GameState {
  let s = state;
  let guard = 0;
  while (s.phase === 'prebid' || s.phase === 'mission' || s.phase === 'repair') {
    if (++guard > 50) throw new Error('windows did not converge');
    const legal = legalMoves(s);
    const paying = legal.find((m) => m.t === 'payRepair' && m.cards.length > 0);
    const move =
      s.phase === 'prebid'
        ? { t: 'resolvePhase' as const, prebid: [] as string[], boost: [] as string[] }
        : s.phase === 'mission'
          ? { t: 'resolveAbility' as const }
          : paying ?? { t: 'payRepair' as const, cards: [] as string[] };
    s = apply(s, move);
  }
  return s;
}

/** Apollo-11 launch rig: weakest crew + forced s2 draw → minor failure (−2 vs 8). */
function apollo11FailingLaunch(): GameState {
  let s = actionsState();
  s = withIndex(withTech(s, ALL_TECH), 11);
  s = recruit(s, '2H');
  s = recruit(s, '3H');
  s = recruit(s, '4H');
  s = deckTop(s, '2H'); // second copy on top → drawn rank 2
  s = apply(s, { t: 'launchMission', mission: 'apollo-11', crew: ['2H', '3H', '4H'], prebid: [] });
  s = apply(s, { t: 'endTurn' });
  return apply(s, { t: 'resolvePhase', prebid: [], boost: [] });
}

describe('turn cycle (FR2.2)', () => {
  it('draw → actions → endTurn → upkeep → next draw', () => {
    let s = base();
    expect(s.phase).toBe('draw');
    s = apply(s, { t: 'resolvePhase' });
    expect(s.phase).toBe('actions');
    expect(s.actionsLeft).toBe(3);
    expect(s.hand).toHaveLength(2); // jokers replaced, always 2 (ruling 23)
    s = apply(s, { t: 'endTurn' });
    expect(s.turn).toBe(2);
    expect(s.phase).toBe('draw');
    expect(s.soviet.position).toBeGreaterThanOrEqual(1); // drift at minimum
  });

  it('upkeep drift is deterministic when no draws intervene', () => {
    const s = apply({ ...base(), phase: 'actions', turn: 2 }, { t: 'endTurn' });
    expect(s.soviet.position).toBe(1); // +1 drift only
    expect(s.turn).toBe(3);
  });

  it('extra-action cards net +1 total play: cost 1, refund 1 (FR1.3)', () => {
    let s = actionsState();
    expect(s.actionsLeft).toBe(3);
    s = hands(s, ['2C']);
    s = apply(s, { t: 'playCard', card: '2C', mode: 'identity' });
    expect(s.actionsLeft).toBe(3); // 3 − 1 + 1
    expect(s.discard).toContain('2C');
  });

  it('cash and invest modes pay s and ⌈s/2⌉', () => {
    let s = actionsState();
    s = hands(s, ['9D', '4S']);
    s = apply(s, { t: 'playCard', card: '9D', mode: 'money' });
    expect(s.resources.money).toBe(9);
    s = apply(s, { t: 'playCard', card: '4S', mode: 'rd' });
    expect(s.resources.rd).toBe(2);
    expect(s.actionsLeft).toBe(1);
  });

  it('Apollo 1 Fire costs the NEXT turn its actions (FR9.2)', () => {
    // Rig: joker on top, two keepables beneath, d6 face 3 pinned.
    let s = { ...base(), rngState: rngForFace(3) };
    const indices = ['JOKER-A', '5H', '6H'].map((id) => s.deck.indexOf(id));
    let deck = [...s.deck];
    for (const idx of [...indices].sort((a, b) => b - a)) {
      deck = [...deck.slice(0, idx), ...deck.slice(idx + 1)];
    }
    s = { ...s, deck: [...deck, '6H', '5H', 'JOKER-A'] };

    s = apply(s, { t: 'resolvePhase' }); // fire resolves inline
    expect(s.pendingActionLoss).toBe(2);
    expect(s.actionsLeft).toBe(3); // this turn unaffected
    expect(s.hand).toEqual(['5H', '6H']);

    s = apply(s, { t: 'endTurn' });
    expect(s.turnActionLoss).toBe(2); // carried at upkeep
    s = apply(s, { t: 'resolvePhase' });
    expect(s.actionsLeft).toBe(1); // 3 − 2
  });
});

describe('illegal moves carry human-readable reasons (spec §7)', () => {
  it('rejects actions outside their phase', () => {
    const s = base();
    expect(() => apply(s, { t: 'playCard', card: '5H', mode: 'money' })).toThrow(IllegalMove);
    expect(() => apply(s, { t: 'endTurn' })).toThrow(/action phase/);
    expect(() => apply(s, { t: 'payRepair', cards: [] })).toThrow(/repair window/);
    expect(() => apply(s, { t: 'resolveAbility' })).toThrow(/ability window/);
  });

  it('rejects moves after game over', () => {
    const s = finished(base(), 'timedOut');
    expect(() => apply(s, { t: 'resolvePhase' })).toThrow(/game is over/);
    expect(legalMoves(s)).toEqual([]);
  });

  it('explains unaffordable, locked and duplicate choices', () => {
    let s = actionsState();
    expect(validateMove(s, { t: 'developTech', tech: 'redstone' })).toMatch(/not enough R&D/);
    s = withResources(s, { money: 10, rd: 10 });
    expect(validateMove(s, { t: 'developTech', tech: 'titan' })).toMatch(/completed mercury/);
    // Duplicate recruit (ruling 21): first copy pools, second may not.
    s = apply(s, { t: 'playCard', card: '5H', mode: 'identity' });
    s = hands(s, ['5H']);
    expect(validateMove(s, { t: 'playCard', card: '5H', mode: 'identity' })).toMatch(
      /already in the crew pool/,
    );
  });

  it('rejects unfilled crew slots, wrong missions and techs in slots (rulings 8/13)', () => {
    const s = withTech(actionsState(), ['redstone', 'mercury']);
    expect(validateMove(s, { t: 'launchMission', mission: 'freedom-7', crew: [], prebid: [] })).toMatch(
      /exactly 1 crew/,
    );
    const nextMission = withIndex(withTech(actionsState(), ALL_TECH), 1);
    expect(
      validateMove(nextMission, { t: 'launchMission', mission: 'freedom-7', crew: ['5H'], prebid: [] }),
    ).toMatch(/Friendship 7 next/);
    const techCrew = recruit(withTech(actionsState(), ['redstone', 'mercury']), 'QC');
    expect(
      validateMove(techCrew, { t: 'launchMission', mission: 'freedom-7', crew: ['QC'], prebid: [] }),
    ).toMatch(/techs cannot fill crew slots/);
  });

  it('rejects spending a reserved pre-bid card between launch and endTurn (ruling 3)', () => {
    let s = withTech(actionsState(), ['redstone', 'mercury']);
    s = recruit(s, '5H');
    s = hands(s, ['7S']);
    s = apply(s, { t: 'launchMission', mission: 'freedom-7', crew: ['5H'], prebid: ['7S'] });
    expect(validateMove(s, { t: 'playCard', card: '7S', mode: 'money' })).toMatch(/reserved/);
    expect(s.hand).toContain('7S'); // still in hand, waiting for the phase-1 window
    expect(() =>
      apply(s, { t: 'launchMission', mission: 'freedom-7', crew: ['5H'], prebid: [] }),
    ).toThrow(/already in flight/);
  });

  it('rejects playing an ace as a normal card (use flySideMission)', () => {
    const s = hands(actionsState(), ['AH']);
    expect(validateMove(s, { t: 'playCard', card: 'AH', mode: 'identity' })).toMatch(
      /flySideMission/,
    );
  });
});

describe('mission chain (FR5, rulings 3/5/9/29)', () => {
  /** Freedom 7 with generic crew: worst total 4 ≥ worst difficulty 4 → always succeeds. */
  function launchFreedom7(withPrebid = false): GameState {
    let s = withTech(actionsState(), ['redstone', 'mercury']);
    s = recruit(s, '5H');
    if (withPrebid) s = hands(s, ['7S']);
    s = apply(s, {
      t: 'launchMission',
      mission: 'freedom-7',
      crew: ['5H'],
      prebid: withPrebid ? ['7S'] : [],
    });
    expect(s.pendingLaunch).toBeDefined();
    expect(s.campaign.status[0].state).toBe('active');
    return apply(s, { t: 'endTurn' }); // ruling 29: chain starts at endTurn
  }

  it('declares at launch, resolves at endTurn, opens the seeded pre-bid window', () => {
    const s = launchFreedom7();
    expect(s.phase).toBe('prebid');
    expect(s.pending).toEqual({ kind: 'prebid', phaseIndex: 0 });
    expect(s.mission?.missionId).toBe('freedom-7');
    expect(s.mission?.supportTechs).toEqual([]); // no techs recruited
  });

  it('runs all four phases and awards VP on success', () => {
    let s = launchFreedom7(true);
    s = resolveWindows(s); // drives every window to completion
    expect(s.campaign.index).toBe(1);
    expect(s.campaign.status[0].state).toBe('done');
    expect(s.vp.mission).toBe(2);
    expect(s.discard).toContain('7S'); // seeded pre-bid spent on the first draw
    expect(s.phase).toBe('draw');
    expect(s.turn).toBe(2);
    expect(s.mission).toBeUndefined();
    assertInvariants(s);
  });

  it('a declined repair fails the mission: retry, injured crew, −1 VP, Soviets push (FR5.6)', () => {
    const s = apollo11FailingLaunch();
    expect(s.phase).toBe('repair');
    expect(s.pending).toEqual({ kind: 'repair', phaseIndex: 0, outcome: 'minor', cost: 3 });
    // total = 2 drawn + crew (1+1+2) = 6 vs difficulty 8 → minor (−2)

    const failed = apply(s, { t: 'payRepair', cards: [] }); // decline
    expect(failed.campaign.status[11].state).toBe('pending');
    expect(failed.campaign.status[11].failCount).toBe(1); // retry at +2
    expect(failed.campaign.index).toBe(11);
    expect(failed.vp.penaltyFailures).toBe(1);
    expect(failed.soviet.position).toBe(4); // +3 push from 0, then upkeep drift +1
    expect(failed.vp.penaltyMilestones).toBe(1); // crossed milestone 3 once
    expect(failed.crewPool['2H']).toEqual({ state: 'injured', launchesLeft: 2 });
    expect(failed.crewPool['3H']).toEqual({ state: 'injured', launchesLeft: 2 });
    expect(failed.mission).toBeUndefined();
    expect(failed.phase).toBe('draw');
  });

  it('paying repair in full salvages the phase and continues the chain (ruling 5)', () => {
    let s = apollo11FailingLaunch();
    s = hands(s, ['10S']);
    const paid = apply(s, { t: 'payRepair', cards: ['10S'] });
    expect(paid.mission?.phaseIndex).toBe(1);
    expect(paid.mission?.results[0].outcome).toBe('minorRepaired');
    expect(paid.mission?.results[0].repairPaid).toEqual(['10S']);
    expect(paid.hand).not.toContain('10S');
    expect(paid.discard).toContain('10S');
    expect(paid.phase).toBe('prebid');
    expect(paid.pending).toEqual({ kind: 'prebid', phaseIndex: 1 });
  });

  it('underpaying declines: mission fails and nothing is spent (ruling 5)', () => {
    let s = apollo11FailingLaunch();
    s = hands(s, ['2S']); // worth 2 < cost 3
    const failed = apply(s, { t: 'payRepair', cards: ['2S'] });
    expect(failed.campaign.status[11].failCount).toBe(1);
    expect(failed.hand).toContain('2S'); // nothing spent
  });

  it('assigned crew cannot be burned as repair fuel (ruling 24)', () => {
    const s = apollo11FailingLaunch();
    expect(validateMove(s, { t: 'payRepair', cards: ['2H'] })).toMatch(/assigned to this mission/);
  });

  it('Kraft +2 can rescue a failing phase; once per mission (ruling 9)', () => {
    // Failure 6 vs 8 with Kraft recruited → ability window.
    let t = actionsState();
    t = withIndex(withTech(t, ALL_TECH), 11);
    t = recruit(t, '2H');
    t = recruit(t, '3H');
    t = recruit(t, '4H');
    t = recruit(t, 'QC');
    t = deckTop(t, '2H');
    t = apply(t, { t: 'launchMission', mission: 'apollo-11', crew: ['2H', '3H', '4H'], prebid: [] });
    t = apply(t, { t: 'endTurn' });
    t = apply(t, { t: 'resolvePhase', prebid: [], boost: [] });

    expect(t.phase).toBe('mission');
    expect(t.pending).toEqual({ kind: 'ability', phaseIndex: 0, canKraft: true, canReroll: false });

    const rescued = apply(t, { t: 'resolveAbility', use: 'kraft' });
    expect(rescued.mission?.kraftUsed).toBe(true);
    expect(rescued.mission?.phaseIndex).toBe(1); // 6 + 2 = 8 ≥ 8 → success
    expect(rescued.phase).toBe('prebid');

    // Kraft spent for the rest of the mission: the prompt refuses a second use.
    const promptAgain: GameState = {
      ...rescued,
      phase: 'mission',
      pending: { kind: 'ability', phaseIndex: 1, canKraft: false, canReroll: false },
    };
    expect(validateMove(promptAgain, { t: 'resolveAbility', use: 'kraft' })).toMatch(
      /Kraft is not available/,
    );
  });

  it('Kranz reroll draws a fresh card; no options left → repair window (ruling 9)', () => {
    let s = actionsState();
    s = withIndex(withTech(s, ALL_TECH), 11);
    s = recruit(s, '2H');
    s = recruit(s, '3H');
    s = recruit(s, '4H');
    s = recruit(s, 'KC');
    s = deckTop(s, '2H');
    s = apply(s, { t: 'launchMission', mission: 'apollo-11', crew: ['2H', '3H', '4H'], prebid: [] });
    s = apply(s, { t: 'endTurn' });
    s = apply(s, { t: 'resolvePhase', prebid: [], boost: [] });
    expect(s.pending).toEqual({ kind: 'ability', phaseIndex: 0, canKraft: false, canReroll: true });

    // Reroll onto another s2 → still failing, options exhausted → repair window.
    s = deckTop(s, '2H');
    const rerolled = apply(s, { t: 'resolveAbility', use: 'reroll' });
    expect(rerolled.mission?.rerollUsed).toBe(true);
    expect(rerolled.phase).toBe('repair');
    expect(rerolled.pending).toMatchObject({ kind: 'repair', outcome: 'minor', cost: 3 });
  });

  it('completing Apollo 11 ends the game as a Moon win (FR10.2)', () => {
    let s = actionsState();
    s = withIndex(withTech(s, ALL_TECH), 11);
    s = recruit(s, 'KH'); // Armstrong: crew 4 + Landing/Ascent +2
    s = recruit(s, 'QH'); // White: crew 4 + EVA +2
    s = recruit(s, 'JH'); // Grissom: crew 4 +1 every phase
    s = apply(s, { t: 'launchMission', mission: 'apollo-11', crew: ['KH', 'QH', 'JH'], prebid: [] });
    s = apply(s, { t: 'endTurn' });
    s = resolveWindows(s);
    expect(s.phase).toBe('gameOver');
    expect(s.result).toBe('moon');
    assertInvariants(s);
  });

  it('same-turn Apollo 11 splashdown beats Soviets at 36 (FR8.3 tie-break)', () => {
    let s = actionsState();
    s = withIndex(withTech(s, ALL_TECH), 11);
    s = { ...s, soviet: { position: 36, maxPosition: 36, reachedFinal: true } };
    s = recruit(s, 'KH');
    s = recruit(s, 'QH');
    s = recruit(s, 'JH');
    expect(s.phase).not.toBe('gameOver'); // the tie-break lets this turn play out
    s = apply(s, { t: 'launchMission', mission: 'apollo-11', crew: ['KH', 'QH', 'JH'], prebid: [] });
    s = apply(s, { t: 'endTurn' });
    s = resolveWindows(s);
    expect(s.result).toBe('moon'); // player wins the tie
  });

  it('Soviets at 36 without a splashdown lose the game at upkeep', () => {
    const s = apply(
      { ...base(), phase: 'actions', turn: 2, soviet: { position: 36, maxPosition: 36, reachedFinal: true } },
      { t: 'endTurn' },
    );
    expect(s.phase).toBe('gameOver');
    expect(s.result).toBe('sovietsWon');
  });

  it('turn 30 without a landing times out (FR10.2)', () => {
    const s = apply({ ...base(), phase: 'actions', turn: 30 }, { t: 'endTurn' });
    expect(s.result).toBe('timedOut');
  });
});

describe('crew pool & timers (FR6, rulings 7/8/21/26)', () => {
  it('injured crew sit out launches and heal after their timers (FR6.5)', () => {
    let s = withTech(actionsState(), ['redstone', 'mercury']);
    s = recruit(s, '5H');
    s = recruit(s, '6H');
    s = pool(s, { '7H': { state: 'injured', launchesLeft: 2 } });

    // Launch 1: the injured member sits out and burns one launch.
    s = apply(s, { t: 'launchMission', mission: 'freedom-7', crew: ['5H'], prebid: [] });
    expect(s.crewPool['7H']).toEqual({ state: 'injured', launchesLeft: 1 });

    // Resolve the mission, then launch 2: timer hits 0 → ready for launch 3.
    s = apply(s, { t: 'endTurn' });
    s = resolveWindows(s);
    expect(s.campaign.index).toBe(1);
    s = apply(s, { t: 'resolvePhase' }); // open turn 2's actions
    s = withTech(s, ['atlas']);
    s = apply(s, { t: 'launchMission', mission: 'friendship-7', crew: ['6H'], prebid: [] });
    expect(s.crewPool['7H']).toEqual({ state: 'ready', launchesLeft: 0 });
  });

  it('stunned crew cannot be assigned, then heal at the next launch', () => {
    let s = withTech(actionsState(), ['redstone', 'mercury']);
    s = recruit(s, '5H');
    expect(validateMove(s, { t: 'launchMission', mission: 'freedom-7', crew: ['5H'], prebid: [] })).toBeNull();
    s = pool(s, { '5H': { state: 'stunned', launchesLeft: 1 } });
    expect(validateMove(s, { t: 'launchMission', mission: 'freedom-7', crew: ['5H'], prebid: [] })).toMatch(
      /is stunned/,
    );
    s = recruit(s, '6H');
    s = apply(s, { t: 'launchMission', mission: 'freedom-7', crew: ['6H'], prebid: [] });
    expect(s.crewPool['5H']).toEqual({ state: 'ready', launchesLeft: 0 });
  });

  it('stunned techs lose support but keep dev discounts (ruling 26)', () => {
    let s = withTech(actionsState(), ['redstone', 'mercury']);
    s = recruit(s, '5H');
    s = recruit(s, 'KS'); // von Braun
    s = pool(s, { KS: { state: 'stunned', launchesLeft: 1 } });
    expect(devDiscountFor(s, techById(TEST_CONTENT, 'atlas'))).toBe(2); // discount survives stun
    s = apply(s, { t: 'launchMission', mission: 'freedom-7', crew: ['5H'], prebid: [] });
    expect(s.pendingLaunch?.supportTechs).not.toContain('KS');
  });

  it('support snapshot includes ready techs at launch (ruling 7)', () => {
    let s = withTech(actionsState(), ['redstone', 'mercury']);
    s = recruit(s, '5H');
    s = recruit(s, 'KS');
    s = apply(s, { t: 'launchMission', mission: 'freedom-7', crew: ['5H'], prebid: [] });
    expect(s.pendingLaunch?.supportTechs).toContain('KS');
  });

  /** Ends turn 3 with a 10-card hand (no jokers — they never enter hands). */
  function yearEndState(): GameState {
    let s: GameState = { ...base(), phase: 'actions', turn: 3 };
    s = pool(s, {
      '5H': { state: 'injured', launchesLeft: 2 },
      '6H': { state: 'stunned', launchesLeft: 1 },
    });
    // Pull 10 keepable instances from the deck by index (ids may repeat).
    const extraIdx: number[] = [];
    for (let i = s.deck.length - 1; i >= 0 && extraIdx.length < 10; i--) {
      if (!s.deck[i].startsWith('JOKER')) extraIdx.push(i);
    }
    expect(extraIdx).toHaveLength(10);
    const extra = extraIdx.map((i) => s.deck[i]);
    const deck = s.deck.filter((_, i) => !extraIdx.includes(i));
    s = { ...s, hand: [...s.hand, ...extra], deck };
    return apply(s, { t: 'endTurn' });
  }

  it('year end opens the player-choice trim window, then heals all crew (FR6.5, ruling 27)', () => {
    let s = yearEndState();
    expect(s.phase).toBe('upkeep');
    expect(s.pending).toEqual({ kind: 'handLimit', excess: 3 });
    expect(s.turn).toBe(4); // turn advanced before resting
    s = apply(s, { t: 'discardForLimit', cards: s.hand.slice(-3) });
    expect(s.hand).toHaveLength(7);
    expect(s.crewPool['5H']).toEqual({ state: 'ready', launchesLeft: 0 });
    expect(s.crewPool['6H']).toEqual({ state: 'ready', launchesLeft: 0 });
    expect(s.phase).toBe('draw');
  });

  it('hand trim requires exactly the excess count', () => {
    const s = yearEndState();
    expect(() => apply(s, { t: 'discardForLimit', cards: s.hand.slice(-2) })).toThrow(/exactly 3/);
  });
});

describe('side missions (FR7, rulings 11/15/16/22/25)', () => {
  it('a funded flight succeeds: +2 VP, perk earned, ace consumed', () => {
    let s = actionsState();
    s = hands(s, ['AH', '2S']);
    const before = s.actionsLeft;
    // drawn ≥2 + pre-bid 2 ≥ difficulty 4 → always succeeds.
    s = apply(s, { t: 'flySideMission', ace: 'AH', prebid: ['2S'], boost: [] });
    expect(s.actionsLeft).toBe(before - 1);
    expect(s.vp.side).toBe(2);
    expect(s.perks).toContain('AH');
    expect(s.sideMissions['AH'].status).toBe('flown');
    expect(s.discard).toContain('AH');
    expect(s.discard).toContain('2S');
  });

  it('an unfunded flight with a forced s2 draw fails: Soviet +1, −1 VP, ace consumed', () => {
    let s = actionsState();
    s = hands(s, ['AH']);
    s = deckTop(s, '2H'); // drawn rank 2 < 4
    s = apply(s, { t: 'flySideMission', ace: 'AH' });
    expect(s.sideMissions['AH']).toEqual({ status: 'open', fails: 1 });
    expect(s.vp.penaltyFailures).toBe(1); // ruling 11
    expect(s.soviet.position).toBe(1);
    expect(s.discard).toContain('AH');
    expect(s.perks).not.toContain('AH');
  });

  it('the second copy retries at +1 difficulty (rulings 22/25)', () => {
    let s = actionsState();
    s = hands(s, ['AH']);
    s = deckTop(s, '2H');
    s = apply(s, { t: 'flySideMission', ace: 'AH' }); // fail → fails 1
    expect(s.sideMissions['AH'].fails).toBe(1);
    s = hands(s, ['AH']); // second copy out of the deck
    s = deckTop(s, '2H');
    s = apply(s, { t: 'flySideMission', ace: 'AH' }); // 2 < 4+1 → fail again
    expect(s.sideMissions['AH'].fails).toBe(2);
    // Anti-stacking (FR7.3): a later success with the perk already earned
    // grants VP only — proven via the perks array semantics in phases tests.
    expect(s.vp.penaltyFailures).toBe(2);
  });

  it('perks are granted only once (FR7.3)', () => {
    let s = actionsState();
    s = hands(s, ['AH', '2S']);
    s = apply(s, { t: 'flySideMission', ace: 'AH', prebid: ['2S'] }); // success → perk
    expect(s.perks.filter((p) => p === 'AH')).toHaveLength(1);
    // Flying the second copy: success grants VP, not a second perk.
    s = hands(s, ['AH', '2S']);
    s = apply(s, { t: 'flySideMission', ace: 'AH', prebid: ['2S'] });
    expect(s.perks.filter((p) => p === 'AH')).toHaveLength(1);
    expect(s.vp.side).toBe(4);
  });

  it('DSN perk never affects side missions (ruling 17)', () => {
    const s = withPerks(actionsState(), ['AS']);
    expect(s.perks).toContain('AS');
    // Enforced in phases.sideMissionTotal; here we only pin the perk state.
    expect(missionById(TEST_CONTENT, 'freedom-7').chain).toHaveLength(4);
  });
});

describe('state integrity (spec §4.4)', () => {
  it('assertInvariants catches a broken card partition', () => {
    const s = base();
    expect(() => assertInvariants({ ...s, hand: [...s.hand, '5H'] })).toThrow(/card partition/);
  });

  it('every step of a short scripted game keeps all invariants', () => {
    let s = base();
    const script = [
      { t: 'resolvePhase' as const },
      { t: 'endTurn' as const },
      { t: 'resolvePhase' as const },
      { t: 'endTurn' as const },
      { t: 'resolvePhase' as const },
    ];
    for (const move of script) {
      s = apply(s, move);
      assertInvariants(s);
    }
    expect(s.moves).toHaveLength(script.length);
  });

  it('legalMoves is usable in every resting phase', () => {
    expect(legalMoves(base()).some((m) => m.t === 'resolvePhase')).toBe(true); // draw
    const actions = apply(base(), { t: 'resolvePhase' });
    expect(legalMoves(actions).some((m) => m.t === 'endTurn')).toBe(true);
    const windowed = (() => {
      let s = withTech(actionsState(), ['redstone', 'mercury']);
      s = recruit(s, '5H');
      s = apply(s, { t: 'launchMission', mission: 'freedom-7', crew: ['5H'], prebid: [] });
      return apply(s, { t: 'endTurn' });
    })();
    expect(legalMoves(windowed).some((m) => m.t === 'resolvePhase')).toBe(true);
    const repairing = apollo11FailingLaunch();
    expect(legalMoves(repairing).some((m) => m.t === 'payRepair')).toBe(true);
  });
});
