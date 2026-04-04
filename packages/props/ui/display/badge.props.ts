import type { ComponentSize } from '@genfeedai/enums';
import type { ReactNode } from 'react';

export interface BadgeBrandProps {
  brandLogoUrl?: string;
}

export interface BadgeProps {
  children?: ReactNode;
  value?: number | string;
  icon?: ReactNode;
  size?: ComponentSize.SM | ComponentSize.MD | ComponentSize.LG;
  className?: string;
  /**
   * Badge variant - directly sets the badge color
   */
  variant?:
    | 'default'
    | 'primary'
    | 'secondary'
    | 'accent'
    | 'info'
    | 'success'
    | 'warning'
    | 'error'
    | 'destructive'
    | 'outline'
    | 'ghost'
    // Additional category colors
    | 'purple'
    | 'blue'
    | 'amber'
    | 'slate'
    // Content type badges
    | 'image'
    | 'video'
    | 'audio'
    | 'text'
    | 'multimodal'
    // Status badges
    | 'validated'
    | 'operational';
  /**
   * Status string - automatically determines variant based on status
   * Takes precedence over variant prop if provided
   * Examples: 'published', 'processing', 'failed', 'draft'
   */
  status?: string;
}

export interface BadgeQuotaProps {
  currentCount: number;
  dailyLimit: number;
  platform?: string;
  size?: ComponentSize.SM | ComponentSize.MD | ComponentSize.LG;
  showLabel?: boolean;
}
