import { StreaksService } from '@api/collections/streaks/services/streaks.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { CronStreaksService } from '@workers/crons/streaks/cron.streaks.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('CronStreaksService', () => {
  let service: CronStreaksService;
  let streaksService: { processStaleStreaks: ReturnType<typeof vi.fn> };
  let loggerService: {
    log: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  const mockStreakResult = {
    expired: 5,
    maintained: 12,
    processed: 17,
  };

  beforeEach(async () => {
    streaksService = {
      processStaleStreaks: vi.fn().mockResolvedValue(mockStreakResult),
    };

    loggerService = {
      error: vi.fn(),
      log: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronStreaksService,
        {
          provide: StreaksService,
          useValue: streaksService,
        },
        {
          provide: LoggerService,
          useValue: loggerService,
        },
      ],
    }).compile();

    service = module.get(CronStreaksService);
  });

  describe('processStreaks', () => {
    it('should call streaksService.processStaleStreaks', async () => {
      await service.processStreaks();

      expect(streaksService.processStaleStreaks).toHaveBeenCalledOnce();
    });

    it('should log completion with the result', async () => {
      await service.processStreaks();

      expect(loggerService.log).toHaveBeenCalledWith(
        'CronStreaksService completed',
        mockStreakResult,
      );
    });

    it('should resolve without throwing on success', async () => {
      await expect(service.processStreaks()).resolves.toBeUndefined();
    });

    it('should propagate errors from streaksService', async () => {
      const err = new Error('DB failure');
      streaksService.processStaleStreaks.mockRejectedValue(err);

      await expect(service.processStreaks()).rejects.toThrow('DB failure');
    });

    it('should log the exact result returned by streaksService', async () => {
      const specificResult = { expired: 0, maintained: 100, processed: 100 };
      streaksService.processStaleStreaks.mockResolvedValue(specificResult);

      await service.processStreaks();

      expect(loggerService.log).toHaveBeenCalledWith(
        'CronStreaksService completed',
        specificResult,
      );
    });

    it('should call processStaleStreaks without arguments (uses current date)', async () => {
      await service.processStreaks();

      expect(streaksService.processStaleStreaks).toHaveBeenCalledWith();
    });

    it('should handle empty result object from streaksService', async () => {
      streaksService.processStaleStreaks.mockResolvedValue({});

      await expect(service.processStreaks()).resolves.toBeUndefined();
      expect(loggerService.log).toHaveBeenCalledWith(
        'CronStreaksService completed',
        {},
      );
    });

    it('should be instantiated as a NestJS provider', () => {
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(CronStreaksService);
    });
  });
});
