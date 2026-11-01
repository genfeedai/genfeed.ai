import type { TabsProps } from '@genfeedai/contracts/interfaces';
import type { IconComponent } from '@genfeedai/contracts/types/icon';
import type { ReactNode } from 'react';

/**
 * Admin page chrome. Every admin page puts its title in the shell breadcrumb
 * and its controls in the subbar, in one fixed order: refresh, download, then
 * the `SubbarControls` cluster (the dropdowns, org filter first, the one
 * Filters menu, the view switcher, the primary CTA last). Slots instead of a
 * free-form `right` node, so a page cannot reorder them.
 */
export interface AdminPageShellProps {
  /** Screen-reader title; the breadcrumb is the only visible page title. */
  title: string;
  icon?: IconComponent;
  /** Left of the subbar: the persistent search field, with the Filters menu inside it. */
  search?: ReactNode;
  /** The Filters menu of a page without a search field; every filter dropdown is a facet of it. */
  filters?: ReactNode;
  /** Local sibling navigation (e.g. asset types). Sits after refresh. */
  tabs?: TabsProps;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  /** Ghost download / export button, directly after refresh. */
  download?: ReactNode;
  /** Dropdown filters such as the organization picker. */
  dropdowns?: ReactNode;
  /** List/grid view toggle, after the dropdowns and before the primary action. */
  views?: ReactNode;
  /** The page's single primary action; always the last control. */
  primaryAction?: ReactNode;
  children: ReactNode;
}

export interface AdminDownloadButtonProps {
  label: string;
  onClick: () => void;
  isDisabled?: boolean;
}
