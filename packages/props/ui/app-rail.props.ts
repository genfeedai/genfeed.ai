import type {
  OrganizationModuleAccess,
  OrganizationModuleId,
  OrganizationModulePreferences,
} from '@genfeedai/contracts/constants';
import type {
  AppRailItemConfig,
  AppRailNavigationEvent,
  AppRailNavigationItem,
  AppRailNavigationVia,
  AppRailSurface,
} from '@genfeedai/contracts/interfaces/ui/app-rail.interface';
import type { ReactNode } from 'react';

export interface AppRailNavigationTarget {
  announcement?: string;
  href: string;
}

/** Count pill on one rail item, e.g. unread Messages conversations. */
export interface AppRailBadge {
  count: number;
  kind?: 'count' | 'dot';
  /** Accessible description of the count, already localized. */
  label: string;
}

export interface AppRailProps {
  /** Verified organization preferences for the daily loop. Null waits for settings; undefined is a neutral reusable surface. */
  modulePreferences?: OrganizationModulePreferences | null;
  /**
   * Organization access per module for launcher apps (#5502). Null waits for
   * settings, so launcher apps stay hidden; undefined is a neutral surface.
   */
  moduleAccess?: Readonly<
    Partial<Record<OrganizationModuleId, OrganizationModuleAccess>>
  > | null;
  /** The member's installed apps here. Undefined is a neutral surface. */
  installedAppIds?: readonly string[];
  surface?: AppRailSurface;
  onNavigationEvent?: (event: AppRailNavigationEvent) => void;
  /** Count pills keyed by app id; a missing or zero count renders nothing. */
  badges?: Readonly<Partial<Record<string, AppRailBadge>>>;
  /** Selected brand context used by brand-aware apps when the current route is org-scoped. */
  brandAwareSlug?: string;
  brandSlug?: string;
  /** Full pathname used to highlight the app whose product root owns the route. */
  currentPath?: string;
  /**
   * First-asset unlock gate. When true, the gated sections (workspace, library,
   * analytics) render a lock affordance and route to the agent instead of the
   * section. Passed down from the app shell's access state.
   */
  isAssetGateLocked?: boolean;
  /**
   * Onboarding hold. Rail items and the account footer stop navigating until
   * the conversation finishes. Collapse controls live outside this rail.
   */
  isNavigationSuspended?: boolean;
  /** Pinned above the apps, e.g. the organization avatar (Slack workspace icon). */
  header?: ReactNode;
  /** Pinned at the very bottom, below Admin: Help and the account avatar. */
  footer?: ReactNode;
  /** Called when an app link is activated, e.g. to close the mobile drawer. */
  onNavigate?: () => void;
  orgSlug: string;
  preservedSearch?: string;
  /** Application-owned resolver for trusted shell launches. */
  resolveNavigation?: (href: string) => AppRailNavigationTarget;
  /** Admin chrome: the rail lists admin categories instead of the app loop. */
  isAdminChrome?: boolean;
  /** Include platform-admin navigation for users with platform access. */
  showAdmin?: boolean;
  /**
   * Launcher apps the signed-in user pinned onto the rail, in pin order.
   * Unknown, uninstalled and unavailable ids are ignored.
   */
  pinnedAppIds?: readonly string[];
}

export interface TopbarAppsLinkProps {
  /** Falls back to the organization resolved from the URL. */
  orgSlug?: string;
}

export interface AppRailItemProps {
  app: AppRailItemConfig;
  badge?: AppRailBadge;
  href: string;
  isActive: boolean;
  isLocked: boolean;
  isNavigationSuspended?: boolean;
  label: string;
  description: string;
  shortcut?: string[];
  onNavigateStart: () => void;
}

export interface UseAppRailNavigationOptions {
  items: readonly AppRailNavigationItem[];
  surface: AppRailSurface;
  isDesktop: boolean;
  isSuspended?: boolean;
  commandLabel: (label: string) => string;
  navigate: (item: AppRailNavigationItem, via: AppRailNavigationVia) => void;
}

export interface AppProtectedRailProps {
  brandSlug?: string;
  isAdminChrome?: boolean;
  /** Injected by AppLayout into the drawer copy. */
  onNavigate?: () => void;
  orgSlug?: string;
}
