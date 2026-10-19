import type { RecordFact } from '@genfeedai/props/ui/record-detail/record-fact-line.props';
import type { ReactNode } from 'react';

export interface TableRowSummaryProps {
  /** Status or type badges shown beside the "Open" link. */
  badges?: ReactNode;
  /** Extra detail below the facts (previews, history, actions). */
  children?: ReactNode;
  /** Known facts for the record; empty values are omitted. */
  facts?: RecordFact[];
  /** Detail page of the record. Omit when the record has no page. */
  openHref?: string;
  openLabel?: string;
}
