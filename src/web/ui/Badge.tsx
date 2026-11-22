/**
 * Badge — a small status pill (crew R/I/S, mission status, afford highlight).
 * Always carries its meaning as text; the tint is decoration only (spec §7).
 */

import type { ReactNode } from 'react';

export type BadgeTone = 'navy' | 'gold' | 'red' | 'teal' | 'muted' | 'ink';

const TONES: Record<BadgeTone, string> = {
  navy: 'border-patch-navy/60 bg-patch-navy/10 text-patch-navy',
  gold: 'border-patch-gold/70 bg-patch-gold/15 text-ink',
  red: 'border-patch-red/60 bg-patch-red/10 text-patch-red',
  teal: 'border-patch-teal/60 bg-patch-teal/10 text-patch-teal',
  muted: 'border-ink/25 bg-ink/5 text-ink-faint',
  ink: 'border-ink bg-ink text-paper',
};

export interface BadgeProps {
  tone?: BadgeTone;
  /** Extra screen-reader context when the visible label is an abbreviation. */
  srLabel?: string;
  className?: string;
  children: ReactNode;
}

export function Badge({ tone = 'muted', srLabel, className = '', children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 border px-1.5 py-0.5 text-micro font-semibold uppercase tracking-wider ${TONES[tone]} ${className}`}
    >
      {srLabel ? <span className="sr-only">{srLabel}</span> : null}
      {children}
    </span>
  );
}
