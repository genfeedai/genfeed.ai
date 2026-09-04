import type { ComponentType, ReactNode } from 'react';

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
  /** Optional muted one-line subtitle, hidden on narrow widths */
  subtitle?: string;
  /** Optional leading icon next to the title */
  icon?: ComponentType<{ className?: string }>;
  /** Right-aligned controls (refresh, filters, view toggles) */
  actions?: ReactNode;
  /** Left-aligned non-tab navigation, such as a semantic back link */
  leading?: ReactNode;
  /** Tab strip rendered inside the bordered bar (or same row when title is chrome-only) */
  tabs?: ReactNode;
  /**
   * Title chrome visibility.
   * - `auto` (default): hide when shell breadcrumb owns page identity
   * - `sr-only`: force chrome-only title (tabs/actions single row)
   * - `visible`: always show the title row
   */
  titleVisibility?: 'auto' | 'visible' | 'sr-only';
  className?: string;
}
