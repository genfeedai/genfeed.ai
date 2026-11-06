import type {
  ReplyIntent,
  ReplyIntentSource,
} from '@genfeedai/contracts/interfaces';
import type { BotActivity } from '@genfeedai/prisma';

export type { BotActivity } from '@genfeedai/prisma';

/**
 * The document reads its fields from `data`; the promoted filter columns are
 * copies of those keys and are not part of it.
 */
export interface BotActivityDocument
  extends Omit<
    BotActivity,
    | 'botType'
    | 'data'
    | 'dmSent'
    | 'isIntentNeedsReview'
    | 'isManuallyPosted'
    | 'replyTweetId'
    | 'status'
    | 'triggerTweetId'
  > {
  botType?: string;
  completedAt?: Date | null;
  data?: Record<string, unknown>;
  dmSent?: boolean;
  dmText?: string;
  errorDetails?: Record<string, unknown>;
  errorMessage?: string;
  /** Comment intent the reply bot acted on, and how it was reached (#4866). */
  intent?: ReplyIntent;
  intentConfidence?: number;
  intentSource?: ReplyIntentSource;
  /** Queued for a person rather than auto-replied or auto-skipped (#4866). */
  isIntentNeedsReview?: boolean;
  /** Reply drafted for a person to post (`awaiting_approval`). */
  draftReplyText?: string;
  processedAt?: Date | null;
  replyText?: string;
  replyTweetId?: string;
  replyTweetText?: string;
  replyTweetUrl?: string;
  skipReason?: string;
  status?: string;
  triggerTweetAuthorUsername?: string;
  triggerTweetId?: string;
  triggerTweetText?: string;
  [key: string]: unknown;
}
