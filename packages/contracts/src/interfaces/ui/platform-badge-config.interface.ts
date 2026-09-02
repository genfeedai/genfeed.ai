import type { ComponentType } from 'react';

export interface IPlatformBadgeConfig {
  icon: ComponentType<{ className?: string }>;
  label: string;
  bgColor: string;
  textColor: string;
  iconColor: string;
}
