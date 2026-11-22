/**
 * Button — the one interactive primitive (spec §7 interaction model).
 *
 * `disabledReason` is the contract behind "illegal moves are disabled with a
 * reason string, never silently swallowed": the control greys out, exposes the
 * reason to pointer and screen-reader users through `title` + `aria-describedby`,
 * and stays readable at 360 px (44 px touch targets, spec §7 mobile).
 */

import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'gold' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'border-patch-navy bg-patch-navy text-paper hover:bg-patch-navy/85',
  secondary: 'border-ink/40 bg-transparent text-ink hover:bg-ink/5',
  gold: 'border-patch-gold bg-patch-gold text-ink hover:bg-patch-gold/85',
  danger: 'border-patch-red/70 bg-transparent text-patch-red hover:bg-patch-red/10',
  ghost: 'border-transparent bg-transparent text-ink-soft hover:bg-ink/5',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-8 px-2.5 py-1',
  md: 'min-h-target px-3.5 py-2',
};

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  /** Native tooltip text; superseded by `disabledReason` when the button is off. */
  title?: string;
  /** Why this action is unavailable right now (shown, never swallowed). */
  disabledReason?: string;
  children?: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  title,
  disabledReason,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const reasonId = useId();
  const off = disabled || Boolean(disabledReason);
  return (
    <button
      {...rest}
      type={type}
      disabled={off}
      title={disabledReason ?? title}
      aria-describedby={disabledReason ? reasonId : rest['aria-describedby']}
      className={[
        'inline-flex items-center justify-center gap-2 border font-body text-label font-semibold',
        'uppercase tracking-widest transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-40',
        VARIANTS[variant],
        SIZES[size],
        className,
      ].join(' ')}
    >
      {icon ? <Icon name={icon} size={size === 'sm' ? 14 : 16} /> : null}
      {children}
      {disabledReason ? (
        <span id={reasonId} className="sr-only">
          {disabledReason}
        </span>
      ) : null}
    </button>
  );
}
