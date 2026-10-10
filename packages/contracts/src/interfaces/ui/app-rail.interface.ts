import type {
  AppRailFeatureFlagKey,
  PlatformStudioFlagKey,
} from '../../constants/feature-flags.constant';
import type { OrganizationModuleId } from '../../constants/organization-modules.constant';
import type { IconComponent } from '../../types/icon';
import type { AppContext } from './menu-config.interface';

export interface AppRailItemConfig {
  id: AppContext;
  icon: IconComponent;
  /** Translation keys relative to common.appRail. */
  label: string;
  description: string;
  /** `daily` is the fixed core loop; `app` entries open from the Apps launcher. */
  group: 'daily' | 'app' | 'admin';
  activePathRoots: readonly string[];
  visibilityFlagKey?: AppRailFeatureFlagKey;
  /** Platform switch for one Studio surface, under the `studio` module flag. */
  surfaceFlagKey?: PlatformStudioFlagKey;
  organizationModule?: OrganizationModuleId;
  isBrandAware?: boolean;
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
  from_app: AppContext | null;
  to_app: AppContext;
  via: AppRailNavigationVia;
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
