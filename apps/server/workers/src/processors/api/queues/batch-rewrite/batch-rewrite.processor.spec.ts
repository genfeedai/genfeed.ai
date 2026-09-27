import type { BatchGenerationRewriteRunnerService } from '@api/services/batch-generation/batch-generation-rewrite-runner.service';
import { BatchRewriteJobStatus } from '@genfeedai/contracts';
import type {
  BatchRewriteJobData,
  BatchRewriteJobResult,
} from '@genfeedai/contracts/queue';
import type { Job } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import { BatchRewriteProcessor } from './batch-rewrite.processor';

describe('BatchRewriteProcessor', () => {
  it('hands the job to the rewrite runner and returns its outcome', async () => {
    const result: BatchRewriteJobResult = {
      completedItemIds: ['item-1'],
      failedItems: [],
      status: BatchRewriteJobStatus.COMPLETED,
    };
    const run = vi.fn().mockResolvedValue(result);
    const processor = new BatchRewriteProcessor({
      run,
    } as unknown as BatchGenerationRewriteRunnerService);
    const job = { id: 'job-1' } as Job<
      BatchRewriteJobData,
      BatchRewriteJobResult
    >;

    await expect(processor.process(job)).resolves.toBe(result);
    expect(run).toHaveBeenCalledWith(job);
  });
});
