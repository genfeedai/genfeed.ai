import { ReplyBotConfig } from '@api/collections/reply-bot-configs/schemas/reply-bot-config.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { RateLimitService } from '@api/services/reply-bot/rate-limit.service';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';

describe('RateLimitService', () => {
  let service: RateLimitService;

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockReplyBotConfigModel = {
    findById: vi.fn(),
    findOne: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimitService,
        { provide: LoggerService, useValue: mockLoggerService },
        {
          provide: getModelToken(ReplyBotConfig.name, DB_CONNECTIONS.CLOUD),
          useValue: mockReplyBotConfigModel,
        },
      ],
    }).compile();

    service = module.get<RateLimitService>(RateLimitService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkRateLimit', () => {
    const botConfigId = '507f1f77bcf86cd799439011';
    const orgId = '507f1f77bcf86cd799439022';

    it('should return not allowed when bot config is not found', async () => {
      mockReplyBotConfigModel.findOne.mockResolvedValue(null);

      const result = await service.checkRateLimit(botConfigId, orgId);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Bot configuration not found');
    });

    it('should return not allowed when bot is inactive', async () => {
      mockReplyBotConfigModel.findOne.mockResolvedValue({
        isActive: false,
        rateLimits: { maxRepliesPerDay: 50, maxRepliesPerHour: 10 },
      });

      const result = await service.checkRateLimit(botConfigId, orgId);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Bot is paused');
    });

    it('should return allowed when within rate limits', async () => {
      mockReplyBotConfigModel.findOne.mockResolvedValue({
        isActive: true,
        rateLimits: { maxRepliesPerDay: 50, maxRepliesPerHour: 10 },
      });

      const result = await service.checkRateLimit(botConfigId, orgId);

      expect(result.allowed).toBe(true);
      expect(result.remainingHourly).toBe(9);
      expect(result.remainingDaily).toBe(49);
    });

    it('should return not allowed when hourly limit exceeded', async () => {
      mockReplyBotConfigModel.findOne.mockResolvedValue({
        isActive: true,
        rateLimits: { maxRepliesPerDay: 50, maxRepliesPerHour: 2 },
      });

      // Increment counter to hit hourly limit
      service.incrementCounter(botConfigId);
      service.incrementCounter(botConfigId);

      const result = await service.checkRateLimit(botConfigId, orgId);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Hourly rate limit exceeded');
      expect(result.remainingHourly).toBe(0);
    });

    it('should return not allowed when daily limit exceeded', async () => {
      mockReplyBotConfigModel.findOne.mockResolvedValue({
        isActive: true,
        rateLimits: { maxRepliesPerDay: 3, maxRepliesPerHour: 100 },
      });

      service.incrementCounter(botConfigId);
      service.incrementCounter(botConfigId);
      service.incrementCounter(botConfigId);

      const result = await service.checkRateLimit(botConfigId, orgId);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Daily rate limit exceeded');
      expect(result.remainingDaily).toBe(0);
    });

    it('should use default limits when rateLimits is not set', async () => {
      mockReplyBotConfigModel.findOne.mockResolvedValue({
        isActive: true,
        rateLimits: {},
      });

      const result = await service.checkRateLimit(botConfigId, orgId);

      expect(result.allowed).toBe(true);
      expect(result.remainingHourly).toBe(9); // default 10 - 1
      expect(result.remainingDaily).toBe(49); // default 50 - 1
    });

    it('should return not allowed on error', async () => {
      mockReplyBotConfigModel.findOne.mockRejectedValue(new Error('DB error'));

      const result = await service.checkRateLimit(botConfigId, orgId);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Rate limit check failed');
    });
  });

  describe('incrementCounter', () => {
    it('should increment both hourly and daily counters', () => {
      const botConfigId = 'bot-123';

      service.incrementCounter(botConfigId);
      service.incrementCounter(botConfigId);

      expect(mockLoggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('incrementCounter'),
        expect.objectContaining({ daily: 2, hourly: 2 }),
      );
    });

    it('should initialize counter if not exists and then increment', () => {
      const botConfigId = 'new-bot';

      service.incrementCounter(botConfigId);

      expect(mockLoggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('incrementCounter'),
        expect.objectContaining({ daily: 1, hourly: 1 }),
      );
    });
  });

  describe('getUsageStats', () => {
    const botConfigId = '507f1f77bcf86cd799439011';
    const orgId = '507f1f77bcf86cd799439022';

    it('should return null when bot config not found', async () => {
      mockReplyBotConfigModel.findOne.mockResolvedValue(null);

      const result = await service.getUsageStats(botConfigId, orgId);

      expect(result).toBeNull();
    });

    it('should return usage stats for existing bot', async () => {
      mockReplyBotConfigModel.findOne.mockResolvedValue({
        rateLimits: { maxRepliesPerDay: 100, maxRepliesPerHour: 20 },
      });

      service.incrementCounter(botConfigId);
      service.incrementCounter(botConfigId);

      const result = await service.getUsageStats(botConfigId, orgId);

      expect(result).not.toBeNull();
      expect(result!.hourlyUsed).toBe(2);
      expect(result!.dailyUsed).toBe(2);
      expect(result!.hourlyLimit).toBe(20);
      expect(result!.dailyLimit).toBe(100);
      expect(result!.hourlyResetAt).toBeInstanceOf(Date);
      expect(result!.dailyResetAt).toBeInstanceOf(Date);
    });

    it('should return null on error', async () => {
      mockReplyBotConfigModel.findOne.mockRejectedValue(new Error('DB error'));

      const result = await service.getUsageStats(botConfigId, orgId);

      expect(result).toBeNull();
    });
  });

  describe('isWithinSchedule', () => {
    it('should return true when schedule is not enabled', () => {
      const botConfig = {
        schedule: { enabled: false },
      } as unknown as ReplyBotConfig;

      expect(service.isWithinSchedule(botConfig)).toBe(true);
    });

    it('should return true when no schedule is set', () => {
      const botConfig = {} as unknown as ReplyBotConfig;

      expect(service.isWithinSchedule(botConfig)).toBe(true);
    });

    it('should return true when activeDays is empty', () => {
      const botConfig = {
        schedule: { activeDays: [], enabled: true },
      } as unknown as ReplyBotConfig;

      expect(service.isWithinSchedule(botConfig)).toBe(true);
    });

    it('should return false when current day is not in activeDays', () => {
      // Use a day that definitely won't match the current day
      const now = new Date();
      const currentDay = now
        .toLocaleDateString('en-US', { weekday: 'long' })
        .toLowerCase();
      const otherDays = [
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
        'sunday',
      ].filter((d) => d !== currentDay);

      const botConfig = {
        schedule: {
          activeDays: [otherDays[0]],
          enabled: true,
        },
      } as unknown as ReplyBotConfig;

      expect(service.isWithinSchedule(botConfig)).toBe(false);
    });
  });

  describe('checkCooldown', () => {
    const botConfigId = '507f1f77bcf86cd799439011';
    const targetUserId = 'user-123';

    it('should return not allowed when bot config not found', async () => {
      mockReplyBotConfigModel.findById.mockResolvedValue(null);

      const result = await service.checkCooldown(
        botConfigId,
        targetUserId,
        new Date(),
      );

      expect(result.allowed).toBe(false);
    });

    it('should return not allowed when within cooldown period', async () => {
      mockReplyBotConfigModel.findById.mockResolvedValue({
        rateLimits: { cooldownMinutes: 60 },
      });

      const lastReplyTime = new Date(Date.now() - 30 * 60 * 1000); // 30 min ago

      const result = await service.checkCooldown(
        botConfigId,
        targetUserId,
        lastReplyTime,
      );

      expect(result.allowed).toBe(false);
      expect(result.remainingSeconds).toBeGreaterThan(0);
    });

    it('should return allowed when cooldown has passed', async () => {
      mockReplyBotConfigModel.findById.mockResolvedValue({
        rateLimits: { cooldownMinutes: 60 },
      });

      const lastReplyTime = new Date(Date.now() - 120 * 60 * 1000); // 2 hours ago

      const result = await service.checkCooldown(
        botConfigId,
        targetUserId,
        lastReplyTime,
      );

      expect(result.allowed).toBe(true);
    });

    it('should use default 60 min cooldown when not specified', async () => {
      mockReplyBotConfigModel.findById.mockResolvedValue({
        rateLimits: {},
      });

      const lastReplyTime = new Date(Date.now() - 120 * 60 * 1000); // 2 hours ago

      const result = await service.checkCooldown(
        botConfigId,
        targetUserId,
        lastReplyTime,
      );

      expect(result.allowed).toBe(true);
    });
  });

  describe('clearAllCounters', () => {
    it('should clear all counters', () => {
      service.incrementCounter('bot-1');
      service.incrementCounter('bot-2');

      service.clearAllCounters();

      expect(mockLoggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('clearAllCounters'),
        expect.objectContaining({ message: 'All rate limit counters cleared' }),
      );
    });
  });

  describe('clearBotCounter', () => {
    it('should clear counter for a specific bot', () => {
      service.incrementCounter('bot-1');

      service.clearBotCounter('bot-1');

      expect(mockLoggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('clearBotCounter'),
        expect.objectContaining({ botConfigId: 'bot-1' }),
      );
    });
  });
});
