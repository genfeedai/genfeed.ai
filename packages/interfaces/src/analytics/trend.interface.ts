import type { Platform, TrendDirection } from '@genfeedai/enums';

export interface ITrendPlatformMetricsConfig {
  value: string;
  label: string;
  icon: string;
  color: string;
  metrics?: {
    views: string;
    likes: string;
    comments: string;
    shares: string;
  };
}

export interface ITrend {
  platform: string;
  topic: string;
  mentions: number;
}

export interface ITrendVideo {
  id: string;
  externalId?: string;
  platform: string;
  title?: string;
  description?: string;
  creatorHandle: string;
  creatorId?: string;
  topic?: string;
  thumbnailUrl?: string;
  videoUrl?: string;
  views?: number;
  viewCount?: number;
  likes?: number;
  likeCount?: number;
  comments?: number;
  commentCount?: number;
  shares?: number;
  shareCount?: number;
  duration?: number;
  durationSeconds?: number;
  engagementRate: number;
  velocity: number;
  viralScore: number;
  publishedAt?: string;
  hashtags?: string[];
  soundId?: string;
  soundName?: string;
  hook?: string;
  isCurrent?: boolean;
}

export interface ITrendAccount {
  id: string;
  platform: string;
  handle: string;
  label: string;
  followers: number;
  avgViews: number;
  avgEngagementRate: number;
  growthRate: number;
  postingCadence: string;
  contentPillar: string;
  collaborationReady?: boolean;
}

export interface ITrendPlaybook {
  id: string;
  title: string;
  description: string;
  action: string;
  platforms: string[];
}

export interface ITrendHashtag {
  id: string;
  platform: string;
  hashtag: string;
  postCount: number;
  viewCount: number;
  growthRate: number;
  viralityScore: number;
  relatedHashtags: string[];
  isCurrent?: boolean;
}

export interface ITrendSound {
  id: string;
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
  isCurrent?: boolean;
}

export interface ICompetitorAccount {
  id: string;
  label: string;
  platform:
    | Platform.INSTAGRAM
    | Platform.TIKTOK
    | Platform.YOUTUBE
    | Platform.TWITTER;
  handle: string;
  category?: string;
  notes?: string;
  followers?: number;
  avgEngagement?: number;
  postFrequency?: string;
  lastChecked?: string;
  trends?: {
    followersGrowth?: number;
    engagementTrend?: TrendDirection;
  };
}

export interface ITrendViralHookAnalysis {
  id: string;
  hook: string;
  category: string;
  effectiveness: number;
  usageCount: number;
  avgEngagementRate: number;
  topPerformers: ITrendViralHookVideo[];
  platforms: string[];
  lastTrending?: string;
}

export interface ITrendViralHookVideo {
  id: string;
  title: string;
  creator: string;
  platform: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  engagementRate: number;
  hook: string;
  publishedAt: string;
  thumbnailUrl?: string;
  videoUrl?: string;
}

export interface ITrendPreferences {
  categories?: string[];
  keywords?: string[];
  platforms?: string[];
  hashtags?: string[];
}

export interface IViralVideoOptions {
  platform?: string;
  limit?: number;
  timeframe?: '24h' | '72h' | '7d';
}

export interface ITrendingHashtagOptions {
  platform?: string;
  limit?: number;
}

export interface ITrendingSoundOptions {
  limit?: number;
}

export interface ILeaderboardOptions {
  timeframe?: '24h' | '72h' | '7d';
  limit?: number;
}

export interface ISocialPlatformMetrics {
  id: string;
  label: string;
  icon: string;
  color: string;
  bgClass: string;
  borderClass: string;
  platform: string;
  totalReach: number;
  avgEngagementRate: number;
  topContent: {
    id: string;
    title: string;
    performance: number;
  }[];
  growthRate: number;
  audienceInsights?: {
    demographics?: Record<string, number>;
    interests?: string[];
    peakHours?: string[];
  };
}
