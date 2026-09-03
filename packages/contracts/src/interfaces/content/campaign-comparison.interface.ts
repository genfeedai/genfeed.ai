import type { ICampaign } from './campaign.interface';
import type { ICampaignOrganicTotals } from './campaign-performance.interface';

export type CampaignComparisonMetric = 'engagements' | 'views';

export interface ICampaignComparisonEntry {
  campaign: ICampaign;
  organic: ICampaignOrganicTotals;
  windowEnd: string;
  windowStart: string;
}

export interface ICampaignComparison {
  entries: ICampaignComparisonEntry[];
  id: string;
  isDescriptive: true;
  metric: CampaignComparisonMetric;
  reason: string;
  winnerCampaignId: string | null;
}
