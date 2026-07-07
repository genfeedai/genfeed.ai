import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { TrendsService } from '@api/collections/trends/services/trends.service';
import { SocialAdapterFactory } from '@api/collections/workflows/services/adapters/social-adapter.factory';
import { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import type { TriggerEvent } from '@api/collections/workflows/services/workflow-executor.types';
import { CacheService } from '@api/services/cache/services/cache.service';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { TREND_DIGEST_CREDIT_COST } from '@genfeedai/constants';
import {
  ActivitySource,
  type CredentialPlatform,
  PostCategory,
  PostStatus,
} from '@genfeedai/enums';
import { buildTrendDigestHtml } from '@genfeedai/helpers';
import type {
  KeywordTriggerPlatform,
  SocialPlatform,
  TrendDigestEntry,
  TrendPlatform,
  TrendTriggerOutput,
} from '@genfeedai/workflow-engine';
import {
  createPublishExecutor,
  createSendEmailExecutor,
  createTrendHashtagInspirationExecutor,
  createTrendSoundInspirationExecutor,
  createTrendTriggerExecutor,
  createTrendVideoInspirationExecutor,
  TrendDigestExecutor,
  type WorkflowEngine,
} from '@genfeedai/workflow-engine';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';

export class WorkflowTrendPublishExecutorRegistrarService {
  private readonly logContext = 'WorkflowEngineAdapterService';

  constructor(
    private readonly helper: WorkflowEngineExecutorHelperService,
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly socialAdapterFactory?: SocialAdapterFactory,
    private readonly trendsService?: TrendsService,
    private readonly notificationsService?: NotificationsService,
    private readonly cacheService?: CacheService,
    private readonly prismaService?: PrismaService,
    private readonly creditsUtilsService?: CreditsUtilsService,
    private readonly postsService?: PostsService,
    private readonly credentialsService?: CredentialsService,
    private readonly workflowExecutionQueueService?: WorkflowExecutionQueueService,
  ) {}

  register(engine: WorkflowEngine): void {
    this.registerTrendTriggerExecutor(engine);
    this.registerTrendInspirationExecutors(engine);
    this.registerSendEmailExecutor(engine);
    this.registerTrendDigestExecutor(engine);
    this.registerPublishExecutor(engine);
  }

  async applyScheduledDigestCharge(
    workflowId: string,
    summaries: Array<{ nodeType: string; output?: Record<string, unknown> }>,
  ): Promise<void> {
    if (!this.creditsUtilsService || !this.cacheService) {
      return;
    }

    const digest = summaries.find(
      (summary) => summary.nodeType === 'trendDigest',
    )?.output;
    const email = summaries.find(
      (summary) => summary.nodeType === 'sendEmail',
    )?.output;

    if (digest?.skipped !== false) {
      return;
    }
    if (email?.sent !== true) {
      return;
    }

    const orgId = typeof digest.orgId === 'string' ? digest.orgId : null;
    const ownerUserId =
      typeof digest.ownerUserId === 'string' ? digest.ownerUserId : null;
    const creditCost =
      typeof digest.creditCost === 'number'
        ? digest.creditCost
        : TREND_DIGEST_CREDIT_COST;

    if (!orgId || !ownerUserId) {
      this.loggerService.warn(
        `${this.logContext} trend digest charge skipped — missing orgId or ownerUserId after delivery`,
        { orgId, ownerUserId, workflowId },
      );
      return;
    }

    const chargeKey = `workflow-digest-charged:${workflowId}:${this.digestUtcDateKey()}`;
    const charged = await this.cacheService.acquireLock(chargeKey, 93_600);
    if (!charged) {
      return;
    }

    try {
      await this.creditsUtilsService.deductCreditsFromOrganization(
        orgId,
        ownerUserId,
        creditCost,
        'Daily trends digest',
        ActivitySource.TREND_SCAN,
      );
    } catch (error) {
      this.loggerService.error(
        `${this.logContext} trend digest charge failed`,
        { error, organizationId: orgId, workflowId },
      );
      await this.cacheService.releaseLock(chargeKey);
    }
  }

  private registerTrendTriggerExecutor(engine: WorkflowEngine): void {
    const executor = createTrendTriggerExecutor(async (params) => {
      const keywordMatch = await this.findTrendFromSocialKeywordMatch(params);
      if (keywordMatch) {
        return keywordMatch;
      }

      const topic = params.keywords.find(
        (keyword) => keyword.trim().length > 0,
      );
      if (!topic) {
        return null;
      }

      return {
        hashtags: [this.helper.buildHashtag(topic)],
        platform: params.platform,
        soundId: null,
        topic,
        trendId: `analytics-${params.platform}-${topic
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')}`,
        videoUrl: null,
        viralScore: params.minViralScore,
      };
    });
    engine.registerExecutor(
      executor.nodeType,
      this.helper.wrapEngineExecutor(executor),
    );
  }

  private registerTrendInspirationExecutors(engine: WorkflowEngine): void {
    const trendsService = this.trendsService;

    const hashtagExecutor = createTrendHashtagInspirationExecutor(
      trendsService
        ? async ({ platform, hashtag }) => {
            const hashtags = await trendsService.getTrendingHashtags({
              limit: 25,
              platform,
            });
            const selected =
              (hashtag
                ? hashtags.find(
                    (item) =>
                      item.hashtag.replace(/^#/, '').toLowerCase() ===
                      hashtag.toLowerCase(),
                  )
                : undefined) ?? hashtags[0];
            if (!selected) {
              return null;
            }

            return {
              hashtag: selected.hashtag,
              platform:
                typeof selected.platform === 'string'
                  ? this.normalizeTrendPlatform(selected.platform)
                  : platform,
              postCount:
                typeof selected.postCount === 'number'
                  ? selected.postCount
                  : null,
              relatedHashtags: selected.relatedHashtags ?? [],
            };
          }
        : undefined,
    );
    const soundExecutor = createTrendSoundInspirationExecutor(
      trendsService
        ? async ({ minUsageCount, maxDuration }) => {
            const sounds = await trendsService.getTrendingSounds({ limit: 50 });
            const selected = sounds.find((sound) => {
              const usageCount =
                typeof sound.usageCount === 'number' ? sound.usageCount : 0;
              const duration =
                typeof sound.duration === 'number' ? sound.duration : null;
              return (
                usageCount >= minUsageCount &&
                (maxDuration === null ||
                  duration === null ||
                  duration <= maxDuration)
              );
            });
            if (!selected) {
              return null;
            }

            const soundId =
              selected.soundId ?? selected.externalId ?? selected.id;
            if (!soundId) {
              return null;
            }

            return {
              authorName: selected.authorName ?? null,
              coverUrl: selected.coverUrl ?? null,
              duration:
                typeof selected.duration === 'number'
                  ? selected.duration
                  : null,
              growthRate:
                typeof selected.growthRate === 'number'
                  ? selected.growthRate
                  : null,
              soundId,
              soundName: selected.soundName ?? soundId,
              soundUrl: selected.playUrl ?? null,
              usageCount:
                typeof selected.usageCount === 'number'
                  ? selected.usageCount
                  : null,
            };
          }
        : undefined,
    );
    const videoExecutor = createTrendVideoInspirationExecutor(
      trendsService
        ? async ({ platform, trendId, minViralScore }) => {
            const videos = await trendsService.getViralVideos({
              limit: 25,
              minViralScore,
              platform,
            });
            const selected =
              (trendId
                ? videos.find(
                    (item) =>
                      item.id === trendId ||
                      item.externalId === trendId ||
                      item._id === trendId,
                  )
                : undefined) ?? videos[0];
            if (!selected) {
              return null;
            }

            const selectedTrendId =
              selected.id ?? selected.externalId ?? selected._id;
            if (!selectedTrendId) {
              return null;
            }

            return {
              description: selected.description ?? null,
              duration:
                typeof selected.duration === 'number'
                  ? selected.duration
                  : null,
              hashtags: selected.hashtags ?? [],
              hook: selected.hook ?? null,
              platform:
                typeof selected.platform === 'string'
                  ? this.normalizeTrendPlatform(selected.platform)
                  : platform,
              soundId: selected.soundId ?? null,
              title: selected.title ?? null,
              trendId: selectedTrendId,
              videoUrl: selected.videoUrl ?? selected.playUrl ?? null,
            };
          }
        : undefined,
    );

    for (const executor of [hashtagExecutor, soundExecutor, videoExecutor]) {
      engine.registerExecutor(
        executor.nodeType,
        this.helper.wrapEngineExecutor(executor),
      );
    }
  }

  private normalizeTrendPlatform(
    platform: string,
  ): 'tiktok' | 'instagram' | 'twitter' | 'youtube' | 'reddit' {
    switch (platform.toLowerCase()) {
      case 'instagram':
      case 'twitter':
      case 'youtube':
      case 'reddit':
        return platform.toLowerCase() as
          | 'instagram'
          | 'twitter'
          | 'youtube'
          | 'reddit';
      default:
        return 'tiktok';
    }
  }

  private registerSendEmailExecutor(engine: WorkflowEngine): void {
    if (!this.notificationsService) {
      this.loggerService.warn(
        `${this.logContext} NotificationsService unavailable — sendEmail node disabled`,
      );
      return;
    }

    const notifications = this.notificationsService;
    const executor = createSendEmailExecutor(async ({ to, subject, html }) => {
      await notifications.sendEmail(to, subject, html);
    });

    engine.registerExecutor(
      executor.nodeType,
      this.helper.wrapEngineExecutor(executor),
    );
  }

  private registerTrendDigestExecutor(engine: WorkflowEngine): void {
    if (
      !this.trendsService ||
      !this.prismaService ||
      !this.cacheService ||
      !this.creditsUtilsService
    ) {
      this.loggerService.warn(
        `${this.logContext} dependencies unavailable — trendDigest node disabled`,
      );
      return;
    }

    const trends = this.trendsService;
    const prisma = this.prismaService;
    const cache = this.cacheService;
    const credits = this.creditsUtilsService;
    const appUrl = String(this.configService.get('GENFEEDAI_APP_URL') ?? '');
    const executor = new TrendDigestExecutor();

    executor.setOwnerResolver(async (organizationId) => {
      const organization = await prisma.organization.findFirst({
        select: { user: { select: { email: true } }, userId: true },
        where: { id: organizationId, isDeleted: false },
      });
      if (!organization) {
        return null;
      }
      return {
        email: organization.user?.email ?? null,
        userId: organization.userId ?? null,
      };
    });
    executor.setTrendsProvider(({ topN, minViralScore, platforms }) =>
      this.buildDigestTrends(trends, topN, minViralScore, platforms),
    );
    executor.setIdempotencyGuard((key, ttlSeconds) =>
      cache.acquireLock(key, ttlSeconds),
    );
    executor.setCreditsChecker((organizationId, cost) =>
      credits.checkOrganizationCreditsAvailable(organizationId, cost),
    );
    executor.setRenderer((items, options) => ({
      html: buildTrendDigestHtml(items, {
        appUrl,
        headerTitle: options.headerTitle,
        minViralScore: options.minViralScore,
      }),
      subject: `Your daily trends — ${items.length} trending ${
        items.length === 1 ? 'topic' : 'topics'
      }`,
    }));

    engine.registerExecutor(
      executor.nodeType,
      this.helper.wrapEngineExecutor(executor),
    );
  }

  private registerPublishExecutor(engine: WorkflowEngine): void {
    const postsService = this.postsService;
    const credentialsService = this.credentialsService;
    const executor = createPublishExecutor(
      async ({
        brandId,
        caption,
        media,
        organizationId,
        platforms,
        scheduledFor,
        targetKeyword,
        triggerSeoOptimization,
        userId,
        workflowId,
      }) => {
        if (!postsService || !credentialsService) {
          return {
            platforms,
            postIds: [],
            scheduledFor,
            status: scheduledFor ? 'scheduled' : 'queued',
          };
        }

        const postIds: string[] = [];
        const publishedPlatforms: SocialPlatform[] = [];
        const ingredients = this.helper.extractPublishIngredientIds(media);

        for (const platform of platforms) {
          const credential = await credentialsService.findOne({
            brand: brandId,
            isConnected: true,
            isDeleted: false,
            organization: organizationId,
            platform: platform as CredentialPlatform,
          });

          if (!credential) {
            continue;
          }

          const post = await postsService.create({
            brand: brandId,
            category:
              ingredients.length > 0 ? PostCategory.IMAGE : PostCategory.TEXT,
            credential: credential.id,
            description: caption,
            ingredients,
            label: this.helper.buildPostLabel(caption),
            organization: organizationId,
            platform: credential.platform as CredentialPlatform,
            scheduledDate: scheduledFor ?? undefined,
            status: scheduledFor ? PostStatus.SCHEDULED : PostStatus.DRAFT,
            user: userId,
          });

          postIds.push(post.id.toString());
          publishedPlatforms.push(platform);
        }

        if (triggerSeoOptimization && !scheduledFor && postIds.length > 0) {
          await this.emitPostPublishedIfSafe({
            brandId,
            caption,
            organizationId,
            platforms: publishedPlatforms,
            postIds,
            targetKeyword: targetKeyword ?? null,
            userId,
            workflowId,
          });
        }

        return {
          platforms: publishedPlatforms,
          postIds,
          scheduledFor,
          status: scheduledFor ? 'scheduled' : 'queued',
        };
      },
    );
    engine.registerExecutor(
      executor.nodeType,
      this.helper.wrapEngineExecutor(executor),
    );
  }

  private async emitPostPublishedIfSafe(params: {
    organizationId: string;
    userId: string;
    brandId: string;
    postIds: string[];
    platforms: SocialPlatform[];
    caption: string;
    targetKeyword: string | null;
    workflowId?: string;
  }): Promise<void> {
    let isPostPublishWorkflow = false;
    if (this.prismaService && params.workflowId) {
      try {
        const workflowDoc = await this.prismaService.workflow.findFirst({
          select: { nodes: true },
          where: { id: params.workflowId, isDeleted: false },
        });
        const nodes = Array.isArray(workflowDoc?.nodes)
          ? (workflowDoc.nodes as Array<{ type?: string }>)
          : [];
        isPostPublishWorkflow = nodes.some(
          (node) => node.type === 'postPublishTrigger',
        );
      } catch {
        isPostPublishWorkflow = true;
      }
    }

    if (isPostPublishWorkflow) {
      this.loggerService.debug(
        `${this.logContext} skipping post-published re-emit — workflow ${params.workflowId} is itself a postPublishTrigger workflow`,
        {
          organizationId: params.organizationId,
          workflowId: params.workflowId,
        },
      );
      return;
    }

    await this.emitPostPublishedEvent({
      brandId: params.brandId,
      caption: params.caption,
      organizationId: params.organizationId,
      platforms: params.platforms,
      postIds: params.postIds,
      status: 'queued',
      targetKeyword: params.targetKeyword,
      userId: params.userId,
    });
  }

  private async emitPostPublishedEvent(params: {
    organizationId: string;
    userId: string;
    brandId: string;
    postIds: string[];
    platforms: SocialPlatform[];
    caption: string;
    targetKeyword: string | null;
    status?: string;
  }): Promise<void> {
    if (!this.workflowExecutionQueueService) {
      return;
    }

    const event: TriggerEvent = {
      data: {
        brandId: params.brandId,
        caption: params.caption,
        content: params.caption,
        platforms: params.platforms,
        postIds: params.postIds,
        status: params.status ?? 'queued',
        targetKeyword: params.targetKeyword,
        title: null,
      },
      organizationId: params.organizationId,
      platform: params.platforms[0] ?? 'multi',
      type: 'post-published',
      userId: params.userId,
    };

    try {
      await this.workflowExecutionQueueService.queueTriggerEvent(event);
    } catch (error) {
      this.loggerService.error(
        `${this.logContext} failed to emit post-published event`,
        {
          error: error instanceof Error ? error.message : String(error),
          organizationId: params.organizationId,
        },
      );
    }
  }

  async buildDigestTrends(
    trends: TrendsService,
    topN: number,
    minViralScore: number,
    platforms: string[],
  ): Promise<TrendDigestEntry[]> {
    type RawTrend = {
      platform?: string;
      title?: string;
      description?: string;
      hashtag?: string;
      soundName?: string;
      url?: string;
      playUrl?: string;
      views?: number;
      playCount?: number;
      postCount?: number;
      viewCount?: number;
      usageCount?: number;
      viralScore?: number;
      viralityScore?: number;
    };

    const safeFetch = async (
      fetcher: () => Promise<unknown>,
    ): Promise<RawTrend[]> => {
      try {
        return ((await fetcher()) as RawTrend[]) ?? [];
      } catch (error) {
        this.loggerService.error(
          `${this.logContext} trend digest fetch failed`,
          { error },
        );
        return [];
      }
    };

    const [videos, hashtags, sounds] = await Promise.all([
      safeFetch(() => trends.getViralVideos({ limit: 10, minViralScore })),
      safeFetch(() => trends.getTrendingHashtags({ limit: 10 })),
      safeFetch(() => trends.getTrendingSounds({ limit: 10 })),
    ]);

    const mapped: TrendDigestEntry[] = [
      ...videos.map((video) => ({
        platform: video.platform || 'tiktok',
        topic: video.title || video.description || 'Trending Video',
        type: 'video' as const,
        url: video.url,
        usageCount: video.views || video.playCount,
        viralScore: video.viralScore || 0,
      })),
      ...hashtags
        .filter((hashtag) => (hashtag.viralityScore || 0) >= minViralScore)
        .map((hashtag) => ({
          platform: hashtag.platform || 'tiktok',
          topic: `#${hashtag.hashtag}`,
          type: 'hashtag' as const,
          usageCount: hashtag.postCount || hashtag.viewCount,
          viralScore: hashtag.viralityScore || 0,
        })),
      ...sounds
        .filter((sound) => (sound.usageCount || 0) >= 10000)
        .map((sound) => ({
          platform: 'tiktok',
          topic: sound.soundName || 'Trending Sound',
          type: 'sound' as const,
          url: sound.playUrl,
          usageCount: sound.usageCount,
          viralScore: sound.viralityScore || 80,
        })),
    ];

    const allowed = new Set(
      platforms.map((platform) => platform.toLowerCase()),
    );
    const filtered =
      allowed.size > 0
        ? mapped.filter((entry) => allowed.has(entry.platform.toLowerCase()))
        : mapped;

    return filtered.sort((a, b) => b.viralScore - a.viralScore).slice(0, topN);
  }

  private async findTrendFromSocialKeywordMatch(params: {
    organizationId: string;
    platform: TrendPlatform;
    minViralScore: number;
    keywords: string[];
    excludeKeywords: string[];
    lastTrendId: string | null;
  }): Promise<TrendTriggerOutput | null> {
    const keywordPlatform = this.toKeywordTriggerPlatform(params.platform);
    if (
      !keywordPlatform ||
      !this.socialAdapterFactory?.isSupported(params.platform)
    ) {
      return null;
    }

    const checker = this.socialAdapterFactory
      .getAdapter(params.platform)
      .createKeywordChecker?.();

    if (!checker) {
      return null;
    }

    const match = await checker({
      caseSensitive: false,
      excludeKeywords: params.excludeKeywords,
      keywords: params.keywords,
      lastPostId: params.lastTrendId,
      matchMode: 'contains',
      organizationId: params.organizationId,
      platform: keywordPlatform,
    });

    if (!match) {
      return null;
    }

    return {
      hashtags: [match.matchedKeyword]
        .filter(Boolean)
        .map((keyword) => this.helper.buildHashtag(keyword)),
      platform: params.platform,
      soundId: null,
      topic: match.matchedKeyword,
      trendId: match.postId,
      videoUrl: match.postUrl,
      viralScore: params.minViralScore,
    };
  }

  private toKeywordTriggerPlatform(
    platform: TrendPlatform,
  ): KeywordTriggerPlatform | null {
    if (platform === 'twitter' || platform === 'instagram') {
      return platform;
    }

    return null;
  }

  private digestUtcDateKey(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
