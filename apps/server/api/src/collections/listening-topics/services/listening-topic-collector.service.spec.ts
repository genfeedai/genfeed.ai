vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { ListeningTopicCollectorService } from '@api/collections/listening-topics/services/listening-topic-collector.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ListeningEvidenceType,
  ListeningSourcePlatform,
} from '@genfeedai/enums';

const context = {
  brandId: 'brand-1',
  organizationId: 'org-1',
  userId: 'user-1',
};

function createTopic(sourceCount = 1) {
  return {
    brandId: context.brandId,
    excludedKeywords: ['crypto'],
    freshnessHours: 24,
    id: 'topic-1',
    isActive: true,
    keywords: ['ai agents'],
    languages: ['en'],
    organizationId: context.organizationId,
    sources: Array.from({ length: sourceCount }, (_, index) => ({
      collectionCursor: `cursor-${index + 1}`,
      id: `topic-source-${index + 1}`,
      platform: ListeningSourcePlatform.TWITTER,
      source: {
        brandId: context.brandId,
        credentialId: `credential-${index + 1}`,
        handle: `source-${index + 1}`,
        id: `source-${index + 1}`,
        isActive: true,
        organizationId: context.organizationId,
        platform: ListeningSourcePlatform.TWITTER,
        userId: context.userId,
      },
      sourceId: `source-${index + 1}`,
      topicId: 'topic-1',
    })),
  };
}

function createHarness(
  topic: ReturnType<typeof createTopic> | null = createTopic(),
) {
  const listeningEvidence = { upsert: vi.fn().mockResolvedValue({}) };
  const listeningTopicSource = { update: vi.fn().mockResolvedValue({}) };
  const transactionTopic = { update: vi.fn().mockResolvedValue({}) };
  const transactionClient = {
    listeningEvidence,
    listeningTopic: transactionTopic,
    listeningTopicSource,
  };
  const transaction = vi.fn(
    async (callback: (client: typeof transactionClient) => Promise<unknown>) =>
      callback(transactionClient),
  );
  const listeningTopic = {
    findFirst: vi
      .fn()
      .mockResolvedValueOnce(topic)
      .mockResolvedValue(topic ? { ...topic, sources: topic.sources } : null),
  };
  const failedStateUpdate = vi.fn().mockResolvedValue({});
  const prisma = {
    $transaction: transaction,
    listeningTopic,
    listeningTopicSource: { update: failedStateUpdate },
  };
  const sourceCollector = { collectTimeline: vi.fn() };
  const sourcePostsService = { upsertCollectedPosts: vi.fn() };
  const service = new ListeningTopicCollectorService(
    prisma as unknown as PrismaService,
    sourceCollector as never,
    sourcePostsService as never,
  );

  return {
    failedStateUpdate,
    listeningEvidence,
    listeningTopic,
    listeningTopicSource,
    service,
    sourceCollector,
    sourcePostsService,
    transaction,
    transactionTopic,
  };
}

