import type {
  ButtonVariant,
  CardEmptySize,
  CardVariant,
} from '@genfeedai/enums';
import type { ComponentType, ReactNode } from 'react';

export interface CardEmptyAction {
  label: string;
  onClick: () => void;
  variant?: ButtonVariant;
  ariaLabel?: string;
}

export interface CardEmptyProps {
  icon?: ComponentType<{ className?: string }>;
  iconClassName?: string;
  label?: string;
  description?: string;
  action?: CardEmptyAction;
  /**
   * Custom action node rendered in place of the built-in single `action`
   * button — for empty states that need multiple CTAs or navigation `Link`s
   * (e.g. "Browse Templates" + "Create Workflow"). Takes precedence over
   * `action` when provided.
   */
  actions?: ReactNode;
  className?: string;
  size?: CardEmptySize;
  variant?: CardVariant;
}
