import { EventsService } from '@libs/events/events.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { WebhooksService } from '@notifications/webhooks/webhooks.service';

describe('WebhooksService (Notifications)', () => {
  let service: WebhooksService;
  let loggerService: LoggerService;
  let eventsService: EventsService;

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockEventsService = {
    emit: vi.fn(),
    on: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
        {
          provide: EventsService,
          useValue: mockEventsService,
        },
      ],
    }).compile();

    service = module.get<WebhooksService>(WebhooksService);
    loggerService = module.get<LoggerService>(LoggerService);
    eventsService = module.get<EventsService>(EventsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleWebhookNotification', () => {
    it('should process webhook notification', async () => {
      const notification = {
        data: { amount: 100 },
        event: 'payment.success',
        metadata: { userId: 'user-123' },
        service: 'stripe',
      };

      await service.handleWebhookNotification(notification);

      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('started'),
        expect.any(Object),
      );
      expect(eventsService.emit).toHaveBeenCalledWith(
        'webhook.notification',
        expect.objectContaining({
          event: 'payment.success',
          service: 'stripe',
          type: 'webhook.stripe.payment.success',
        }),
      );
    });

    it('should emit user-specific event when userId is present', async () => {
      const notification = {
        data: { result: 'success' },
        event: 'generation.complete',
        metadata: { userId: 'user-456' },
        service: 'openai',
      };

      await service.handleWebhookNotification(notification);

      expect(eventsService.emit).toHaveBeenCalledWith(
        'user.user-456.webhook',
        expect.any(Object),
      );
    });

    it('should not emit user-specific event without userId', async () => {
      const notification = {
        data: {},
        event: 'ping',
        service: 'stripe',
      };

      await service.handleWebhookNotification(notification);

      expect(eventsService.emit).toHaveBeenCalledTimes(1);
      expect(eventsService.emit).toHaveBeenCalledWith(
        'webhook.notification',
        expect.objectContaining({ status: 'received' }),
      );
    });

    it('should preserve an explicit notification status', async () => {
      const notification = {
        data: {},
        event: 'ping',
        service: 'stripe',
        status: 'processed',
      };

      await service.handleWebhookNotification(notification);

      expect(eventsService.emit).toHaveBeenCalledWith(
        'webhook.notification',
        expect.objectContaining({ status: 'processed' }),
      );
    });

    it('should log and rethrow when emit fails', async () => {
      mockEventsService.emit.mockRejectedValueOnce(new Error('bus down'));

      await expect(
        service.handleWebhookNotification({
          data: {},
          event: 'ping',
          service: 'stripe',
        }),
      ).rejects.toThrow('bus down');

      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        expect.any(Error),
      );
    });
  });

  describe('getWebhookStatus', () => {
    it('should return a pending status snapshot', () => {
      const result = service.getWebhookStatus('stripe', 'evt-1');

      expect(result).toEqual({
        id: 'evt-1',
        service: 'stripe',
        status: 'pending',
        timestamp: expect.any(String),
      });
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('started'),
        { id: 'evt-1', service: 'stripe' },
      );
    });
  });
});
