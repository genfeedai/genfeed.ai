import { LearningCheckpointService } from '@api/collections/content-learning/services/learning-checkpoint.service';
import { learningHash } from '@api/collections/content-learning/services/learning-operation.service';
import {
  learningPublicationFinalizationVersionV1,
  learningPublicationPostVersionV1,
} from '@api/collections/content-learning/services/learning-publication-source.helper';
import type { OutliersService } from '@api/collections/outliers/services/outliers.service';
import type { PostDocument } from '@api/collections/posts/post.schema';
import { PostAnalyticsService } from '@api/collections/posts/services/post-analytics.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { CONTENT_LEARNING_ACTION_IDS } from '@api/collections/workflows/templates/content-learning-workflows.template';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Platform } from '@genfeedai/contracts';
import { captureLearningMetrics } from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import type { LearningPublicationSourceV1 } from '@genfeedai/contracts/interfaces/analytics/outlier-persistence.interface';
import type { ContentLearningCheckpoint } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import { Test } from '@nestjs/testing';

const TWITTER = 'TWITTER' as never;

async function persistenceDependencies() {
  const capture = vi
    .fn<LearningCheckpointService['capture']>()
    .mockResolvedValue(null);
  const queue = vi
    .fn<WorkflowExecutionQueueService['queueSystemWorkflow']>()
    .mockResolvedValue('job');
  const module = await Test.createTestingModule({
    providers: [
      { provide: LearningCheckpointService, useValue: { capture } },
      {
        provide: WorkflowExecutionQueueService,
        useValue: { queueSystemWorkflow: queue },
      },
    ],
  }).compile();
  return {
    capture,
    queue,
    checkpoints: module.get<LearningCheckpointService>(
      LearningCheckpointService,
    ),
    workflowQueue: module.get<WorkflowExecutionQueueService>(
      WorkflowExecutionQueueService,
    ),
  };
}
async function createHarness(post: unknown) {
  const dependencies = await persistenceDependencies();
  const accountRead = vi.fn().mockResolvedValue({
    id: 'account',
    mode: 'live',
    epoch: 2,
    evidenceRevision: 3,
  });
  const refresh = vi.fn().mockResolvedValue([]);
  const upsert = vi.fn().mockResolvedValue({ id: 'analytics_1' });
  const findFirst = vi.fn().mockResolvedValue(null);
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;

  const service = new PostAnalyticsService(
    {
      postAnalytics: { findFirst, upsert },
      contentLearningAccount: { findFirst: accountRead },
      credential: {
        findFirst: vi.fn().mockResolvedValue({ platform: 'TWITTER' }),
      },
    } as unknown as PrismaService,
    logger,
    {
      findOne: vi
        .fn()
        .mockResolvedValue(
          post && typeof post === 'object'
            ? { ...post, credentialId: 'credential_1' }
            : post,
        ),
    } as unknown as PostsService,
    {
      authorize: vi.fn().mockResolvedValue({}),
      refresh,
    } as unknown as OutliersService,
    dependencies.checkpoints,
    dependencies.workflowQueue,
  );

  return {
    findFirst,
    logger,
    service,
    upsert,
    refresh,
    accountRead,
    ...dependencies,
  };
}

const metrics = {
  totalComments: 3,
  totalLikes: 20,
  totalShares: 1,
  totalViews: 100,
};

describe('PostAnalyticsService.updateTodayAnalytics', () => {
  it('writes scalar foreign keys when the post carries populated relations', async () => {
    // Populated Prisma relations retain their canonical scalar foreign keys.
    const { service, upsert } = await createHarness({
      brand: { id: 'brand_1', label: 'Acme' },
      brandId: 'brand_1',
      id: 'post_1',
      organization: { id: 'org_1' },
      organizationId: 'org_1',
      user: { id: 'user_1' },
      userId: 'user_1',
    } as unknown as PostDocument);

    await service.updateTodayAnalytics('post_1', TWITTER, metrics, {
      organizationId: 'org_1',
      brandId: 'brand_1',
      credentialId: 'credential_1',
    });

    const create = upsert.mock.calls[0][0].create;

    expect(create).toMatchObject({
      brandId: 'brand_1',
      organizationId: 'org_1',
      postId: 'post_1',
      userId: 'user_1',
    });

    for (const key of ['brandId', 'organizationId', 'userId'] as const) {
      expect(create[key]).not.toBe('undefined');
      expect(create[key]).not.toBe('[object Object]');
    }
  });

  it('prefers the scalar foreign key over the legacy alias', async () => {
    const { service, upsert } = await createHarness({
      brand: 'stale_brand',
      brandId: 'brand_1',
      id: 'post_1',
      organization: 'stale_org',
      organizationId: 'org_1',
      user: 'stale_user',
      userId: 'user_1',
    } as unknown as PostDocument);

    await service.updateTodayAnalytics('post_1', TWITTER, metrics, {
      organizationId: 'org_1',
      brandId: 'brand_1',
      credentialId: 'credential_1',
    });

    expect(upsert.mock.calls[0][0].create).toMatchObject({
      brandId: 'brand_1',
      organizationId: 'org_1',
      userId: 'user_1',
    });
  });

  it('skips the upsert when an owner id cannot be resolved', async () => {
    const { logger, service, upsert } = await createHarness({
      brandId: 'brand_1',
      id: 'post_1',
      organizationId: 'org_1',
    } as unknown as PostDocument);

    const result = await service.updateTodayAnalytics(
      'post_1',
      TWITTER,
      {
        totalComments: 0,
        totalLikes: 0,
        totalViews: 0,
      },
      {
        organizationId: 'org_1',
        brandId: 'brand_1',
        credentialId: 'credential_1',
      },
    );

    expect(result).toBeNull();
    expect(upsert).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });
});

