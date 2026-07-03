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

export type TrendSourceConfidence = 'high' | 'low' | 'medium';

export type TrendSourceIntendedUse =
  | 'evergreen_prompt_context'
  | 'organic_trend_discovery'
  | 'paid_creative_analysis';

export type TrendSourceKind =
  | 'manual_curated_reference'
  | 'owned_brand_reference'
  | 'paid_creative_reference'
  | 'public_platform_reference';

export type TrendPaidCreativeProvider =
  | 'google_ads_transparency_center'
  | 'manual_paid_reference'
  | 'meta_ads_library'
  | 'tiktok_creative_center'
  | 'youtube_ads_library';

export type TrendPaidCreativeType =
  | 'carousel'
  | 'image'
  | 'post'
  | 'text'
  | 'unknown'
  | 'video';

export interface TrendSourceMetrics {
  comments?: number;
  likes?: number;
  shares?: number;
  views?: number;
}

export interface TrendPaidCreativeMetadata {
  adFormat?: string;
  collectedAt: string;
  creativeType?: TrendPaidCreativeType;
  hook?: string;
  landingIntent?: string;
  provider: TrendPaidCreativeProvider;
  visibleEngagementSignals?: TrendSourceMetrics;
}

export interface TrendSourceClassification {
  capturedAt: string;
  confidence: TrendSourceConfidence;
  freshnessWindowDays: number;
  intendedUse: TrendSourceIntendedUse;
  paidCreative?: TrendPaidCreativeMetadata;
  sourceKind: TrendSourceKind;
  sourceLabel?: string;
  sourceTopic?: string;
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
  sourceClassification?: TrendSourceClassification;
  metrics?: TrendSourceMetrics;
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
  // Nullable in the DB (Prisma `Trend.expiresAt DateTime?`); absent for bootstrap
  // trends and rows without an explicit expiry. Consumers must null-check before use.
  expiresAt?: Date;
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
  sourceClassification?: TrendSourceClassification;
  remixCount: number;
}

export interface TrendSourceReferenceResult {
  items: TrendSourceReferenceRecord[];
  /**
   * Count of references on THIS page (== items.length), not a corpus-wide
   * total: classification is filtered post-fetch on a JSON column, so a true
   * SQL count isn't available without over-scanning. Use `hasMore` to decide
   * whether to page further.
   */
  totalReferences: number;
  /**
   * True when more matching references exist beyond this page — either the
   * post-classification set exceeded `limit`, or the over-fetch window hit its
   * cap (so additional matches may lie past it).
   */
  hasMore: boolean;
}

export type TrendPromptReferenceBrandSuitability =
  | 'brand_safe'
  | 'requires_review'
  | 'unknown';

export type TrendPromptReferenceFreshnessStatus = 'expired' | 'fresh' | 'stale';

export type TrendPromptReferencePackType =
  | 'constraints'
  | 'formats'
  | 'hooks'
  | 'references';

export interface TrendPromptReferencePackSource {
  id: string;
  platform: string;
  canonicalUrl: string;
  authorHandle?: string;
  contentType: TrendSourceItem['contentType'];
  title?: string;
  text?: string;
  sourceClassification?: TrendSourceClassification;
  freshnessStatus: TrendPromptReferenceFreshnessStatus;
  lastSeenAt: string;
  confidence: TrendSourceConfidence;
}

export interface TrendPromptReferencePackFreshness {
  status: TrendPromptReferenceFreshnessStatus;
  freshnessWindowDays: number;
  lastSourceSeenAt?: string;
  regenerateAfter?: string;
  staleSourceIds: string[];
  expiredSourceIds: string[];
}

export interface TrendPromptReferencePackRegeneration {
  cacheKey: string;
  sourceFingerprint: string;
  trigger: 'cache_key_changed' | 'source_expired' | 'source_stale';
  regenerateAfter?: string;
}

export interface TrendPromptReferencePack {
  id: string;
  type: TrendPromptReferencePackType;
  targetPlatform: string;
  contentIntent: TrendSourceIntendedUse;
  title: string;
  summary: string;
  instructions: string[];
  examples: string[];
  constraints: string[];
  sourceReferenceIds: string[];
  sources: TrendPromptReferencePackSource[];
  confidence: TrendSourceConfidence;
  brandSuitability: TrendPromptReferenceBrandSuitability;
  freshness: TrendPromptReferencePackFreshness;
  regeneration: TrendPromptReferencePackRegeneration;
  metadata: {
    generatedAt: string;
    sourceCount: number;
    matchedTopics: string[];
    sourceKinds: TrendSourceKind[];
    contentTypes: TrendSourceItem['contentType'][];
  };
}

export interface TrendPromptReferencePackResult {
  packs: TrendPromptReferencePack[];
  summary: {
    availableTypes: TrendPromptReferencePackType[];
    contentIntent: TrendSourceIntendedUse;
    generatedAt: string;
    skippedSources: number;
    targetPlatform: string;
    totalPacks: number;
    totalSources: number;
  };
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

export type TrendCorpusFreshnessStatus =
  | 'degraded'
  | 'empty'
  | 'healthy'
  | 'stale';

export interface TrendCorpusFreshnessSegment {
  id: string;
  platform: string;
  provider: string;
  sourceKind: TrendSourceKind;
  intendedUse: TrendSourceIntendedUse;
  freshnessWindowDays: number;
  referenceCount: number;
  staleReferenceCount: number;
  latestSeenAt?: string;
  oldestSeenAt?: string;
  status: TrendCorpusFreshnessStatus;
}

export interface TrendProviderFailureSummary {
  provider: string;
  platform: string;
  reason:
    | 'empty_source_preview'
    | 'fallback_source_preview'
    | 'stale_source_preview';
  affectedTrendCount: number;
  latestObservedAt?: string;
  message: string;
  retryAction: string;
  severity: 'error' | 'warning';
}

export interface TrendCorpusFreshnessResult {
  generatedAt: string;
  status: TrendCorpusFreshnessStatus;
  thresholds: {
    defaultFreshnessWindowDaysBySourceKind: Record<TrendSourceKind, number>;
    recordLimits: {
      referenceRecords: number;
      trends: number;
    };
    sourcePreviewStaleAfterDays: number;
  };
  summary: {
    activeTrends: number;
    failingProviders: number;
    freshSegments: number;
    platforms: string[];
    referenceRecords: number;
    staleSegments: number;
    totalSegments: number;
  };
  segments: TrendCorpusFreshnessSegment[];
  providerFailures: TrendProviderFailureSummary[];
}
