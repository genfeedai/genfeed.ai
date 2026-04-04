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

  afterEach(() => {
    vi.clearAllMocks();
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
  });
});
