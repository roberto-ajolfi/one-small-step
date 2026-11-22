/**
 * ResourceCounters — Money, R&D and actions left (spec §7 board layout).
 * The three numbers the whole turn revolves around, kept in the masthead row.
 */

import { Icon, Panel } from '../ui';
import { useGameState } from '../useGameSession';

interface CounterProps {
  icon: 'coin' | 'flask' | 'bolt';
  label: string;
  value: string;
  note?: string;
  tint: string;
}

function Counter({ icon, label, value, note, tint }: CounterProps) {
  return (
    <div className="flex items-center gap-3">
      <Icon name={icon} size={20} className={tint} />
      <div>
        <p className="eyebrow">{label}</p>
        <p className="font-display text-title leading-none">
          {value}
          {note ? <span className="ml-2 text-micro text-ink-faint">{note}</span> : null}
        </p>
      </div>
    </div>
  );
}

export function ResourceCounters() {
  const { state } = useGameState();
  const t = state.content.tuning;
  return (
    <Panel title="Resources">
      <div className="grid grid-cols-1 gap-4 p-3 sm:grid-cols-3">
        <Counter icon="coin" label="Money" value={`$${state.resources.money}`} tint="text-patch-gold" />
        <Counter icon="flask" label="R&D" value={`${state.resources.rd}`} tint="text-patch-teal" />
        <Counter
          icon="bolt"
          label="Actions left"
          value={`${state.actionsLeft}`}
          note={`of ${t.actionsPerTurn}`}
          tint="text-patch-navy"
        />
      </div>
    </Panel>
  );
}
