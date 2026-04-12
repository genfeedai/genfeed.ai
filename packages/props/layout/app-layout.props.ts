import type { AppContext } from '@genfeedai/interfaces';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import type { TopbarProps } from '@props/navigation/topbar.props';
import type { ComponentType, ReactNode } from 'react';

export interface AppLayoutProps {
  children: ReactNode;
  bannerComponent?: ReactNode | null;
  menuComponent?: ReactNode | null;
  topbarComponent?: ComponentType<TopbarProps> | null;
  providers?: ReactNode;
  /** Visual treatment for shared shell chrome */
  shellChromeVariant?: 'default' | 'transparent';
  /** Visual treatment override for the topbar chrome */
  topbarChromeVariant?: 'inherit' | 'default' | 'transparent';
  /** Whether the page renders a secondary toolbar/header directly under the topbar */
  hasSecondaryTopbar?: boolean;
  /** Menu items for SidebarNavigationProvider (breadcrumbs, nested nav) */
  menuItems?: MenuItemConfig[];
  /** Agent panel rendered as a persistent right column */
  agentPanel?: ReactNode | null;
  /** Whether the agent panel is collapsed */
  isAgentCollapsed?: boolean;
  /** Toggle agent panel visibility */
  onAgentToggle?: () => void;
  /** Current app context for the AppSwitcher in the topbar */
  currentApp?: AppContext;
  /** Organization slug for the AppSwitcher in the topbar */
  orgSlug?: string;
  /** Brand slug for the AppSwitcher in the topbar */
  brandSlug?: string;
}
