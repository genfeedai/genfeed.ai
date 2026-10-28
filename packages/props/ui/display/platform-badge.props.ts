import type { ComponentSize } from '@genfeedai/contracts';

export interface PlatformBadgeProps {
  /** Platform value, OAuth path or name; empty renders a dash. */
  platform?: string | null;
  className?: string;
  showLabel?: boolean;
  variant?: 'subtle' | 'solid';
  size?: ComponentSize.SM | ComponentSize.MD | ComponentSize.LG;
}
