import { learningArtifactHashV1 } from '@api/collections/content-learning/services/learning-artifact-binding.helper';
import type { LearningDependencyService } from '@api/collections/content-learning/services/learning-dependency.service';
import {
  learningHash,
  learningScopeKey,
} from '@api/collections/content-learning/services/learning-operation.service';
import { validLearningCheckpointPublicationV1 } from '@api/collections/content-learning/services/learning-publication-source.helper';
import { LearningRewardService } from '@api/collections/content-learning/services/learning-reward.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LearningDependencyKindV1 } from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import {
  computeLearningReward,
  learningDescriptorTuple,
  learningRegisteredProfiles,
} from '@genfeedai/harness';
import type { ContentLearningReward, Prisma } from '@genfeedai/prisma';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class {},
}));
vi.mock(
  '@api/collections/content-learning/services/learning-publication-source.helper',
  () => ({ validLearningCheckpointPublicationV1: vi.fn() }),
);
const validPublication = vi.mocked(validLearningCheckpointPublicationV1);

const sample = { exposure: 1000, weightedActions: 100 };
function fixture() {
  const [primary, secondary] = learningRegisteredProfiles(
    'twitter',
    'text',
    'awareness',
  );
  const descriptor = primary.descriptor,
    descriptorHash = learningHash(learningDescriptorTuple(descriptor)),
    otherHash = learningHash(
      learningDescriptorTuple(secondary?.descriptor ?? descriptor),
    );
  const scopeKey = learningScopeKey({
    organizationId: 'org',
    brandId: 'brand',
    credentialId: 'credential',
    platform: descriptor.platform,
    format: descriptor.format,
    objective: descriptor.objective,
    rewardProfileId: descriptorHash,
  });
  const decidedAt = new Date('2026-09-28T10:00:00Z');
  const publishedAt = new Date('2026-09-29T10:00:00Z');
  const post = {
    id: 'post',
    organizationId: 'org',
    brandId: 'brand',
    credentialId: 'credential',
    description: 'Approved text',
    format: 'standard',
    parentId: null,
    learningDecisionId: 'decision' as string | null,
    publishedAt: publishedAt as Date | null,
    ingredients: [] as Array<{ id: string; version: number }>,
  };
  const decision = {
    id: 'decision',
    organizationId: 'org',
    brandId: 'brand',
    credentialId: 'credential',
    baselineId: 'baseline' as string | null,
    state: 'published',
    generationId: 'post',
    synthetic: false,
    epoch: 1,
    scopeKey,
    cellDescriptor: descriptor as unknown,
    descriptorHash: descriptorHash as string | null,
    finalArtifactHash: learningArtifactHashV1({
      text: 'Approved text',
      ingredients: [],
      credentialId: 'credential',
      format: descriptor.format,
      objective: descriptor.objective,
    }) as string | null,
    createdAt: decidedAt,
  };
  const checkpoint = {
    id: 'checkpoint',
    organizationId: 'org',
    brandId: 'brand',
    credentialId: 'credential',
    postId: 'post',
    windowId: '48h-v1',
    format: 'text',
    publishedAt,
    revision: 2,
    validity: 'valid',
    measurement: {
      measurement: { exposure: 50, weightedActions: 1 },
      profiles: [
        {
          profileId: otherHash,
          descriptor: secondary?.descriptor,
          measurement: { exposure: 70, weightedActions: 2 },
        },
        { profileId: descriptorHash, descriptor, measurement: sample },
      ],
    } as unknown,
    dueAt: new Date('2026-10-01'),
    receivedAt: new Date('2026-10-01T00:00:01Z'),
    organicProvenance: { isPaid: false, isPinned: false },
  };
  const baseline = {
    id: 'baseline',
    organizationId: 'org',
    brandId: 'brand',
    credentialId: 'credential',
    descriptorHash: descriptorHash as string | null,
    scopeKey,
    configVersion: descriptor.configVersion as string,
    cutoff: decidedAt,
    validity: 'valid',
    count: 20,
    fingerprint: 'baseline-fingerprint',
    samples: Array.from({ length: 20 }, () => sample) as unknown,
    contributorCheckpointIds: Array.from({ length: 20 }, (_, i) => `c${i}`),
  };
  const account = { epoch: 1, mode: 'shadow' };
  let latest: Pick<
    ContentLearningReward,
    'id' | 'version' | 'sourceFingerprint' | 'status'
  > | null = null;
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    contentLearningCheckpoint: {
      findFirst: vi.fn().mockImplementation(() => checkpoint),
    },
    post: { findFirst: vi.fn().mockImplementation(() => post) },
    contentLearningDecision: {
      findFirst: vi.fn().mockImplementation(() => decision),
    },
    contentLearningAccount: {
      findFirst: vi.fn().mockImplementation(() => account),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    contentLearningBaseline: {
      findFirst: vi.fn().mockImplementation(() => baseline),
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
              status: data.status,
            };
            return { ...data, ...latest };
          },
        ),
    },
  };
  const root = {
    $transaction: vi
      .fn()
      .mockImplementation((apply: (client: typeof tx) => Promise<unknown>) =>
        apply(tx),
      ),
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
        ) => ({ kind, id, organizationId, version: '1' }),
      ),
  };
  const service = new LearningRewardService(
    root as unknown as PrismaService,
    dependencies as unknown as LearningDependencyService,
  );
  function assertNoWrites() {
    for (const mock of [
      tx.contentLearningReward.create,
      dependencies.invalidate,
      dependencies.link,
      tx.contentLearningAccount.updateMany,
    ])
      expect(mock).not.toHaveBeenCalled();
  }
  function assertExclusiveEntry() {
    const sql = tx.$queryRaw.mock.calls[0][0].join('');
    expect(sql).toContain('pg_advisory_xact_lock(5728, 1)');
    expect(sql).not.toContain('lock_shared');
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.contentLearningCheckpoint.findFirst.mock.invocationCallOrder[0] ??
        Number.POSITIVE_INFINITY,
    );
  }
  return {
    service,
    root,
    tx,
    dependencies,
    post,
    decision,
    checkpoint,
    baseline,
    account,
    descriptorHash,
    assertNoWrites,
    assertExclusiveEntry,
    getPrior: () => latest,
    setPrior(row: NonNullable<typeof latest>) {
      latest = row;
    },
  };
}
describe('exact checkpoint reward join', () => {
  beforeEach(() => {
    validPublication.mockReset();
    validPublication.mockResolvedValue(true);
  });
  it('commits the descriptor-profile reward against the frozen baseline and links decision, checkpoint and baseline', async () => {
    const f = fixture();
    const result = computeLearningReward(
      sample,
      Array.from({ length: 20 }, () => sample),
      'awareness',
    );
    expect(await f.service.commitForCheckpoint('org', 'checkpoint')).toEqual({
      status: 'committed',
      rewardId: 'reward-1',
      rewardStatus: result.status,
      decisionId: 'decision',
      scopeKey: f.decision.scopeKey,
    });
    const [{ data }] = f.tx.contentLearningReward.create.mock.calls[0];
    expect(data).toMatchObject({
      decisionId: 'decision',
      checkpointId: 'checkpoint',
      baselineId: 'baseline',
      version: 1,
      confidence: expect.objectContaining({
        baselineCount: 20,
        exposure: 1000,
        objective: 'awareness',
      }),
      sourceFingerprint: learningHash([
        'decision',
        'checkpoint',
        2,
        'baseline-fingerprint',
        result,
        result.status,
      ]),
    });
    expect(
      f.dependencies.link.mock.calls.map(([, source]) => source.kind),
    ).toEqual(['checkpoint', 'baseline', 'decision']);
    expect(f.tx.contentLearningAccount.updateMany).toHaveBeenCalledTimes(1);
    expect(f.tx.post.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'post',
          organizationId: 'org',
          brandId: 'brand',
          credentialId: 'credential',
          isDeleted: false,
        },
      }),
    );
    expect(f.tx.contentLearningDecision.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'decision',
        organizationId: 'org',
        brandId: 'brand',
        credentialId: 'credential',
        isDeleted: false,
        synthetic: false,
      },
    });
    f.assertExclusiveEntry();
  });
  it('selects the profile by descriptor hash, never the legacy or another profile', async () => {
    const f = fixture();
    await f.service.commitForCheckpoint('org', 'checkpoint');
    const [{ data }] = f.tx.contentLearningReward.create.mock.calls[0];
    expect(data.confidence).toMatchObject({ exposure: 1000 });
    f.checkpoint.measurement = {
      measurement: sample,
      profiles: [{ profileId: 'other', descriptor: null, measurement: sample }],
    };
    expect(await f.service.commitForCheckpoint('org', 'checkpoint')).toEqual({
      status: 'unavailable',
      reason: 'profile_unavailable',
    });
  });
  it.each([
    ['checkpoint missing', 'checkpoint_unavailable'],
    ['checkpoint invalid', 'checkpoint_unavailable'],
    ['checkpoint not text', 'checkpoint_unavailable'],
    ['publication invalid', 'checkpoint_unavailable'],
    ['post unbound', 'decision_unbound'],
    ['published time changed', 'decision_unbound'],
    ['decision unpublished', 'invalid_lineage'],
    ['synthetic decision', 'invalid_lineage'],
    ['other generation', 'invalid_lineage'],
    ['descriptor hash mismatch', 'invalid_lineage'],
    ['scope key mismatch', 'invalid_lineage'],
    ['decision dependency invalid', 'invalid_lineage'],
    ['account missing', 'account_unavailable'],
    ['epoch changed', 'epoch_changed'],
    ['account disabled', 'disabled'],
    ['artifact changed', 'artifact_changed'],
    ['baseline missing', 'insufficient_baseline'],
    ['baseline not frozen at decision', 'insufficient_baseline'],
    ['baseline under 20', 'insufficient_baseline'],
    ['baseline config changed', 'insufficient_baseline'],
    ['malformed sample', 'invalid_baseline'],
    ['contributor count mismatch', 'invalid_baseline'],
  ])('returns unavailable for %s without writing', async (kind, reason) => {
    const f = fixture();
    if (kind === 'checkpoint missing')
      f.tx.contentLearningCheckpoint.findFirst.mockResolvedValue(null);
    if (kind === 'checkpoint invalid') f.checkpoint.validity = 'invalid_source';
    if (kind === 'checkpoint not text') f.checkpoint.format = 'video';
    if (kind === 'publication invalid')
      validPublication.mockResolvedValue(false);
    if (kind === 'post unbound') f.post.learningDecisionId = null;
    if (kind === 'published time changed')
      f.post.publishedAt = new Date('2026-09-30T00:00:00Z');
    if (kind === 'decision unpublished') f.decision.state = 'generated';
    if (kind === 'synthetic decision')
      f.tx.contentLearningDecision.findFirst.mockResolvedValue(null);
    if (kind === 'other generation') f.decision.generationId = 'other';
    if (kind === 'descriptor hash mismatch') f.decision.descriptorHash = 'x';
    if (kind === 'scope key mismatch') f.decision.scopeKey = 'other';
    if (kind === 'decision dependency invalid')
      f.dependencies.valid.mockImplementation(
        (dependencyKind: string) => dependencyKind !== 'decision',
      );
    if (kind === 'account missing')
      f.tx.contentLearningAccount.findFirst.mockResolvedValue(null);
    if (kind === 'epoch changed') f.account.epoch = 2;
    if (kind === 'account disabled') f.account.mode = 'disabled';
    if (kind === 'artifact changed') f.post.description = 'Edited';
    if (kind === 'baseline missing')
      f.tx.contentLearningBaseline.findFirst.mockResolvedValue(null);
    if (kind === 'baseline not frozen at decision')
      f.baseline.cutoff = new Date('2026-09-28T11:00:00Z');
    if (kind === 'baseline under 20') f.baseline.count = 19;
    if (kind === 'baseline config changed') f.baseline.configVersion = 'other';
    if (kind === 'malformed sample')
      f.baseline.samples = [
        ...Array.from({ length: 19 }, () => sample),
        { exposure: -1, weightedActions: 1 },
      ];
    if (kind === 'contributor count mismatch')
      f.baseline.contributorCheckpointIds = ['c0'];
    expect(await f.service.commitForCheckpoint('org', 'checkpoint')).toEqual({
      status: 'unavailable',
      reason,
    });
    f.assertNoWrites();
    f.assertExclusiveEntry();
  });
  it('records an invalid-baseline reward when the frozen baseline lineage is invalid', async () => {
    const f = fixture();
    f.dependencies.valid.mockImplementation(
      (dependencyKind: string) => dependencyKind !== 'baseline',
    );
    expect(await f.service.commitForCheckpoint('org', 'checkpoint')).toEqual(
      expect.objectContaining({
        status: 'committed',
        rewardStatus: 'invalid_baseline',
      }),
    );
    expect(f.tx.contentLearningReward.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'invalid_baseline',
        composite: null,
        reasons: ['invalid_baseline'],
      }),
    });
  });
  it('preserves low-exposure status from the reward computation', async () => {
    const f = fixture();
    f.checkpoint.measurement = {
      profiles: [
        {
          profileId: f.descriptorHash,
          descriptor: f.decision.cellDescriptor,
          measurement: { exposure: 99, weightedActions: 1 },
        },
      ],
    };
    expect(await f.service.commitForCheckpoint('org', 'checkpoint')).toEqual(
      expect.objectContaining({ rewardStatus: 'low_exposure' }),
    );
  });
  it('reuses an exact fingerprint retry without writes or counter increments', async () => {
    const f = fixture();
    await f.service.commitForCheckpoint('org', 'checkpoint');
    f.tx.contentLearningReward.create.mockClear();
    f.dependencies.link.mockClear();
    f.tx.contentLearningAccount.updateMany.mockClear();
    expect(await f.service.commitForCheckpoint('org', 'checkpoint')).toEqual(
      expect.objectContaining({ status: 'committed', rewardId: 'reward-1' }),
    );
    f.assertNoWrites();
  });
  it('versions a changed fingerprint and invalidates the prior reward after creating', async () => {
    const f = fixture();
    f.setPrior({
      id: 'prior',
      version: 4,
      sourceFingerprint: 'old',
      status: 'valid',
    });
    expect(await f.service.commitForCheckpoint('org', 'checkpoint')).toEqual(
      expect.objectContaining({ rewardId: 'reward-5' }),
    );
    expect(f.tx.contentLearningReward.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ version: 5, supersedesId: 'prior' }),
    });
    expect(f.dependencies.invalidate).toHaveBeenCalledWith(
      'reward',
      'prior',
      f.tx,
      'org',
    );
    expect(
      f.tx.contentLearningReward.create.mock.invocationCallOrder[0],
    ).toBeLessThan(f.dependencies.invalidate.mock.invocationCallOrder[0]);
  });
  it.each(['fence', 'link'])(
    'propagates %s failure without an account increment',
    async (kind) => {
      const f = fixture(),
        failure = new Error('reward failure');
      if (kind === 'fence') f.tx.$queryRaw.mockRejectedValue(failure);
      if (kind === 'link') f.dependencies.link.mockRejectedValue(failure);
      await expect(
        f.service.commitForCheckpoint('org', 'checkpoint'),
      ).rejects.toBe(failure);
      expect(f.tx.contentLearningAccount.updateMany).not.toHaveBeenCalled();
      if (kind === 'fence')
        expect(f.tx.contentLearningCheckpoint.findFirst).not.toHaveBeenCalled();
    },
  );
});
