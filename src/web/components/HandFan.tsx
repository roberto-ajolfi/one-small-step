/**
 * HandFan — the player's hand (spec §7 board layout).
 *
 * Tap-to-select, then pick a mode: every gesture compiles to a `Move`
 * (`playCard` with money/rd/identity, or `flySideMission` for an ace). Each
 * mode button is disabled with the engine's reason when it is not legal.
 * The strip scrolls horizontally on mobile; the page itself never does.
 */

import { useState } from 'react';
import { cardById, moneyValue, rdValue, validateMove } from '../../engine';
import type { Card, Mode } from '../../engine';
import { Badge, Button, CardButton, Panel, cardIdentity, cardName } from '../ui';
import { useGameSession, useGameState } from '../useGameSession';

const MODES: { mode: Mode; label: (card: Card) => string; icon: 'coin' | 'flask' | 'play' }[] = [
  { mode: 'money', label: (card) => `Cash $${moneyValue(card.s)}`, icon: 'coin' },
  { mode: 'rd', label: (card) => `Invest R&D ${rdValue(card.s)}`, icon: 'flask' },
  { mode: 'identity', label: () => 'Play identity', icon: 'play' },
];

export function HandFan() {
  const session = useGameSession();
  const { state } = useGameState();
  const [selected, setSelected] = useState<string | null>(null);
  const reserved = new Set(state.pendingLaunch?.reservedPrebid ?? []);
  const card = selected ? cardById(state.content, selected) : null;

  // A stale selection (card left the hand) must not linger behind a new game.
  const selectable = selected !== null && state.hand.includes(selected);

  return (
    <Panel title="Hand" note={`${state.hand.length} card(s)`}>
      {selectable && card ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-ink/20 bg-paper-edge/30 p-3">
          <div className="min-w-0 grow">
            <p className="font-display text-sm text-ink">{cardName(card)}</p>
            <p className="text-micro text-ink-soft">{cardIdentity(card)}</p>
          </div>

          {card.kind === 'sideMission' ? (
            <Button
              variant="gold"
              icon="rocket"
              disabledReason={validateMove(state, { t: 'flySideMission', ace: card.id }) ?? undefined}
              onClick={() => {
                session.dispatch({ t: 'flySideMission', ace: card.id });
                setSelected(null);
              }}
            >
              Fly side mission
            </Button>
          ) : (
            MODES.map(({ mode, label, icon }) => (
              <Button
                key={mode}
                icon={icon}
                disabledReason={validateMove(state, { t: 'playCard', card: card.id, mode }) ?? undefined}
                onClick={() => {
                  session.dispatch({ t: 'playCard', card: card.id, mode });
                  setSelected(null);
                }}
              >
                {label(card)}
              </Button>
            ))
          )}

          <Button variant="ghost" icon="x" onClick={() => setSelected(null)}>
            Cancel
          </Button>
        </div>
      ) : null}

      <div className="flex gap-2 overflow-x-auto p-3">
        {state.hand.length === 0 ? (
          <p className="text-micro text-ink-faint">No cards in hand — resolve the draw phase.</p>
        ) : (
          state.hand.map((id, index) => {
            const row = cardById(state.content, id);
            const isReserved = reserved.has(id);
            return (
              <CardButton
                key={`${id}-${index}`}
                card={row}
                compact
                pressed={selected === id}
                label={`${cardName(row)} — tap to choose how to play it`}
                footnote={isReserved ? <Badge tone="gold">reserved</Badge> : undefined}
                className="w-32 shrink-0 sm:w-36"
                onClick={() => setSelected(selected === id ? null : id)}
              />
            );
          })
        )}
      </div>

      {selectable && card ? null : (
        <p className="hidden px-3 pb-3 text-micro text-ink-faint sm:block">
          Tap a card to choose Cash, Invest or its identity mode. <ModeGloss /> Reserved cards stay in
          hand until the mission pre-bid resolves.
        </p>
      )}
    </Panel>
  );
}

/** Inline gloss so the mode vocabulary is explained where it is used. */
function ModeGloss() {
  return (
    <span className="text-ink-soft">
      Cash pays <strong>s</strong>, Invest pays <strong>&#8968;s/2&#8969;</strong>.
    </span>
  );
}
