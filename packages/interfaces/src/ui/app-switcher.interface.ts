import type { AppContext } from './menu-config.interface';

export interface AppConfig {
  id: AppContext;
  icon: string;
  label: string;
  route: (orgSlug: string, brandSlug?: string) => string;
}
