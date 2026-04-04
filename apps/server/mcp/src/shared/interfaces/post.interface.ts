export type SocialPlatform =
  | 'twitter'
  | 'linkedin'
  | 'instagram'
  | 'tiktok'
  | 'youtube';

export interface PublishContentParams {
  contentId: string;
  platforms: SocialPlatform[];
  customMessage?: string;
  scheduleAt?: string;
}

export interface PostResponse {
  id: string;
  contentId: string;
  platform: SocialPlatform;
  status: 'pending' | 'published' | 'scheduled' | 'failed';
  publishedUrl?: string;
  scheduledAt?: string;
  publishedAt?: string;
  createdAt: string;
}

export interface PostListParams {
  platform?: SocialPlatform | 'all';
  limit?: number;
  offset?: number;
}

export interface TrendingTopicsParams {
  category?:
    | 'all'
    | 'tech'
    | 'business'
    | 'entertainment'
    | 'sports'
    | 'science'
    | 'health'
    | 'politics';
  timeframe?: '24h' | '7d' | '30d';
}

export interface TrendingTopic {
  topic: string;
  volume: number;
  growth: number;
  category: string;
  relatedKeywords: string[];
}

export interface CreditsUsage {
  available: number;
  used: number;
  total: number;
  breakdown: {
    videos: number;
    articles: number;
    images: number;
    music: number;
    avatars: number;
  };
  resetDate?: string;
}

export interface UsageStats {
  timeRange: string;
  contentCreated: {
    videos: number;
    articles: number;
    images: number;
    music: number;
    avatars: number;
  };
  creditsUsed: number;
  postsPublished: number;
  totalEngagement: number;
}
