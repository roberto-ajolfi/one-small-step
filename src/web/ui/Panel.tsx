/**
 * Panel — the framed board area (spec §7 board layout).
 *
 * Panels are collapsible on mobile only (spec §7: "collapsible sections … via
 * accordion panels"); from `md` up the body is always visible and the toggle
 * disappears, so the tablet/desktop table never hides information behind a tap.
 */

import { useId, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

export interface PanelProps {
  title: string;
  /** Right-aligned header slot — counters, small buttons. */
  actions?: ReactNode;
  /** Small line under the title, e.g. the mission year. */
  note?: ReactNode;
  /** Allow collapsing on mobile (accordion). */
  collapsible?: boolean;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}

export function Panel({
  title,
  actions,
  note,
  collapsible = false,
  defaultOpen = true,
  className = '',
  children,
}: PanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const expanded = open || !collapsible;

  return (
    <section className={`border border-ink/25 bg-paper-deep/40 ${className}`}>
      <header className="flex items-center gap-3 border-b border-ink/25 bg-paper-edge/30 px-3 py-2">
        <h2 className="eyebrow grow">{title}</h2>
        {note ? <p className="text-micro text-ink-faint">{note}</p> : null}
        {actions}
        {collapsible ? (
          <button
            type="button"
            className="-mr-1 inline-flex min-h-target min-w-target items-center justify-center text-ink-soft md:hidden"
            aria-expanded={open}
            aria-controls={bodyId}
            aria-label={`${open ? 'Collapse' : 'Expand'} ${title}`}
            onClick={() => setOpen((value) => !value)}
          >
            <Icon
              name="chevron"
              size={18}
              className={`transition-transform ${open ? '' : '-rotate-90'}`}
            />
          </button>
        ) : null}
      </header>
      <div id={bodyId} className={expanded ? 'block' : 'hidden md:block'}>
        {children}
      </div>
    </section>
  );
}
