import type { CampaignPlatform } from '@genfeedai/contracts';
import type { CampaignTarget } from '@genfeedai/prisma';

export type { CampaignTarget } from '@genfeedai/prisma';

export interface CampaignTargetDocument
  extends Omit<
    CampaignTarget,
    | 'data'
    | 'errorMessage'
    | 'externalId'
    | 'processedAt'
    | 'replyExternalId'
    | 'replyText'
    | 'replyUrl'
    | 'retryCount'
    | 'scheduleVersion'
    | 'scheduledAt'
    | 'skipReason'
  > {
  authorId?: string | null;
  authorUsername?: string | null;
  contentCreatedAt?: Date | string | null;
  contentText?: string | null;
  contentUrl?: string | null;
  data?: Record<string, unknown>;
  dmSentAt?: Date | null;
  dmText?: string | null;
  errorMessage?: string | null;
  externalId?: string | null;
  matchedKeyword?: string | null;
  platform?: CampaignPlatform | string;
  processedAt?: Date | null;
  recipientUserId?: string | null;
  recipientUsername?: string | null;
  replyExternalId?: string | null;
  replyText?: string | null;
  replyUrl?: string | null;
  retryCount?: number;
  scheduleVersion?: number;
  scheduledAt?: Date | null;
  skipReason?: string | null;
  [key: string]: unknown;
}
