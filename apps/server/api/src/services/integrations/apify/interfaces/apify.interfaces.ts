/**
 * Apify API Interfaces
 *
 * Defines interfaces for Apify API responses and configuration.
 * Used by ApifyService for scraping social media trends.
 */

export interface ApifyActorRun {
  id: string;
  actId: string;
  status:
    | 'READY'
    | 'RUNNING'
    | 'SUCCEEDED'
    | 'FAILED'
    | 'ABORTING'
    | 'ABORTED'
    | 'TIMING-OUT'
    | 'TIMED-OUT';
  startedAt: string;
  finishedAt?: string;
  buildId: string;
  exitCode?: number;
  defaultKeyValueStoreId: string;
  defaultDatasetId: string;
  defaultRequestQueueId: string;
  usageTotalUsd?: number;
}

export interface ApifyActorRunResponse {
  data: ApifyActorRun;
}

/**
 * An Apify account (hosted token or a single organization's BYOK token) that
 * exhausted its plan usage. Every further call fails identically until the
 * owner raises the limit, so calls are held off until `suspendedUntilMs`.
 */
export interface ApifyAccountLimitSuspension {
  reason: string;
  suspendedUntilMs: number;
}

export interface TrendOptions {
  limit?: number;
  region?: string;
  timeframe?: '1h' | '6h' | '12h' | '24h' | '7d';
}

/**
 * Normalized trend data from Apify scrapers
 */
export interface ApifyTrendData {
  topic: string;
  platform: string;
  mentions: number;
  growthRate: number;
  viralityScore: number;
  metadata: {
    hashtags?: string[];
    urls?: string[];
    sampleContent?: string;
    engagementRate?: number;
    reach?: number;
    impressions?: number;
    thumbnailUrl?: string;
    trendType?: 'topic' | 'hashtag' | 'sound' | 'video' | 'creator';
    source: 'apify';
    [key: string]: unknown;
  };
}

/**
 * TikTok-specific trend data from Apify
 */
export interface ApifyTikTokVideo {
  id: string;
  /**
   * Caption, as returned by `clockworks/tiktok-scraper`. The actor emits this
   * under `text`; the raw TikTok web API field name (`desc`) is NOT what the
   * dataset carries, and reading it yielded an undefined caption on every item.
   */
  text?: string;
  createTime?: number;
  authorMeta?: {
    id?: string;
    name?: string;
    nickname?: string;
    avatar?: string;
    verified?: boolean;
    signature?: string;
  };
  musicMeta?: {
    musicId?: string;
    musicName?: string;
    musicAuthor?: string;
    playUrl?: string;
    coverUrl?: string;
    coverMediumUrl?: string;
    musicOriginal?: boolean;
    duration?: number;
  };
  videoMeta?: {
    coverUrl?: string;
    originalCoverUrl?: string;
    width?: number;
    height?: number;
    duration?: number;
  };
  diggCount?: number;
  shareCount?: number;
  playCount?: number;
  commentCount?: number;
  webVideoUrl?: string;
  mediaUrls?: string[];
  hashtags?: Array<{ id?: string; name?: string }>;
  /** The search query that returned this item, when scraped via `searchQueries`. */
  searchQuery?: string;
}

/**
 * Twitter/X trend row from automation-lab/twitter-trends-scraper
 */
export interface ApifyTwitterTrend {
  name?: string;
  rank?: number;
  /** Approximate 24-hour post count; null when X does not publish it. */
  tweetVolume?: number | null;
  isHashtag?: boolean;
  isPromoted?: boolean;
  twitterSearchUrl?: string;
  countryCode?: string;
}

/**
 * Instagram trend data from Apify
 */
export interface ApifyInstagramPost {
  id: string;
  shortCode?: string;
  caption?: string;
  likesCount?: number;
  commentsCount?: number;
  videoViewCount?: number;
  imageUrl?: string;
  videoUrl?: string;
  ownerUsername?: string;
  timestamp?: string;
  hashtags?: string[];
  url?: string;
}

