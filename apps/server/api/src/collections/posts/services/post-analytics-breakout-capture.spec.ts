import type { LearningCheckpointService } from '@api/collections/content-learning/services/learning-checkpoint.service';
import { registerBreakoutResponse } from '@api/collections/outliers/services/breakout-response-identity.util';
import type { OutliersService } from '@api/collections/outliers/services/outliers.service';
import { capturePostExposureObservation } from '@api/collections/outliers/services/post-exposure-observation.util';
import { PostAnalyticsService } from '@api/collections/posts/services/post-analytics.service';
import type { PostsService } from '@api/collections/posts/services/posts.service';
import type { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { TwitterResponseMapper } from '@api/services/integrations/twitter/services/twitter-response.mapper';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Platform } from '@genfeedai/contracts';
import type {
  AnalyticsPersistenceContext,
  BreakoutPublicationSourceV1,
} from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';

vi.mock(
  '@api/collections/outliers/services/post-exposure-observation.util',
  () => ({
    loadPostExposurePublication: vi.fn(),
    capturePostExposureObservation: vi.fn(),
  }),
);
vi.mock(
  '@api/collections/outliers/services/breakout-response-identity.util',
  () => ({ registerBreakoutResponse: vi.fn() }),
);

function harness() {
  const source: BreakoutPublicationSourceV1 = {
    version: 1,
    organizationId: 'org-a',
    brandId: 'brand-a',
    credentialId: 'credential-a',
    postId: 'post-a',
    externalId: 'tweet-a',
    platform: Platform.TWITTER,
    format: 'video',
    publishedAt: '2026-10-08T11:00:00Z',
    contentDigest: 'digest-a',
    publicationFingerprint: 'publication-a',
    logicalPostId: 'logical-a',
    isResponse: false,
  };
  const context: AnalyticsPersistenceContext = {
    organizationId: source.organizationId,
    brandId: source.brandId,
    credentialId: source.credentialId,
    exposureObservation: {
      source,
      sourceAttemptId: 'attempt-a',
      requestStartedAt: new Date('2026-10-08T12:00:00Z'),
      receivedAt: new Date('2026-10-08T12:00:01Z'),
    },
  };
  const upsert = vi.fn(async (_args: Prisma.PostAnalyticsUpsertArgs) => ({
    id: 'daily-a',
  }));
  const tx = {
    outlierConfiguration: { findFirst: vi.fn(async () => null) },
  } as unknown as Prisma.TransactionClient;
  const transaction = vi.fn(
    async (
      fn: (client: Prisma.TransactionClient) => Promise<unknown>,
      _options?: { maxWait: number; timeout: number },
    ) => fn(tx),
  );
  const capture = vi.mocked(capturePostExposureObservation);
  capture.mockResolvedValue({
    status: 'captured',
    observationId: 'observation-a',
  });
  const detect = vi.mocked(registerBreakoutResponse);
  detect.mockResolvedValue({
    status: 'evidence_held',
    reason: 'below_threshold',
  });
  const learningCapture = vi.fn();
  const service = new PostAnalyticsService(
    {
      $transaction: transaction,
      postAnalytics: { findFirst: vi.fn(async () => null), upsert },
      credential: { findFirst: vi.fn(async () => ({ platform: 'TWITTER' })) },
    } as unknown as PrismaService,
    { log: vi.fn(), error: vi.fn(), warn: vi.fn() } as unknown as LoggerService,
    {
      findOne: vi.fn(async () => ({
        id: source.postId,
        brandId: source.brandId,
        organizationId: source.organizationId,
        credentialId: source.credentialId,
        userId: 'user-a',
      })),
    } as unknown as PostsService,
    { authorize: vi.fn(async () => ({})) } as unknown as OutliersService,
    { capture: learningCapture } as unknown as LearningCheckpointService,
    {} as WorkflowExecutionQueueService,
  );
  return {
    source,
    context,
    service,
    upsert,
    tx,
    transaction,
    capture,
    detect,
    learningCapture,
  };
}

