import {
  resolvePaidCreativeType,
  resolvePaidCreativeUsagePolicy,
} from './paid-creative';
import type {
  MetaAdLibraryRowInput,
  NormalizedPaidCreativeRecord,
} from './types';

/**
 * The Meta Ad Library publishes an EU-only bucketed reach range and nothing
 * else quantitative. The bucket midpoint is the least biased single-number
 * estimate; a one-sided bucket falls back to its only known bound.
 */
export function normalizeMetaAdLibraryReach(
  row: Pick<MetaAdLibraryRowInput, 'reachEstimateMax' | 'reachEstimateMin'>,
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
 * Maps a Meta Ad Library row without manufacturing ad performance. The public
 * archive never discloses spend, clicks, CTR, CPC, CPM, conversions, or
 * currency for a competitor, so those fields stay absent rather than zero.
 * `performanceScore: null` means explicitly unscored — the research query has
 * a separate path for the current tenant's own measured rows.
 */
export function normalizeMetaAdLibraryRecord(
  row: MetaAdLibraryRowInput,
): NormalizedPaidCreativeRecord {
  return {
    adFormat: row.adFormat,
    advertiserHandle: row.pageName,
    advertiserName: row.pageName,
    bodyText: row.bodyText,
    campaignName: undefined,
    campaignObjective: undefined,
    campaignStatus: row.isActive === false ? 'HALTED' : undefined,
    clicks: undefined,
    conversions: undefined,
    cpa: undefined,
    cpc: undefined,
    cpm: undefined,
    creativeContent: row.bodyText,
    creativeMediaUrls: row.creativeMediaUrls,
    creativeType: resolvePaidCreativeType(row.creativeMediaUrls, row.adFormat),
    ctaText: row.ctaText,
    ctr: undefined,
    currency: undefined,
    dataConfidence: 0.3,
    date: row.startDate ?? '',
    estimatedReach: normalizeMetaAdLibraryReach(row),
    externalAccountId: row.pageId ?? row.pageName ?? '',
    externalAdId: row.adArchiveId,
    externalAdSetId: undefined,
    externalCampaignId: undefined,
    fundingEntity: undefined,
    granularity: 'ad',
    headlineText: row.headlineText,
    impressions: undefined,
    isHalted: row.isActive === false,
    landingPageUrl: row.landingPageUrl,
    performanceScore: null,
    platform: 'meta',
    presentationEndDate: row.endDate,
    presentationStartDate: row.startDate,
    reachEstimateMax: row.reachEstimateMax,
    reachEstimateMin: row.reachEstimateMin,
    revenue: undefined,
    roas: undefined,
    spend: undefined,
    targetingCountries: row.targetingCountries,
    targetingCriteria: row.publisherPlatforms,
    usagePolicy: resolvePaidCreativeUsagePolicy('meta_ads_library'),
  };
}
