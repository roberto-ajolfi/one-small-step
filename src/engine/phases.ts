/**
 * Phases — mission/phase resolution math (spec §4.3, FR5.3–FR5.6).
 *
 * Owns: the difficulty formula (program base + phase offset + program-final +1,
 * flat retry +2, UTP −1 on first attempts), the total for one phase check
 * (drawn rank + crew + tech support + perks + pre-bid + held boosts + Kraft),
 * and the outcome bands (success / minor shortfall 1–3 / major shortfall ≥4,
 * ruling 1). Windows and state transitions live in the reducer.
 */

import type { Mission, PhaseName, Program } from './content';
import { firstMissionOfProgram, finalMissionOfProgram, cardById } from './content';
import { applyAbility, abilitiesOf, earnedPerkAbilities } from './abilities';
import { bonusValue, crewValue } from './economy';
import type { ActiveMission, GameState } from './state';

/**
 * Difficulty of one phase of one mission attempt (FR5.3 + rulings 10/18).
 *
 * @param state - current state (provides content, tuning, campaign status, perks).
 * @param mission - the mission being attempted.
 * @param phase - the phase inside the mission's chain.
 * @returns the difficulty target the check total must meet or beat.
 */
export function phaseDifficulty(state: GameState, mission: Mission, phase: PhaseName): number {
  const t = state.content.tuning;
  let difficulty = t.programDifficulty[mission.program] + (t.phaseOffsets[phase] ?? 0);

  if (finalMissionOfProgram(state.content, mission.program)?.id === mission.id) {
    difficulty += t.finalMissionBonus;
  }

  const status = state.campaign.status[state.content.missions.findIndex((m) => m.id === mission.id)];
  if (status && status.failCount > 0) difficulty += t.retryPenalty;

  // UTP perk: −1 on the program's first mission, first attempt only (ruling 18).
  const firstAttemptOfProgram =
    firstMissionOfProgram(state.content, mission.program)?.id === mission.id &&
    (status?.failCount ?? 0) === 0;
  for (const ability of earnedPerkAbilities(state.perks, state.content.cards)) {
    const effect = applyAbility(ability, { kind: 'difficulty', mission, firstAttemptOfProgram });
    if (effect && effect.kind === 'add') difficulty += effect.amount;
  }

  return difficulty;
}

/** Classifies a margin against the difficulty target (ruling 1: major at shortfall ≥ 4). */
export function outcomeFor(margin: number, majorFailureMinShortfall: number): 'success' | 'minor' | 'major' {
  if (margin >= 0) return 'success';
  return -margin >= majorFailureMinShortfall ? 'major' : 'minor';
}

/** Repair cost of a failed outcome (FR5.5). */
export function repairCostFor(outcome: 'minor' | 'major', state: GameState): number {
  return outcome === 'major'
    ? state.content.tuning.repairCostMajor
    : state.content.tuning.repairCostMinor;
}

/**
 * Techs that provide mission support: every tech in the pool at launch time.
 * Called once when the mission is declared — support is snapshotted so a stun
 * mid-mission cannot alter an in-flight launch (FR6.5 timing).
 */
export function supportTechsAtLaunch(state: GameState): string[] {
  return Object.entries(state.crewPool)
    .filter(([, status]) => status.state === 'ready')
    .map(([cardId]) => cardId)
    .filter((cardId) => cardById(state.content, cardId).named?.role === 'tech');
}

/**
 * Total for one campaign phase check (FR5.4):
 * drawn rank + assigned crew (⌈s/3⌉ + New Nine) + astronaut phase abilities +
 * tech support phase abilities + DSN + pre-bid equipment + held boosts + Kraft.
 *
 * @param state - current state.
 * @param mission - in-flight mission (crew + support snapshot + Kraft usage).
 * @param phase - the phase being resolved.
 * @param drawnCardId - the fate card drawn for this phase.
 * @param prebid - equipment committed to this phase (from hand or in play).
 * @param boost - held Bonus cards committed to this phase (in play only).
 * @param kraftUsed - whether Kraft's +2 was applied to this phase (ruling 9).
 * @returns the total to compare against `phaseDifficulty`.
 */
