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
    sendArticleNotification: vi.fn(),
    sendChromaticNotification: vi.fn(),
    sendIngredientNotification: vi.fn(),
    sendLowCreditsAlert: vi.fn(),
    sendModelDiscoveryNotification: vi.fn(),
    sendPostCard: vi.fn(),
    sendStreakNotification: vi.fn(),
    sendUserCreatedNotification: vi.fn(),
    sendVercelNotification: vi.fn(),
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

    it('warns and skips malformed events', async () => {
      await service.onModuleInit();
      subscriber?.({ not: 'an event' });
      await flushAsyncWork();

      expect(loggerService.warn).toHaveBeenCalledWith(
        'Received malformed notification event - skipping',
        expect.any(Object),
      );
    });

    it('stops retrying after three attempts', async () => {
      const timeoutSpy = vi
        .spyOn(globalThis, 'setTimeout')
        .mockReturnValue(1 as unknown as ReturnType<typeof setTimeout>);
      mockResendService.sendEmail.mockRejectedValue(new Error('boom'));

      await service.onModuleInit();
      subscriber?.({
        action: 'send_email',
        payload: { html: '<p>x</p>', subject: 'S', to: 'a@b.c' },
        retryCount: 3,
        type: 'email',
      });
      await flushAsyncWork();

      expect(timeoutSpy).not.toHaveBeenCalled();
      expect(redisService.publish).not.toHaveBeenCalled();
    });

    it('warns on unknown event types', async () => {
      await service.onModuleInit();
      subscriber?.({ action: 'noop', payload: {}, type: 'pigeon' });
      await flushAsyncWork();

      expect(loggerService.warn).toHaveBeenCalledWith(
        'Unknown event type: pigeon',
        expect.any(Object),
      );
    });
  });

  describe('discord actions', () => {
    async function emit(action: string, payload: unknown): Promise<void> {
      await service.onModuleInit();
      subscriber?.({ action, payload, type: 'discord' });
      await flushAsyncWork();
    }

    it('dispatches ingredient notifications with narrowed fields', async () => {
      await emit('ingredient_notification', {
        category: 'VIDEO',
        cdnUrl: 'https://cdn/vid.mp4',
        ingredient: {
          brand: { label: 'Acme' },
          id: 'ing-1',
          metadata: { duration: 4 },
          prompt: { original: 'prompt' },
          thumbnailUrl: 'https://cdn/thumb.png',
        },
      });

      expect(
        mockDiscordService.sendIngredientNotification,
      ).toHaveBeenCalledWith('VIDEO', 'https://cdn/vid.mp4', {
        brand: { label: 'Acme' },
        id: 'ing-1',
        metadata: { duration: 4 },
        prompt: { original: 'prompt' },
        thumbnailUrl: 'https://cdn/thumb.png',
      });
    });

    it('skips ingredient notifications missing cdnUrl or ingredient', async () => {
      await emit('ingredient_notification', { category: 'IMAGE' });

      expect(
        mockDiscordService.sendIngredientNotification,
      ).not.toHaveBeenCalled();
      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('missing cdnUrl/ingredient'),
        expect.any(Object),
      );
    });

    it('skips ingredient notifications missing ingredient.id', async () => {
      await emit('ingredient_notification', {
        cdnUrl: 'https://cdn/img.png',
        ingredient: { label: 'no id here' },
      });

      expect(
        mockDiscordService.sendIngredientNotification,
      ).not.toHaveBeenCalled();
      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('missing ingredient.id'),
        expect.any(Object),
      );
    });

    it('dispatches post notifications', async () => {
      await emit('post_notification', {
        externalId: 'p-1',
        platform: 'instagram',
      });

      expect(mockDiscordService.sendPostCard).toHaveBeenCalledWith({
        externalId: 'p-1',
        platform: 'instagram',
      });
    });

    it('dispatches article notifications', async () => {
      await emit('article_notification', { label: 'Post', slug: 'post' });

      expect(mockDiscordService.sendArticleNotification).toHaveBeenCalledWith({
        label: 'Post',
        slug: 'post',
      });
    });

    it('dispatches vercel notifications', async () => {
      await emit('vercel_notification', { embed: { title: 'Deploy' } });

      expect(mockDiscordService.sendVercelNotification).toHaveBeenCalledWith({
        title: 'Deploy',
      });
    });

    it('dispatches chromatic notifications', async () => {
      await emit('chromatic_notification', { embed: { title: 'Chromatic' } });

      expect(mockDiscordService.sendChromaticNotification).toHaveBeenCalledWith(
        { title: 'Chromatic' },
      );
    });

    it('dispatches user created notifications', async () => {
      await emit('user_notification', { id: 'u-1' });

      expect(
        mockDiscordService.sendUserCreatedNotification,
      ).toHaveBeenCalledWith({ id: 'u-1' });
    });

    it('dispatches model discovery notifications', async () => {
      await emit('model_discovery', { modelKey: 'flux' });

      expect(
        mockDiscordService.sendModelDiscoveryNotification,
      ).toHaveBeenCalledWith({ modelKey: 'flux' });
    });

    it('dispatches low credits alerts', async () => {
      await emit('low_credits_alert', { balance: 3, organizationId: 'o-1' });

      expect(mockDiscordService.sendLowCreditsAlert).toHaveBeenCalledWith({
        balance: 3,
        organizationId: 'o-1',
      });
    });

    it('dispatches streak notifications with card payloads', async () => {
      await emit('streak_milestone', {
        card: { color: 0x123456, description: '5 days', title: 'Milestone' },
      });

      expect(mockDiscordService.sendStreakNotification).toHaveBeenCalledWith({
        color: 0x123456,
        description: '5 days',
        title: 'Milestone',
      });
    });

    it('falls back to streak defaults when card is missing', async () => {
      await emit('streak_broken', {});

      expect(mockDiscordService.sendStreakNotification).toHaveBeenCalledWith({
        color: 0xf97316,
        description: '',
        title: 'GenFeed streak',
      });
    });

    it('warns on unknown discord actions', async () => {
      await emit('mystery', {});

      expect(loggerService.warn).toHaveBeenCalledWith(
        'Unknown Discord action: mystery',
        expect.any(Object),
      );
    });
  });

  describe('telegram actions', () => {
    async function emit(action: string, payload: unknown): Promise<void> {
      await service.onModuleInit();
      subscriber?.({ action, payload, type: 'telegram' });
      await flushAsyncWork();
    }

    it('sends photos for ingredient notifications with labels', async () => {
      await emit('ingredient_notification', {
        cdnUrl: 'https://cdn/img.png',
        chatId: 'chat-1',
        ingredient: { label: 'Sunset' },
      });

      expect(mockTelegramService.sendPhoto).toHaveBeenCalledWith(
        'chat-1',
        'https://cdn/img.png',
        '*Sunset*\nGenerated with GenFeed AI',
      );
    });

    it('sends photos without labels using the default caption', async () => {
      await emit('ingredient_notification', {
        cdnUrl: 'https://cdn/img.png',
        chatId: 'chat-1',
      });

      expect(mockTelegramService.sendPhoto).toHaveBeenCalledWith(
        'chat-1',
        'https://cdn/img.png',
        'Generated with GenFeed AI',
      );
    });

    it('skips ingredient notifications without chat id', async () => {
      await emit('ingredient_notification', { cdnUrl: 'https://cdn/img.png' });

      expect(mockTelegramService.sendPhoto).not.toHaveBeenCalled();
    });

    it('sends post notifications with title and description', async () => {
      await emit('post_notification', {
        chatId: 'chat-1',
        description: 'Description',
        title: 'Title',
      });

      expect(mockTelegramService.sendMessage).toHaveBeenCalledWith(
        'chat-1',
        '*New Post:* Title\nDescription',
      );
    });

    it('sends generic post notification without title', async () => {
      await emit('post_notification', { chatId: 'chat-1' });

      expect(mockTelegramService.sendMessage).toHaveBeenCalledWith(
        'chat-1',
        'New post published',
      );
    });

    it('sends direct messages', async () => {
      await emit('send_message', { chatId: 'chat-1', message: 'Hello' });

      expect(mockTelegramService.sendMessage).toHaveBeenCalledWith(
        'chat-1',
        'Hello',
      );
    });

    it('warns on unknown telegram actions', async () => {
      await emit('mystery', {});

      expect(loggerService.warn).toHaveBeenCalledWith(
        'Unknown Telegram action: mystery',
        expect.any(Object),
      );
    });
  });

  describe('email actions', () => {
    async function emit(action: string, payload: unknown): Promise<void> {
      await service.onModuleInit();
      subscriber?.({ action, payload, type: 'email' });
      await flushAsyncWork();
    }

    it('sends raw emails with defaults for missing fields', async () => {
      await emit('send_email', { to: 'a@b.c' });

      expect(mockResendService.sendEmail).toHaveBeenCalledWith({
        from: undefined,
        html: '',
        subject: 'Genfeed notification',
        to: 'a@b.c',
      });
    });

    it('sends raw emails passing through explicit fields', async () => {
      await emit('send_email', {
        from: 'noreply@genfeed.ai',
        html: '<p>hi</p>',
        subject: 'Hi',
        to: 'a@b.c',
      });

      expect(mockResendService.sendEmail).toHaveBeenCalledWith({
        from: 'noreply@genfeed.ai',
        html: '<p>hi</p>',
        subject: 'Hi',
        to: 'a@b.c',
      });
    });

    it('sends crm lead outreach emails with idempotency key', async () => {
      await emit('crm_lead_outreach', {
        company: 'Acme <Corp>',
        leadId: 'lead-1',
        leadName: 'Jane',
        to: 'jane@acme.com',
      });

      expect(mockResendService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: 'crm-contacted/lead-1',
          subject: 'Genfeed.ai for Acme <Corp>',
          to: 'jane@acme.com',
        }),
      );
      const args = mockResendService.sendEmail.mock.calls[0][0] as {
        html: string;
      };
      expect(args.html).toContain('Hi Jane,');
      expect(args.html).toContain('Acme &lt;Corp&gt;');
    });

    it('defaults crm outreach subject and names when fields are empty', async () => {
      await emit('crm_lead_outreach', {
        leadId: 'lead-2',
        leadName: '',
        to: 'x@y.z',
      });

      expect(mockResendService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Genfeed.ai for your team',
        }),
      );
      const args = mockResendService.sendEmail.mock.calls[0][0] as {
        html: string;
      };
      expect(args.html).toContain('Hi there,');
    });

    it('sends video success emails with a cta', async () => {
      await emit('video_status_email', {
        jobId: 'job-1',
        path: '/videos/1',
        status: 'completed',
        to: 'a@b.c',
        url: 'https://app.genfeed.ai/videos/1',
      });

      expect(mockResendService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: 'video-status/job-1/completed',
          subject: 'Your Genfeed video is ready',
          to: 'a@b.c',
        }),
      );
      const args = mockResendService.sendEmail.mock.calls[0][0] as {
        html: string;
      };
      expect(args.html).toContain('View Video');
    });

    it('sends video failure emails including the error', async () => {
      await emit('video_status_email', {
        error: 'GPU exploded',
        path: '/videos/2',
        status: 'failed',
        to: 'a@b.c',
      });

      expect(mockResendService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: 'video-status//videos/2/failed',
          subject: 'Your Genfeed video failed',
          text: 'Your video job failed: GPU exploded',
        }),
      );
    });

    it('sends workflow completion emails', async () => {
      await emit('workflow_status_email', {
        status: 'completed',
        to: 'a@b.c',
        workflowId: 'wf-1',
        workflowLabel: 'Daily Posts',
      });

      expect(mockResendService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: 'workflow-status/wf-1/completed',
          subject: 'Workflow completed: Daily Posts',
          text: 'Your workflow Daily Posts completed successfully.',
        }),
      );
    });

    it('sends workflow failure emails including the error', async () => {
      await emit('workflow_status_email', {
        error: 'node crashed',
        status: 'failed',
        to: 'a@b.c',
        workflowId: 'wf-1',
        workflowLabel: 'Daily Posts',
      });

      expect(mockResendService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Workflow failed: Daily Posts',
          text: 'Your workflow Daily Posts failed: node crashed',
        }),
      );
    });

    it('sends review gate pending emails with caption preview and cta', async () => {
      await emit('review_gate_pending', {
        captionPreview: 'Look at <this>',
        executionId: 'exec-1',
        nodeId: 'node-1',
        reviewUrl: 'https://app.genfeed.ai/review/1',
        to: 'a@b.c',
        workflowLabel: 'Daily Posts',
      });

      expect(mockResendService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: 'review-gate-pending/exec-1/node-1',
          subject: 'Review needed: Daily Posts',
        }),
      );
      const args = mockResendService.sendEmail.mock.calls[0][0] as {
        html: string;
      };
      expect(args.html).toContain('Look at &lt;this&gt;');
      expect(args.html).toContain('Open Review');
    });

    it('sends review gate pending emails without optional fields', async () => {
      await emit('review_gate_pending', {
        executionId: 'exec-2',
        to: 'a@b.c',
        workflowLabel: 'Daily Posts',
      });

      expect(mockResendService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: 'review-gate-pending/exec-2/',
        }),
      );
    });

    it('skips undeliverable low credits alert emails with a warning', async () => {
      await emit('low_credits_alert', { balance: 0, organizationId: 'o-1' });

      expect(mockResendService.sendEmail).not.toHaveBeenCalled();
      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('low_credits_alert email skipped'),
        expect.any(Object),
      );
    });

    it('warns on unknown email actions', async () => {
      await emit('mystery', {});

      expect(loggerService.warn).toHaveBeenCalledWith(
        'Unknown Email action: mystery',
        expect.any(Object),
      );
    });
  });

  describe('slack actions', () => {
    async function emit(action: string, payload: unknown): Promise<void> {
      await service.onModuleInit();
      subscriber?.({ action, payload, type: 'slack' });
      await flushAsyncWork();
    }

    it('sends files for ingredient notifications', async () => {
      await emit('ingredient_notification', {
        cdnUrl: 'https://cdn/img.png',
        chatId: 'C123',
        ingredient: { label: 'Sunset' },
      });

      expect(mockSlackService.sendFile).toHaveBeenCalledWith(
        'C123',
        'https://cdn/img.png',
        '*Sunset*\nGenerated with GenFeed AI',
      );
    });

    it('skips ingredient notifications without channel', async () => {
      await emit('ingredient_notification', { cdnUrl: 'https://cdn/img.png' });

      expect(mockSlackService.sendFile).not.toHaveBeenCalled();
    });

    it('sends post notification messages', async () => {
      await emit('post_notification', {
        chatId: 'C123',
        description: 'Description',
        title: 'Title',
      });

      expect(mockSlackService.sendMessage).toHaveBeenCalledWith(
        'C123',
        '*New Post:* Title\nDescription',
      );
    });

    it('sends fallback post notification without title', async () => {
      await emit('post_notification', { chatId: 'C123' });

      expect(mockSlackService.sendMessage).toHaveBeenCalledWith(
        'C123',
        'New post published',
      );
    });

    it('sends direct messages', async () => {
      await emit('send_message', { chatId: 'C123', message: 'Hello' });

      expect(mockSlackService.sendMessage).toHaveBeenCalledWith(
        'C123',
        'Hello',
      );
    });

    it('warns on unknown slack actions', async () => {
      await emit('mystery', {});

      expect(loggerService.warn).toHaveBeenCalledWith(
        'Unknown Slack action: mystery',
        expect.any(Object),
      );
    });
  });

  describe('chatbot actions', () => {
    async function emit(action: string, payload: unknown): Promise<void> {
      await service.onModuleInit();
      subscriber?.({ action, payload, type: 'chatbot' });
      await flushAsyncWork();
    }

    it('warns on unhandled send_message action', async () => {
      await emit('send_message', {});

      expect(loggerService.warn).toHaveBeenCalledWith(
        'Unhandled Chatbot action: send_message',
        expect.any(Object),
      );
    });

    it('warns on unknown chatbot actions', async () => {
      await emit('mystery', {});

      expect(loggerService.warn).toHaveBeenCalledWith(
        'Unknown Chatbot action: mystery',
        expect.any(Object),
      );
    });
  });
});
