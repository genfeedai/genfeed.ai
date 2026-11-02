import type { InlineFieldEditor } from '@genfeedai/props/ui/display/inline-field.props';
import type { RecordFact } from '@genfeedai/props/ui/record-detail/record-fact-line.props';
import type { ReactNode } from 'react';

/** A summary fact; with an `editor` it is edited in place. */
export interface SummaryFact extends RecordFact {
  editor?: InlineFieldEditor;
}

export interface TableRowSummaryProps {
  /** Status or type badges shown beside the "Open" link. */
  badges?: ReactNode;
  /** Extra detail below the facts (previews, history, actions). */
  children?: ReactNode;
  /**
   * Known facts for the record; empty read-only values are omitted, editable
   * facts always show so an empty value can be filled in.
   */
  facts?: SummaryFact[];
  /** Detail page of the record. Omit when the record has no page. */
  openHref?: string;
  openLabel?: string;
}