describe('PostAnalyticsService provider metric mapping', () => {
  it.each([Platform.FACEBOOK, Platform.INSTAGRAM, Platform.THREADS])(
    'preserves missing versus observed-zero %s views through the persistence boundary',
    async (platform) => {
      const { service } = await createHarness(null);
      const update = vi
        .spyOn(service, 'updateTodayAnalytics')
        .mockResolvedValue(null);
      const context = {
        organizationId: 'org_1',
        brandId: 'brand_1',
        credentialId: 'credential_1',
      };
      for (const providerViews of [undefined, 0]) {
        const analytics = {
          views: 0,
          likes: 3,
          comments: 1,
          shares: 0,
          learningMetrics: captureLearningMetrics(
            { views: providerViews },
            { views: 'views' },
          ),
        };
        if (platform === Platform.FACEBOOK)
          await service.processFacebookAnalytics('post_1', analytics, context);
        else if (platform === Platform.INSTAGRAM)
          await service.processInstagramAnalytics('post_1', analytics, context);
        if (platform === Platform.THREADS)
          await service.processThreadsAnalytics(
            'post_1',
            { ...analytics, replies: 1, reposts: 0, quotes: 0 },
            context,
          );
        expect(update).toHaveBeenLastCalledWith(
          'post_1',
          platform.toUpperCase(),
          expect.objectContaining({
            totalViews: 0,
            metricAvailability: expect.objectContaining({
              views: providerViews === undefined ? 'unavailable' : 'observed',
            }),
          }),
          context,
        );
      }
    },
  );

  it('converts YouTube total watch minutes while preserving average seconds', async () => {
    const { service } = await createHarness(null);
    const update = vi
      .spyOn(service, 'updateTodayAnalytics')
      .mockResolvedValue(null);

    await service.processYouTubeAnalytics(
      'post_1',
      {
        averageViewDuration: 12,
        comments: 3,
        estimatedMinutesWatched: 2.5,
        impressions: 80,
        likes: 20,
        views: 100,
      },
      {
        organizationId: 'org_1',
        brandId: 'brand_1',
        credentialId: 'credential_1',
      },
    );

    expect(update).toHaveBeenCalledWith(
      'post_1',
      'YOUTUBE',
      expect.objectContaining({
        averageWatchTimeSeconds: 12,
        impressions: 80,
        metricAvailability: expect.objectContaining({
          averageWatchTimeSeconds: 'observed',
          watchTimeSeconds: 'observed',
        }),
        videoViews: 100,
        watchTimeSeconds: 150,
      }),
      {
        organizationId: 'org_1',
        brandId: 'brand_1',
        credentialId: 'credential_1',
      },
    );
  });

  it('preserves TikTok watch seconds and availability independently', async () => {
    const { service } = await createHarness(null);
    const update = vi
      .spyOn(service, 'updateTodayAnalytics')
      .mockResolvedValue(null);

    await service.processTikTokAnalytics(
      'post_1',
      {
        comments: 3,
        likes: 20,
        reach: 75,
        shares: 4,
        totalPlayTime: 240,
        views: 100,
      },
      {
        organizationId: 'org_1',
        brandId: 'brand_1',
        credentialId: 'credential_1',
      },
    );

    expect(update).toHaveBeenCalledWith(
      'post_1',
      'TIKTOK',
      expect.objectContaining({
        averageWatchTimeSeconds: null,
        reach: 75,
        watchTimeSeconds: 240,
        metricAvailability: expect.objectContaining({
          averageWatchTimeSeconds: 'unavailable',
          watchTimeSeconds: 'observed',
        }),
      }),
      {
        organizationId: 'org_1',
        brandId: 'brand_1',
        credentialId: 'credential_1',
      },
    );
  });
});

