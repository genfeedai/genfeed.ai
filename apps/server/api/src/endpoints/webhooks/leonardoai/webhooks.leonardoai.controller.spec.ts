import { LeonardoaiWebhookController } from '@api/endpoints/webhooks/leonardoai/webhooks.leonardoai.controller';
import { LeonardoaiWebhookService } from '@api/endpoints/webhooks/leonardoai/webhooks.leonardoai.service';
import { WebhooksService } from '@api/endpoints/webhooks/webhooks.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

vi.mock('@libs/utils/caller/caller.util', () => ({
  CallerUtil: {
    getCallerName: vi.fn().mockReturnValue('leonardoai callback'),
  },
}));

describe('LeonardoaiWebhookController', () => {
  let controller: LeonardoaiWebhookController;
  let leonardoaiWebhookService: vi.Mocked<LeonardoaiWebhookService>;
  let loggerService: vi.Mocked<LoggerService>;

  // Use a known allowed IP from the controller allowlist
  const mockRequest = {
    headers: { 'x-forwarded-for': '35.173.108.170' },
    ip: '35.173.108.170',
  } as unknown as Request;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LeonardoaiWebhookController],
      providers: [
        {
          provide: LeonardoaiWebhookService,
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
          provide: WebhooksService,
          useValue: {
            processMediaFromWebhook: vi.fn(),
          },
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<LeonardoaiWebhookController>(
      LeonardoaiWebhookController,
    );
    leonardoaiWebhookService = module.get(LeonardoaiWebhookService);
    loggerService = module.get(LoggerService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('handleCallback', () => {
    it('should handle callback successfully from allowed IP', async () => {
      const body = {
        customId: undefined,
        data: { object: { id: 'gen_123', images: [] } },
        type: 'image-generation.complete',
      };
      leonardoaiWebhookService.handleCallback.mockResolvedValue(undefined);

      const result = await controller.handleCallback(mockRequest, body);

      expect(loggerService.log).toHaveBeenCalledWith(
        'LeonardoaiWebhookController leonardoai callback received',
        body,
      );
      expect(result).toEqual({
        message: 'Webhook processed successfully',
        success: true,
      });
    });

    it('should invoke leonardoaiWebhookService when customId is present', async () => {
      const body = {
        customId: 'custom_123',
        data: { object: { id: 'gen_456', images: [] } },
        type: 'image-generation.complete',
      };
      leonardoaiWebhookService.handleCallback.mockResolvedValue(undefined);

      await controller.handleCallback(mockRequest, body);

      expect(leonardoaiWebhookService.handleCallback).toHaveBeenCalledWith(
        body,
      );
    });

    it('should throw when request comes from unauthorized IP', async () => {
      const unauthorizedRequest = {
        headers: {},
        ip: '1.2.3.4',
      } as unknown as Request;

      const body = {
        data: { object: { id: 'gen_789', images: [] } },
        type: 'image-generation.complete',
      };

      await expect(
        controller.handleCallback(unauthorizedRequest, body),
      ).rejects.toThrow('Unauthorized webhook request');

      expect(loggerService.warn).toHaveBeenCalledWith(
        'Unauthorized webhook request from IP: 1.2.3.4',
      );
    });

    it('should rethrow error when callback handling fails', async () => {
      const body = {
        customId: 'cb_err',
        data: { object: { id: 'gen_err', images: [] } },
        type: 'image-generation.complete',
      };
      const error = new Error('Generation processing failed');
      leonardoaiWebhookService.handleCallback.mockRejectedValue(error);

      await expect(
        controller.handleCallback(mockRequest, body),
      ).rejects.toThrow('Generation processing failed');

      expect(loggerService.error).toHaveBeenCalledWith(
        'LeonardoaiWebhookController leonardoai callback failed',
        error,
      );
    });
  });
});
