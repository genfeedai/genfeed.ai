import type { LearningDependencyService } from '@api/collections/content-learning/services/learning-dependency.service';
import { learningHash } from '@api/collections/content-learning/services/learning-operation.service';
import { LearningRewardService } from '@api/collections/content-learning/services/learning-reward.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LearningDependencyKindV1 } from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import { computeLearningReward } from '@genfeedai/harness';
import type {
  ContentLearningBaseline,
  ContentLearningCheckpoint,
  ContentLearningDecision,
  ContentLearningReward,
  Prisma,
} from '@genfeedai/prisma';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class {},
}));
function fixture() {
  const decision: Pick<
    ContentLearningDecision,
    'id' | 'baselineId' | 'state' | 'brandId' | 'credentialId'
  > = {
    id: 'decision',
    baselineId: 'baseline',
    state: 'published',
    brandId: 'brand',
    credentialId: 'credential',
  };
  const checkpoint: Pick<
    ContentLearningCheckpoint,
    | 'id'
    | 'revision'
    | 'measurement'
    | 'validity'
    | 'receivedAt'
    | 'dueAt'
    | 'organicProvenance'
  > = {
    id: 'checkpoint',
    revision: 2,
    measurement: { measurement: { exposure: 1000, weightedActions: 100 } },
    validity: 'valid',
    dueAt: new Date('2026-10-01'),
    receivedAt: new Date('2026-10-01T00:00:01Z'),
    organicProvenance: { isPaid: false, isPinned: false },
  };
  const baseline: Pick<
    ContentLearningBaseline,
    'id' | 'samples' | 'count' | 'fingerprint'
  > = {
    id: 'baseline',
    count: 20,
    fingerprint: 'baseline-fingerprint',
    samples: Array.from({ length: 20 }, () => ({
      exposure: 1000,
      weightedActions: 100,
    })),
  };
  let latest: Pick<
    ContentLearningReward,
    'id' | 'version' | 'sourceFingerprint'
  > | null = null;
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    contentLearningDecision: {
      findFirst: vi
        .fn()
        .mockImplementation((): typeof decision | null => decision),
    },
    contentLearningCheckpoint: {
      findFirst: vi
        .fn()
        .mockImplementation((): typeof checkpoint | null => checkpoint),
    },
    contentLearningBaseline: {
      findFirst: vi
        .fn()
        .mockImplementation((): typeof baseline | null => baseline),
    },
    contentLearningReward: {
      findFirst: vi.fn().mockImplementation(() => latest),
      create: vi
        .fn()
        .mockImplementation(
          ({
            data,
          }: {
            data: Prisma.ContentLearningRewardUncheckedCreateInput;
          }) => {
            latest = {
              id: `reward-${data.version}`,
              version: data.version ?? 1,
              sourceFingerprint: data.sourceFingerprint,
            };
            return { ...data, ...latest };
          },
        ),
    },
    contentLearningAccount: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const root = {
    $transaction: vi
      .fn()
      .mockImplementation((apply: (client: typeof tx) => Promise<unknown>) =>
        apply(tx),
      ),
    contentLearningDecision: { findFirst: vi.fn() },
    contentLearningCheckpoint: { findFirst: vi.fn() },
    contentLearningBaseline: { findFirst: vi.fn() },
  };
  const dependencies = {
    valid: vi.fn().mockResolvedValue(true),
    invalidate: vi.fn(),
    link: vi.fn(),
    resolve: vi
      .fn()
      .mockImplementation(
        (
          kind: LearningDependencyKindV1,
          id: string,
          organizationId: string | null,
          _client: Prisma.TransactionClient,
        ) => ({ kind, id, organizationId, version: '1' }),
      ),
  };
  const service = new LearningRewardService(
    root as unknown as PrismaService,
    dependencies as unknown as LearningDependencyService,
  );
  function assertEntry() {
    expect(root.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    const sql = tx.$queryRaw.mock.calls[0][0].join('');
    expect(sql).toContain('pg_advisory_xact_lock(5728, 1)');
    expect(sql).not.toContain('lock_shared');
    for (const model of [
      root.contentLearningDecision,
      root.contentLearningCheckpoint,
      root.contentLearningBaseline,
    ])
      expect(model.findFirst).not.toHaveBeenCalled();
    for (const mock of [
      tx.contentLearningDecision.findFirst,
      tx.contentLearningCheckpoint.findFirst,
      tx.contentLearningBaseline.findFirst,
      dependencies.valid,
    ])
      if (mock.mock.invocationCallOrder.length)
        expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
          mock.mock.invocationCallOrder[0],
        );
  }
  function assertNoWrites() {
    for (const mock of [
      tx.contentLearningReward.create,
      dependencies.invalidate,
      dependencies.resolve,
      dependencies.link,
      tx.contentLearningAccount.updateMany,
    ])
      expect(mock).not.toHaveBeenCalled();
  }
  return {
    service,
    root,
    tx,
    dependencies,
    decision,
    checkpoint,
    baseline,
    assertEntry,
    assertNoWrites,
    getPrior() {
      return latest;
    },
    setPrior(row: NonNullable<typeof latest>) {
      latest = row;
    },
  };
}
describe('exclusive same-client reward commitment', () => {
  it('computes real valid neutral reward and links both exact sources before incrementing evidence once', async () => {
    const f = fixture(),
      measurement = { exposure: 1000, weightedActions: 100 },
      result = computeLearningReward(
        measurement,
        Array.from({ length: 20 }, () => measurement),
        'engagement',
      );
    const reward = await f.service.commit(
      'org',
      'decision',
      'checkpoint',
      'engagement',
    );
    expect(reward).toMatchObject({
      version: 1,
      status: 'valid',
      composite: 0,
      reasons: [],
      rawComponents: { rawQuality: 0.1, exposureRatio: 1 },
      boundedComponents: { quality: 0, distribution: 0 },
      confidence: {
        baselineCount: 20,
        exposure: 1000,
        observationAgeDelta: 1000,
        objective: 'engagement',
      },
      sourceFingerprint: learningHash([
        'decision',
        'checkpoint',
        2,
        'baseline-fingerprint',
        result,
        'valid',
      ]),
    });
    expect(f.tx.contentLearningDecision.findFirst).toHaveBeenCalledWith({
      where: { id: 'decision', organizationId: 'org', isDeleted: false },
    });
    expect(f.tx.contentLearningCheckpoint.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'checkpoint',
        organizationId: 'org',
        credentialId: 'credential',
        isDeleted: false,
      },
    });
    expect(f.tx.contentLearningBaseline.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'baseline',
        organizationId: 'org',
        credentialId: 'credential',
        isDeleted: false,
      },
    });
    expect(f.dependencies.valid).toHaveBeenCalledWith(
      'baseline',
      'baseline',
      f.tx,
      'org',
    );
    expect(
      f.dependencies.resolve.mock.calls.map(([kind, id, org, tx]) => [
        kind,
        id,
        org,
        tx,
      ]),
    ).toEqual([
      ['checkpoint', 'checkpoint', 'org', f.tx],
      ['reward', 'reward-1', 'org', f.tx],
      ['baseline', 'baseline', 'org', f.tx],
      ['reward', 'reward-1', 'org', f.tx],
    ]);
    expect(f.dependencies.link).toHaveBeenCalledTimes(2);
    expect(f.dependencies.link.mock.calls.every(([tx]) => tx === f.tx)).toBe(
      true,
    );
    expect(f.tx.contentLearningAccount.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        credentialId: 'credential',
        isDeleted: false,
      },
      data: { evidenceRevision: { increment: 1 } },
    });
    expect(f.tx.contentLearningAccount.updateMany).toHaveBeenCalledTimes(1);
    f.assertEntry();
  });
  it('reuses stateful exact fingerprint retry without invalidation/links/counter', async () => {
    const f = fixture(),
      first = await f.service.commit(
        'org',
        'decision',
        'checkpoint',
        'engagement',
      );
    f.tx.contentLearningReward.create.mockClear();
    f.dependencies.resolve.mockClear();
    f.dependencies.link.mockClear();
    f.tx.contentLearningAccount.updateMany.mockClear();
    const prior = f.getPrior();
    expect(prior).toMatchObject({
      id: first?.id,
      sourceFingerprint: first?.sourceFingerprint,
    });
    expect(
      await f.service.commit('org', 'decision', 'checkpoint', 'engagement'),
    ).toBe(prior);
    f.assertNoWrites();
    expect(f.root.$transaction).toHaveBeenCalledTimes(2);
    expect(f.tx.$queryRaw).toHaveBeenCalledTimes(2);
  });
  it('versions a changed fingerprint, invalidates the proven tenant and reuses the subsequent stored version', async () => {
    const f = fixture();
    f.setPrior({
      id: 'prior',
      version: 4,
      sourceFingerprint: 'old-fingerprint',
    });
    const reward = await f.service.commit(
      'org',
      'decision',
      'checkpoint',
      'engagement',
    );
    expect(reward).toMatchObject({ version: 5, supersedesId: 'prior' });
    expect(f.dependencies.invalidate).toHaveBeenCalledWith(
      'reward',
      'prior',
      f.tx,
      'org',
    );
    expect(f.dependencies.invalidate).toHaveBeenCalledTimes(1);
    expect(
      f.tx.contentLearningReward.create.mock.invocationCallOrder[0],
    ).toBeLessThan(f.dependencies.invalidate.mock.invocationCallOrder[0]);
    f.assertEntry();
    const stored = f.getPrior();
    expect(
      await f.service.commit('org', 'decision', 'checkpoint', 'engagement'),
    ).toBe(stored);
    expect(f.tx.contentLearningReward.create).toHaveBeenCalledTimes(1);
    expect(f.dependencies.invalidate).toHaveBeenCalledTimes(1);
    expect(f.dependencies.link).toHaveBeenCalledTimes(2);
    expect(f.tx.contentLearningAccount.updateMany).toHaveBeenCalledTimes(1);
  });
  it.each([
    'decision',
    'baseline-id',
    'unpublished',
    'checkpoint',
    'baseline',
    'measurement',
  ])(
    'returns null after exclusive entry for missing/malformed %s',
    async (kind) => {
      const f = fixture();
      if (kind === 'decision')
        f.tx.contentLearningDecision.findFirst.mockResolvedValue(null);
      if (kind === 'baseline-id') f.decision.baselineId = null;
      if (kind === 'unpublished') f.decision.state = 'generated';
      if (kind === 'checkpoint')
        f.tx.contentLearningCheckpoint.findFirst.mockResolvedValue(null);
      if (kind === 'baseline')
        f.tx.contentLearningBaseline.findFirst.mockResolvedValue(null);
      if (kind === 'measurement')
        f.checkpoint.measurement = { measurement: null };
      expect(
        await f.service.commit('org', 'decision', 'checkpoint', 'engagement'),
      ).toBeNull();
      if (['decision', 'baseline-id', 'unpublished'].includes(kind))
        expect(f.tx.contentLearningCheckpoint.findFirst).not.toHaveBeenCalled();
      f.assertNoWrites();
      f.assertEntry();
    },
  );
  it.each([
    'nineteen',
    'exposure99',
    'checkpoint-invalid',
    'baseline-invalid',
    'invalid-sample',
    'null-samples',
  ])(
    'preserves real numerical/parser status for %s and records invalid evidence once',
    async (kind) => {
      const f = fixture();
      if (kind === 'nineteen') {
        f.baseline.samples = Array.from({ length: 19 }, () => ({
          exposure: 1000,
          weightedActions: 100,
        }));
        f.baseline.count = 19;
      }
      if (kind === 'exposure99')
        f.checkpoint.measurement = {
          measurement: { exposure: 99, weightedActions: 100 },
        };
      if (kind === 'checkpoint-invalid')
        f.checkpoint.validity = 'invalid_source';
      if (kind === 'baseline-invalid')
        f.dependencies.valid.mockResolvedValue(false);
      if (kind === 'invalid-sample')
        f.baseline.samples = [
          ...Array.from({ length: 19 }, () => ({
            exposure: 1000,
            weightedActions: 100,
          })),
          { exposure: -1, weightedActions: 100 },
        ];
      if (kind === 'null-samples') f.baseline.samples = null;
      const status =
        kind === 'exposure99'
          ? 'low_exposure'
          : kind === 'checkpoint-invalid'
            ? 'invalid_source'
            : kind === 'baseline-invalid'
              ? 'invalid_baseline'
              : 'insufficient_baseline';
      expect(
        await f.service.commit('org', 'decision', 'checkpoint', 'engagement'),
      ).toMatchObject({
        status,
        composite: null,
        reasons: [status],
        confidence: {
          baselineCount: f.baseline.count,
          exposure: kind === 'exposure99' ? 99 : 1000,
        },
      });
      if (kind === 'checkpoint-invalid')
        expect(f.dependencies.valid).not.toHaveBeenCalled();
      expect(f.tx.contentLearningAccount.updateMany).toHaveBeenCalledTimes(1);
      f.assertEntry();
    },
  );
  it.each(['fence', 'invalidation', 'link'])(
    'propagates %s failure without subsequent account increment',
    async (kind) => {
      const f = fixture(),
        failure = new Error('reward failure');
      if (kind === 'fence') f.tx.$queryRaw.mockRejectedValue(failure);
      if (kind === 'invalidation') {
        f.setPrior({ id: 'prior', version: 1, sourceFingerprint: 'old' });
        f.dependencies.invalidate.mockRejectedValue(failure);
      }
      if (kind === 'link') f.dependencies.link.mockRejectedValue(failure);
      await expect(
        f.service.commit('org', 'decision', 'checkpoint', 'engagement'),
      ).rejects.toBe(failure);
      expect(f.tx.contentLearningAccount.updateMany).not.toHaveBeenCalled();
      if (kind === 'fence') {
        expect(f.tx.contentLearningDecision.findFirst).not.toHaveBeenCalled();
        f.assertNoWrites();
      }
      f.assertEntry();
    },
  );
});
