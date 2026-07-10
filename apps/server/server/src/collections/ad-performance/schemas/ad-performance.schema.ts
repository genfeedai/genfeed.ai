import type { AdPerformance } from '@genfeedai/prisma';

export type { AdPerformance } from '@genfeedai/prisma';

export interface AdPerformanceDocument extends Omit<AdPerformance, 'data'> {
  _id: string;
  adPlatform: string | null;
  bodyText?: string;
  brand?: string | null;
  campaignName?: string;
  campaignObjective?: string;
  campaignStatus?: string;
  clicks?: number;
  conversionRate: number | null;
  conversions?: number;
  cpc: number | null;
  cpm?: number;
  ctr: number | null;
  credential?: string | null;
  ctaText: string | null;
  data?: Record<string, unknown>;
  date?: Date | string;
  externalAccountId?: string;
  externalAdId?: string;
  externalCampaignId?: string;
  granularity?: string;
  headlineText: string | null;
  imageUrls?: string[];
  impressions?: number;
  industry: string | null;
  landingPageUrl?: string;
  organization?: string;
  performanceScore: number | null;
  revenue?: number;
  roas: number | null;
  scope: string | null;
  spend: number | null;
  validUntil?: Date | string;
  videoUrls?: string[];
  [key: string]: unknown;
}
