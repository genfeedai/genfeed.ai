import { LearningAccountService } from '@api/collections/content-learning/services/learning-account.service';
import type { LearningDependencyService } from '@api/collections/content-learning/services/learning-dependency.service';
import {
  LearningOperationService,
  learningHash,
} from '@api/collections/content-learning/services/learning-operation.service';
import { LearningScopeStateService } from '@api/collections/content-learning/services/learning-scope-state.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  learningDescriptorTuple,
  learningRegisteredProfiles,
} from '@genfeedai/harness';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class {},
}));
function fixture() {
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
    epoch: 1,
    revision: 3,
    mode: 'live',
    failureReason: null,
    pinnedReleaseId: null,
  };
  const scope = {
    id: 'scope',
    organizationId: 'org',
    brandId: 'brand',
    credentialId: 'credential',
    scopeKey: 'scope-key',
    epoch: 1,
    revision: 2,
    descriptorHash,
    cellDescriptor: descriptor,
    activePolicyId: 'prior',
    pinnedPolicyId: null as string | null,
    isDeleted: false,
  };
  const policy = {
    id: 'policy',
    organizationId: 'org',
    brandId: 'brand',
    credentialId: 'credential',
    scopeKey: 'scope-key',
    epoch: 1,
    descriptorHash,
    cellDescriptor: descriptor,
  };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn(),
    member: {
      findFirst: vi.fn().mockResolvedValue({ role: { key: 'owner' } }),
    },
    credential: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'credential',
        brandId: 'brand',
        platform: 'TWITTER',
      }),
    },
    brand: { findFirst: vi.fn().mockResolvedValue({ id: 'brand' }) },
    contentLearningAccount: {
      findFirst: vi.fn().mockResolvedValue(account),
      upsert: vi.fn().mockResolvedValue(account),
      updateMany: vi.fn().mockImplementation(({ data }) => {
        if (data.mode) account.mode = data.mode;
        if (data.epoch) account.epoch++;
        return { count: 1 };
      }),
    },
    contentLearningScopeState: {
      findFirst: vi.fn().mockResolvedValue(scope),
      findMany: vi
        .fn()
        .mockImplementation(() => (scope.pinnedPolicyId ? [scope] : [])),
      upsert: vi.fn().mockResolvedValue(scope),
      updateMany: vi.fn().mockImplementation(({ data }) => {
        if ('pinnedPolicyId' in data)
          scope.pinnedPolicyId = data.pinnedPolicyId;
        scope.revision++;
        return { count: 1 };
      }),
    },
    contentLearningPolicyVersion: {
      findFirst: vi.fn().mockResolvedValue(policy),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    contentLearningOperation: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi
        .fn()
        .mockImplementation(({ data }) => ({ id: 'operation', ...data })),
    },
  };
  tx.$transaction.mockImplementation((fn) => fn(tx));
  const dependencies = { valid: vi.fn().mockResolvedValue(true) },
    scopes = new LearningScopeStateService(
      tx as unknown as PrismaService,
      dependencies as unknown as LearningDependencyService,
    ),
    operations = new LearningOperationService(tx as unknown as PrismaService);
  const service = new LearningAccountService(
    tx as unknown as PrismaService,
    operations,
    dependencies as unknown as LearningDependencyService,
    scopes,
  );
  const control = (action: string) =>
    service.control({ organizationId: 'org', actorId: 'user' }, 'credential', {
      action,
      expectedRevision: 3,
      requestId: `request-${action}`,
      reason: 'Owner control',
      policyId: 'policy',
    });
  return {
    tx,
    account,
    scope,
    policy,
    scopes,
    service,
    control,
    descriptor,
    descriptorHash,
  };
}
describe('scoped rollback pins and control epochs', () => {
  it('pins rollback in the mutation transaction and resume retains the pin', async () => {
    const f = fixture();
    await f.control('rollback');
    expect(f.scope.pinnedPolicyId).toBe('policy');
    expect(f.account.mode).toBe('paused');
    await f.control('resume');
    expect(f.scope.pinnedPolicyId).toBe('policy');
    const calls = f.tx.$queryRaw.mock.calls.map(([strings]) =>
      strings.join(''),
    );
    expect(calls[0]).toContain('pg_advisory_xact_lock(');
    expect(calls[1]).toContain('content_learning_accounts');
    expect(calls[2]).toContain('content_learning_scope_states');
    expect(f.tx.contentLearningAccount.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ activePolicyId: 'policy' }),
      }),
    );
  });
  it('explicit live clears only pinned current epoch scopes and increments their revision once', async () => {
    const f = fixture();
    f.scope.pinnedPolicyId = 'policy';
    await f.control('live');
    expect(f.scope.pinnedPolicyId).toBeNull();
    expect(f.scope.revision).toBe(3);
    expect(f.tx.contentLearningScopeState.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org',
          credentialId: 'credential',
          epoch: 1,
          isDeleted: false,
          pinnedPolicyId: { not: null },
        },
        orderBy: { id: 'asc' },
      }),
    );
    await f.control('live');
    expect(f.scope.revision).toBe(3);
  });
  it('reset changes epoch and preserves historical scope rows', async () => {
    const f = fixture();
    f.scope.pinnedPolicyId = 'policy';
    await f.control('reset');
    expect(f.account.epoch).toBe(2);
    expect(f.scope.epoch).toBe(1);
    expect(f.scope.pinnedPolicyId).toBe('policy');
    expect(f.tx.contentLearningScopeState.updateMany).not.toHaveBeenCalled();
  });
  it.each(['rollback', 'live'])(
    'fails %s on zero scope CAS before changing account mode',
    async (action) => {
      const f = fixture();
      f.scope.pinnedPolicyId = 'policy';
      f.tx.contentLearningScopeState.updateMany.mockResolvedValue({ count: 0 });
      await expect(f.control(action)).rejects.toThrow('Scope revision changed');
      expect(f.tx.contentLearningAccount.updateMany).not.toHaveBeenCalled();
    },
  );
  it.each(['deleted', 'hash', 'brand', 'epoch'])(
    'rejects existing %s scope without revival',
    async (mutation) => {
      const f = fixture();
      const scope = {
        organizationId: 'org',
        brandId: 'brand',
        credentialId: 'credential',
        platform: 'twitter',
        format: 'text' as const,
        objective: 'awareness' as const,
        rewardProfileId: f.descriptorHash,
      };
      if (mutation === 'deleted') f.scope.isDeleted = true;
      if (mutation === 'hash') f.scope.descriptorHash = 'other';
      if (mutation === 'brand') f.scope.brandId = 'other';
      if (mutation === 'epoch') f.scope.epoch = 2;
      await expect(
        f.scopes.ensure(
          f.tx as unknown as import('@genfeedai/prisma').Prisma.TransactionClient,
          scope,
          f.descriptor,
          1,
        ),
      ).rejects.toThrow('Existing scope descriptor mismatch');
      expect(f.tx.contentLearningScopeState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: {} }),
      );
    },
  );
});
