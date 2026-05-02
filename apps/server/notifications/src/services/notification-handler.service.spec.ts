import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { DiscordService } from '@notifications/services/discord/discord.service';
import { NotificationHandlerService } from '@notifications/services/notification-handler.service';
import { ResendService } from '@notifications/services/resend/resend.service';

describe('NotificationHandlerService', () => {
  let service: NotificationHandlerService;
  let loggerService: LoggerService;
  let redisService: RedisService;

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockRedisService = {
    publish: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  };

  const mockDiscordService = {
    sendNotification: vi.fn(),
  };

  const mockResendService = {
    sendEmail: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationHandlerService,
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: DiscordService,
          useValue: mockDiscordService,
        },
        {
          provide: ResendService,
          useValue: mockResendService,
        },
      ],
    }).compile();

    service = module.get<NotificationHandlerService>(
      NotificationHandlerService,
    );

    loggerService = module.get(LoggerService);
    redisService = module.get(RedisService);

    loggerService.log('NotificationHandlerService initialized');
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should subscribe to notifications on init', async () => {
      await service.onModuleInit();

      expect(redisService.subscribe).toHaveBeenCalledWith(
        'notifications',
        expect.any(Function),
      );
    });
  });
});
