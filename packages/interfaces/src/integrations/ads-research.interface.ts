export type AdsResearchSource = 'public' | 'my_accounts' | 'all';
/** Connected + public ads research platforms (Discover → Ads Intelligence). */
export type AdsResearchPlatform = 'meta' | 'google' | 'tiktok' | 'x';
export type AdsChannel = 'all' | 'search' | 'display' | 'youtube';
export type AdsResearchMetric =
  | 'performanceScore'
  | 'ctr'
  | 'roas'
  | 'conversions'
  | 'spendEfficiency';
export type AdsResearchTimeframe =
  | 'last_7_days'
  | 'last_30_days'
  | 'last_90_days'
  | 'all_time';

export interface AdsResearchFilters {
  brandId?: string;
  brandName?: string;
  industry?: string;
  source?: AdsResearchSource;
  platform?: AdsResearchPlatform;
  channel?: AdsChannel;
  metric?: AdsResearchMetric;
  timeframe?: AdsResearchTimeframe;
  limit?: number;
  credentialId?: string;
  adAccountId?: string;
  loginCustomerId?: string;
}

export interface AdsResearchPatternSummary {
  id?: string;
  label: string;
  summary: string;
  score?: number;
  examples?: string[];
}

/**
 * How long a competitor kept a creative on air, derived from the run dates a
 * transparency archive publishes. It is absent — never zero — when the archive
 * disclosed no usable start date, so an unscored ad is never mistaken for a
 * short-lived one.
 */
export interface AdsResearchLongevity {
  daysLive: number;
  isStillRunning: boolean;
  score: number;
}

export interface AdsResearchItem {
  id: string;
  sourceId: string;
  source: Exclude<AdsResearchSource, 'all'>;
  platform: AdsResearchPlatform;
  channel: AdsChannel;
  title: string;
  headline?: string;
  body?: string;
  cta?: string;
  previewUrl?: string;
  imageUrls?: string[];
  videoUrls?: string[];
  landingPageUrl?: string;
  accountName?: string;
  accountId?: string;
  campaignId?: string;
  campaignName?: string;
  campaignObjective?: string;
  status?: string;
  industry?: string;
  sourceLabel?: string;
  metricValue?: number;
  metricLabel?: string;
  longevity?: AdsResearchLongevity;
  explanation: string;
  credentialId?: string;
  adAccountId?: string;
  loginCustomerId?: string;
  metrics: {
    spend?: number;
    impressions?: number;
    clicks?: number;
    ctr?: number;
    cpc?: number;
    cpm?: number;
    conversions?: number;
    conversionRate?: number;
    revenue?: number;
    roas?: number;
    performanceScore?: number;
  };
  patternSummary?: AdsResearchPatternSummary[];
  usagePolicy?: 'remix_allowed' | 'disclosure_only';
  firstSeenAt?: string;
  lastSeenAt?: string;
  savedAdId?: string;
  savedAt?: string;
  savedNote?: string;
  isSavedSnapshot?: boolean;
}

export interface AdsResearchDetail extends AdsResearchItem {
  creative: {
    headline?: string;
    body?: string;
    cta?: string;
    imageUrls?: string[];
    videoUrls?: string[];
    landingPageUrl?: string;
  };
}

export interface AdsResearchResponse {
  filters: AdsResearchFilters;
  publicAds: AdsResearchItem[];
  connectedAds: AdsResearchItem[];
  summary: {
    publicCount: number;
    connectedCount: number;
    reviewPolicy: string;
    selectedPlatform: AdsResearchPlatform | 'all';
    selectedSource: AdsResearchSource;
  };
}

export interface AdPack {
  headlines: string[];
  primaryText: string;
  cta: string;
  assetCreativeBrief: string;
  targetingNotes: string;
  campaignRecipe: {
    objective: string;
    platform: AdsResearchPlatform;
    channel: AdsChannel;
    budgetStrategy: string;
    placements: string[];
    reviewStatus: 'review_required';
  };
}

export interface CampaignLaunchPrep {
  reviewRequired: true;
  status: 'review_required';
  publishMode: 'paused';
  platform: AdsResearchPlatform;
  channel: AdsChannel;
  credentialId?: string;
  adAccountId?: string;
  loginCustomerId?: string;
  workflowId?: string;
  workflowName?: string;
  adPack: AdPack;
  campaign: {
    name: string;
    objective: string;
    status: 'PAUSED' | 'DRAFT';
    dailyBudget?: number;
  };
  adSet: {
    name: string;
    optimizationGoal: string;
    targeting: Record<string, unknown>;
  };
  ad: {
    name: string;
    headline?: string;
    body?: string;
    linkUrl?: string;
    callToAction?: string;
  };
  notes: string[];
}

export interface AdsResearchWorkflowResult {
  reviewRequired: true;
  workflowId: string;
  workflowName: string;
  workflowDescription?: string;
  adPack: AdPack;
}

/**
 * Platforms the competitor watchlist can poll. `youtube` is listed separately
 * from `google` because operators think in terms of YouTube ads, even though
 * both resolve to the Google Ads Transparency Center — YouTube has no archive
 * of its own.
 */
export type AdWatchlistPlatform = AdsResearchPlatform | 'youtube';

/**
 * Freshness of the last archive poll for a watched competitor. `empty` means the
 * archive answered with no live creative; `unavailable` means we could not look
 * at all. They are never collapsed — an operator has to be able to tell "this
 * advertiser stopped running ads" from "our provider is down".
 */
export type AdWatchedAdvertiserFreshnessState =
  | 'empty'
  | 'fresh'
  | 'stale'
  | 'unavailable';

/**
 * A competitor whose public ad-archive creative we poll on the organization's
 * behalf. The `last*` fields are ingestion bookkeeping, surfaced so a silent
 * provider failure is visible on the same screen as the creative it starved.
 */
export interface AdWatchedAdvertiser {
  id: string;
  advertiserHandle: string;
  advertiserName?: string;
  brandId?: string;
  externalAdvertiserId?: string;
  freshnessState: AdWatchedAdvertiserFreshnessState;
  lastAttemptedAt?: string;
  lastIngestionErrorCode?: string;
  lastIngestionStatus?: string;
  lastSnapshotRecordCount?: number;
  lastSuccessfulAt?: string;
  platform: AdWatchlistPlatform;
}

export interface CreateAdWatchedAdvertiserInput {
  advertiserHandle: string;
  advertiserName?: string;
  brandId?: string;
  platform: AdWatchlistPlatform;
}

/**
 * Whether a competitor archive can be polled right now, and if not, the stable
 * machine codes saying why. Surfaced verbatim so an empty result is never
 * mistaken for "this competitor stopped advertising".
 */
export interface AdWatchlistPlatformReadiness {
  available: boolean;
  blockers: string[];
  documentationUrl: string;
  platform: AdWatchlistPlatform;
  provider: string;
  status: 'available' | 'unavailable';
}
