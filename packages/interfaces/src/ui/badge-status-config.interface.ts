import type { ReactNode } from 'react';

export type BadgeVariantType =
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

export interface IBadgeStatusConfig {
  variant: BadgeVariantType;
  icon?: ReactNode;
  label?: string;
  shouldSpin?: boolean;
}
