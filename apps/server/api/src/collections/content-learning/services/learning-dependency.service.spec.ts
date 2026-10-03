import {
  buildArtifactContentDigest,
  projectPostArtifactMaterial,
  readArtifactRecord,
} from '@api/agent-artifacts/agent-artifact-material.util';
import {
  invalidateLearningDependencySource,
  LEARNING_FENCE_WAIT_ALERT_MS,
  LearningDependencyService,
  LearningFenceEscalationError,
  learningFence,
  learningMutationFence,
  learningOrgFence,
  withLearningFenceEscalation,
} from '@api/collections/content-learning/services/learning-dependency.service';
import { learningHash } from '@api/collections/content-learning/services/learning-operation.service';
import {
  learningPublicationDependencyRefsV1,
  learningPublicationFinalizationVersionV1,
  learningPublicationPostVersionV1,
} from '@api/collections/content-learning/services/learning-publication-source.helper';
import type {
  LearningPublicationApprovalRow,
  LearningPublicationAssociationV1,
  LearningPublicationCredentialRow,
  LearningPublicationFinalizationRow,
  LearningPublicationPinRow,
  LearningPublicationPostRow,
} from '@api/collections/content-learning/services/learning-publication-source.types';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  Platform,
  PostCategory,
  PostFormat,
  PostVisibility,
  PublishApprovalStatus,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { LearningCellDescriptor } from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import {
  learningDescriptorTuple,
  learningRegisteredProfiles,
} from '@genfeedai/harness';
import type {
  ContentLearningBaseline,
  ContentLearningCheckpoint,
  ContentLearningDependency,
  ContentVersionPin,
  Post,
  Prisma,
} from '@genfeedai/prisma';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
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

