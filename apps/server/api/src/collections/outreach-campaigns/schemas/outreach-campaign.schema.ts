import type {
  CampaignPlatform,
  CampaignStatus,
  CampaignType,
  ReplyLength,
  ReplyTone,
} from '@genfeedai/enums';
import type { OutreachCampaign } from '@genfeedai/prisma';

export type { OutreachCampaign } from '@genfeedai/prisma';

export type CampaignDiscoveryConfig = {
  keywords: string[];
  hashtags: string[];
  subreddits: string[];
  excludeAuthors: string[];
  minEngagement: number;
  maxEngagement: number;
  maxAgeHours: number;
  minRelevanceScore: number;
};

export type CampaignAiConfig = {
  tone?: ReplyTone | string;
  length?: ReplyLength | string;
  customInstructions?: string;
  context?: string;
  ctaLink?: string;
  useAiGeneration?: boolean;
  templateText?: string;
};

export type CampaignDmConfig = {
  context?: string;
  ctaLink?: string;
  customInstructions?: string;
  followUpText?: string;
  offer?: string;
  templateText?: string;
  useAiGeneration?: boolean;
  followUpEnabled?: boolean;
  followUpDelayHours?: number;
};

export type CampaignRateLimits = {
  currentDayCount?: number;
  currentHourCount?: number;
  dayResetAt?: Date | string;
  delayBetweenRepliesSeconds?: number;
  hourResetAt?: Date | string;
  maxPerDay?: number;
  maxPerHour?: number;
  [key: string]: unknown;
};

export type CampaignSchedule = {
  activeDays?: string[];
  enabled?: boolean;
  endTime?: string;
  startTime?: string;
  timezone?: string;
  [key: string]: unknown;
};

export interface OutreachCampaignDocument
  extends Omit<OutreachCampaign, 'config' | 'status'> {
  _id: string;
  aiConfig?: CampaignAiConfig;
  brand?: string | null;
  campaignType?: CampaignType | string;
  completedAt?: Date | null;
  config?: Record<string, unknown>;
  credential?: string;
  description?: string;
  discoveryConfig?: CampaignDiscoveryConfig;
  dmConfig?: CampaignDmConfig;
  isActive?: boolean;
  label?: string;
  organization: string;
  platform?: CampaignPlatform | string;
  rateLimits?: CampaignRateLimits;
  schedule?: CampaignSchedule;
  startedAt?: Date | null;
  status: CampaignStatus | string;
  totalReplies?: number;
  totalSuccessful?: number;
  user?: string | null;
  [key: string]: unknown;
}
