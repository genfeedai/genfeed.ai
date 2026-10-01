import type { LearningDependencyService } from '@api/collections/content-learning/services/learning-dependency.service';
import { learningHash } from '@api/collections/content-learning/services/learning-operation.service';
import { LearningRunControlService } from '@api/collections/content-learning/services/learning-run-control.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
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
  const dependencies = { valid: vi.fn().mockResolvedValue(true) };
  return {
    run,
    operation,
    tx,
    dependencies,
    service: new LearningRunControlService(
      prisma as unknown as PrismaService,
      dependencies as unknown as LearningDependencyService,
    ),
  };
}
describe('audited scoped run controls', () => {
  it('creates a fresh cycle on retry while preserving the terminal cycle and immutable token', async () => {
    const f = fixture('failed');
    const token = f.run.startedAt;
    f.tx.contentLearningOperation.findFirst.mockResolvedValue(null);
    const result = await f.service.retry({
      id: 'run',
      organizationId: 'org',
      actorId: 'actor',
      requestId: 'fresh-key',
    });
    expect(result.status).toBe('pending');
    expect(f.operation.status).toBe('failed');
    expect(result.startedAt).toEqual(token);
    expect(f.tx.contentLearningOperation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org',
          actorId: 'actor',
          type: 'dataset-train',
          status: 'pending',
          resultReferences: expect.objectContaining({
            retryOfOperationId: 'operation',
            attemptCount: 0,
          }),
        }),
      }),
    );
  });
  it('cancels both active records and stores an auditable control', async () => {
    const f = fixture();
    f.tx.contentLearningOperation.findFirst.mockResolvedValue(null);
    await f.service.cancel({
      id: 'run',
      organizationId: 'org',
      actorId: 'actor',
      requestId: 'cancel-key',
    });
    expect(f.run.status).toBe('cancelled');
    expect(f.operation.status).toBe('cancelled');
    expect(f.tx.contentLearningOperation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'run-cancel',
          status: 'completed',
        }),
      }),
    );
  });
  it('does not reenact an exact control receipt after its retry failed again', async () => {
    const f = fixture('failed');
    f.tx.contentLearningOperation.findFirst.mockResolvedValue({
      ...f.operation,
      payloadHash: learningHash(['org', 'retry', 'run', 'immutable-config']),
    });
    await f.service.retry({
      id: 'run',
      organizationId: 'org',
      actorId: 'actor',
      requestId: 'prior-key',
    });
    expect(f.run.status).toBe('failed');
    expect(f.tx.contentLearningOperation.create).not.toHaveBeenCalled();
    expect(f.tx.contentLearningRun.updateMany).not.toHaveBeenCalled();
  });
  it('rejects a reused request key with a different action target digest', async () => {
    const f = fixture('failed');
    f.tx.contentLearningOperation.findFirst.mockResolvedValue({
      ...f.operation,
      payloadHash: 'different-target',
    });
    await expect(
      f.service.retry({
        id: 'run',
        organizationId: 'org',
        actorId: 'actor',
        requestId: 'prior-key',
      }),
    ).rejects.toThrow('payload conflict');
    expect(f.tx.contentLearningRun.updateMany).not.toHaveBeenCalled();
  });
  it('refuses another active cycle and current authority withdrawal', async () => {
    const f = fixture('failed');
    f.operation.status = 'pending';
    f.tx.contentLearningOperation.findFirst.mockResolvedValue(null);
    await expect(
      f.service.retry({
        id: 'run',
        organizationId: 'org',
        actorId: 'actor',
        requestId: 'new-key',
      }),
    ).rejects.toThrow('cannot retry');
    f.tx.user.findFirst.mockResolvedValue(null);
    await expect(
      f.service.cancel({
        id: 'run',
        organizationId: 'org',
        actorId: 'actor',
        requestId: 'new-key',
      }),
    ).rejects.toThrow('authority withdrawn');
  });
  it('refuses foreign organization controls without resolving an unscoped operation', async () => {
    const f = fixture('failed');
    f.tx.contentLearningOperation.findMany.mockResolvedValue([]);
    await expect(
      f.service.retry({
        id: 'run',
        organizationId: 'foreign',
        actorId: 'actor',
        requestId: 'new-key',
      }),
    ).rejects.toThrow('dispatch not found');
    expect(f.tx.contentLearningOperation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'foreign',
          isDeleted: false,
        }),
      }),
    );
    expect(f.tx.contentLearningRun.updateMany).not.toHaveBeenCalled();
  });
  it('does not retry or cancel a new-key insufficient-data result', async () => {
    const f = fixture('insufficient_data');
    f.operation.status = 'completed';
    f.tx.contentLearningOperation.findFirst.mockResolvedValue(null);
    const input = {
      id: 'run',
      organizationId: 'org',
      actorId: 'actor',
      requestId: 'new-key',
    };
    await expect(f.service.retry(input)).rejects.toThrow('cannot retry');
    await expect(f.service.cancel(input)).rejects.toThrow('cannot cancel');
  });
});
