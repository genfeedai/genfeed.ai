import type { AppContext } from '@genfeedai/interfaces';

export interface AppSwitcherProps {
  brandSlug?: string;
  currentApp: AppContext;
  currentPath?: string;
  orgSlug: string;
  preservedSearch?: string;
  /** Trigger style: compact grid icon (sidebar) or labeled section pill (topbar) */
  variant?: 'icon' | 'labeled';
}
