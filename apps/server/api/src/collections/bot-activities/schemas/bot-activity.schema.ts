import type { BotActivity } from '@genfeedai/prisma';

export type { BotActivity } from '@genfeedai/prisma';

export interface BotActivityDocument extends Omit<BotActivity, 'data'> {
  _id: string;
  botType?: string;
  brand?: string | null;
  completedAt?: Date | null;
  data?: Record<string, unknown>;
  dmSent?: boolean;
  dmText?: string;
  errorDetails?: Record<string, unknown>;
  errorMessage?: string;
  monitoredAccount?: string | null;
  organization: string;
  processedAt?: Date | null;
  replyBotConfig?: string | null;
  replyText?: string;
  replyTweetId?: string;
  replyTweetText?: string;
  replyTweetUrl?: string;
  skipReason?: string;
  status?: string;
  user?: string;
  [key: string]: unknown;
}
