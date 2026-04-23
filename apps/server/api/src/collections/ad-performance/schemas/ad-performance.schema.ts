import type { AdPerformance } from '@genfeedai/prisma';

export type { AdPerformance } from '@genfeedai/prisma';

export interface AdPerformanceDocument extends Omit<AdPerformance, 'data'> {
  _id: string;
  adPlatform?: string;
  bodyText?: string;
  brand?: string | null;
  campaignName?: string;
  campaignObjective?: string;
  campaignStatus?: string;
  clicks?: number;
  conversionRate?: number;
  conversions?: number;
  cpc?: number;
  cpm?: number;
  ctr?: number;
  credential?: string | null;
  ctaText?: string;
  data?: Record<string, unknown>;
  date?: Date | string;
  externalAccountId?: string;
  externalAdId?: string;
  externalCampaignId?: string;
  granularity?: string;
  headlineText?: string;
  imageUrls?: string[];
  impressions?: number;
  industry?: string;
  landingPageUrl?: string;
  organization?: string;
  performanceScore?: number;
  revenue?: number;
  roas?: number;
  scope?: string;
  spend?: number;
  validUntil?: Date | string;
  videoUrls?: string[];
  [key: string]: unknown;
}
