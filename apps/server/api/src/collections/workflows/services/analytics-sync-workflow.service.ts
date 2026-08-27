import { PostEntity } from '@server/collections/posts/entities/post.entity';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { customLabels } from '@server/helpers/utils/pagination.util';
import { QueueService } from '@api/queues/core/queue.service';
import { CacheService } from '@server/services/cache/cache.service';
import { postExecutionStateReadFilter } from '@api-types/contracts/scheduler.contract';
import { CredentialPlatform, TargetExecutionState } from '@genfeedai/enums';
import type {
  AnalyticsSyncJobData,
  SocialAnalyticsJobData,
  TwitterAnalyticsJobData,
  YouTubeAnalyticsJobData,
} from '@genfeedai/queue-contracts';
import { scopedWhere } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { classifyAnalyticsCollectionError } from '@server/analytics/analytics-collection-state';
import { PostAnalyticsCollectionStateService } from '@server/analytics/services/post-analytics-collection-state.service';

type AnalyticsSyncWorkflowAction =
  | 'analyticsFacebookSync'
  | 'analyticsGenericSync'
  | 'analyticsSocialSync'
  | 'analyticsThreadsSync'
  | 'analyticsTwitterSync'
  | 'youtubeAnalyticsSync';

type AnalyticsPost = PostEntity & {
  analyticsNextCollectAt?: Date | null;
  brandId: string;
  credentialId: string;
  externalId?: string | null;
  organizationId: string;
  platform: CredentialPlatform;
};

interface DueCursor {
  at: Date;
  id: string;
}

interface QueuePostsOptions {
  analyticsEnabledOnly: boolean;
  force?: boolean;
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

export interface OrganizationAnalyticsRefreshResult {
  enqueued: number;
  organizationId: string;
  posts: number;
  skipped: number;
}

const ANALYTICS_FACEBOOK_QUEUE = 'analytics-facebook';
const ANALYTICS_GENERIC_QUEUE = 'analytics-sync';
const ANALYTICS_SOCIAL_QUEUE = 'analytics-social';
const ANALYTICS_THREADS_QUEUE = 'analytics-threads';
const ANALYTICS_TWITTER_QUEUE = 'analytics-twitter';
const ANALYTICS_YOUTUBE_QUEUE = 'analytics-youtube';

const ANALYTICS_PLATFORM_LABELS: Partial<Record<CredentialPlatform, string>> = {
  [CredentialPlatform.FACEBOOK]: 'Facebook',
  [CredentialPlatform.INSTAGRAM]: 'Instagram',
  [CredentialPlatform.LINKEDIN]: 'LinkedIn',
  [CredentialPlatform.MASTODON]: 'Mastodon',
  [CredentialPlatform.PINTEREST]: 'Pinterest',
  [CredentialPlatform.THREADS]: 'Threads',
  [CredentialPlatform.TIKTOK]: 'TikTok',
  [CredentialPlatform.TWITTER]: 'Twitter',
  [CredentialPlatform.YOUTUBE]: 'YouTube',
};

const HOUR_MS = 60 * 60 * 1000;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const SIX_HOURS_MS = 6 * HOUR_MS;
const CHUNK_SIZE = 50;
const TWITTER_BATCH_SIZE = 100;
const YOUTUBE_BATCH_SIZE = 50;
/** Bound each keyset page — never load an unbounded findMany. */
const FIND_POSTS_PAGE_SIZE = 500;

const SOCIAL_PLATFORMS: CredentialPlatform[] = [
  CredentialPlatform.INSTAGRAM,
  CredentialPlatform.LINKEDIN,
  CredentialPlatform.MASTODON,
  CredentialPlatform.PINTEREST,
  CredentialPlatform.TIKTOK,
];

@Injectable()
export class AnalyticsSyncWorkflowService {
  private readonly logContext = 'AnalyticsSyncWorkflowService';

  constructor(
    private readonly logger: LoggerService,
    private readonly postsService: PostsService,
    private readonly queueService: QueueService,
    private readonly cacheService: CacheService,
    private readonly analyticsCollectionState: PostAnalyticsCollectionStateService,
  ) {}

