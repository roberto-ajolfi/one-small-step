/**
 * CardPicker — a grid of selectable card instances (spec §7 step panels).
 *
 * Choices are per *instance* (`key`), so both copies of a row can be picked
 * independently and the caller can map selections back to a move's `CardId[]`.
 */

import type { ReactNode } from 'react';
import type { Card } from '../../engine';
import { CardButton } from './CardTile';

export interface CardChoice {
  key: string;
  card: Card;
}

export interface CardPickerProps {
  choices: CardChoice[];
  /** Instance keys currently selected. */
  selected: readonly string[];
  onToggle: (key: string) => void;
  /** Accessible name for each tile. */
  label: (card: Card) => string;
  /** Extra line under each tile, e.g. "worth 4 repair points". */
  footnote?: (card: Card) => ReactNode;
  /** Shown when there is nothing to pick. */
  emptyText: string;
}

export function CardPicker({ choices, selected, onToggle, label, footnote, emptyText }: CardPickerProps) {
  if (choices.length === 0) return <p className="text-micro text-ink-faint">{emptyText}</p>;
  return (
    <ul className="flex flex-wrap gap-2">
      {choices.map(({ key, card }) => (
        <li key={key}>
          <CardButton
            card={card}
            compact
            pressed={selected.includes(key)}
            label={label(card)}
            footnote={footnote?.(card)}
            className="w-32"
            onClick={() => onToggle(key)}
          />
        </li>
      ))}
    </ul>
  );
}
