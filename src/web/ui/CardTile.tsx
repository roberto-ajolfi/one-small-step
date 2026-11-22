/**
 * CardTile / CardButton — the playing-card tile used by the hand fan, the
 * pending step panels, and the mission panel (spec §7 "No raster images:
 * suits are Unicode symbols, everything else type/icons").
 *
 * Suits are encoded as symbol + text so the tile reads correctly in greyscale
 * and for colourblind players (spec §7 a11y).
 */

import type { ReactNode } from 'react';
import type { Card } from '../../engine';
import { cardIdentity, cardName, cardValues, kindLabel, rankLabel, suitMeta } from './format';

export interface CardTileProps {
  card: Card;
  /** Hand-fan density: identity line hidden until the card is selected. */
  compact?: boolean;
  selected?: boolean;
  /** Extra line under the tile, e.g. "reserved for the pre-bid". */
  footnote?: ReactNode;
  className?: string;
}

export function CardTile({ card, compact = false, selected = false, footnote, className = '' }: CardTileProps) {
  const suit = suitMeta(card.suit);
  return (
    <article
      className={[
        'flex min-w-0 flex-col gap-1 border bg-paper px-2 py-1.5 text-left',
        selected ? 'border-patch-navy ring-2 ring-patch-navy' : 'border-ink/25',
        className,
      ].join(' ')}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className={`font-display text-base font-bold leading-none ${suit.tint}`}>
          {rankLabel(card)}
          <span className="text-ink">{suit.symbol}</span>
        </span>
        <span className="text-micro uppercase text-ink-faint">{kindLabel(card.kind)}</span>
      </div>
      <p className="font-display text-xs leading-tight text-ink">{cardName(card)}</p>
      {compact ? null : <p className="text-micro leading-snug text-ink-soft">{cardIdentity(card)}</p>}
      <p className="text-micro text-ink-faint">{cardValues(card)}</p>
      {footnote}
    </article>
  );
}

export interface CardButtonProps extends CardTileProps {
  /** Accessible name for the tile, e.g. "Play 9 of Hearts as Money". */
  label: string;
  onClick?: () => void;
  /** Why this card cannot be used right now (spec §7: shown, never swallowed). */
  disabledReason?: string;
  /** Marks the tile as the current selection (`aria-pressed`). */
  pressed?: boolean;
}

export function CardButton({
  label,
  onClick,
  disabledReason,
  pressed,
  className = '',
  ...tile
}: CardButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={Boolean(disabledReason)}
      aria-label={label}
      aria-pressed={pressed}
      title={disabledReason}
      className={[
        'block min-h-target rounded-none text-left transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-45',
        className,
      ].join(' ')}
    >
      <CardTile {...tile} selected={pressed ?? tile.selected} className="h-full" />
    </button>
  );
}
