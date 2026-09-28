import type { ReactNode } from 'react';

/**
 * One fact on a record detail page's fact line (post, agent, campaign). A
 * fact with an empty `value` is omitted, never shown as a "Set…" placeholder.
 */
export interface RecordFact {
  id: string;
  label: string;
  value?: ReactNode;
}

export interface RecordFactLineProps {
  /** Every known fact for the record; empty values are filtered out. */
  facts: RecordFact[];
  /** Facts shown inline before the "All details" disclosure. Defaults to 6. */
  maxVisible?: number;
  className?: string;
  'data-testid'?: string;
}
