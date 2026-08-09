import type { LifecycleEmailJobData } from '@genfeedai/queue-contracts';
import { LifecycleEmailProcessor } from '@workers/processors/api/queues/lifecycle-email/lifecycle-email.processor';
import type { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function buildJob(): Job<LifecycleEmailJobData> {
  return {
    data: {
      sequence: 'welcome',
      step: 'welcome-day-0',
      triggerKey: 'welcome:user-1',
      userId: 'user-1',
    },
    updateProgress: vi.fn().mockResolvedValue(undefined),
  } as unknown as Job<LifecycleEmailJobData>;
}

describe('LifecycleEmailProcessor', () => {
  let processor: LifecycleEmailProcessor;
  let lifecycleEmailDeliveryService: {
    sendLifecycleEmail: ReturnType<typeof vi.fn>;
  };
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    lifecycleEmailDeliveryService = {
      sendLifecycleEmail: vi.fn().mockResolvedValue(undefined),
    };
    logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    processor = new LifecycleEmailProcessor(
      lifecycleEmailDeliveryService as never,
      logger as never,
    );
  });

  it('delivers the lifecycle email and reports progress', async () => {
    const job = buildJob();

    await processor.process(job);

    expect(job.updateProgress).toHaveBeenCalledWith(10);
    expect(
      lifecycleEmailDeliveryService.sendLifecycleEmail,
    ).toHaveBeenCalledWith(job.data);
    expect(job.updateProgress).toHaveBeenCalledWith(100);
  });

  it('rethrows delivery failures for BullMQ to retry', async () => {
    lifecycleEmailDeliveryService.sendLifecycleEmail.mockRejectedValue(
      new Error('smtp down'),
    );

    await expect(processor.process(buildJob())).rejects.toThrow('smtp down');
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
