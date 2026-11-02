export type ContentFeedMedia = {
  kind: 'image' | 'video';
  url: string;
};

export type ContentFeedItem = {
  id: string;
  /** Platform key the post is made for, for example `twitter` or `instagram`. */
  platform: string;
  text: string;
  media: ContentFeedMedia[];
};

export type ContentFeedProps = {
  items: ContentFeedItem[];
  authorName: string;
  authorHandle?: string;
  authorAvatarUrl?: string;
  /** Replaces the per-post publishing status, for example "Preview". */
  statusLabel?: string;
  emptyMessage?: string;
  className?: string;
};
