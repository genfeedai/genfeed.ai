import type { ReplyBotPlatform } from '@genfeedai/enums';
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
  extends Omit<MonitoredAccount, 'config' | 'isActive'> {
  config?: Record<string, unknown>;
  filters?: MonitoredAccountFilters;
  platform?: ReplyBotPlatform;
  externalId?: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  followersCount?: number;
  bio?: string;
  isActive?: boolean;
  lastCheckedAt?: string;
  lastCheckedTweetId?: string;
  lastProcessedAt?: string;
  lastProcessedTweetId?: string;
  repliesSentCount?: number;
  tweetsProcessedCount?: number;
  [key: string]: unknown;
}
