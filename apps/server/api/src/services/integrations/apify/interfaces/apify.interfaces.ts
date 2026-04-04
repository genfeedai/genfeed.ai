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
}

export interface ApifyActorRunResponse {
  data: ApifyActorRun;
}

export interface ApifyDatasetItem {
  [key: string]: unknown;
}

export interface ApifyDatasetResponse<T = ApifyDatasetItem> {
  data: T[];
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
export interface ApifyTikTokTrend {
  id?: string;
  title?: string;
  description?: string;
  hashtag?: string;
  videoCount?: number;
  viewCount?: number;
  coverUrl?: string;
  createTime?: number;
  isCommerce?: boolean;
}

export interface ApifyTikTokSound {
  id: string;
  title: string;
  authorName?: string;
  coverUrl?: string;
  playUrl?: string;
  duration?: number;
  videoCount?: number;
}

export interface ApifyTikTokVideo {
  id: string;
  desc?: string;
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
  };
  videoMeta?: {
    width?: number;
    height?: number;
    duration?: number;
  };
  diggCount?: number;
  shareCount?: number;
  playCount?: number;
  commentCount?: number;
  webVideoUrl?: string;
  hashtags?: Array<{ id?: string; name?: string }>;
}

/**
 * Twitter/X trend data from Apify
 */
export interface ApifyTwitterTrend {
  name: string;
  url?: string;
  tweetVolume?: number;
  category?: string;
  rank?: number;
  country?: string;
}

/**
 * Twitter/X tweet data from Apify scraper
 */
export interface ApifyTwitterTweet {
  id: string;
  id_str?: string;
  text: string;
  full_text?: string;
  created_at?: string;
  user?: {
    id_str?: string;
    screen_name?: string;
    name?: string;
    profile_image_url_https?: string;
    followers_count?: number;
    verified?: boolean;
  };
  in_reply_to_status_id_str?: string;
  in_reply_to_user_id_str?: string;
  in_reply_to_screen_name?: string;
  conversation_id_str?: string;
  retweet_count?: number;
  favorite_count?: number;
  reply_count?: number;
  quote_count?: number;
  entities?: {
    hashtags?: Array<{ text: string }>;
    urls?: Array<{ expanded_url: string }>;
    user_mentions?: Array<{ screen_name: string; id_str: string }>;
  };
  is_quote_status?: boolean;
  quoted_status_id_str?: string;
  retweeted_status?: ApifyTwitterTweet;
}

/**
 * Twitter/X user data from Apify scraper
 */
export interface ApifyTwitterUser {
  id_str: string;
  screen_name: string;
  name: string;
  description?: string;
  profile_image_url_https?: string;
  followers_count: number;
  friends_count: number;
  statuses_count: number;
  verified?: boolean;
  created_at?: string;
}

/**
 * Normalized tweet data for reply bot system
 */
export interface ApifyNormalizedTweet {
  id: string;
  text: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName?: string;
  authorAvatarUrl?: string;
  authorFollowersCount?: number;
  createdAt: Date;
  conversationId?: string;
  inReplyToUserId?: string;
  inReplyToTweetId?: string;
  metrics?: {
    retweets: number;
    likes: number;
    replies: number;
    quotes: number;
  };
  hashtags?: string[];
  isRetweet: boolean;
  isQuote: boolean;
}

/**
 * Instagram trend data from Apify
 */
export interface ApifyInstagramHashtag {
  name: string;
  mediaCount?: number;
  topPosts?: ApifyInstagramPost[];
}

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
}

/**
 * YouTube trend data from Apify
 */
export interface ApifyYouTubeVideo {
  id: string;
  title?: string;
  description?: string;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  channelName?: string;
  channelId?: string;
  thumbnailUrl?: string;
  publishedAt?: string;
  duration?: string;
  url?: string;
}

/**
 * Reddit trend data from Apify
 */
export interface ApifyRedditPost {
  id: string;
  title?: string;
  subreddit?: string;
  score?: number;
  upvoteRatio?: number;
  numComments?: number;
  author?: string;
  url?: string;
  permalink?: string;
  createdUtc?: number;
  isVideo?: boolean;
}

/**
 * Pinterest trend data from Apify
 */
export interface ApifyPinterestPin {
  id: string;
  title?: string;
  description?: string;
  repinCount?: number;
  commentCount?: number;
  imageUrl?: string;
  link?: string;
  boardName?: string;
  pinnerName?: string;
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
  hook?: string;
}

/**
 * Normalized hashtag data
 */
export interface ApifyHashtagData {
  platform: string;
  hashtag: string;
  postCount: number;
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
}

// ==================== Instagram Comment Interfaces ====================

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
 * Instagram user profile from Apify
 */
export interface ApifyInstagramUser {
  id: string;
  username: string;
  fullName?: string;
  biography?: string;
  profilePicUrl?: string;
  followersCount?: number;
  followingCount?: number;
  postsCount?: number;
  isVerified?: boolean;
  isPrivate?: boolean;
}

// ==================== TikTok Comment Interfaces ====================

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

/**
 * TikTok user profile from Apify
 */
export interface ApifyTikTokUser {
  id: string;
  uniqueId: string;
  nickname?: string;
  avatarThumb?: string;
  signature?: string;
  verified?: boolean;
  followersCount?: number;
  followingCount?: number;
  heartCount?: number;
  videoCount?: number;
}

// ==================== YouTube Comment Interfaces ====================

/**
 * Raw YouTube comment data from Apify scraper
 */
export interface ApifyYouTubeComment {
  id?: string;
  commentId?: string;
  text: string;
  authorDisplayName?: string;
  authorChannelId?: string;
  authorProfileImageUrl?: string;
  likeCount?: number;
  replyCount?: number;
  publishedAt?: string;
  videoId?: string;
  videoTitle?: string;
}

/**
 * Normalized YouTube comment for reply bot system
 */
export interface ApifyNormalizedYouTubeComment {
  id: string;
  text: string;
  authorId: string;
  authorDisplayName: string;
  authorAvatarUrl?: string;
  createdAt: Date;
  videoId: string;
  videoTitle?: string;
  metrics?: {
    likes: number;
    replies: number;
  };
}

/**
 * YouTube channel data from Apify
 */
export interface ApifyYouTubeChannel {
  id: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  subscriberCount?: number;
  videoCount?: number;
  viewCount?: number;
  customUrl?: string;
}

// ==================== Generic Social Comment Interface ====================

/**
 * Platform-agnostic normalized comment for reply bot system
 * Used for unified processing across all platforms
 */
export interface ApifyNormalizedSocialComment {
  id: string;
  platform: 'twitter' | 'instagram' | 'tiktok' | 'youtube';
  text: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName?: string;
  authorAvatarUrl?: string;
  createdAt: Date;
  contentId: string;
  contentType: 'tweet' | 'post' | 'video' | 'reel';
  contentUrl?: string;
  metrics?: {
    likes: number;
    replies: number;
  };
  inReplyToId?: string;
  hashtags?: string[];
}
