import type {
  ButtonVariant,
  CardEmptySize,
  CardVariant,
} from '@genfeedai/enums';
import type { ComponentType } from 'react';

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
  className?: string;
  size?: CardEmptySize;
  variant?: CardVariant;
}
