import type { ByokProvider } from '@genfeedai/contracts';
import type { Prisma, PrismaClient } from '@genfeedai/prisma';

export type {
  ServerActivityCreateInput,
  ServerActivityWriter,
} from './collections/activities/activities.port';
export type { ServerCredentialStore } from './collections/credentials/credentials.port';
export type {
  ServerLinkedInTrend,
  ServerLinkedInTrendResolver,
} from './services/integrations/linkedin/linkedin-trends.port';
export type {
  IPublisher,
  MediaInfo,
  PostValidationResult,
  PublishContext,
  PublisherPostInput,
  PublishResult,
  ThreadChild,
} from './services/integrations/publishers/interfaces/publisher.interface';
export {
  TIKTOK_APP_HANDOFF_SETTING,
  WORKFLOW_APPROVED_SCHEDULE_SETTING,
} from './services/integrations/publishers/interfaces/publisher.interface';
export type { ServerPublisherFactory } from './services/integrations/publishers/publisher-factory.port';
export type {
  ServerYoutubeUploader,
  YoutubeUploadPostInput,
} from './services/integrations/youtube/youtube-uploads.port';

export const SERVER_TOKENS = {
  activities: 'SERVER_ACTIVITIES',
  analyticsCollectionState: 'SERVER_ANALYTICS_COLLECTION_STATE',
  byok: 'SERVER_BYOK',
  config: 'SERVER_CONFIG',
  credentials: 'SERVER_CREDENTIALS',
  customerInstances: 'SERVER_CUSTOMER_INSTANCES',
  instagram: 'SERVER_INSTAGRAM',
  linkedIn: 'SERVER_LINKEDIN',
  linkedInTrends: 'SERVER_LINKEDIN_TRENDS',
  logger: 'SERVER_LOGGER',
  mastodon: 'SERVER_MASTODON',
  notifications: 'SERVER_NOTIFICATIONS',
  pinterest: 'SERVER_PINTEREST',
  postAnalytics: 'SERVER_POST_ANALYTICS',
  posts: 'SERVER_POSTS',
  prisma: 'SERVER_PRISMA',
  publisherFactory: 'SERVER_PUBLISHER_FACTORY',
  tiktok: 'SERVER_TIKTOK',
  twitter: 'SERVER_TWITTER',
  youtube: 'SERVER_YOUTUBE',
  youtubeUploads: 'SERVER_YOUTUBE_UPLOADS',
  brandMemorySync: 'SERVER_BRAND_MEMORY_SYNC',
} as const;

export interface ServerConfig {
  get(key: string): string | undefined;
}

export interface ServerByokResolver {
  resolveApiKey(
    organizationId: string,
    provider: ByokProvider,
  ): Promise<{ apiKey: string; apiSecret?: string } | undefined>;
}

export interface ServerCustomerInstanceResolver {
  findRunningForOrg(
    orgId: string,
    role: 'images' | 'voices' | 'videos',
  ): Promise<{ apiUrl?: string | null } | null>;
}

export interface ServerLogger {
  error(message: string, trace?: unknown, context?: unknown): void;
  log(message: string, context?: unknown): void;
  warn(message: string, context?: unknown): void;
}

export interface ServerTwitterAnalytics {
  getMediaAnalyticsBatch(
    tweetIds: string[],
    accessToken: string,
    accessTokenSecret?: string,
  ): Promise<Map<string, unknown>>;
}

export interface ServerYouTubeAnalytics {
  getChannelDetails?(
    organizationId: string,
    brandId: string,
    authOrSkipRefresh?: unknown,
  ): Promise<{ subscriberCount?: number }>;
  getMediaAnalyticsBatch(
    organizationId: string,
    brandId: string,
    videoIds: string[],
    credentialId?: string,
  ): Promise<Map<string, unknown>>;
}

export interface ServerSocialAnalytics {
  getMediaAnalytics(
    organizationId: string,
    brandId: string,
    externalId: string,
    credentialId?: string,
  ): Promise<{
    clicks?: number;
    comments?: number;
    engagementRate?: number;
    impressions?: number;
    likes?: number;
    mediaType?: string;
    reach?: number;
    saves?: number;
    shares?: number;
    views?: number;
    [key: string]: unknown;
  }>;
}

export interface ServerPostAnalytics {
  processInstagramAnalytics(postId: string, analytics: unknown): Promise<void>;
  processLinkedInAnalytics(postId: string, analytics: unknown): Promise<void>;
  processMastodonAnalytics(postId: string, analytics: unknown): Promise<void>;
  processPinterestAnalytics(postId: string, analytics: unknown): Promise<void>;
  processTikTokAnalytics(postId: string, analytics: unknown): Promise<void>;
  processTwitterAnalytics(postId: string, analytics: unknown): Promise<void>;
  processYouTubeAnalytics(postId: string, analytics: unknown): Promise<void>;
}