describe('PostAnalyticsService prospective capture wiring', () => {
  beforeEach(() => vi.clearAllMocks());
  it('routes real X mapper evidence through normal attribution and transactional capture', async () => {
    const h = harness();
    const analytics = new TwitterResponseMapper().mapAnalytics({
      data: [
        {
          organic_metrics: { impression_count: 0 },
          public_metrics: { impression_count: 100_000 },
        },
      ],
    });
    await h.service.processTwitterAnalytics(
      h.source.postId,
      analytics,
      h.context,
    );
    expect(h.transaction).toHaveBeenCalledOnce();
    expect(h.capture).toHaveBeenCalledWith(
      h.tx,
      expect.objectContaining({
        source: h.source,
        sourceAttemptId: 'attempt-a',
        exposures: expect.objectContaining({
          impressions: analytics.breakoutExposures?.impressions,
        }),
        isPinned: null,
        isPromoted: null,
      }),
    );
    const call = h.upsert.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    expect(call).toHaveProperty('create.impressions', 0);
    expect(call).not.toHaveProperty('create.breakoutExposures');
    expect(call).not.toHaveProperty('update.breakoutExposures');
    expect(call).not.toHaveProperty('create.learningMetrics');
    expect(h.learningCapture).not.toHaveBeenCalled();
    expect(h.detect).toHaveBeenCalledWith(
      h.tx,
      expect.objectContaining({
        targetObservationId: 'observation-a',
        metric: 'impressions',
        organizationId: h.source.organizationId,
        credentialId: h.source.credentialId,
      }),
    );
    expect(h.transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 10_000,
      timeout: 60_000,
    });
  });
  it('cannot use a generic exposure source to enter experimental learning', async () => {
    const h = harness();
    await h.service.processTwitterAnalytics(
      h.source.postId,
      new TwitterResponseMapper().mapAnalytics({
        data: [{ organic_metrics: { impression_count: 1000 } }],
      }),
      h.context,
    );
    expect(h.capture).toHaveBeenCalledOnce();
    expect(h.learningCapture).not.toHaveBeenCalled();
  });
  it.each([
    'organizationId',
    'brandId',
    'credentialId',
    'postId',
    'platform',
  ] as const)(
    'rejects mismatched source %s before writing daily metrics',
    async (key) => {
      const h = harness();
      if (key === 'platform') h.source.platform = Platform.INSTAGRAM;
      else h.source[key] = 'foreign';
      await expect(
        h.service.processTwitterAnalytics(
          'post-a',
          { views: 100, likes: 1, comments: 0 },
          h.context,
        ),
      ).rejects.toThrow('Exposure collection source');
      expect(h.upsert).not.toHaveBeenCalled();
      expect(h.capture).not.toHaveBeenCalled();
    },
  );
  it.each([
    'source_changed',
    'attempt_conflict',
    'invalid_collection',
  ] as const)(
    'does not call a held %s capture successful collection',
    async (status) => {
      const h = harness();
      h.capture.mockResolvedValue({ status });
      await expect(
        h.service.processTwitterAnalytics(
          h.source.postId,
          { views: 100, likes: 1, comments: 0 },
          h.context,
        ),
      ).rejects.toThrow(`Exposure observation held: ${status}`);
    },
  );
  it('preserves old collection behavior when no prospective source was prepared', async () => {
    const h = harness();
    delete h.context.exposureObservation;
    await h.service.processTwitterAnalytics(
      h.source.postId,
      { views: 100, likes: 1, comments: 0 },
      h.context,
    );
    expect(h.upsert).toHaveBeenCalledOnce();
    expect(h.capture).not.toHaveBeenCalled();
    expect(h.detect).not.toHaveBeenCalled();
  });
  it('propagates detection failure so capture and detection cannot commit separately', async () => {
    const h = harness();
    h.detect.mockResolvedValue({ status: 'receipt_conflict' });
    await expect(
      h.service.processTwitterAnalytics(
        h.source.postId,
        new TwitterResponseMapper().mapAnalytics({
          data: [{ organic_metrics: { impression_count: 1000 } }],
        }),
        h.context,
      ),
    ).rejects.toThrow('Breakout detection held: receipt_conflict');
  });
});
