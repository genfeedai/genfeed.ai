import type { AppContext } from '@genfeedai/contracts/interfaces';

export interface TopbarProps {
  showMountCheck?: boolean;
  onMenuToggle?: () => void;
  isMenuOpen?: boolean;
  /** Whether the desktop sidebar is collapsed */
  isSidebarCollapsed?: boolean;
  /** Toggle desktop sidebar collapsed state */
  onSidebarToggle?: () => void;
  /** Product app context for breadcrumb fallback labels (not switcher active state). */
  currentApp?: AppContext;
  /** Organization slug for tenant-scoped topbar controls */
  orgSlug?: string;
  /** Brand slug for tenant-scoped topbar controls */
  brandSlug?: string;
}

export interface TopbarLogoProps {
  logoHref: string;
  size?: 'compact' | 'default';
}