function sourcePublication(index: number, cell: LearningCellDescriptor) {
  const published = new Date('2026-09-28T12:00:00Z'),
    cutoff = new Date('2026-09-30T12:00:00Z');
  const postId = `post-${String(index).padStart(3, '0')}`;
  const post: LearningPublicationPostRow &
    Pick<Post, 'learningDecisionId' | 'updatedAt'> = {
    id: postId,
    organizationId: 'org',
    brandId: 'brand',
    credentialId: 'credential',
    isDeleted: false,
    category: PostCategory.TEXT,
    description: `content-${index}`,
    entityArticleId: null,
    entityIngredientId: null,
    entityModel: null,
    groupId: null,
    isRepeat: false,
    isShareToFeedSelected: true,
    label: null,
    maxRepeats: null,
    nextScheduledDate: null,
    order: 0,
    originalPostId: null,
    parentId: null,
    platform: Platform.TWITTER,
    publishIntent: null,
    quoteTweetId: null,
    repeatDaysOfWeek: [],
    repeatEndDate: null,
    repeatFrequency: null,
    repeatInterval: null,
    scheduleSlot: null,
    scheduledDate: null,
    targetAttachments: [],
    targetSettings: {},
    timezone: 'UTC',
    variantId: null,
    format: PostFormat.STANDARD,
    visibility: PostVisibility.PUBLIC,
    targetExecutionState: TargetExecutionState.PUBLISHED,
    externalId: `external-${index}`,
    publishedAt: published,
    publishApprovalId: `approval-${index}`,
    reviewVersionPinId: `pin-${index}`,
    _count: { ingredients: 0, children: 0 },
    learningDecisionId: null,
    updatedAt: cutoff,
  };
  const pin: LearningPublicationPinRow = {
    id: `pin-${index}`,
    organizationId: 'org',
    brandId: 'brand',
    recordKind: 'post',
    recordId: postId,
    contentDigest: buildArtifactContentDigest({
      ...projectPostArtifactMaterial(
        readArtifactRecord({ ...post, ingredients: [] }),
      ),
      children: [],
    }),
  };
  const approval: LearningPublicationApprovalRow = {
    id: `approval-${index}`,
    organizationId: 'org',
    brandId: 'brand',
    postId,
    artifactVersionPinId: pin.id,
    operationId: `operation-${index}`,
    status: PublishApprovalStatus.PUBLISHED,
    invalidatedAt: null,
    scopeDigest: `scope-${index}`,
  };
  const association: LearningPublicationAssociationV1 = {
    version: 1,
    organizationId: 'org',
    brandId: 'brand',
    credentialId: 'credential',
    postId,
    approvalId: approval.id,
    approvalOperationId: approval.operationId,
    versionPinId: pin.id,
    platform: Platform.TWITTER,
    externalId: `external-${index}`,
    publishedAt: published.toISOString(),
    contentDigest: pin.contentDigest,
    postSourceVersion: learningPublicationPostVersionV1({
      organizationId: 'org',
      brandId: 'brand',
      credentialId: 'credential',
      postId,
      platform: Platform.TWITTER,
      externalId: `external-${index}`,
      publishedAt: published.toISOString(),
      description: post.description,
    }),
  };
  const finalization: LearningPublicationFinalizationRow = {
    id: `finalization-${index}`,
    organizationId: 'org',
    postId,
    result: {
      success: true,
      isProviderDraft: false,
      executionState: 'published',
      platform: 'twitter',
      externalId: `external-${index}`,
      learningPublication: { ...association },
    },
  };
  const checkpoint: ContentLearningCheckpoint = {
    id: `checkpoint-${String(index).padStart(3, '0')}`,
    isDeleted: false,
    createdAt: cutoff,
    updatedAt: cutoff,
    organizationId: 'org',
    brandId: 'brand',
    credentialId: 'credential',
    postId,
    windowId: '48h-v1',
    revision: 1,
    sourceAttemptId: `attempt-${index}`,
    dueAt: cutoff,
    requestStartedAt: cutoff,
    receivedAt: cutoff,
    providerAsOf: null,
    sourceAnalyticsId: `analytics-${index}`,
    measurement: {
      collection: { version: 1, outcome: 'observed', reasonCode: null },
      measurement: { exposure: 1000 + index, weightedActions: index },
      profiles: [
        {
          profileId: learningHash(learningDescriptorTuple(cell)),
          descriptor: { ...structuredClone(cell) },
          measurement: { exposure: 1000 + index, weightedActions: index },
        },
      ],
    },
    format: 'text',
    publishedAt: published,
    organicProvenance: { isPaid: false, isPinned: false, source: 'provider' },
    sourceFingerprint: `fingerprint-${index}`,
    supersedesId: null,
    validity: 'valid',
    attestation: null,
  };
  const refs = learningPublicationDependencyRefsV1({
    ...association,
    finalizationId: finalization.id,
    finalizationVersion: learningPublicationFinalizationVersionV1(association),
    approvalVersion: learningHash([
      'learning-publication-approval-v1',
      'org',
      'brand',
      postId,
      approval.id,
      approval.operationId,
      pin.id,
      pin.contentDigest,
      approval.scopeDigest,
    ]),
  });
  const edges = refs.map(
    (ref, i): ContentLearningDependency => ({
      id: `source-${index}-${i}`,
      isDeleted: false,
      createdAt: cutoff,
      updatedAt: cutoff,
      sourceKind: ref.kind,
      sourceId: ref.id,
      sourceOrganizationId: ref.organizationId,
      sourceVersion: ref.version,
      derivedKind: 'checkpoint',
      derivedId: checkpoint.id,
      derivedOrganizationId: 'org',
      valid: true,
      invalidatedAt: null,
    }),
  );
  return { post, pin, approval, finalization, checkpoint, edges };
}

