import { TelegramDistributeProcessor } from '@api/queues/telegram-distribute/telegram-distribute.processor';
import { DistributionPlatform } from '@genfeedai/enums';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function createMocks() {
  const telegramDistributionService = {
    processScheduled: vi.fn().mockResolvedValue(undefined),
  };

  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  return { logger, telegramDistributionService };
}

describe('TelegramDistributeProcessor', () => {
  let processor: TelegramDistributeProcessor;
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(() => {
    mocks = createMocks();
    processor = new TelegramDistributeProcessor(
      mocks.telegramDistributionService as never,
      mocks.logger as never,
    );
  });

  describe('process', () => {
    it('should call processScheduled with scoped payload', async () => {
      const distributionId = new Types.ObjectId().toString();
      const organizationId = new Types.ObjectId().toString();
      const job = {
        data: {
          distributionId,
          organizationId,
          platform: DistributionPlatform.TELEGRAM,
        },
        updateProgress: vi.fn(),
      };

      await processor.process(job as never);

      expect(
        mocks.telegramDistributionService.processScheduled,
      ).toHaveBeenCalledWith({
        distributionId,
        organizationId,
        platform: DistributionPlatform.TELEGRAM,
      });
      expect(job.updateProgress).toHaveBeenCalledWith(10);
      expect(job.updateProgress).toHaveBeenCalledWith(100);
    });

    it('should propagate errors from processScheduled', async () => {
      const distributionId = new Types.ObjectId().toString();
      const organizationId = new Types.ObjectId().toString();
      const job = {
        data: {
          distributionId,
          organizationId,
          platform: DistributionPlatform.TELEGRAM,
        },
        updateProgress: vi.fn(),
      };

      mocks.telegramDistributionService.processScheduled = vi
        .fn()
        .mockRejectedValue(new Error('Bot token revoked'));

      await expect(processor.process(job as never)).rejects.toThrow(
        'Bot token revoked',
      );
    });

    it('should log start and completion messages', async () => {
      const distributionId = new Types.ObjectId().toString();
      const organizationId = new Types.ObjectId().toString();
      const job = {
        data: {
          distributionId,
          organizationId,
          platform: DistributionPlatform.TELEGRAM,
        },
        updateProgress: vi.fn(),
      };

      await processor.process(job as never);

      expect(mocks.logger.log).toHaveBeenCalledWith(
        expect.stringContaining(distributionId),
      );
      expect(mocks.logger.log).toHaveBeenCalledTimes(2);
    });

    it('should pass all job data fields to processScheduled', async () => {
      const distributionId = new Types.ObjectId().toString();
      const organizationId = new Types.ObjectId().toString();
      const platform = DistributionPlatform.TELEGRAM;
      const job = {
        data: { distributionId, organizationId, platform },
        updateProgress: vi.fn(),
      };

      await processor.process(job as never);

      expect(
        mocks.telegramDistributionService.processScheduled,
      ).toHaveBeenCalledWith({ distributionId, organizationId, platform });
    });

    it('should update progress to 10 before processing and 100 after', async () => {
      const job = {
        data: {
          distributionId: new Types.ObjectId().toString(),
          organizationId: new Types.ObjectId().toString(),
          platform: DistributionPlatform.TELEGRAM,
        },
        updateProgress: vi.fn(),
      };

      await processor.process(job as never);

      const calls = job.updateProgress.mock.calls.map((c: number[]) => c[0]);
      expect(calls).toEqual([10, 100]);
    });
  });
});
