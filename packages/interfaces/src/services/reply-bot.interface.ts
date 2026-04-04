import type {
  BotActivityStatus,
  ReplyBotActionType,
  ReplyBotPlatform,
  ReplyBotType,
} from '@genfeedai/enums';

/**
 * Credential data for platform authentication
 */
export interface IReplyBotCredentialData {
  accessToken: string;
  accessTokenSecret?: string;
  refreshToken?: string;
  externalId?: string;
  username?: string;
  platform?: ReplyBotPlatform;
  organizationId?: string;
  brandId?: string;
}

/**
 * Minimal content data needed for posting replies
 */
export interface IReplyBotContentData {
  id: string;
  text: string;
  authorId: string;
  authorUsername: string;
  createdAt: Date;
}

export interface IReplyBotReplyResult {
  success: boolean;
  contentId?: string;
  contentUrl?: string;
  error?: string;
}

export interface IReplyBotDmResult {
  success: boolean;
  error?: string;
}

export interface IReplyBotRateLimits {
  maxRepliesPerHour: number;
  maxRepliesPerDay: number;
  maxRepliesPerAccountPerDay?: number;
  maxDmsPerHour?: number;
  maxDmsPerDay?: number;
  cooldownMinutes?: number;
  currentHourCount?: number;
  currentDayCount?: number;
  hourResetAt?: string;
  dayResetAt?: string;
}

export interface IReplyBotDmConfig {
  enabled: boolean;
  template?: string;
  useAiGeneration: boolean;
  delaySeconds: number;
  context?: string;
  customInstructions?: string;
  ctaLink?: string;
  offer?: string;
}

export interface IReplyBotSchedule {
  enabled: boolean;
  timezone: string;
  daysOfWeek: number[];
  startHour: number;
  endHour: number;
}

export interface IReplyBotFilters {
  keywords: string[];
  hashtags: string[];
  excludeKeywords: string[];
  minFollowers?: number;
  maxFollowers?: number;
  requireVerified?: boolean;
}

export interface IReplyBotConfig {
  id: string;
  createdAt: string;
  updatedAt: string;

  organization: string;
  brand?: string;
  user?: string;
  credential?: string;

  name: string;
  description?: string;
  type: ReplyBotType;
  platform: ReplyBotPlatform;
  actionType: ReplyBotActionType;

  isActive: boolean;
  replyTone?: string;
  replyLength?: string;
  replyInstructions?: string;
  templateId?: string;
  dmConfig?: IReplyBotDmConfig;
  rateLimits: IReplyBotRateLimits;
  schedule?: IReplyBotSchedule;
  filters?: IReplyBotFilters;

  monitoredAccounts: string[];
  totalRepliesSent: number;
  totalDmsSent: number;
  totalSkipped: number;
  totalFailed: number;
  lastActivityAt?: string;
}

export interface IMonitoredAccount {
  id: string;
  createdAt: string;
  updatedAt: string;

  organization: string;
  brand?: string;
  user?: string;
  botConfig?: string;

  platform: ReplyBotPlatform;
  externalId: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  followersCount?: number;
  bio?: string;

  isActive: boolean;
  lastCheckedAt?: string;
  lastPostId?: string;
}

export interface IBotActivity {
  id: string;
  createdAt: string;
  updatedAt: string;

  organization: string;
  replyBotConfig: string;
  monitoredAccount?: string;

  platform: ReplyBotPlatform;
  status: BotActivityStatus;

  triggerContentId: string;
  triggerContentText: string;
  triggerContentAuthor: string;
  triggerContentUrl?: string;
  replyText?: string;
  replyContentId?: string;
  replyContentUrl?: string;
  dmText?: string;
  dmSent: boolean;
  processingTimeMs?: number;
  errorMessage?: string;
  skippedReason?: string;
}

export interface IBotActivityStats {
  totalActivities: number;
  repliesSent: number;
  dmsSent: number;
  skipped: number;
  failed: number;
  avgProcessingTimeMs: number;
}
