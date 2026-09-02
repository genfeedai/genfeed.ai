import type {
  BotActivityStatus,
  ReplyBotActionType,
  ReplyBotPlatform,
  ReplyBotType,
} from '../..';

/**
 * Credential data for platform authentication
 */
export interface IReplyBotCredentialData {
  /**
   * The credential row this data was loaded from. A brand may hold several
   * accounts on one platform, so downstream calls carry this id to act as the
   * same account the bot was configured with rather than the brand's default.
   */
  id?: string;
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
  contentId?: string;
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
  activeDays: string[];
  activeHoursStart: string;
  activeHoursEnd: string;
}

export interface IReplyBotFilters {
  excludeAuthorIds?: string[];
  excludeAuthors?: string[];
  keywords: string[];
  hashtags: string[];
  excludeKeywords: string[];
  excludeUrls?: string[];
  minFollowers?: number;
  maxFollowers?: number;
  maxAgeHours?: number;
  minTextLength?: number;
  requireVerified?: boolean;
  excludedUrls?: string[];
}

export interface IReplyBotConfig {
  id: string;
  createdAt: string;
  updatedAt: string;

  organizationId: string;
  brandId?: string;
  userId: string;
  credentialId?: string;

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

  monitoredAccountIds: string[];
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

  organizationId: string;
  brandId?: string;
  userId: string;
  botConfigId?: string;
  credentialId?: string;

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

  organizationId: string;
  brandId?: string;
  userId: string;
  replyBotConfigId?: string;
  monitoredAccountId?: string;

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
