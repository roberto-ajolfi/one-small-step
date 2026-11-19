/**
 * Mission chain — resolution of the launched campaign mission (FR5, rulings 3/5/9).
 *
 * Entered at endTurn (ruling 29) and stepped by window moves: pre-bid window →
 * fate draw (jokers inline) → Kraft/Kranz prompt on failure (ruling 9) → repair
 * window (full pay or decline, ruling 5) → next phase or mission outcome.
 * Success awards VP and may end the game ('moon'); failure pushes the Soviets,
 * injures the assigned crew and re-opens the mission for retry (FR5.6).
 */

import { missionById, finalMissionOfProgram } from './content';
import {
  kraftAmount,
  canKraft,
  canReroll,
  missionPhaseTotal,
  phaseDifficulty,
  outcomeFor,
  repairCostFor,
} from './phases';
import { repairPaymentValue } from './economy';
import { resolveJokerDraw } from './events';
import { advanceSoviet } from './soviet';
import { runUpkeep, gameOver } from './upkeep';
import type { GameState, Mutable, PhaseResult, PendingLaunch } from './state';
import {
  appendLog,
  cardOf,
  drawCardFromDeck,
  spendFromHandOrPlay,
  spendFromPlay,
} from './state';

/**
 * Declares the mission phase: converts the launch declaration into an active
 * mission and opens phase 1's pre-bid window (seeded with the launch pre-bid,
 * ruling 3). Support techs are snapshotted from the launch-time pool.
 */
export function startMission(draft: Mutable<GameState>, launch: PendingLaunch): void {
  draft.mission = {
    missionId: launch.missionId,
    crew: [...launch.crew],
    supportTechs: [...launch.supportTechs],
    reservedPrebid: [...launch.reservedPrebid],
    phaseIndex: 0,
    results: [],
    kraftUsed: false,
    rerollUsed: false,
  };
  draft.pendingLaunch = undefined;
  draft.phase = 'prebid';
  draft.pending = { kind: 'prebid', phaseIndex: 0 };
  const mission = missionById(draft.content, launch.missionId);
  appendLog(draft, 'mission', `Launching ${mission.name}`);
}

/** Draws one fate card, resolving jokers inline (FR3.2, rulings 2/28), discarding it (FR3.1). */
function drawFateCard(draft: Mutable<GameState>): string {
  let id = drawCardFromDeck(draft);
  while (cardOf(draft, id).kind === 'event') {
    resolveJokerDraw(draft, id);
    id = drawCardFromDeck(draft);
  }
  draft.discard = [...draft.discard, id];
  return id;
}

/** Current check total for the in-flight phase, including Kraft if applied. */
function currentTotal(draft: GameState): number {
  const mission = draft.mission;
  if (!mission || mission.currentBase === undefined) throw new Error('no phase in flight');
  return mission.kraftUsed ? mission.currentBase + kraftAmount(draft, mission) : mission.currentBase;
}

function currentDifficulty(draft: GameState): number {
  const mission = draft.mission;
  if (!mission) throw new Error('no phase in flight');
  const def = missionById(draft.content, mission.missionId);
  return phaseDifficulty(draft, def, def.chain[mission.phaseIndex]);
}

function currentOutcome(draft: GameState): 'success' | 'minor' | 'major' {
  return outcomeFor(
    currentTotal(draft) - currentDifficulty(draft),
    draft.content.tuning.majorFailureMinShortfall,
  );
}

/** Opens the repair window for a failing outcome (FR5.5). */
function openRepair(draft: Mutable<GameState>, outcome: 'minor' | 'major'): void {
  draft.phase = 'repair';
  draft.pending = {
    kind: 'repair',
    phaseIndex: draft.mission?.phaseIndex ?? 0,
    outcome,
    cost: repairCostFor(outcome, draft as GameState),
  };
}

/** Opens the Kraft/Kranz prompt when at least one once-per-mission option remains (ruling 9). */
function openAbility(draft: Mutable<GameState>): void {
  const state = draft as GameState;
  const mission = state.mission;
  if (!mission) throw new Error('no mission in flight');
  draft.phase = 'mission';
  draft.pending = {
    kind: 'ability',
    phaseIndex: mission.phaseIndex,
    canKraft: canKraft(state, mission),
    canReroll: canReroll(state, mission),
  };
}

/** Records one finished phase into the mission's outcome history. */
function recordResult(draft: Mutable<GameState>, result: PhaseResult): void {
  const mission = draft.mission;
  if (!mission) throw new Error('no mission in flight');
  draft.mission = { ...mission, results: [...mission.results, result] };
}

