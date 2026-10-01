import {
  invalidateLearningDependencySource,
  LearningDependencyService,
} from '@api/collections/content-learning/services/learning-dependency.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  ContentLearningBaseline,
  ContentLearningDependency,
  Prisma,
} from '@genfeedai/prisma';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class {},
}));
const at = new Date('2026-10-01T00:00:00Z');
function baseline(
  overrides: Partial<ContentLearningBaseline> = {},
): ContentLearningBaseline {
  return {
    id: 'baseline',
    organizationId: 'org',
    brandId: 'brand',
    credentialId: 'credential',
    isDeleted: false,
    createdAt: at,
    updatedAt: at,
    fingerprint: 'immutable-fingerprint',
    scopeKey: 'immutable-scope',
    cellDescriptor: { configVersion: 'rl-reward-v1-experimental' },
    descriptorHash: 'immutable-descriptor-hash',
    cutoff: at,
    snapshotEvidenceRevision: null,
    snapshotEpoch: null,
    expiresAt: null,
    configVersion: 'rl-reward-v1-experimental',
    contributorCheckpointIds: ['checkpoint'],
    contributorRevisions: [2],
    count: 1,
    medianExposure: 1000,
    samples: [{ exposure: 1000, weightedActions: 0 }],
    validity: 'insufficient_baseline',
    ...overrides,
  };
}
function edge(
  sourceKind: string,
  sourceId: string,
  derivedKind: string,
  derivedId: string,
  overrides: Partial<ContentLearningDependency> = {},
): ContentLearningDependency {
  return {
    id: `${sourceKind}-${sourceId}-${derivedKind}-${derivedId}`,
    isDeleted: false,
    createdAt: at,
    updatedAt: at,
    sourceKind,
    sourceId,
    sourceOrganizationId: 'org',
    sourceVersion: '2',
    derivedKind,
    derivedId,
    derivedOrganizationId: 'org',
    valid: true,
    invalidatedAt: null,
    ...overrides,
  };
}
function fixture(
  edges: ContentLearningDependency[],
  row: ContentLearningBaseline | null = baseline(),
) {
  const tx = {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    contentLearningDependency: {
      findMany: vi
        .fn()
        .mockImplementation(
          ({ where }: { where: Prisma.ContentLearningDependencyWhereInput }) =>
            edges
              .filter(
                (item) =>
                  !item.isDeleted &&
                  item.sourceKind === where.sourceKind &&
                  item.sourceId === where.sourceId &&
                  (where.sourceOrganizationId === undefined ||
                    item.sourceOrganizationId === where.sourceOrganizationId),
              )
              .sort((a, b) => a.id.localeCompare(b.id)),
        ),
      updateMany: vi
        .fn()
        .mockImplementation(
          ({ where, data }: Prisma.ContentLearningDependencyUpdateManyArgs) => {
            const item = edges.find((candidate) => candidate.id === where?.id);
            if (item) Object.assign(item, data);
            return { count: item ? 1 : 0 };
          },
        ),
    },
    contentLearningBaseline: {
      updateMany: vi
        .fn()
        .mockImplementation(
          ({ where, data }: Prisma.ContentLearningBaselineUpdateManyArgs) => {
            const matches =
              row &&
              !row.isDeleted &&
              row.id === where?.id &&
              row.organizationId === where?.organizationId;
            if (matches) Object.assign(row, data);
            return { count: matches ? 1 : 0 };
          },
        ),
    },
    contentLearningReward: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    contentLearningPolicyVersion: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    contentLearningDataset: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    contentLearningRun: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    contentLearningSharedPolicy: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    contentLearningRelease: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const prisma = {
    $transaction: vi.fn(),
    contentLearningDependency: { findMany: vi.fn() },
  };
  return {
    tx,
    client: tx as unknown as Prisma.TransactionClient,
    prisma,
    row,
    service: new LearningDependencyService(prisma as unknown as PrismaService),
    assertSuppliedClientOnly() {
      expect(tx.$transaction).not.toHaveBeenCalled();
      expect(tx.$queryRaw).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.contentLearningDependency.findMany).not.toHaveBeenCalled();
    },
  };
}
function chain() {
  return [
    edge('checkpoint', 'checkpoint', 'baseline', 'baseline'),
    edge('baseline', 'baseline', 'decision', 'decision'),
    edge('decision', 'decision', 'reward', 'reward'),
    edge('reward', 'reward', 'policy', 'policy'),
  ];
}
describe('explicitly scoped baseline descendant invalidation', () => {
  it.each(['valid', 'insufficient_baseline'])(
    'stamps %s baseline without rewriting immutable contents and preserves downstream traversal',
    async (validity) => {
      const row = baseline({ validity }),
        before = structuredClone(row),
        f = fixture(chain(), row);
      expect(
        await f.service.invalidate('checkpoint', 'checkpoint', f.client, 'org'),
      ).toBe(5);
      expect(row).toEqual({ ...before, validity: 'invalid_source' });
      expect(f.tx.contentLearningBaseline.updateMany).toHaveBeenCalledWith({
        where: { id: 'baseline', organizationId: 'org', isDeleted: false },
        data: { validity: 'invalid_source' },
      });
      expect(f.tx.contentLearningReward.updateMany).toHaveBeenCalledWith({
        where: { id: 'reward', organizationId: 'org', isDeleted: false },
        data: { status: 'invalid_baseline' },
      });
      expect(f.tx.contentLearningPolicyVersion.updateMany).toHaveBeenCalledWith(
        {
          where: { id: 'policy', organizationId: 'org', isDeleted: false },
          data: { state: 'invalid' },
        },
      );
      expect(f.tx.contentLearningDependency.updateMany).toHaveBeenCalledTimes(
        4,
      );
      expect(
        f.tx.contentLearningDependency.updateMany.mock.invocationCallOrder[0],
      ).toBeLessThan(
        f.tx.contentLearningBaseline.updateMany.mock.invocationCallOrder[0],
      );
      f.assertSuppliedClientOnly();
    },
  );
  it.each(['missing', 'deleted'])(
    'continues baseline descendants when the baseline row is %s',
    async (kind) => {
      const f = fixture(
        chain(),
        kind === 'missing' ? null : baseline({ isDeleted: true }),
      );
      expect(
        await f.service.invalidate('checkpoint', 'checkpoint', f.client, 'org'),
      ).toBe(5);
      expect(
        f.tx.contentLearningBaseline.updateMany.mock.results[0].value,
      ).toEqual({ count: 0 });
      expect(f.tx.contentLearningReward.updateMany).toHaveBeenCalledTimes(1);
      expect(
        f.tx.contentLearningPolicyVersion.updateMany,
      ).toHaveBeenCalledTimes(1);
      f.assertSuppliedClientOnly();
    },
  );
  it.each([
    {
      label: 'undefined initiating tenant',
      organizationId: undefined,
      derivedOrganizationId: 'org',
    },
    {
      label: 'null initiating tenant',
      organizationId: null,
      derivedOrganizationId: 'org',
    },
    {
      label: 'empty initiating tenant',
      organizationId: '',
      derivedOrganizationId: 'org',
    },
    {
      label: 'blank initiating tenant',
      organizationId: ' ',
      derivedOrganizationId: 'org',
    },
    {
      label: 'missing derived tenant',
      organizationId: 'org',
      derivedOrganizationId: null,
    },
    {
      label: 'empty derived tenant',
      organizationId: 'org',
      derivedOrganizationId: '',
    },
    {
      label: 'blank derived tenant',
      organizationId: 'org',
      derivedOrganizationId: ' ',
    },
    {
      label: 'foreign derived tenant',
      organizationId: 'org',
      derivedOrganizationId: 'foreign',
    },
  ])(
    'does not acquire a baseline write from $label',
    async ({ organizationId, derivedOrganizationId }) => {
      const links = [
        edge('checkpoint', 'checkpoint', 'baseline', 'baseline', {
          sourceOrganizationId: organizationId ?? 'org',
          derivedOrganizationId,
        }),
      ];
      const f = fixture(links);
      // Keep the edge reachable even for invalid legacy initiating scopes.
      links[0].sourceOrganizationId =
        organizationId === undefined ? 'org' : organizationId;
      expect(
        await f.service.invalidate(
          'checkpoint',
          'checkpoint',
          f.client,
          organizationId,
        ),
      ).toBe(2);
      expect(f.tx.contentLearningBaseline.updateMany).not.toHaveBeenCalled();
      expect(f.tx.contentLearningDependency.updateMany).toHaveBeenCalledTimes(
        1,
      );
      expect(f.tx.contentLearningDependency.findMany).toHaveBeenLastCalledWith({
        where: {
          sourceKind: 'baseline',
          sourceId: 'baseline',
          sourceOrganizationId: derivedOrganizationId,
          isDeleted: false,
        },
        orderBy: { id: 'asc' },
      });
      f.assertSuppliedClientOnly();
    },
  );
  it('allows an explicit global null source to stamp the exact derived tenant', async () => {
    const f = fixture([
      edge('config', 'config', 'baseline', 'baseline', {
        sourceOrganizationId: null,
      }),
    ]);
    expect(await f.service.invalidate('config', 'config', f.client, null)).toBe(
      2,
    );
    expect(f.row?.validity).toBe('invalid_source');
    expect(f.tx.contentLearningBaseline.updateMany).toHaveBeenCalledWith({
      where: { id: 'baseline', organizationId: 'org', isDeleted: false },
      data: { validity: 'invalid_source' },
    });
    f.assertSuppliedClientOnly();
  });
  it.each([undefined, 'org'])(
    'rejects a global source with non-null organization %s for the new write',
    async (organizationId) => {
      const f = fixture([
        edge('config', 'config', 'baseline', 'baseline', {
          sourceOrganizationId: organizationId ?? null,
        }),
      ]);
      expect(
        await f.service.invalidate(
          'config',
          'config',
          f.client,
          organizationId,
        ),
      ).toBe(2);
      expect(f.tx.contentLearningBaseline.updateMany).not.toHaveBeenCalled();
      expect(f.tx.contentLearningDependency.updateMany).toHaveBeenCalledTimes(
        1,
      );
      f.assertSuppliedClientOnly();
    },
  );
  it('rejects a baseline reached through a foreign tenant traversal node even from an explicit global source', async () => {
    const f = fixture([
      edge('config', 'config', 'decision', 'foreign-decision', {
        sourceOrganizationId: null,
        derivedOrganizationId: 'foreign',
      }),
      edge('decision', 'foreign-decision', 'baseline', 'baseline', {
        sourceOrganizationId: 'foreign',
      }),
    ]);
    expect(await f.service.invalidate('config', 'config', f.client, null)).toBe(
      3,
    );
    expect(f.tx.contentLearningBaseline.updateMany).not.toHaveBeenCalled();
    expect(f.tx.contentLearningDependency.updateMany).toHaveBeenCalledTimes(2);
    f.assertSuppliedClientOnly();
  });
  it('allows an explicitly global intermediate node while retaining initiating tenant authority', async () => {
    const f = fixture([
      edge('checkpoint', 'checkpoint', 'config', 'config', {
        derivedOrganizationId: null,
      }),
      edge('config', 'config', 'baseline', 'baseline', {
        sourceOrganizationId: null,
      }),
    ]);
    expect(
      await f.service.invalidate('checkpoint', 'checkpoint', f.client, 'org'),
    ).toBe(3);
    expect(f.row?.validity).toBe('invalid_source');
    f.assertSuppliedClientOnly();
  });
  it('terminates repeated/cyclic edges and keeps baseline contents stable across invalidations', async () => {
    const links = [
      ...chain(),
      edge('policy', 'policy', 'baseline', 'baseline'),
      edge('baseline', 'baseline', 'decision', 'decision', {
        id: 'duplicate-edge',
      }),
    ];
    const row = baseline(),
      before = structuredClone(row),
      f = fixture(links, row);
    for (let count = 0; count < 2; count++)
      expect(
        await f.service.invalidate('checkpoint', 'checkpoint', f.client, 'org'),
      ).toBe(5);
    expect(row).toEqual({ ...before, validity: 'invalid_source' });
    expect(f.tx.contentLearningDependency.updateMany).toHaveBeenCalledTimes(12);
    expect(f.tx.contentLearningReward.updateMany).toHaveBeenCalledTimes(2);
    expect(f.tx.contentLearningPolicyVersion.updateMany).toHaveBeenCalledTimes(
      2,
    );
    f.assertSuppliedClientOnly();
  });
  it('propagates downstream update failure through the supplied client without swallowing it or nesting a transaction', async () => {
    const f = fixture(chain()),
      failure = new Error('reward update failed');
    f.tx.contentLearningReward.updateMany.mockRejectedValue(failure);
    await expect(
      f.service.invalidate('checkpoint', 'checkpoint', f.client, 'org'),
    ).rejects.toBe(failure);
    expect(f.tx.contentLearningBaseline.updateMany).toHaveBeenCalledTimes(1);
    expect(f.tx.contentLearningPolicyVersion.updateMany).not.toHaveBeenCalled();
    // These mocks prove propagation and client usage, not real database rollback.
    f.assertSuppliedClientOnly();
  });
});

