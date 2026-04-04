import type { IIngredient } from '@cloud/interfaces';
import type {
  MenuConfig,
  MenuItemConfig,
} from '@cloud/interfaces/ui/menu-config.interface';
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
  brandRailMode?: 'hidden' | 'workspace';
  primaryAction?: MenuPrimaryActionConfig;
  secondaryItems?: MenuItemConfig[];
  showOrganizationSwitcher?: boolean;
}

export interface SidebarSizingProps {
  collapsedSidebarWidth?: number;
  mobileSidebarWidth?: number;
  sidebarWidth?: number;
}

export interface MenuSharedProps extends BaseMenuProps, SidebarSizingProps {
  config: MenuShellConfig;
  /** Renders content above the sidebar header and navigation */
  renderTopSlot?: () => ReactNode;
  /** Whether the sidebar is collapsed (Todoist-style) */
  isCollapsed?: boolean;
  /** Visual treatment for shared shell chrome */
  shellChromeVariant?: 'default' | 'transparent';
  /** Callback to toggle collapse state */
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
}

export interface MenuItemProps {
  badgeCount?: number;
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
