import { PostEntity } from '@api/collections/posts/entities/post.entity';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import type { FacebookAnalyticsJobData } from '@api/queues/analytics-facebook/analytics-facebook-job.interface';
import type { AnalyticsSyncJobData } from '@api/queues/analytics-sync/analytics-sync-job.interface';
import type { ThreadsAnalyticsJobData } from '@api/queues/analytics-threads/analytics-threads-job.interface';
import type { TwitterAnalyticsJobData } from '@api/queues/analytics-twitter/analytics-twitter-job.interface';
import type { YouTubeAnalyticsJobData } from '@api/queues/analytics-youtube/analytics-youtube-job.interface';
import { QueueService } from '@api/queues/core/queue.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { CredentialPlatform, PostStatus } from '@genfeedai/enums';
import type { SocialAnalyticsJobData } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

type AnalyticsSyncWorkflowAction =
  | 'analyticsFacebookSync'
  | 'analyticsGenericSync'
  | 'analyticsSocialSync'
  | 'analyticsThreadsSync'
  | 'analyticsTwitterSync'
  | 'youtubeAnalyticsSync';

type AnalyticsPost = PostEntity & {
  brand?: unknown;
  credential?: unknown;
  externalId?: string | null;
  organization?: unknown;
  organizationId?: string;
  platform: CredentialPlatform;
};

interface QueuePostsOptions {
  analyticsEnabledOnly: boolean;
  orderBy?: Record<string, 'asc' | 'desc'>;
  platforms: CredentialPlatform[];
}

export interface AnalyticsSyncWorkflowResult {
  action: AnalyticsSyncWorkflowAction;
  enqueued: number;
  organizationId: string;
  posts: number;
  queueName: string;
  reason?: string;
  skipped: number;
  status: 'enqueued' | 'skipped';
}

const ANALYTICS_FACEBOOK_QUEUE = 'analytics-facebook';
const ANALYTICS_GENERIC_QUEUE = 'analytics-sync';
const ANALYTICS_SOCIAL_QUEUE = 'analytics-social';
const ANALYTICS_THREADS_QUEUE = 'analytics-threads';
const ANALYTICS_TWITTER_QUEUE = 'analytics-twitter';
const ANALYTICS_YOUTUBE_QUEUE = 'analytics-youtube';

const HOUR_MS = 60 * 60 * 1000;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const SIX_HOURS_MS = 6 * HOUR_MS;
const CHUNK_SIZE = 50;
const TWITTER_BATCH_SIZE = 100;
const YOUTUBE_BATCH_SIZE = 50;

@Injectable()
export class AnalyticsSyncWorkflowService {
  private readonly logContext = 'AnalyticsSyncWorkflowService';

  constructor(
    private readonly logger: LoggerService,
    private readonly postsService: PostsService,
    private readonly queueService: QueueService,
    private readonly cacheService: CacheService,
  ) {}

  async runFacebookAnalytics(
    organizationId: string,
  ): Promise<AnalyticsSyncWorkflowResult> {
    const action: AnalyticsSyncWorkflowAction = 'analyticsFacebookSync';
    const acquired = await this.acquireWindowLock(
      action,
      organizationId,
      HOUR_MS,
    );
    if (!acquired) {
      return this.skipped(
        action,
        organizationId,
        ANALYTICS_FACEBOOK_QUEUE,
        'facebook_analytics_already_enqueued',
      );
    }

    const posts = await this.findAnalyticsPosts(organizationId, {
      analyticsEnabledOnly: true,
      platforms: [CredentialPlatform.FACEBOOK],
    });

    let enqueued = 0;
    for (const chunk of this.chunk(posts, CHUNK_SIZE)) {
      const jobData: FacebookAnalyticsJobData = {
        posts: chunk.map((post) => ({
          id: this.requiredId(post),
          brand: this.requiredBrandId(post),
          credential: this.optionalId(post.credential),
          externalId: this.requiredExternalId(post),
          organization: organizationId,
          platform: post.platform,
        })),
      };
      await this.enqueue(ANALYTICS_FACEBOOK_QUEUE, jobData, 2000);
      enqueued++;
    }

    return this.result(
      action,
      organizationId,
      ANALYTICS_FACEBOOK_QUEUE,
      enqueued,
      posts.length,
      0,
      posts.length === 0 ? 'no_facebook_posts_to_track' : undefined,
    );
  }

