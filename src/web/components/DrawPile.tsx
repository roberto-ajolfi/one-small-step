/**
 * DrawPile — fate-deck bookkeeping (spec §7 board layout "DrawPile/Discard").
 * Two 108-card copies in circulation: deck, discard, hand, in play and the
 * crew pool always partition them (engine invariant §4.4).
 */

import { Badge, Icon, Panel } from '../ui';
import { useGameState } from '../useGameSession';

export function DrawPile() {
  const { state } = useGameState();
  return (
    <Panel title="Fate deck" note={`${state.seed}`}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 p-3">
        <span className="inline-flex items-center gap-2">
          <Icon name="square" size={16} className="text-ink-faint" />
          <span className="eyebrow">Draw pile</span>
          <Badge tone="muted">{state.deck.length}</Badge>
        </span>
        <span className="inline-flex items-center gap-2">
          <Icon name="history" size={16} className="text-ink-faint" />
          <span className="eyebrow">Discard</span>
          <Badge tone="muted">{state.discard.length}</Badge>
        </span>
        <span className="inline-flex items-center gap-2">
          <Icon name="star" size={16} className="text-ink-faint" />
          <span className="eyebrow">Held in play</span>
          <Badge tone="muted">{state.inPlay.length}</Badge>
        </span>
      </div>
    </Panel>
  );
}