/** Builds a PhaseResult from the mission's current in-flight numbers. */
function resultOf(
  draft: GameState,
  outcome: PhaseResult['outcome'],
  repairPaid: string[] = [],
): PhaseResult {
  const mission = draft.mission;
  if (!mission || mission.drawnCard === undefined) throw new Error('no phase in flight');
  const def = missionById(draft.content, mission.missionId);
  const difficulty = phaseDifficulty(draft, def, def.chain[mission.phaseIndex]);
  const total = currentTotal(draft);
  return {
    phase: def.chain[mission.phaseIndex],
    drawnCard: mission.drawnCard,
    total,
    difficulty,
    margin: total - difficulty,
    outcome,
    repairPaid,
  };
}

/** Advances to the next phase, or completes the mission when the chain ends. */
function advancePhase(draft: Mutable<GameState>): void {
  const mission = draft.mission;
  if (!mission) throw new Error('no mission in flight');
  const def = missionById(draft.content, mission.missionId);
  const next = mission.phaseIndex + 1;
  draft.mission = { ...mission, phaseIndex: next, drawnCard: undefined, currentBase: undefined };
  if (next < def.chain.length) {
    draft.phase = 'prebid';
    draft.pending = { kind: 'prebid', phaseIndex: next };
  } else {
    missionSuccess(draft);
  }
}

/** All phases passed: award VP, maybe end the game, else upkeep (FR5.4/FR10). */
function missionSuccess(draft: Mutable<GameState>): void {
  const mission = draft.mission;
  if (!mission) throw new Error('no mission in flight');
  const def = missionById(draft.content, mission.missionId);
  const idx = draft.campaign.index;
  const status = [...draft.campaign.status];
  status[idx] = { ...status[idx], state: 'done' };
  draft.campaign = { index: idx + 1, status };
  draft.vp = { ...draft.vp, mission: draft.vp.mission + def.vp };

  if (finalMissionOfProgram(draft.content, def.program)?.id === def.id) {
    const bonus = draft.content.tuning.programBonuses[def.program];
    draft.vp = { ...draft.vp, program: draft.vp.program + bonus };
    appendLog(draft, 'mission', `${def.program} program complete: +${bonus} VP`);
  }

  draft.mission = undefined;
  draft.pending = undefined;
  appendLog(draft, 'mission', `${def.name} succeeds: +${def.vp} VP`);

  if (draft.campaign.index >= draft.content.missions.length) {
    gameOver(draft, 'moon');
    return;
  }
  runUpkeep(draft);
}

/** Mission failed: retry penalty, crew injured, −1 VP, Soviets +3 (FR5.6, ruling 11). */
function missionFailure(draft: Mutable<GameState>): void {
  const mission = draft.mission;
  if (!mission) throw new Error('no mission in flight');
  const def = missionById(draft.content, mission.missionId);
  const idx = draft.campaign.index;
  const status = [...draft.campaign.status];
  status[idx] = { ...status[idx], state: 'pending', failCount: status[idx].failCount + 1 };
  draft.campaign = { index: idx, status };
  draft.vp = { ...draft.vp, penaltyFailures: draft.vp.penaltyFailures + 1 };

  const pool = { ...draft.crewPool };
  for (const crewId of mission.crew) {
    pool[crewId] = { state: 'injured', launchesLeft: draft.content.tuning.crewInjuryLaunches };
  }
  draft.crewPool = pool;

  draft.mission = undefined;
  draft.pending = undefined;
  advanceSoviet(draft, draft.content.tuning.sovietPushFailure, 'mission failure');
  appendLog(draft, 'mission', `${def.name} fails — crew injured, retry at +2`);
  runUpkeep(draft);
}

/**
 * Pre-bid window: spends the seeded + selected equipment and held boosts,
 * draws the phase card, and routes to the next window (FR5.4, rulings 3/15).
 */
export function resolvePrebidDraw(
  draft: Mutable<GameState>,
  prebid: readonly string[],
  boost: readonly string[],
): void {
  const mission = draft.mission;
  if (!mission) throw new Error('no mission in flight');
  const def = missionById(draft.content, mission.missionId);
  const phase = def.chain[mission.phaseIndex];
  const allPrebid = [...mission.reservedPrebid, ...prebid];

  // Spend exactly one instance per selection: boosts are held (in play) only;
  // pre-bids come from hand or in play (rulings 4/6/15). Value-filters are
  // unsafe — two deck copies may share a row id in the same zone.
  const missingBoost = spendFromPlay(draft, boost);
  if (missingBoost.length > 0) throw new Error(`held bonus unavailable: ${missingBoost.join(', ')}`);
  const missingPrebid = spendFromHandOrPlay(draft, allPrebid);
  if (missingPrebid.length > 0) throw new Error(`pre-bid unavailable: ${missingPrebid.join(', ')}`);
  draft.discard = [...draft.discard, ...allPrebid, ...boost];

  const drawn = drawFateCard(draft);
  const base = missionPhaseTotal(
    draft as GameState,
    { ...mission, reservedPrebid: [] },
    phase,
    drawn,
    allPrebid,
    boost,
    false,
  );
  draft.mission = {
    ...mission,
    reservedPrebid: [],
    drawnCard: drawn,
    currentBase: base,
  };

  const difficulty = phaseDifficulty(draft as GameState, def, phase);
  const outcome = outcomeFor(base - difficulty, draft.content.tuning.majorFailureMinShortfall);
  appendLog(
    draft,
    'mission',
    `${phase}: draw ${drawn} → total ${base} vs ${difficulty} (${outcome})`,
  );

  finalizeOutcome(draft, outcome);
}

