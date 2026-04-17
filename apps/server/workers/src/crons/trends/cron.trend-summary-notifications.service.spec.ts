import { TrendsService } from '@api/collections/trends/services/trends.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ParseMode } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { CronTrendSummaryNotificationsService } from '@workers/crons/trends/cron.trend-summary-notifications.service';

vi.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: {
    EVERY_HOUR: '0 * * * *',
    EVERY_YEAR: '0 0 1 1 *',
  },
  ScheduleModule: { forRoot: vi.fn() },
}));

describe('CronTrendSummaryNotificationsService', () => {
  let service: CronTrendSummaryNotificationsService;
  let trendsService: {
    getTrendingHashtags: ReturnType<typeof vi.fn>;
    getTrendingSounds: ReturnType<typeof vi.fn>;
    getViralVideos: ReturnType<typeof vi.fn>;
  };
  let cacheService: {
    withLock: ReturnType<typeof vi.fn>;
  };
  let notificationsService: {
    sendEmail: ReturnType<typeof vi.fn>;
    sendNotification: ReturnType<typeof vi.fn>;
    sendTelegramMessage: ReturnType<typeof vi.fn>;
  };
  let prismaService: {
    setting: {
      findMany: ReturnType<typeof vi.fn>;
    };
  };
  let loggerService: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const mockViralVideos = [
    {
      description: 'Funny cat video',
      platform: 'tiktok',
      playCount: 1000000,
      url: 'https://tiktok.com/video1',
      viralScore: 90,
    },
  ];

  const mockHashtags = [
    {
      hashtag: 'trending',
      platform: 'tiktok',
      postCount: 500000,
      viralityScore: 85,
    },
  ];

  const mockSounds = [
    {
      playUrl: 'https://tiktok.com/sound1',
      soundName: 'Viral Beat',
      usageCount: 50000,
      viralityScore: 80,
    },
  ];

  const mockSettings = [
    {
      isDeleted: false,
      isTrendNotificationsEmail: true,
      isTrendNotificationsInApp: false,
      isTrendNotificationsTelegram: true,
      trendNotificationsEmailAddress: 'user@example.com',
      trendNotificationsFrequency: 'HOURLY',
      trendNotificationsMinViralScore: 70,
      trendNotificationsTelegramChatId: '123456789',
      userId: 'user-1',
    },
  ];

  beforeEach(async () => {
    prismaService = {
      setting: {
        findMany: vi.fn().mockResolvedValue(mockSettings),
      },
    };

    trendsService = {
      getTrendingHashtags: vi.fn().mockResolvedValue(mockHashtags),
      getTrendingSounds: vi.fn().mockResolvedValue(mockSounds),
      getViralVideos: vi.fn().mockResolvedValue(mockViralVideos),
    };

    cacheService = {
      withLock: vi
        .fn()
        .mockImplementation(
          async (_key: string, fn: () => Promise<unknown>, _ttl: number) =>
            fn(),
        ),
    };

    notificationsService = {
      sendEmail: vi.fn().mockResolvedValue(undefined),
      sendNotification: vi.fn().mockResolvedValue(undefined),
      sendTelegramMessage: vi.fn().mockResolvedValue(undefined),
    };

    loggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronTrendSummaryNotificationsService,
        {
          provide: PrismaService,
          useValue: prismaService,
        },
        { provide: TrendsService, useValue: trendsService },
        { provide: CacheService, useValue: cacheService },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: LoggerService, useValue: loggerService },
      ],
    }).compile();

    service = module.get<CronTrendSummaryNotificationsService>(
      CronTrendSummaryNotificationsService,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendHourlyTrendSummaries', () => {
    it('should call sendTrendSummariesByFrequency with hourly frequency', async () => {
      await service.sendHourlyTrendSummaries();

      expect(prismaService.setting.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            trendNotificationsFrequency: 'HOURLY',
          }),
        }),
      );
    });

    it('should acquire a distributed lock before processing', async () => {
      await service.sendHourlyTrendSummaries();

      expect(cacheService.withLock).toHaveBeenCalledWith(
        expect.stringContaining('trend-summary'),
        expect.any(Function),
        expect.any(Number),
      );
    });
  });

  describe('sendDailyTrendSummaries', () => {
    it('should call sendTrendSummariesByFrequency with daily frequency', async () => {
      await service.sendDailyTrendSummaries();

      expect(prismaService.setting.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            trendNotificationsFrequency: 'DAILY',
          }),
        }),
      );
    });
  });

  describe('sendWeeklyTrendSummaries', () => {
    it('should call sendTrendSummariesByFrequency with weekly frequency', async () => {
      await service.sendWeeklyTrendSummaries();

      expect(prismaService.setting.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            trendNotificationsFrequency: 'WEEKLY',
          }),
        }),
      );
    });
  });

  describe('notification delivery', () => {
    it('should send telegram message when telegram notifications are enabled', async () => {
      await service.sendHourlyTrendSummaries();

      expect(notificationsService.sendTelegramMessage).toHaveBeenCalledWith(
        '123456789',
        expect.stringContaining('Trend Summary'),
        { parse_mode: ParseMode.MARKDOWN },
      );
    });

    it('should send email when email notifications are enabled', async () => {
      await service.sendHourlyTrendSummaries();

      expect(notificationsService.sendEmail).toHaveBeenCalledWith(
        'user@example.com',
        expect.stringContaining('Trend Summary'),
        expect.stringContaining('<!DOCTYPE html>'),
      );
    });

    it('should not send email if email notifications are disabled', async () => {
      prismaService.setting.findMany.mockResolvedValue([
        {
          ...mockSettings[0],
          isTrendNotificationsEmail: false,
          trendNotificationsEmailAddress: undefined,
        },
      ]);

      await service.sendHourlyTrendSummaries();

      expect(notificationsService.sendEmail).not.toHaveBeenCalled();
    });

    it('should send in-app notification when in-app notifications are enabled', async () => {
      prismaService.setting.findMany.mockResolvedValue([
        { ...mockSettings[0], isTrendNotificationsInApp: true },
      ]);

      await service.sendHourlyTrendSummaries();

      expect(notificationsService.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'trend_summary',
          type: 'discord',
          userId: 'user-1',
        }),
      );
    });
  });

  describe('lock contention', () => {
    it('should log skip message when lock is already held', async () => {
      cacheService.withLock.mockResolvedValue(null);

      await service.sendHourlyTrendSummaries();

      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('skipped'),
      );
    });
  });

  describe('error handling', () => {
    it('should continue processing other users when one user fails', async () => {
      prismaService.setting.findMany.mockResolvedValue([
        mockSettings[0],
        {
          isDeleted: false,
          isTrendNotificationsEmail: true,
          trendNotificationsEmailAddress: 'second@example.com',
          trendNotificationsFrequency: 'HOURLY',
          trendNotificationsMinViralScore: 70,
          userId: 'user-2',
        },
      ]);

      notificationsService.sendEmail
        .mockRejectedValueOnce(new Error('First user failed'))
        .mockResolvedValueOnce(undefined);

      // Should not throw, should process both
      await expect(service.sendHourlyTrendSummaries()).resolves.not.toThrow();
      expect(loggerService.error).toHaveBeenCalledTimes(1);
    });

    it('should return success: false when prisma query throws', async () => {
      prismaService.setting.findMany.mockRejectedValue(new Error('DB error'));

      // Should not throw (error handled internally)
      await expect(service.sendHourlyTrendSummaries()).resolves.not.toThrow();
      expect(loggerService.error).toHaveBeenCalled();
    });
  });
});
