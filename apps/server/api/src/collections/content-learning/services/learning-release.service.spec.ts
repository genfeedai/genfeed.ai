import type { LearningDependencyService } from '@api/collections/content-learning/services/learning-dependency.service';
import { learningHash } from '@api/collections/content-learning/services/learning-operation.service';
import { LearningReleaseService } from '@api/collections/content-learning/services/learning-release.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  LearningDependencyKindV1,
  LearningDependencyRefV1,
} from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import {
  type ContentLearningRun,
  type ContentLearningSharedPolicy,
  type Prisma,
  toPrismaJson,
} from '@genfeedai/prisma';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class {},
}));

function fixture() {
  const report: Pick<
    ContentLearningRun,
    'id' | 'configHash' | 'synthetic' | 'report'
  > = {
    id: 'report',
    configHash: 'run-version',
    synthetic: false,
    report: { status: 'not-passed', synthetic: false },
  };
  const policies: Array<
    Pick<
      ContentLearningSharedPolicy,
      'id' | 'cell' | 'version' | 'synthetic' | 'validity'
    >
  > = [
    {
      id: 'B',
      cell: 'cell-B',
      version: 2,
      synthetic: false,
      validity: 'valid',
    },
    {
      id: 'A',
      cell: 'cell-A',
      version: 1,
      synthetic: false,
      validity: 'valid',
    },
  ];
  let release:
    | (Prisma.ContentLearningReleaseUncheckedCreateInput & {
        id: string;
        revision: number;
      })
    | null = null;
  const receipts: Array<
    Prisma.ContentLearningOperationUncheckedCreateInput & { id: string }
  > = [];
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    contentLearningRun: {
      findFirst: vi.fn().mockImplementation((): typeof report | null => report),
    },
    contentLearningSharedPolicy: {
      findMany: vi.fn().mockImplementation(() => policies),
    },
    contentLearningOperation: {
      findFirst: vi
        .fn()
        .mockImplementation(
          ({ where }: { where: Prisma.ContentLearningOperationWhereInput }) =>
            receipts.find(
              (row) =>
                row.organizationId === where.organizationId &&
                row.actorId === where.actorId &&
                row.requestId === where.requestId &&
                row.scope === where.scope,
            ) ?? null,
        ),
      create: vi
        .fn()
        .mockImplementation(
          ({
            data,
          }: {
            data: Prisma.ContentLearningOperationUncheckedCreateInput;
          }) => {
            const receipt = { ...data, id: `operation-${receipts.length}` };
            receipts.push(receipt);
            return receipt;
          },
        ),
    },
    contentLearningRelease: {
      create: vi
        .fn()
        .mockImplementation(
          ({
            data,
          }: {
            data: Prisma.ContentLearningReleaseUncheckedCreateInput;
          }) => {
            release = { ...data, id: 'release', revision: 0 };
            return release;
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
    contentLearningRun: { findFirst: vi.fn() },
    contentLearningSharedPolicy: { findMany: vi.fn() },
    contentLearningOperation: { findFirst: vi.fn(), create: vi.fn() },
    contentLearningRelease: { create: vi.fn() },
  };
  const dependencies = {
    valid: vi.fn().mockResolvedValue(true),
    resolve: vi.fn().mockImplementation(
      async (
        kind: LearningDependencyKindV1,
        id: string,
        organizationId: string | null,
        _client: Prisma.TransactionClient,
      ): Promise<LearningDependencyRefV1> => ({
        kind,
        id,
        organizationId,
        version:
          kind === 'run'
            ? report.configHash
            : kind === 'release'
              ? String(release?.revision)
              : String(policies.find((row) => row.id === id)?.version),
      }),
    ),
    link: vi.fn().mockResolvedValue(undefined),
  };
  const input: Parameters<LearningReleaseService['create']>[0] = {
    actorId: 'actor',
    organizationId: 'org',
    artifactIds: ['A', 'B'],
    reportId: 'report',
    requestId: 'request',
  };
  const service = new LearningReleaseService(
    root as unknown as PrismaService,
    dependencies as unknown as LearningDependencyService,
  );
  return {
    service,
    root,
    tx,
    dependencies,
    report,
    policies,
    input,
    receipts,
    release: () => release,
  };
}
function expectRootUnused(f: ReturnType<typeof fixture>) {
  expect(f.root.contentLearningRun.findFirst).not.toHaveBeenCalled();
  expect(f.root.contentLearningSharedPolicy.findMany).not.toHaveBeenCalled();
  expect(f.root.contentLearningOperation.findFirst).not.toHaveBeenCalled();
  expect(f.root.contentLearningOperation.create).not.toHaveBeenCalled();
  expect(f.root.contentLearningRelease.create).not.toHaveBeenCalled();
  expect(f.tx).not.toHaveProperty('$transaction');
}
function expectNoWrites(f: ReturnType<typeof fixture>) {
  expect(f.tx.contentLearningRelease.create).not.toHaveBeenCalled();
  expect(f.tx.contentLearningOperation.create).not.toHaveBeenCalled();
  expect(f.dependencies.link).not.toHaveBeenCalled();
}

describe('LearningReleaseService shared create entry', () => {
  it('C1 fences first and preserves global source order, salt, hash and administrative receipt', async () => {
    const f = fixture();
    const control = vi.spyOn(f.service, 'control');
    const receive = vi.spyOn(f.service, 'receive');
    const operation = await f.service.create(f.input);
    expect(operation).toBe(f.receipts[0]);
    expect(f.root.$transaction).toHaveBeenCalledTimes(1);
    expect(f.tx.$queryRaw.mock.calls[0][0].join('')).toBe(
      'SELECT pg_advisory_xact_lock_shared(5728, 1)::text',
    );
    expect(f.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      f.tx.contentLearningRun.findFirst.mock.invocationCallOrder[0],
    );
    expect(f.tx.contentLearningRun.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'report',
        type: 'evaluate',
        status: 'completed',
        isDeleted: false,
      },
    });
    expect(f.tx.contentLearningSharedPolicy.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['A', 'B'] }, isDeleted: false },
    });
    expect(f.dependencies.valid).toHaveBeenCalledWith(
      'run',
      'report',
      f.tx,
      null,
    );
    expect(
      f.tx.contentLearningRun.findFirst.mock.invocationCallOrder[0],
    ).toBeLessThan(
      f.tx.contentLearningSharedPolicy.findMany.mock.invocationCallOrder[0],
    );
    expect(
      f.tx.contentLearningSharedPolicy.findMany.mock.invocationCallOrder[0],
    ).toBeLessThan(f.dependencies.valid.mock.invocationCallOrder[0]);
    expect(f.dependencies.valid.mock.invocationCallOrder[0]).toBeLessThan(
      f.tx.contentLearningOperation.findFirst.mock.invocationCallOrder[0],
    );
    expect(f.input.artifactIds).toEqual(['A', 'B']);
    const data = f.tx.contentLearningRelease.create.mock.calls[0][0].data;
    expect(data).toEqual({
      manifest: toPrismaJson([
        { cell: 'cell-B', policyId: 'B', version: 2 },
        { cell: 'cell-A', policyId: 'A', version: 1 },
      ]),
      reviewId: 'actor',
      reportId: 'report',
      recipientSalt: expect.stringMatching(/^[a-f0-9]{64}$/),
      synthetic: false,
    });
    expect(data).not.toHaveProperty('stage');
    expect(data).not.toHaveProperty('activeCells');
    expect(f.release()?.recipientSalt).toBe(data.recipientSalt);
    expect(f.dependencies.link.mock.calls).toEqual([
      [
        f.tx,
        {
          kind: 'run',
          id: 'report',
          organizationId: null,
          version: 'run-version',
        },
        { kind: 'release', id: 'release', organizationId: null, version: '0' },
      ],
      [
        f.tx,
        { kind: 'shared-policy', id: 'B', organizationId: null, version: '2' },
        { kind: 'release', id: 'release', organizationId: null, version: '0' },
      ],
      [
        f.tx,
        { kind: 'shared-policy', id: 'A', organizationId: null, version: '1' },
        { kind: 'release', id: 'release', organizationId: null, version: '0' },
      ],
    ]);
    for (const call of f.dependencies.resolve.mock.calls) {
      expect(call[2]).toBeNull();
      expect(call[3]).toBe(f.tx);
    }
    expect(f.tx.contentLearningOperation.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org',
        actorId: 'actor',
        scope: 'global-admin',
        requestId: 'request',
        payloadHash: learningHash([['A', 'B'], 'report']),
        type: 'release-create',
        status: 'completed',
        resultReferences: toPrismaJson({ releaseId: 'release' }),
      },
    });
    expect(control).not.toHaveBeenCalled();
    expect(receive).not.toHaveBeenCalled();
    expectRootUnused(f);
  });
  it('C2 revalidates exact and reordered retries without new salt, links or receipts', async () => {
    const f = fixture();
    const original = await f.service.create(f.input);
    const salt = f.release()?.recipientSalt;
    expect(await f.service.create(f.input)).toBe(original);
    expect(
      await f.service.create({ ...f.input, artifactIds: ['B', 'A'] }),
    ).toBe(original);
    // Each create takes the global shared and the organization shared fence.
    expect(f.tx.$queryRaw).toHaveBeenCalledTimes(6);
    expect(f.tx.contentLearningRun.findFirst).toHaveBeenCalledTimes(3);
    expect(f.tx.contentLearningSharedPolicy.findMany).toHaveBeenCalledTimes(3);
    expect(f.dependencies.valid).toHaveBeenCalledTimes(3);
    expect(f.tx.contentLearningRelease.create).toHaveBeenCalledTimes(1);
    expect(f.tx.contentLearningOperation.create).toHaveBeenCalledTimes(1);
    expect(f.dependencies.link).toHaveBeenCalledTimes(3);
    expect(f.release()?.recipientSalt).toBe(salt);
    expectRootUnused(f);
  });
  it.each(['report', 'artifacts'])(
    'C3 conflicts on a changed valid %s payload after source validation',
    async (change) => {
      const f = fixture();
      await f.service.create(f.input);
      if (change === 'report') f.report.id = 'other-report';
      else {
        f.policies[0].id = 'D';
        f.policies[1].id = 'C';
      }
      const input =
        change === 'report'
          ? { ...f.input, reportId: 'other-report' }
          : { ...f.input, artifactIds: ['C', 'D'] };
      await expect(f.service.create(input)).rejects.toThrow(
        'Release idempotency payload conflict',
      );
      expect(f.tx.contentLearningRelease.create).toHaveBeenCalledTimes(1);
      expect(f.tx.contentLearningOperation.create).toHaveBeenCalledTimes(1);
      expect(f.dependencies.link).toHaveBeenCalledTimes(3);
      expect(f.dependencies.valid).toHaveBeenCalledTimes(2);
    },
  );
  it.each(['actorId', 'organizationId'] as const)(
    'C3 keeps foreign %s receipts scoped separately',
    async (key) => {
      const f = fixture();
      const prior = await f.service.create(f.input);
      const input = { ...f.input, [key]: 'foreign' };
      expect(await f.service.create(input)).not.toBe(prior);
      expect(f.tx.contentLearningOperation.findFirst).toHaveBeenLastCalledWith({
        where: {
          organizationId: input.organizationId,
          actorId: input.actorId,
          scope: 'global-admin',
          requestId: 'request',
          isDeleted: false,
        },
      });
      expectRootUnused(f);
    },
  );
  it('C4 rejects missing reports before artifact or dependency reads', async () => {
    const f = fixture();
    f.tx.contentLearningRun.findFirst.mockReturnValue(null);
    await expect(f.service.create(f.input)).rejects.toThrow(
      'Completed immutable evaluation required',
    );
    expect(f.tx.contentLearningSharedPolicy.findMany).not.toHaveBeenCalled();
    expect(f.dependencies.valid).not.toHaveBeenCalled();
    expectNoWrites(f);
  });
  it.each(['count', 'invalid', 'duplicates'] as const)(
    'C4 short-circuits run validity for %s artifacts',
    async (kind) => {
      const f = fixture();
      if (kind === 'invalid') f.policies[0].validity = 'invalid';
      else f.policies.pop();
      if (kind === 'duplicates') f.input.artifactIds = ['A', 'A'];
      await expect(f.service.create(f.input)).rejects.toThrow(
        'Invalid artifact manifest',
      );
      expect(f.dependencies.valid).not.toHaveBeenCalled();
      expect(f.tx.contentLearningOperation.findFirst).not.toHaveBeenCalled();
      expectNoWrites(f);
    },
  );
  it('C4 rejects invalid run validity before prior lookup or writes', async () => {
    const f = fixture();
    f.dependencies.valid.mockResolvedValue(false);
    await expect(f.service.create(f.input)).rejects.toThrow(
      'Invalid artifact manifest',
    );
    expect(f.tx.contentLearningOperation.findFirst).not.toHaveBeenCalled();
    expectNoWrites(f);
    expectRootUnused(f);
  });
  it('C4 does not allow a stored prior to bypass invalid current sources', async () => {
    const f = fixture();
    await f.service.create(f.input);
    f.tx.contentLearningOperation.findFirst.mockClear();
    f.dependencies.valid.mockResolvedValue(false);
    await expect(f.service.create(f.input)).rejects.toThrow(
      'Invalid artifact manifest',
    );
    expect(f.tx.contentLearningOperation.findFirst).not.toHaveBeenCalled();
    expect(f.tx.contentLearningRelease.create).toHaveBeenCalledTimes(1);
    expect(f.dependencies.link).toHaveBeenCalledTimes(3);
  });
  it('C4 preserves accepted empty artifact input', async () => {
    const f = fixture();
    f.policies.splice(0);
    f.input.artifactIds = [];
    await f.service.create(f.input);
    expect(f.release()?.manifest).toEqual([]);
    expect(f.dependencies.valid).toHaveBeenCalledWith(
      'run',
      'report',
      f.tx,
      null,
    );
    expect(f.dependencies.link).toHaveBeenCalledTimes(1);
  });
  const syntheticCases: Array<{
    report: boolean;
    policy: boolean;
    expected: boolean;
  }> = [
    { report: true, policy: false, expected: true },
    { report: false, policy: true, expected: true },
    { report: false, policy: false, expected: false },
  ];
  it.each(syntheticCases)(
    'C5 preserves synthetic OR $report/$policy and does not require passed JSON',
    async (row) => {
      const f = fixture();
      f.report.synthetic = row.report;
      f.policies[0].synthetic = row.policy;
      await f.service.create(f.input);
      expect(f.release()?.synthetic).toBe(row.expected);
      expect(f.report.report).toEqual({
        status: 'not-passed',
        synthetic: false,
      });
      expect(
        f.tx.contentLearningRelease.create.mock.calls[0][0].data,
      ).not.toHaveProperty('stage');
    },
  );
  it('C6 propagates a rejected fence before all model/dependency work', async () => {
    const f = fixture();
    const error = new Error('fence');
    f.tx.$queryRaw.mockRejectedValue(error);
    await expect(f.service.create(f.input)).rejects.toBe(error);
    expect(f.tx.contentLearningRun.findFirst).not.toHaveBeenCalled();
    expect(f.tx.contentLearningSharedPolicy.findMany).not.toHaveBeenCalled();
    expect(f.tx.contentLearningOperation.findFirst).not.toHaveBeenCalled();
    expect(f.dependencies.valid).not.toHaveBeenCalled();
    expect(f.dependencies.resolve).not.toHaveBeenCalled();
    expectNoWrites(f);
    expectRootUnused(f);
  });
  it.each(['valid', 'resolve', 'link'] as const)(
    'C6 propagates %s errors without later operation creation',
    async (method) => {
      const f = fixture();
      const error = new Error(method);
      f.dependencies[method].mockRejectedValue(error);
      await expect(f.service.create(f.input)).rejects.toBe(error);
      expect(f.tx.contentLearningOperation.create).not.toHaveBeenCalled();
      if (method === 'valid') expectNoWrites(f);
      if (method === 'resolve')
        expect(f.dependencies.link).not.toHaveBeenCalled();
      expectRootUnused(f);
    },
  );
});