export interface ServerPosts {
  patch(
    postId: string,
    data: { isAnalyticsEnabled: boolean },
  ): Promise<unknown>;
}

export interface ServerNotifications {
  sendEmail(email: string, subject: string, html: string): Promise<void>;
}

export interface ServerBrandMemorySync {
  detectThresholdAlerts(
    organizationId: string,
    brandId: string,
  ): Promise<
    Array<{
      type: 'spike' | 'drop';
      metric: 'engagementRate';
      recentAverage: number;
      baselineAverage: number;
      ratio: number;
    }>
  >;
  syncPostPerformance(
    organizationId: string,
    brandId: string,
    postId: string,
  ): Promise<void>;
}

export interface ServerPostAnalyticsRecord {
  brandId: string | null;
  date: Date | string | number;
  id: string;
  engagementRate: number | null;
  platform: string | null;
  postId: string | null;
  totalComments: number | null;
  totalLikes: number | null;
  totalSaves: number | null;
  totalShares: number | null;
  totalViews: number | null;
  userId: string | null;
}

export interface ServerPostRecord {
  category: string | null;
  contentRunId: string | null;
  creativeVersion: string | null;
  description: string | null;
  externalId: string | null;
  generationId: string | null;
  hookVersion: string | null;
  id: string;
  label: string | null;
  personaId: string | null;
  publicationDate: Date | null;
  publishIntent: string | null;
  scheduleSlot: string | null;
  variantId: string | null;
}

export interface ServerPrisma {
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
  $transaction: PrismaClient['$transaction'];
  agentMessage: PrismaClient['agentMessage'];
  agentThread: PrismaClient['agentThread'];
  activity: PrismaClient['activity'];
  article: PrismaClient['article'];
  asset: PrismaClient['asset'];
  adBulkUploadJob: PrismaClient['adBulkUploadJob'];
  adCreativeMapping: PrismaClient['adCreativeMapping'];
  adOptimizationAuditLog: PrismaClient['adOptimizationAuditLog'];
  adOptimizationConfig: PrismaClient['adOptimizationConfig'];
  adOptimizationRecommendation: PrismaClient['adOptimizationRecommendation'];
  adPerformance: PrismaClient['adPerformance'];
  adWatchedAdvertiser: PrismaClient['adWatchedAdvertiser'];
  brand: PrismaClient['brand'];
  contentVersionPin: PrismaClient['contentVersionPin'];
  credential: PrismaClient['credential'];
  customerInstance: PrismaClient['customerInstance'];
  contentPerformance: {
    create(args: unknown): Promise<unknown>;
    findFirst(
      args: unknown,
    ): Promise<{ createdAt: Date; data: unknown } | null>;
  };
  lifecycleEmailDelivery: {
    findFirst(args: unknown): Promise<{
      id: string;
      email: string;
      sequence: string;
      step: string;
      triggerKey: string;
      status: string;
      scheduledFor: Date;
      metadata: unknown;
      user: {
        id: string;
        email: string | null;
        firstName: string | null;
        isDeleted: boolean;
      };
    } | null>;
    update(args: unknown): Promise<unknown>;
  };
  lifecycleEmailPreference: {
    create(args: unknown): Promise<{
      id: string;
      marketingUnsubscribedAt: Date | null;
      unsubscribeToken: string;
    }>;
    findUnique(args: unknown): Promise<{
      id: string;
      marketingUnsubscribedAt: Date | null;
      unsubscribeToken: string;
    } | null>;
    update(args: unknown): Promise<unknown>;
  };
  organization: PrismaClient['organization'];
  ingredient: PrismaClient['ingredient'];
  member: PrismaClient['member'];
  newsletter: PrismaClient['newsletter'];
  post: PrismaClient['post'];
  workflow: PrismaClient['workflow'];
  workflowExecution: PrismaClient['workflowExecution'];
  publishApproval: PrismaClient['publishApproval'];
  postAnalytics: {
    aggregate(args: unknown): Promise<{
      _avg: {
        engagementRate: number | null;
      };
    }>;
    findMany(args: unknown): Promise<ServerPostAnalyticsRecord[]>;
  };
  subscription: {
    findFirst(args: unknown): Promise<{ id: string } | null>;
  };
  user: {
    findUnique(args: unknown): Promise<{ email: string | null } | null>;
  };
  userSubscription: {
    findFirst(args: unknown): Promise<{ id: string } | null>;
  };
}
