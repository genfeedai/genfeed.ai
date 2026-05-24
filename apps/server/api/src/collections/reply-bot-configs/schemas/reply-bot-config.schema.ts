import type {
  ReplyBotActionType,
  ReplyBotType,
  ReplyLength,
  ReplyTone,
} from '@genfeedai/enums';
import type { ReplyBotConfig } from '@genfeedai/prisma';

export type { ReplyBotConfig } from '@genfeedai/prisma';

export interface ReplyBotDmConfig {
  context?: string;
  ctaLink?: string;
  customInstructions?: string;
  delaySeconds?: number;
  enabled?: boolean;
  offer?: string;
  template?: string;
  useAiGeneration?: boolean;
  [key: string]: unknown;
}

export interface ReplyBotRateLimits {
  cooldownMinutes?: number;
  currentDayCount?: number;
  currentHourCount?: number;
  dayResetAt?: Date | string;
  hourResetAt?: Date | string;
  maxRepliesPerAccountPerDay?: number;
  maxRepliesPerDay?: number;
  maxRepliesPerHour?: number;
  [key: string]: unknown;
}

export interface ReplyBotSchedule {
  activeDays?: string[];
  activeHoursEnd?: string;
  activeHoursStart?: string;
  enabled?: boolean;
  endTime?: string;
  startTime?: string;
  timezone?: string;
  [key: string]: unknown;
}

export interface ReplyBotFilters {
  excludeKeywords?: string[];
  filters?: string[];
  hashtags?: {
    exclude?: string[];
    include?: string[];
    [key: string]: unknown;
  };
  includeKeywords?: string[];
  keywords?: {
    exclude?: string[];
    include?: string[];
    [key: string]: unknown;
  };
  mediaType?: string;
  minEngagement?: {
    minLikes?: number;
    minReplies?: number;
    minRetweets?: number;
    [key: string]: unknown;
  };
  minFollowers?: number;
  [key: string]: unknown;
}

export interface ReplyBotConfigDocument extends Omit<ReplyBotConfig, 'config'> {
  _id: string;
  actionType?: ReplyBotActionType | string;
  brand?: string | null;
  config?: Record<string, unknown>;
  context?: string;
  customInstructions?: string;
  description?: string;
  dmConfig?: ReplyBotDmConfig;
  filters?: ReplyBotFilters;
  isActive?: boolean;
  label?: string;
  lastActivityAt?: Date | string;
  lastProcessedTweetId?: string;
  monitoredAccounts?: string[];
  organization: string;
  rateLimits?: ReplyBotRateLimits;
  replyLength?: ReplyLength | string;
  replyTone?: ReplyTone | string;
  totalDmsSent?: number;
  totalFailed?: number;
  totalRepliesSent?: number;
  totalSkipped?: number;
  type?: ReplyBotType | string;
  user?: string;
  [key: string]: unknown;
}