function expectParity(
  direct: ReturnType<typeof fixture>,
  delegated: ReturnType<typeof fixture>,
) {
  expect(direct.row).toEqual(delegated.row);
  expect(direct.tx.contentLearningDependency.findMany.mock.calls).toEqual(
    delegated.tx.contentLearningDependency.findMany.mock.calls,
  );
  expect(direct.tx.contentLearningDependency.updateMany.mock.calls).toEqual(
    delegated.tx.contentLearningDependency.updateMany.mock.calls,
  );
  expect(direct.tx.contentLearningBaseline.updateMany.mock.calls).toEqual(
    delegated.tx.contentLearningBaseline.updateMany.mock.calls,
  );
  expect(direct.tx.contentLearningReward.updateMany.mock.calls).toEqual(
    delegated.tx.contentLearningReward.updateMany.mock.calls,
  );
  expect(direct.tx.contentLearningPolicyVersion.updateMany.mock.calls).toEqual(
    delegated.tx.contentLearningPolicyVersion.updateMany.mock.calls,
  );
  expect(direct.tx.contentLearningDataset.updateMany.mock.calls).toEqual(
    delegated.tx.contentLearningDataset.updateMany.mock.calls,
  );
  expect(direct.tx.contentLearningRun.updateMany.mock.calls).toEqual(
    delegated.tx.contentLearningRun.updateMany.mock.calls,
  );
  expect(direct.tx.contentLearningSharedPolicy.updateMany.mock.calls).toEqual(
    delegated.tx.contentLearningSharedPolicy.updateMany.mock.calls,
  );
  expect(direct.tx.contentLearningRelease.updateMany.mock.calls).toEqual(
    delegated.tx.contentLearningRelease.updateMany.mock.calls,
  );
  direct.assertSuppliedClientOnly();
  delegated.assertSuppliedClientOnly();
}
describe('direct transaction invalidation export parity', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(at);
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it('T1 preserves tenant traversal, timestamp order and immutable baseline projection', async () => {
    const direct = fixture(chain()),
      delegated = fixture(chain()),
      before = structuredClone(direct.row);
    expect(
      await invalidateLearningDependencySource(
        direct.client,
        'checkpoint',
        'checkpoint',
        'org',
      ),
    ).toBe(5);
    expect(
      await delegated.service.invalidate(
        'checkpoint',
        'checkpoint',
        delegated.client,
        'org',
      ),
    ).toBe(5);
    expectParity(direct, delegated);
    expect(direct.row).toEqual({ ...before, validity: 'invalid_source' });
    expect(
      direct.tx.contentLearningDependency.updateMany.mock.calls.map(
        ([call]) => call,
      ),
    ).toEqual(
      chain().map((row) => ({
        where: { id: row.id, isDeleted: false },
        data: { valid: false, invalidatedAt: at },
      })),
    );
    expect(direct.tx.contentLearningReward.updateMany).toHaveBeenCalledWith({
      where: { id: 'reward', organizationId: 'org', isDeleted: false },
      data: { status: 'invalid_baseline' },
    });
    expect(
      direct.tx.contentLearningPolicyVersion.updateMany,
    ).toHaveBeenCalledWith({
      where: { id: 'policy', organizationId: 'org', isDeleted: false },
      data: { state: 'invalid' },
    });
    expect(
      direct.tx.contentLearningDependency.updateMany.mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      direct.tx.contentLearningBaseline.updateMany.mock.invocationCallOrder[0],
    );
    expect(
      direct.tx.contentLearningBaseline.updateMany.mock.invocationCallOrder[0],
    ).toBeLessThan(
      direct.tx.contentLearningReward.updateMany.mock.invocationCallOrder[0],
    );
    expect(
      direct.tx.contentLearningReward.updateMany.mock.invocationCallOrder[0],
    ).toBeLessThan(
      direct.tx.contentLearningPolicyVersion.updateMany.mock
        .invocationCallOrder[0],
    );
  });
  it('T2 preserves explicit global null and tenant baseline authority', async () => {
    const make = () =>
      fixture([
        edge('config', 'config', 'baseline', 'baseline', {
          sourceOrganizationId: null,
        }),
      ]);
    const direct = make(),
      delegated = make();
    expect(
      await invalidateLearningDependencySource(
        direct.client,
        'config',
        'config',
        null,
      ),
    ).toBe(2);
    expect(
      await delegated.service.invalidate(
        'config',
        'config',
        delegated.client,
        null,
      ),
    ).toBe(2);
    expectParity(direct, delegated);
    expect(
      direct.tx.contentLearningDependency.findMany,
    ).toHaveBeenNthCalledWith(1, {
      where: {
        sourceKind: 'config',
        sourceId: 'config',
        sourceOrganizationId: null,
        isDeleted: false,
      },
      orderBy: { id: 'asc' },
    });
    expect(direct.tx.contentLearningBaseline.updateMany).toHaveBeenCalledWith({
      where: { id: 'baseline', organizationId: 'org', isDeleted: false },
      data: { validity: 'invalid_source' },
    });
  });
  it.each([undefined, 'org'])(
    'T2 retains legacy edge filtering without baseline authority for %s',
    async (organizationId) => {
      const make = () =>
        fixture([
          edge('config', 'config', 'baseline', 'baseline', {
            sourceOrganizationId: organizationId ?? null,
          }),
        ]);
      const direct = make(),
        delegated = make();
      expect(
        await invalidateLearningDependencySource(
          direct.client,
          'config',
          'config',
          organizationId,
        ),
      ).toBe(2);
      expect(
        await delegated.service.invalidate(
          'config',
          'config',
          delegated.client,
          organizationId,
        ),
      ).toBe(2);
      expectParity(direct, delegated);
      expect(
        direct.tx.contentLearningBaseline.updateMany,
      ).not.toHaveBeenCalled();
      expect(
        direct.tx.contentLearningDependency.findMany,
      ).toHaveBeenNthCalledWith(1, {
        where: {
          sourceKind: 'config',
          sourceId: 'config',
          ...(organizationId !== undefined
            ? { sourceOrganizationId: organizationId }
            : {}),
          isDeleted: false,
        },
        orderBy: { id: 'asc' },
      });
    },
  );
  it('T3 rejects an unknown kind without any delegate, fence or transaction work', async () => {
    const direct = fixture(chain()),
      delegated = fixture(chain());
    expect(
      await invalidateLearningDependencySource(
        direct.client,
        'unknown',
        'checkpoint',
        'org',
      ),
    ).toBe(0);
    expect(
      await delegated.service.invalidate(
        'unknown',
        'checkpoint',
        delegated.client,
        'org',
      ),
    ).toBe(0);
    expectParity(direct, delegated);
    expect(direct.tx.contentLearningDependency.findMany).not.toHaveBeenCalled();
    expect(
      direct.tx.contentLearningDependency.updateMany,
    ).not.toHaveBeenCalled();
    expect(direct.tx.contentLearningBaseline.updateMany).not.toHaveBeenCalled();
    expect(direct.tx.contentLearningReward.updateMany).not.toHaveBeenCalled();
    expect(
      direct.tx.contentLearningPolicyVersion.updateMany,
    ).not.toHaveBeenCalled();
    expect(direct.tx.contentLearningDataset.updateMany).not.toHaveBeenCalled();
    expect(direct.tx.contentLearningRun.updateMany).not.toHaveBeenCalled();
    expect(
      direct.tx.contentLearningSharedPolicy.updateMany,
    ).not.toHaveBeenCalled();
    expect(direct.tx.contentLearningRelease.updateMany).not.toHaveBeenCalled();
  });
  it('T4 retains finite cyclic traversal and repeated invalidation writes', async () => {
    const make = () =>
      fixture([
        ...chain(),
        edge('policy', 'policy', 'baseline', 'baseline'),
        edge('baseline', 'baseline', 'decision', 'decision', {
          id: 'duplicate-edge',
        }),
      ]);
    const direct = make(),
      delegated = make(),
      before = structuredClone(direct.row);
    for (let i = 0; i < 2; i++) {
      expect(
        await invalidateLearningDependencySource(
          direct.client,
          'checkpoint',
          'checkpoint',
          'org',
        ),
      ).toBe(5);
      expect(
        await delegated.service.invalidate(
          'checkpoint',
          'checkpoint',
          delegated.client,
          'org',
        ),
      ).toBe(5);
    }
    expectParity(direct, delegated);
    expect(direct.row).toEqual({ ...before, validity: 'invalid_source' });
    expect(
      direct.tx.contentLearningDependency.updateMany,
    ).toHaveBeenCalledTimes(12);
    expect(direct.tx.contentLearningReward.updateMany).toHaveBeenCalledTimes(2);
    expect(
      direct.tx.contentLearningPolicyVersion.updateMany,
    ).toHaveBeenCalledTimes(2);
  });
  it('T5 proves downstream error propagation and client usage, not PostgreSQL rollback', async () => {
    const direct = fixture(chain()),
      delegated = fixture(chain()),
      error = new Error('reward update failed');
    direct.tx.contentLearningReward.updateMany.mockRejectedValue(error);
    delegated.tx.contentLearningReward.updateMany.mockRejectedValue(error);
    await expect(
      invalidateLearningDependencySource(
        direct.client,
        'checkpoint',
        'checkpoint',
        'org',
      ),
    ).rejects.toBe(error);
    await expect(
      delegated.service.invalidate(
        'checkpoint',
        'checkpoint',
        delegated.client,
        'org',
      ),
    ).rejects.toBe(error);
    expectParity(direct, delegated);
    expect(direct.tx.contentLearningBaseline.updateMany).toHaveBeenCalledTimes(
      1,
    );
    expect(
      direct.tx.contentLearningPolicyVersion.updateMany,
    ).not.toHaveBeenCalled();
  });
  it('T6 preserves the existing class default root client and omitted tenant filter', async () => {
    const f = fixture(chain());
    f.prisma.contentLearningDependency.findMany.mockResolvedValue([]);
    expect(await f.service.invalidate('config', 'config')).toBe(1);
    expect(f.prisma.contentLearningDependency.findMany).toHaveBeenCalledWith({
      where: { sourceKind: 'config', sourceId: 'config', isDeleted: false },
      orderBy: { id: 'asc' },
    });
    expect(f.tx.contentLearningDependency.findMany).not.toHaveBeenCalled();
    expect(f.tx.contentLearningDependency.updateMany).not.toHaveBeenCalled();
    expect(f.tx.$transaction).not.toHaveBeenCalled();
    expect(f.tx.$queryRaw).not.toHaveBeenCalled();
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
  });
  it('T7 preserves global dataset/run/shared-policy/release descendant effects', async () => {
    const make = () =>
      fixture([
        edge('config', 'config', 'dataset', 'dataset', {
          sourceOrganizationId: null,
          derivedOrganizationId: null,
        }),
        edge('dataset', 'dataset', 'run', 'run', {
          sourceOrganizationId: null,
          derivedOrganizationId: null,
        }),
        edge('run', 'run', 'shared-policy', 'shared-policy', {
          sourceOrganizationId: null,
          derivedOrganizationId: null,
        }),
        edge('shared-policy', 'shared-policy', 'release', 'release', {
          sourceOrganizationId: null,
          derivedOrganizationId: null,
        }),
      ]);
    const direct = make(),
      delegated = make();
    expect(
      await invalidateLearningDependencySource(
        direct.client,
        'config',
        'config',
        null,
      ),
    ).toBe(5);
    expect(
      await delegated.service.invalidate(
        'config',
        'config',
        delegated.client,
        null,
      ),
    ).toBe(5);
    expectParity(direct, delegated);
    expect(direct.tx.contentLearningDataset.updateMany).toHaveBeenCalledWith({
      where: { id: 'dataset', isDeleted: false },
      data: { status: 'invalidated', invalidationRevision: { increment: 1 } },
    });
    expect(direct.tx.contentLearningRun.updateMany).toHaveBeenCalledWith({
      where: { id: 'run', isDeleted: false },
      data: { status: 'invalidated' },
    });
    expect(
      direct.tx.contentLearningSharedPolicy.updateMany,
    ).toHaveBeenCalledWith({
      where: { id: 'shared-policy', isDeleted: false },
      data: { validity: 'invalid' },
    });
    expect(direct.tx.contentLearningRelease.updateMany).toHaveBeenCalledWith({
      where: { id: 'release', isDeleted: false },
      data: {
        stage: 'invalid',
        revision: { increment: 1 },
        invalidationRevision: { increment: 1 },
        activeCells: [],
      },
    });
    expect(
      direct.tx.contentLearningDependency.updateMany.mock.calls.map(
        ([call]) => call.where?.id,
      ),
    ).toEqual([
      'config-config-dataset-dataset',
      'dataset-dataset-run-run',
      'run-run-shared-policy-shared-policy',
      'shared-policy-shared-policy-release-release',
    ]);
    expect(direct.tx.contentLearningBaseline.updateMany).not.toHaveBeenCalled();
  });
});