/** Routes a drawn outcome: success advances, failure opens prompt or repair. */
function finalizeOutcome(draft: Mutable<GameState>, outcome: 'success' | 'minor' | 'major'): void {
  if (outcome === 'success') {
    recordResult(draft, resultOf(draft as GameState, 'success'));
    advancePhase(draft);
    return;
  }
  const state = draft as GameState;
  const mission = state.mission;
  if (mission && (canKraft(state, mission) || canReroll(state, mission))) {
    openAbility(draft);
    return;
  }
  openRepair(draft, outcome);
}

/**
 * Ability window (ruling 9): apply Kraft (+2), reroll for a fresh draw, or
 * finalize the failure into the repair window. Each option is once per mission.
 */
export function resolveAbilityChoice(draft: Mutable<GameState>, use: 'kraft' | 'reroll' | undefined): void {
  const mission = draft.mission;
  if (!mission) throw new Error('no mission in flight');
  const def = missionById(draft.content, mission.missionId);
  const phase = def.chain[mission.phaseIndex];

  if (use === undefined) {
    const outcome = currentOutcome(draft as GameState);
    if (outcome === 'success') {
      recordResult(draft, resultOf(draft as GameState, 'success'));
      advancePhase(draft);
      return;
    }
    openRepair(draft, outcome);
    return;
  }

  if (use === 'kraft') {
    draft.mission = { ...mission, kraftUsed: true };
    appendLog(draft, 'mission', `Kraft: +2 on ${phase}`);
  } else {
    const oldDrawn = cardOf(draft, mission.drawnCard ?? '').s;
    const drawn = drawFateCard(draft);
    const base = (mission.currentBase ?? 0) - oldDrawn + cardOf(draft, drawn).s;
    draft.mission = { ...mission, rerollUsed: true, drawnCard: drawn, currentBase: base };
    appendLog(draft, 'mission', `Kranz rerolls: new draw ${drawn}`);
  }

  const outcome = currentOutcome(draft as GameState);
  appendLog(
    draft,
    'mission',
    `${phase}: total ${currentTotal(draft as GameState)} vs ${currentDifficulty(draft as GameState)} (${outcome})`,
  );

  if (outcome === 'success') {
    recordResult(draft, resultOf(draft as GameState, 'success'));
    advancePhase(draft);
    return;
  }
  const state = draft as GameState;
  const m = state.mission;
  if (m && (canKraft(state, m) || canReroll(state, m))) {
    openAbility(draft); // another once-per-mission option still usable
    return;
  }
  openRepair(draft, outcome);
}

/**
 * Repair window (FR5.5, ruling 5): a payment covering the cost salvages the
 * phase (cards spent, chain continues); declining or underpaying fails the
 * mission with nothing spent.
 */
export function resolveRepair(draft: Mutable<GameState>, cards: readonly string[]): void {
  const pending = draft.pending;
  const mission = draft.mission;
  if (pending?.kind !== 'repair' || !mission) throw new Error('no repair window open');

  const rows = cards.map((id) => cardOf(draft, id));
  const value = repairPaymentValue(draft as GameState, rows);

  if (value < pending.cost) {
    appendLog(draft, 'mission', `Repair declined (${value}/${pending.cost}) — mission fails`);
    missionFailure(draft);
    return;
  }

  // Spend fuel by kind: held bonuses from in play; persons/equipment from
  // hand (preferred) or in play; persons found nowhere else leave the pool
  // permanently (FR6.4, ruling 14). Exactly one instance per selected id.
  const pool = { ...draft.crewPool };
  for (const row of rows) {
    if (row.kind === 'bonus') {
      const missing = spendFromPlay(draft, [row.id]);
      if (missing.length > 0) throw new Error(`held bonus unavailable: ${row.id}`);
      continue;
    }
    const missing = spendFromHandOrPlay(draft, [row.id]);
    if (missing.length > 0) {
      if (row.kind === 'person' && row.id in pool && !mission.crew.includes(row.id)) {
        delete pool[row.id];
      } else {
        throw new Error(`repair fuel unavailable: ${row.id}`);
      }
    }
  }
  draft.crewPool = pool;
  draft.discard = [...draft.discard, ...cards];

  const outcome = pending.outcome === 'minor' ? 'minorRepaired' : 'majorRepaired';
  recordResult(draft, resultOf(draft as GameState, outcome, [...cards]));
  appendLog(draft, 'mission', `Repairs paid (${value}/${pending.cost}) — phase salvaged`);
  advancePhase(draft);
}
