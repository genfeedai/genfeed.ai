import type { LearningAccountService } from '@api/collections/content-learning/services/learning-account.service';
import { selectLearningBaseline } from '@api/collections/content-learning/services/learning-baseline-selection';
import {
  LearningCheckpointService,
  learningCheckpointCollection,
  learningCheckpointProfiles,
  parseLearningMeasurement,
} from '@api/collections/content-learning/services/learning-checkpoint.service';
import type { LearningDependencyService } from '@api/collections/content-learning/services/learning-dependency.service';
import {
  learningHash,
  learningScopeKey,
} from '@api/collections/content-learning/services/learning-operation.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { captureLearningMetrics } from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import {
  type LearningMeasurement,
  learningDescriptorTuple,
  learningRegisteredProfiles,
} from '@genfeedai/harness';
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

describe('exact descriptor frozen baseline', () => {
  const descriptor = learningRegisteredProfiles(
    'twitter',
    'text',
    'engagement',
  )[0].descriptor;
  const profileId = learningHash(learningDescriptorTuple(descriptor));
  const scope = {
    organizationId: 'org',
    brandId: 'brand',
    credentialId: 'credential',
    platform: 'twitter',
    format: 'text' as const,
    objective: 'engagement' as const,
    rewardProfileId: profileId,
  };
  function frozenFixture(rows: ContentLearningCheckpoint[]) {
    const f = fixture(rows);
    const baseline = {
      upsert: vi
        .fn()
        .mockImplementation(({ create }) => ({ id: 'baseline', ...create })),
    };
    const prisma = { ...f.prisma, contentLearningBaseline: baseline };
    prisma.$transaction.mockImplementation((callback) => callback(prisma));
    prisma.contentLearningCheckpoint.findFirst.mockImplementation(
      ({ where }) => rows.find((row) => row.id === where.id) ?? null,
    );
    const dependencies = {
      valid: vi.fn().mockResolvedValue(true),
      resolve: vi.fn().mockImplementation((kind, id) => ({
        kind,
        id,
        version: '0',
        organizationId: 'org',
      })),
      link: vi.fn(),
    };
    const service = new LearningCheckpointService(
      prisma as unknown as PrismaService,
      {} as LearningAccountService,
      dependencies as unknown as LearningDependencyService,
    );
    return { prisma, baseline, dependencies, service };
  }
  function sample(
    index: number,
    measurement: LearningMeasurement = { exposure: 1000, weightedActions: 0 },
  ) {
    return checkpoint({
      id: `checkpoint-${index}`,
      postId: `post-${index}`,
      validity: 'valid',
      measurement: {
        profile: 'engagement',
        measurement: { exposure: 9999, weightedActions: 999 },
        profiles: [
          {
            profileId,
            descriptor: { ...descriptor },
            measurement: { ...measurement },
          },
        ],
      },
    });
  }
  it.each([
    { exposure: -1, weightedActions: 0 },
    { exposure: 100, weightedActions: -1 },
    { exposure: 100, weightedActions: 0, averageWatchTimeSeconds: -1 },
    { exposure: 100, weightedActions: 0, averageWatchTimeSeconds: Infinity },
  ])('rejects invalid measurements %j', (value) => {
    expect(parseLearningMeasurement(value)).toBeNull();
  });
  it('counts exactly twenty matching profiles and preserves known zero, descriptor and same transaction lineage', async () => {
    const rows = Array.from({ length: 20 }, (_, index) => sample(index));
    const f = frozenFixture(rows);
    const result = await f.service.freeze(
      scope,
      new Date('2026-10-01'),
      descriptor,
    );
    expect(result).toMatchObject({
      count: 20,
      validity: 'valid',
      medianExposure: 1000,
      descriptorHash: profileId,
      cellDescriptor: descriptor,
      contributorCheckpointIds: rows.map((row) => row.id),
    });
    expect(result.samples).toHaveLength(20);
    expect(f.dependencies.valid).toHaveBeenCalledWith(
      'checkpoint',
      rows[0].id,
      f.prisma,
      'org',
    );
    expect(f.prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      f.prisma.contentLearningCheckpoint.findMany.mock.invocationCallOrder[0],
    );
  });
  it('excludes mixed masks and malformed newest rows before consuming distinct posts', async () => {
    const bad = sample(0, { exposure: -1, weightedActions: 0 });
    bad.id = 'malformed-newest';
    const other = sample(2);
    other.measurement = {
      profiles: [
        {
          profileId: 'other',
          descriptor: { ...descriptor },
          measurement: { exposure: 1000, weightedActions: 1 },
        },
      ],
    };
    const rows = [bad, sample(0), sample(1), other];
    const f = frozenFixture(rows);
    const result = await f.service.freeze(
      scope,
      new Date('2026-10-01'),
      descriptor,
    );
    expect(result.count).toBe(2);
    expect(result.contributorCheckpointIds).toEqual([
      sample(0).id,
      sample(1).id,
    ]);
    expect(result.validity).toBe('insufficient_baseline');
  });
  it('pages beyond five hundred unmatched candidates and caps fifty matching distinct posts', async () => {
    const rows = Array.from({ length: 550 }, (_, index) =>
      checkpoint({ id: `unmatched-${index}`, postId: `unmatched-${index}` }),
    ).concat(Array.from({ length: 55 }, (_, index) => sample(index)));
    const f = frozenFixture(rows);
    let page = 0;
    f.prisma.contentLearningCheckpoint.findMany.mockImplementation(() =>
      rows.slice(page++ * 100, page * 100),
    );
    const result = await f.service.freeze(
      scope,
      new Date('2026-10-01'),
      descriptor,
    );
    expect(result.count).toBe(50);
    expect(f.prisma.contentLearningCheckpoint.findMany).toHaveBeenCalledTimes(
      6,
    );
    expect(f.prisma.contentLearningCheckpoint.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        take: 100,
        where: expect.objectContaining({
          OR: expect.any(Array),
          receivedAt: {
            lte: new Date('2026-10-01'),
            gte: new Date(new Date('2026-10-01').getTime() - 90 * 86400000),
          },
        }),
      }),
    );
  });
  it('keeps nineteen valid contributors insufficient and reuses a supplied transaction without another fence', async () => {
    const f = frozenFixture(
      Array.from({ length: 19 }, (_, index) => sample(index)),
    );
    const result = await f.service.freeze(
      scope,
      new Date('2026-10-01'),
      descriptor,
      f.prisma as unknown as import('@genfeedai/prisma').Prisma.TransactionClient,
    );
    expect(result.count).toBe(19);
    expect(result.validity).toBe('insufficient_baseline');
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
    expect(f.prisma.$queryRaw).not.toHaveBeenCalled();
  });
  it('requires finite watch time for a retention descriptor', async () => {
    const watchDescriptor = learningRegisteredProfiles(
      'tiktok',
      'video',
      'retention-watch',
    )[0].descriptor;
    const watchHash = learningHash(learningDescriptorTuple(watchDescriptor));
    const row = checkpoint({
      validity: 'valid',
      format: 'video',
      measurement: {
        profiles: [
          {
            profileId: watchHash,
            descriptor: { ...watchDescriptor },
            measurement: { exposure: 1000, weightedActions: 0 },
          },
        ],
      },
    });
    const f = frozenFixture([row]);
    const result = await f.service.freeze(
      {
        ...scope,
        platform: 'tiktok',
        format: 'video',
        objective: 'retention-watch',
        rewardProfileId: watchHash,
      },
      new Date('2026-10-01'),
      watchDescriptor,
    );
    expect(result.count).toBe(0);
  });
  it.each([0, 19, 20, 50])(
    'keeps selector/freeze immutable parity at %s samples without selector writes',
    async (count) => {
      const rows = Array.from({ length: count }, (_, index) => sample(index)),
        f = frozenFixture(rows),
        cutoff = new Date('2026-10-01');
      const selected = await selectLearningBaseline(
        f.prisma as unknown as import('@genfeedai/prisma').Prisma.TransactionClient,
        scope,
        cutoff,
        descriptor,
        f.dependencies,
      );
      expect(selected.selected.map((row) => row.id)).toEqual(
        rows.map((row) => row.id),
      );
      expect(selected.samples).toHaveLength(count);
      expect(selected.samples.every((row) => row.weightedActions === 0)).toBe(
        true,
      );
      expect(f.baseline.upsert).not.toHaveBeenCalled();
      expect(f.dependencies.resolve).not.toHaveBeenCalled();
      expect(f.dependencies.link).not.toHaveBeenCalled();
      expect(f.prisma.$transaction).not.toHaveBeenCalled();
      expect(f.prisma.$queryRaw).not.toHaveBeenCalled();
      const frozen = await f.service.freeze(
        scope,
        cutoff,
        descriptor,
        f.prisma as unknown as import('@genfeedai/prisma').Prisma.TransactionClient,
      );
      expect(frozen).toMatchObject({
        fingerprint: learningHash([
          learningScopeKey(scope),
          profileId,
          cutoff.toISOString(),
          rows.map((row) => [row.id, row.revision]),
        ]),
        count,
        contributorCheckpointIds: rows.map((row) => row.id),
        contributorRevisions: rows.map((row) => row.revision),
        samples: selected.samples,
        validity: count >= 20 ? 'valid' : 'insufficient_baseline',
        medianExposure: count ? 1000 : 0,
      });
    },
  );
  it('retains exact tied keyset page-two ordering and rejects wrong objective/profile evidence', async () => {
    const rows = Array.from({ length: 100 }, (_, index) =>
        checkpoint({ id: `unmatched-${String(index).padStart(3, '0')}` }),
      ),
      matching = Array.from({ length: 20 }, (_, index) => sample(index)),
      f = frozenFixture([...rows, ...matching]);
    f.prisma.contentLearningCheckpoint.findMany
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce(matching);
    const result = await selectLearningBaseline(
      f.prisma as unknown as import('@genfeedai/prisma').Prisma.TransactionClient,
      scope,
      new Date('2026-10-01'),
      descriptor,
      f.dependencies,
    );
    expect(result.selected).toEqual(matching);
    expect(f.prisma.contentLearningCheckpoint.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { receivedAt: { lt: rows[99].receivedAt } },
            { receivedAt: rows[99].receivedAt, id: { gt: rows[99].id } },
          ],
        }),
        orderBy: [{ receivedAt: 'desc' }, { id: 'asc' }],
        take: 100,
      }),
    );
    const wrongDescriptor = learningRegisteredProfiles(
      'twitter',
      'text',
      'awareness',
    )[0].descriptor;
    const wrong = sample(0);
    wrong.measurement = {
      profiles: [
        {
          profileId,
          descriptor: { ...wrongDescriptor },
          measurement: { exposure: 1000, weightedActions: 0 },
        },
      ],
    };
    f.prisma.contentLearningCheckpoint.findMany.mockResolvedValue([wrong]);
    expect(
      (
        await selectLearningBaseline(
          f.prisma as unknown as import('@genfeedai/prisma').Prisma.TransactionClient,
          scope,
          new Date('2026-10-01'),
          descriptor,
          f.dependencies,
        )
      ).samples,
    ).toEqual([]);
  });
  it('never counts source-invalid rows or hides a deleted/revised contributor at final recheck', async () => {
    const f = frozenFixture([sample(0)]);
    f.dependencies.valid.mockResolvedValue(false);
    expect(
      (
        await selectLearningBaseline(
          f.prisma as unknown as import('@genfeedai/prisma').Prisma.TransactionClient,
          scope,
          new Date('2026-10-01'),
          descriptor,
          f.dependencies,
        )
      ).samples,
    ).toEqual([]);
    f.dependencies.valid.mockResolvedValue(true);
    f.prisma.contentLearningCheckpoint.findFirst.mockResolvedValue(null);
    await expect(
      selectLearningBaseline(
        f.prisma as unknown as import('@genfeedai/prisma').Prisma.TransactionClient,
        scope,
        new Date('2026-10-01'),
        descriptor,
        f.dependencies,
      ),
    ).rejects.toThrow('Baseline contributor changed');
    expect(f.baseline.upsert).not.toHaveBeenCalled();
  });
  it('rejects a contributor superseded before final lineage validation', async () => {
    const f = frozenFixture([sample(0)]);
    f.dependencies.valid
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    await expect(
      f.service.freeze(scope, new Date('2026-10-01'), descriptor),
    ).rejects.toThrow();
  });
});
