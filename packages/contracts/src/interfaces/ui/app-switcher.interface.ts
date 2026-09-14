import type { IconComponent } from '../../types/icon';
import type { AppContext } from './menu-config.interface';

export interface AppSwitcherItemConfig {
  id: AppContext;
  icon: IconComponent;
  label: string;
  route: (orgSlug: string, brandSlug?: string) => string;
}
