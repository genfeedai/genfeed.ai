import type { ComponentSize } from '@genfeedai/enums';

export type StatusDotStatus =
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'muted'
  | 'processing';

export interface StatusDotProps {
  /** The status to display */
  status: StatusDotStatus;
  /** Whether to show pulse animation */
  pulse?: boolean;
  /** Size of the dot */
  size?: ComponentSize.SM | ComponentSize.MD | ComponentSize.LG;
  /** Additional CSS classes */
  className?: string;
}
