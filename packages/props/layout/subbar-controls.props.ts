import type { ReactNode } from 'react';

/**
 * The controls cluster of a subbar, in the one order every page uses:
 * secondary actions, the Filters menu, the view switcher, the date range, then
 * the primary action. Refresh and ghost actions have their own slots on the bar
 * and never go here, and a filter dropdown (organization, brand, environment)
 * is a facet of the Filters menu, never a control of its own.
 */
export interface SubbarControlsProps {
  /** Actions that are not the primary one, such as a bulk "Move selected" or a sync menu. Never a filter. */
  secondaryActions?: ReactNode;
  /** A Filters menu on a page without a search field; with a search, the menu sits inside it. */
  filters?: ReactNode;
  /** The view switcher (grid, list, table). */
  views?: ReactNode;
  /** The page's date range picker; every metric on the page follows it. */
  dateRange?: ReactNode;
  /** The page's single primary action; always the last control. */
  primaryAction?: ReactNode;
}