describe('ListeningTopicCollectorService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-26T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects an inactive or out-of-scope topic before provider or evidence work', async () => {
    const harness = createHarness(null);

    await expect(
      harness.service.collectScoped('foreign-topic', {}, context),
    ).rejects.toThrow('Listening topic not found');

    expect(harness.sourceCollector.collectTimeline).not.toHaveBeenCalled();
    expect(
      harness.sourcePostsService.upsertCollectedPosts,
    ).not.toHaveBeenCalled();
    expect(harness.listeningEvidence.upsert).not.toHaveBeenCalled();
  });

  it('filters topic evidence and commits dedupe plus cursor after persistence', async () => {
    const harness = createHarness();
    harness.sourceCollector.collectTimeline.mockResolvedValue({
      handle: 'source-1',
      platform: ListeningSourcePlatform.TWITTER,
      posts: [
        {
          authorId: 'author-1',
          authorUsername: 'operator',
          contentUrl: 'https://x.com/operator/status/match',
          createdAt: new Date('2026-08-26T09:00:00.000Z'),
          id: 'post-match',
          language: 'en',
          metrics: { likes: 7 },
          platform: ListeningSourcePlatform.TWITTER,
          text: 'AI agents are changing public support',
        },
        {
          id: 'post-excluded',
          language: 'en',
          platform: ListeningSourcePlatform.TWITTER,
          text: 'AI agents and crypto speculation',
        },
        {
          id: 'post-wrong-language',
          language: 'fr',
          platform: ListeningSourcePlatform.TWITTER,
          text: 'AI agents en production',
        },
        {
          id: 'post-no-keyword',
          language: 'en',
          platform: ListeningSourcePlatform.TWITTER,
          text: 'A general company update',
        },
      ],
      provider: 'app-bearer',
    });
    harness.sourcePostsService.upsertCollectedPosts.mockResolvedValue({
      posts: [{ externalId: 'post-match', id: 'source-post-1' }],
      rejectedCount: 0,
    });

    await harness.service.collectScoped('topic-1', { limit: 40 }, context);

    expect(harness.listeningTopic.findFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        include: {
          sources: expect.objectContaining({
            where: {
              brandId: 'brand-1',
              isDeleted: false,
              organizationId: 'org-1',
              source: {
                is: {
                  brandId: 'brand-1',
                  isActive: true,
                  isDeleted: false,
                  organizationId: 'org-1',
                },
              },
            },
          }),
        },
        where: {
          brandId: 'brand-1',
          id: 'topic-1',
          isActive: true,
          isDeleted: false,
          organizationId: 'org-1',
        },
      }),
    );
    expect(harness.sourceCollector.collectTimeline).toHaveBeenCalledWith(
      ListeningSourcePlatform.TWITTER,
      'source-1',
      {
        brandId: 'brand-1',
        credentialId: 'credential-1',
        includeReplies: true,
        includeReposts: false,
        limit: 40,
        organizationId: 'org-1',
        sinceId: 'cursor-1',
      },
    );
    expect(
      harness.sourcePostsService.upsertCollectedPosts,
    ).toHaveBeenCalledWith(expect.objectContaining({ id: 'source-1' }), [
      expect.objectContaining({ externalId: 'post-match' }),
    ]);
    expect(harness.listeningEvidence.upsert).toHaveBeenCalledTimes(1);
    expect(harness.listeningEvidence.upsert).toHaveBeenCalledWith({
      create: expect.objectContaining({
        eventType: ListeningEvidenceType.POST,
        externalId: 'post-match',
        organizationId: 'org-1',
        sourcePostId: 'source-post-1',
        topicId: 'topic-1',
        topicSourceId: 'topic-source-1',
      }),
      update: expect.objectContaining({
        isDeleted: false,
        sourcePostId: 'source-post-1',
      }),
      where: {
        topicId_platform_externalId: {
          externalId: 'post-match',
          platform: ListeningSourcePlatform.TWITTER,
          topicId: 'topic-1',
        },
      },
    });
    expect(harness.listeningTopicSource.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        collectionCursor: 'post-match',
        collectionState: 'success',
        lastCollectionError: null,
        lastCollectedAt: new Date('2026-08-26T10:00:00.000Z'),
        rateLimitedAt: null,
      }),
      where: expect.objectContaining({
        brandId: 'brand-1',
        id: 'topic-source-1',
        organizationId: 'org-1',
        topicId: 'topic-1',
      }),
    });
    expect(
      harness.listeningEvidence.upsert.mock.invocationCallOrder[0],
    ).toBeLessThan(
      harness.listeningTopicSource.update.mock.invocationCallOrder[0],
    );
  });

  it('keeps valid evidence aligned when an identifier-less match is rejected', async () => {
    const harness = createHarness();
    harness.sourceCollector.collectTimeline.mockResolvedValue({
      handle: 'source-1',
      platform: ListeningSourcePlatform.TWITTER,
      posts: [
        {
          id: undefined,
          language: 'en',
          platform: ListeningSourcePlatform.TWITTER,
          text: 'AI agents without an identifier',
        },
        {
          id: 'post-valid',
          language: 'en',
          platform: ListeningSourcePlatform.TWITTER,
          text: 'AI agents with a stable identifier',
        },
      ],
      provider: 'apify',
    } as never);
    harness.sourcePostsService.upsertCollectedPosts.mockResolvedValue({
      posts: [{ externalId: 'post-valid', id: 'source-post-valid' }],
      rejectedCount: 1,
    });

    await harness.service.collectScoped('topic-1', {}, context);

    expect(harness.listeningEvidence.upsert).toHaveBeenCalledTimes(1);
    expect(harness.listeningEvidence.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          externalId: 'post-valid',
          sourcePostId: 'source-post-valid',
        }),
      }),
    );
    expect(harness.listeningTopicSource.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        collectionCursor: 'post-valid',
        collectionState: 'success',
        lastCollectionError:
          'Skipped 1 collected post without a stable external identifier',
      }),
      where: expect.objectContaining({ id: 'topic-source-1' }),
    });
  });

  it('records an empty source without advancing its cursor', async () => {
    const harness = createHarness();
    harness.sourceCollector.collectTimeline.mockResolvedValue({
      handle: 'source-1',
      platform: ListeningSourcePlatform.TWITTER,
      posts: [],
      provider: 'brand-oauth',
    });
    harness.sourcePostsService.upsertCollectedPosts.mockResolvedValue({
      posts: [],
      rejectedCount: 0,
    });

    await harness.service.collectScoped('topic-1', {}, context);

    expect(harness.listeningEvidence.upsert).not.toHaveBeenCalled();
    expect(harness.listeningTopicSource.update).toHaveBeenCalledWith({
      data: {
        collectionState: 'empty',
        lastCollectionError: null,
        lastCollectedAt: new Date('2026-08-26T10:00:00.000Z'),
        rateLimitedAt: null,
      },
      where: expect.objectContaining({ id: 'topic-source-1' }),
    });
  });

  it('records a rate limit and continues collecting the remaining sources', async () => {
    const topic = createTopic(2);
    const harness = createHarness(topic);
    harness.sourceCollector.collectTimeline
      .mockRejectedValueOnce(new Error('provider returned HTTP 429'))
      .mockResolvedValueOnce({
        handle: 'source-2',
        platform: ListeningSourcePlatform.TWITTER,
        posts: [],
        provider: 'brand-oauth',
      });
    harness.sourcePostsService.upsertCollectedPosts.mockResolvedValue({
      posts: [],
      rejectedCount: 0,
    });

    await expect(
      harness.service.collectScoped('topic-1', {}, context),
    ).resolves.toEqual(expect.objectContaining({ id: 'topic-1' }));

    expect(harness.sourceCollector.collectTimeline).toHaveBeenCalledTimes(2);
    expect(harness.failedStateUpdate).toHaveBeenCalledWith({
      data: {
        collectionState: 'rate_limited',
        lastCollectionError: 'provider returned HTTP 429',
        rateLimitedAt: new Date('2026-08-26T10:00:00.000Z'),
      },
      where: expect.objectContaining({
        id: 'topic-source-1',
        organizationId: 'org-1',
      }),
    });
    expect(harness.listeningTopicSource.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ collectionState: 'empty' }),
        where: expect.objectContaining({ id: 'topic-source-2' }),
      }),
    );
  });

  it('collects independent sources concurrently with a bounded provider fan-out', async () => {
    vi.useRealTimers();
    const harness = createHarness(createTopic(5));
    let active = 0;
    let maxActive = 0;
    const releases: Array<() => void> = [];
    harness.sourceCollector.collectTimeline.mockImplementation(
      () =>
        new Promise((resolve) => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          releases.push(() => {
            active -= 1;
            resolve({
              handle: 'source',
              platform: ListeningSourcePlatform.TWITTER,
              posts: [],
              provider: 'brand-oauth',
            });
          });
        }),
    );

    const collection = harness.service.collectScoped('topic-1', {}, context);
    await vi.waitFor(() =>
      expect(harness.sourceCollector.collectTimeline).toHaveBeenCalledTimes(3),
    );
    expect(maxActive).toBe(3);

    for (const release of releases.splice(0)) {
      release();
    }
    await vi.waitFor(() =>
      expect(harness.sourceCollector.collectTimeline).toHaveBeenCalledTimes(5),
    );
    for (const release of releases.splice(0)) {
      release();
    }

    await expect(collection).resolves.toEqual(
      expect.objectContaining({ id: 'topic-1' }),
    );
    expect(maxActive).toBe(3);
  });

  it('records a recoverable failure without mutating the previous cursor', async () => {
    const harness = createHarness();
    harness.sourceCollector.collectTimeline.mockRejectedValue(
      new Error('provider unavailable'),
    );

    await harness.service.collectScoped('topic-1', {}, context);

    expect(harness.failedStateUpdate).toHaveBeenCalledWith({
      data: {
        collectionState: 'failed',
        lastCollectionError: 'provider unavailable',
        rateLimitedAt: null,
      },
      where: expect.objectContaining({ id: 'topic-source-1' }),
    });
    expect(
      harness.failedStateUpdate.mock.calls[0]?.[0].data,
    ).not.toHaveProperty('collectionCursor');
  });
});
