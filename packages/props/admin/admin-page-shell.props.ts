import type { TabsProps } from '@genfeedai/contracts/interfaces';
import type { IconComponent } from '@genfeedai/contracts/types/icon';
import type { ReactNode } from 'react';

/**
 * Admin page chrome. Every admin page puts its title in the shell breadcrumb
 * and its controls in the subbar, in one fixed order: the "..." menu, refresh,
 * then the `SubbarControls` cluster (secondary actions, the one Filters menu,
 * the view switcher, the date range, the primary CTA last). Slots instead of a
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
  /** The "..." menu (`SubbarOverflowMenu`) with the page's download, export and import; the first control. */
  overflow?: ReactNode;
  /** Actions that are not the primary one (a sync menu, a bulk move). Filters never go here: they are facets of the Filters menu. */
  secondaryActions?: ReactNode;
  /** List/grid view toggle, after the Filters menu. */
  views?: ReactNode;
  /** The page's date range picker, after the views and before the primary action. */
  dateRange?: ReactNode;
  /** The page's single primary action; always the last control. */
  primaryAction?: ReactNode;
  children: ReactNode;
}
