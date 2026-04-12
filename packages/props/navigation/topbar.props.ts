import type { AppContext } from '@genfeedai/interfaces';

export interface TopbarProps {
  showMountCheck?: boolean;
  onMenuToggle?: () => void;
  isMenuOpen?: boolean;
  /** Whether the agent panel is collapsed */
  isAgentCollapsed?: boolean;
  /** Toggle agent panel visibility */
  onAgentToggle?: () => void;
  /** Current app context for the AppSwitcher */
  currentApp?: AppContext;
  /** Organization slug for the AppSwitcher */
  orgSlug?: string;
  /** Brand slug for the AppSwitcher */
  brandSlug?: string;
}

export interface TopbarLogoProps {
  logoHref: string;
}
