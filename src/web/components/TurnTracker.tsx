/**
 * TurnTracker — the 30-turn timeline (10 years x 3 turns, kit page 4).
 * Blocks wrap into rows at every breakpoint; the current turn is marked
 * typographically so the strip survives greyscale printing (spec §7).
 */

import { Panel } from '../ui';
import { useGameState } from '../useGameSession';

export function TurnTracker() {
  const { state } = useGameState();
  const turnsPerYear = state.content.tuning.turnsPerYear;
  const totalTurns = state.content.tuning.turnsPerYear * 10;
  const years = Array.from({ length: Math.ceil(totalTurns / turnsPerYear) }, (_, i) => i);

  return (
    <Panel title="Timeline" note={`${totalTurns} turns \u00b7 ${turnsPerYear} per year`}>
      <div className="flex flex-wrap gap-x-3 gap-y-2 p-3">
        {years.map((yearIndex) => {
          const year = 1960 + yearIndex;
          return (
            <div key={year} className="flex flex-col items-center gap-1">
              <div className="flex gap-0.5">
                {Array.from({ length: turnsPerYear }, (_, slot) => {
                  const turn = yearIndex * turnsPerYear + slot + 1;
                  const done = turn < state.turn;
                  const current = turn === state.turn;
                  return (
                    <span
                      key={turn}
                      aria-label={`Turn ${turn}, ${year}`}
                      aria-current={current ? 'true' : undefined}
                      className={[
                        'flex h-7 w-7 items-center justify-center border text-micro font-semibold',
                        current
                          ? 'border-patch-navy bg-patch-navy text-paper'
                          : done
                            ? 'border-ink/30 bg-ink/10 text-ink-faint'
                            : 'border-ink/20 text-ink-faint',
                      ].join(' ')}
                    >
                      {turn}
                    </span>
                  );
                })}
              </div>
              <span className={`text-micro ${year === state.year ? 'text-ink' : 'text-ink-faint'}`}>{year}</span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
