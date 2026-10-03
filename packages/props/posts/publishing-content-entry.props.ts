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

/** A non-plain format worth a tag on a row; plain posts carry none. */
export type PublishingContentFormat =
  | 'thread'
  | 'long-post'
  | 'video'
  | 'article'
  | 'newsletter';

/** One target account of a row, rendered as an avatar with a platform badge. */
export interface PublishingContentAccount {
  avatarUrl?: string | null;
  id: string;
  label: string;
  platform: string;
}

export interface PublishingContentChannelsProps {
  /** Target accounts; shown as avatars when known, else platform icons. */
  accounts?: PublishingContentAccount[];
  channels: string[];
}

export interface PublishingContentIdentityProps
  extends PublishingContentChannelsProps {
  /** Tag for a non-plain format (thread, long post, video, article, newsletter). */
  format?: PublishingContentFormat;
  summary?: string;
  title: string;
  titleHref?: string;
}
