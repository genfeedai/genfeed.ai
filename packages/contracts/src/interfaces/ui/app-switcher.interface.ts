import type { ComponentType } from 'react';
import type { AppContext } from './menu-config.interface';

export interface AppSwitcherItemConfig {
  id: AppContext;
  icon: ComponentType<{ className?: string }>;
  label: string;
  route: (orgSlug: string, brandSlug?: string) => string;
}
