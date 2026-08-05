import type { BotActivity } from '@genfeedai/prisma';

export type { BotActivity } from '@genfeedai/prisma';

export interface BotActivityDocument extends Omit<BotActivity, 'data'> {
  botType?: string;
  completedAt?: Date | null;
  data?: Record<string, unknown>;
  dmSent?: boolean;
  dmText?: string;
  errorDetails?: Record<string, unknown>;
  errorMessage?: string;
  processedAt?: Date | null;
  replyText?: string;
  replyTweetId?: string;
  replyTweetText?: string;
  replyTweetUrl?: string;
  skipReason?: string;
  status?: string;
  [key: string]: unknown;
}