  async runFacebookAnalytics(
    organizationId: string,
    options: { force?: boolean } = {},
  ): Promise<AnalyticsSyncWorkflowResult> {
    return this.runCredentialGroupedSync({
      action: 'analyticsFacebookSync',
      analyticsEnabledOnly: true,
      backoffDelay: 2000,
      batchSize: CHUNK_SIZE,
      emptyReason: 'no_facebook_posts_to_track',
      force: options.force,
      lockReason: 'facebook_analytics_already_enqueued',
      organizationId,
      platforms: [CredentialPlatform.FACEBOOK],
      queueName: ANALYTICS_FACEBOOK_QUEUE,
      skipLock: options.force === true,
      windowMs: HOUR_MS,
      buildJob: (credentialId, batch): SocialAnalyticsJobData => ({
        attemptKey: this.attemptKey(
          'analyticsFacebookSync',
          organizationId,
          HOUR_MS,
        ),
        posts: batch.map((post) => ({
          brandId: this.requiredBrandId(post),
          credentialId,
          id: this.requiredId(post),
          externalId: this.requiredExternalId(post),
          organizationId,
          platform: post.platform,
        })),
      }),
    });
  }

  async runSocialAnalytics(
    organizationId: string,
    options: { force?: boolean } = {},
  ): Promise<AnalyticsSyncWorkflowResult> {
    return this.runCredentialGroupedSync({
      action: 'analyticsSocialSync',
      analyticsEnabledOnly: true,
      backoffDelay: 2000,
      batchSize: CHUNK_SIZE,
      emptyReason: 'no_social_posts_to_track',
      force: options.force,
      lockReason: 'social_analytics_already_enqueued',
      organizationId,
      platforms: SOCIAL_PLATFORMS,
      queueName: ANALYTICS_SOCIAL_QUEUE,
      skipLock: options.force === true,
      windowMs: HOUR_MS,
      buildJob: (_credentialId, batch): SocialAnalyticsJobData => ({
        attemptKey: this.attemptKey(
          'analyticsSocialSync',
          organizationId,
          HOUR_MS,
        ),
        posts: batch.map((post) => ({
          brandId: this.requiredBrandId(post),
          id: this.requiredId(post),
          externalId: this.requiredExternalId(post),
          organizationId,
          platform: post.platform,
        })),
      }),
    });
  }

  async runThreadsAnalytics(
    organizationId: string,
    options: { force?: boolean } = {},
  ): Promise<AnalyticsSyncWorkflowResult> {
    return this.runCredentialGroupedSync({
      action: 'analyticsThreadsSync',
      analyticsEnabledOnly: true,
      backoffDelay: 2000,
      batchSize: CHUNK_SIZE,
      emptyReason: 'no_threads_posts_to_track',
      force: options.force,
      lockReason: 'threads_analytics_already_enqueued',
      organizationId,
      platforms: [CredentialPlatform.THREADS],
      queueName: ANALYTICS_THREADS_QUEUE,
      skipLock: options.force === true,
      windowMs: HOUR_MS,
      buildJob: (credentialId, batch): SocialAnalyticsJobData => ({
        attemptKey: this.attemptKey(
          'analyticsThreadsSync',
          organizationId,
          HOUR_MS,
        ),
        posts: batch.map((post) => ({
          brandId: this.requiredBrandId(post),
          credentialId,
          id: this.requiredId(post),
          externalId: this.requiredExternalId(post),
          organizationId,
          platform: post.platform,
        })),
      }),
    });
  }

