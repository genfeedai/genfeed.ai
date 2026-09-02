import type {
  CampaignPlatform,
  CampaignStatus,
  CampaignType,
  ReplyLength,
  ReplyTone,
} from '@genfeedai/contracts';
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
  dueAt?: string;
  enabled?: boolean;
  endTime?: string;
  localDateTime?: string;
  startTime?: string;
  timezone?: string;
  version?: number;
  [key: string]: unknown;
};

export interface OutreachCampaignDocument
  extends Omit<
    OutreachCampaign,
    'config' | 'status' | 'campaignType' | 'isActive' | 'platform'
  > {
  aiConfig?: CampaignAiConfig;
  campaignType?: CampaignType | string;
  completedAt?: Date | null;
  config?: Record<string, unknown>;
  credentialId: string | null;
  description?: string;
  discoveryConfig?: CampaignDiscoveryConfig;
  dmConfig?: CampaignDmConfig;
  isActive?: boolean;
  label?: string;
  platform?: CampaignPlatform | string;
  rateLimits?: CampaignRateLimits;
  schedule?: CampaignSchedule;
  startedAt?: Date | null;
  status: CampaignStatus | string;
  totalReplies?: number;
  totalSuccessful?: number;
  [key: string]: unknown;
}
