import type {
  SocialReplyCampaign as PrismaSocialReplyCampaign,
  SocialReplyCampaignRecipient as PrismaSocialReplyCampaignRecipient,
} from '@genfeedai/prisma';

export type SocialReplyCampaign = PrismaSocialReplyCampaign;
export type SocialReplyCampaignRecipient = PrismaSocialReplyCampaignRecipient;

export type SocialReplyCampaignDocument = PrismaSocialReplyCampaign;
export type SocialReplyCampaignRecipientDocument =
  PrismaSocialReplyCampaignRecipient;

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
