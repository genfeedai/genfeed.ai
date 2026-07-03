import type { AppContext } from '@genfeedai/interfaces';

export interface AppSwitcherProps {
  brandSlug?: string;
  currentApp: AppContext;
  currentPath?: string;
  orgSlug: string;
  preservedSearch?: string;
  /** Include platform-admin navigation for users with platform access. */
  showAdmin?: boolean;
  /** Trigger style: compact grid icon (sidebar) or labeled section pill (topbar) */
  variant?: 'icon' | 'labeled';
}
