/**
 * Modal — the dialog shell for step panels and overlays (spec §7).
 *
 * Focus moves into the dialog on open and is trapped while it is up; Escape
 * only closes dialogs that pass `onClose`, so a forced step panel (pending
 * windows, game over) cannot be dismissed by accident.
 */

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from './Button';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  title: string;
  /** Small line above the title (spec §7 uses it for step numbering). */
  eyebrow?: string;
  /** Omit to make the dialog a forced step: no Escape, no backdrop close. */
  onClose?: () => void;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
  children: ReactNode;
}

const WIDTHS = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-6xl',
};

export function Modal({ title, eyebrow, onClose, maxWidth = 'md', children }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    panel.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onClose) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-ink/60 p-3 sm:p-6"
      onMouseDown={onClose ? (event) => event.target === event.currentTarget && onClose() : undefined}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`print-sheet my-[4vh] w-full ${WIDTHS[maxWidth]} border border-ink/40 bg-paper shadow-2xl`}
      >
        <header className="flex items-start gap-3 border-b border-ink/25 bg-paper-edge/40 px-4 py-3">
          <div className="grow">
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            <h2 id={titleId} className="text-title text-ink">
              {title}
            </h2>
          </div>
          {onClose ? <Button variant="ghost" size="sm" icon="x" aria-label="Close" onClick={onClose} /> : null}
        </header>
        <div className="px-4 py-4">{children}</div>
      </div>
    </div>
  );
}
