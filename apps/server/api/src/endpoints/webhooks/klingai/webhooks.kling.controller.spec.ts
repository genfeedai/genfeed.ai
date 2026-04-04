import { KlingWebhookController } from '@api/endpoints/webhooks/klingai/webhooks.kling.controller';
import { KlingWebhookService } from '@api/endpoints/webhooks/klingai/webhooks.kling.service';
import { WebhooksService } from '@api/endpoints/webhooks/webhooks.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

vi.mock('@libs/utils/caller/caller.util', () => ({
  CallerUtil: {
    getCallerName: vi.fn().mockReturnValue('kling callback'),
  },
}));

describe('KlingWebhookController', () => {
  let controller: KlingWebhookController;
  let klingWebhookService: vi.Mocked<KlingWebhookService>;
  let loggerService: vi.Mocked<LoggerService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [KlingWebhookController],
      providers: [
        {
          provide: KlingWebhookService,
          useValue: {
            extractMediaUrls: vi
              .fn()
              .mockReturnValue({ imageUrls: [], videoUrls: [] }),
            handleCallback: vi.fn(),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        {
          provide: WebhooksService,
          useValue: {
            handleFailedGeneration: vi.fn(),
            processMediaFromWebhook: vi.fn(),
          },
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<KlingWebhookController>(KlingWebhookController);
    klingWebhookService = module.get(KlingWebhookService);
    loggerService = module.get(LoggerService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('handleCallback', () => {
    it('should handle callback successfully', async () => {
      const body = { task_id: '123', task_status: 'failed' };
      klingWebhookService.handleCallback.mockResolvedValue(undefined);

      const result = await controller.handleCallback(body);

      expect(loggerService.log).toHaveBeenCalledWith(
        'KlingWebhookController kling callback received',
        body,
      );
      expect(result).toEqual({
        message: 'Webhook processed successfully',
        success: true,
      });
    });

    it('should invoke klingWebhookService when custom_id is present', async () => {
      const body = {
        custom_id: 'custom_123',
        task_id: '123',
        task_status: 'succeed',
      };
      klingWebhookService.handleCallback.mockResolvedValue(undefined);

      await controller.handleCallback(body);

      expect(klingWebhookService.handleCallback).toHaveBeenCalledWith(body);
    });

    it('should process media URLs on succeed status', async () => {
      const webhooksService = controller[
        'webhooksService'
      ] as vi.Mocked<WebhooksService>;
      webhooksService.processMediaFromWebhook = vi
        .fn()
        .mockResolvedValue(undefined);

      klingWebhookService.extractMediaUrls.mockReturnValue({
        imageUrls: ['https://cdn.kling.ai/image.jpg'],
        videoUrls: [],
      });

      const body = {
        task_id: 'task_456',
        task_result: {},
        task_status: 'succeed',
      };

      await controller.handleCallback(body);

      expect(webhooksService.processMediaFromWebhook).toHaveBeenCalledWith(
        'klingai',
        expect.any(String),
        'task_456',
        'https://cdn.kling.ai/image.jpg',
      );
    });

    it('should rethrow error when callback handling fails', async () => {
      const body = {
        custom_id: 'cb_err',
        task_id: '456',
        task_status: 'failed',
      };
      const error = new Error('Processing failed');
      klingWebhookService.handleCallback.mockRejectedValue(error);

      await expect(controller.handleCallback(body)).rejects.toThrow(
        'Processing failed',
      );

      expect(loggerService.error).toHaveBeenCalledWith(
        'KlingWebhookController kling callback failed',
        error,
      );
    });
  });
});
