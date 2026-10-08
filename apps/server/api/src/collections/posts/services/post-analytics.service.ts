import {
  LearningCheckpointService,
  learningCheckpointCollection,
} from '@api/collections/content-learning/services/learning-checkpoint.service';
import { learningHash } from '@api/collections/content-learning/services/learning-operation.service';
import {
  parseLearningPublicationSourceV1,
  resolveLearningPublicationSourceV1,
} from '@api/collections/content-learning/services/learning-publication-source.helper';
import { OutliersService } from '@api/collections/outliers/services/outliers.service';
import { CreatePostAnalyticsDto } from '@api/collections/posts/dto/create-post-analytics.dto';
import { PostAnalyticsEntity } from '@api/collections/posts/entities/post-analytics.entity';
import { type PostDocument } from '@api/collections/posts/post.schema';
import type { PostAnalyticsDocument } from '@api/collections/posts/schemas/post-analytics.schema';
import {
  mapTikTokPostMetrics,
  mapYouTubePostMetrics,
  type TikTokPostMetrics,
  type UpdateTodayAnalyticsMetrics,
  type YouTubePostMetrics,
} from '@api/collections/posts/services/post-analytics-platform-metrics';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { CONTENT_LEARNING_ACTION_IDS } from '@api/collections/workflows/templates/content-learning-workflows.template';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { fromPrismaCredentialPlatform } from '@genfeedai/contracts';
import type { AnalyticsPersistenceContext } from '@genfeedai/contracts/interfaces';
import { type LearningMetrics } from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import type { LearningPublicationSourceV1 } from '@genfeedai/contracts/interfaces/analytics/outlier-persistence.interface';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import type { CredentialPlatform, Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

const CREDENTIAL_PLATFORM = {
  FACEBOOK: 'FACEBOOK' as CredentialPlatform,
  INSTAGRAM: 'INSTAGRAM' as CredentialPlatform,
  LINKEDIN: 'LINKEDIN' as CredentialPlatform,
  MASTODON: 'MASTODON' as CredentialPlatform,
  PINTEREST: 'PINTEREST' as CredentialPlatform,
  THREADS: 'THREADS' as CredentialPlatform,
  TIKTOK: 'TIKTOK' as CredentialPlatform,
  TWITTER: 'TWITTER' as CredentialPlatform,
  YOUTUBE: 'YOUTUBE' as CredentialPlatform,
};

@Injectable()
export class PostAnalyticsService extends BaseService<
  PostAnalyticsDocument,
  CreatePostAnalyticsDto,
  Partial<CreatePostAnalyticsDto>
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,

    private readonly postsService: PostsService,
    private readonly outliersService: OutliersService,
    private readonly checkpoints: LearningCheckpointService,
    private readonly workflowQueue: WorkflowExecutionQueueService,
  ) {
    super(prisma, 'postAnalytics', logger);
  }

  async prepareLearningObservation(
    input: Pick<
      LearningPublicationSourceV1,
      | 'organizationId'
      | 'brandId'
      | 'credentialId'
      | 'postId'
      | 'platform'
      | 'externalId'
    >,
  ): Promise<LearningPublicationSourceV1 | null> {
    const source = await resolveLearningPublicationSourceV1(
      this.prisma,
      input.organizationId,
      input.postId,
    );
    return source &&
      source.organizationId === input.organizationId &&
      source.brandId === input.brandId &&
      source.credentialId === input.credentialId &&
      source.postId === input.postId &&
      source.platform === input.platform &&
      source.externalId === input.externalId
      ? source
      : null;
  }
  private async persistLearningObservation(
    postId: string,
    platform: CredentialPlatform,
    metrics: UpdateTodayAnalyticsMetrics,
    context: AnalyticsPersistenceContext,
  ): Promise<void> {
    const observation = context.learningObservation;
    const source = parseLearningPublicationSourceV1(
      observation?.publicationSource,
    );
    if (
      !metrics.learningMetrics ||
      !observation ||
      !source ||
      source.organizationId !== context.organizationId ||
      source.brandId !== context.brandId ||
      source.credentialId !== context.credentialId ||
      source.postId !== postId ||
      source.platform !== fromPrismaCredentialPlatform(platform) ||
      typeof observation.sourceAttemptId !== 'string' ||
      !observation.sourceAttemptId.trim() ||
      !(observation.requestStartedAt instanceof Date) ||
      !Number.isFinite(observation.requestStartedAt.getTime()) ||
      !(observation.receivedAt instanceof Date) ||
      !Number.isFinite(observation.receivedAt.getTime())
    )
      return;
    const checkpoint = await this.checkpoints.capture({
      organizationId: context.organizationId,
      postId,
      credentialId: context.credentialId,
      format: 'text',
      objective: 'engagement',
      publishedAt: new Date(source.publishedAt),
      requestStartedAt: observation.requestStartedAt,
      receivedAt: observation.receivedAt,
      sourceAttemptId: observation.sourceAttemptId,
      learningMetrics: metrics.learningMetrics,
      publicationSource: source,
    });
    if (
      checkpoint?.validity !== 'valid' ||
      learningCheckpointCollection(checkpoint)?.outcome !== 'observed'
    )
      return;
    await this.queueMaterializationRefresh(context);
  }
  private async queueMaterializationRefresh(
    context: AnalyticsPersistenceContext,
  ): Promise<void> {
    try {
      const account = await this.prisma.contentLearningAccount.findFirst({
        where: {
          organizationId: context.organizationId,
          brandId: context.brandId,
          credentialId: context.credentialId,
          isDeleted: false,
        },
      });
      if (
        !account ||
        account.mode === 'disabled' ||
        ![account.epoch, account.evidenceRevision].every(
          (value) =>
            Number.isInteger(value) && value >= 0 && value <= 2147483647,
        )
      )
        return;
      const bucket = Math.floor(Date.now() / 300000);
      await this.workflowQueue.queueSystemWorkflow(
        {
          organizationId: context.organizationId,
          actionType: CONTENT_LEARNING_ACTION_IDS.RECONCILE,
          canonicalId: CONTENT_LEARNING_ACTION_IDS.RECONCILE,
          inputValues: {
            credentialId: context.credentialId,
            materializationOnly: true,
            refreshBucket: bucket,
          },
          source: 'content-learning-analytics',
        },
        'learning-materialize-' +
          learningHash([
            context.organizationId,
            context.credentialId,
            account.epoch,
            account.evidenceRevision,
            bucket,
          ]),
        { attempts: 3, dispatchClass: SystemWorkflowDispatchClass.BACKGROUND },
      );
    } catch {
      this.logger.warn('learning_materialization_enqueue_failed', {
        organizationId: context.organizationId,
        brandId: context.brandId,
        credentialId: context.credentialId,
      });
    }
  }
  async refreshOutliers(context: AnalyticsPersistenceContext) {
    return this.outliersService.refresh({
      organizationId: context.organizationId,
      brandId: context.brandId,
      accountType: 'credential',
      accountId: context.credentialId,
    });
  }

  async updateTodayAnalytics(
    postId: string,
    platform: CredentialPlatform,
    metrics: UpdateTodayAnalyticsMetrics,
    context: AnalyticsPersistenceContext,
  ): Promise<PostAnalyticsEntity | null> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find yesterday's analytics to calculate increments
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Fetch post to get required fields for upsert
    const post = await this.postsService.findOne({
      id: postId,
      organizationId: context.organizationId,
      brandId: context.brandId,
      isDeleted: false,
    });
    if (!post) {
      this.logger.error(`Post ${postId} not found for analytics update`);
      throw new Error('Analytics post not found in account scope');
    }

    // Analytics ownership always comes from canonical scalar foreign keys.
    const owner = this.resolvePostOwner(post);
    if (!owner) {
      return null;
    }

    const yesterdayAnalytics = await this.prisma.postAnalytics.findFirst({
      where: {
        date: yesterday,
        platform,
        postId,
        organizationId: owner.organizationId,
        isDeleted: false,
      },
    });

    const yDoc = yesterdayAnalytics as unknown as Record<string, number> | null;

    const increments = {
      totalCommentsIncrement:
        metrics.totalComments - (yDoc?.totalComments || 0),
      totalLikesIncrement: metrics.totalLikes - (yDoc?.totalLikes || 0),
      totalSavesIncrement: (metrics.totalSaves || 0) - (yDoc?.totalSaves || 0),
      totalSharesIncrement:
        (metrics.totalShares || 0) - (yDoc?.totalShares || 0),
      totalViewsIncrement: metrics.totalViews - (yDoc?.totalViews || 0),
    };

    // Calculate engagement rate
    const engagementRate =
      metrics.totalViews > 0
        ? ((metrics.totalLikes +
            metrics.totalComments +
            (metrics.totalShares || 0)) /
            metrics.totalViews) *
          100
        : 0;

    const credentialId = context.credentialId;
    if (
      !credentialId ||
      (metrics.credentialId && metrics.credentialId !== credentialId) ||
      (post.credentialId && post.credentialId !== credentialId)
    ) {
      throw new Error('Outlier analytics requires an unambiguous credential');
    }
    const account = {
      organizationId: owner.organizationId,
      brandId: owner.brandId,
      accountType: 'credential' as const,
      accountId: credentialId,
    };
    await this.outliersService.authorize(account);
    const dailyMetrics = { ...metrics };
    delete dailyMetrics.learningMetrics;
    const attributedMetrics = {
      ...dailyMetrics,
      credentialId,
      isPinned: metrics.isPinned ?? null,
      isPromoted: metrics.isPromoted ?? null,
      metricAvailability: {
        views:
          Number.isSafeInteger(metrics.totalViews) && metrics.totalViews >= 0
            ? 'observed'
            : 'unavailable',
        ...metrics.metricAvailability,
      },
    };
    const credential = await this.prisma.credential.findFirst({
      where: {
        id: credentialId,
        organizationId: owner.organizationId,
        brandId: owner.brandId,
        isDeleted: false,
      },
      select: { platform: true },
    });
    if (
      !credential ||
      fromPrismaCredentialPlatform(credential.platform) !==
        fromPrismaCredentialPlatform(platform)
    )
      throw new Error('Outlier analytics credential is unavailable');
    const result = await this.prisma.postAnalytics.upsert({
      create: {
        brandId: owner.brandId,
        date: today,
        engagementRate,
        organizationId: owner.organizationId,
        platform,
        postId,
        userId: owner.userId,
        ...attributedMetrics,
        ...increments,
      } as Prisma.PostAnalyticsUncheckedCreateInput,
      update: {
        engagementRate,
        ...attributedMetrics,
        ...increments,
      } as Prisma.PostAnalyticsUpdateInput,
      where: {
        postId_platform_date: { date: today, platform, postId },
        organizationId: owner.organizationId,
        isDeleted: false,
      },
    });

    await this.persistLearningObservation(postId, platform, metrics, context);
    return result
      ? new PostAnalyticsEntity(result as PostAnalyticsDocument)
      : null;
  }

  async getPostAnalyticsSummary(
    postId: string,
    organizationId: string,
  ): Promise<{
    totalViews: number;
    totalLikes: number;
    totalComments: number;
    totalShares: number;
    totalSaves: number;
    avgEngagementRate: number;
    platforms: Record<
      string,
      {
        totalViews: number;
        totalLikes: number;
        totalComments: number;
        totalShares: number;
        totalSaves: number;
        engagementRate: number;
      }
    >;
  }> {
    const allDocs = await this.prisma.postAnalytics.findMany({
      where: scopedWhere(organizationId, { postId }),
    });

    const docs = allDocs as unknown as Array<{
      platform: string;
      engagementRate: number;
      totalComments: number;
      totalLikes: number;
      totalSaves: number;
      totalShares: number;
      totalViews: number;
    }>;

    // Group in memory
    const platformMap = new Map<
      string,
      {
        engagementRates: number[];
        comments: number;
        likes: number;
        saves: number;
        shares: number;
        views: number;
      }
    >();

    for (const doc of docs) {
      const existing = platformMap.get(doc.platform);
      if (existing) {
        // Take max values for totals
        existing.views = Math.max(existing.views, doc.totalViews);
        existing.likes = Math.max(existing.likes, doc.totalLikes);
        existing.comments = Math.max(existing.comments, doc.totalComments);
        existing.shares = Math.max(existing.shares, doc.totalShares);
        existing.saves = Math.max(existing.saves, doc.totalSaves);
        existing.engagementRates.push(doc.engagementRate);
      } else {
        platformMap.set(doc.platform, {
          comments: doc.totalComments,
          engagementRates: [doc.engagementRate],
          likes: doc.totalLikes,
          saves: doc.totalSaves,
          shares: doc.totalShares,
          views: doc.totalViews,
        });
      }
    }

    const platforms: Record<
      string,
      {
        totalViews: number;
        totalLikes: number;
        totalComments: number;
        totalShares: number;
        totalSaves: number;
        engagementRate: number;
      }
    > = {};

    let totalViews = 0;
    let totalLikes = 0;
    let totalComments = 0;
    let totalShares = 0;
    let totalSaves = 0;
    let totalEngagement = 0;

    for (const [platform, data] of platformMap.entries()) {
      const avgEngagementRate =
        data.engagementRates.length > 0
          ? data.engagementRates.reduce((a, b) => a + b, 0) /
            data.engagementRates.length
          : 0;

      platforms[platform] = {
        engagementRate: avgEngagementRate,
        totalComments: data.comments,
        totalLikes: data.likes,
        totalSaves: data.saves,
        totalShares: data.shares,
        totalViews: data.views,
      };

      totalViews += data.views;
      totalLikes += data.likes;
      totalComments += data.comments;
      totalShares += data.shares;
      totalSaves += data.saves;
      totalEngagement += avgEngagementRate;
    }

    const platformCount = platformMap.size;

    return {
      avgEngagementRate:
        platformCount > 0 ? totalEngagement / platformCount : 0,
      platforms,
      totalComments,
      totalLikes,
      totalSaves,
      totalShares,
      totalViews,
    };
  }

  async getAnalyticsByDateRange(
    postId: string,
    startDate: Date,
    endDate: Date,
    organizationId: string,
    platform?: string,
  ): Promise<PostAnalyticsEntity[]> {
    const where: Record<string, unknown> = {
      date: { gte: startDate, lte: endDate },
      postId,
    };

    if (platform) {
      where.platform = platform;
    }

    const results = await this.prisma.postAnalytics.findMany({
      orderBy: { date: 'asc' },
      where: scopedWhere(
        organizationId,
        where as Prisma.PostAnalyticsWhereInput,
      ),
    });

    return results.map(
      (doc) => new PostAnalyticsEntity(doc as PostAnalyticsDocument),
    );
  }

  private resolvePostOwner(post: PostDocument): {
    brandId: string;
    organizationId: string;
    userId: string;
  } | null {
    const { brandId, organizationId, userId } = post;

    if (!brandId || !organizationId || !userId) {
      this.logger.error(
        `Post ${post.id ?? 'unknown'} is missing resolvable owner ids for analytics`,
        {
          hasBrandId: Boolean(brandId),
          hasOrganizationId: Boolean(organizationId),
          hasUserId: Boolean(userId),
        },
      );
      return null;
    }

    return { brandId, organizationId, userId };
  }

  async processTwitterAnalytics(
    postId: string,
    analytics: {
      learningMetrics?: LearningMetrics;
      isPinned?: boolean | null;
      isPromoted?: boolean | null;
      views: number;
      likes: number;
      comments: number;
      retweets?: number;
      bookmarks?: number;
      quotes?: number;
      impressions?: number;
      engagementRate?: number;
      mediaType?: 'text' | 'image' | 'video' | 'mixed';
    },
    context: AnalyticsPersistenceContext,
  ): Promise<void> {
    try {
      await this.updateTodayAnalytics(
        postId,
        CREDENTIAL_PLATFORM.TWITTER,
        {
          learningMetrics: analytics.learningMetrics,
          totalComments: analytics.comments,
          totalLikes: analytics.likes,
          totalShares: analytics.retweets || 0,
          totalViews: analytics.views,
        },
        context,
      );

      this.logger.log(`Updated Twitter analytics for post ${postId}`);
    } catch (error: unknown) {
      this.logger.error(
        `Failed to process Twitter analytics for post ${postId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Process YouTube analytics from batch fetch and update post analytics
   */
  async processYouTubeAnalytics(
    postId: string,
    analytics: YouTubePostMetrics,
    context: AnalyticsPersistenceContext,
  ): Promise<void> {
    try {
      await this.updateTodayAnalytics(
        postId,
        CREDENTIAL_PLATFORM.YOUTUBE,
        mapYouTubePostMetrics(analytics),
        context,
      );

      this.logger.log(`Updated YouTube analytics for post ${postId}`);
    } catch (error: unknown) {
      this.logger.error(
        `Failed to process YouTube analytics for post ${postId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Process Instagram analytics and update post analytics
   */
  async processInstagramAnalytics(
    postId: string,
    analytics: {
      learningMetrics?: LearningMetrics;
      isPinned?: boolean | null;
      isPromoted?: boolean | null;
      views?: number;
      likes: number;
      comments: number;
      shares?: number;
      saves?: number;
      impressions?: number;
      reach?: number;
      engagementRate?: number;
      mediaType?: 'image' | 'video' | 'carousel' | 'reel' | 'story';
    },
    context: AnalyticsPersistenceContext,
  ): Promise<void> {
    try {
      await this.updateTodayAnalytics(
        postId,
        CREDENTIAL_PLATFORM.INSTAGRAM,
        {
          learningMetrics: analytics.learningMetrics,
          impressions: analytics.impressions ?? null,
          metricAvailability: {
            impressions:
              analytics.impressions == null ? 'unavailable' : 'observed',
            reach: analytics.reach == null ? 'unavailable' : 'observed',
            views:
              analytics.learningMetrics?.metrics.views?.availability ??
              'unavailable',
          },
          reach: analytics.reach ?? null,
          totalComments: analytics.comments,
          totalLikes: analytics.likes,
          totalSaves: analytics.saves || 0,
          totalShares: analytics.shares || 0,
          totalViews: analytics.views ?? 0,
          videoViews: analytics.views ?? null,
        },
        context,
      );

      this.logger.log(`Updated Instagram analytics for post ${postId}`);
    } catch (error: unknown) {
      this.logger.error(
        `Failed to process Instagram analytics for post ${postId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Process TikTok analytics and update post analytics
   */
  async processTikTokAnalytics(
    postId: string,
    analytics: TikTokPostMetrics,
    context: AnalyticsPersistenceContext,
  ): Promise<void> {
    try {
      await this.updateTodayAnalytics(
        postId,
        CREDENTIAL_PLATFORM.TIKTOK,
        mapTikTokPostMetrics(analytics),
        context,
      );

      this.logger.log(`Updated TikTok analytics for post ${postId}`);
    } catch (error: unknown) {
      this.logger.error(
        `Failed to process TikTok analytics for post ${postId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Process Pinterest analytics and update post analytics
   */
  async processPinterestAnalytics(
    postId: string,
    analytics: {
      learningMetrics?: LearningMetrics;
      isPinned?: boolean | null;
      isPromoted?: boolean | null;
      views?: number;
      impressions?: number;
      likes: number;
      comments: number;
      saves?: number;
      clicks?: number;
      engagementRate?: number;
    },
    context: AnalyticsPersistenceContext,
  ): Promise<void> {
    try {
      await this.updateTodayAnalytics(
        postId,
        CREDENTIAL_PLATFORM.PINTEREST,
        {
          learningMetrics: analytics.learningMetrics,
          clicks: analytics.clicks ?? null,
          impressions: analytics.impressions ?? null,
          metricAvailability: {
            clicks: analytics.clicks == null ? 'unavailable' : 'observed',
            impressions:
              analytics.impressions == null ? 'unavailable' : 'observed',
            views: analytics.views == null ? 'unavailable' : 'observed',
          },
          totalComments: analytics.comments,
          totalLikes: analytics.likes,
          totalSaves: analytics.saves || 0,
          totalShares: 0,
          totalViews: analytics.views ?? 0,
        },
        context,
      );

      this.logger.log(`Updated Pinterest analytics for post ${postId}`);
    } catch (error: unknown) {
      this.logger.error(
        `Failed to process Pinterest analytics for post ${postId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Process LinkedIn analytics and update post analytics
   */
  async processLinkedInAnalytics(
    postId: string,
    analytics: {
      learningMetrics?: LearningMetrics;
      isPinned?: boolean | null;
      isPromoted?: boolean | null;
      views: number;
      likes: number;
      comments: number;
      shares?: number;
      impressions?: number;
      clicks?: number;
      engagementRate?: number;
      reach?: number;
      mediaType?: 'text' | 'image' | 'video' | 'article' | 'document' | 'mixed';
    },
    context: AnalyticsPersistenceContext,
  ): Promise<void> {
    try {
      await this.updateTodayAnalytics(
        postId,
        CREDENTIAL_PLATFORM.LINKEDIN,
        {
          learningMetrics: analytics.learningMetrics,
          clicks: analytics.clicks ?? null,
          impressions: analytics.impressions ?? null,
          metricAvailability: {
            clicks: analytics.clicks == null ? 'unavailable' : 'observed',
            impressions:
              analytics.impressions == null ? 'unavailable' : 'observed',
            reach: analytics.reach == null ? 'unavailable' : 'observed',
            views: 'observed',
          },
          reach: analytics.reach ?? null,
          totalComments: analytics.comments,
          totalLikes: analytics.likes,
          totalShares: analytics.shares || 0,
          totalViews: analytics.views,
        },
        context,
      );

      this.logger.log(`Updated LinkedIn analytics for post ${postId}`);
    } catch (error: unknown) {
      this.logger.error(
        `Failed to process LinkedIn analytics for post ${postId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Process Mastodon analytics and update post analytics
   * Note: Mastodon API does not expose view counts — views default to 0
   */
  async processMastodonAnalytics(
    postId: string,
    analytics: {
      learningMetrics?: LearningMetrics;
      isPinned?: boolean | null;
      isPromoted?: boolean | null;
      views: number;
      likes: number;
      comments: number;
      boosts: number;
    },
    context: AnalyticsPersistenceContext,
  ): Promise<void> {
    try {
      await this.updateTodayAnalytics(
        postId,
        CREDENTIAL_PLATFORM.MASTODON,
        {
          learningMetrics: analytics.learningMetrics,
          totalComments: analytics.comments,
          totalLikes: analytics.likes,
          totalShares: analytics.boosts,
          metricAvailability: { views: 'unavailable' },
          totalViews: 0, // Mastodon does not expose view counts
        },
        context,
      );

      this.logger.log(`Updated Mastodon analytics for post ${postId}`);
    } catch (error: unknown) {
      this.logger.error(
        `Failed to process Mastodon analytics for post ${postId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Process Facebook analytics and update post analytics
   */
  async processFacebookAnalytics(
    postId: string,
    analytics: {
      learningMetrics?: LearningMetrics;
      isPinned?: boolean | null;
      isPromoted?: boolean | null;
      views: number;
      likes: number;
      comments: number;
      shares: number;
      reach?: number;
      impressions?: number;
      engagementRate?: number;
    },
    context: AnalyticsPersistenceContext,
  ): Promise<void> {
    try {
      await this.updateTodayAnalytics(
        postId,
        CREDENTIAL_PLATFORM.FACEBOOK,
        {
          learningMetrics: analytics.learningMetrics,
          impressions: analytics.impressions ?? null,
          metricAvailability: {
            impressions:
              analytics.impressions == null ? 'unavailable' : 'observed',
            reach: analytics.reach == null ? 'unavailable' : 'observed',
            views:
              analytics.learningMetrics?.metrics.views?.availability ??
              'unavailable',
          },
          reach: analytics.reach ?? null,
          totalComments: analytics.comments,
          totalLikes: analytics.likes,
          totalShares: analytics.shares,
          totalViews: analytics.views,
        },
        context,
      );

      this.logger.log(`Updated Facebook analytics for post ${postId}`);
    } catch (error: unknown) {
      this.logger.error(
        `Failed to process Facebook analytics for post ${postId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Process Threads analytics and update post analytics
   */
  async processThreadsAnalytics(
    postId: string,
    analytics: {
      learningMetrics?: LearningMetrics;
      isPinned?: boolean | null;
      isPromoted?: boolean | null;
      views: number;
      likes: number;
      replies: number;
      reposts: number;
      quotes: number;
    },
    context: AnalyticsPersistenceContext,
  ): Promise<void> {
    try {
      await this.updateTodayAnalytics(
        postId,
        CREDENTIAL_PLATFORM.THREADS,
        {
          learningMetrics: analytics.learningMetrics,
          metricAvailability: {
            views:
              analytics.learningMetrics?.metrics.views?.availability ??
              'unavailable',
          },
          totalComments: analytics.replies,
          totalLikes: analytics.likes,
          totalShares: analytics.reposts + analytics.quotes,
          totalViews: analytics.views,
        },
        context,
      );

      this.logger.log(`Updated Threads analytics for post ${postId}`);
    } catch (error: unknown) {
      this.logger.error(
        `Failed to process Threads analytics for post ${postId}`,
        error,
      );
      throw error;
    }
  }
}
