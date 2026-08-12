import type { AdPerformance } from '@genfeedai/prisma';

export type { AdPerformance } from '@genfeedai/prisma';

export interface AdPerformanceDocument extends Omit<AdPerformance, 'data'> {
  adPlatform: string | null;
  bodyText?: string;
  campaignName?: string;
  campaignObjective?: string;
  campaignStatus?: string;
  clicks?: number;
  conversionRate: number | null;
  conversions?: number;
  cpc: number | null;
  cpm?: number;
  ctr: number | null;
  ctaText: string | null;
  data?: Record<string, unknown>;
  date: Date | null;
  externalAccountId: string | null;
  externalAdId: string | null;
  externalAdSetId: string | null;
  externalCampaignId: string | null;
  granularity: string | null;
  headlineText: string | null;
  identityKey: string;
  imageUrls?: string[];
  impressions?: number;
  industry: string | null;
  landingPageUrl?: string;
  performanceScore: number | null;
  revenue?: number;
  roas: number | null;
  scope: string | null;
  spend: number | null;
  validUntil?: Date | string;
  videoUrls?: string[];
  [key: string]: unknown;
}
