import type { LearningDependencyService } from '@api/collections/content-learning/services/learning-dependency.service';
import {
  LearningRunService,
  parseLearningRunDispatch,
} from '@api/collections/content-learning/services/learning-run.service';
import { LearningRunControlService } from '@api/collections/content-learning/services/learning-run-control.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LEARNING_ARMS } from '@genfeedai/harness';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class {},
}));
const now = new Date('2026-09-30T12:00:00.000Z');
function fixture(status = 'running', attempts = 1) {
  const token = new Date(now.getTime() - 306000);
  const receipt = {
    dispatchVersion: 1,
    runId: 'run',
    datasetId: 'dataset',
    retryOfOperationId: null,
    attemptCount: attempts,
    nextAttemptAt: null,
    claimedStartedAt: token.toISOString(),
  };
  const run = {
    id: 'run',
    datasetId: 'dataset',
    configHash: 'immutable-config',
    type: 'train',
    status,
    startedAt: token,
    error: null,
    completedAt: now,
    report: null,
    resultArtifactId: null,
  };
  const operation = {
    id: 'operation',
    organizationId: 'org',
    actorId: 'actor',
    status,
    type: 'dataset-train',
    resultReferences: receipt,
  };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ now }]),
    $executeRaw: vi.fn().mockResolvedValue(1),
    user: { findFirst: vi.fn().mockResolvedValue({ id: 'actor' }) },
    contentLearningDataset: {
      findFirst: vi.fn().mockResolvedValue({ id: 'dataset' }),
    },
    contentLearningDatasetEntry: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    contentLearningRun: {
      findFirst: vi.fn().mockResolvedValue(run),
      findFirstOrThrow: vi.fn().mockImplementation(async () => run),
      updateMany: vi.fn().mockImplementation(async ({ data }) => {
        Object.assign(run, data);
        return { count: 1 };
      }),
    },
    contentLearningOperation: {
      findFirst: vi.fn().mockResolvedValue(operation),
      findMany: vi.fn().mockResolvedValue([operation]),
      create: vi.fn().mockResolvedValue({ id: 'retry-operation' }),
      updateMany: vi.fn().mockImplementation(async ({ data }) => {
        Object.assign(operation, data);
        return { count: 1 };
      }),
    },
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn().mockImplementation(async (apply) => apply(tx)),
  };
  const dependencies = {
    valid: vi.fn().mockResolvedValue(true),
    link: vi.fn(),
    resolve: vi.fn().mockImplementation(async (kind, id, organizationId) => ({
      kind,
      id,
      organizationId,
      version: 'pinned',
    })),
  };
  return {
    run,
    operation,
    tx,
    dependencies,
    service: new LearningRunService(
      prisma as unknown as PrismaService,
      dependencies as unknown as LearningDependencyService,
      new LearningRunControlService(
        prisma as unknown as PrismaService,
        dependencies as unknown as LearningDependencyService,
      ),
    ),
  };
}
const dispatch = {
  runId: 'run',
  operationId: 'operation',
  organizationId: 'org',
};
describe('paired durable run recovery', () => {
  it('consumes abandoned attempts without clearing the fencing token', async () => {
    const f = fixture();
    const token = f.run.startedAt;
    const result = await f.service.reconcileDispatch(dispatch);
    expect(result.dispatchable).toBe(true);
    expect(f.run.status).toBe('pending');
    expect(f.run.startedAt).toEqual(token);
    expect(f.operation.status).toBe('pending');
    expect(f.operation.resultReferences).toMatchObject({
      attemptCount: 1,
      claimedStartedAt: token.toISOString(),
      nextAttemptAt: '2026-09-30T11:59:59.000Z',
    });
    expect(f.tx.contentLearningRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'running', startedAt: token }),
      }),
    );
  });
  it('ends the third abandoned attempt rather than granting a new budget', async () => {
    const f = fixture('running', 3);
    const result = await f.service.reconcileDispatch(dispatch);
    expect(result.dispatchable).toBe(false);
    expect(f.run.status).toBe('failed');
    expect(f.operation.status).toBe('failed');
    expect(f.run.error).toBe('run_lease_expired');
  });
  it('does not requeue or rewrite a fresh lease', async () => {
    const f = fixture();
    f.run.startedAt = new Date(now.getTime() - 1000);
    f.operation.resultReferences.claimedStartedAt =
      f.run.startedAt.toISOString();
    expect((await f.service.reconcileDispatch(dispatch)).dispatchable).toBe(
      false,
    );
    expect(f.tx.contentLearningRun.updateMany).not.toHaveBeenCalled();
  });
  it('mirrors committed output into a lagging operation without another run', async () => {
    const f = fixture();
    f.run.status = 'completed';
    expect((await f.service.reconcileDispatch(dispatch)).dispatchable).toBe(
      false,
    );
    expect(f.operation.status).toBe('completed');
    expect(f.tx.contentLearningRun.updateMany).not.toHaveBeenCalled();
  });
  it('invalidates both records after authority withdrawal', async () => {
    const f = fixture();
    f.tx.user.findFirst.mockResolvedValue(null);
    await f.service.reconcileDispatch(dispatch);
    expect(f.run.status).toBe('invalidated');
    expect(f.operation.status).toBe('invalidated');
  });
  it('never treats a malformed versioned receipt as a fresh legacy budget', async () => {
    const f = fixture('pending');
    f.run.startedAt = null as unknown as Date;
    f.operation.resultReferences.attemptCount = 99;
    await f.service.reconcileDispatch(dispatch);
    expect(f.operation.status).toBe('failed');
    expect(f.run.status).toBe('failed');
  });
  it('requires a scoped dispatch even for a globally visible run', async () => {
    const f = fixture();
    f.tx.contentLearningOperation.findFirst.mockResolvedValue(null);
    await expect(
      f.service.reconcileDispatch({ ...dispatch, organizationId: 'foreign' }),
    ).rejects.toThrow();
    expect(f.tx.contentLearningOperation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'foreign',
          isDeleted: false,
        }),
      }),
    );
  });
  it('commits insufficient data as a completed dispatch with no artifact and an honest diagnostic', async () => {
    const f = fixture('pending', 0);
    f.run.startedAt = null as unknown as Date;
    f.operation.resultReferences.claimedStartedAt = null as unknown as string;
    await f.service.execute(dispatch);
    expect(f.run.status).toBe('insufficient_data');
    expect(f.operation.status).toBe('completed');
    expect(f.run.report).toEqual({ reason: 'minimum_training_30', count: 0 });
    expect(f.operation.resultReferences).toMatchObject({
      attemptCount: 1,
      terminalResult: {
        runStatus: 'insufficient_data',
        reasonCode: 'minimum_training_30',
        trainingCount: 0,
        requiredTrainingCount: 30,
        resultArtifactId: null,
        completedAt: now.toISOString(),
      },
    });
    const writes = f.tx.contentLearningRun.updateMany.mock.calls.length;
    await f.service.execute(dispatch);
    expect(f.tx.contentLearningRun.updateMany).toHaveBeenCalledTimes(writes);
  });
  it('recovers a dataset-read exception after consuming the claim, using the durable retry delay', async () => {
    const f = fixture('pending', 0);
    f.run.startedAt = null as unknown as Date;
    f.operation.resultReferences.claimedStartedAt = null as unknown as string;
    f.tx.contentLearningDataset.findFirst.mockRejectedValue(
      new Error('temporary database disconnect'),
    );
    await f.service.execute(dispatch);
    expect(f.run.status).toBe('pending');
    expect(f.operation.status).toBe('pending');
    expect(f.operation.resultReferences).toMatchObject({
      attemptCount: 1,
      nextAttemptAt: '2026-09-30T12:00:05.000Z',
    });
  });
  it('rejects unsafe counters and noncanonical date tokens', () => {
    const receipt = fixture().operation.resultReferences;
    expect(parseLearningRunDispatch(receipt)).not.toBeNull();
    expect(
      parseLearningRunDispatch({ ...receipt, attemptCount: Infinity }),
    ).toBeNull();
    expect(
      parseLearningRunDispatch({
        ...receipt,
        claimedStartedAt: '2026-09-30T12:00:00Z',
      }),
    ).toBeNull();
  });
  it('samples the write-time clock before committing a terminal pair', async () => {
    const f = fixture('pending', 0);
    f.run.startedAt = null as unknown as Date;
    f.operation.resultReferences.claimedStartedAt = null as unknown as string;
    f.tx.$queryRaw.mockImplementation(async (query: unknown) => {
      if (String(query).includes('clock_timestamp')) {
        const calls = f.tx.$queryRaw.mock.calls.filter((call) =>
          String(call[0]).includes('clock_timestamp'),
        ).length;
        if (calls > 4) return [{ now: new Date(now.getTime() + 306000) }];
        return [{ now }];
      }
      return [];
    });
    await f.service.execute(dispatch);
    expect(
      f.tx.contentLearningRun.updateMany.mock.calls.some(
        (call) => call[0]?.data?.status === 'insufficient_data',
      ),
    ).toBe(false);
  });
});