export function missionPhaseTotal(
  state: GameState,
  mission: ActiveMission,
  phase: PhaseName,
  drawnCardId: string,
  prebid: readonly string[],
  boost: readonly string[],
  kraftUsed: boolean,
): number {
  const perks = earnedPerkAbilities(state.perks, state.content.cards);
  const draw = { kind: 'phase', phase, side: 'campaign' } as const;

  let total = cardById(state.content, drawnCardId).s;

  // Assigned crew: base bonus + New Nine increment, then named phase abilities.
  for (const crewId of mission.crew) {
    const card = cardById(state.content, crewId);
    let bonus = crewValue(card.s);
    for (const perk of perks) {
      const effect = applyAbility(perk, draw);
      if (effect?.kind === 'crewBonusAdd') bonus += effect.amount;
    }
    total += bonus;
    for (const ability of abilitiesOf(card)) {
      const effect = applyAbility(ability, draw);
      if (effect?.kind === 'add') total += effect.amount;
    }
  }

  // Tech support snapshot: phase boosts only (no crew bonus — ruling 8).
  for (const techId of mission.supportTechs) {
    const card = cardById(state.content, techId);
    for (const ability of abilitiesOf(card)) {
      const effect = applyAbility(ability, draw);
      if (effect?.kind === 'add') total += effect.amount;
    }
  }

  // Flat phase-draw perks (DSN, ruling 17).
  for (const perk of perks) {
    const effect = applyAbility(perk, draw);
    if (effect?.kind === 'add') total += effect.amount;
  }

  // Pre-bid equipment (+s) and held Bonus boosts (+⌈s/2⌉), both pre-draw (rulings 4/15).
  for (const id of prebid) {
    const card = cardById(state.content, id);
    if (card.kind !== 'equipment') throw new Error(`pre-bid must be equipment: ${id}`);
    total += card.s;
  }
  for (const id of boost) {
    const card = cardById(state.content, id);
    if (card.kind !== 'bonus') throw new Error(`boost must be a held bonus: ${id}`);
    total += bonusValue(card.s);
  }

  if (kraftUsed) total += kraftAmount(state, mission);

  return total;
}

/** Kraft's +2 amount, read from the supporting tech's ability data. */
export function kraftAmount(state: GameState, mission: ActiveMission): number {
  for (const techId of mission.supportTechs) {
    for (const ability of abilitiesOf(cardById(state.content, techId))) {
      if (ability.kind === 'kraft') return ability.amount;
    }
  }
  return 0;
}

/** Whether Kraft is offered on the current failing phase (ruling 9). */
export function canKraft(state: GameState, mission: ActiveMission): boolean {
  if (mission.kraftUsed) return false;
  return mission.supportTechs.some((techId) =>
    abilitiesOf(cardById(state.content, techId)).some((a) => a.kind === 'kraft'),
  );
}

/** Whether Kranz reroll is offered on the current failing phase (ruling 9). */
export function canReroll(state: GameState, mission: ActiveMission): boolean {
  if (mission.rerollUsed) return false;
  return mission.supportTechs.some((techId) =>
    abilitiesOf(cardById(state.content, techId)).some((a) => a.kind === 'reroll'),
  );
}

/**
 * Total for a side-mission flight (FR7.1 + rulings 15/16/17): drawn rank +
 * equipment pre-bid + held boosts only — no crew, no DSN, no tech support.
 */
export function sideMissionTotal(
  state: GameState,
  drawnCardId: string,
  prebid: readonly string[],
  boost: readonly string[],
): number {
  let total = cardById(state.content, drawnCardId).s;
  for (const id of prebid) {
    const card = cardById(state.content, id);
    if (card.kind !== 'equipment') throw new Error(`pre-bid must be equipment: ${id}`);
    total += card.s;
  }
  for (const id of boost) {
    const card = cardById(state.content, id);
    if (card.kind !== 'bonus') throw new Error(`boost must be a held bonus: ${id}`);
    total += bonusValue(card.s);
  }
  return total;
}

/** Side-mission difficulty: 4, +1 flat after any prior failure (FR7.1, ruling 22). */
export function sideMissionDifficulty(state: GameState, fails: number): number {
  const t = state.content.tuning;
  return t.sideMissionDifficulty + (fails > 0 ? t.sideMissionRetry : 0);
}

/** Program of a mission, for slot lookups. */
export function programOf(mission: Mission): Program {
  return mission.program;
}
