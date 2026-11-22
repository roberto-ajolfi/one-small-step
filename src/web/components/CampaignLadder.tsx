/**
 * CampaignLadder — the fixed 12-mission ladder plus the four side missions
 * (spec §7; kit page 4 "Mission Status Sheet"): one row per rung with its
 * status and retry count, so the whole plan is readable at a glance.
 */

import { Badge, Panel } from '../ui';
import { useGameState } from '../useGameSession';

const STATE_TONE = {
  pending: 'muted',
  active: 'navy',
  done: 'teal',
} as const;

export function CampaignLadder() {
  const { state } = useGameState();
  const sideMissions = state.content.cards.filter((card) => card.kind === 'sideMission');

  return (
    <Panel title="Campaign ladder" collapsible defaultOpen={false}>
      <ol className="px-3 py-2">
        {state.content.missions.map((mission, index) => {
          const status = state.campaign.status[index];
          const current = index === state.campaign.index;
          return (
            <li
              key={mission.id}
              className={`flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-ink/10 py-1.5 last:border-0 ${
                current ? 'bg-patch-gold/10' : ''
              }`}
            >
              <span className="w-6 text-micro text-ink-faint">{index + 1}</span>
              <span className="min-w-0 grow font-display text-xs text-ink">{mission.name}</span>
              <span className="text-micro text-ink-faint">{mission.program}</span>
              <Badge tone={STATE_TONE[status.state]} srLabel={`Mission status: ${status.state}`}>
                {status.state}
              </Badge>
              {status.failCount > 0 ? (
                <Badge tone="red" srLabel="failed attempts">
                  {status.failCount} fail
                </Badge>
              ) : null}
              <span className="text-micro text-ink-faint">VP {mission.vp}</span>
            </li>
          );
        })}
      </ol>

      <h3 className="eyebrow border-y border-ink/15 bg-paper-edge/20 px-3 py-1">Side missions</h3>
      <ul className="px-3 py-2">
        {sideMissions.map((card) => {
          const status = state.sideMissions[card.id];
          return (
            <li key={card.id} className="flex items-center gap-2 border-b border-ink/10 py-1.5 last:border-0">
              <span className="min-w-0 grow font-display text-xs text-ink">{card.sideMission?.name}</span>
              <Badge
                tone={status?.status === 'flown' ? 'teal' : 'muted'}
                srLabel={`Side mission status: ${status?.status ?? 'open'}`}
              >
                {status?.status ?? 'open'}
              </Badge>
              {status && status.fails > 0 ? (
                <Badge tone="red" srLabel="failed attempts">
                  {status.fails} fail
                </Badge>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
