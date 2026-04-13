import type { AppContext } from '@genfeedai/interfaces';

export interface AppSwitcherProps {
  brandSlug?: string;
  currentApp: AppContext;
  orgSlug: string;
  preservedSearch?: string;
}
