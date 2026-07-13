import type { AppContext } from '@genfeedai/interfaces';

export interface AppSwitcherNavigationTarget {
  announcement?: string;
  href: string;
}

export interface AppSwitcherProps {
  /** Selected brand context used by brand-aware apps when the current route is org-scoped. */
  brandAwareSlug?: string;
  brandSlug?: string;
  currentApp: AppContext;
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
