import type { IconComponent } from '@genfeedai/contracts/types/icon';
import type { ReactNode } from 'react';

/**
 * Section topbar contract (reference: Studio's AssetControlsHeader).
 *
 * A full-bleed section header bar rendered as the first child of a page:
 * no outer margins or max-width cap, a `border-b border-border` that meets
 * the shell edges, a dense title row, and optional action/tab slots that
 * stay inside the bordered bar.
 */
export interface SectionTopbarProps {
  /** Section title, rendered as the page h1 */
  title: string;
  /** Optional leading icon next to the title */
  icon?: IconComponent;
  /** Right-aligned controls, filled through `SubbarControls`: Filters, views, date range, then the primary action */
  actions?: ReactNode;
  /**
   * The "..." menu (`SubbarOverflowMenu`): the page's secondary actions such
   * as download or import. The first control of the right cluster.
   */
  overflow?: ReactNode;
  /**
   * Refresh control, rendered right after the "..." menu and before the tabs
   * on every page so both always sit in the same place.
   */
  refresh?: ReactNode;
  /** Left-aligned non-tab navigation, such as a semantic back link */
  leading?: ReactNode;
  /**
   * Tab strip rendered inside the bordered bar. When the title is chrome-only
   * it joins the right cluster between Refresh and the controls; with a
   * visible title it sits on its own strip under the title row.
   */
  tabs?: ReactNode;
  /**
   * Title chrome visibility.
   * - `auto` (default): hide when shell breadcrumb owns page identity
   * - `sr-only`: force chrome-only title (tabs/actions single row)
   * - `visible`: always show the title row
   */
  titleVisibility?: 'auto' | 'visible' | 'sr-only';
  /**
   * Keep the bordered bar mounted even when title/leading/tabs/actions are
   * all empty on this render. `Container` sets this when a page has declared
   * (via `moduleChrome`) that it always uses this chrome, so a transient
   * empty state (loading, no results yet) doesn't drop the bar and cause it
   * to pop in once content appears.
   */
  forceVisible?: boolean;
  className?: string;
}
