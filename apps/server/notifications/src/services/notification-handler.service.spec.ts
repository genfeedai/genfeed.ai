import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { DiscordService } from '@notifications/services/discord/discord.service';
import { NotificationHandlerService } from '@notifications/services/notification-handler.service';
import {
  ResendEmailDeliveryError,
  ResendService,
} from '@notifications/services/resend/resend.service';
import { SlackService } from '@notifications/services/slack/slack.service';
import { TelegramService } from '@notifications/services/telegram/telegram.service';

type NotificationSubscriber = (message: unknown) => void;

async function flushAsyncWork(): Promise<void> {
  for (let iteration = 0; iteration < 10; iteration += 1) {
    await Promise.resolve();
  }
}

describe('NotificationHandlerService', () => {
  let service: NotificationHandlerService;
  let loggerService: LoggerService;
  let redisService: RedisService;
  let subscriber: NotificationSubscriber | undefined;

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

  const mockSlackService = {
    sendFile: vi.fn(),
    sendMessage: vi.fn(),
  };

  const mockTelegramService = {
    sendMessage: vi.fn(),
    sendPhoto: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    subscriber = undefined;
    mockRedisService.publish.mockResolvedValue(undefined);
    mockRedisService.subscribe.mockImplementation(
      async (_channel: string, handler: NotificationSubscriber) => {
        subscriber = handler;
      },
    );
    mockResendService.sendEmail.mockResolvedValue(null);

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
        {
          provide: SlackService,
          useValue: mockSlackService,
        },
        {
          provide: TelegramService,
          useValue: mockTelegramService,
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

  afterEach(() => {
    vi.restoreAllMocks();
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

    it('republishes transient email failures for retry', async () => {
      let retryCallback: (() => void) | undefined;
      const timeoutSpy = vi
        .spyOn(globalThis, 'setTimeout')
        .mockImplementation((callback) => {
          retryCallback = callback as () => void;
          return 1 as unknown as ReturnType<typeof setTimeout>;
        });
      mockResendService.sendEmail.mockRejectedValue(
        new ResendEmailDeliveryError('Too many requests', {
          providerCode: 'rate_limit_exceeded',
          retryable: true,
          statusCode: 429,
        }),
      );

      await service.onModuleInit();
      subscriber?.({
        action: 'send_email',
        payload: {
          html: '<p>hello</p>',
          subject: 'Subject',
          to: 'test@example.com',
        },
        type: 'email',
      });
      await flushAsyncWork();

      expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), 5000);
      expect(retryCallback).toBeDefined();
      retryCallback?.();
      await flushAsyncWork();

      expect(redisService.publish).toHaveBeenCalledWith(
        'notifications',
        expect.objectContaining({
          action: 'send_email',
          retryCount: 1,
          type: 'email',
        }),
      );
    });

    it('surfaces permanent email failures without scheduling a retry', async () => {
      const timeoutSpy = vi
        .spyOn(globalThis, 'setTimeout')
        .mockReturnValue(1 as unknown as ReturnType<typeof setTimeout>);
      mockResendService.sendEmail.mockRejectedValue(
        new ResendEmailDeliveryError('Invalid recipient', {
          providerCode: 'validation_error',
          retryable: false,
          statusCode: 422,
        }),
      );

      await service.onModuleInit();
      subscriber?.({
        action: 'send_email',
        payload: {
          html: '<p>hello</p>',
          subject: 'Subject',
          to: 'invalid',
        },
        type: 'email',
      });
      await flushAsyncWork();

      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to handle event email:send_email',
        expect.any(ResendEmailDeliveryError),
        expect.objectContaining({
          providerCode: 'validation_error',
          retryable: false,
          statusCode: 422,
        }),
      );
      expect(timeoutSpy).not.toHaveBeenCalled();
      expect(redisService.publish).not.toHaveBeenCalled();
    });
  });
});
