export interface AppRailNavigationTarget {
  announcement?: string;
  href: string;
}

/** Count pill on one rail item, e.g. unread Messages conversations. */
export interface AppRailBadge {
  count: number;
  /** Accessible description of the count, already localized. */
  label: string;
}

export interface AppRailProps {
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
  /** Called when an app link is activated, e.g. to close the mobile drawer. */
  onNavigate?: () => void;
  orgSlug: string;
  preservedSearch?: string;
  /** Application-owned resolver for trusted shell launches. */
  resolveNavigation?: (href: string) => AppRailNavigationTarget;
  /** Include platform-admin navigation for users with platform access. */
  showAdmin?: boolean;
}