describe('analytics explicit account baseline refresh', () => {
  const context = {
    organizationId: 'org_1',
    brandId: 'brand_1',
    credentialId: 'credential_1',
  };
  it('writes independently and propagates the explicit batch refresh failure', async () => {
    const h = await createHarness({
      id: 'p',
      organizationId: 'org_1',
      brandId: 'brand_1',
      userId: 'u',
    });
    await h.service.updateTodayAnalytics('p', TWITTER, metrics, context);
    expect(h.upsert).toHaveBeenCalledOnce();
    expect(h.refresh).not.toHaveBeenCalled();
    h.refresh.mockRejectedValueOnce(new Error('snapshot failed'));
    await expect(h.service.refreshOutliers(context)).rejects.toThrow(
      'snapshot failed',
    );
  });
  it('awaits the explicit refresh completion', async () => {
    const h = await createHarness({
      id: 'p',
      organizationId: 'org_1',
      brandId: 'brand_1',
      userId: 'u',
    });
    let release!: () => void;
    h.refresh.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    let finished = false;
    const pending = h.service.refreshOutliers(context).then(() => {
      finished = true;
    });
    await vi.waitFor(() => expect(h.refresh).toHaveBeenCalledOnce());
    expect(finished).toBe(false);
    release();
    await pending;
    expect(finished).toBe(true);
  });
});

describe('active scoped daily analytics reads', () => {
  it('requires the caller organization for summaries and date ranges', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const dependencies = await persistenceDependencies();
    const service = new PostAnalyticsService(
      { postAnalytics: { findMany } } as unknown as PrismaService,
      {} as LoggerService,
      {} as PostsService,
      {} as OutliersService,
      dependencies.checkpoints,
      dependencies.workflowQueue,
    );
    await service.getPostAnalyticsSummary('post', 'org');
    expect(findMany).toHaveBeenLastCalledWith({
      where: { organizationId: 'org', isDeleted: false, postId: 'post' },
    });
    const start = new Date('2026-01-01');
    const end = new Date('2026-01-31');
    await service.getAnalyticsByDateRange('post', start, end, 'org', 'TWITTER');
    expect(findMany).toHaveBeenLastCalledWith({
      orderBy: { date: 'asc' },
      where: {
        organizationId: 'org',
        isDeleted: false,
        postId: 'post',
        platform: 'TWITTER',
        date: { gte: start, lte: end },
      },
    });
    await expect(service.getPostAnalyticsSummary('post', '')).rejects.toThrow(
      'organizationId is required',
    );
  });
});

