import type { LearningAccountService } from '@api/collections/content-learning/services/learning-account.service';
import {
  LearningCheckpointService,
  learningCheckpointCollection,
  learningCheckpointProfiles,
} from '@api/collections/content-learning/services/learning-checkpoint.service';
import type { LearningDependencyService } from '@api/collections/content-learning/services/learning-dependency.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { captureLearningMetrics } from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import type { ContentLearningCheckpoint } from '@genfeedai/prisma';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class {},
}));
function checkpoint(
  overrides: Partial<ContentLearningCheckpoint> = {},
): ContentLearningCheckpoint {
  return {
    id: 'checkpoint',
    organizationId: 'org',
    brandId: 'brand',
    credentialId: 'credential',
    postId: 'post',
    createdAt: new Date('2026-09-30T12:00:01Z'),
    updatedAt: new Date('2026-09-30T12:00:01Z'),
    isDeleted: false,
    publishedAt: new Date('2026-09-28T12:00:00Z'),
    dueAt: new Date('2026-09-30T12:00:00Z'),
    requestStartedAt: new Date('2026-09-30T12:00:00Z'),
    receivedAt: new Date('2026-09-30T12:00:01Z'),
    sourceAttemptId: 'actual-provider-attempt',
    providerAsOf: null,
    sourceAnalyticsId: null,
    windowId: '48h-v1',
    revision: 0,
    format: 'text',
    organicProvenance: {},
    sourceFingerprint: 'fingerprint',
    supersedesId: null,
    attestation: null,
    validity: 'unknown_organic',
    measurement: {
      collection: { version: 1, outcome: 'observed', reasonCode: null },
      metricAvailability: {},
    },
    ...overrides,
  };
}
function fixture(rows: ContentLearningCheckpoint[]) {
  const row = checkpoint();
  const prisma = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'post' }]),
    $transaction: vi.fn(),
    post: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ id: 'post', publishedAt: row.publishedAt }),
    },
    contentLearningAccount: {
      findFirst: vi.fn().mockResolvedValue({ mode: 'shadow' }),
    },
    credential: { findFirst: vi.fn().mockResolvedValue({ id: 'credential' }) },
    contentLearningCheckpoint: {
      findMany: vi.fn().mockResolvedValue(rows),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  };
  prisma.$transaction.mockImplementation((callback) => callback(prisma));
  const accounts = {
    credential: vi
      .fn()
      .mockResolvedValue({ brandId: 'brand', platform: 'TWITTER' }),
    ensure: vi.fn().mockResolvedValue({ id: 'account', mode: 'shadow' }),
  };
  return {
    prisma,
    service: new LearningCheckpointService(
      prisma as unknown as PrismaService,
      accounts as unknown as LearningAccountService,
      {} as LearningDependencyService,
    ),
  };
}
describe('fixed physical provider observation fulfillment', () => {
  it('recognizes timely explicit observation despite unknown organic status or unavailable metrics', () => {
    expect(learningCheckpointCollection(checkpoint())).toMatchObject({
      outcome: 'observed',
    });
    expect(
      learningCheckpointCollection(checkpoint({ validity: 'superseded' })),
    ).toMatchObject({ outcome: 'observed' });
  });
  it('keeps failed, delayed and ambiguous legacy rows retryable instead of guessing success', () => {
    expect(
      learningCheckpointCollection(
        checkpoint({ receivedAt: new Date('2026-09-30T12:03:00Z') }),
      ),
    ).toBeNull();
    expect(
      learningCheckpointCollection(
        checkpoint({
          measurement: {
            metricAvailability: {
              views: { value: 0, availability: 'unavailable' },
            },
          },
        }),
      ),
    ).toBeNull();
    expect(
      learningCheckpointCollection(
        checkpoint({
          measurement: {
            metricAvailability: {
              views: { value: 0, availability: 'observed' },
            },
          },
        }),
      ),
    ).toMatchObject({ outcome: 'observed' });
  });
  it('finds original observed receipt before later retry failures in exact publication scope', async () => {
    const first = checkpoint(),
      f = fixture([
        first,
        checkpoint({
          id: 'later',
          revision: 1,
          measurement: {
            collection: {
              version: 1,
              outcome: 'retryable_failure',
              reasonCode: 'provider_fetch_failed',
            },
          },
        }),
      ]);
    expect(
      await f.service.fulfilledWindow(
        'org',
        'post',
        'credential',
        first.publishedAt,
      ),
    ).toBe(first);
    expect(f.prisma.contentLearningCheckpoint.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org',
          postId: 'post',
          credentialId: 'credential',
          publishedAt: first.publishedAt,
          windowId: '48h-v1',
          isDeleted: false,
        },
      }),
    );
  });
  it('does not fulfill retryable failure but suppresses permanent unavailable receipt', async () => {
    const first = checkpoint({
      measurement: {
        collection: {
          version: 1,
          outcome: 'retryable_failure',
          reasonCode: 'rate_limited',
        },
      },
    });
    const f = fixture([first]);
    expect(
      await f.service.fulfilledWindow(
        'org',
        'post',
        'credential',
        first.publishedAt,
      ),
    ).toBeNull();
    f.prisma.contentLearningCheckpoint.findMany.mockResolvedValue([
      checkpoint({
        measurement: {
          collection: {
            version: 1,
            outcome: 'terminal_unavailable',
            reasonCode: 'unauthorized',
          },
        },
      }),
    ]);
    expect(
      await f.service.fulfilledWindow(
        'org',
        'post',
        'credential',
        first.publishedAt,
      ),
    ).not.toBeNull();
  });
  it('returns the first physical observation under the post lock rather than sampling a fresh score', async () => {
    const original = checkpoint(),
      f = fixture([original]);
    const result = await f.service.capture({
      organizationId: 'org',
      postId: 'post',
      credentialId: 'credential',
      format: 'text',
      objective: 'awareness',
      publishedAt: original.publishedAt,
      requestStartedAt: new Date('2026-09-30T12:15:00Z'),
      receivedAt: new Date('2026-09-30T12:15:01Z'),
      sourceAttemptId: 'racing-provider-attempt',
      learningMetrics: captureLearningMetrics(
        { views: 999 },
        { views: 'views' },
      ),
    });
    expect(result).toBe(original);
    expect(f.prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(f.prisma.contentLearningCheckpoint.create).not.toHaveBeenCalled();
  });
  it.each([
    'deleted',
    'retargeted',
    'publication_changed',
    'disabled',
    'credential_deleted',
    'lock_missing',
  ])(
    'rechecks %s under the fence before writing a receipt',
    async (mutation) => {
      const original = checkpoint(),
        f = fixture([]);
      if (['deleted', 'retargeted', 'publication_changed'].includes(mutation))
        f.prisma.post.findFirst
          .mockResolvedValueOnce({
            id: 'post',
            publishedAt: original.publishedAt,
          })
          .mockResolvedValueOnce(null);
      if (mutation === 'disabled')
        f.prisma.contentLearningAccount.findFirst.mockResolvedValue({
          mode: 'disabled',
        });
      if (mutation === 'credential_deleted')
        f.prisma.credential.findFirst.mockResolvedValue(null);
      if (mutation === 'lock_missing')
        f.prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      expect(
        await f.service.capture({
          organizationId: 'org',
          postId: 'post',
          credentialId: 'credential',
          format: 'text',
          objective: 'awareness',
          publishedAt: original.publishedAt,
          requestStartedAt: original.requestStartedAt,
          receivedAt: original.receivedAt,
          sourceAttemptId: 'attempt',
          learningMetrics: captureLearningMetrics(
            { views: 10 },
            { views: 'views' },
          ),
        }),
      ).toBeNull();
      expect(f.prisma.contentLearningCheckpoint.create).not.toHaveBeenCalled();
    },
  );
});

