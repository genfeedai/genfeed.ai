import type { LearningAccountService } from '@api/collections/content-learning/services/learning-account.service';
import type { LearningCheckpointService } from '@api/collections/content-learning/services/learning-checkpoint.service';
import { LearningDecisionService } from '@api/collections/content-learning/services/learning-decision.service';
import type { LearningDependencyService } from '@api/collections/content-learning/services/learning-dependency.service';
import type { LearningPolicyService } from '@api/collections/content-learning/services/learning-policy.service';
import type { LearningScopeStateService } from '@api/collections/content-learning/services/learning-scope-state.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { ContentLearningDecision, Prisma } from '@genfeedai/prisma';
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
      {
        contentLearningAccount: {
          findFirst: vi
            .fn()
            .mockResolvedValue({ mode: 'live', revision: 0, epoch: 0 }),
        },
      } as unknown as PrismaService,
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
    expect(accounts.read).not.toHaveBeenCalled();
  });
});

describe('lightweight scoped preview isolation', () => {
  it.each(['shadow', 'paused', 'disabled', 'live', 'malformed', null])(
    'keeps %s preview empty and avoids enriched reads',
    async (mode) => {
      const accounts = {
        credential: vi.fn().mockResolvedValue({ id: 'credential' }),
        read: vi.fn(),
        ensure: vi.fn(),
      };
      const prisma = {
        contentLearningAccount: {
          findFirst: vi
            .fn()
            .mockResolvedValue(
              mode === null
                ? null
                : { mode, revision: 7, epoch: 2, failureReason: null },
            ),
        },
        $transaction: vi.fn(),
      };
      const checkpoints = { freeze: vi.fn() },
        policies = { current: vi.fn() },
        scopes = { read: vi.fn(), ensure: vi.fn() };
      const service = new LearningDecisionService(
        prisma as unknown as PrismaService,
        accounts as unknown as LearningAccountService,
        checkpoints as unknown as LearningCheckpointService,
        policies as unknown as LearningPolicyService,
        scopes as unknown as LearningScopeStateService,
        {} as LearningDependencyService,
      );
      const result = await service.previewForContext({
        organizationId: 'org',
        brandId: 'brand',
        format: 'text',
        context: {
          credentialId: 'credential',
          requestKey: 'preview',
          candidateIndex: 0,
        },
        harnessEnabled: true,
        compatible: true,
        originalPrompt: 'test',
      });
      expect(result.contribution).toEqual({});
      expect(result.receipt.reason).toBe(
        mode === 'live'
          ? 'experiment_assignment_unavailable'
          : mode === 'malformed'
            ? 'account_state_unavailable'
            : (mode ?? 'shadow'),
      );
      expect(prisma.contentLearningAccount.findFirst).toHaveBeenCalledWith({
        where: {
          organizationId: 'org',
          brandId: 'brand',
          credentialId: 'credential',
          isDeleted: false,
        },
      });
      expect(accounts.read).not.toHaveBeenCalled();
      expect(accounts.ensure).not.toHaveBeenCalled();
      expect(checkpoints.freeze).not.toHaveBeenCalled();
      expect(policies.current).not.toHaveBeenCalled();
      expect(scopes.read).not.toHaveBeenCalled();
      expect(scopes.ensure).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );
  it.each([
    { harnessEnabled: false, compatible: true, reason: 'harness_off' },
    { harnessEnabled: true, compatible: false, reason: 'incompatible_intent' },
    { harnessEnabled: true, compatible: true, reason: 'invalid_evidence' },
  ])(
    'preserves preview failure precedence $reason',
    async ({ harnessEnabled, compatible, reason }) => {
      const accounts = { credential: vi.fn(), read: vi.fn() },
        prisma = {
          contentLearningAccount: {
            findFirst: vi.fn().mockResolvedValue({
              mode: 'live',
              revision: 3,
              epoch: 1,
              failureReason: 'invalid_evidence',
            }),
          },
        };
      const service = new LearningDecisionService(
        prisma as unknown as PrismaService,
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
        harnessEnabled,
        compatible,
        originalPrompt: 'test',
      });
      expect(result.receipt.reason).toBe(reason);
      expect(result.contribution).toEqual({});
      expect(accounts.read).not.toHaveBeenCalled();
    },
  );
  it('keeps accountless preview unavailable without scoped source lookup', async () => {
    const accounts = { credential: vi.fn() },
      prisma = { contentLearningAccount: { findFirst: vi.fn() } };
    const service = new LearningDecisionService(
      prisma as unknown as PrismaService,
      accounts as unknown as LearningAccountService,
      {} as LearningCheckpointService,
      {} as LearningPolicyService,
      {} as LearningScopeStateService,
      {} as LearningDependencyService,
    );
    expect(
      await service.previewForContext({
        organizationId: 'org',
        brandId: 'brand',
        format: 'text',
        harnessEnabled: true,
        compatible: true,
        originalPrompt: 'test',
      }),
    ).toMatchObject({
      receipt: { mode: 'no_destination', reason: 'no_destination' },
      contribution: {},
    });
    expect(accounts.credential).not.toHaveBeenCalled();
    expect(prisma.contentLearningAccount.findFirst).not.toHaveBeenCalled();
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

function bindingFixture() {
  const payload: Parameters<LearningDecisionService['bindArtifact']>[2] = {
    text: 'First line\r\nSecond line',
    ingredients: [{ id: 'ingredient', version: '2' }],
    credentialId: 'credential',
    format: 'text',
    objective: 'awareness',
  };
  const hash = learningHash({ ...payload, text: 'First line\nSecond line' });
  const decision = {
    id: 'decision',
    organizationId: 'org',
    credentialId: 'credential',
    finalArtifactHash: null as string | null,
    state: 'selected',
    epoch: 2,
    accountRevision: 4,
    censorshipReason: null as string | null,
  };
  const post = {
    id: 'post',
    organizationId: 'org',
    credentialId: 'credential',
    learningDecisionId: null as string | null,
  };
  const account = { epoch: 2, revision: 4 };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    contentLearningDecision: {
      findFirst: vi
        .fn()
        .mockImplementation(
          ({
            where,
          }: {
            where: Prisma.ContentLearningDecisionWhereInput;
          }): typeof decision | null =>
            where.id === decision.id &&
            where.organizationId === decision.organizationId &&
            where.credentialId === decision.credentialId
              ? decision
              : null,
        ),
      updateMany: vi
        .fn()
        .mockImplementation(
          ({ where, data }: Prisma.ContentLearningDecisionUpdateManyArgs) => {
            if (
              where?.finalArtifactHash === null &&
              decision.finalArtifactHash !== null
            )
              return { count: 0 };
            Object.assign(decision, data);
            return { count: 1 };
          },
        ),
    },
    post: {
      findFirst: vi
        .fn()
        .mockImplementation(
          ({ where }: { where: Prisma.PostWhereInput }): typeof post | null =>
            where.id === post.id ? post : null,
        ),
      updateMany: vi
        .fn()
        .mockImplementation(({ data }: Prisma.PostUpdateManyArgs) => {
          Object.assign(post, data);
          return { count: 1 };
        }),
    },
    contentLearningAccount: {
      findFirst: vi
        .fn()
        .mockImplementation((): typeof account | null => account),
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
    valid: vi.fn(),
    resolve: vi.fn(),
    link: vi.fn(),
    invalidate: vi.fn(),
  };
  const service = new LearningDecisionService(
    root as unknown as PrismaService,
    {} as LearningAccountService,
    {} as LearningCheckpointService,
    {} as LearningPolicyService,
    {} as LearningScopeStateService,
    dependencies as unknown as LearningDependencyService,
  );
  const modelCalls = [
    tx.contentLearningDecision.findFirst,
    tx.contentLearningDecision.updateMany,
    tx.post.findFirst,
    tx.post.updateMany,
    tx.contentLearningAccount.findFirst,
  ];
  function assertSharedEntry() {
    expect(root.$transaction).toHaveBeenCalledTimes(1);
    const sql = tx.$queryRaw.mock.calls[0][0].join('');
    expect(sql).toContain('pg_advisory_xact_lock_shared(5728, 1)');
    expect(sql).not.toContain('pg_advisory_xact_lock(');
    for (const mock of modelCalls)
      if (mock.mock.invocationCallOrder.length)
        expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
          mock.mock.invocationCallOrder[0],
        );
    for (const mock of Object.values(dependencies))
      expect(mock).not.toHaveBeenCalled();
  }
  return {
    service,
    root,
    tx,
    dependencies,
    decision,
    post,
    account,
    payload,
    hash,
    modelCalls,
    assertSharedEntry,
  };
}
describe('shared-fenced immutable artifact and publication binding', () => {
  it('binds canonical artifact after shared entry and the exact decision lock on the supplied callback client', async () => {
    const f = bindingFixture();
    expect(await f.service.bindArtifact('org', 'decision', f.payload)).toBe(
      f.hash,
    );
    expect(f.tx.$queryRaw).toHaveBeenCalledTimes(2);
    const calls = f.tx.$queryRaw.mock.calls;
    expect(calls[1][0].join('')).toContain('FROM content_learning_decisions');
    expect(calls[1][0].join('')).toContain('ORDER BY id FOR UPDATE');
    expect(calls[1].slice(1)).toEqual(['decision', 'org']);
    expect(f.tx.$queryRaw.mock.invocationCallOrder[1]).toBeLessThan(
      f.tx.contentLearningDecision.findFirst.mock.invocationCallOrder[0],
    );
    expect(f.tx.contentLearningDecision.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'decision',
        organizationId: 'org',
        credentialId: 'credential',
        isDeleted: false,
      },
    });
    expect(f.tx.contentLearningDecision.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'decision',
        organizationId: 'org',
        isDeleted: false,
        finalArtifactHash: null,
      },
      data: { finalArtifactHash: f.hash, state: 'generated' },
    });
    expect(f.decision.state).toBe('generated');
    expect(f.tx.post.findFirst).not.toHaveBeenCalled();
    expect(f.tx.contentLearningAccount.findFirst).not.toHaveBeenCalled();
    f.assertSharedEntry();
  });
  it('binds valid publication after shared entry, decision and Post locks with unchanged scoped predicates', async () => {
    const f = bindingFixture();
    f.decision.finalArtifactHash = f.hash;
    expect(
      await f.service.bindPublication('org', 'decision', 'post', f.payload),
    ).toEqual({ valid: true });
    const sql = f.tx.$queryRaw.mock.calls.map(([parts]) => parts.join(''));
    expect(sql).toHaveLength(3);
    expect(sql[1]).toContain('FROM content_learning_decisions');
    expect(sql[2]).toContain('FROM posts');
    expect(sql.join('')).not.toContain('content_learning_accounts');
    expect(f.tx.$queryRaw.mock.calls[2].slice(1)).toEqual(['post', 'org']);
    expect(f.tx.$queryRaw.mock.invocationCallOrder[2]).toBeLessThan(
      f.tx.contentLearningDecision.findFirst.mock.invocationCallOrder[0],
    );
    expect(f.tx.contentLearningDecision.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'decision',
        organizationId: 'org',
        credentialId: 'credential',
        isDeleted: false,
      },
    });
    expect(f.tx.contentLearningAccount.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        credentialId: 'credential',
        isDeleted: false,
      },
    });
    expect(f.tx.post.findFirst).toHaveBeenNthCalledWith(1, {
      where: {
        id: 'post',
        organizationId: 'org',
        credentialId: 'credential',
        isDeleted: false,
      },
    });
    expect(f.tx.post.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        organizationId: 'org',
        learningDecisionId: 'decision',
        id: { not: 'post' },
        isDeleted: false,
      },
    });
    expect(f.tx.post.updateMany).toHaveBeenCalledWith({
      where: { id: 'post', organizationId: 'org', isDeleted: false },
      data: { learningDecisionId: 'decision' },
    });
    expect(f.tx.contentLearningDecision.updateMany).toHaveBeenCalledWith({
      where: { id: 'decision', organizationId: 'org', isDeleted: false },
      data: { state: 'published' },
    });
    f.assertSharedEntry();
  });
  it.each(['artifact', 'publication'])(
    'propagates %s fence failure before every row lock/read/write',
    async (kind) => {
      const f = bindingFixture(),
        failure = new Error('shared fence failed');
      f.tx.$queryRaw.mockRejectedValueOnce(failure);
      const result =
        kind === 'artifact'
          ? f.service.bindArtifact('org', 'decision', f.payload)
          : f.service.bindPublication('org', 'decision', 'post', f.payload);
      await expect(result).rejects.toBe(failure);
      expect(f.tx.$queryRaw).toHaveBeenCalledTimes(1);
      for (const mock of f.modelCalls) expect(mock).not.toHaveBeenCalled();
      f.assertSharedEntry();
    },
  );
  it.each([
    'missing-destination',
    'mismatched-destination',
    'different-artifact',
    'same-artifact',
  ])('preserves immutable artifact behavior for %s', async (kind) => {
    const f = bindingFixture();
    if (kind === 'missing-destination')
      f.tx.contentLearningDecision.findFirst.mockResolvedValue(null);
    else if (kind === 'mismatched-destination')
      f.payload.credentialId = 'foreign-credential';
    else
      f.decision.finalArtifactHash =
        kind === 'same-artifact' ? f.hash : 'saved-other-hash';
    const result = f.service.bindArtifact('org', 'decision', f.payload);
    if (kind === 'same-artifact') {
      expect(await result).toBe(f.hash);
      expect(f.tx.contentLearningDecision.updateMany).toHaveBeenCalledTimes(1);
      expect(
        f.tx.contentLearningDecision.updateMany.mock.results[0].value,
      ).toEqual({ count: 0 });
      expect(f.decision.state).toBe('selected');
    } else {
      await expect(result).rejects.toThrow(
        kind === 'missing-destination' || kind === 'mismatched-destination'
          ? 'Decision destination mismatch'
          : 'Decision already bound to another artifact',
      );
      expect(f.tx.contentLearningDecision.updateMany).not.toHaveBeenCalled();
    }
    f.assertSharedEntry();
  });
  it.each([
    'same-post',
    'duplicate-post',
    'other-decision',
    'changed-bound-hash',
  ])(
    'preserves publication replay/conflict precedence for %s',
    async (kind) => {
      const f = bindingFixture();
      f.decision.finalArtifactHash = f.hash;
      if (kind === 'duplicate-post')
        f.tx.post.findFirst
          .mockResolvedValueOnce(f.post)
          .mockResolvedValueOnce({ ...f.post, id: 'other-post' });
      else
        f.post.learningDecisionId =
          kind === 'other-decision' ? 'other-decision' : 'decision';
      if (kind === 'changed-bound-hash')
        f.decision.finalArtifactHash = 'changed-hash';
      const result = f.service.bindPublication(
        'org',
        'decision',
        'post',
        f.payload,
      );
      if (kind === 'same-post') {
        expect(await result).toEqual({ valid: true });
        expect(f.tx.post.updateMany).toHaveBeenCalledTimes(1);
        expect(f.tx.contentLearningDecision.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({ data: { state: 'published' } }),
        );
      } else {
        await expect(result).rejects.toThrow(
          kind === 'changed-bound-hash'
            ? 'Published artifact binding differs'
            : 'Publication already has immutable decision binding',
        );
        expect(f.tx.post.updateMany).not.toHaveBeenCalled();
        expect(f.tx.contentLearningDecision.updateMany).not.toHaveBeenCalled();
      }
      f.assertSharedEntry();
    },
  );
  it.each([
    'missing-post',
    'missing-decision',
    'edited',
    'missing-account',
    'epoch',
    'revision',
  ])('preserves censorship reason and no Post write for %s', async (kind) => {
    const f = bindingFixture();
    f.decision.finalArtifactHash = f.hash;
    if (kind === 'missing-post') f.tx.post.findFirst.mockResolvedValue(null);
    if (kind === 'missing-decision')
      f.tx.contentLearningDecision.findFirst.mockResolvedValue(null);
    if (kind === 'edited') f.decision.finalArtifactHash = 'edited-hash';
    if (kind === 'missing-account')
      f.tx.contentLearningAccount.findFirst.mockResolvedValue(null);
    if (kind === 'epoch') f.account.epoch++;
    if (kind === 'revision') f.account.revision++;
    const reason =
      kind === 'missing-post' || kind === 'missing-decision'
        ? 'lineage_conflict'
        : kind === 'edited'
          ? 'edited_artifact'
          : 'invalidated_after_dispatch';
    expect(
      await f.service.bindPublication('org', 'decision', 'post', f.payload),
    ).toEqual({ valid: false, reason });
    expect(f.tx.post.updateMany).not.toHaveBeenCalled();
    if (kind === 'missing-decision')
      expect(f.tx.contentLearningDecision.updateMany).not.toHaveBeenCalled();
    else
      expect(f.tx.contentLearningDecision.updateMany).toHaveBeenCalledWith({
        where: { id: 'decision', organizationId: 'org', isDeleted: false },
        data: { state: 'censored', censorshipReason: reason },
      });
    f.assertSharedEntry();
  });
});
