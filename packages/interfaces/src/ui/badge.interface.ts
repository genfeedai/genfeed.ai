import type { ComponentSize } from '@genfeedai/enums';
import type { ReactNode } from 'react';

export interface BadgeProps {
  className?: string;
  children?: ReactNode;
  icon?: ReactNode;
  value?: number | string;
  size?: ComponentSize.SM | ComponentSize.MD | ComponentSize.LG;
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
    | 'purple'
    | 'blue'
    | 'amber'
    | 'slate'
    | 'image'
    | 'video'
    | 'audio'
    | 'text'
    | 'multimodal'
    | 'validated'
    | 'operational';
  status?: string;
}
