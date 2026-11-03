import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';

/**
 * Native button attributes pass through so a wrapping Radix trigger (`asChild`)
 * can attach its handlers, state attributes and ref. Props the control owns are
 * excluded.
 */
export interface PromptBarIconButtonProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    'children' | 'className' | 'disabled' | 'onClick' | 'type'
  > {
  ariaLabel: string;
  /** Extra classes merged onto the button (e.g. an active tint). */
  className?: string;
  /** The glyph, at the 14px chrome tier (`SHELL_ICON_CLASS`). */
  icon: ReactNode;
  isDisabled?: boolean;
  onClick?: () => void;
  ref?: Ref<HTMLButtonElement>;
  testId?: string;
  /** Defaults to `ariaLabel`. */
  tooltip?: string;
}