/**
 * LinkedIn profile post from Apify's `curious_coder/linkedin-profile-scraper`.
 *
 * The actor's exact output schema has not been confirmed against a live run
 * from this repo, so every field is optional and the caller (ApifySocialProvider)
 * reads through defensive helpers rather than trusting any single field name.
 */
export interface ApifyLinkedInPost {
  id?: string;
  urn?: string;
  url?: string;
  postUrl?: string;
  text?: string;
  commentary?: string;
  postedAt?: string;
  date?: string;
  publishedAt?: string;
  likesCount?: number;
  numLikes?: number;
  commentsCount?: number;
  numComments?: number;
  sharesCount?: number;
  numShares?: number;
  authorName?: string;
  authorFullName?: string;
  authorUrl?: string;
  imageUrl?: string;
  images?: string[];
  videoUrl?: string;
}

/**
 * Normalized video data for viral leaderboard
 */
export interface ApifyVideoData {
  externalId: string;
  platform: string;
  title?: string;
  description?: string;
  creatorHandle: string;
  creatorId?: string;
  thumbnailUrl?: string;
  videoUrl?: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  duration?: number;
  engagementRate: number;
  viralScore: number;
  velocity: number;
  publishedAt?: Date;
  hashtags: string[];
  soundId?: string;
  soundName?: string;
  soundPlayUrl?: string;
  soundCoverUrl?: string;
  soundAuthorName?: string;
  soundDuration?: number;
  hook?: string;
  /** Niche search query that surfaced this video (brand-scoped searches only). */
  nicheQuery?: string;
}

/**
 * Normalized hashtag data
 */
export interface ApifyHashtagData {
  platform: string;
  hashtag: string;
  postCount: number;
  postCountScope?: 'observed' | 'platform';
  growthMeasured?: boolean;
  viewCount: number;
  growthRate: number;
  viralityScore: number;
  relatedHashtags: string[];
}

/**
 * Normalized sound data (TikTok-specific)
 */
export interface ApifySoundData {
  platform: string;
  soundId: string;
  soundName: string;
  authorName?: string;
  coverUrl?: string;
  playUrl?: string;
  usageCount: number;
  growthRate: number;
  viralityScore: number;
  duration?: number;
  usageCountScope?: 'observed';
  examples?: ApifyVideoData[];
}

/**
 * Raw Instagram comment data from Apify scraper
 */
export interface ApifyInstagramComment {
  id: string;
  text: string;
  ownerUsername?: string;
  ownerId?: string;
  ownerProfilePicUrl?: string;
  timestamp?: string;
  likesCount?: number;
  repliesCount?: number;
  postId?: string;
  postShortCode?: string;
}

/**
 * Normalized Instagram comment for reply bot system
 */
export interface ApifyNormalizedInstagramComment {
  id: string;
  text: string;
  authorId: string;
  authorUsername: string;
  authorAvatarUrl?: string;
  createdAt: Date;
  postId: string;
  postShortCode?: string;
  metrics?: {
    likes: number;
    replies: number;
  };
}

/**
 * Raw TikTok comment data from Apify scraper
 */
export interface ApifyTikTokComment {
  id?: string;
  cid?: string;
  text: string;
  createTime?: number;
  user?: {
    id?: string;
    uniqueId?: string;
    nickname?: string;
    avatarThumb?: string;
    verified?: boolean;
  };
  diggCount?: number;
  replyCommentTotal?: number;
  videoId?: string;
}

/**
 * Normalized TikTok comment for reply bot system
 */
export interface ApifyNormalizedTikTokComment {
  id: string;
  text: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName?: string;
  authorAvatarUrl?: string;
  isVerified?: boolean;
  createdAt: Date;
  videoId: string;
  metrics?: {
    likes: number;
    replies: number;
  };
}