  async runTwitterAnalytics(
    organizationId: string,
    options: { force?: boolean } = {},
  ): Promise<AnalyticsSyncWorkflowResult> {
    return this.runCredentialGroupedSync({
      action: 'analyticsTwitterSync',
      analyticsEnabledOnly: false,
      backoffDelay: 5000,
      batchSize: TWITTER_BATCH_SIZE,
      emptyReason: 'no_twitter_posts_to_track',
      force: options.force,
      lockReason: 'twitter_analytics_already_enqueued',
      organizationId,
      platforms: [CredentialPlatform.TWITTER],
      queueName: ANALYTICS_TWITTER_QUEUE,
      skipLock: options.force === true,
      windowMs: THIRTY_MINUTES_MS,
      buildJob: (credentialId, batch): TwitterAnalyticsJobData => ({
        attemptKey: this.attemptKey(
          'analyticsTwitterSync',
          organizationId,
          THIRTY_MINUTES_MS,
        ),
        credentialId,
        posts: batch.map((post) => ({
          brandId: this.requiredBrandId(post),
          id: this.requiredId(post),
          externalId: this.requiredExternalId(post),
          organizationId,
        })),
      }),
    });
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
    options: { force?: boolean } = {},
  ): Promise<AnalyticsSyncWorkflowResult> {
    return this.runCredentialGroupedSync({
      action: 'youtubeAnalyticsSync',
      analyticsEnabledOnly: false,
      backoffDelay: 2000,
      batchSize: YOUTUBE_BATCH_SIZE,
      emptyReason: 'no_youtube_posts_to_track',
      force: options.force,
      lockReason: 'youtube_analytics_already_enqueued',
      organizationId,
      platforms: [CredentialPlatform.YOUTUBE],
      queueName: ANALYTICS_YOUTUBE_QUEUE,
      skipLock: options.force === true,
      windowMs: HOUR_MS,
      buildJob: (credentialId, batch): YouTubeAnalyticsJobData => {
        const [first] = batch;
        if (!first) {
          throw new Error('YouTube analytics batch is empty');
        }
        return {
          attemptKey: this.attemptKey(
            'youtubeAnalyticsSync',
            organizationId,
            HOUR_MS,
          ),
          brandId: this.requiredBrandId(first),
          credentialId,
          organizationId,
          posts: batch.map((post) => ({
            brandId: this.requiredBrandId(post),
            id: this.requiredId(post),
            externalId: this.requiredExternalId(post),
            organizationId,
          })),
        };
      },
    });
  }

  async runOrganizationRefresh(
    organizationId: string,
  ): Promise<OrganizationAnalyticsRefreshResult> {
    const results = [
      await this.runFacebookAnalytics(organizationId, { force: true }),
      await this.runSocialAnalytics(organizationId, { force: true }),
      await this.runThreadsAnalytics(organizationId, { force: true }),
      await this.runTwitterAnalytics(organizationId, { force: true }),
      await this.runYouTubeAnalytics(organizationId, { force: true }),
    ];

    return {
      enqueued: results.reduce((sum, result) => sum + result.enqueued, 0),
      organizationId,
      posts: results.reduce((sum, result) => sum + result.posts, 0),
      skipped: results.reduce((sum, result) => sum + result.skipped, 0),
    };
  }

