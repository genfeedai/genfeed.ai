import type { ButtonSize, ButtonVariant } from '@genfeedai/contracts';

export interface ConnectAgentButtonProps {
  /** The host owns marketing copy or translates the label for product UI. */
  label: string;
  className?: string;
  size?: ButtonSize;
  trackingName: string;
  trackingAction?: string;
  variant?: ButtonVariant;
}
