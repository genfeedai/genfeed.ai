import type { ComponentSize } from '@genfeedai/contracts';

export interface PlatformBadgeProps {
  platform: string;
  className?: string;
  showLabel?: boolean;
  variant?: 'subtle' | 'solid';
  size?: ComponentSize.SM | ComponentSize.MD | ComponentSize.LG;
}
