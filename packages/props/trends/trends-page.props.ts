export interface TrendItem {
  id: string;
  platform: string;
  topic: string;
  mentions: number;
  growthRate: number;
  viralityScore: number;
  metadata?: {
    hashtags?: string[];
    urls?: string[];
    sampleContent?: string;
    engagementRate?: number;
    reach?: number;
    impressions?: number;
    thumbnailUrl?: string;
    videoUrl?: string;
    creatorHandle?: string;
    trendType?: 'topic' | 'hashtag' | 'sound' | 'video' | 'creator';
    source?: 'apify' | 'grok' | 'grok-4' | 'native-api' | 'curated';
  };
  requiresAuth: boolean;
  isCurrent: boolean;
  expiresAt: string;
  createdAt?: string;
  sourcePreview?: TrendSourceItem[];
  sourcePreviewState?: 'live' | 'fallback' | 'empty';
  sourcePreviewTotal?: number;
}

export interface TrendsSummary {
  connectedPlatforms: string[];
  lockedPlatforms: string[];
  totalTrends: number;
  totalItems?: number;
  latestTrendAt?: string;
}

export interface TrendsResponse {
  summary: TrendsSummary;
  trends: TrendItem[];
}

export interface RefreshTrendsResponse {
  success: boolean;
  message: string;
  count: number;
}

export interface TrendContentItem {
  id: string;
  sourceReferenceId?: string;
  platform: string;
  trendId: string;
  trendTopic: string;
  matchedTrends: string[];
  contentType: 'image' | 'post' | 'tweet' | 'video';
  sourceUrl: string;
  authorHandle?: string;
  title?: string;
  text?: string;
  thumbnailUrl?: string;
  mediaUrl?: string;
  publishedAt?: string;
  metrics?: {
    comments?: number;
    likes?: number;
    shares?: number;
    views?: number;
  };
  trendViralityScore: number;
  trendMentions: number;
  sourcePreviewState: 'live' | 'fallback' | 'empty';
  requiresAuth: boolean;
  contentRank: number;
}

export interface TrendContentResponse {
  summary: TrendsSummary;
  items: TrendContentItem[];
}

export interface TrendsPageProps {
  className?: string;
}

export interface TrendsState {
  trends: TrendItem[];
  summary: TrendsSummary | null;
  isLoading: boolean;
  error: string | null;
  isRefreshing: boolean;
}

export interface SummaryCardProps {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
}

export interface TrendCardProps {
  trend: TrendItem;
}

export interface TrendDetailData {
  trend: TrendItem;
  relatedTrends: TrendItem[];
  analysis: {
    topic: string;
    platform: string;
    averageMentions: number;
    averageViralityScore: number;
    trendDirection: 'rising' | 'falling' | 'stable';
    peakDate?: string;
    peakMentions?: number;
    growthRate: number;
  };
}

export interface TrendDetailProps {
  trendId: string;
}

export interface TrendSourceItem {
  id: string;
  sourceReferenceId?: string;
  platform: string;
  contentType: 'image' | 'post' | 'tweet' | 'video';
  sourceUrl: string;
  authorHandle?: string;
  text?: string;
  title?: string;
  thumbnailUrl?: string;
  mediaUrl?: string;
  publishedAt?: string;
  metrics?: {
    comments?: number;
    likes?: number;
    shares?: number;
    views?: number;
  };
}
