import type { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { ReactNode } from 'react';

export interface SocialMediaLinkProps {
  url: string;
  handle?: string;
  icon: ReactNode;
  className?: string;
  tooltipPosition?: 'top' | 'bottom' | 'left' | 'right';
  username?: string;
  /** Default: true */
  enableUTM?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
}