function observationSource(): LearningPublicationSourceV1 {
  const association = {
    version: 1 as const,
    organizationId: 'org_1',
    brandId: 'brand_1',
    credentialId: 'credential_1',
    postId: 'post_1',
    approvalId: 'approval',
    approvalOperationId: 'operation',
    versionPinId: 'pin',
    platform: Platform.TWITTER,
    externalId: 'external',
    publishedAt: '2026-09-28T12:00:00.000Z',
    contentDigest: `sha256:v1:${'a'.repeat(64)}`,
    postSourceVersion: learningPublicationPostVersionV1({
      organizationId: 'org_1',
      brandId: 'brand_1',
      credentialId: 'credential_1',
      postId: 'post_1',
      platform: Platform.TWITTER,
      externalId: 'external',
      publishedAt: '2026-09-28T12:00:00.000Z',
      description: 'text',
    }),
  };
  return {
    ...association,
    finalizationId: 'finalization',
    finalizationVersion: learningPublicationFinalizationVersionV1(association),
    approvalVersion: learningHash(['approval']),
  };
}
function observedCheckpoint(): ContentLearningCheckpoint {
  const publishedAt = new Date(observationSource().publishedAt),
    requestStartedAt = new Date(publishedAt.getTime() + 48 * 3600000);
  return {
    id: 'checkpoint',
    organizationId: 'org_1',
    brandId: 'brand_1',
    credentialId: 'credential_1',
    postId: 'post_1',
    createdAt: requestStartedAt,
    updatedAt: requestStartedAt,
    isDeleted: false,
    publishedAt,
    dueAt: requestStartedAt,
    requestStartedAt,
    receivedAt: requestStartedAt,
    sourceAttemptId: 'attempt',
    providerAsOf: null,
    sourceAnalyticsId: null,
    windowId: '48h-v1',
    revision: 0,
    format: 'text',
    organicProvenance: {},
    sourceFingerprint: 'fingerprint',
    supersedesId: null,
    attestation: null,
    validity: 'valid',
    measurement: {
      collection: { version: 1, outcome: 'observed', reasonCode: null },
    },
  };
}
async function observationHarness() {
  const h = await createHarness({
    id: 'post_1',
    organizationId: 'org_1',
    brandId: 'brand_1',
    userId: 'user_1',
  });
  const context = {
    organizationId: 'org_1',
    brandId: 'brand_1',
    credentialId: 'credential_1',
    learningObservation: {
      publicationSource: observationSource(),
      sourceAttemptId: 'attempt',
      requestStartedAt: observedCheckpoint().requestStartedAt,
      receivedAt: observedCheckpoint().receivedAt,
    },
  };
  const metrics = {
    totalViews: 1000,
    totalLikes: 10,
    totalComments: 0,
    learningMetrics: captureLearningMetrics(
      { views: 1000, likes: 10 },
      { views: 'views', likes: 'likes' },
    ),
  };
  return { ...h, context, metrics };
}
describe('C4 daily upsert, committed physical capture and awaited refresh', () => {
  it('awaits upsert then capture commitment before scoped account read and notification', async () => {
    const h = await observationHarness(),
      trace: string[] = [];
    h.upsert.mockImplementation(async () => {
      trace.push('upsert');
      return { id: 'analytics_1' };
    });
    h.capture.mockImplementation(async () => {
      trace.push('capture begin');
      await Promise.resolve();
      trace.push('capture commit');
      return observedCheckpoint();
    });
    h.accountRead.mockImplementation(async () => {
      trace.push('account read');
      return { id: 'account', mode: 'live', epoch: 2, evidenceRevision: 3 };
    });
    h.queue.mockImplementation(async () => {
      trace.push('queue');
      return 'job';
    });
    expect(
      await h.service.updateTodayAnalytics(
        'post_1',
        'TWITTER',
        h.metrics,
        h.context,
      ),
    ).not.toBeNull();
    expect(trace).toEqual([
      'upsert',
      'capture begin',
      'capture commit',
      'account read',
      'queue',
    ]);
    expect(h.capture).toHaveBeenCalledWith(
      expect.objectContaining({
        publicationSource: h.context.learningObservation.publicationSource,
        learningMetrics: h.metrics.learningMetrics,
        objective: 'engagement',
        format: 'text',
        sourceAttemptId: 'attempt',
      }),
    );
    const bucket = h.queue.mock.calls[0]?.[0].inputValues?.refreshBucket;
    if (typeof bucket !== 'number') throw new Error('Missing refresh bucket');
    expect(h.accountRead).toHaveBeenCalledExactlyOnceWith({
      where: {
        organizationId: 'org_1',
        brandId: 'brand_1',
        credentialId: 'credential_1',
        isDeleted: false,
      },
    });
    expect(h.queue).toHaveBeenCalledExactlyOnceWith(
      {
        organizationId: 'org_1',
        actionType: CONTENT_LEARNING_ACTION_IDS.RECONCILE,
        canonicalId: CONTENT_LEARNING_ACTION_IDS.RECONCILE,
        source: 'content-learning-analytics',
        inputValues: {
          credentialId: 'credential_1',
          materializationOnly: true,
          refreshBucket: bucket,
        },
      },
      'learning-materialize-' +
        learningHash(['org_1', 'credential_1', 2, 3, bucket]),
      { attempts: 3, dispatchClass: 'background' },
    );
    expect(h.upsert.mock.calls[0][0].create).not.toHaveProperty(
      'learningMetrics',
    );
  });
  it.each(['null', 'retryable', 'terminal', 'invalid'])(
    'preserves analytics without notification for %s capture',
    async (outcome) => {
      const h = await observationHarness();
      if (outcome !== 'null')
        h.capture.mockResolvedValue({
          ...observedCheckpoint(),
          validity: outcome === 'invalid' ? 'invalid_source' : 'valid',
          measurement: {
            collection: {
              version: 1,
              outcome:
                outcome === 'retryable'
                  ? 'retryable_failure'
                  : outcome === 'terminal'
                    ? 'terminal_unavailable'
                    : 'observed',
              reasonCode: null,
            },
          },
        });
      expect(
        await h.service.updateTodayAnalytics(
          'post_1',
          'TWITTER',
          h.metrics,
          h.context,
        ),
      ).not.toBeNull();
      expect(h.upsert).toHaveBeenCalledOnce();
      expect(h.queue).not.toHaveBeenCalled();
    },
  );
  it('propagates capture failure outside the notification catch after daily upsert', async () => {
    const h = await observationHarness(),
      error = new Error('capture DB');
    h.capture.mockRejectedValue(error);
    await expect(
      h.service.updateTodayAnalytics('post_1', 'TWITTER', h.metrics, h.context),
    ).rejects.toBe(error);
    expect(h.upsert).toHaveBeenCalledOnce();
    expect(h.queue).not.toHaveBeenCalled();
    expect(h.logger.warn).not.toHaveBeenCalled();
  });
  it.each(['read', 'queue'])(
    'isolates post-commit %s failure with bounded logging',
    async (stage) => {
      const h = await observationHarness();
      h.capture.mockResolvedValue(observedCheckpoint());
      if (stage === 'read')
        h.accountRead.mockRejectedValue(new Error('private database details'));
      else h.queue.mockRejectedValue(new Error('private queue details'));
      expect(
        await h.service.updateTodayAnalytics(
          'post_1',
          'TWITTER',
          h.metrics,
          h.context,
        ),
      ).not.toBeNull();
      expect(h.logger.warn).toHaveBeenCalledWith(
        'learning_materialization_enqueue_failed',
        {
          organizationId: 'org_1',
          brandId: 'brand_1',
          credentialId: 'credential_1',
        },
      );
    },
  );
  it.each(['missing', 'platform', 'credential', 'invalid-date', 'attempt'])(
    'omits capture for invalid %s observation while preserving daily analytics',
    async (mutation) => {
      const h = await observationHarness();
      if (mutation === 'missing')
        Reflect.deleteProperty(
          h.context.learningObservation,
          'publicationSource',
        );
      if (mutation === 'platform')
        h.context.learningObservation.publicationSource.platform =
          Platform.FACEBOOK;
      if (mutation === 'credential')
        h.context.learningObservation.publicationSource.credentialId = 'other';
      if (mutation === 'invalid-date')
        h.context.learningObservation.receivedAt = new Date(Number.NaN);
      if (mutation === 'attempt')
        h.context.learningObservation.sourceAttemptId = '';
      expect(
        await h.service.updateTodayAnalytics(
          'post_1',
          'TWITTER',
          h.metrics,
          h.context,
        ),
      ).not.toBeNull();
      expect(h.capture).not.toHaveBeenCalled();
      expect(h.queue).not.toHaveBeenCalled();
    },
  );
  it.each([-1, 2147483648, 0.5])(
    'does not manufacture account counters from %s',
    async (epoch) => {
      const h = await observationHarness();
      h.capture.mockResolvedValue(observedCheckpoint());
      h.accountRead.mockResolvedValue({
        id: 'account',
        mode: 'live',
        epoch,
        evidenceRevision: 3,
      });
      await h.service.updateTodayAnalytics(
        'post_1',
        'TWITTER',
        h.metrics,
        h.context,
      );
      expect(h.queue).not.toHaveBeenCalled();
    },
  );
});

