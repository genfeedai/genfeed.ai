import { parseLearningPolicy } from '@api/collections/content-learning/services/learning-policy.service';
import { initializeLearningPolicy } from '@genfeedai/harness';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class {},
}));
describe('strict registered policy dimensions', () => {
  it('rejects finite but non-nine-dimensional state', () => {
    const state = initializeLearningPolicy();
    state['baseline-v1'] = { a: [[1]], b: [0] };
    expect(parseLearningPolicy(state)).toBeNull();
  });
});

import type { LearningDependencyService } from '@api/collections/content-learning/services/learning-dependency.service';
import { learningHash } from '@api/collections/content-learning/services/learning-operation.service';
import { LearningPolicyService } from '@api/collections/content-learning/services/learning-policy.service';
import { LearningScopeStateService } from '@api/collections/content-learning/services/learning-scope-state.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  learningDescriptorTuple,
  learningRegisteredProfiles,
} from '@genfeedai/harness';

function policyFixture() {
  const descriptor = learningRegisteredProfiles(
      'twitter',
      'text',
      'awareness',
    )[0].descriptor,
    descriptorHash = learningHash(learningDescriptorTuple(descriptor));
  const account = {
    id: 'account',
    organizationId: 'org',
    brandId: 'brand',
    credentialId: 'credential',
    mode: 'live',
    failureReason: null,
    epoch: 2,
    revision: 4,
    evidenceRevision: 5,
    activeConfigVersion: descriptor.configVersion,
    activePolicyId: 'wrong-account-policy',
  };
  const scope = {
    id: 'scope',
    organizationId: 'org',
    brandId: 'brand',
    credentialId: 'credential',
    scopeKey: 'scope-key',
    epoch: 2,
    revision: 3,
    activePolicyId: 'policy',
    pinnedPolicyId: null as string | null,
    cellDescriptor: descriptor,
    descriptorHash,
    lastValidRewardAt: new Date(),
    isDeleted: false,
  };
  const policy = {
    ...account,
    id: 'policy',
    scopeKey: scope.scopeKey,
    descriptorHash,
    cellDescriptor: descriptor,
    armState: initializeLearningPolicy(),
    evidenceIds: ['reward'],
    state: 'active',
    synthetic: false,
    version: 1,
  };
  const decision = {
    ...account,
    id: 'decision',
    scopeKey: scope.scopeKey,
    descriptorHash,
    cellDescriptor: descriptor,
    selectedArmId: 'baseline-v1',
    contextVector: [1, 0, 1, 0, 1, 0, 1, 0, 1],
  };
  const reward = {
    id: 'reward',
    decisionId: 'decision',
    status: 'valid',
    composite: 0.2,
    version: 1,
    createdAt: new Date(),
  };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn(),
    contentLearningAccount: {
      findFirst: vi.fn().mockResolvedValue(account),
      updateMany: vi.fn(),
    },
    contentLearningScopeState: {
      findFirst: vi
        .fn()
        .mockImplementation(({ where }) =>
          where.scopeKey === scope.scopeKey && where.epoch === scope.epoch
            ? scope
            : null,
        ),
      updateMany: vi.fn().mockImplementation(({ data }) => {
        Object.assign(scope, {
          activePolicyId: data.activePolicyId,
          lastValidRewardAt: data.lastValidRewardAt,
          revision: scope.revision + 1,
        });
        return { count: 1 };
      }),
    },
    contentLearningPolicyVersion: {
      findFirst: vi
        .fn()
        .mockImplementation(({ where }) =>
          where.id
            ? where.id === policy.id
              ? policy
              : null
            : where.evidenceManifestHash
              ? null
              : policy,
        ),
      create: vi
        .fn()
        .mockImplementation(({ data }) => ({ id: 'new-policy', ...data })),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    contentLearningDecision: {
      findFirst: vi.fn().mockResolvedValue(decision),
      findMany: vi.fn().mockResolvedValue([decision]),
    },
    contentLearningReward: {
      findMany: vi.fn().mockResolvedValue([reward]),
      findFirst: vi.fn().mockResolvedValue(reward),
    },
  };
  tx.$transaction.mockImplementation((fn) => fn(tx));
  const dependencies = {
    valid: vi.fn().mockResolvedValue(true),
    link: vi.fn(),
    resolve: vi.fn().mockImplementation((kind, id) => ({
      kind,
      id,
      organizationId: 'org',
      version: '1',
    })),
  };
  const scopes = new LearningScopeStateService(
    tx as unknown as PrismaService,
    dependencies as unknown as LearningDependencyService,
  );
  const service = new LearningPolicyService(
    tx as unknown as PrismaService,
    dependencies as unknown as LearningDependencyService,
    scopes,
  );
  return {
    descriptor,
    descriptorHash,
    account,
    scope,
    policy,
    decision,
    reward,
    tx,
    dependencies,
    scopes,
    service,
  };
}
describe('current epoch scope authority and rebuild', () => {
  it('uses scoped pointer instead of account pointer and never borrows another scope freshness', async () => {
    const f = policyFixture();
    expect(await f.service.current('org', 'credential', 'scope-key')).toBe(
      f.policy,
    );
    expect(
      await f.service.current('org', 'credential', 'other-scope'),
    ).toBeNull();
    expect(f.tx.contentLearningPolicyVersion.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'policy',
          epoch: 2,
          descriptorHash: f.descriptorHash,
        }),
      }),
    );
    f.scope.lastValidRewardAt = new Date(Date.now() - 31 * 86400000);
    expect(
      await f.service.current('org', 'credential', 'scope-key'),
    ).toBeNull();
  });
  it('excludes old epochs, legacy descriptor and invalid evidence', async () => {
    const f = policyFixture();
    f.account.epoch = 3;
    expect(
      await f.service.current('org', 'credential', 'scope-key'),
    ).toBeNull();
    f.account.epoch = 2;
    f.dependencies.valid.mockResolvedValue(false);
    expect(
      await f.service.current('org', 'credential', 'scope-key'),
    ).toBeNull();
  });
  it('returns null without valid rewards rather than inventing a learned policy', async () => {
    const f = policyFixture();
    f.tx.contentLearningReward.findFirst.mockResolvedValue(null);
    expect(
      await f.service.rebuild('org', 'credential', 'scope-key'),
    ).toBeNull();
    expect(f.tx.contentLearningPolicyVersion.create).not.toHaveBeenCalled();
  });
  it.each([NaN, Infinity, -1.01, 1.01])(
    'excludes invalid reward %s',
    async (composite) => {
      const f = policyFixture();
      f.reward.composite = composite;
      expect(
        await f.service.rebuild('org', 'credential', 'scope-key'),
      ).toBeNull();
    },
  );
  it('creates shadow, activates only scope, and fences before reads/account before scope locks', async () => {
    const f = policyFixture();
    f.tx.contentLearningPolicyVersion.findFirst.mockImplementation(
      ({ where }) =>
        where.id === 'new-policy'
          ? { ...f.policy, id: 'new-policy', state: 'shadow' }
          : where.evidenceManifestHash
            ? null
            : f.policy,
    );
    expect(
      await f.service.rebuild('org', 'credential', 'scope-key'),
    ).toMatchObject({ id: 'new-policy', state: 'active' });
    expect(f.tx.contentLearningPolicyVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          state: 'shadow',
          descriptorHash: f.descriptorHash,
          cellDescriptor: f.descriptor,
        }),
      }),
    );
    expect(f.tx.contentLearningAccount.updateMany).not.toHaveBeenCalled();
    const sql = f.tx.$queryRaw.mock.calls.map(([strings]) => strings.join(''));
    expect(sql[0]).toContain('pg_advisory_xact_lock_shared');
    expect(sql[1]).toContain('content_learning_accounts');
    expect(sql[2]).toContain('content_learning_scope_states');
    expect(f.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      f.tx.contentLearningAccount.findFirst.mock.invocationCallOrder[0],
    );
    expect(f.dependencies.valid).toHaveBeenCalledWith(
      'reward',
      'reward',
      f.tx,
      'org',
    );
  });
  it('reuses identical shadow and already-current activation is a no-op', async () => {
    const f = policyFixture();
    f.policy.state = 'shadow';
    f.scope.activePolicyId = 'prior';
    f.tx.contentLearningPolicyVersion.findFirst.mockResolvedValue(f.policy);
    expect(
      await f.service.rebuild('org', 'credential', 'scope-key'),
    ).toMatchObject({ id: 'policy', state: 'active' });
    expect(f.tx.contentLearningPolicyVersion.create).not.toHaveBeenCalled();
    expect(f.scope.revision).toBe(4);
    await f.service.rebuild('org', 'credential', 'scope-key');
    expect(f.scope.revision).toBe(4);
    expect(f.tx.contentLearningScopeState.updateMany).toHaveBeenCalledTimes(1);
  });
  it('preserves rollback pin and rejects final invalidation or zero scope CAS', async () => {
    const f = policyFixture();
    f.scope.pinnedPolicyId = 'policy';
    f.tx.contentLearningPolicyVersion.findFirst.mockResolvedValue(f.policy);
    await f.service.rebuild('org', 'credential', 'scope-key');
    expect(f.tx.contentLearningScopeState.updateMany).not.toHaveBeenCalled();
    f.scope.pinnedPolicyId = null;
    f.scope.activePolicyId = 'prior';
    f.tx.contentLearningScopeState.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      f.service.rebuild('org', 'credential', 'scope-key'),
    ).rejects.toThrow('Scope revision changed');
    f.dependencies.valid
      .mockReset()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    await expect(
      f.service.rebuild('org', 'credential', 'scope-key'),
    ).rejects.toThrow('Policy evidence changed');
  });
});