function datasetEntries(count: number, split: 'training' | 'validation') {
  return Array.from({ length: count }, (_, index) => ({
    accountGroup: `group-${index % 3}`,
    armId: LEARNING_ARMS[index % LEARNING_ARMS.length] as string,
    decisionAt: new Date(now.getTime() - (count - index) * 1000),
    features: [1, 0, 0, 0, 0, 0, 0, 0, index % 2],
    id: `${split}-${index}`,
    probabilities: Object.fromEntries(
      LEARNING_ARMS.map((arm) => [arm, 1 / LEARNING_ARMS.length]),
    ),
    reward: index % 2 ? 0.5 : -0.25,
    split,
  }));
}
function pendingRun(type: 'train' | 'evaluate') {
  const f = fixture('pending', 0);
  f.run.startedAt = null as unknown as Date;
  f.run.type = type;
  f.operation.resultReferences.claimedStartedAt = null as unknown as string;
  const entries = [
    ...datasetEntries(60, 'training'),
    ...datasetEntries(10, 'validation'),
  ];
  f.tx.contentLearningDataset.findFirst.mockResolvedValue({
    cell: 'cell',
    id: 'dataset',
    manifestHash: 'manifest',
    synthetic: false,
  });
  f.tx.contentLearningDatasetEntry.count.mockResolvedValue(entries.length);
  f.tx.contentLearningDatasetEntry.findMany.mockResolvedValue(entries);
  const policy = {
    create: vi.fn().mockResolvedValue({ id: 'policy-1' }),
    findFirst: vi.fn().mockResolvedValue({ version: 4 }),
  };
  (f.tx as Record<string, unknown>).contentLearningSharedPolicy = policy;
  return { ...f, policy };
}
describe('dataset run execution', () => {
  it('publishes the next candidate policy version from a training run', async () => {
    const f = pendingRun('train');
    const artifact = await f.service.execute(dispatch);
    expect(artifact).toEqual({ id: 'policy-1' });
    expect(f.run.status).toBe('completed');
    expect(f.run.resultArtifactId).toBe('policy-1');
    expect(f.operation.status).toBe('completed');
    const published = f.policy.create.mock.calls[0][0].data;
    expect(published).toMatchObject({
      cell: 'cell',
      datasetId: 'dataset',
      validity: 'candidate',
      version: 5,
    });
    expect(Object.keys(published.coefficients)).toEqual([...LEARNING_ARMS]);
    expect(f.run.report).toMatchObject({
      manifestHash: 'manifest',
      sourceAccountCount: 3,
      synthetic: false,
    });
  });
  it('completes an evaluation run with an inconclusive report and no artifact', async () => {
    const f = pendingRun('evaluate');
    const report = await f.service.execute(dispatch);
    expect(report).toMatchObject({
      configVersion: 'rl-reward-v1-experimental',
      manifestHash: 'manifest',
      status: 'inconclusive',
    });
    expect(report).toHaveProperty(
      'reasons',
      expect.arrayContaining(['assignment_denominators_required']),
    );
    expect(f.run.status).toBe('completed');
    expect(f.run.resultArtifactId).toBeNull();
    expect(f.policy.create).not.toHaveBeenCalled();
  });
  it('fails a run for good when a stored entry carries an unknown arm', async () => {
    const f = pendingRun('train');
    const entries = datasetEntries(40, 'training');
    entries[7] = { ...entries[7], armId: 'not-an-arm' };
    f.tx.contentLearningDatasetEntry.findMany.mockResolvedValue(entries);
    await f.service.execute(dispatch);
    expect(f.run.status).toBe('failed');
    expect(f.run.error).toBe('invalid_evidence:dataset.entries[7].armId');
    expect(f.policy.create).not.toHaveBeenCalled();
  });
});
