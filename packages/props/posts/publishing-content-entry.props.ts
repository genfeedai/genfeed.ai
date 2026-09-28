import type { CollectionOverflowAction } from '@props/ui/collection/collection.props';
import type { ReactNode } from 'react';

/** A Posts library entry renders as a list row or as a grid card. */
export type PublishingContentEntryLayout = 'row' | 'card';

export interface PublishingContentEntryProps {
  layout: PublishingContentEntryLayout;
  title: string;
  /** Canonical detail route the title links to. */
  titleHref: string;
  /** Destination channels, shown as a stacked icon group. */
  channels: string[];
  /** One line of known facts. Empty values are dropped before they get here. */
  facts: string[];
  status: string;
  statusLabel: string;
  /** The single visible action. */
  primaryAction?: ReactNode;
  /** Every other action; destructive ones sort last. */
  overflowActions?: CollectionOverflowAction[];
  /** Standalone social post id. Enables the Evaluate overflow action. */
  evaluationPostId?: string;
  evalScore?: number | null;
}

export interface PublishingContentChannelsProps {
  channels: string[];
}
