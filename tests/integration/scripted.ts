/**
 * Scripted auto-player — a deterministic policy that drives `apply()` through a
 * full game headlessly (M1 exit criterion, spec §11). Deliberately simple:
 * launch whenever legal, recruit while crew slots are short, develop in tree
 * order, keep resources balanced, cash whatever is left, always end the turn.
 */

import {
  apply,
  cardById,
  crewSlots,
  currentMission,
  legalMoves,
  type GameState,
  type Move,
} from '../../src/engine';

/** True when the current mission's crew slots are not yet fillable from the pool. */
function needsRecruit(state: GameState): boolean {
  const mission = currentMission(state);
  const slots = crewSlots(state, mission.program);
  const ready = Object.entries(state.crewPool).filter(
    ([id, s]) => s.state === 'ready' && cardById(state.content, id).named?.role !== 'tech',
  ).length;
  return ready < slots;
}

/**
 * Picks the next move for `state` from its legal moves, by priority:
 * windows first (they only forward the game), then launch > recruit >
 * develop > resource play > endTurn.
 */
export function chooseMove(state: GameState): Move {
  const legal = legalMoves(state);
  if (legal.length === 0) throw new Error(`no legal moves in phase ${state.phase}`);

  switch (state.phase) {
    case 'draw':
      return { t: 'resolvePhase' };
    case 'prebid':
      return { t: 'resolvePhase', prebid: [], boost: [] };
    case 'mission':
      return { t: 'resolveAbility' }; // skip once-per-mission abilities
    case 'repair': {
      const paying = legal.find((m) => m.t === 'payRepair' && m.cards.length > 0);
      return paying ?? { t: 'payRepair', cards: [] };
    }
    case 'upkeep':
      return legal[0]; // canonical hand trim
    case 'actions': {
      const launch = legal.find((m) => m.t === 'launchMission');
      if (launch) return launch;
      if (needsRecruit(state)) {
        const recruitMove = legal.find(
          (m) => m.t === 'playCard' && m.mode === 'identity' && cardById(state.content, m.card).kind === 'person',
        );
        if (recruitMove) return recruitMove;
      }
      const develop = legal.find((m) => m.t === 'developTech');
      if (develop) return develop;
      // Alternate R&D and Money so both economies progress.
      const mode = state.resources.rd < state.resources.money ? 'rd' : 'money';
      const preferred = legal.find((m) => m.t === 'playCard' && m.mode === mode);
      if (preferred) return preferred;
      const anyPlay = legal.find((m) => m.t === 'playCard');
      if (anyPlay) return anyPlay;
      return { t: 'endTurn' };
    }
    case 'gameOver':
      throw new Error('no legal moves after game over');
  }
}

/** Plays one full game from `state`; returns the terminal state. */
export function playGame(state: GameState, maxMoves = 5000): GameState {
  let s = state;
  for (let i = 0; i < maxMoves; i++) {
    if (s.phase === 'gameOver') return s;
    s = apply(s, chooseMove(s));
  }
  throw new Error(`game did not finish within ${maxMoves} moves (phase ${s.phase})`);
}
