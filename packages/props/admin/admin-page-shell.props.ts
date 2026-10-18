import type { IconComponent } from '@genfeedai/contracts/types/icon';
import type { TabsProps } from '@props/ui/navigation/tabs.props';
import type { ReactNode } from 'react';

/**
 * Admin page chrome. Every admin page puts its title in the shell breadcrumb
 * and its controls in the subbar, in one fixed order: refresh, download, the
 * dropdowns (org filter first), then the primary CTA last. Slots instead of a
 * free-form `right` node, so a page cannot reorder them.
 */
export interface AdminPageShellProps {
  /** Screen-reader title; the breadcrumb is the only visible page title. */
  title: string;
  icon?: IconComponent;
  /** Left of the subbar: search first, then filter popovers or toggles. */
  search?: ReactNode;
  filters?: ReactNode;
  /** Local sibling navigation (e.g. asset types). Sits after refresh. */
  tabs?: TabsProps;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  /** Ghost download / export button, directly after refresh. */
  download?: ReactNode;
  /** Dropdown filters such as the organization picker. */
  dropdowns?: ReactNode;
  /** The page's single primary action; always the last control. */
  primaryAction?: ReactNode;
  children: ReactNode;
}

export interface AdminDownloadButtonProps {
  label: string;
  onClick: () => void;
  isDisabled?: boolean;
}
