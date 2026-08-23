import type {
  NormalizedXAdsRepositoryRecord,
  XAdsRepositoryExportRowInput,
} from './types';

/**
 * X Ads Repository (DSA transparency) exports report impressions as a
 * bucketed range, never an exact count. The bucket midpoint is the least
 * biased single-number estimate; a one-sided bucket falls back to its only
 * known bound.
 */
export function normalizeXAdsRepositoryImpressions(
  row: Pick<
    XAdsRepositoryExportRowInput,
    'reachEstimateMax' | 'reachEstimateMin'
  >,
): number {
  const { reachEstimateMax, reachEstimateMin } = row;

  if (reachEstimateMin === undefined && reachEstimateMax === undefined) {
    return 0;
  }

  if (reachEstimateMin === undefined) {
    return reachEstimateMax as number;
  }

  if (reachEstimateMax === undefined) {
    return reachEstimateMin;
  }

  return Math.round((reachEstimateMin + reachEstimateMax) / 2);
}

/**
 * Maps a reviewed provider-neutral disclosure row without manufacturing ad
 * performance. X does not disclose spend, clicks, CTR, CPC, CPM, or currency;
 * those fields stay absent. `performanceScore: null` means explicitly
 * unscored; the research query has a separate current-tenant disclosure path
 * so null is never overloaded to mean poor observed performance.
 */
export function normalizeXAdsRepositoryExportRecord(
  row: XAdsRepositoryExportRowInput,
): NormalizedXAdsRepositoryRecord {
  const estimatedReach = normalizeXAdsRepositoryImpressions(row);

  return {
    advertiserHandle: row.advertiserHandle,
    advertiserName: row.advertiserName,
    bodyText: row.creativeContent,
    campaignName: undefined,
    campaignObjective: undefined,
    campaignStatus: row.isHalted === true ? 'HALTED' : undefined,
    clicks: undefined,
    conversions: undefined,
    cpa: undefined,
    cpc: undefined,
    cpm: undefined,
    creativeContent: row.creativeContent,
    creativeMediaUrls: row.creativeMediaUrls,
    ctaText: undefined,
    ctr: undefined,
    currency: undefined,
    dataConfidence: 0.3,
    date: row.presentationStartDate ?? '',
    estimatedReach,
    externalAccountId: row.externalAdvertiserId ?? row.advertiserHandle ?? '',
    externalAdId: row.adId,
    externalAdSetId: undefined,
    externalCampaignId: undefined,
    fundingEntity: row.fundingEntity,
    granularity: 'ad',
    headlineText: undefined,
    impressions: undefined,
    isHalted: row.isHalted,
    landingPageUrl: row.landingPageUrl,
    performanceScore: null,
    platform: 'x_ads',
    presentationEndDate: row.presentationEndDate,
    presentationStartDate: row.presentationStartDate,
    reachEstimateMax: row.reachEstimateMax,
    reachEstimateMin: row.reachEstimateMin,
    revenue: undefined,
    roas: undefined,
    spend: undefined,
    targetingCountries: row.targetingCountries,
    targetingCriteria: row.targetingCriteria,
  };
}
