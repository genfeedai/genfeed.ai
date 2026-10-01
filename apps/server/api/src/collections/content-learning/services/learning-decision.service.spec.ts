import type { LearningAccountService } from '@api/collections/content-learning/services/learning-account.service';
import type { LearningCheckpointService } from '@api/collections/content-learning/services/learning-checkpoint.service';
import { LearningDecisionService } from '@api/collections/content-learning/services/learning-decision.service';
import type { LearningDependencyService } from '@api/collections/content-learning/services/learning-dependency.service';
import type { LearningPolicyService } from '@api/collections/content-learning/services/learning-policy.service';
import type { LearningScopeStateService } from '@api/collections/content-learning/services/learning-scope-state.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class {},
}));
describe('honest read-only preview', () => {
  it('returns empty contribution while assignment is unavailable', async () => {
    const accounts = {
      credential: vi.fn().mockResolvedValue({ id: 'credential' }),
      read: vi.fn().mockResolvedValue({ mode: 'live', revision: 0, epoch: 0 }),
    };
    const service = new LearningDecisionService(
      {} as PrismaService,
      accounts as unknown as LearningAccountService,
      {} as LearningCheckpointService,
      {} as LearningPolicyService,
      {} as LearningScopeStateService,
      {} as LearningDependencyService,
    );
    const result = await service.previewForContext({
      organizationId: 'org',
      brandId: 'brand',
      format: 'text',
      context: {
        credentialId: 'credential',
        requestKey: 'request',
        candidateIndex: 0,
      },
      harnessEnabled: true,
      compatible: true,
      originalPrompt: 'test',
    });
    expect(result.contribution).toEqual({});
    expect(result.receipt.reason).toBe('experiment_assignment_unavailable');
  });
});

import {
  learningHash,
  learningScopeKey,
} from '@api/collections/content-learning/services/learning-operation.service';
import {
  learningDescriptorTuple,
  learningRegisteredProfiles,
} from '@genfeedai/harness';
import type { ContentLearningDecision } from '@genfeedai/prisma';

