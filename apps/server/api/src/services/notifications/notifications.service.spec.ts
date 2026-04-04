import { ConfigService } from '@api/config/config.service';
import {
  NotificationEvent,
  NotificationsService,
} from '@api/services/notifications/notifications.service';
import { ParseMode } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import * as redis from 'redis';
import { RedisClientType } from 'redis';

// Mock redis module
vi.mock('redis', () => ({
  createClient: vi.fn(() => ({
    connect: vi.fn(),
    isOpen: true,
    isReady: true,
    on: vi.fn(),
    publish: vi.fn(),
    quit: vi.fn(),
  })),
}));

describe('NotificationsService', () => {
  let service: NotificationsService;
  let loggerService: vi.Mocked<LoggerService>;
  let mockPublisher: vi.Mocked<Partial<RedisClientType>>;

  beforeEach(async () => {
    mockPublisher = {
      connect: vi.fn().mockResolvedValue(undefined),
      isOpen: true,
      isReady: true,
      on: vi.fn(),
      publish: vi.fn().mockResolvedValue(1),
      quit: vi.fn().mockResolvedValue(undefined),
      removeAllListeners: vi.fn(),
    };

    vi.mocked(redis.createClient).mockReturnValue(
      mockPublisher as unknown as ReturnType<typeof redis.createClient>,
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn().mockReturnValue('redis://localhost:6379'),
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

      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('failed to connect'),
        error,
      );
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
      mockPublisher.isOpen = false;

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
      mockPublisher.isOpen = false;
      mockPublisher.isReady = false;
      (mockPublisher.connect as vi.Mock).mockImplementationOnce(async () => {
        mockPublisher.isOpen = true;
        mockPublisher.isReady = true;
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
        action: 'send_card',
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
      const closedError = new Error('The client is closed');
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
        action: 'send_card',
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
          action: 'send_card',
          type: 'discord',
        }),
      );
    });

    it('should include userId and organizationId when provided', async () => {
      const event: NotificationEvent = {
        action: 'send_message',
        organizationId: '507f1f77bcf86cd799439012',
        payload: {},
        type: 'bot',
        userId: '507f1f77bcf86cd799439011',
      };

      await service.sendNotification(event);

      const publishCall = (mockPublisher.publish as vi.Mock).mock.calls[0];
      const publishedData = JSON.parse(publishCall[1]);
      expect(publishedData.userId).toBe('507f1f77bcf86cd799439011');
      expect(publishedData.organizationId).toBe('507f1f77bcf86cd799439012');
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

  describe('sendDiscordCard', () => {
    it('should send discord card', async () => {
      const card = {
        color: '#00ff00',
        description: 'Test Description',
        title: 'Test Card',
      };

      await service.sendDiscordCard(card);

      expect(mockPublisher.publish).toHaveBeenCalled();
      const publishCall = (mockPublisher.publish as vi.Mock).mock.calls[0];
      const publishedData = JSON.parse(publishCall[1]);

      expect(publishedData.type).toBe('discord');
      expect(publishedData.action).toBe('send_card');
      expect(publishedData.payload.card).toEqual(card);
    });
  });

  describe('sendChatbotMessage', () => {
    it('should send chatbot message', async () => {
      const sessionId = 'session-123';
      const message = 'Bot message';
      const metadata = { userId: '507f1f77bcf86cd799439011' };

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
