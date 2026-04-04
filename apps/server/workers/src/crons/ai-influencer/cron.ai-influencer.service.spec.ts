import { AiInfluencerService } from '@api/services/ai-influencer/ai-influencer.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { CronAiInfluencerService } from '@workers/crons/ai-influencer/cron.ai-influencer.service';

describe('CronAiInfluencerService', () => {
  let service: CronAiInfluencerService;
  let aiInfluencerService: { scheduleDailyPosts: ReturnType<typeof vi.fn> };
  let cacheService: {
    acquireLock: ReturnType<typeof vi.fn>;
    releaseLock: ReturnType<typeof vi.fn>;
  };
  let logger: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronAiInfluencerService,
        {
          provide: AiInfluencerService,
          useValue: {
            scheduleDailyPosts: vi.fn().mockResolvedValue([
              { id: 'post-1', status: 'scheduled' },
              { id: 'post-2', status: 'scheduled' },
            ]),
          },
        },
        {
          provide: CacheService,
          useValue: {
            acquireLock: vi.fn().mockResolvedValue(true),
            releaseLock: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(CronAiInfluencerService);
    aiInfluencerService = module.get(AiInfluencerService);
    cacheService = module.get(CacheService);
    logger = module.get(LoggerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('runDailyInfluencerPosts', () => {
    it('acquires the lock before processing', async () => {
      await service.runDailyInfluencerPosts();
      expect(cacheService.acquireLock).toHaveBeenCalledWith(
        'cron:ai-influencer-daily',
        1800,
      );
    });

    it('calls scheduleDailyPosts when lock is acquired', async () => {
      await service.runDailyInfluencerPosts();
      expect(aiInfluencerService.scheduleDailyPosts).toHaveBeenCalledTimes(1);
    });

    it('releases the lock after successful completion', async () => {
      await service.runDailyInfluencerPosts();
      expect(cacheService.releaseLock).toHaveBeenCalledWith(
        'cron:ai-influencer-daily',
      );
    });

    it('logs the number of posts generated', async () => {
      await service.runDailyInfluencerPosts();
      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('2 posts generated'),
        'CronAiInfluencerService',
      );
    });

    it('skips processing when lock cannot be acquired', async () => {
      cacheService.acquireLock.mockResolvedValue(false);
      await service.runDailyInfluencerPosts();
      expect(aiInfluencerService.scheduleDailyPosts).not.toHaveBeenCalled();
      expect(cacheService.releaseLock).not.toHaveBeenCalled();
    });

    it('logs a debug message when lock is already held', async () => {
      cacheService.acquireLock.mockResolvedValue(false);
      await service.runDailyInfluencerPosts();
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('lock held'),
        'CronAiInfluencerService',
      );
    });

    it('releases lock even when scheduleDailyPosts throws', async () => {
      aiInfluencerService.scheduleDailyPosts.mockRejectedValue(
        new Error('Service unavailable'),
      );
      await service.runDailyInfluencerPosts();
      expect(cacheService.releaseLock).toHaveBeenCalledWith(
        'cron:ai-influencer-daily',
      );
    });

    it('logs error when scheduleDailyPosts throws', async () => {
      const err = new Error('Service unavailable');
      aiInfluencerService.scheduleDailyPosts.mockRejectedValue(err);
      await service.runDailyInfluencerPosts();
      expect(logger.error).toHaveBeenCalledWith(
        'AI influencer daily posts cycle failed',
        err,
        'CronAiInfluencerService',
      );
    });
  });
});