describe('immutable physical observation profile projections', () => {
  it('derives all registered projections once and keeps missing saves distinct from observed zero', () => {
    const metrics = captureLearningMetrics(
      { impressions: 1000, views: 1200, likes: 10, comments: 5, shares: 2 },
      {
        impressions: 'impressions',
        views: 'views',
        likes: 'likes',
        comments: 'comments',
        shares: 'shares',
        saves: 'saves',
      },
    );
    const missing = learningCheckpointProfiles(
      'twitter',
      'text',
      metrics,
    ).filter((profile) => profile.descriptor.objective === 'engagement');
    expect(missing).toHaveLength(2);
    expect(missing[0].measurement).toBeNull();
    expect(missing[1].measurement).toMatchObject({
      exposure: 1000,
      weightedActions: 28,
    });
    const observedZero = learningCheckpointProfiles('twitter', 'text', {
      ...metrics,
      metrics: {
        ...metrics.metrics,
        saves: { availability: 'observed', value: 0, source: 'bookmark_count' },
      },
    }).filter((profile) => profile.descriptor.objective === 'engagement');
    expect(observedZero[0].profileId).toBe(missing[0].profileId);
    expect(observedZero[0].measurement).toMatchObject({
      exposure: 1000,
      weightedActions: 28,
    });
    expect(observedZero[0].profileId).not.toBe(observedZero[1].profileId);
  });
  it('does not invent missing exposure or substitute an unsupported pin-click metric', () => {
    const metrics = captureLearningMetrics(
      { impressions: 1000, pinClicks: 99 },
      { impressions: 'impressions', clicks: 'outbound_clicks' },
    );
    const profiles = learningCheckpointProfiles('pinterest', 'image', metrics);
    expect(
      profiles.find(
        (profile) => profile.descriptor.objective === 'conversion-click',
      )?.measurement,
    ).toBeNull();
    expect(learningCheckpointProfiles('unknown', 'text', metrics)).toEqual([]);
  });
});
