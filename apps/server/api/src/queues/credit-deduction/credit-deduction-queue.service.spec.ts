import type { CreditDeductionJobData } from '@api/queues/credit-deduction/credit-deduction-job.interface';
import { CreditDeductionQueueService } from '@api/queues/credit-deduction/credit-deduction-queue.service';
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
        source: 'video-generation',
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
        source: 'video-generation',
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
  });
});
