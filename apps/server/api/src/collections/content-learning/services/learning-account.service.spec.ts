import { LearningAccountService } from '@api/collections/content-learning/services/learning-account.service';
import type { LearningDependencyService } from '@api/collections/content-learning/services/learning-dependency.service';
import {
  LearningOperationService,
  learningHash,
} from '@api/collections/content-learning/services/learning-operation.service';
import type { LearningPolicyService } from '@api/collections/content-learning/services/learning-policy.service';
import { LearningScopeStateService } from '@api/collections/content-learning/services/learning-scope-state.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  learningDescriptorTuple,
  learningRegisteredProfiles,
} from '@genfeedai/harness';
import type { Prisma } from '@genfeedai/prisma';
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
    contentLearningConsent: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi
        .fn()
        .mockImplementation(({ data }) => ({ id: 'consent', ...data })),
    },
    contentLearningOperation: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi
        .fn()
        .mockImplementation(({ data }) => ({ id: 'operation', ...data })),
    },
  };
  const root = { ...tx, $queryRaw: vi.fn(), $transaction: vi.fn() };
  root.$transaction.mockImplementation((fn) => fn(tx));
  const dependencies = {
      valid: vi.fn().mockResolvedValue(true),
      invalidate: vi.fn(),
    },
    scopes = new LearningScopeStateService(
      root as unknown as PrismaService,
      dependencies as unknown as LearningDependencyService,
    ),
    operations = new LearningOperationService(root as unknown as PrismaService);
  const service = new LearningAccountService(
    root as unknown as PrismaService,
    operations,
    dependencies as unknown as LearningDependencyService,
    scopes,
    {} as LearningPolicyService,
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
    root,
    dependencies,
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
    expect(calls[0]).toContain('pg_advisory_xact_lock_shared');
    expect(calls[1]).toContain('pg_advisory_xact_lock(');
    expect(calls[2]).toContain('content_learning_accounts');
    expect(calls[3]).toContain('content_learning_scope_states');
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
          f.tx as unknown as Prisma.TransactionClient,
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

import { learningScopeKey } from '@api/collections/content-learning/services/learning-operation.service';
import { ContentLearningMode } from '@genfeedai/contracts';
import {
  learningGenerationReceiptSchema,
  learningScopeViewSchema,
} from '@genfeedai/contracts/api-types/contracts/content-learning-generation.contract';
import type {
  LearningCellDescriptor,
  LearningFormat,
  LearningObjective,
} from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';

function readFixture() {
  const account = {
    id: 'account',
    organizationId: 'org',
    brandId: 'brand',
    credentialId: 'credential',
    mode: 'live',
    revision: 3,
    epoch: 1,
    isDeleted: false,
    activeConfigVersion: 'rl-reward-v1-experimental',
    sharingConsentVersion: null,
    sharedReleasePreference: 'automatic',
    pinnedReleaseId: null,
    approvedArmIds: ['question-example-v1'],
    failureReason: null,
    driftState: null,
    activePolicyId: 'legacy-account-pointer',
  };
  function makeScope(
    format: LearningFormat = 'text',
    objective: LearningObjective = 'awareness',
  ) {
    const descriptor = learningRegisteredProfiles(
        'twitter',
        format,
        objective,
      )[0].descriptor,
      descriptorHash = learningHash(learningDescriptorTuple(descriptor));
    const scopeKey = learningScopeKey({
      organizationId: 'org',
      brandId: 'brand',
      credentialId: 'credential',
      platform: 'twitter',
      format,
      objective,
      rewardProfileId: descriptorHash,
    });
    return {
      id: `scope-${scopeKey}`,
      organizationId: 'org',
      brandId: 'brand',
      credentialId: 'credential',
      scopeKey,
      epoch: 1,
      revision: 2,
      isDeleted: false,
      cellDescriptor: descriptor,
      descriptorHash,
      activePolicyId: 'stored-unverified',
      pinnedPolicyId: null as string | null,
      lastValidRewardAt: new Date() as Date | null,
    };
  }
  const rows: ReturnType<typeof makeScope>[] = [],
    checkpoints: Array<{
      id: string;
      postId: string;
      revision: number;
      format: LearningFormat;
      receivedAt: Date;
      measurement: {
        profiles: Array<{
          profileId: string;
          descriptor: LearningCellDescriptor;
          measurement: { exposure: number; weightedActions: number };
        }>;
      };
    }> = [],
    policyIds = new Map<string, string>();
  function addScope(
    format: LearningFormat = 'text',
    objective: LearningObjective = 'awareness',
    count = 0,
  ) {
    const row = makeScope(format, objective);
    rows.push(row);
    for (let index = 0; index < count; index++)
      checkpoints.push({
        id: `checkpoint-${row.descriptorHash}-${index}`,
        postId: `post-${row.descriptorHash}-${index}`,
        revision: 0,
        format,
        receivedAt: new Date(),
        measurement: {
          profiles: [
            {
              profileId: row.descriptorHash,
              descriptor: row.cellDescriptor,
              measurement: { exposure: 1000, weightedActions: 0 },
            },
          ],
        },
      });
    return row;
  }
  const tx = {
    $transaction: vi.fn(),
    $queryRaw: vi.fn().mockResolvedValue([]),
    credential: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'credential',
        organizationId: 'org',
        brandId: 'brand',
        platform: 'TWITTER',
        isDeleted: false,
      }),
    },
    brand: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'brand',
        organizationId: 'org',
        isDeleted: false,
      }),
    },
    contentLearningAccount: {
      findFirst: vi.fn().mockResolvedValue(account),
      upsert: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    contentLearningScopeState: {
      findMany: vi
        .fn()
        .mockImplementation(({ where }) =>
          rows.filter((row) => row.epoch === where.epoch && !row.isDeleted),
        ),
      upsert: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    contentLearningCheckpoint: {
      findMany: vi
        .fn()
        .mockImplementation(({ where }) =>
          checkpoints.filter((row) => row.format === where.format),
        ),
      findFirst: vi
        .fn()
        .mockImplementation(
          ({ where }) =>
            checkpoints.find(
              (row) => row.id === where.id && row.revision === where.revision,
            ) ?? null,
        ),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    contentLearningBaseline: { upsert: vi.fn() },
    contentLearningDecision: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    contentLearningBrandPreference: {
      findFirst: vi.fn().mockResolvedValue(null),
      upsert: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    contentLearningRelease: { findFirst: vi.fn() },
  };
  tx.$transaction.mockImplementation((fn) => fn(tx));
  const dependencies = {
      valid: vi.fn().mockResolvedValue(true),
      resolve: vi.fn(),
      link: vi.fn(),
      invalidate: vi.fn(),
    },
    operations = {
      assertMember: vi.fn().mockResolvedValue({ role: { key: 'owner' } }),
    },
    policies = {
      current: vi
        .fn()
        .mockImplementation((_organizationId, _credentialId, scopeKey) =>
          policyIds.has(scopeKey) ? { id: policyIds.get(scopeKey) } : null,
        ),
    };
  const service = new LearningAccountService(
    tx as unknown as PrismaService,
    operations as unknown as LearningOperationService,
    dependencies as unknown as LearningDependencyService,
    {} as LearningScopeStateService,
    policies as unknown as LearningPolicyService,
  );
  function decision(scope: ReturnType<typeof makeScope>) {
    return {
      id: 'decision',
      organizationId: 'org',
      brandId: 'brand',
      credentialId: 'credential',
      isDeleted: false,
      synthetic: false,
      createdAt: new Date(),
      mode: 'live',
      epoch: 1,
      accountRevision: 3,
      scopeKey: scope.scopeKey,
      scopeRevision: scope.revision,
      cellDescriptor: scope.cellDescriptor,
      descriptorHash: scope.descriptorHash,
      selectedArmId: 'baseline-v1',
      configVersion: account.activeConfigVersion,
      baselineId: 'baseline',
      accountPolicyId: null as string | null,
    };
  }
  const writeSpies = [
    tx.contentLearningAccount.upsert,
    tx.contentLearningAccount.create,
    tx.contentLearningAccount.updateMany,
    tx.contentLearningScopeState.upsert,
    tx.contentLearningScopeState.create,
    tx.contentLearningScopeState.updateMany,
    tx.contentLearningCheckpoint.create,
    tx.contentLearningCheckpoint.updateMany,
    tx.contentLearningBaseline.upsert,
    tx.contentLearningDecision.create,
    tx.contentLearningDecision.updateMany,
    tx.contentLearningBrandPreference.upsert,
    tx.contentLearningBrandPreference.create,
    tx.contentLearningBrandPreference.updateMany,
    dependencies.resolve,
    dependencies.link,
    dependencies.invalidate,
  ];
  function assertNoWrites() {
    for (const spy of writeSpies) expect(spy).not.toHaveBeenCalled();
  }
  return {
    account,
    rows,
    tx,
    dependencies,
    operations,
    policies,
    policyIds,
    service,
    addScope,
    makeScope,
    decision,
    assertNoWrites,
  };
}
describe('canonical read-only account scope snapshots', () => {
  it('rejects unknown current credential platform before a filter can omit the registered scope', async () => {
    const f = readFixture();
    f.addScope('text', 'awareness');
    f.tx.credential.findFirst
      .mockResolvedValueOnce({
        id: 'credential',
        organizationId: 'org',
        brandId: 'brand',
        platform: 'TWITTER',
        isDeleted: false,
      })
      .mockResolvedValueOnce({
        id: 'credential',
        organizationId: 'org',
        brandId: 'brand',
        platform: 'UNSUPPORTED_PLATFORM',
        isDeleted: false,
      });
    await expect(f.service.read('org', 'credential', 'image')).rejects.toThrow(
      'Learning scope state unavailable',
    );
    expect(f.policies.current).not.toHaveBeenCalled();
    expect(f.tx.contentLearningCheckpoint.findMany).not.toHaveBeenCalled();
    expect(f.tx.contentLearningDecision.findFirst).not.toHaveBeenCalled();
    f.assertNoWrites();
  });

  it('returns complete authorized shadow default without creating state', async () => {
    const f = readFixture();
    f.tx.contentLearningAccount.findFirst.mockResolvedValue(null);
    expect(await f.service.read('org', 'credential')).toEqual({
      id: 'credential',
      organizationId: 'org',
      brandId: 'brand',
      credentialId: 'credential',
      mode: ContentLearningMode.SHADOW,
      revision: 0,
      epoch: 0,
      sharingConsentVersion: null,
      pinnedReleaseId: null,
      activePolicyId: null,
      failureReason: null,
      driftState: null,
      sharedReleasePreference: 'automatic',
      approvedArmIds: [],
      baselineCount: 0,
      scopes: [],
    });
    f.assertNoWrites();
    expect(f.tx.contentLearningScopeState.findMany).not.toHaveBeenCalled();
  });
  it.each(['credential', 'brand'])(
    'refuses missing/deleted/cross-tenant %s before default',
    async (source) => {
      const f = readFixture();
      if (source === 'credential')
        f.tx.credential.findFirst.mockResolvedValue(null);
      else f.tx.brand.findFirst.mockResolvedValue(null);
      await expect(f.service.read('org', 'credential')).rejects.toThrow(
        'Account not found',
      );
      f.assertNoWrites();
      expect(f.tx.credential.findFirst).toHaveBeenCalledWith({
        where: { organizationId: 'org', id: 'credential', isDeleted: false },
      });
    },
  );
  it('locks account before current scopes and keeps selector/policy on the same transaction', async () => {
    const f = readFixture(),
      scope = f.addScope('text', 'awareness', 20);
    f.policyIds.set(scope.scopeKey, 'verified-policy');
    const result = await f.service.read('org', 'credential');
    expect(result.baselineCount).toBe(20);
    expect(result.activePolicyId).toBe('verified-policy');
    expect(result.scopes?.[0]).toMatchObject({
      descriptorHash: scope.descriptorHash,
      baselineCount: 20,
      activePolicyId: 'verified-policy',
      unavailableReasons: [],
    });
    expect(learningScopeViewSchema.safeParse(result.scopes?.[0]).success).toBe(
      true,
    );
    const sql = f.tx.$queryRaw.mock.calls.map(([parts]) => parts.join(''));
    expect(sql[0]).toContain('pg_advisory_xact_lock_shared');
    expect(sql[1]).toContain('content_learning_accounts');
    expect(sql[1]).toContain('FOR SHARE');
    expect(sql[2]).toContain('content_learning_scope_states');
    expect(sql[2]).toContain('ORDER BY "scopeKey", id FOR SHARE');
    expect(f.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      f.tx.contentLearningAccount.findFirst.mock.invocationCallOrder[0],
    );
    expect(f.tx.$queryRaw.mock.invocationCallOrder[2]).toBeLessThan(
      f.tx.contentLearningScopeState.findMany.mock.invocationCallOrder[0],
    );
    expect(f.policies.current).toHaveBeenCalledWith(
      'org',
      'credential',
      scope.scopeKey,
      f.tx,
    );
    expect(f.dependencies.valid).toHaveBeenCalledWith(
      'checkpoint',
      expect.any(String),
      f.tx,
      'org',
    );
    f.assertNoWrites();
  });
  it('returns no initialized scopes without selecting a legacy account pointer', async () => {
    const f = readFixture();
    const result = await f.service.read('org', 'credential');
    expect(result.scopes).toEqual([]);
    expect(result.baselineCount).toBe(0);
    expect(result.activePolicyId).toBeNull();
    expect(result.latestDecision).toBeUndefined();
    expect(f.tx.contentLearningDecision.findFirst).not.toHaveBeenCalled();
    f.assertNoWrites();
  });
  it('keeps masks/objectives independent, omits historical/deleted scopes and never sums multi-scope summaries', async () => {
    const f = readFixture(),
      awareness = f.addScope('text', 'awareness', 20),
      engagement = f.addScope('text', 'engagement', 19),
      historical = f.makeScope('image', 'awareness');
    historical.epoch = 0;
    f.rows.push(historical);
    const deleted = f.makeScope('image', 'engagement');
    deleted.isDeleted = true;
    f.rows.push(deleted);
    f.policyIds.set(awareness.scopeKey, 'policy');
    const result = await f.service.read('org', 'credential');
    expect(result.scopes).toHaveLength(2);
    expect(result.scopes?.map((scope) => scope.scopeKey)).toEqual(
      [awareness.scopeKey, engagement.scopeKey].sort(),
    );
    expect(
      result.scopes?.find((scope) => scope.scopeKey === awareness.scopeKey)
        ?.baselineCount,
    ).toBe(20);
    expect(
      result.scopes?.find((scope) => scope.scopeKey === engagement.scopeKey)
        ?.baselineCount,
    ).toBe(19);
    expect(result.baselineCount).toBe(0);
    expect(result.activePolicyId).toBeNull();
    f.assertNoWrites();
  });
  it.each([
    { format: 'text', objective: undefined, count: 2 },
    { format: undefined, objective: 'awareness', count: 2 },
    { format: 'image', objective: 'engagement', count: 1 },
    { format: undefined, objective: undefined, count: 4 },
    { format: 'video', objective: undefined, count: 0 },
  ] as const)(
    'applies optional conjunctive $format/$objective filters without default cell',
    async ({ format, objective, count }) => {
      const f = readFixture();
      f.addScope('text', 'awareness');
      f.addScope('text', 'engagement');
      f.addScope('image', 'awareness');
      f.addScope('image', 'engagement');
      const result = await f.service.read(
        'org',
        'credential',
        format,
        objective,
      );
      expect(result.scopes).toHaveLength(count);
      f.assertNoWrites();
    },
  );
  it('rejects invalid supplied filters before reads', async () => {
    const f = readFixture();
    await expect(
      f.service.read('org', 'credential', 'invalid' as LearningFormat),
    ).rejects.toThrow('Invalid learning scope filter');
    await expect(
      f.service.read(
        'org',
        'credential',
        undefined,
        'invalid' as LearningObjective,
      ),
    ).rejects.toThrow('Invalid learning scope filter');
    expect(f.tx.$transaction).not.toHaveBeenCalled();
    f.assertNoWrites();
  });
  it.each(['descriptor', 'hash', 'scopeKey', 'revision', 'epoch', 'pin'])(
    'fails closed on corrupt %s scope before filter omission',
    async (kind) => {
      const f = readFixture(),
        scope = f.addScope();
      if (kind === 'descriptor') Object.assign(scope, { cellDescriptor: null });
      if (kind === 'hash') scope.descriptorHash = 'bad';
      if (kind === 'scopeKey') scope.scopeKey = 'bad';
      if (kind === 'revision') scope.revision = -1;
      if (kind === 'epoch') scope.epoch = -1;
      if (kind === 'pin') scope.pinnedPolicyId = '';
      f.tx.contentLearningScopeState.findMany.mockResolvedValue([scope]);
      await expect(
        f.service.read(
          'org',
          'credential',
          kind === 'pin' ? undefined : 'image',
        ),
      ).rejects.toThrow('Learning scope state unavailable');
      f.assertNoWrites();
    },
  );
  it.each(['mode', 'revision', 'epoch', 'preference', 'pin', 'identity'])(
    'refuses malformed stored account %s instead of fabricating live/default',
    async (kind) => {
      const f = readFixture();
      if (kind === 'mode') f.account.mode = 'bad';
      if (kind === 'revision') f.account.revision = -1;
      if (kind === 'epoch') f.account.epoch = -1;
      if (kind === 'preference') f.account.sharedReleasePreference = 'bad';
      if (kind === 'pin')
        Object.assign(f.account, {
          sharedReleasePreference: 'pinned',
          pinnedReleaseId: '',
        });
      if (kind === 'identity') f.account.id = '';
      await expect(f.service.read('org', 'credential')).rejects.toThrow(
        'Learning account state unavailable',
      );
      f.assertNoWrites();
    },
  );
  it('refuses account disappearance after SHARE lock', async () => {
    const f = readFixture();
    f.tx.contentLearningAccount.findFirst
      .mockResolvedValueOnce(f.account)
      .mockResolvedValueOnce(null);
    await expect(f.service.read('org', 'credential')).rejects.toThrow(
      'Learning account changed',
    );
    f.assertNoWrites();
  });
  it('reports fixed ordered prerequisites and preserves unavailable saved pin', async () => {
    const f = readFixture(),
      scope = f.addScope();
    f.account.mode = 'paused';
    Object.assign(f.account, { failureReason: 'private_arbitrary_detail' });
    scope.pinnedPolicyId = 'saved-pin';
    const result = await f.service.read('org', 'credential');
    expect(result.scopes?.[0]).toMatchObject({
      activePolicyId: null,
      pinnedPolicyId: 'saved-pin',
      lastValidRewardAt: null,
      unavailableReasons: [
        'account_not_live',
        'account_failure',
        'insufficient_baseline',
        'policy_unavailable',
      ],
    });
    f.assertNoWrites();
  });
  it.each(['future', 'expired', 'invalid'])(
    'does not emit %s last reward timestamp as current availability',
    async (kind) => {
      const f = readFixture(),
        scope = f.addScope('text', 'awareness', 20);
      scope.lastValidRewardAt =
        kind === 'future'
          ? new Date(Date.now() + 86400000)
          : kind === 'expired'
            ? new Date(Date.now() - 31 * 86400000)
            : new Date(NaN);
      f.policyIds.set(scope.scopeKey, 'verified');
      expect(
        (await f.service.read('org', 'credential')).scopes?.[0]
          .lastValidRewardAt,
      ).toBeNull();
      f.assertNoWrites();
    },
  );
  it('keeps effective pinned policy scoped and shared cutoff consistent across selector calls', async () => {
    const f = readFixture(),
      first = f.addScope('text', 'awareness', 20),
      second = f.addScope('text', 'engagement', 20);
    first.pinnedPolicyId = 'verified-pin';
    f.policyIds.set(first.scopeKey, 'verified-pin');
    const result = await f.service.read('org', 'credential');
    expect(
      result.scopes?.find((scope) => scope.scopeKey === first.scopeKey)
        ?.activePolicyId,
    ).toBe('verified-pin');
    expect(
      result.scopes?.find((scope) => scope.scopeKey === second.scopeKey)
        ?.activePolicyId,
    ).toBeNull();
    const queries = f.tx.contentLearningCheckpoint.findMany.mock.calls;
    expect(queries[0][0].where.receivedAt.lte).toBe(
      queries[1][0].where.receivedAt.lte,
    );
    f.assertNoWrites();
  });
  it('propagates a final baseline source conflict instead of converting it to zero', async () => {
    const f = readFixture();
    f.addScope('text', 'awareness', 1);
    f.tx.contentLearningCheckpoint.findFirst.mockResolvedValue(null);
    await expect(f.service.read('org', 'credential')).rejects.toThrow(
      'Baseline contributor changed',
    );
    f.assertNoWrites();
  });
});
describe('strict selected-history projections', () => {
  it('emits canonical minimal selection without implying application or assignment', async () => {
    const f = readFixture(),
      scope = f.addScope('text', 'awareness', 20),
      decision = f.decision(scope);
    f.tx.contentLearningDecision.findFirst.mockResolvedValue(decision);
    const result = await f.service.read('org', 'credential');
    expect(result.latestDecision).toEqual({
      decisionId: 'decision',
      credentialId: 'credential',
      mode: ContentLearningMode.LIVE,
      accountRevision: 3,
      scopeRevision: 2,
      epoch: 1,
      armId: 'baseline-v1',
      cellDescriptor: scope.cellDescriptor,
      descriptorHash: scope.descriptorHash,
      configVersion: f.account.activeConfigVersion,
      synthetic: false,
      baselineId: 'baseline',
    });
    expect(
      learningGenerationReceiptSchema.safeParse(result.latestDecision).success,
    ).toBe(true);
    expect(result.latestDecision).not.toHaveProperty('application');
    expect(result.latestDecision).not.toHaveProperty('assignment');
    expect(result.latestDecision).not.toHaveProperty('probabilities');
    f.assertNoWrites();
  });
  it.each([
    'no-graph',
    'policy',
    'scope',
    'arm',
    'id',
    'descriptor',
    'mode',
    'synthetic',
    'revision',
  ])(
    'omits unprovable newest $kind selection and never falls back older',
    async (kind) => {
      const f = readFixture(),
        scope = f.addScope(),
        decision = f.decision(scope);
      if (kind === 'no-graph') f.dependencies.valid.mockResolvedValue(false);
      if (kind === 'policy') decision.accountPolicyId = 'unverified-policy';
      if (kind === 'scope') decision.scopeRevision++;
      if (kind === 'arm') decision.selectedArmId = 'unknown';
      if (kind === 'id') decision.id = '';
      if (kind === 'descriptor') decision.descriptorHash = 'invalid';
      if (kind === 'mode') decision.mode = 'shadow';
      if (kind === 'synthetic') decision.synthetic = true;
      if (kind === 'revision') decision.accountRevision++;
      f.tx.contentLearningDecision.findFirst.mockResolvedValue(decision);
      const result = await f.service.read('org', 'credential');
      expect(result.latestDecision).toBeUndefined();
      expect(f.tx.contentLearningDecision.findFirst).toHaveBeenCalledTimes(1);
      f.assertNoWrites();
    },
  );
  it('includes a private policy selection only when that exact current scope policy is verified', async () => {
    const f = readFixture(),
      scope = f.addScope('text', 'awareness', 20),
      decision = f.decision(scope);
    decision.accountPolicyId = 'verified';
    decision.selectedArmId = 'question-example-v1';
    f.policyIds.set(scope.scopeKey, 'verified');
    f.tx.contentLearningDecision.findFirst.mockResolvedValue(decision);
    const result = await f.service.read('org', 'credential');
    expect(result.latestDecision?.policyVersionId).toBe('verified');
    expect(result.latestDecision).not.toHaveProperty('application');
    f.assertNoWrites();
  });
});
describe('member-scoped saved brand receiving configuration', () => {
  it('returns canonical default without creating preference or reading releases', async () => {
    const f = readFixture();
    expect(
      await f.service.readBrandReceiving(
        { organizationId: 'org', actorId: 'user' },
        'brand',
      ),
    ).toEqual({
      id: 'brand',
      brandId: 'brand',
      revision: 0,
      preference: 'automatic',
      pinnedReleaseId: null,
    });
    expect(f.operations.assertMember).toHaveBeenCalledWith({
      organizationId: 'org',
      actorId: 'user',
    });
    expect(f.tx.contentLearningRelease.findFirst).not.toHaveBeenCalled();
    f.assertNoWrites();
  });
  it.each(['automatic', 'disabled', 'pinned'])(
    'returns saved %s configuration even if release revoked',
    async (preference) => {
      const f = readFixture();
      f.tx.contentLearningBrandPreference.findFirst.mockResolvedValue({
        revision: 4,
        preference,
        pinnedReleaseId: preference === 'pinned' ? 'revoked-release' : null,
      });
      expect(
        await f.service.readBrandReceiving(
          { organizationId: 'org', actorId: 'user' },
          'brand',
        ),
      ).toEqual({
        id: 'brand',
        brandId: 'brand',
        revision: 4,
        preference,
        pinnedReleaseId: preference === 'pinned' ? 'revoked-release' : null,
      });
      expect(f.tx.contentLearningRelease.findFirst).not.toHaveBeenCalled();
      f.assertNoWrites();
    },
  );
  it.each([
    { revision: -1, preference: 'automatic', pinnedReleaseId: null },
    { revision: 1, preference: 'invalid', pinnedReleaseId: null },
    { revision: 1, preference: 'pinned', pinnedReleaseId: null },
    { revision: 1, preference: 'pinned', pinnedReleaseId: '' },
  ])('rejects malformed preference %j', async (row) => {
    const f = readFixture();
    f.tx.contentLearningBrandPreference.findFirst.mockResolvedValue(row);
    await expect(
      f.service.readBrandReceiving(
        { organizationId: 'org', actorId: 'user' },
        'brand',
      ),
    ).rejects.toThrow('Brand receiving state unavailable');
    f.assertNoWrites();
  });
  it('refuses missing membership before any read and missing scoped brand before configuration', async () => {
    const f = readFixture();
    f.operations.assertMember.mockRejectedValueOnce(
      new Error('membership required'),
    );
    await expect(
      f.service.readBrandReceiving(
        { organizationId: 'org', actorId: 'user' },
        'brand',
      ),
    ).rejects.toThrow('membership required');
    expect(f.tx.$transaction).not.toHaveBeenCalled();
    f.tx.brand.findFirst.mockResolvedValue(null);
    await expect(
      f.service.readBrandReceiving(
        { organizationId: 'org', actorId: 'user' },
        'brand',
      ),
    ).rejects.toThrow('Brand not found');
    expect(
      f.tx.contentLearningBrandPreference.findFirst,
    ).not.toHaveBeenCalled();
    f.assertNoWrites();
  });
});

function ensureScope(f: ReturnType<typeof fixture>) {
  const scope = {
    organizationId: 'org',
    brandId: 'brand',
    credentialId: 'credential',
    platform: 'twitter',
    format: 'text' as const,
    objective: 'awareness' as const,
    rewardProfileId: f.descriptorHash,
  };
  f.scope.scopeKey = learningScopeKey(scope);
  return scope;
}
describe('ensure transaction ownership and source-scoped revocation', () => {
  it.each(['omitted', 'undefined', 'root'])(
    'owns one shared-fenced account transaction for %s root invocation',
    async (kind) => {
      const f = fixture(),
        before = structuredClone(f.account);
      const row =
        kind === 'omitted'
          ? await f.service.ensure('org', 'credential')
          : await f.service.ensure(
              'org',
              'credential',
              kind === 'root'
                ? (f.root as unknown as Prisma.TransactionClient)
                : undefined,
            );
      expect(row).toBe(f.account);
      expect(f.account).toEqual(before);
      expect(f.root.$transaction).toHaveBeenCalledTimes(1);
      expect(f.tx.$transaction).not.toHaveBeenCalled();
      expect(f.root.$queryRaw).not.toHaveBeenCalled();
      expect(f.tx.$queryRaw).toHaveBeenCalledTimes(1);
      expect(f.tx.$queryRaw.mock.calls[0][0].join('')).toContain(
        'pg_advisory_xact_lock_shared',
      );
      expect(f.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        f.tx.credential.findFirst.mock.invocationCallOrder[0],
      );
      expect(
        f.tx.credential.findFirst.mock.invocationCallOrder[0],
      ).toBeLessThan(f.tx.brand.findFirst.mock.invocationCallOrder[0]);
      expect(f.tx.brand.findFirst.mock.invocationCallOrder[0]).toBeLessThan(
        f.tx.contentLearningAccount.upsert.mock.invocationCallOrder[0],
      );
      expect(f.tx.contentLearningAccount.upsert).toHaveBeenCalledWith({
        where: {
          organizationId_credentialId: {
            organizationId: 'org',
            credentialId: 'credential',
          },
        },
        create: {
          organizationId: 'org',
          credentialId: 'credential',
          brandId: 'brand',
        },
        update: {},
      });
    },
  );
  it('joins a distinct supplied account client without transaction or late fence', async () => {
    const f = fixture();
    expect(
      await f.service.ensure(
        'org',
        'credential',
        f.tx as unknown as Prisma.TransactionClient,
      ),
    ).toBe(f.account);
    expect(f.root.$transaction).not.toHaveBeenCalled();
    expect(f.tx.$transaction).not.toHaveBeenCalled();
    expect(f.tx.$queryRaw).not.toHaveBeenCalled();
    expect(f.tx.credential.findFirst).toHaveBeenCalledWith({
      where: { organizationId: 'org', id: 'credential', isDeleted: false },
    });
    expect(f.tx.contentLearningAccount.upsert).toHaveBeenCalledTimes(1);
  });
  const missingAccountSources: Array<'credential' | 'brand'> = [
    'credential',
    'brand',
  ];
  it.each(missingAccountSources)(
    'retains scoped missing/foreign/deleted %s rejection before account creation',
    async (kind) => {
      const f = fixture();
      f.tx[kind].findFirst.mockResolvedValue(null);
      await expect(f.service.ensure('org', 'credential')).rejects.toThrow(
        'Account not found',
      );
      expect(f.tx.contentLearningAccount.upsert).not.toHaveBeenCalled();
      expect(f.root.$transaction).toHaveBeenCalledTimes(1);
    },
  );
  it.each(['undefined', 'root'])(
    'owns one shared-fenced scope transaction for %s invocation',
    async (kind) => {
      const f = fixture(),
        scope = ensureScope(f);
      expect(
        await f.scopes.ensure(
          kind === 'root'
            ? (f.root as unknown as Prisma.TransactionClient)
            : undefined,
          scope,
          f.descriptor,
          1,
        ),
      ).toBe(f.scope);
      expect(f.root.$transaction).toHaveBeenCalledTimes(1);
      expect(f.tx.$transaction).not.toHaveBeenCalled();
      expect(f.root.$queryRaw).not.toHaveBeenCalled();
      expect(f.tx.$queryRaw).toHaveBeenCalledTimes(1);
      expect(f.tx.$queryRaw.mock.calls[0][0].join('')).toContain(
        'pg_advisory_xact_lock_shared',
      );
      expect(f.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        f.tx.credential.findFirst.mock.invocationCallOrder[0],
      );
      expect(
        f.tx.contentLearningAccount.findFirst.mock.invocationCallOrder[0],
      ).toBeLessThan(
        f.tx.contentLearningScopeState.upsert.mock.invocationCallOrder[0],
      );
      expect(f.tx.contentLearningScopeState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: {} }),
      );
      expect(f.tx.contentLearningAccount.upsert).not.toHaveBeenCalled();
    },
  );
  it('joins a distinct supplied scope client without transaction or fence', async () => {
    const f = fixture(),
      scope = ensureScope(f);
    expect(
      await f.scopes.ensure(
        f.tx as unknown as Prisma.TransactionClient,
        scope,
        f.descriptor,
        1,
      ),
    ).toBe(f.scope);
    expect(f.root.$transaction).not.toHaveBeenCalled();
    expect(f.tx.$transaction).not.toHaveBeenCalled();
    expect(f.tx.$queryRaw).not.toHaveBeenCalled();
    expect(f.tx.contentLearningScopeState.upsert).toHaveBeenCalledTimes(1);
  });
  it.each(['descriptor', 'destination', 'account', 'epoch'])(
    'preserves standalone scope %s refusal without upsert',
    async (kind) => {
      const f = fixture(),
        scope = ensureScope(f);
      if (kind === 'destination')
        f.tx.credential.findFirst.mockResolvedValue(null);
      if (kind === 'account')
        f.tx.contentLearningAccount.findFirst.mockResolvedValue(null);
      if (kind === 'epoch') f.account.epoch = 2;
      const descriptor: LearningCellDescriptor =
        kind === 'descriptor' ? { ...f.descriptor } : f.descriptor;
      if (kind === 'descriptor')
        Object.assign(descriptor, { configVersion: 'invalid' });
      await expect(
        f.scopes.ensure(undefined, scope, descriptor, 1),
      ).rejects.toThrow(
        kind === 'descriptor'
          ? 'Immutable registered cell descriptor required'
          : kind === 'destination'
            ? 'Descriptor destination mismatch'
            : 'Account epoch changed',
      );
      expect(f.tx.contentLearningScopeState.upsert).not.toHaveBeenCalled();
      expect(f.root.$transaction).toHaveBeenCalledTimes(1);
      expect(f.tx.contentLearningAccount.upsert).not.toHaveBeenCalled();
    },
  );
  it.each(['revoke', 'grant', 'no-prior', 'replay'])(
    'keeps exact scoped consent invalidation and exclusive transaction for %s',
    async (kind) => {
      const f = fixture(),
        actor = { organizationId: 'org', actorId: 'user' },
        body = {
          enabled: kind === 'grant',
          noticeVersion: 'notice-v1',
          expectedRevision: 3,
          requestId: 'sharing-request',
        };
      if (kind !== 'no-prior')
        f.tx.contentLearningConsent.findFirst.mockResolvedValue({
          id: 'prior-consent',
          version: 2,
        });
      const result = await f.service.sharing(actor, 'credential', body);
      if (kind === 'replay') {
        f.tx.contentLearningOperation.findFirst.mockResolvedValue(result);
        expect(await f.service.sharing(actor, 'credential', body)).toBe(result);
      }
      expect(f.tx.contentLearningConsent.findFirst).toHaveBeenCalledWith({
        where: {
          organizationId: 'org',
          accountId: 'account',
          isDeleted: false,
        },
        orderBy: { version: 'desc' },
      });
      if (kind === 'grant' || kind === 'no-prior')
        expect(f.dependencies.invalidate).not.toHaveBeenCalled();
      else {
        expect(f.dependencies.invalidate).toHaveBeenCalledTimes(1);
        expect(f.dependencies.invalidate).toHaveBeenCalledWith(
          'consent',
          'prior-consent',
          f.tx,
          actor.organizationId,
        );
        expect(
          f.tx.contentLearningConsent.findFirst.mock.invocationCallOrder[0],
        ).toBeLessThan(f.dependencies.invalidate.mock.invocationCallOrder[0]);
      }
      const sql = f.tx.$queryRaw.mock.calls.map(([parts]) => parts.join(''));
      expect(sql[0]).toContain('pg_advisory_xact_lock_shared');
      expect(sql[1]).toContain('pg_advisory_xact_lock(');
      expect(sql[2]).toContain('content_learning_accounts');
      expect(f.tx.$transaction).not.toHaveBeenCalled();
      expect(f.tx.contentLearningConsent.create).toHaveBeenCalledTimes(1);
    },
  );
});