  private async runCredentialGroupedSync<T>(input: {
    action: AnalyticsSyncWorkflowAction;
    analyticsEnabledOnly: boolean;
    backoffDelay: number;
    batchSize: number;
    buildJob: (credentialId: string, batch: AnalyticsPost[]) => T;
    emptyReason: string;
    force?: boolean;
    lockReason: string;
    organizationId: string;
    platforms: CredentialPlatform[];
    queueName: string;
    skipLock?: boolean;
    windowMs: number;
  }): Promise<AnalyticsSyncWorkflowResult> {
    if (!input.skipLock) {
      const acquired = await this.acquireWindowLock(
        input.action,
        input.organizationId,
        input.windowMs,
      );
      if (!acquired) {
        return this.skipped(
          input.action,
          input.organizationId,
          input.queueName,
          input.lockReason,
        );
      }
    }

    const attemptKey = this.attemptKey(
      input.action,
      input.organizationId,
      input.windowMs,
    );

    const totals = await this.forEachDuePage(
      input.organizationId,
      {
        analyticsEnabledOnly: input.analyticsEnabledOnly,
        force: input.force,
        platforms: input.platforms,
      },
      async (page) => {
        const postsByCredential = new Map<string, AnalyticsPost[]>();
        let skipped = 0;

        for (const post of page) {
          const credentialId = this.optionalId(post.credentialId);
          if (!credentialId) {
            skipped++;
            this.logger.warn(`${this.logContext} skipped analytics post`, {
              organizationId: input.organizationId,
              platform: post.platform,
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
        for (const [credentialId, credentialPosts] of postsByCredential) {
          for (const batch of this.chunk(credentialPosts, input.batchSize)) {
            await this.enqueueCollection(
              input.queueName,
              input.buildJob(credentialId, batch),
              batch,
              attemptKey,
              input.organizationId,
              input.backoffDelay,
            );
            enqueued++;
          }
        }

        return { enqueued, skipped };
      },
    );

    return this.result(
      input.action,
      input.organizationId,
      input.queueName,
      totals.enqueued,
      totals.posts,
      totals.skipped,
      totals.posts === 0 ? input.emptyReason : undefined,
    );
  }

  private async forEachDuePage(
    organizationId: string,
    options: QueuePostsOptions,
    onPage: (
      posts: AnalyticsPost[],
    ) => Promise<{ enqueued: number; skipped: number }>,
  ): Promise<{ enqueued: number; posts: number; skipped: number }> {
    let cursor: DueCursor | undefined;
    let posts = 0;
    let enqueued = 0;
    let skipped = 0;

    for (;;) {
      const page = await this.findDueAnalyticsPostsPage(
        organizationId,
        options,
        cursor,
      );
      if (page.length === 0) {
        break;
      }

      const pageResult = await onPage(page);
      posts += page.length;
      enqueued += pageResult.enqueued;
      skipped += pageResult.skipped;

      if (page.length < FIND_POSTS_PAGE_SIZE) {
        break;
      }

      const last = page[page.length - 1];
      if (!last) {
        break;
      }
      cursor = {
        at: last.analyticsNextCollectAt ?? new Date(0),
        id: this.requiredId(last),
      };
    }

    return { enqueued, posts, skipped };
  }

  private async findDueAnalyticsPostsPage(
    organizationId: string,
    options: QueuePostsOptions,
    cursor?: DueCursor,
  ): Promise<AnalyticsPost[]> {
    const now = new Date();
    const where: Record<string, unknown> = scopedWhere(organizationId, {
      externalId: { not: null },
      platform:
        options.platforms.length === 1
          ? options.platforms[0]
          : { in: options.platforms },
      ...postExecutionStateReadFilter(TargetExecutionState.PUBLISHED),
    });

    if (options.analyticsEnabledOnly) {
      where.isAnalyticsEnabled = { not: false };
    }

    if (!options.force) {
      where.analyticsNextCollectAt = { lte: now };
    }

    if (cursor) {
      where.AND = [
        {
          OR: [
            { analyticsNextCollectAt: { gt: cursor.at } },
            {
              AND: [
                { analyticsNextCollectAt: cursor.at },
                { id: { gt: cursor.id } },
              ],
            },
          ],
        },
      ];
    }

    const result = await this.postsService.findAll(
      {
        orderBy: [{ analyticsNextCollectAt: 'asc' }, { id: 'asc' }],
        where,
      },
      {
        customLabels,
        limit: FIND_POSTS_PAGE_SIZE,
        page: 1,
        pagination: true,
      },
      false,
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

  private async enqueueCollection<T>(
    queueName: string,
    jobData: T,
    posts: AnalyticsPost[],
    attemptKey: string,
    organizationId: string,
    backoffDelay: number,
  ): Promise<void> {
    const targets = posts.map((post) => ({
      brandId: this.requiredBrandId(post),
      id: this.requiredId(post),
      organizationId,
      platform: post.platform,
    }));

    await this.analyticsCollectionState.markPending({
      attemptKey,
      requestedAt: new Date(),
      targets,
    });

    try {
      await this.enqueue(queueName, jobData, backoffDelay);
    } catch (error: unknown) {
      const [firstTarget] = targets;
      const platformLabel = firstTarget
        ? (ANALYTICS_PLATFORM_LABELS[firstTarget.platform] ??
          firstTarget.platform)
        : 'Provider';

      try {
        await this.analyticsCollectionState.markFailedBatch(
          targets.map((target) => ({ ...target, attemptKey })),
          classifyAnalyticsCollectionError(error, platformLabel),
        );
      } catch (stateError: unknown) {
        this.logger.error(
          `${this.logContext} failed to record analytics collection failure`,
          stateError,
          { attemptKey, queueName },
        );
      }
      throw error;
    }
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

  private attemptKey(
    action: AnalyticsSyncWorkflowAction,
    organizationId: string,
    windowMs: number,
  ): string {
    return `${action}:${organizationId}:${this.windowKey(windowMs)}`;
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
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private requiredId(post: AnalyticsPost): string {
    const id = this.optionalId(post.id);
    if (!id) {
      throw new Error('Analytics post missing id');
    }
    return id;
  }

  private requiredBrandId(post: AnalyticsPost): string {
    const brandId = this.optionalId(post.brandId);
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