  async runSocialAnalytics(
    organizationId: string,
  ): Promise<AnalyticsSyncWorkflowResult> {
    const action: AnalyticsSyncWorkflowAction = 'analyticsSocialSync';
    const acquired = await this.acquireWindowLock(
      action,
      organizationId,
      HOUR_MS,
    );
    if (!acquired) {
      return this.skipped(
        action,
        organizationId,
        ANALYTICS_SOCIAL_QUEUE,
        'social_analytics_already_enqueued',
      );
    }

    const posts = await this.findAnalyticsPosts(organizationId, {
      analyticsEnabledOnly: true,
      platforms: [
        CredentialPlatform.INSTAGRAM,
        CredentialPlatform.LINKEDIN,
        CredentialPlatform.MASTODON,
        CredentialPlatform.PINTEREST,
        CredentialPlatform.TIKTOK,
      ],
    });

    let enqueued = 0;
    for (const chunk of this.chunk(posts, CHUNK_SIZE)) {
      const jobData: SocialAnalyticsJobData = {
        posts: chunk.map((post) => ({
          id: this.requiredId(post),
          brand: this.requiredBrandId(post),
          externalId: this.requiredExternalId(post),
          organization: organizationId,
          platform: post.platform,
        })),
      };
      await this.enqueue(ANALYTICS_SOCIAL_QUEUE, jobData, 2000);
      enqueued++;
    }

    return this.result(
      action,
      organizationId,
      ANALYTICS_SOCIAL_QUEUE,
      enqueued,
      posts.length,
      0,
      posts.length === 0 ? 'no_social_posts_to_track' : undefined,
    );
  }

  async runThreadsAnalytics(
    organizationId: string,
  ): Promise<AnalyticsSyncWorkflowResult> {
    const action: AnalyticsSyncWorkflowAction = 'analyticsThreadsSync';
    const acquired = await this.acquireWindowLock(
      action,
      organizationId,
      HOUR_MS,
    );
    if (!acquired) {
      return this.skipped(
        action,
        organizationId,
        ANALYTICS_THREADS_QUEUE,
        'threads_analytics_already_enqueued',
      );
    }

    const posts = await this.findAnalyticsPosts(organizationId, {
      analyticsEnabledOnly: true,
      platforms: [CredentialPlatform.THREADS],
    });

    let enqueued = 0;
    for (const chunk of this.chunk(posts, CHUNK_SIZE)) {
      const jobData: ThreadsAnalyticsJobData = {
        posts: chunk.map((post) => ({
          id: this.requiredId(post),
          brand: this.requiredBrandId(post),
          credential: this.optionalId(post.credential),
          externalId: this.requiredExternalId(post),
          organization: organizationId,
          platform: post.platform,
        })),
      };
      await this.enqueue(ANALYTICS_THREADS_QUEUE, jobData, 2000);
      enqueued++;
    }

    return this.result(
      action,
      organizationId,
      ANALYTICS_THREADS_QUEUE,
      enqueued,
      posts.length,
      0,
      posts.length === 0 ? 'no_threads_posts_to_track' : undefined,
    );
  }

