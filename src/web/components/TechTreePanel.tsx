/**
 * TechTreePanel — the 11 hardware items (spec §7 board layout: "checkboxes,
 * costs, afford-highlight"). Purchases compile to a `developTech` move; an item
 * the player cannot buy is disabled and carries the engine's reason
 * (`validateMove`) rather than failing silently.
 */

import { effectiveRdCost, validateMove } from '../../engine';
import type { Program, TechItem } from '../../engine';
import { Badge, Button, Icon, Panel } from '../ui';
import { useGameSession, useGameState } from '../useGameSession';

const PROGRAMS: { id: Program; label: string }[] = [
  { id: 'mercury', label: 'Mercury' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'apollo', label: 'Apollo' },
];

function TechRow({ item }: { item: TechItem }) {
  const session = useGameSession();
  const { state } = useGameState();
  const developed = state.tech[item.id];
  const reason = developed ? undefined : (validateMove(state, { t: 'developTech', tech: item.id }) ?? undefined);
  const rdCost = effectiveRdCost(state, item);
  const affordable = !reason && state.resources.rd >= rdCost && state.resources.money >= item.moneyCost;
  const needed = state.content.missions[state.campaign.index]?.requires.includes(item.id);

  return (
    <li
      className={[
        'flex flex-wrap items-center gap-x-3 gap-y-1 border-l-4 px-3 py-2',
        developed
          ? 'border-patch-teal bg-patch-teal/10'
          : affordable
            ? 'border-patch-gold bg-patch-gold/10'
            : 'border-transparent',
      ].join(' ')}
    >
      <Icon name={developed ? 'check' : 'square'} size={16} className={developed ? 'text-patch-teal' : 'text-ink-faint'} />
      <div className="min-w-0 grow">
        <p className="font-display text-sm leading-tight text-ink">
          {item.name}
          {needed ? (
            <Badge tone="navy" className="ml-2">
              needed next
            </Badge>
          ) : null}
        </p>
        <p className="text-micro text-ink-faint">
          {`R&D ${rdCost}${rdCost !== item.rdCost ? ` (from ${item.rdCost})` : ''} \u00b7 Money ${item.moneyCost} \u00b7 ${item.tags.join(', ')}`}
        </p>
      </div>
      <Button
        size="sm"
        variant={developed ? 'ghost' : affordable ? 'gold' : 'secondary'}
        disabledReason={developed ? 'already developed' : reason}
        onClick={() => session.dispatch({ t: 'developTech', tech: item.id })}
      >
        {developed ? 'Developed' : 'Develop'}
      </Button>
    </li>
  );
}

export function TechTreePanel() {
  const { state } = useGameState();
  return (
    <Panel title="Hardware" note="one action per purchase" collapsible defaultOpen={false}>
      {PROGRAMS.map(({ id, label }) => (
        <div key={id}>
          <h3 className="eyebrow border-b border-ink/15 bg-paper-edge/20 px-3 py-1">{label}</h3>
          <ul>
            {state.content.techTree
              .filter((item) => item.program === id)
              .map((item) => (
                <TechRow key={item.id} item={item} />
              ))}
          </ul>
        </div>
      ))}
    </Panel>
  );
}
