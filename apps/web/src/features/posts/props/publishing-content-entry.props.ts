import type { IIngredient } from '@genfeedai/contracts/interfaces';
import type { CollectionOverflowAction } from '@props/ui/collection/collection.props';
import type { ReactNode } from 'react';
import type { PublishingContentLibraryItem } from '@/features/posts/library/publishing-content-library.helpers';

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

/**
 * First media item of a Posts library row: the Library asset of a post, or the
 * resolved URL a release carries for its media.
 */
export type PublishingContentMedia =
  | { ingredient: IIngredient; isVideo: boolean }
  | { url: string; isVideo: boolean };

export interface PublishingContentThumbnailProps {
  media: PublishingContentMedia | null;
}

/** A row's status badge; its publish or schedule time shows on hover. */
export interface PublishingContentStatusProps {
  status: string;
  publishedAt?: string | null;
  scheduledAt?: string | null;
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
  /**
   * The row's first media item, shown as a thumbnail. `null` marks a text-only
   * post; leave it out where the list has no media to show.
   */
  media?: PublishingContentMedia | null;
  /** Tag for a non-plain format (thread, long post, video, article, newsletter). */
  format?: PublishingContentFormat;
  summary?: string;
  title: string;
  titleHref?: string;
}

/** When a post went out, or when it goes out, ready to show. */
export interface PublishingContentTime {
  date: Date;
  isPublished: boolean;
  label: string;
}

/** The first media item of a post, shown large on a board or grid card. */
export interface PublishingContentMediaPreviewProps {
  media: PublishingContentMedia;
}

export interface PublishingContentCardProps {
  item: PublishingContentLibraryItem;
  /** Canonical detail route the title links to. */
  titleHref: string;
  /**
   * A board card sits under its status column, so it shows the time on its
   * own; a grid card shows the status badge with the time on hover.
   */
  isStatusShown: boolean;
  /** The card's labelled action and overflow menu. */
  actions: ReactNode;
  /** Opens the post's drawer; the card runs it on a click outside its links and buttons. */
  onOpen: (item: PublishingContentLibraryItem) => void;
}

/** One status column of the Posts board. */
export interface PublishingContentBoardColumn {
  items: PublishingContentLibraryItem[];
  label: string;
  status: string;
}

export interface PublishingContentBoardProps {
  columns: PublishingContentBoardColumn[];
  renderCard: (item: PublishingContentLibraryItem) => ReactNode;
}
