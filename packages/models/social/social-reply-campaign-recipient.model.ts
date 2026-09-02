import type {
  SocialReplyCampaignRecipient,
  SocialReplyCampaignRecipientStatus,
} from '@genfeedai/contracts/interfaces';

export class SocialReplyCampaignRecipientModel
  implements SocialReplyCampaignRecipient
{
  id!: string;
  campaignId?: string;
  organizationId?: string;
  conversationId!: string;
  messageId?: string | null;
  status!: SocialReplyCampaignRecipientStatus;
  position!: number;
  scheduledAt?: string | null;
  dispatchedAt?: string | null;
  sentAt?: string | null;
  attemptCount!: number;
  idempotencyKey!: string;
  body?: string | null;
  failureReason?: string | null;
  metadata?: Record<string, unknown>;
  createdAt!: string;
  updatedAt!: string;

  constructor(partial: Partial<SocialReplyCampaignRecipient>) {
    Object.assign(this, partial);
  }
}
