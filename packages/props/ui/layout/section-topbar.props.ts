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
  /** Tab strip rendered inside the bordered bar, below the title row */
  tabs?: ReactNode;
  className?: string;
}