async function sourceFixture() {
  const cell = learningRegisteredProfiles('twitter', 'text', 'awareness')[0]
    ?.descriptor;
  if (!cell) throw new Error('Missing descriptor');
  const item = sourcePublication(0, cell);
  const organization = { id: 'org', isDeleted: false },
    brand = {
      id: 'brand',
      organizationId: 'org',
      isDeleted: false,
      isActive: true,
    },
    credential: LearningPublicationCredentialRow = {
      id: 'credential',
      organizationId: 'org',
      brandId: 'brand',
      isDeleted: false,
      isConnected: true,
      platform: 'TWITTER',
    };
  const blocked = vi.fn(() => {
    throw new Error('Forbidden source write or transaction');
  });
  const delegates = {
    organization: {
      findFirst: vi.fn(async () => structuredClone(organization)),
    },
    brand: { findFirst: vi.fn(async () => structuredClone(brand)) },
    credential: { findFirst: vi.fn(async () => structuredClone(credential)) },
    post: {
      findFirst: vi.fn(async () => structuredClone(item.post)),
      update: blocked,
    },
    publishApproval: {
      findFirst: vi.fn(async () => structuredClone(item.approval)),
    },
    contentVersionPin: {
      findFirst: vi.fn(async () => structuredClone(item.pin)),
    },
    postPublishFinalization: {
      findFirst: vi.fn(async () => structuredClone(item.finalization)),
    },
    contentLearningCheckpoint: {
      findFirst: vi.fn(async () => structuredClone(item.checkpoint)),
    },
    contentLearningDependency: {
      findMany: vi.fn(
        async (args: Prisma.ContentLearningDependencyFindManyArgs) =>
          item.edges.filter(
            (edge) =>
              edge.derivedKind === args.where?.derivedKind &&
              edge.derivedId === args.where?.derivedId,
          ),
      ),
      create: blocked,
      updateMany: blocked,
    },
    $transaction: blocked,
    $queryRaw: blocked,
  };
  const module = await Test.createTestingModule({
    providers: [{ provide: PrismaService, useValue: delegates }],
  }).compile();
  const tx = module.get<PrismaService>(PrismaService);
  return {
    ...item,
    organization,
    brand,
    credential,
    tx,
    blocked,
    service: new LearningDependencyService(tx),
  };
}
describe('C1 current pinned publication and parent consumers', () => {
  it('reads a newly reached immutable pin once while checking its edge version', async () => {
    const f = await sourceFixture();
    const edge = f.edges.find(
      (item) => item.sourceKind === 'content_version_pin',
    );
    if (!edge) throw new Error('Missing immutable pin edge');
    f.edges.splice(0, f.edges.length, edge);
    expect(
      await f.service.valid('checkpoint', f.checkpoint.id, f.tx, 'org'),
    ).toBe(true);
    expect(f.tx.contentVersionPin.findFirst).toHaveBeenCalledTimes(1);
    expect(f.tx.contentVersionPin.findFirst).toHaveBeenCalledWith({
      where: { id: edge.sourceId, organizationId: 'org' },
    });
    expect(f.blocked).not.toHaveBeenCalled();
  });

  it('rechecks a previously visited pin and rejects a changed version', async () => {
    const f = await sourceFixture();
    const edge = f.edges.find(
      (item) => item.sourceKind === 'content_version_pin',
    );
    if (!edge) throw new Error('Missing immutable pin edge');
    f.edges.splice(0, f.edges.length, edge, { ...edge, id: 'second-pin-edge' });
    const pin: ContentVersionPin = {
      ...f.pin,
      createdAt: at,
      recordVersion: null,
      createdByUserId: 'actor',
      idempotencyKey: 'pin-recheck-fixture',
      provenance: {},
    };
    vi.mocked(f.tx.contentVersionPin.findFirst)
      .mockResolvedValueOnce(pin)
      .mockResolvedValueOnce({ ...pin, contentDigest: 'changed-version' });
    expect(
      await f.service.valid('checkpoint', f.checkpoint.id, f.tx, 'org'),
    ).toBe(false);
    expect(f.tx.contentVersionPin.findFirst).toHaveBeenCalledTimes(2);
    expect(f.blocked).not.toHaveBeenCalled();
  });

  it.each([null, '', '   '])(
    'refuses a credential parent with missing brand %j before querying a brand',
    async (brandId) => {
      const f = await sourceFixture();
      f.credential.brandId = brandId;
      await expect(
        f.service.resolve('credential', 'credential', 'org', f.tx),
      ).rejects.toThrow('Pinned dependency identity unavailable');
      expect(f.tx.brand.findFirst).not.toHaveBeenCalled();
      expect(f.blocked).not.toHaveBeenCalled();
    },
  );

  it('uses current canonical versions and preserves immutable pins/config under the actual resolver', async () => {
    const f = await sourceFixture();
    for (const kind of [
      'post',
      'publish_approval',
      'post_publish_finalization',
      'content_version_pin',
    ] as const) {
      const edge = f.edges.find((item) => item.sourceKind === kind);
      if (!edge) throw new Error('Missing current source');
      expect(await f.service.resolve(kind, edge.sourceId, 'org', f.tx)).toEqual(
        {
          kind,
          id: edge.sourceId,
          organizationId: 'org',
          version: edge.sourceVersion,
        },
      );
    }
    const config = f.edges.find((item) => item.sourceKind === 'config');
    if (!config) throw new Error('Missing config');
    expect(
      await f.service.resolve('config', config.sourceId, null, f.tx),
    ).toEqual({
      kind: 'config',
      id: config.sourceId,
      organizationId: null,
      version: config.sourceVersion,
    });
    expect(
      await f.service.valid('checkpoint', f.checkpoint.id, f.tx, 'org'),
    ).toBe(true);
    expect(f.blocked).not.toHaveBeenCalled();
  });
  it('fails closed on raw-ID Post ancestry without mutating old edges', async () => {
    const f = await sourceFixture(),
      edge = f.edges.find((item) => item.sourceKind === 'post');
    if (!edge) throw new Error('Missing post edge');
    edge.sourceVersion = f.post.id;
    const before = structuredClone(f.edges);
    expect(
      await f.service.valid('checkpoint', f.checkpoint.id, f.tx, 'org'),
    ).toBe(false);
    expect(f.edges).toEqual(before);
    expect(f.blocked).not.toHaveBeenCalled();
  });
  it.each([
    'approved',
    'executing',
    'legacy',
    'revoked',
    'disconnected',
    'inactive',
    'deleted-org',
    'wrong-brand',
    'wrong-credential',
  ])(
    'rejects %s current publication or parent authority without writes',
    async (mutation) => {
      const f = await sourceFixture();
      if (mutation === 'approved')
        f.approval.status = PublishApprovalStatus.APPROVED;
      if (mutation === 'executing')
        f.approval.status = PublishApprovalStatus.EXECUTING;
      if (mutation === 'legacy') f.finalization.result = { success: true };
      if (mutation === 'revoked') f.approval.invalidatedAt = new Date();
      if (mutation === 'disconnected') f.credential.isConnected = false;
      if (mutation === 'inactive') f.brand.isActive = false;
      if (mutation === 'deleted-org') f.organization.isDeleted = true;
      if (mutation === 'wrong-brand') f.brand.organizationId = 'foreign';
      if (mutation === 'wrong-credential')
        f.credential.organizationId = 'foreign';
      await expect(
        f.service.resolve('post', f.post.id, 'org', f.tx),
      ).rejects.toThrow('Pinned dependency identity unavailable');
      expect(
        await f.service.valid('checkpoint', f.checkpoint.id, f.tx, 'org'),
      ).toBe(false);
      expect(f.blocked).not.toHaveBeenCalled();
    },
  );
  it('retains exact versions across label/schedule and finalization bookkeeping changes', async () => {
    const f = await sourceFixture(),
      before = await f.service.resolve('post', f.post.id, 'org', f.tx);
    f.post.label = 'maintenance';
    f.post.scheduledDate = new Date();
    Object.assign(f.finalization, {
      completedAt: new Date(),
      source: 'maintenance',
    });
    expect(await f.service.resolve('post', f.post.id, 'org', f.tx)).toEqual(
      before,
    );
    expect(
      await f.service.valid('checkpoint', f.checkpoint.id, f.tx, 'org'),
    ).toBe(true);
    f.post.description += ' changed';
    expect(
      await f.service.valid('checkpoint', f.checkpoint.id, f.tx, 'org'),
    ).toBe(false);
  });
});

