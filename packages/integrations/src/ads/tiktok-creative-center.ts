import { resolvePaidCreativeType } from './paid-creative';
import type {
  NormalizedPaidCreativeRecord,
  TikTokCreativeCenterRowInput,
} from './types';

/**
 * Maps a TikTok Creative Center row. Unlike the regulatory archives, the
 * Creative Center surfaces public engagement counters (video views, likes) and
 * sometimes a published CTR. Those are the creative's visible social signals,
 * never paid delivery metrics, so views become `estimatedReach` and spend,
 * clicks, CPC, CPM, conversions, and currency stay absent.
 */
export function normalizeTikTokCreativeCenterRecord(
  row: TikTokCreativeCenterRowInput,
): NormalizedPaidCreativeRecord {
  return {
    adFormat: row.adFormat,
    advertiserHandle: row.advertiserHandle,
    advertiserName: row.advertiserName,
    bodyText: row.bodyText,
    campaignName: undefined,
    campaignObjective: undefined,
    campaignStatus: undefined,
    clicks: undefined,
    conversions: undefined,
    cpa: undefined,
    cpc: undefined,
    cpm: undefined,
    creativeContent: row.bodyText,
    creativeMediaUrls: row.creativeMediaUrls,
    creativeType: resolvePaidCreativeType(row.creativeMediaUrls, row.adFormat),
    ctaText: row.ctaText,
    ctr: row.ctr,
    currency: undefined,
    dataConfidence: 0.4,
    date: row.startDate ?? '',
    estimatedReach: row.videoViews ?? 0,
    externalAccountId: row.advertiserHandle ?? '',
    externalAdId: row.id,
    externalAdSetId: undefined,
    externalCampaignId: undefined,
    fundingEntity: undefined,
    granularity: 'ad',
    headlineText: undefined,
    impressions: undefined,
    isHalted: undefined,
    landingPageUrl: row.landingPageUrl,
    performanceScore: null,
    platform: 'tiktok',
    presentationEndDate: row.endDate,
    presentationStartDate: row.startDate,
    reachEstimateMax: undefined,
    reachEstimateMin: undefined,
    revenue: undefined,
    roas: undefined,
    spend: undefined,
    targetingCountries: row.targetingCountries,
    targetingCriteria: undefined,
  };
}