function decisionFixture(count = 20) {
  const descriptor = learningRegisteredProfiles(
      'twitter',
      'text',
      'awareness',
    )[0].descriptor,
    descriptorHash = learningHash(learningDescriptorTuple(descriptor));
  const input = {
    organizationId: 'org',
    brandId: 'brand',
    format: 'text' as const,
    context: {
      credentialId: 'credential',
      requestKey: 'request',
      candidateIndex: 0,
    },
    harnessEnabled: true,
    compatible: true,
    originalPrompt: 'test',
  };
  const account = {
    id: 'account',
    organizationId: 'org',
    brandId: 'brand',
    credentialId: 'credential',
    mode: 'live',
    revision: 3,
    epoch: 1,
    failureReason: null,
    activeConfigVersion: descriptor.configVersion,
    approvedArmIds: ['question-example-v1'],
  };
  const scopeInput = {
      organizationId: 'org',
      brandId: 'brand',
      credentialId: 'credential',
      platform: 'twitter',
      format: 'text' as const,
      objective: 'awareness' as const,
      rewardProfileId: descriptorHash,
    },
    scopeKey = learningScopeKey(scopeInput);
  const scope = {
    id: 'scope',
    organizationId: 'org',
    brandId: 'brand',
    credentialId: 'credential',
    scopeKey,
    epoch: 1,
    revision: 2,
    descriptorHash,
    cellDescriptor: descriptor,
    activePolicyId: 'policy',
    pinnedPolicyId: null,
    lastValidRewardAt: new Date(),
  };
  const baseline = {
    id: 'baseline',
    organizationId: 'org',
    brandId: 'brand',
    credentialId: 'credential',
    scopeKey,
    descriptorHash,
    cellDescriptor: descriptor,
    configVersion: descriptor.configVersion,
    count,
    medianExposure: 1000,
    validity: count >= 20 ? 'valid' : 'insufficient_baseline',
    cutoff: new Date(),
    samples: [] as Array<{ exposure: number; weightedActions: number }>,
    contributorCheckpointIds: [] as string[],
    contributorRevisions: [] as number[],
    fingerprint: '',
  };
  baseline.fingerprint = learningHash([
    scopeKey,
    descriptorHash,
    baseline.cutoff.toISOString(),
    [],
  ]);
  let recorded: ContentLearningDecision | null = null;
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn(),
    contentLearningAccount: { findFirst: vi.fn().mockResolvedValue(account) },
    credential: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'credential',
        brandId: 'brand',
        platform: 'TWITTER',
      }),
    },
    brand: { findFirst: vi.fn().mockResolvedValue({ id: 'brand' }) },
    accountAnalyticsSnapshot: { findFirst: vi.fn().mockResolvedValue(null) },
    contentLearningDecision: {
      findFirst: vi.fn().mockImplementation(() => recorded),
      create: vi.fn().mockImplementation(({ data }) => {
        recorded = {
          id: 'decision',
          synthetic: false,
          isDeleted: false,
          accountPolicyId: null,
          sharedReleaseId: null,
          opportunityId: null,
          ...data,
        } as ContentLearningDecision;
        return recorded;
      }),
    },
    contentLearningBaseline: { findFirst: vi.fn().mockResolvedValue(baseline) },
    contentLearningCheckpoint: { findFirst: vi.fn() },
    contentLearningOpportunity: { findFirst: vi.fn() },
    contentLearningEnrollment: { findFirst: vi.fn() },
    contentLearningExperiment: { findFirst: vi.fn() },
    contentLearningDependency: { findMany: vi.fn() },
  };
  tx.$transaction.mockImplementation((fn) => fn(tx));
  const accounts = {
    credential: vi.fn().mockResolvedValue({
      id: 'credential',
      brandId: 'brand',
      platform: 'TWITTER',
    }),
    ensure: vi.fn().mockResolvedValue(account),
  };
  const checkpoints = { freeze: vi.fn().mockResolvedValue(baseline) },
    policies = {
      current: vi
        .fn()
        .mockResolvedValue({ id: 'policy', evidenceManifestHash: 'manifest' }),
    },
    scopes = {
      ensure: vi.fn().mockResolvedValue(scope),
      read: vi.fn().mockResolvedValue(scope),
    };
  const dependencies = {
    valid: vi.fn().mockResolvedValue(true),
    resolve: vi.fn().mockImplementation((kind, id) => ({
      kind,
      id,
      organizationId: kind === 'config' ? null : 'org',
      version:
        kind === 'account'
          ? '1'
          : kind === 'baseline'
            ? baseline.fingerprint
            : id,
    })),
    link: vi.fn(),
  };
  tx.contentLearningDependency.findMany.mockImplementation(({ where }) =>
    where.derivedKind === 'baseline'
      ? []
      : [
          { sourceKind: 'account', sourceId: 'account', sourceVersion: '1' },
          {
            sourceKind: 'credential',
            sourceId: 'credential',
            sourceVersion: 'credential',
          },
          { sourceKind: 'brand', sourceId: 'brand', sourceVersion: 'brand' },
          {
            sourceKind: 'baseline',
            sourceId: 'baseline',
            sourceVersion: baseline.fingerprint,
          },
        ].map((edge) => ({
          ...edge,
          valid: true,
          sourceOrganizationId: 'org',
        })),
  );
  const service = new LearningDecisionService(
    tx as unknown as PrismaService,
    accounts as unknown as LearningAccountService,
    checkpoints as unknown as LearningCheckpointService,
    policies as unknown as LearningPolicyService,
    scopes as unknown as LearningScopeStateService,
    dependencies as unknown as LearningDependencyService,
  );
  return {
    input,
    account,
    scope,
    scopeKey,
    baseline,
    descriptor,
    descriptorHash,
    tx,
    accounts,
    checkpoints,
    policies,
    scopes,
    dependencies,
    service,
    get recorded() {
      return recorded;
    },
  };
}
describe('baseline-only generation and immutable retry', () => {
  it('persists descriptor and durable control/treatment/marginal vectors after shared fence with no policy application', async () => {
    const f = decisionFixture();
    const result = await f.service.resolveForGeneration(f.input);
    expect(result.contribution).toEqual({});
    expect(result.receipt).toMatchObject({
      armId: 'baseline-v1',
      assignment: 'control',
      assignmentProbability: 1,
      executionProbability: 1,
      selectedProbability: 1,
      descriptorHash: f.descriptorHash,
      cellDescriptor: f.descriptor,
      scopeRevision: 2,
      reason: 'experiment_assignment_unavailable',
    });
    expect(result.receipt.policyVersionId).toBeUndefined();
    expect(f.policies.current).not.toHaveBeenCalled();
    expect(result.receipt.treatmentProbabilities).toEqual({
      'baseline-v1': 1,
      'question-example-v1': 0,
      'proof-steps-v1': 0,
    });
    expect(result.receipt.controlProbabilities).toEqual(
      result.receipt.executionProbabilities,
    );
    expect(f.checkpoints.freeze).toHaveBeenCalledWith(
      expect.objectContaining({ rewardProfileId: f.descriptorHash }),
      expect.any(Date),
      f.descriptor,
      f.tx,
    );
    expect(f.scopes.ensure).toHaveBeenCalledWith(
      f.tx,
      expect.any(Object),
      f.descriptor,
      1,
    );
    expect(f.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      f.accounts.credential.mock.invocationCallOrder[0],
    );
    expect(f.dependencies.link).toHaveBeenCalledTimes(5);
  });
  it('retries without freeze, writes or RNG and retains recorded probability identity', async () => {
    const f = decisionFixture();
    const original = await f.service.resolveForGeneration(f.input);
    f.checkpoints.freeze.mockClear();
    f.tx.contentLearningDecision.create.mockClear();
    const retry = await f.service.resolveForGeneration(f.input);
    expect(retry.receipt).toEqual(original.receipt);
    expect(retry.contribution).toEqual({});
    expect(f.checkpoints.freeze).not.toHaveBeenCalled();
    expect(f.tx.contentLearningDecision.create).not.toHaveBeenCalled();
  });
  it.each(['credential', 'brand', 'account'])(
    'preserves retry after current %s deletion without authorization recreation',
    async (source) => {
      const f = decisionFixture();
      const original = await f.service.resolveForGeneration(f.input);
      f.accounts.ensure.mockClear();
      f.accounts.credential.mockClear();
      f.tx.contentLearningDecision.create.mockClear();
      if (source === 'credential')
        f.tx.credential.findFirst.mockResolvedValue(null);
      if (source === 'brand') f.tx.brand.findFirst.mockResolvedValue(null);
      if (source === 'account')
        f.tx.contentLearningAccount.findFirst.mockResolvedValue(null);
      const result = await f.service.resolveForGeneration(f.input);
      expect(result.receipt).toMatchObject({
        decisionId: original.receipt.decisionId,
        armId: original.receipt.armId,
        selectedProbability: original.receipt.selectedProbability,
        reason: 'invalid_lineage',
      });
      expect(result.contribution).toEqual({});
      expect(f.accounts.ensure).not.toHaveBeenCalled();
      expect(f.accounts.credential).not.toHaveBeenCalled();
      expect(f.tx.contentLearningDecision.create).not.toHaveBeenCalled();
      await expect(
        f.service.resolveForGeneration({
          ...f.input,
          originalPrompt: 'changed',
        }),
      ).rejects.toThrow('payload conflict');
    },
  );
  it('returns unsupported cell without fake baseline or policy', async () => {
    const f = decisionFixture();
    f.accounts.credential.mockResolvedValue({
      id: 'credential',
      brandId: 'brand',
      platform: 'UNKNOWN',
    });
    const result = await f.service.resolveForGeneration(f.input);
    expect(result.receipt).toMatchObject({
      mode: 'unavailable',
      reason: 'unsupported_cell',
    });
    expect(f.checkpoints.freeze).not.toHaveBeenCalled();
    expect(f.tx.contentLearningDecision.create).not.toHaveBeenCalled();
  });
  it('checks changed payload even when disabled and exact retry preserves history', async () => {
    const f = decisionFixture();
    const original = await f.service.resolveForGeneration(f.input);
    f.account.mode = 'disabled';
    const retry = await f.service.resolveForGeneration(f.input);
    expect(retry.receipt).toMatchObject({
      decisionId: original.receipt.decisionId,
      armId: original.receipt.armId,
      reason: 'disabled',
    });
    await expect(
      f.service.resolveForGeneration({ ...f.input, originalPrompt: 'changed' }),
    ).rejects.toThrow('payload conflict');
  });
  it.each(['paused', 'shadow', 'epoch', 'control', 'scope', 'lineage'])(
    'suppresses current %s changes while preserving selected provenance',
    async (mutation) => {
      const f = decisionFixture();
      await f.service.resolveForGeneration(f.input);
      if (mutation === 'paused' || mutation === 'shadow')
        f.account.mode = mutation;
      if (mutation === 'epoch') f.account.epoch++;
      if (mutation === 'control') f.account.revision++;
      if (mutation === 'scope') f.scope.revision++;
      if (mutation === 'lineage') f.dependencies.valid.mockResolvedValue(false);
      const result = await f.service.resolveForGeneration(f.input);
      expect(result.contribution).toEqual({});
      expect(result.receipt.armId).toBe('baseline-v1');
      expect(result.receipt.reason).toBe(
        ['paused', 'shadow'].includes(mutation)
          ? mutation
          : ['epoch', 'control'].includes(mutation)
            ? 'account_changed'
            : mutation === 'scope'
              ? 'scope_changed'
              : 'invalid_source',
      );
    },
  );
  it('suppresses historical nonbaseline without actual enrollment and never invents distributions', async () => {
    const f = decisionFixture();
    await f.service.resolveForGeneration(f.input);
    const decision = f.recorded;
    expect(decision).not.toBeNull();
    if (!decision) throw new Error('missing');
    decision.selectedArmId = 'question-example-v1';
    decision.accountPolicyId = 'policy';
    decision.assignment = 'pilot';
    decision.assignmentProbability = 0.1;
    const result = await f.service.resolveForGeneration(f.input);
    expect(result.receipt.armId).toBe('question-example-v1');
    expect(result.receipt.policyVersionId).toBe('policy');
    expect(result.receipt.reason).toBe('experiment_assignment_unavailable');
    expect(result.contribution).toEqual({});
    decision.contextSnapshot = {};
    const legacy = await f.service.resolveForGeneration(f.input);
    expect(legacy.receipt.treatmentProbabilities).toBeUndefined();
    expect(legacy.contribution).toEqual({});
  });
});
describe('structurally proven insufficient baseline observation retry', () => {
  it('retains honest zero-sample receipt without relaxing learned-source validity', async () => {
    const f = decisionFixture(0);
    await f.service.resolveForGeneration(f.input);
    f.dependencies.valid.mockImplementation(
      (kind) => kind !== 'baseline' && kind !== 'decision',
    );
    const result = await f.service.resolveForGeneration(f.input);
    expect(result.receipt.reason).toBe('insufficient_baseline');
    expect(result.contribution).toEqual({});
    expect(f.dependencies.valid).not.toHaveBeenCalledWith(
      'baseline',
      'baseline',
      f.tx,
      'org',
    );
  });
  it('current account failure precedes insufficient baseline while preserving selection identity', async () => {
    const f = decisionFixture(0);
    const original = await f.service.resolveForGeneration(f.input);
    Object.assign(f.account, { failureReason: 'invalid_evidence' });
    const result = await f.service.resolveForGeneration(f.input);
    expect(result.receipt).toMatchObject({
      decisionId: original.receipt.decisionId,
      armId: original.receipt.armId,
      assignment: original.receipt.assignment,
      assignmentProbability: original.receipt.assignmentProbability,
      reason: 'invalid_evidence',
    });
    expect(result.contribution).toEqual({});
    f.account.mode = 'paused';
    expect((await f.service.resolveForGeneration(f.input)).receipt.reason).toBe(
      'paused',
    );
  });
  it.each(['count', 'samples', 'ids', 'fingerprint', 'edge', 'descriptor'])(
    'fails closed on malformed zero-sample %s',
    async (mutation) => {
      const f = decisionFixture(0);
      await f.service.resolveForGeneration(f.input);
      if (mutation === 'count') f.baseline.count = 1;
      if (mutation === 'samples')
        f.baseline.samples = [{ exposure: 100, weightedActions: 0 }];
      if (mutation === 'ids')
        f.baseline.contributorCheckpointIds = ['unexpected'];
      if (mutation === 'fingerprint') f.baseline.fingerprint = 'mismatch';
      if (mutation === 'descriptor') f.baseline.descriptorHash = 'other';
      if (mutation === 'edge')
        f.tx.contentLearningDependency.findMany.mockResolvedValue([]);
      const result = await f.service.resolveForGeneration(f.input);
      expect(result.receipt.reason).toMatch(/invalid_(lineage|source)/);
      expect(result.contribution).toEqual({});
    },
  );
  it('validates every current contributor and rejects correction/deletion', async () => {
    const f = decisionFixture(1);
    f.baseline.samples = [{ exposure: 1000, weightedActions: 0 }];
    f.baseline.contributorCheckpointIds = ['checkpoint'];
    f.baseline.contributorRevisions = [2];
    f.baseline.fingerprint = learningHash([
      f.scopeKey,
      f.descriptorHash,
      f.baseline.cutoff.toISOString(),
      [['checkpoint', 2]],
    ]);
    f.tx.contentLearningCheckpoint.findFirst.mockResolvedValue({
      id: 'checkpoint',
      postId: 'post',
      measurement: {
        profiles: [
          {
            profileId: f.descriptorHash,
            descriptor: f.descriptor,
            measurement: f.baseline.samples[0],
          },
        ],
      },
    });
    const previous =
      f.tx.contentLearningDependency.findMany.getMockImplementation();
    f.tx.contentLearningDependency.findMany.mockImplementation((arg) =>
      arg.where.derivedKind === 'baseline'
        ? [
            {
              sourceKind: 'checkpoint',
              sourceId: 'checkpoint',
              sourceVersion: '2',
              sourceOrganizationId: 'org',
              valid: true,
            },
          ]
        : previous?.(arg),
    );
    await f.service.resolveForGeneration(f.input);
    expect((await f.service.resolveForGeneration(f.input)).receipt.reason).toBe(
      'insufficient_baseline',
    );
    expect(f.dependencies.valid).toHaveBeenCalledWith(
      'checkpoint',
      'checkpoint',
      f.tx,
      'org',
    );
    f.tx.contentLearningCheckpoint.findFirst.mockResolvedValue(null);
    expect((await f.service.resolveForGeneration(f.input)).receipt.reason).toBe(
      'invalid_lineage',
    );
  });
});
