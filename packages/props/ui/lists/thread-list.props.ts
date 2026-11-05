import type { CollectionOverflowAction } from '@genfeedai/props/ui/collection/collection.props';
import type { ReactNode } from 'react';

/** What the small icon before a thread's title says about it. */
export type ThreadListStatus = 'attention' | 'done' | 'idle';

/** Recency buckets a flat thread list groups its rows into. */
export type ThreadRecencyGroup = 'earlier' | 'last7Days' | 'today';

export interface ThreadListSectionProps {
  children: ReactNode;
  /** Starts folded, for sections the operator rarely needs (done, resolved). */
  isDefaultCollapsed?: boolean;
  itemCount: number;
  title: string;
  'data-testid'?: string;
}

export interface ThreadListRowProps {
  /** Accessible name of the row's ⋯ menu trigger. */
  actionsLabel?: string;
  /** Everything the ⋯ menu offers; the menu is left out when empty. */
  actions?: CollectionOverflowAction[];
  href: string;
  /** Replaces the status icon, for a thumbnail or an avatar. */
  leading?: ReactNode;
  status?: ThreadListStatus;
  /** Spoken name of the status icon, so the state is not colour alone. */
  statusLabel?: string | null;
  subtitle?: ReactNode;
  /** The right-hand date. Swapped for the ⋯ menu on hover or focus. */
  time?: ReactNode;
  title: string;
  'data-testid'?: string;
}

export interface ThreadListRecencySectionsProps<TItem> {
  getDate: (item: TItem) => string | Date | null | undefined;
  getKey: (item: TItem) => string;
  items: readonly TItem[];
  renderRow: (item: TItem) => ReactNode;
}
