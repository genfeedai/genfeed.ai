import type { ContextSidebarSelectionKind } from '@genfeedai/props/ui/context-sidebar.props';
import type { SummaryFact } from '@genfeedai/props/ui/display/table-row-summary.props';
import type { ReactNode } from 'react';

/**
 * Configuration for a table's record summary in the right context sidebar:
 * badges, facts (editable in place when a fact carries an `editor`) and an
 * optional link to the detail page.
 */
export interface SummaryRowSidebarConfig<T> {
  /** Drives the sidebar chrome; use the kind that best names the entity. */
  kind: ContextSidebarSelectionKind;
  getId: (item: T) => string;
  getTitle: (item: T) => string;
  getSubtitle?: (item: T) => string | undefined;
  getBadges?: (item: T) => ReactNode;
  /** Known facts for the record; empty read-only values are omitted. */
  getFacts?: (item: T) => SummaryFact[];
  /** Detail page of the record. Omit when the record has no page. */
  getOpenHref?: (item: T) => string | undefined;
  openLabel?: string;
  /** Extra detail below the facts (panels, previews). */
  renderExtra?: (item: T) => ReactNode;
}
