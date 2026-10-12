import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';

/**
 * Native button attributes pass through to the underlying button so a wrapping
 * Radix trigger (`asChild`) can attach its focus, pointer and `aria-describedby`
 * handlers and its ref. Props the control owns are excluded.
 */
export interface PromptBarSendButtonProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    'children' | 'className' | 'disabled' | 'onClick' | 'type'
  > {
  ariaLabel: string;
  /** Extra classes merged onto the button (e.g. a blocked/dimmed state). */
  className?: string;
  density?: 'compact' | 'default';
  /** Defaults to the shared up-arrow. */
  icon?: ReactNode;
  /** Keeps the button clickable but announces it as unavailable. */
  isAriaDisabled?: boolean;
  isDisabled?: boolean;
  isLoading?: boolean;
  onClick: () => void;
  ref?: Ref<HTMLButtonElement>;
  testId?: string;
  tooltip?: string;
}

export interface PromptBarCompactSelectOption {
  isDisabled?: boolean;
  label: string;
  value: string;
}

export interface PromptBarCompactSelectProps {
  ariaLabel: string;
  density?: 'compact' | 'default';
  isDisabled?: boolean;
  onChange: (value: string) => void;
  options: ReadonlyArray<PromptBarCompactSelectOption>;
  value: string;
}
