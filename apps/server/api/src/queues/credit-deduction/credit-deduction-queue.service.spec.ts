import { CreditDeductionQueueService } from '@api/queues/credit-deduction/credit-deduction-queue.service';
import { ActivitySource } from '@genfeedai/contracts';
import type { CreditDeductionJobData } from '@genfeedai/contracts/queue';
import { LoggerService } from '@libs/logger/logger.service';
import { Queue } from 'bullmq';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('CreditDeductionQueueService', () => {
  let service: CreditDeductionQueueService;
  let queue: Queue;
  let logger: LoggerService;

  beforeEach(() => {
    vi.useFakeTimers();

    queue = {
      add: vi.fn(),
    } as unknown as Queue;

    logger = {
      error: vi.fn(),
      log: vi.fn(),
    } as unknown as LoggerService;

    service = new CreditDeductionQueueService(queue, logger);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('instantiation', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('queueDeduction', () => {
    it('should queue credit deduction job successfully', async () => {
      const jobData: CreditDeductionJobData = {
        amount: 100,
        description: 'Test deduction',
        organizationId: 'org-123',
        source: ActivitySource.VIDEO_GENERATION,
        type: 'deduct-credits',
        userId: 'user-456',
      };

      await service.queueDeduction(jobData);

      expect(queue.add).toHaveBeenCalledWith(
        'deduct-credits',
        jobData,
        expect.objectContaining({
          jobId: expect.stringContaining('credit-deduct-org-123-'),
        }),
      );
      expect(logger.log).toHaveBeenCalled();
    });

    it('should handle queue errors gracefully', async () => {
      const jobData: CreditDeductionJobData = {
        amount: 100,
        description: 'Test deduction',
        organizationId: 'org-123',
        source: ActivitySource.VIDEO_GENERATION,
        type: 'deduct-credits',
        userId: 'user-456',
      };

      vi.mocked(queue.add).mockRejectedValue(new Error('Queue full'));

      await expect(service.queueDeduction(jobData)).rejects.toThrow(
        'Queue full',
      );
    });

    it('should generate unique job IDs', async () => {
      const jobData: CreditDeductionJobData = {
        amount: 100,
        description: 'Test',
        organizationId: 'org-123',
        source: 'test',
        type: 'deduct-credits',
        userId: 'user-456',
      };

      vi.mocked(queue.add).mockResolvedValue(undefined as never);

      await service.queueDeduction(jobData);

      // Advance timer to ensure different Date.now() values
      vi.advanceTimersByTime(1);

      await service.queueDeduction(jobData);

      expect(queue.add).toHaveBeenCalledTimes(2);
      const call1 = (queue.add as ReturnType<typeof vi.fn>).mock.calls[0][2]
        .jobId as string;
      const call2 = (queue.add as ReturnType<typeof vi.fn>).mock.calls[1][2]
        .jobId as string;
      expect(call1).not.toBe(call2);
    });

    it('should use a deterministic job ID when an idempotency key is supplied', async () => {
      const jobData: CreditDeductionJobData = {
        amount: 18,
        description: 'Fleet voice clone compute',
        idempotencyKey: 'fleet-voice-clone-job-1',
        organizationId: 'org-123',
        source: ActivitySource.VIDEO_GENERATION,
        type: 'deduct-credits',
        userId: 'user-456',
      };

      await service.queueDeduction(jobData);

      expect(queue.add).toHaveBeenCalledWith(
        'deduct-credits',
        jobData,
        expect.objectContaining({
          jobId: 'credit-deduct-org-123-fleet-voice-clone-job-1',
        }),
      );
    });

    it('strips colons from idempotency keys so BullMQ accepts the job id', async () => {
      const jobData: CreditDeductionJobData = {
        amount: 2,
        description: 'Composer image generation',
        idempotencyKey: 'generation:composer-generation-execution-1',
        organizationId: 'org-123',
        source: 'image-generation',
        type: 'deduct-credits',
        userId: 'user-456',
      };

      await service.queueDeduction(jobData);

      expect(queue.add).toHaveBeenCalledWith(
        'deduct-credits',
        jobData,
        expect.objectContaining({
          jobId:
            'credit-deduct-org-123-generation-composer-generation-execution-1',
        }),
      );
    });

    it('keeps media settlement retryable through the stuck-asset reconciliation window', async () => {
      const jobData: CreditDeductionJobData = {
        amount: 18,
        description: 'Agent image generation',
        idempotencyKey: 'agent-media-action-1',
        organizationId: 'org-123',
        settlementAssetId: 'asset-1',
        source: ActivitySource.IMAGE_GENERATION,
        type: 'deduct-credits',
        userId: 'user-456',
      };

      await service.queueDeduction(jobData);

      expect(queue.add).toHaveBeenCalledWith(
        'deduct-credits',
        jobData,
        expect.objectContaining({
          attempts: 20_160,
          backoff: { delay: 30_000, type: 'fixed' },
        }),
      );
    });
  });

  describe('queueByokUsage', () => {
    it('should queue BYOK usage job successfully', async () => {
      const jobData: CreditDeductionJobData = {
        amount: 50,
        description: 'BYOK usage',
        organizationId: 'org-789',
        source: 'openai',
        type: 'record-byok-usage',
      };

      vi.mocked(queue.add).mockResolvedValue(undefined as never);

      await service.queueByokUsage(jobData);

      expect(queue.add).toHaveBeenCalledWith(
        'record-byok-usage',
        jobData,
        expect.objectContaining({
          jobId: expect.stringContaining('byok-usage-org-789-'),
        }),
      );
      expect(logger.log).toHaveBeenCalled();
    });

    it('should handle BYOK queue errors', async () => {
      const jobData: CreditDeductionJobData = {
        amount: 50,
        description: 'BYOK usage',
        organizationId: 'org-789',
        source: 'openai',
        type: 'record-byok-usage',
      };

      vi.mocked(queue.add).mockRejectedValue(
        new Error('Redis connection lost'),
      );

      await expect(service.queueByokUsage(jobData)).rejects.toThrow(
        'Redis connection lost',
      );
    });

    it('uses a deterministic BYOK job ID when an idempotency key is supplied', async () => {
      const jobData: CreditDeductionJobData = {
        amount: 7,
        description: 'Bot media generation',
        idempotencyKey: 'bot-media-image-1',
        organizationId: 'org-789',
        source: ActivitySource.BOT_GENERATION,
        type: 'record-byok-usage',
        userId: 'user-1',
      };

      await service.queueByokUsage(jobData);

      expect(queue.add).toHaveBeenCalledWith(
        'record-byok-usage',
        jobData,
        expect.objectContaining({
          jobId: 'byok-usage-org-789-bot-media-image-1',
        }),
      );
    });
  });
});