describe('per-organization learning fence (#5882)', () => {
  function fenceClient(
    edges: Array<{
      derivedKind: string;
      derivedOrganizationId: string | null;
      sourceOrganizationId: string | null;
    }> = [],
  ) {
    const sql: string[] = [];
    const queue = [...edges];
    const tx = {
      $queryRaw: vi.fn(
        async (strings: TemplateStringsArray, ...values: unknown[]) => {
          sql.push(
            strings.reduce(
              (text, part, index) =>
                `${text}${part}${index < values.length ? String(values[index]) : ''}`,
              '',
            ),
          );
          return [];
        },
      ),
      contentLearningDependency: {
        findMany: vi.fn(async () =>
          queue.splice(0).map((edge, index) => ({
            id: `edge-${index}`,
            derivedId: `derived-${index}`,
            ...edge,
          })),
        ),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      contentLearningDataset: { updateMany: vi.fn() },
      contentLearningRun: { updateMany: vi.fn() },
      contentLearningSharedPolicy: { updateMany: vi.fn() },
      contentLearningRelease: { updateMany: vi.fn() },
      contentLearningBaseline: { updateMany: vi.fn() },
      contentLearningReward: { updateMany: vi.fn() },
      contentLearningPolicyVersion: { updateMany: vi.fn() },
    };
    return { sql, tx: tx as unknown as Prisma.TransactionClient, raw: tx };
  }

  it('takes the global shared fence before deduplicated organization keys in ascending order', async () => {
    const { sql, tx } = fenceClient();
    await learningOrgFence(tx, ['org-b', 'org-a', 'org-b', ' '], 'shared');
    expect(sql).toEqual([
      'SELECT pg_advisory_xact_lock_shared(5728, 1)::text',
      'SELECT pg_advisory_xact_lock_shared(5729::int, hashtext(org-a))::text',
      'SELECT pg_advisory_xact_lock_shared(5729::int, hashtext(org-b))::text',
    ]);
  });

  it('takes an exclusive organization key under the shared global fence', async () => {
    const { sql, tx } = fenceClient();
    await learningMutationFence(tx, 'org-a', 'organization');
    expect(sql).toEqual([
      'SELECT pg_advisory_xact_lock_shared(5728, 1)::text',
      'SELECT pg_advisory_xact_lock(5729::int, hashtext(org-a))::text',
    ]);
    const global = fenceClient();
    await learningMutationFence(global.tx, 'org-a', 'global');
    expect(global.sql).toEqual(['SELECT pg_advisory_xact_lock(5728, 1)::text']);
  });

  it('refuses an organization fence without an organization', async () => {
    const { sql, tx } = fenceClient();
    await expect(learningOrgFence(tx, [], 'shared')).rejects.toThrow(
      'Learning organization fence scope required',
    );
    expect(sql).toEqual([]);
  });

  it.each([
    {
      label: 'a global learning kind',
      edge: {
        derivedKind: 'dataset',
        derivedOrganizationId: null,
        sourceOrganizationId: 'org-a',
      },
    },
    {
      label: 'another organization',
      edge: {
        derivedKind: 'decision',
        derivedOrganizationId: 'org-b',
        sourceOrganizationId: 'org-a',
      },
    },
  ])(
    'escalates an organization-fenced invalidation that reaches $label before writing',
    async ({ edge }) => {
      const { tx, raw } = fenceClient([edge]);
      await learningMutationFence(tx, 'org-a', 'organization');
      await expect(
        invalidateLearningDependencySource(tx, 'post', 'post-1', 'org-a'),
      ).rejects.toBeInstanceOf(LearningFenceEscalationError);
      expect(raw.contentLearningDependency.updateMany).not.toHaveBeenCalled();
    },
  );

  it('lets the global fence invalidate global and same-organization descendants', async () => {
    const { tx, raw } = fenceClient([
      {
        derivedKind: 'dataset',
        derivedOrganizationId: null,
        sourceOrganizationId: 'org-a',
      },
    ]);
    await learningFence(tx, 'exclusive');
    await expect(
      invalidateLearningDependencySource(tx, 'post', 'post-1', 'org-a'),
    ).resolves.toBeGreaterThan(0);
    expect(raw.contentLearningDataset.updateMany).toHaveBeenCalled();
    const sameOrganization = fenceClient([
      {
        derivedKind: 'decision',
        derivedOrganizationId: 'org-a',
        sourceOrganizationId: 'org-a',
      },
    ]);
    await learningMutationFence(sameOrganization.tx, 'org-a', 'organization');
    await expect(
      invalidateLearningDependencySource(
        sameOrganization.tx,
        'post',
        'post-1',
        'org-a',
      ),
    ).resolves.toBeGreaterThan(0);
  });

  it('reruns an escalated mutation once under the global fence', async () => {
    const scopes: string[] = [];
    await expect(
      withLearningFenceEscalation(async (scope) => {
        scopes.push(scope);
        if (scope === 'organization') throw new LearningFenceEscalationError();
        return 'done';
      }),
    ).resolves.toBe('done');
    expect(scopes).toEqual(['organization', 'global']);
    const failure = new Error('unrelated');
    await expect(
      withLearningFenceEscalation(async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
  });

  it('warns when a fence wait reaches the alert threshold', async () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    const now = vi
      .spyOn(performance, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(LEARNING_FENCE_WAIT_ALERT_MS + 5);
    try {
      await learningOrgFence(fenceClient().tx, 'org-a', 'exclusive');
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('learning fence wait'),
        expect.objectContaining({ mode: 'exclusive', scope: 'organization' }),
      );
    } finally {
      now.mockRestore();
      warn.mockRestore();
    }
  });
});
