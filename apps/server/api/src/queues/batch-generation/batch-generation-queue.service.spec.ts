import {
  BatchGenerationQueueService,
  batchGenerationJobId,
} from '@api/queues/batch-generation/batch-generation-queue.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BATCH_GENERATION_QUEUE } from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const JOB = { batchId: 'batch-1', organizationId: 'org-1', userId: 'user-1' };

describe('BatchGenerationQueueService', () => {
  let service: BatchGenerationQueueService;
  let queue: {
    add: ReturnType<typeof vi.fn>;
    getJob: ReturnType<typeof vi.fn>;
  };
  let batchDelegate: {
    findFirst: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  /** Order the two side effects landed in — the sweep depends on it. */
  let calls: string[];

  async function buildService(withQueue: boolean): Promise<void> {
    const providers = [
      BatchGenerationQueueService,
      { provide: PrismaService, useValue: { batch: batchDelegate } },
      { provide: LoggerService, useValue: logger },
    ];

    const module: TestingModule = await Test.createTestingModule({
      providers: withQueue
        ? [
            ...providers,
            { provide: getQueueToken(BATCH_GENERATION_QUEUE), useValue: queue },
          ]
        : providers,
    }).compile();

    service = module.get(BatchGenerationQueueService);
  }

  beforeEach(async () => {
    calls = [];
    queue = {
      add: vi.fn(async () => {
        calls.push('add');
        return { id: batchGenerationJobId('batch-1') };
      }),
      getJob: vi.fn().mockResolvedValue(null),
    };
    batchDelegate = {
      findFirst: vi.fn().mockResolvedValue({ config: { totalCount: 2 } }),
      updateMany: vi.fn(async () => {
        calls.push('markQueued');
        return { count: 1 };
      }),
    };
    logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    await buildService(true);
  });

  it('queues one job per batch under a deterministic id', async () => {
    const jobId = await service.queueBatch(JOB);

    expect(jobId).toBe('batch-generation-batch-1');
    expect(queue.add).toHaveBeenCalledWith(
      'process-batch',
      expect.objectContaining(JOB),
      expect.objectContaining({
        attempts: 1,
        jobId: 'batch-generation-batch-1',
      }),
    );
  });

  it('marks the batch queued before handing it to the queue', async () => {
    await service.queueBatch(JOB);

    // A crash between the two must leave evidence the sweep can find; stamping
    // afterwards would lose the batch silently.
    expect(calls).toEqual(['markQueued', 'add']);
    const stamped = batchDelegate.updateMany.mock.calls[0]?.[0]?.data
      ?.config as {
      queuedAt: string;
      totalCount: number;
    };
    expect(stamped.queuedAt).toEqual(expect.any(String));
    expect(stamped.totalCount).toBe(2);
  });

  it('does not fork a second run while a job is still in flight', async () => {
    const existing = {
      getState: vi.fn().mockResolvedValue('active'),
      remove: vi.fn(),
    };
    queue.getJob.mockResolvedValue(existing);

    const jobId = await service.queueBatch({ ...JOB, isResume: true });

    // This is the sweep racing a live job — it must be a no-op, not a duplicate.
    expect(jobId).toBe('batch-generation-batch-1');
    expect(queue.add).not.toHaveBeenCalled();
    expect(existing.remove).not.toHaveBeenCalled();
    expect(batchDelegate.updateMany).not.toHaveBeenCalled();
  });

  it('reclaims the id from a job that already finished', async () => {
    queue.getJob.mockResolvedValue({
      getState: vi.fn().mockResolvedValue('completed'),
      remove: vi.fn(),
    });

    await service.queueBatch({ ...JOB, isResume: true });

    expect(queue.add).toHaveBeenCalledOnce();
  });

  it('attaches an agent action origin when the caller supplies none', async () => {
    await service.queueBatch(JOB);

    const payload = queue.add.mock.calls[0]?.[1];
    expect(payload?.actionContext).toBeDefined();
  });

  it('reports no job when the deployment runs without a queue', async () => {
    await buildService(false);

    // Single-process self-hosted: the caller falls back to running in-process.
    await expect(service.queueBatch(JOB)).resolves.toBeNull();
    expect(logger.warn).toHaveBeenCalled();
    expect(batchDelegate.updateMany).not.toHaveBeenCalled();
  });
});
