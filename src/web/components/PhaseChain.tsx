/**
 * PhaseChain — the live phase chain of one mission (spec §7 MissionPanel).
 *
 * Every row shows the difficulty the check must meet (engine's
 * `phaseDifficulty`, FR5.3) and, once resolved, the drawn card, the total and
 * the margin. This is the table's "what just happened / what is next" strip.
 */

import { cardById, missionById, phaseDifficulty } from '../../engine';
import type { ActiveMission, GameState, Mission } from '../../engine';
import { Badge, CardTile, cardName } from '../ui';

const OUTCOME_TONE = {
  success: 'teal',
  minor: 'gold',
  major: 'red',
  minorRepaired: 'gold',
  majorRepaired: 'red',
} as const;

const OUTCOME_TEXT = {
  success: 'Success',
  minor: 'Minor failure',
  major: 'Major failure',
  minorRepaired: 'Minor failure, repaired',
  majorRepaired: 'Major failure, repaired',
} as const;

export function PhaseChain({
  state,
  mission,
  active,
}: {
  state: GameState;
  mission: Mission;
  active?: ActiveMission;
}) {
  return (
    <ol className="flex flex-col">
      {mission.chain.map((phase, index) => {
        const difficulty = phaseDifficulty(state, mission, phase);
        const result = active?.results[index];
        const current = Boolean(active) && active?.phaseIndex === index;
        return (
          <li
            key={`${phase}-${index}`}
            className={[
              'flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-ink/10 px-3 py-2 last:border-0',
              current ? 'bg-patch-navy/10' : '',
            ].join(' ')}
          >
            <span className="w-4 text-micro text-ink-faint">{index + 1}</span>
            <span className="min-w-24 grow font-display text-sm text-ink">{phase}</span>
            <Badge tone={result ? OUTCOME_TONE[result.outcome] : current ? 'navy' : 'muted'}>
              vs {difficulty}
            </Badge>

            {result ? (
              <span className="flex items-center gap-2">
                <CardTile card={cardById(state.content, result.drawnCard)} compact className="w-24" />
                <span className="text-micro text-ink-soft">
                  {`total ${result.total} \u00b7 margin ${result.margin > 0 ? '+' : ''}${result.margin}`}
                </span>
                <span className="text-micro font-semibold text-ink">{OUTCOME_TEXT[result.outcome]}</span>
              </span>
            ) : current && active?.drawnCard ? (
              <span className="flex items-center gap-2">
                <CardTile card={cardById(state.content, active.drawnCard)} compact className="w-24" />
                <span className="text-micro text-ink-soft">drew {cardName(cardById(state.content, active.drawnCard))}</span>
              </span>
            ) : (
              <span className="text-micro text-ink-faint">not yet resolved</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Human-readable label for a mission id (used by the panel header). */
export function missionLabel(state: GameState, id: string): string {
  return missionById(state.content, id).name;
}
