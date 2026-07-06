import type { Prisma } from '@genfeedai/prisma';

export const SERVER_TOKENS = {
  config: 'SERVER_CONFIG',
  credentials: 'SERVER_CREDENTIALS',
  instagram: 'SERVER_INSTAGRAM',
  linkedIn: 'SERVER_LINKEDIN',
  logger: 'SERVER_LOGGER',
  mastodon: 'SERVER_MASTODON',
  notifications: 'SERVER_NOTIFICATIONS',
  pinterest: 'SERVER_PINTEREST',
  postAnalytics: 'SERVER_POST_ANALYTICS',
  posts: 'SERVER_POSTS',
  prisma: 'SERVER_PRISMA',
  tiktok: 'SERVER_TIKTOK',
  twitter: 'SERVER_TWITTER',
  youtube: 'SERVER_YOUTUBE',
  brandMemorySync: 'SERVER_BRAND_MEMORY_SYNC',
} as const;

export interface ServerConfig {
  get(key: string): string | undefined;
}

export interface ServerLogger {
  error(message: string, trace?: unknown, context?: unknown): void;
  log(message: string, context?: unknown): void;
  warn(message: string, context?: unknown): void;
}

export interface ServerCredentialStore {
  findOne(query: unknown): Promise<unknown>;
}

export interface ServerTwitterAnalytics {
  getMediaAnalyticsBatch(
    tweetIds: string[],
    accessToken: string,
    accessTokenSecret?: string,
  ): Promise<Map<string, unknown>>;
}

export interface ServerYouTubeAnalytics {
  getMediaAnalyticsBatch(
    organizationId: string,
    brandId: string,
    videoIds: string[],
  ): Promise<Map<string, unknown>>;
}

export interface ServerSocialAnalytics {
  getMediaAnalytics(
    organizationId: string,
    brandId: string,
    externalId: string,
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
  organization: {
    findUnique(args: unknown): Promise<{
      label: string | null;
      userId: string | null;
    } | null>;
  };
  post: {
    findFirst(args: unknown): Promise<{ id: string } | null>;
    findMany(args: unknown): Promise<ServerPostRecord[]>;
  };
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
