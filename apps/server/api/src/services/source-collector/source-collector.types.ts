import type { SocialSourcePlatform } from '@genfeedai/contracts';

/**
 * Provider-agnostic post collected for Following / social sources.
 * Maps cleanly into SocialMonitor SocialContentData / sourcePost rows.
 */
export type CollectedSourcePost = {
  id: string;
  text: string;
  platform: SocialSourcePlatform | string;
  authorId?: string;
  authorUsername?: string;
  authorDisplayName?: string;
  authorAvatarUrl?: string;
  authorFollowersCount?: number;
  contentType?: string;
  contentUrl?: string;
  createdAt?: Date;
  mediaUrls?: string[];
  thumbnailUrl?: string;
  inReplyToId?: string | null;
  isRepost?: boolean;
  metrics?: {
    likes?: number;
    comments?: number;
    shares?: number;
    views?: number;
    /** Official own-account insights; absent for public/scraped timelines. */
    impressions?: number;
    reach?: number;
    saves?: number;
  };
  hashtags?: string[];
};

export type SourceCollectContext = {
  organizationId?: string;
  brandId?: string;
  /**
   * Which of the brand's accounts to collect as. A brand may hold several
   * accounts on one platform; omitted collects as the brand's default account.
   */
  credentialId?: string;
  limit?: number;
  sinceId?: string;
  /** Oldest publish date to collect; providers stop paginating past it. */
  since?: Date;
  includeReplies?: boolean;
  includeReposts?: boolean;
};

export type SourceCollectResult = {
  posts: CollectedSourcePost[];
  /** Which provider fulfilled the request */
  provider: 'brand-oauth' | 'app-bearer' | 'apify' | 'social-monitor' | 'none';
  platform: SocialSourcePlatform | string;
  handle: string;
};

export type SourceProviderName =
  | 'brand-oauth'
  | 'app-bearer'
  | 'apify'
  | 'social-monitor';
