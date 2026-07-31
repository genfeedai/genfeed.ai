import type {
  SocialReplyCampaign as PrismaSocialReplyCampaign,
  SocialReplyCampaignRecipient as PrismaSocialReplyCampaignRecipient,
} from '@genfeedai/prisma';

export type SocialReplyCampaign = PrismaSocialReplyCampaign;
export type SocialReplyCampaignRecipient = PrismaSocialReplyCampaignRecipient;

/**
 * Serializer-facing shapes. The serializer configs declare relation aliases
 * (`organization`, `brand`, `campaign`, …) alongside the scalar FKs, so the
 * document adds the alias keys without ever reading one back — see
 * `rules/prisma_legacy_alias_fields.md`.
 */
export type SocialReplyCampaignDocument = PrismaSocialReplyCampaign & {
  _id: string;
  brand?: string | null;
  organization: string;
  user?: string | null;
};

export type SocialReplyCampaignRecipientDocument =
  PrismaSocialReplyCampaignRecipient & {
    _id: string;
    campaign: string;
    conversation: string;
    message?: string | null;
    organization: string;
  };

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
