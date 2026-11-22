/**
 * Tooltip — a hover/focus label for icon-only controls (spec §7 a11y: icons
 * always pair with text or an `aria-label`; this adds the sighted pointer
 * hint on top of the accessible name).
 */

import type { ReactNode } from 'react';

export interface TooltipProps {
  /** Tooltip text — plain language, e.g. "Undo the last move". */
  label: string;
  children: ReactNode;
  className?: string;
}

export function Tooltip({ label, children, className = '' }: TooltipProps) {
  return (
    <span className={`group relative inline-flex ${className}`}>
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden -translate-x-1/2
                   whitespace-nowrap border border-ink/30 bg-ink px-2 py-1 text-micro font-semibold
                   text-paper opacity-0 transition-opacity group-hover:opacity-100
                   group-focus-within:opacity-100 sm:block"
      >
        {label}
      </span>
    </span>
  );
}
