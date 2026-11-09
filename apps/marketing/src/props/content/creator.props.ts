import type { CreatorProfileTab } from '@genfeedai/contracts/constants';
import type { Article } from '@models/content/article.model';
import type { Post } from '@models/content/post.model';
import type { Brand } from '@models/organization/brand.model';
import type { CreatorPostMediaItem } from '@web-components/creator/post-media';
import type { ReactNode } from 'react';

export interface CopyLinkButtonProps {
  /** Layout only (width, alignment); the button owns its look. */
  className?: string;
  url: string;
}

/** `null` is the "All" view; a tab narrows the grid to one kind. */
export type CreatorProfileView = CreatorProfileTab | null;

export interface CreatorRouteParams {
  handle: string;
}

export interface CreatorRouteProps {
  params: Promise<CreatorRouteParams>;
}

export interface CreatorTabRouteProps extends CreatorRouteProps {
  searchParams: Promise<{ page?: string }>;
}

export interface CreatorPostRouteProps {
  params: Promise<CreatorRouteParams & { id: string }>;
}

export interface CreatorTabCounts {
  articles: number;
  images: number;
  posts: number;
  videos: number;
}

export interface CreatorRailProps {
  brand: Brand;
  counts: CreatorTabCounts;
  handle: string;
  profileUrl: string;
  referralCode: string | null;
}

export interface CreatorTabsProps {
  active: CreatorProfileView;
  counts: CreatorTabCounts;
  handle: string;
}

export interface CreatorProfileLayoutProps {
  active: CreatorProfileView;
  brand: Brand;
  children: ReactNode;
  counts: CreatorTabCounts;
  handle: string;
  referralCode: string | null;
}

export interface CreatorSectionProps {
  children: ReactNode;
  /** Where "See all" goes; omitted inside the section's own tab. */
  href?: string;
  title: string;
  total: number;
}

export interface CreatorArticleCardProps {
  article: Article;
  /** The profile the card sits on; otherwise read from the article's brand. */
  handle?: string;
  /** Shows whose article it is, for listings that mix creators. */
  isBylineVisible?: boolean;
}

export interface CreatorArticleGridProps {
  articles: Article[];
  handle?: string;
  isBylineVisible?: boolean;
}

export interface CreatorPostCardProps {
  handle: string;
  post: Post;
}

export interface CreatorPostMediaProps {
  /** Alternative text for every item: the post's title. */
  alt: string;
  media: CreatorPostMediaItem[];
}

export interface CreatorPostGridProps {
  handle: string;
  posts: Post[];
}

export interface ProfileSubscribeProps {
  brandId: string;
}

export interface CommunityCreatorCardProps {
  brand: Brand;
}
