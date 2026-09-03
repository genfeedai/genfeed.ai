import type { ContentCampaignPaidActivationStatus } from '../../enums/content-campaign.enum';
import type { UnifiedInsights } from '../integrations/ads-gateway.interface';

export interface ICampaignPaidActivation {
  adAccountId: string;
  campaignId: string;
  credentialId: string;
  currency?: string | null;
  externalAdId?: string | null;
  externalAdSetId?: string | null;
  externalCampaignId?: string | null;
  failureReason?: string | null;
  id: string;
  paidInsights?: UnifiedInsights | null;
  platform: string;
  postIds: string[];
  spendApprovedAt?: string | null;
  status: ContentCampaignPaidActivationStatus;
}

export interface IPrepareCampaignPaidActivationInput {
  adAccountId: string;
  credentialId: string;
  idempotencyKey?: string;
  platform: string;
  postIds?: string[];
  targeting?: Record<string, unknown>;
}