  async runTwitterAnalytics(
    organizationId: string,
  ): Promise<AnalyticsSyncWorkflowResult> {
    const action: AnalyticsSyncWorkflowAction = 'analyticsTwitterSync';
    const acquired = await this.acquireWindowLock(
      action,
      organizationId,
      THIRTY_MINUTES_MS,
    );
    if (!acquired) {
      return this.skipped(
        action,
        organizationId,
        ANALYTICS_TWITTER_QUEUE,
        'twitter_analytics_already_enqueued',
      );
    }

    const posts = await this.findAnalyticsPosts(organizationId, {
      analyticsEnabledOnly: false,
      orderBy: { publishedAt: 'desc' },
      platforms: [CredentialPlatform.TWITTER],
    });

    const postsByCredential = new Map<string, AnalyticsPost[]>();
    let skipped = 0;

    for (const post of posts) {
      const credentialId = this.optionalId(post.credential);
      if (!credentialId) {
        skipped++;
        this.logger.warn(`${this.logContext} skipped Twitter post`, {
          organizationId,
          postId: this.optionalId(post.id),
          reason: 'missing_credential',
        });
        continue;
      }
      const group = postsByCredential.get(credentialId) ?? [];
      group.push(post);
      postsByCredential.set(credentialId, group);
    }

    let enqueued = 0;
    for (const [credentialId, credentialPosts] of postsByCredential.entries()) {
      for (const batch of this.chunk(credentialPosts, TWITTER_BATCH_SIZE)) {
        const jobData: TwitterAnalyticsJobData = {
          credentialId,
          posts: batch.map((post) => ({
            id: this.requiredId(post),
            brand: this.requiredBrandId(post),
            externalId: this.requiredExternalId(post),
            organization: organizationId,
          })),
        };
        await this.enqueue(ANALYTICS_TWITTER_QUEUE, jobData, 5000);
        enqueued++;
      }
    }

    return this.result(
      action,
      organizationId,
      ANALYTICS_TWITTER_QUEUE,
      enqueued,
      posts.length,
      skipped,
      posts.length === 0 ? 'no_twitter_posts_to_track' : undefined,
    );
  }

  async runGenericAnalyticsSync(
    organizationId: string,
  ): Promise<AnalyticsSyncWorkflowResult> {
    const action: AnalyticsSyncWorkflowAction = 'analyticsGenericSync';
    const window = this.windowKey(SIX_HOURS_MS);
    const acquired = await this.acquireWindowLock(
      action,
      organizationId,
      SIX_HOURS_MS,
    );
    if (!acquired) {
      return this.skipped(
        action,
        organizationId,
        ANALYTICS_GENERIC_QUEUE,
        'analytics_sync_already_enqueued',
      );
    }

    const jobData: AnalyticsSyncJobData = {
      incremental: true,
      organizationId,
    };

    await this.queueService.add(ANALYTICS_GENERIC_QUEUE, jobData, {
      attempts: 3,
      backoff: { delay: 5000, type: 'exponential' },
      jobId: `analytics-sync-${organizationId}-${window}`,
    });

    return this.result(
      action,
      organizationId,
      ANALYTICS_GENERIC_QUEUE,
      1,
      0,
      0,
    );
  }

  async runYouTubeAnalytics(
    organizationId: string,
  ): Promise<AnalyticsSyncWorkflowResult> {
    const action: AnalyticsSyncWorkflowAction = 'youtubeAnalyticsSync';
    const acquired = await this.acquireWindowLock(
      action,
      organizationId,
      HOUR_MS,
    );
    if (!acquired) {
      return this.skipped(
        action,
        organizationId,
        ANALYTICS_YOUTUBE_QUEUE,
        'youtube_analytics_already_enqueued',
      );
    }

    const posts = await this.findAnalyticsPosts(organizationId, {
      analyticsEnabledOnly: false,
      platforms: [CredentialPlatform.YOUTUBE],
    });

    const postsByBrand = new Map<string, AnalyticsPost[]>();
    let skipped = 0;

    for (const post of posts) {
      const brandId = this.optionalId(post.brand);
      if (!brandId) {
        skipped++;
        this.logger.warn(`${this.logContext} skipped YouTube post`, {
          organizationId,
          postId: this.optionalId(post.id),
          reason: 'missing_brand',
        });
        continue;
      }
      const group = postsByBrand.get(brandId) ?? [];
      group.push(post);
      postsByBrand.set(brandId, group);
    }

    let enqueued = 0;
    for (const [brandId, brandPosts] of postsByBrand.entries()) {
      for (const batch of this.chunk(brandPosts, YOUTUBE_BATCH_SIZE)) {
        const jobData: YouTubeAnalyticsJobData = {
          brandId,
          organizationId,
          posts: batch.map((post) => ({
            id: this.requiredId(post),
            brand: brandId,
            externalId: this.requiredExternalId(post),
            organization: organizationId,
          })),
        };
        await this.enqueue(ANALYTICS_YOUTUBE_QUEUE, jobData, 2000);
        enqueued++;
      }
    }

    return this.result(
      action,
      organizationId,
      ANALYTICS_YOUTUBE_QUEUE,
      enqueued,
      posts.length,
      skipped,
      posts.length === 0 ? 'no_youtube_posts_to_track' : undefined,
    );
  }

