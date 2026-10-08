import { AdsPlatform } from '@genfeedai/contracts/interfaces';
import type { AdsResearchPlatform } from '@genfeedai/contracts/interfaces/integrations/ads-research.interface';
import { META_CAMPAIGN_OBJECTIVES } from '@genfeedai/integrations';
import { BadRequestException } from '@nestjs/common';

const META_LEGACY_OBJECTIVES: Record<string, string> = {
  APP_INSTALLS: 'OUTCOME_APP_PROMOTION',
  BRAND_AWARENESS: 'OUTCOME_AWARENESS',
  REACH: 'OUTCOME_AWARENESS',
  CONVERSIONS: 'OUTCOME_SALES',
  PRODUCT_CATALOG_SALES: 'OUTCOME_SALES',
  LEAD_GENERATION: 'OUTCOME_LEADS',
  LINK_CLICKS: 'OUTCOME_TRAFFIC',
  TRAFFIC: 'OUTCOME_TRAFFIC',
  MESSAGES: 'OUTCOME_ENGAGEMENT',
  PAGE_LIKES: 'OUTCOME_ENGAGEMENT',
  POST_ENGAGEMENT: 'OUTCOME_ENGAGEMENT',
  VIDEO_VIEWS: 'OUTCOME_ENGAGEMENT',
};
const META_OPTIMIZATION_GOALS: Record<string, string> = {
  OUTCOME_APP_PROMOTION: 'APP_INSTALLS',
  OUTCOME_AWARENESS: 'REACH',
  OUTCOME_ENGAGEMENT: 'POST_ENGAGEMENT',
  OUTCOME_LEADS: 'LEAD_GENERATION',
  OUTCOME_SALES: 'OFFSITE_CONVERSIONS',
  OUTCOME_TRAFFIC: 'LINK_CLICKS',
};

export function resolveAdsLaunchObjectives(
  platform: AdsResearchPlatform,
  objective?: string,
): { campaign: string; adSet: string } {
  if (platform !== AdsPlatform.META)
    return {
      campaign: objective || 'CONVERSIONS',
      adSet: objective || 'CONVERSIONS',
    };
  const key = (objective || 'OUTCOME_SALES').trim().toUpperCase();
  const campaign = META_LEGACY_OBJECTIVES[key] ?? key;
  if (!META_CAMPAIGN_OBJECTIVES.some((supported) => supported === campaign)) {
    throw new BadRequestException(
      `Choose a current Meta campaign objective: ${META_CAMPAIGN_OBJECTIVES.join(', ')}.`,
    );
  }
  return { campaign, adSet: META_OPTIMIZATION_GOALS[campaign] };
}

export function toPlatformLabel(
  platform: AdsResearchPlatform | AdsPlatform,
): string {
  switch (platform) {
    case AdsPlatform.META:
      return 'Meta Ads';
    case AdsPlatform.TIKTOK:
      return 'TikTok Ads';
    case AdsPlatform.X:
      return 'X Ads';
    case AdsPlatform.GOOGLE:
      return 'Google Ads';
  }
}
