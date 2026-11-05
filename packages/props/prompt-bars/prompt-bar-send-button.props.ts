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

/** What a prompt-bar chip sets, so each concept wears one icon in every bar. */
export type PromptBarChipIconKind =
  | 'aspectRatio'
  | 'count'
  | 'duration'
  | 'format'
  | 'intent'
  | 'model'
  | 'output'
  | 'source'
  | 'workflow';

export interface PromptBarCompactSelectProps {
  ariaLabel: string;
  /** Id of the element naming the error, for a chip whose value is rejected. */
  describedBy?: string;
  /** Lets a form label or error point at the chip. */
  id?: string;
  /**
   * The setting the chip changes. Every chip shows its icon and its current
   * value; a `source` chip (the mode that decides what the bar makes) also
   * shows the chevron, like the Studio type chip.
   */
  icon: PromptBarChipIconKind;
  isDisabled?: boolean;
  /** The chosen value is rejected; the chip says so to assistive tech. */
  isInvalid?: boolean;
  onChange: (value: string) => void;
  options: ReadonlyArray<PromptBarCompactSelectOption>;
  /** Shown while `value` matches no option (a choice not made yet). */
  placeholder?: string;
  value: string;
}
