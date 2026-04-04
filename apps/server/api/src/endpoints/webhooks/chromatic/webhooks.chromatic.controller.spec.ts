import { ChromaticWebhookController } from '@api/endpoints/webhooks/chromatic/webhooks.chromatic.controller';
import { ChromaticWebhookService } from '@api/endpoints/webhooks/chromatic/webhooks.chromatic.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { LoggerService } from '@libs/logger/logger.service';
import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('ChromaticWebhookController', () => {
  let controller: ChromaticWebhookController;
  let chromaticWebhookService: vi.Mocked<ChromaticWebhookService>;
  let loggerService: vi.Mocked<LoggerService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChromaticWebhookController],
      providers: [
        {
          provide: ChromaticWebhookService,
          useValue: {
            handleWebhook: vi.fn(),
            validateSignature: vi.fn(),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            error: vi.fn(),
            log: vi.fn(),
          },
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ChromaticWebhookController>(
      ChromaticWebhookController,
    );
    chromaticWebhookService = module.get(ChromaticWebhookService);
    loggerService = module.get(LoggerService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('handleChromatic', () => {
    it('should handle webhook successfully with valid signature', async () => {
      const payload = {
        build: { id: '123', status: 'PASSED' },
        event: 'build.completed',
      };
      const signature = 'valid-signature';

      const mockRequest = {
        headers: {
          'x-chromatic-signature': signature,
        },
      } as unknown as Request;

      chromaticWebhookService.validateSignature.mockReturnValue(true);
      chromaticWebhookService.handleWebhook.mockResolvedValue(undefined);

      const result = await controller.handleChromatic(mockRequest, payload);

      expect(loggerService.log).toHaveBeenCalledWith(
        'ChromaticWebhookController handleChromatic received',
        payload,
      );
      expect(chromaticWebhookService.validateSignature).toHaveBeenCalledWith(
        Buffer.from(JSON.stringify(payload)),
        signature,
      );
      expect(chromaticWebhookService.handleWebhook).toHaveBeenCalledWith(
        payload,
      );
      expect(result).toEqual({ success: true });
    });

    it('should throw UnauthorizedException with invalid signature', async () => {
      const payload = {
        build: { id: '123', status: 'FAILED' },
        event: 'build.completed',
      };
      const signature = 'invalid-signature';

      const mockRequest = {
        headers: {
          'x-chromatic-signature': signature,
        },
      } as unknown as Request;

      chromaticWebhookService.validateSignature.mockReturnValue(false);

      await expect(
        controller.handleChromatic(mockRequest, payload),
      ).rejects.toThrow(UnauthorizedException);

      expect(chromaticWebhookService.validateSignature).toHaveBeenCalledWith(
        Buffer.from(JSON.stringify(payload)),
        signature,
      );
      expect(chromaticWebhookService.handleWebhook).not.toHaveBeenCalled();
    });

    it('should throw error when webhook handling fails', async () => {
      const payload = {
        build: { id: '123', status: 'FAILED' },
        event: 'build.completed',
      };
      const signature = 'valid-signature';
      const error = new Error('Webhook processing failed');

      const mockRequest = {
        headers: {
          'x-chromatic-signature': signature,
        },
      } as unknown as Request;

      chromaticWebhookService.validateSignature.mockReturnValue(true);
      chromaticWebhookService.handleWebhook.mockRejectedValue(error);

      await expect(
        controller.handleChromatic(mockRequest, payload),
      ).rejects.toThrow(error);

      expect(loggerService.log).toHaveBeenCalledWith(
        'ChromaticWebhookController handleChromatic received',
        payload,
      );
      expect(loggerService.error).toHaveBeenCalledWith(
        'ChromaticWebhookController handleChromatic failed',
        error,
      );
    });
  });
});
