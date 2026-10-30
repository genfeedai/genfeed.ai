import type { ReactNode } from 'react';

/**
 * The controls cluster of a subbar, in the one order every page uses:
 * dropdowns, the Filters menu, the view switcher, then the primary action.
 * Refresh and ghost actions have their own slots on the bar and never go here.
 */
export interface SubbarControlsProps {
  /** Dropdown filters that are not facets of the Filters menu, such as the organization picker. */
  dropdowns?: ReactNode;
  /** A Filters menu on a page without a search field; with a search, the menu sits inside it. */
  filters?: ReactNode;
  /** The view switcher (grid, list, table). */
  views?: ReactNode;
  /** The page's single primary action; always the last control. */
  primaryAction?: ReactNode;
}
