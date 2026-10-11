import type { ReactNode } from 'react';

export interface PromptBarSendButtonProps {
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
