import type { AppRailFeatureFlagKey } from '../../constants/feature-flags.constant';
import type { OrganizationModuleId } from '../../constants/organization-modules.constant';
import type { IconComponent } from '../../types/icon';
import type { AppContext, MenuItemConfig } from './menu-config.interface';

export type AdminRailCategoryId =
  | 'admin-overview'
  | 'admin-customers'
  | 'admin-content'
  | 'admin-automation'
  | 'admin-economics'
  | 'admin-platform';

/**
 * An Admin sidebar page. `category` is the rail icon that lists it; `group`
 * (inherited) is the header it sits under inside that category's sidebar.
 */
export interface AdminMenuItemConfig extends MenuItemConfig {
  category: AdminRailCategoryId;
  href: string;
}

export type AdminRailExitId = 'admin-back';

export type AppRailItemId = AppContext | AdminRailCategoryId | AdminRailExitId;

export interface AppRailItemConfig {
  id: AppRailItemId;
  icon: IconComponent;
  /** Translation keys relative to common.appRail. */
  label: string;
  description: string;
  /** `daily` is the fixed core loop; `app` entries open from the Apps launcher. */
  /** `admin-category` entries replace the app loop while the admin chrome is up. */
  /** `admin-exit` is the back button that leaves the admin chrome. */
  group: 'daily' | 'app' | 'admin' | 'admin-category' | 'admin-exit';
  activePathRoots: readonly string[];
  visibilityFlagKey?: AppRailFeatureFlagKey;
  organizationModule?: OrganizationModuleId;
  isBrandAware?: boolean;
  /**
   * Admin chrome only: the superadmin section. Its icons sit below a divider
   * at the bottom of the rail, apart from the day-to-day categories.
   */
  isAdminSecondary?: boolean;
  route: (orgSlug: string, brandSlug?: string) => string;
}

export interface AppRailScopedRouteOptions {
  brandPath: string;
  organizationPath?: string;
}

export interface AppRailScope {
  orgSlug: string;
  brandSlug?: string;
  brandAwareSlug?: string;
  preservedSearch?: string;
}

export type AppRailSurface = 'desktop' | 'drawer';
export type AppRailNavigationVia = 'click' | 'shortcut' | 'palette';

export interface AppRailNavigationEvent {
  from_app: AppRailItemId | null;
  to_app: AppRailItemId;
  via: AppRailNavigationVia;
  surface: AppRailSurface;
}

/** A member moved an app to a new place on the rail. Positions are 0-based. */
export interface AppRailReorderEvent {
  app: AppRailItemId;
  from_index: number;
  to_index: number;
  surface: AppRailSurface;
}

/** Localized, resolved entries shared by links, commands, and shortcuts. */
export interface AppRailNavigationItem {
  app: AppRailItemConfig;
  href: string;
  announcement?: string;
  label: string;
  description: string;
  shortcut?: string[];
  isLocked: boolean;
}

export interface AppRailCommandsOptions {
  items: readonly AppRailNavigationItem[];
  commandLabel: (label: string) => string;
  navigate: (item: AppRailNavigationItem) => void;
  surface: AppRailSurface;
}
