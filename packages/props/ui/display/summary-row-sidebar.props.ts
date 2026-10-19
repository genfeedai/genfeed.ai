import type { ContextSidebarSelectionKind } from '@genfeedai/props/ui/context-sidebar.props';
import type { RecordFact } from '@genfeedai/props/ui/record-detail/record-fact-line.props';
import type { ReactNode } from 'react';

/**
 * Configuration for a table's read-only record summary in the right context
 * sidebar: badges, facts, an optional link to the detail page and an optional
 * Edit action that opens the table's existing form.
 */
export interface SummaryRowSidebarConfig<T> {
  /** Drives the sidebar chrome; use the kind that best names the entity. */
  kind: ContextSidebarSelectionKind;
  getId: (item: T) => string;
  getTitle: (item: T) => string;
  getSubtitle?: (item: T) => string | undefined;
  getBadges?: (item: T) => ReactNode;
  /** Known facts for the record; empty values are omitted. */
  getFacts?: (item: T) => RecordFact[];
  /** Detail page of the record. Omit when the record has no page. */
  getOpenHref?: (item: T) => string | undefined;
  openLabel?: string;
  /** Extra detail below the facts (panels, previews). */
  renderExtra?: (item: T) => ReactNode;
  /** Opens the table's existing edit form for the record. */
  onEdit?: (item: T) => void;
  /** Hides Edit for records the viewer may not edit. Defaults to editable. */
  canEdit?: (item: T) => boolean;
  editLabel?: string;
}

export interface SummaryRowEditButtonProps {
  /** Translated Edit label; defaults to the shared `ui.rowSidebar.edit`. */
  label?: string;
  onClick: () => void;
}
