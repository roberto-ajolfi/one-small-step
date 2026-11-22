/**
 * BoardLayout — the table simulation (spec §7 board layout + responsive tiers).
 *
 * Mobile: one column of panels (accordions collapse the secondary areas) with
 * the hand in a sticky strip at the bottom. Tablet: two columns, hand fixed at
 * the bottom. Desktop: the full table in a 12-column grid. The 36-space track
 * and the 30-turn tracker wrap into rows at every breakpoint — the page never
 * scrolls horizontally (spec §7).
 */

import { CampaignLadder } from './CampaignLadder';
import { CrewPool } from './CrewPool';
import { DrawPile } from './DrawPile';
import { HandFan } from './HandFan';
import { MissionPanel } from './MissionPanel';
import { ResourceCounters } from './ResourceCounters';
import { SovietTrack } from './SovietTrack';
import { TechTreePanel } from './TechTreePanel';
import { TurnTracker } from './TurnTracker';
import { ActionLog } from './ActionLog';
import { Button } from '../ui';
import { useGameSession, useGameState } from '../useGameSession';

/** The one button the player needs next (spec §7 "bottom action bar"). */
function PrimaryAction() {
  const session = useGameSession();
  const { state } = useGameState();
  const t = state.content.tuning;

  const hint: Record<string, string> = {
    draw: `Draw your ${t.drawPerTurn} cards for the turn.`,
    actions: `Spend your ${state.actionsLeft} action(s), or end the turn.`,
    prebid: 'A phase check is waiting on your pre-bid.',
    mission: 'A phase check is waiting on your ability choice.',
    repair: 'A phase failure is waiting on your repair decision.',
    upkeep: 'Trim your hand to end the year.',
    gameOver: 'The game is over — the ending screen has the score and the seed.',
  };

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-ink/15 px-3 py-2">
      {state.phase === 'draw' ? (
        <Button variant="primary" icon="dice" onClick={() => session.dispatch({ t: 'resolvePhase' })}>
          Draw {t.drawPerTurn} cards
        </Button>
      ) : null}
      {state.phase === 'actions' ? (
        <Button variant="primary" icon="arrowRight" onClick={() => session.dispatch({ t: 'endTurn' })}>
          End turn
        </Button>
      ) : null}
      <p className="text-micro text-ink-faint">{hint[state.phase]}</p>
    </div>
  );
}

export function BoardLayout() {
  return (
    <>
      <div className="mx-auto grid w-full max-w-7xl gap-4 px-3 py-4 md:grid-cols-2 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-7">
          <MissionPanel />
          <SovietTrack />
          <TurnTracker />
        </div>
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-5">
          <ResourceCounters />
          <DrawPile />
          <TechTreePanel />
          <CrewPool />
          <CampaignLadder />
          <ActionLog />
        </div>
      </div>

      <div className="sticky bottom-0 z-10 border-t border-ink/25 bg-paper/95 backdrop-blur">
        <div className="mx-auto w-full max-w-7xl px-3">
          <HandFan />
          <PrimaryAction />
        </div>
      </div>
    </>
  );
}
