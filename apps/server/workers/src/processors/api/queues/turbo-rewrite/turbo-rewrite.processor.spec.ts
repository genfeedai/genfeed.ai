import type { TurboRunRewriteRunnerService } from '@api/services/turbo-run/turbo-run-rewrite-runner.service';
import { TurboRewriteJobStatus } from '@genfeedai/contracts';
import type {
  TurboRewriteJobData,
  TurboRewriteJobResult,
} from '@genfeedai/contracts/queue';
import type { Job } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import { TurboRewriteProcessor } from './turbo-rewrite.processor';

describe('TurboRewriteProcessor', () => {
  it('hands the job to the rewrite runner and returns its outcome', async () => {
    const result: TurboRewriteJobResult = {
      completedItemIds: ['item-1'],
      failedItems: [],
      status: TurboRewriteJobStatus.COMPLETED,
    };
    const run = vi.fn().mockResolvedValue(result);
    const processor = new TurboRewriteProcessor({
      run,
    } as unknown as TurboRunRewriteRunnerService);
    const job = { id: 'job-1' } as Job<
      TurboRewriteJobData,
      TurboRewriteJobResult
    >;

    await expect(processor.process(job)).resolves.toBe(result);
    expect(run).toHaveBeenCalledWith(job);
  });
});
