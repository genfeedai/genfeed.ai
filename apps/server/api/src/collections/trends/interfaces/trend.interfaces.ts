export interface TrendData {
  platform: string;
  topic: string;
  mentions: number;
  growthRate: number;
  createdAt?: Date | string;
  metadata?: Record<string, unknown>;
}

export interface ApifyTrendItem {
  platform: string;
  topic: string;
  mentions: number;
  growthRate: number;
  metadata?: Record<string, unknown>;
}

export interface TrendPatternAnalysis {
  topic: string;
  platform: string;
  averageMentions: number;
  averageViralityScore: number;
  trendDirection: 'rising' | 'falling' | 'stable';
  peakDate?: Date;
  peakMentions?: number;
  growthRate: number;
}

export interface HistoricalTrendsOptions {
  platform?: string;
  topic?: string;
  organizationId?: string;
  brandId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

export interface TrendPreferencesFilter {
  keywords?: string[];
  categories?: string[];
  hashtags?: string[];
  platforms?: string[];
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

export interface TrendContentItem extends TrendSourceItem {
  trendId: string;
  trendTopic: string;
  matchedTrends: string[];
  trendViralityScore: number;
  trendMentions: number;
  sourcePreviewState: 'live' | 'fallback' | 'empty';
  requiresAuth: boolean;
  contentRank: number;
}

export interface TrendDiscoveryItem extends TrendData {
  id: string;
  requiresAuth: boolean;
  isCurrent: boolean;
  isDeleted: boolean;
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
  sourcePreview: TrendSourceItem[];
  sourcePreviewState: 'live' | 'fallback' | 'empty';
  sourcePreviewTotal: number;
}

export interface TrendContentResult {
  items: TrendContentItem[];
  connectedPlatforms: string[];
  lockedPlatforms: string[];
  totalTrends: number;
  latestTrendAt?: string;
}

export interface TrendSourceReferenceRecord {
  id: string;
  platform: string;
  canonicalUrl: string;
  authorHandle?: string;
  contentType: TrendSourceItem['contentType'];
  title?: string;
  text?: string;
  thumbnailUrl?: string;
  mediaUrl?: string;
  publishedAt?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  latestTrendMentions: number;
  latestTrendViralityScore: number;
  currentEngagementTotal: number;
  currentMetrics?: TrendSourceItem['metrics'];
  matchedTrendTopics: string[];
  sourcePreviewState: 'live' | 'fallback' | 'empty';
  remixCount: number;
}

export interface TrendSourceReferenceResult {
  items: TrendSourceReferenceRecord[];
  totalReferences: number;
}

export interface TrendSourceAccountSummary {
  platform: string;
  authorHandle: string;
  referenceCount: number;
  totalEngagement: number;
  avgTrendViralityScore: number;
  brandRemixCount: number;
  lastSeenAt?: string;
}

export interface TrendSourceAccountResult {
  accounts: TrendSourceAccountSummary[];
  totalAccounts: number;
}
