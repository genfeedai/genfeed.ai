export interface AppSwitcherNavigationTarget {
  announcement?: string;
  href: string;
}

/** Count pill on one app tile, e.g. unread Messages conversations. */
export interface AppSwitcherBadge {
  count: number;
  /** Accessible description of the count, already localized. */
  label: string;
}

export interface AppSwitcherProps {
  /** Count pills keyed by app id; a missing or zero count renders nothing. */
  badges?: Readonly<Partial<Record<string, AppSwitcherBadge>>>;
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
  orgSlug: string;
  preservedSearch?: string;
  /** Application-owned resolver for trusted shell launches. */
  resolveNavigation?: (href: string) => AppSwitcherNavigationTarget;
  /** Include platform-admin navigation for users with platform access. */
  showAdmin?: boolean;
  /** Trigger style: compact grid icon (sidebar) or labeled section pill (topbar) */
  variant?: 'icon' | 'labeled';
}
