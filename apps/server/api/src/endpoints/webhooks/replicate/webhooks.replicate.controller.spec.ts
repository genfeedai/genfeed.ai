import { AssetsService } from '@api/collections/assets/services/assets.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { TrainingsService } from '@api/collections/trainings/services/trainings.service';
import { ConfigService } from '@api/config/config.service';
import { ReplicateWebhookController } from '@api/endpoints/webhooks/replicate/webhooks.replicate.controller';
import { ReplicateWebhookService } from '@api/endpoints/webhooks/replicate/webhooks.replicate.service';
import { WebhooksService } from '@api/endpoints/webhooks/webhooks.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

vi.mock('replicate', () => ({
  validateWebhook: vi.fn().mockResolvedValue(true),
}));

vi.mock('@libs/utils/caller/caller.util', () => ({
  CallerUtil: {
    getCallerName: vi.fn().mockReturnValue('replicate callback'),
  },
}));

describe('ReplicateWebhookController', () => {
  let controller: ReplicateWebhookController;
  let _replicateWebhookService: vi.Mocked<ReplicateWebhookService>;
  let loggerService: vi.Mocked<LoggerService>;

  const mockRequest = {
    body: {},
    headers: {},
    ip: '127.0.0.1',
  } as unknown as Request;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReplicateWebhookController],
      providers: [
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn().mockReturnValue(null), // No signing secret — skips validation
            isProduction: false,
          },
        },
        {
          provide: ReplicateWebhookService,
          useValue: {
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
          provide: ModelsService,
          useValue: {
            findOne: vi.fn(),
          },
        },
        {
          provide: WebhooksService,
          useValue: {
            handleFailedGeneration: vi.fn(),
            processAssetFromWebhook: vi.fn(),
            processMediaFromWebhook: vi.fn(),
          },
        },
        {
          provide: TrainingsService,
          useValue: {
            findOne: vi.fn().mockResolvedValue(null),
            patch: vi.fn(),
          },
        },
        {
          provide: AssetsService,
          useValue: {
            findOne: vi.fn().mockResolvedValue(null),
            patch: vi.fn(),
          },
        },
        {
          provide: NotificationsPublisherService,
          useValue: {
            publishAssetStatus: vi.fn(),
            publishTrainingStatus: vi.fn(),
          },
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ReplicateWebhookController>(
      ReplicateWebhookController,
    );
    _replicateWebhookService = module.get(ReplicateWebhookService);
    loggerService = module.get(LoggerService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('handleCallback', () => {
    it('should handle callback successfully and return webhook processed', async () => {
      const body = {
        id: 'pred_123',
        output: ['result.png'],
        status: 'succeeded',
      };

      const result = await controller.handleCallback(mockRequest, body);

      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('replicate callback received'),
        body,
      );
      expect(result).toEqual({ detail: 'Webhook processed' });
    });

    it('should log validation skipped in non-production environment', async () => {
      const body = {
        id: 'pred_456',
        output: ['result.png'],
        status: 'succeeded',
      };

      await controller.handleCallback(mockRequest, body);

      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('validation skipped'),
      );
    });

    it('should rethrow error when validation fails', async () => {
      const body = { error: 'Model failed', id: 'pred_err', status: 'failed' };

      // Set up config to have signing secret and isProduction = true so validation runs
      const configService = controller['configService'] as ConfigService;
      vi.spyOn(configService, 'get').mockReturnValue('mock-secret');
      Object.defineProperty(configService, 'isProduction', {
        configurable: true,
        value: true,
      });

      // Make validateWebhook return false so the controller throws UNAUTHORIZED
      const replicate = await import('replicate');
      (replicate.validateWebhook as vi.Mock).mockResolvedValue(false);

      await expect(
        controller.handleCallback(mockRequest, body),
      ).rejects.toThrow();

      expect(loggerService.error).toHaveBeenCalled();
    });
  });
});
