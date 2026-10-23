import { toPlatformLabel } from '@api/endpoints/ads-research/ads-launch-goals.util';
import {
  AdsChannel,
  AdsPlatform,
  isAdsPlatform,
  type UnifiedAd,
} from '@genfeedai/contracts/interfaces';
import type {
  AdPack,
  AdsResearchDetail,
  AdsResearchItem,
  AdsResearchPlatform,
} from '@genfeedai/contracts/interfaces/integrations/ads-research.interface';

interface ConnectedItemParams {
  platform: AdsResearchPlatform;
  sourceId: string;
  name?: string;
  ad?: UnifiedAd;
  topInsights?: {
    spend: number;
    impressions: number;
    clicks: number;
    ctr: number;
    cpc: number;
    cpm: number;
    conversions?: number;
    revenue?: number;
    roas?: number;
    cpa?: number;
    dateStart: string;
    dateStop: string;
  };
  metricValue?: number;
  insightMetric?: string;
  credentialId: string;
  adAccountId: string;
  loginCustomerId?: string;
  channel?: AdsChannel;
}

export function mapConnectedResearchItem(
  params: ConnectedItemParams,
): AdsResearchItem {
  const creative = params.ad?.creative;
  const videoUrl =
    params.platform === AdsPlatform.GOOGLE && creative?.videoId
      ? `https://www.youtube.com/watch?v=${creative.videoId}`
      : undefined;
  const channel =
    params.platform === AdsPlatform.GOOGLE
      ? params.channel && params.channel !== AdsChannel.ALL
        ? params.channel
        : creative?.videoId
          ? AdsChannel.YOUTUBE
          : AdsChannel.SEARCH
      : AdsChannel.ALL;

  return {
    accountId: params.adAccountId,
    accountName: `Connected ${toPlatformLabel(params.platform)} account`,
    adAccountId: params.adAccountId,
    body: creative?.body,
    channel,
    credentialId: params.credentialId,
    cta: creative?.callToAction,
    explanation: `This ad is performing well in your connected ${toPlatformLabel(
      params.platform,
    )} account. Keep the core angle, tighten the promise, and adapt the proof for your brand before launch.`,
    headline: creative?.title,
    id: `connected:${params.platform}:${params.sourceId}`,
    imageUrls: creative?.imageUrl ? [creative.imageUrl] : [],
    landingPageUrl: creative?.linkUrl,
    loginCustomerId: params.loginCustomerId,
    metricLabel: params.insightMetric || 'performance',
    metrics: {
      clicks: params.topInsights?.clicks,
      conversions: params.topInsights?.conversions,
      cpc: params.topInsights?.cpc,
      cpm: params.topInsights?.cpm,
      ctr: params.topInsights?.ctr,
      impressions: params.topInsights?.impressions,
      performanceScore: params.metricValue,
      revenue: params.topInsights?.revenue,
      roas: params.topInsights?.roas,
      spend: params.topInsights?.spend,
    },
    metricValue: params.metricValue,
    patternSummary: [],
    platform: params.platform,
    previewUrl: creative?.imageUrl || videoUrl,
    source: 'my_accounts',
    sourceId: params.sourceId,
    sourceLabel: 'Connected account',
    status: params.ad?.status,
    title: params.name || params.ad?.name || 'Connected ad',
    videoUrls: videoUrl ? [videoUrl] : [],
  };
}

export function buildAdsResearchAdPack(params: {
  ad: AdsResearchDetail;
  brandName?: string;
  harnessNotes?: string;
  industry?: string;
  objective?: string;
  channel?: AdsChannel;
}): AdPack {
  const brandName = params.brandName || 'your brand';
  const objective =
    params.objective || params.ad.campaignObjective || 'Conversions';
  const channel = params.channel || params.ad.channel || AdsChannel.ALL;
  const sourceHeadline = params.ad.headline?.trim() || 'Winning angle';
  const sourceBody = params.ad.body?.trim() || 'Strong proof-based ad copy';
  const sourceCta = params.ad.cta?.trim() || 'Learn more';
  const niche = params.industry || params.ad.industry || 'your niche';
  const harnessSuffix = params.harnessNotes
    ? `\n\nBRAND HARNESS:\n${params.harnessNotes}`
    : '';

  return {
    assetCreativeBrief: `Build a ${toPlatformLabel(
      params.ad.platform,
    )} creative for ${brandName} in ${niche}. Keep the winning angle from "${sourceHeadline}", make the promise clearer, add brand-specific proof, and leave space for a direct CTA.${harnessSuffix}`,
    campaignRecipe: {
      budgetStrategy:
        params.ad.platform === AdsPlatform.GOOGLE
          ? 'Start with a paused daily budget and validate search intent before scale.'
          : 'Start with a paused daily budget and test 2-3 placement clusters before scale.',
      channel,
      objective,
      placements:
        params.ad.platform === AdsPlatform.GOOGLE
          ? channel === AdsChannel.YOUTUBE
            ? ['YouTube In-Feed', 'YouTube Shorts']
            : channel === AdsChannel.DISPLAY
              ? ['Display Network']
              : ['Google Search']
          : ['Facebook Feed', 'Instagram Feed', 'Stories'],
      platform: params.ad.platform,
      reviewStatus: 'review_required',
    },
    cta: sourceCta,
    headlines: [
      `${brandName}: ${sourceHeadline}`,
      `Why ${niche} buyers switch to ${brandName}`,
      `${brandName} without the usual ${niche} friction`,
    ],
    primaryText: `${sourceBody}\n\nAdapt this around ${brandName}, make the offer concrete for ${niche}, and tie every line back to the ${objective.toLowerCase()} goal.${harnessSuffix}`,
    targetingNotes: `Target ${niche} audiences already showing intent. Mirror the source angle, but replace broad claims with ${brandName}-specific proof, objections, and outcome language.`,
  };
}

export function buildAdsResearchExplanation(params: {
  platform: AdsResearchPlatform;
  industry?: string;
  ctr?: number;
  roas?: number;
  patterns: Array<{ label: string }>;
}): string {
  const parts = [
    `This ${toPlatformLabel(params.platform)} ad is outperforming peers`,
  ];

  if (params.industry) {
    parts.push(`in the ${params.industry} niche`);
  }

  if (typeof params.ctr === 'number' && params.ctr > 0) {
    parts.push(`with a ${params.ctr.toFixed(2)}% CTR signal`);
  }

  if (typeof params.roas === 'number' && params.roas > 0) {
    parts.push(`and ${params.roas.toFixed(2)}x ROAS`);
  }

  if (params.patterns.length > 0) {
    parts.push(
      `. The strongest reusable patterns here are ${params.patterns
        .map((pattern) => pattern.label)
        .join(', ')}`,
    );
  }

  return `${parts.join(' ')}.`;
}

export function normalizeAdsResearchPlatform(
  platform: string,
): AdsResearchPlatform {
  const value = platform.trim().toLowerCase();
  if (isAdsPlatform(value)) {
    return value;
  }
  // `google-ads` is the normalized ad-platform id transparency-archive
  // snapshots are stored with; `google_ads` is the connected-account spelling.
  if (value === 'google_ads' || value === 'google-ads') {
    return AdsPlatform.GOOGLE;
  }
  if (value === 'meta_ads' || value === 'facebook') {
    return AdsPlatform.META;
  }
  if (value === 'tiktok_ads') {
    return AdsPlatform.TIKTOK;
  }
  if (value === 'x_ads' || value === 'twitter') {
    return AdsPlatform.X;
  }
  return platform as AdsResearchPlatform;
}
