import type { BatchGenerationJobData } from '@genfeedai/queue-contracts';
import { BadRequestException } from '@nestjs/common';
import { BatchGenerationProcessor } from '@workers/processors/api/queues/batch-generation/batch-generation.processor';
import type { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function buildJob(
  data: Partial<BatchGenerationJobData>,
): Job<BatchGenerationJobData> {
  return {
    data: {
      batchId: 'batch-1',
      organizationId: 'org-1',
      userId: 'user-1',
      ...data,
    },
  } as unknown as Job<BatchGenerationJobData>;
}

describe('BatchGenerationProcessor', () => {
  let processor: BatchGenerationProcessor;
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let batchGenerationService: { processBatch: ReturnType<typeof vi.fn> };
  let creditsService: { settleBatchCredits: ReturnType<typeof vi.fn> };
  let streamService: { buildProcessOptions: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
    batchGenerationService = {
      processBatch: vi
        .fn()
        .mockResolvedValue({ completedCount: 3, failedCount: 0 }),
    };
    creditsService = {
      settleBatchCredits: vi.fn().mockResolvedValue(undefined),
    };
    streamService = {
      buildProcessOptions: vi.fn().mockReturnValue({ stream: true }),
    };

    processor = new BatchGenerationProcessor(
      logger as never,
      batchGenerationService as never,
      creditsService as never,
      streamService as never,
    );
  });

  it('processes the batch without stream options when no thread context exists', async () => {
    await processor.process(buildJob({}));

    expect(streamService.buildProcessOptions).not.toHaveBeenCalled();
    expect(batchGenerationService.processBatch).toHaveBeenCalledWith(
      'batch-1',
      'org-1',
      undefined,
    );
    expect(creditsService.settleBatchCredits).toHaveBeenCalledWith({
      batchId: 'batch-1',
      organizationId: 'org-1',
      userId: 'user-1',
    });
  });

  it('builds stream options for agent-triggered batches', async () => {
    await processor.process(buildJob({ runId: 'run-1', threadId: 'thread-1' }));

    expect(streamService.buildProcessOptions).toHaveBeenCalledWith({
      batchId: 'batch-1',
      runId: 'run-1',
      threadId: 'thread-1',
      userId: 'user-1',
    });
    expect(batchGenerationService.processBatch).toHaveBeenCalledWith(
      'batch-1',
      'org-1',
      { stream: true },
    );
  });

  it('returns without settling when another run owns the batch', async () => {
    batchGenerationService.processBatch.mockRejectedValue(
      new BadRequestException('batch already processing'),
    );

    await processor.process(buildJob({}));

    expect(creditsService.settleBatchCredits).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('settles and rethrows on a genuine processing failure', async () => {
    batchGenerationService.processBatch.mockRejectedValue(
      new Error('provider down'),
    );

    await expect(processor.process(buildJob({}))).rejects.toThrow(
      'provider down',
    );
    expect(creditsService.settleBatchCredits).toHaveBeenCalledTimes(1);
  });

  it('never fails the job when settlement fails', async () => {
    creditsService.settleBatchCredits.mockRejectedValue(
      new Error('ledger down'),
    );

    await expect(processor.process(buildJob({}))).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      'BatchGenerationProcessor settlement failed',
      expect.any(Error),
      { batchId: 'batch-1' },
    );
  });
});
