/**
 * ActionLog — the scrolling table log (spec §7, FR11.2).
 *
 * Two feeds: the engine's `state.log`, and the "why illegal?" trail of refused
 * actions recorded by the store (spec §7: illegal moves are disabled with a
 * reason string, never silently swallowed).
 */

import { Badge, Icon, Panel } from '../ui';
import { useGameState } from '../useGameSession';

const KIND_TONE = {
  system: 'muted',
  action: 'navy',
  mission: 'gold',
  event: 'red',
  soviet: 'red',
  turn: 'muted',
} as const;

export function ActionLog() {
  const { state, refusals } = useGameState();
  const entries = [...state.log].reverse();
  const lastRefusal = refusals[refusals.length - 1];

  return (
    <Panel title="Action log" collapsible defaultOpen={false}>
      {lastRefusal ? (
        <p className="flex items-start gap-2 border-b border-patch-red/40 bg-patch-red/10 px-3 py-2 text-micro text-patch-red">
          <Icon name="alert" size={14} />
          <span>
            <strong>Why illegal?</strong> {lastRefusal.text}
          </span>
        </p>
      ) : null}

      <ol className="max-h-80 overflow-y-auto px-3 py-2">
        {entries.map((entry, index) => (
          <li key={`${entry.turn}-${index}`} className="flex items-baseline gap-2 border-b border-ink/10 py-1 last:border-0">
            <Badge tone={KIND_TONE[entry.kind]} srLabel={`Turn ${entry.turn}`}>
              {entry.turn}
            </Badge>
            <span className="text-micro leading-snug text-ink-soft">{entry.text}</span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