  private async findAnalyticsPosts(
    organizationId: string,
    options: QueuePostsOptions,
  ): Promise<AnalyticsPost[]> {
    const where: Record<string, unknown> = {
      externalId: { not: null },
      isDeleted: false,
      organizationId,
      platform:
        options.platforms.length === 1
          ? options.platforms[0]
          : { in: options.platforms },
      status: PostStatus.PUBLIC,
    };

    if (options.analyticsEnabledOnly) {
      where.isAnalyticsEnabled = { not: false };
    }

    const result = await this.postsService.findAll(
      {
        include: { credential: true },
        ...(options.orderBy ? { orderBy: options.orderBy } : {}),
        where,
      },
      { customLabels, pagination: false },
    );

    return result.docs as unknown as AnalyticsPost[];
  }

  private async enqueue<T>(
    queueName: string,
    jobData: T,
    backoffDelay: number,
  ): Promise<void> {
    await this.queueService.add(queueName, jobData, {
      attempts: 3,
      backoff: {
        delay: backoffDelay,
        type: 'exponential',
      },
    });
  }

  private async acquireWindowLock(
    action: AnalyticsSyncWorkflowAction,
    organizationId: string,
    windowMs: number,
  ): Promise<boolean> {
    const ttlSeconds = Math.ceil(windowMs / 1000);
    return this.cacheService.acquireLock(
      `workflow-analytics-sync:${action}:${organizationId}:${this.windowKey(windowMs)}`,
      ttlSeconds,
    );
  }

  private windowKey(windowMs: number): number {
    return Math.floor(Date.now() / windowMs);
  }

  private result(
    action: AnalyticsSyncWorkflowAction,
    organizationId: string,
    queueName: string,
    enqueued: number,
    posts: number,
    skipped: number,
    reason?: string,
  ): AnalyticsSyncWorkflowResult {
    return {
      action,
      enqueued,
      organizationId,
      posts,
      queueName,
      reason,
      skipped,
      status: enqueued > 0 ? 'enqueued' : 'skipped',
    };
  }

  private skipped(
    action: AnalyticsSyncWorkflowAction,
    organizationId: string,
    queueName: string,
    reason: string,
  ): AnalyticsSyncWorkflowResult {
    return {
      action,
      enqueued: 0,
      organizationId,
      posts: 0,
      queueName,
      reason,
      skipped: 0,
      status: 'skipped',
    };
  }

  private chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
      chunks.push(items.slice(i, i + size));
    }
    return chunks;
  }

  private optionalId(value: unknown): string | undefined {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if (typeof record.id === 'string' && record.id.length > 0) {
        return record.id;
      }
      if (typeof record.id === 'string' && record.id.length > 0) {
        return record.id;
      }
    }
    return undefined;
  }

  private requiredId(post: AnalyticsPost): string {
    const id = this.optionalId(post.id) ?? this.optionalId(post);
    if (!id) {
      throw new Error('Analytics post missing id');
    }
    return id;
  }

  private requiredBrandId(post: AnalyticsPost): string {
    const brandId = this.optionalId(post.brand);
    if (!brandId) {
      throw new Error(`Analytics post ${this.requiredId(post)} missing brand`);
    }
    return brandId;
  }

  private requiredExternalId(post: AnalyticsPost): string {
    if (typeof post.externalId === 'string' && post.externalId.length > 0) {
      return post.externalId;
    }
    throw new Error(
      `Analytics post ${this.requiredId(post)} missing externalId`,
    );
  }
}
