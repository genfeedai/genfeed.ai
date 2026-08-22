import {
  EmailDeliveryError,
  NotificationEvent,
  NotificationsService,
} from '@api/services/notifications/notifications.service';
import { ParseMode } from '@genfeedai/enums';
import { testId } from '@helpers/testing/test-id.helper';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import Redis from 'ioredis';

const { mockSafeFetch } = vi.hoisted(() => ({
  mockSafeFetch: vi.fn(),
}));

vi.mock('@libs/security/destination-guard', () => ({
  safeFetch: mockSafeFetch,
}));

// Mock ioredis module
vi.mock('ioredis', () => ({
  default: vi.fn(function mockRedisConstructor() {
    return {
      connect: vi.fn(),
      on: vi.fn(),
      publish: vi.fn(),
      quit: vi.fn(),
      status: 'ready',
    };
  }),
}));

describe('NotificationsService', () => {
  let service: NotificationsService;
  let configService: { get: ReturnType<typeof vi.fn> };
  let loggerService: vi.Mocked<LoggerService>;
  let mockPublisher: vi.Mocked<Partial<Redis>>;

  beforeEach(async () => {
    mockPublisher = {
      connect: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      publish: vi.fn().mockResolvedValue(1),
      quit: vi.fn().mockResolvedValue(undefined),
      removeAllListeners: vi.fn(),
      status: 'ready',
    };

    vi.mocked(Redis).mockImplementation(function mockRedisConstructor() {
      return mockPublisher as unknown as Redis;
    });

    configService = {
      get: vi.fn().mockImplementation((key: string) => {
        const config: Record<string, string> = {
          GENFEEDAI_API_KEY: 'internal-api-key',
          GENFEEDAI_MICROSERVICES_NOTIFICATIONS_URL:
            'http://notifications:3011',
          REDIS_URL: 'redis://localhost:6379',
        };
        return config[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: ConfigService,
          useValue: configService,
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

    service = module.get<NotificationsService>(NotificationsService);
    module.get<ConfigService>(ConfigService);
    loggerService = module.get<LoggerService>(
      LoggerService,
    ) as vi.Mocked<LoggerService>;

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should connect to Redis successfully', async () => {
      await service.onModuleInit();

      expect(mockPublisher.connect).toHaveBeenCalled();
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('initialized successfully'),
      );
    });

    it('should handle connection errors', async () => {
      const error = new Error('Connection failed');
      (mockPublisher.connect as vi.Mock).mockRejectedValue(error);

      await service.onModuleInit();

      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('failed to connect'),
        error,
      );
    });

    it('should not block startup when Redis connect hangs', async () => {
      vi.useFakeTimers();
      try {
        (mockPublisher.connect as vi.Mock).mockReturnValue(
          new Promise(() => {}),
        );

        const init = service.onModuleInit();
        await vi.advanceTimersByTimeAsync(5_000);
        await init;

        expect(loggerService.warn).toHaveBeenCalledWith(
          expect.stringContaining('failed to connect'),
          expect.objectContaining({
            message: expect.stringContaining('timed out'),
          }),
        );
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('onModuleDestroy', () => {
    it('should disconnect from Redis successfully', async () => {
      await service.onModuleDestroy();

      expect(mockPublisher.quit).toHaveBeenCalled();
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('disconnected'),
      );
    });

    it('should handle disconnection errors', async () => {
      const error = new Error('Disconnection failed');
      (mockPublisher.quit as vi.Mock).mockRejectedValue(error);

      await service.onModuleDestroy();

      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('failed to disconnect'),
        error,
      );
    });

    it('should skip quit when publisher is already closed', async () => {
      mockPublisher.status = 'end';

      await service.onModuleDestroy();

      expect(mockPublisher.quit).not.toHaveBeenCalled();
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('disconnected'),
      );
    });
  });

  describe('sendNotification', () => {
    it('should send notification successfully', async () => {
      const event: NotificationEvent = {
        action: 'send_message',
        payload: { message: 'Hello' },
        type: 'telegram',
      };

      await service.sendNotification(event);

      expect(mockPublisher.publish).toHaveBeenCalledWith(
        'notifications',
        expect.stringContaining('telegram'),
      );
      expect(loggerService.debug).toHaveBeenCalledWith(
        'Published notification: telegram:send_message',
      );
    });

    it('should reconnect before publishing when the publisher is closed', async () => {
      mockPublisher.status = 'end';
      (mockPublisher.connect as vi.Mock).mockImplementationOnce(async () => {
        mockPublisher.status = 'ready';
      });

      const event: NotificationEvent = {
        action: 'send_message',
        payload: { message: 'Hello' },
        type: 'telegram',
      };

      await service.sendNotification(event);

      expect(mockPublisher.connect).toHaveBeenCalled();
      expect(mockPublisher.publish).toHaveBeenCalled();
    });

    it('should add timestamp to notification event', async () => {
      const event: NotificationEvent = {
        action: 'send_email',
        payload: { to: 'test@example.com' },
        type: 'email',
      };

      await service.sendNotification(event);

      const publishCall = (mockPublisher.publish as vi.Mock).mock.calls[0];
      const publishedData = JSON.parse(publishCall[1]);
      expect(publishedData.timestamp).toBeDefined();
      expect(new Date(publishedData.timestamp)).toBeInstanceOf(Date);
    });

    it('should handle publish errors', async () => {
      const error = new Error('Publish failed');
      (mockPublisher.publish as vi.Mock).mockRejectedValueOnce(error);

      const event: NotificationEvent = {
        action: 'send_message',
        payload: {},
        type: 'discord',
      };

      await expect(service.sendNotification(event)).rejects.toThrow(error);
      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to send notification',
        error,
      );
    });

    it('should swallow client-closed errors without throwing', async () => {
      const closedError = new Error('Connection is closed.');
      (mockPublisher.publish as vi.Mock).mockRejectedValueOnce(closedError);

      const event: NotificationEvent = {
        action: 'vercel_notification',
        payload: {},
        type: 'discord',
      };

      await expect(service.sendNotification(event)).resolves.toBeUndefined();
      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('Redis client closed'),
        expect.objectContaining({
          action: 'vercel_notification',
          isShuttingDown: false,
        }),
      );
    });

    it('should skip publishing while shutting down', async () => {
      await service.onModuleDestroy();

      const event: NotificationEvent = {
        action: 'send_message',
        payload: {},
        type: 'discord',
      };

      await expect(service.sendNotification(event)).resolves.toBeUndefined();

      expect(mockPublisher.publish).not.toHaveBeenCalled();
      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'skipped notification publish because Redis publisher is unavailable',
        ),
        expect.objectContaining({
          action: 'send_message',
          type: 'discord',
        }),
      );
    });

    it('should include userId and organizationId when provided', async () => {
      const organizationId = testId('org');
      const userId = testId('user');
      const event: NotificationEvent = {
        action: 'send_message',
        organizationId,
        payload: {},
        type: 'bot',
        userId,
      };

      await service.sendNotification(event);

      const publishCall = (mockPublisher.publish as vi.Mock).mock.calls[0];
      const publishedData = JSON.parse(publishCall[1]);
      expect(publishedData.userId).toBe(userId);
      expect(publishedData.organizationId).toBe(organizationId);
    });
  });

  describe('sendTelegramMessage', () => {
    it('should send telegram message', async () => {
      const chatId = '123456789';
      const message = 'Test message';
      const options = { parse_mode: ParseMode.HTML };

      await service.sendTelegramMessage(chatId, message, options);

      expect(mockPublisher.publish).toHaveBeenCalled();
      const publishCall = (mockPublisher.publish as vi.Mock).mock.calls[0];
      const publishedData = JSON.parse(publishCall[1]);

      expect(publishedData.type).toBe('telegram');
      expect(publishedData.action).toBe('send_message');
      expect(publishedData.payload.chatId).toBe(chatId);
      expect(publishedData.payload.message).toBe(message);
      expect(publishedData.payload.options).toEqual(options);
    });

    it('should send telegram message without options', async () => {
      const chatId = '123456789';
      const message = 'Test message';

      await service.sendTelegramMessage(chatId, message);

      expect(mockPublisher.publish).toHaveBeenCalled();
      const publishCall = (mockPublisher.publish as vi.Mock).mock.calls[0];
      const publishedData = JSON.parse(publishCall[1]);

      expect(publishedData.payload.options).toBeUndefined();
    });
  });

  describe('sendEmail', () => {
    it('should send email', async () => {
      const to = 'test@example.com';
      const subject = 'Test Subject';
      const html = '<p>Test content</p>';
      const from = 'sender@example.com';

      await service.sendEmail(to, subject, html, from);

      expect(mockPublisher.publish).toHaveBeenCalled();
      const publishCall = (mockPublisher.publish as vi.Mock).mock.calls[0];
      const publishedData = JSON.parse(publishCall[1]);

      expect(publishedData.type).toBe('email');
      expect(publishedData.action).toBe('send_email');
      expect(publishedData.payload.to).toBe(to);
      expect(publishedData.payload.subject).toBe(subject);
      expect(publishedData.payload.html).toBe(html);
      expect(publishedData.payload.from).toBe(from);
    });

    it('should send email without from address', async () => {
      const to = 'test@example.com';
      const subject = 'Test Subject';
      const html = '<p>Test content</p>';

      await service.sendEmail(to, subject, html);

      expect(mockPublisher.publish).toHaveBeenCalled();
      const publishCall = (mockPublisher.publish as vi.Mock).mock.calls[0];
      const publishedData = JSON.parse(publishCall[1]);

      expect(publishedData.payload.from).toBeUndefined();
    });
  });

  describe('deliverEmail', () => {
    const payload = {
      html: '<p>Test content</p>',
      idempotencyKey: 'auth/magic-link/link_123',
      subject: 'Test Subject',
      to: 'test@example.com',
    };

    it('waits for the notifications service to accept the email', async () => {
      mockSafeFetch.mockResolvedValue(
        new Response(JSON.stringify({ emailId: 'email_123' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        }),
      );

      await expect(service.deliverEmail(payload)).resolves.toBe('email_123');

      expect(mockSafeFetch).toHaveBeenCalledWith(
        new URL('http://notifications:3011/v1/internal/email-deliveries'),
        expect.objectContaining({
          body: JSON.stringify(payload),
          headers: {
            Authorization: 'Bearer internal-api-key',
            'Content-Type': 'application/json',
          },
          method: 'POST',
          signal: expect.any(AbortSignal),
        }),
        {
          allowedOrigins: ['http://notifications:3011'],
          allowPrivateNetwork: true,
        },
      );
      expect(mockPublisher.publish).not.toHaveBeenCalled();
    });

    it('classifies a notifications gateway 502 as retryable', async () => {
      mockSafeFetch.mockResolvedValue(
        new Response(
          JSON.stringify({ message: 'Provider rejected delivery' }),
          { status: 502 },
        ),
      );

      await expect(service.deliverEmail(payload)).rejects.toEqual(
        expect.objectContaining<Partial<EmailDeliveryError>>({
          cause: expect.objectContaining({
            message: 'Notifications service returned HTTP 502',
          }),
          message: 'Email delivery failed (status 502)',
          retryable: true,
          statusCode: 502,
        }),
      );
      expect(loggerService.error).toHaveBeenCalledWith(
        'NotificationsService synchronous email delivery failed',
        expect.objectContaining({ message: expect.any(String) }),
        { statusCode: 502 },
      );
    });

    it('preserves an explicit permanent provider rejection', async () => {
      mockSafeFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            message: 'Email provider rejected delivery',
            retryable: false,
          }),
          {
            headers: { 'Content-Type': 'application/json' },
            status: 422,
          },
        ),
      );

      await expect(service.deliverEmail(payload)).rejects.toEqual(
        expect.objectContaining<Partial<EmailDeliveryError>>({
          retryable: false,
          statusCode: 422,
        }),
      );
    });

    it('treats internal authentication failures as retryable infrastructure errors', async () => {
      mockSafeFetch.mockResolvedValue(
        new Response(JSON.stringify({ message: 'Unauthorized' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 401,
        }),
      );

      await expect(service.deliverEmail(payload)).rejects.toEqual(
        expect.objectContaining<Partial<EmailDeliveryError>>({
          retryable: true,
          statusCode: 401,
        }),
      );
    });

    it('rejects a malformed success response', async () => {
      mockSafeFetch.mockResolvedValue(
        new Response(JSON.stringify({ emailId: '' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        }),
      );

      await expect(service.deliverEmail(payload)).rejects.toThrow(
        'Email delivery failed',
      );
    });

    it('fails closed when internal delivery configuration is missing', async () => {
      configService.get.mockImplementation((key: string) =>
        key === 'REDIS_URL' ? 'redis://localhost:6379' : undefined,
      );

      await expect(service.deliverEmail(payload)).rejects.toThrow(
        'Email delivery failed',
      );
      expect(mockSafeFetch).not.toHaveBeenCalled();
    });

    it('converts transport and timeout failures to a safe error', async () => {
      mockSafeFetch.mockRejectedValue(new Error('socket exposed detail'));

      await expect(service.deliverEmail(payload)).rejects.toThrow(
        'Email delivery failed',
      );
      expect(loggerService.error).toHaveBeenCalledWith(
        'NotificationsService synchronous email delivery failed',
        expect.objectContaining({ message: 'socket exposed detail' }),
        undefined,
      );
    });
  });

  describe('sendChatbotMessage', () => {
    it('should send chatbot message', async () => {
      const sessionId = 'session-123';
      const message = 'Bot message';
      const metadata = { userId: testId('user') };

      await service.sendChatbotMessage(sessionId, message, metadata);

      expect(mockPublisher.publish).toHaveBeenCalled();
      const publishCall = (mockPublisher.publish as vi.Mock).mock.calls[0];
      const publishedData = JSON.parse(publishCall[1]);

      expect(publishedData.type).toBe('bot');
      expect(publishedData.action).toBe('send_message');
      expect(publishedData.payload.sessionId).toBe(sessionId);
      expect(publishedData.payload.message).toBe(message);
      expect(publishedData.payload.metadata).toEqual(metadata);
    });

    it('should send chatbot message without metadata', async () => {
      const sessionId = 'session-123';
      const message = 'Bot message';

      await service.sendChatbotMessage(sessionId, message);

      expect(mockPublisher.publish).toHaveBeenCalled();
      const publishCall = (mockPublisher.publish as vi.Mock).mock.calls[0];
      const publishedData = JSON.parse(publishCall[1]);

      expect(publishedData.payload.metadata).toBeUndefined();
    });
  });

  describe('sendPostNotification', () => {
    it('should send publication notification', async () => {
      const post = {
        description: 'New video published',
        externalId: 'video-123',
        platform: 'youtube',
        platforms: [
          { platform: 'youtube', url: 'https://youtube.com/watch?v=123' },
          { platform: 'tiktok', url: 'https://tiktok.com/@user/video/123' },
        ],
        videoUrl: 'https://example.com/video.mp4',
      };

      await service.sendPostNotification(post);

      expect(mockPublisher.publish).toHaveBeenCalled();
      const publishCall = (mockPublisher.publish as vi.Mock).mock.calls[0];
      const publishedData = JSON.parse(publishCall[1]);

      expect(publishedData.type).toBe('discord');
      expect(publishedData.action).toBe('post_notification');
      expect(publishedData.payload).toEqual(post);
    });

    it('should send publication notification with minimal data', async () => {
      const post = {
        externalId: 'tweet-123',
        platform: 'twitter',
      };

      await service.sendPostNotification(post);

      expect(mockPublisher.publish).toHaveBeenCalled();
      const publishCall = (mockPublisher.publish as vi.Mock).mock.calls[0];
      const publishedData = JSON.parse(publishCall[1]);

      expect(publishedData.payload.platform).toBe('twitter');
      expect(publishedData.payload.externalId).toBe('tweet-123');
    });
  });

  describe('sendArticleNotification', () => {
    it('should send article notification', async () => {
      const article = {
        category: 'Technology',
        label: 'Test Article',
        publicUrl: 'https://example.com/articles/test-article',
        slug: 'test-article',
        summary: 'This is a test article',
      };

      await service.sendArticleNotification(article);

      expect(mockPublisher.publish).toHaveBeenCalled();
      const publishCall = (mockPublisher.publish as vi.Mock).mock.calls[0];
      const publishedData = JSON.parse(publishCall[1]);

      expect(publishedData.type).toBe('discord');
      expect(publishedData.action).toBe('article_notification');
      expect(publishedData.payload).toEqual(article);
    });

    it('should send article notification with minimal data', async () => {
      const article = {
        label: 'Test Article',
        slug: 'test-article',
      };

      await service.sendArticleNotification(article);

      expect(mockPublisher.publish).toHaveBeenCalled();
      const publishCall = (mockPublisher.publish as vi.Mock).mock.calls[0];
      const publishedData = JSON.parse(publishCall[1]);

      expect(publishedData.payload.label).toBe('Test Article');
      expect(publishedData.payload.slug).toBe('test-article');
    });
  });
});
