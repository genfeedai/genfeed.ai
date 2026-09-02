import type { AppContext } from '@genfeedai/contracts/interfaces';
import type { MenuItemConfig } from '@genfeedai/contracts/interfaces/ui/menu-config.interface';
import type { WorkspaceShellBreadcrumbMetadata } from '@genfeedai/contracts/interfaces/ui/workspace-shell.interface';
import type { TopbarProps } from '@props/navigation/topbar.props';
import type { ComponentType, ReactNode } from 'react';

export interface AppLayoutProps {
  children: ReactNode;
  bannerComponent?: ReactNode | null;
  menuComponent?: ReactNode | null;
  topbarComponent?: ComponentType<TopbarProps> | null;
  providers?: ReactNode;
  /** Menu items for SidebarNavigationProvider (breadcrumbs, nested nav) */
  menuItems?: MenuItemConfig[];
  /** Canonical route breadcrumb, independent of sidebar discovery coverage. */
  breadcrumb?: WorkspaceShellBreadcrumbMetadata;
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
