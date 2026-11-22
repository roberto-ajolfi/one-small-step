/**
 * SovietTrack — the 36-space race track (spec §7 board layout).
 *
 * Milestone names and bites mirror the printable kit (page 2): every 3rd space
 * is a milestone worth -1 VP once reached, every 6th also bites -3 Money, and
 * space 36 is a Soviet landing (FR9.3). The track wraps into rows at every
 * breakpoint — no horizontal page scrolling (spec §7 responsive).
 */

import { Badge, Icon, Panel } from '../ui';
import { useGameState } from '../useGameSession';

/** Milestone names keyed by track space (kit page 2 "Soviet Track"). */
export const MILESTONES: readonly { space: number; name: string }[] = [
  { space: 3, name: 'Gagarin orbits' },
  { space: 6, name: 'Titov' },
  { space: 9, name: 'Tereshkova' },
  { space: 12, name: 'Leonov spacewalk' },
  { space: 15, name: 'Voskhod' },
  { space: 18, name: 'Luna 9' },
  { space: 21, name: 'Zond flyby' },
  { space: 24, name: 'Soyuz docking' },
  { space: 27, name: 'Luna 16' },
  { space: 30, name: 'Lunokhod' },
  { space: 33, name: 'Soviet lunar orbit' },
  { space: 36, name: 'Soviet moon landing' },
];

export function SovietTrack() {
  const { state } = useGameState();
  const t = state.content.tuning;
  const length = t.sovietTrackLength;
  const { position, maxPosition } = state.soviet;
  const spaces = Array.from({ length }, (_, index) => index + 1);

  return (
    <Panel
      title="Soviet track"
      note={`drift +${t.sovietDrift}/turn`}
      collapsible
      actions={
        <Badge tone={position >= length ? 'red' : 'navy'} srLabel="Soviet track position">
          {position} / {length}
        </Badge>
      }
    >
      <div className="flex flex-wrap gap-1 p-3">
        {spaces.map((space) => {
          const milestone = space % t.milestoneEvery === 0;
          const reached = space <= position;
          const bitten = space <= maxPosition && milestone;
          return (
            <span
              key={space}
              title={
                MILESTONES.find((m) => m.space === space)?.name ??
                (milestone ? `Milestone ${space}` : `Space ${space}`)
              }
              className={[
                'flex h-8 w-8 items-center justify-center border text-micro font-semibold',
                space === length
                  ? 'border-ink bg-ink text-paper'
                  : reached
                    ? 'border-patch-red bg-patch-red/15 text-patch-red'
                    : milestone
                      ? 'border-ink/40 text-ink-soft'
                      : 'border-ink/20 text-ink-faint',
              ].join(' ')}
            >
              {space}
              {bitten ? <span className="sr-only"> (milestone bite applied)</span> : null}
            </span>
          );
        })}
      </div>

      <ul className="grid grid-cols-1 gap-x-4 gap-y-1 px-3 pb-3 sm:grid-cols-2 lg:grid-cols-3">
        {MILESTONES.map(({ space, name }) => {
          const reached = space <= maxPosition;
          return (
            <li
              key={space}
              className={`flex items-baseline gap-2 text-micro ${reached ? 'text-ink' : 'text-ink-faint'}`}
            >
              {reached ? <Icon name="check" size={12} /> : <Icon name="square" size={12} />}
              <span className="font-semibold">{space}</span>
              <span>{name}</span>
              <span className="grow" />
              <span>
                -{t.milestoneVpBite} VP
                {space % t.moneyBiteEvery === 0 ? ` \u00b7 -$${t.milestoneMoneyBite}` : ''}
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