describe('C4 observation and notification completion boundaries', () => {
  it('does not derive learning evidence from daily totals without learningMetrics', async () => {
    const h = await observationHarness();
    await h.service.updateTodayAnalytics(
      'post_1',
      'TWITTER',
      { totalViews: 9999, totalLikes: 0, totalComments: 0 },
      h.context,
    );
    expect(h.upsert).toHaveBeenCalledOnce();
    expect(h.capture).not.toHaveBeenCalled();
    expect(h.queue).not.toHaveBeenCalled();
  });
  it('awaits notification completion before returning successful daily analytics', async () => {
    const h = await observationHarness();
    h.capture.mockResolvedValue(observedCheckpoint());
    let release = () => {};
    h.queue.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          release = () => resolve('job');
        }),
    );
    let finished = false;
    const pending = h.service
      .updateTodayAnalytics('post_1', 'TWITTER', h.metrics, h.context)
      .then((row) => {
        finished = true;
        return row;
      });
    await vi.waitFor(() => expect(h.queue).toHaveBeenCalledOnce());
    expect(finished).toBe(false);
    release();
    expect(await pending).not.toBeNull();
    expect(finished).toBe(true);
  });
  it.each([
    null,
    { id: 'account', mode: 'disabled', epoch: 2, evidenceRevision: 3 },
  ])('does not create or queue an unavailable account', async (account) => {
    const h = await observationHarness();
    h.capture.mockResolvedValue(observedCheckpoint());
    h.accountRead.mockResolvedValue(account);
    await h.service.updateTodayAnalytics(
      'post_1',
      'TWITTER',
      h.metrics,
      h.context,
    );
    expect(h.queue).not.toHaveBeenCalled();
  });
});
