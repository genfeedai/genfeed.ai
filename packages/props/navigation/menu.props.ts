import type { AppContext, IIngredient } from '@genfeedai/interfaces';
import type {
  MenuConfig,
  MenuItemConfig,
} from '@genfeedai/interfaces/ui/menu-config.interface';
import type { ComponentType, ReactNode } from 'react';

/**
 * Base menu props shared across menu components
 */
export interface BaseMenuProps {
  onClose?: () => void;
}

interface MenuPrimaryActionConfigBase {
  label: string;
  icon?: ReactNode;
  outline?: ComponentType<{ className?: string }>;
  solid?: ComponentType<{ className?: string }>;
}

export type MenuPrimaryActionConfig =
  | (MenuPrimaryActionConfigBase & {
      href: string;
      onClick?: never;
    })
  | (MenuPrimaryActionConfigBase & {
      href?: undefined;
      onClick: () => void;
    });

export interface MenuShellConfig extends MenuConfig {
  primaryAction?: MenuPrimaryActionConfig;
  secondaryItems?: MenuItemConfig[];
}

/**
 * A module's own nav column. When a module supplies one, the sidebar renders
 * this body in place of that surface's menu items — the conversation swaps in
 * its thread list, and Library → collections / Workflows → runs use the same
 * seam. One module owns the column at a time; the surface it belongs to still
 * owns the logo, section label and switchers around it.
 */
export interface SidebarNavPanel {
  render: () => ReactNode;
  /** Overrides the surface's own label while the panel is mounted. */
  sectionLabel?: string;
}

export interface SidebarSizingProps {
  collapsedSidebarWidth?: number;
  mobileSidebarWidth?: number;
  sidebarWidth?: number;
}

export interface MenuSharedProps extends BaseMenuProps, SidebarSizingProps {
  config: MenuShellConfig;
  /** Product app context for menu shell chrome */
  currentApp?: AppContext;
  /** Renders content above the sidebar header and navigation */
  renderTopSlot?: () => ReactNode;
  /** Whether the sidebar is collapsed (Todoist-style) */
  isCollapsed?: boolean;
  /** Toggles the desktop sidebar from its unified header control. */
  onToggleCollapse?: () => void;
  /** When false, primary actions are not rendered above the sidebar body */
  showPrimaryItems?: boolean;
  /** Replaces the default body (search + grouped items + setup card) with custom content */
  renderBody?: () => ReactNode;
  /** Renders additional content after the grouped navigation items, inside the scrollable area */
  renderAfterNavigation?: () => ReactNode;
  /** Shows a `← backLabel` row at the top of navigation linking to this href */
  backHref?: string;
  /** Label shown next to the back arrow (e.g. "Settings", "Studio") */
  backLabel?: string;
  /** Overrides the default "Workspace" section label */
  sectionLabel?: string;
  /** Action buttons to render inline with the Conversations collapsible header */
  conversationActions?: ReactNode;
  /** Renders content in the sidebar footer, above the user profile row */
  renderFooterSlot?: () => ReactNode;
  /** Shows the signed-in user profile footer in the sidebar */
  showUserProfile?: boolean;
  /** Renders the organization switcher above `renderTopSlot`, at the very top of the sidebar body */
  orgSwitcherSlot?: ReactNode;
}

export interface MenuItemProps {
  badgeCount?: number;
  /**
   * Neutral trailing count (Library shelf sizes). Distinct from `badgeCount`,
   * which renders an error badge and means "this needs your attention".
   */
  count?: number;
  /** Animates the icon — used while a shelf still has work in flight. */
  isPulsing?: boolean;
  href?: string;
  label: string;
  icon?: ReactNode;
  outline?: ComponentType<{ className?: string }>;
  solid?: ComponentType<{ className?: string }>;
  isActive?: boolean;
  isComingSoon?: boolean;
  onClick?: () => void;
  chevronIcon?: ReactNode;
  variant?: 'default' | 'icon';
  isCollapsed?: boolean;
}

export interface MenuLabelProps {
  label: string;
  icon?: ReactNode;
  outline?: ComponentType<{ className?: string }>;
  solid?: ComponentType<{ className?: string }>;
  isActive?: boolean;
  onClick?: () => void;
  chevronIcon?: ReactNode;
}

export interface LatestIngredientItemProps {
  ingredient: IIngredient;
  isProcessing?: boolean;
}
