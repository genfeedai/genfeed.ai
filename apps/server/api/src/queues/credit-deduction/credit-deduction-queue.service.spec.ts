import { CreditDeductionQueueService } from '@api/queues/credit-deduction/credit-deduction-queue.service';
import { ActivitySource } from '@genfeedai/contracts';
import type { QueuedCreditChargeData } from '@genfeedai/contracts/queue';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
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
      getJob: vi.fn().mockResolvedValue(undefined),
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

  it.each(['deduct-credits', 'record-byok-usage'] as const)(
    'retains accepted %s jobs with the seven day retry window',
    async (type) => {
      const data: QueuedCreditChargeData = {
        type,
        amount: 5,
        description: 'Interpolation',
        organizationId: 'org',
        source: ActivitySource.VIDEO_GENERATION,
        idempotencyKey: 'interpolation-asset',
        acceptedGeneration: {
          ingredientId: 'asset',
          externalId: 'provider-id',
        },
      };
      if (type === 'deduct-credits') await service.queueDeduction(data);
      else await service.queueByokUsage(data);
      expect(queue.add).toHaveBeenCalledWith(
        type,
        data,
        expect.objectContaining({
          attempts: 20_160,
          backoff: { delay: 30_000, type: 'fixed' },
          removeOnFail: false,
        }),
      );
    },
  );

  it('revives a failed idempotent settlement when completion is reconciled again', async () => {
    const failed = {
      getState: vi.fn().mockResolvedValue('failed'),
      retry: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(queue.getJob).mockResolvedValue(failed as never);
    await service.queueDeduction({
      amount: 4,
      description: 'Completed generation',
      organizationId: 'org',
      source: ActivitySource.VIDEO_GENERATION,
      type: 'deduct-credits',
      reservationId: 'hold',
      idempotencyKey: 'media-generation-settle:hold',
    });
    expect(failed.retry).toHaveBeenCalledWith('failed', {
      resetAttemptsMade: true,
    });
    expect(queue.add).not.toHaveBeenCalled();
  });

  describe('instantiation', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('queueDeduction', () => {
    it('should queue credit deduction job successfully', async () => {
      const jobData: QueuedCreditChargeData = {
        amount: 100,
        description: 'Test deduction',
        idempotencyKey: 'charge-1',
        organizationId: 'org-123',
        source: ActivitySource.VIDEO_GENERATION,
        type: 'deduct-credits',
        userId: 'user-456',
      };

      await service.queueDeduction(jobData);

      expect(queue.add).toHaveBeenCalledWith(
        'deduct-credits',
        jobData,
        expect.objectContaining({ jobId: 'credit-deduct-org-123-charge-1' }),
      );
      expect(logger.log).toHaveBeenCalled();
    });

    it('should handle queue errors gracefully', async () => {
      const jobData: QueuedCreditChargeData = {
        amount: 100,
        description: 'Test deduction',
        idempotencyKey: 'charge-1',
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

    it('gives two charges for one org in the same millisecond distinct job ids', async () => {
      vi.setSystemTime(new Date('2026-10-03T00:00:00.000Z'));
      const base = {
        amount: 100,
        description: 'Test',
        organizationId: 'org-123',
        source: ActivitySource.VIDEO_GENERATION,
        type: 'deduct-credits',
        userId: 'user-456',
      } as const;

      await service.queueDeduction({ ...base, idempotencyKey: 'charge-a' });
      await service.queueDeduction({ ...base, idempotencyKey: 'charge-b' });

      const jobIds = vi
        .mocked(queue.add)
        .mock.calls.map((call) => call[2]?.jobId);
      expect(jobIds).toEqual([
        'credit-deduct-org-123-charge-a',
        'credit-deduct-org-123-charge-b',
      ]);
      expect(jobIds.join()).not.toContain(String(Date.now()));
    });

    it.each(['queueDeduction', 'queueByokUsage'] as const)(
      'refuses %s without an idempotency key instead of deriving a time based job id',
      async (method) => {
        const keyless = {
          amount: 100,
          description: 'Test',
          organizationId: 'org-123',
          source: ActivitySource.VIDEO_GENERATION,
          type: 'deduct-credits',
          userId: 'user-456',
        } as const;

        // @ts-expect-error The key is required by the type; this proves the runtime guard too.
        await expect(service[method](keyless)).rejects.toThrow(
          BadRequestException,
        );
        expect(queue.add).not.toHaveBeenCalled();
      },
    );

    it('should use a deterministic job ID when an idempotency key is supplied', async () => {
      const jobData: QueuedCreditChargeData = {
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
      const jobData: QueuedCreditChargeData = {
        amount: 2,
        description: 'Composer image generation',
        idempotencyKey: 'generation:composer-generation-execution-1',
        organizationId: 'org-123',
        source: ActivitySource.IMAGE_GENERATION,
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

    it('should queue BYOK usage job successfully', async () => {
      const jobData: QueuedCreditChargeData = {
        amount: 50,
        description: 'BYOK usage',
        idempotencyKey: 'byok-1',
        organizationId: 'org-789',
        source: ActivitySource.SCRIPT,
        type: 'record-byok-usage',
      };

      vi.mocked(queue.add).mockResolvedValue(undefined as never);

      await service.queueByokUsage(jobData);

      expect(queue.add).toHaveBeenCalledWith(
        'record-byok-usage',
        jobData,
        expect.objectContaining({ jobId: 'byok-usage-org-789-byok-1' }),
      );
      expect(logger.log).toHaveBeenCalled();
    });

    it('should handle BYOK queue errors', async () => {
      const jobData: QueuedCreditChargeData = {
        amount: 50,
        description: 'BYOK usage',
        idempotencyKey: 'byok-1',
        organizationId: 'org-789',
        source: ActivitySource.SCRIPT,
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
      const jobData: QueuedCreditChargeData = {
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
