import type {
  SocialReplyCampaign as PrismaSocialReplyCampaign,
  SocialReplyCampaignRecipient as PrismaSocialReplyCampaignRecipient,
} from '@genfeedai/prisma';

export type SocialReplyCampaign = PrismaSocialReplyCampaign;
export type SocialReplyCampaignRecipient = PrismaSocialReplyCampaignRecipient;

export type SocialReplyCampaignDocument = PrismaSocialReplyCampaign;
export type SocialReplyCampaignRecipientDocument =
  PrismaSocialReplyCampaignRecipient;

export interface SocialReplyCampaignDispatchRequest {
  campaignId: string;
  organizationId: string;
  /**
   * Monotonic execution counter. Every successor workflow advances the cursor,
   * so stale delayed executions fail closed when the campaign is paused,
   * resumed, or cancelled.
   */
  dispatchCursor: number;
}

export type SocialReplyCampaignTickOutcome =
  | 'campaign-completed'
  | 'campaign-inactive'
  | 'recipient-failed'
  | 'recipient-sent'
  | 'recipient-skipped'
  | 'throttled';

export interface SocialReplyCampaignDispatchResult {
  nextRunInSeconds?: number;
  outcome: SocialReplyCampaignTickOutcome;
  recipientId?: string;
}

export interface SocialReplyCampaignCreateInput {
  bodyTemplate: string;
  conversationIds: string[];
  description?: string;
  maxPerDay?: number;
  maxPerHour?: number;
  messageType?: 'dm' | 'reply';
  minDelaySeconds?: number;
  name: string;
  platform: string;
}

export interface SocialReplyCampaignUpdateInput {
  bodyTemplate?: string;
  description?: string;
  maxPerDay?: number;
  maxPerHour?: number;
  minDelaySeconds?: number;
  name?: string;
}

export interface SocialReplyCampaignListQuery {
  brandId?: string;
  limit?: number;
  page?: number;
  platform?: string;
  status?: string;
}

export interface SocialReplyCampaignRecipientListQuery {
  limit?: number;
  page?: number;
  status?: string;
}
