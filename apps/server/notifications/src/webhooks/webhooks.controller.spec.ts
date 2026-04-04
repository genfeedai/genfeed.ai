import { Test, type TestingModule } from '@nestjs/testing';
import type { WebhookNotification } from '@notifications/shared/interfaces/webhooks.interface';
import { WebhooksController } from '@notifications/webhooks/webhooks.controller';
import { WebhooksService } from '@notifications/webhooks/webhooks.service';

describe('WebhooksController', () => {
  let controller: WebhooksController;
  let webhooksService: WebhooksService;

  const mockWebhooksService = {
    getWebhookStatus: vi.fn(),
    handleWebhookNotification: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        {
          provide: WebhooksService,
          useValue: mockWebhooksService,
        },
      ],
    }).compile();

    controller = module.get<WebhooksController>(WebhooksController);
    webhooksService = module.get<WebhooksService>(WebhooksService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('notify', () => {
    it('should handle webhook notification', async () => {
      const notification: WebhookNotification = {
        data: {
          output: 'https://example.com/result.mp4',
        },
        id: 'job_123',
        service: 'replicate',
        status: 'completed',
      };

      mockWebhooksService.handleWebhookNotification.mockResolvedValue(
        undefined,
      );

      const result = await controller.notify(notification);

      expect(webhooksService.handleWebhookNotification).toHaveBeenCalledWith(
        notification,
      );
      expect(result).toEqual({
        message: 'Notification received',
        success: true,
      });
    });

    it('should handle different service types', async () => {
      const notification: WebhookNotification = {
        data: {
          error: 'Processing failed',
        },
        id: 'video_456',
        service: 'openai',
        status: 'failed',
      };

      mockWebhooksService.handleWebhookNotification.mockResolvedValue(
        undefined,
      );

      const result = await controller.notify(notification);

      expect(result.success).toBe(true);
    });
  });

  describe('getStatus', () => {
    it('should return webhook status', async () => {
      const service = 'replicate';
      const id = 'job_123';
      const mockStatus = {
        id,
        service,
        status: 'completed',
        updatedAt: new Date(),
      };

      mockWebhooksService.getWebhookStatus.mockResolvedValue(mockStatus);

      const result = await controller.getStatus(service, id);

      expect(webhooksService.getWebhookStatus).toHaveBeenCalledWith(
        service,
        id,
      );
      expect(result).toEqual(mockStatus);
    });

    it('should handle different services', async () => {
      const service = 'openai';
      const id = 'video_789';
      const mockStatus = {
        id,
        service,
        status: 'processing',
        updatedAt: new Date(),
      };

      mockWebhooksService.getWebhookStatus.mockResolvedValue(mockStatus);

      const result = await controller.getStatus(service, id);

      expect(result.service).toBe('openai');
      expect(result.id).toBe('video_789');
    });
  });
});
