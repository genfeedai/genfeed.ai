import type { MonitoredAccount } from '@genfeedai/prisma';

export type { MonitoredAccount } from '@genfeedai/prisma';

export type MonitoredAccountFilters = {
  keywords?: {
    include: string[];
    exclude: string[];
  };
  hashtags?: {
    include: string[];
    exclude: string[];
  };
  mediaType?: string;
  minEngagement?: {
    minRetweets: number;
    minLikes: number;
    minReplies: number;
  };
  [key: string]: unknown;
};

export interface MonitoredAccountDocument
  extends Omit<MonitoredAccount, 'config'> {
  _id: string;
  botConfig?: string | null;
  brand?: string | null;
  config?: Record<string, unknown>;
  credential?: string | null;
  filters?: MonitoredAccountFilters;
  isActive?: boolean;
  lastCheckedAt?: string;
  lastCheckedTweetId?: string;
  lastProcessedAt?: string;
  lastProcessedTweetId?: string;
  organization: string;
  repliesSentCount?: number;
  tweetsProcessedCount?: number;
  twitterAvatarUrl?: string;
  twitterDisplayName?: string;
  twitterUserId?: string;
  twitterUsername?: string;
  user?: string;
  [key: string]: unknown;
}
