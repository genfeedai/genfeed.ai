import type { AppContext } from '@genfeedai/interfaces';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import type { WorkspaceShellBreadcrumbMetadata } from '@genfeedai/interfaces/ui/workspace-shell.interface';
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
  /** Canonical route breadcrumb, independent of sidebar discovery coverage. */
  breadcrumb?: WorkspaceShellBreadcrumbMetadata;
  /** Agent panel rendered as a persistent bottom terminal dock */
  agentPanel?: ReactNode | null;
  /** Whether the agent panel is collapsed */
  isAgentCollapsed?: boolean;
  /** Toggle agent panel visibility */
  onAgentToggle?: () => void;
  /** Product app context for shell chrome / breadcrumb fallbacks */
  currentApp?: AppContext;
  /** Organization slug for tenant-scoped shell chrome */
  orgSlug?: string;
  /** Brand slug for tenant-scoped shell chrome */
  brandSlug?: string;
  /** Enables geometry and landmarks scoped to the conversation workspace. */
  isWorkspaceShell?: boolean;
  /**
   * Full-viewport app surfaces (agent conversation): lock the shell to the
   * viewport so the shell banner and page share one height budget. Without
   * this, a `min-h-[100vh-…]` page under the credits banner overflows and
   * creates a document scrollbar on top of the thread scroller.
   */
  lockViewportHeight?: boolean;
}
