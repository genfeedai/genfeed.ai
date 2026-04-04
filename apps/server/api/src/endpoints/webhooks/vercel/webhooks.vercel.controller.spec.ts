import { VercelWebhookController } from '@api/endpoints/webhooks/vercel/webhooks.vercel.controller';
import { VercelWebhookService } from '@api/endpoints/webhooks/vercel/webhooks.vercel.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { LoggerService } from '@libs/logger/logger.service';
import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('VercelWebhookController', () => {
  let controller: VercelWebhookController;
  let vercelWebhookService: vi.Mocked<VercelWebhookService>;
  let loggerService: vi.Mocked<LoggerService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VercelWebhookController],
      providers: [
        {
          provide: VercelWebhookService,
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

    controller = module.get<VercelWebhookController>(VercelWebhookController);
    vercelWebhookService = module.get(VercelWebhookService);
    loggerService = module.get(LoggerService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('handleVercel', () => {
    it('should handle webhook successfully with valid signature', async () => {
      const payload = { data: 'test', type: 'deployment.ready' };
      const signature = 'valid-signature';
      const rawBody = Buffer.from(JSON.stringify(payload));

      const mockRequest = {
        body: rawBody,
        headers: {
          'x-vercel-signature': signature,
        },
      } as unknown as Request;

      vercelWebhookService.validateSignature.mockReturnValue(true);
      vercelWebhookService.handleWebhook.mockResolvedValue(undefined);

      const result = await controller.handleVercel(mockRequest);

      expect(loggerService.log).toHaveBeenCalledWith(
        'VercelWebhookController handleVercel received',
        payload,
      );
      expect(vercelWebhookService.validateSignature).toHaveBeenCalledWith(
        rawBody,
        signature,
      );
      expect(vercelWebhookService.handleWebhook).toHaveBeenCalledWith(payload);
      expect(result).toEqual({ success: true });
    });

    it('should throw UnauthorizedException with invalid signature', async () => {
      const payload = { data: 'test', type: 'deployment.ready' };
      const signature = 'invalid-signature';
      const rawBody = Buffer.from(JSON.stringify(payload));

      const mockRequest = {
        body: rawBody,
        headers: {
          'x-vercel-signature': signature,
        },
      } as unknown as Request;

      vercelWebhookService.validateSignature.mockReturnValue(false);

      await expect(controller.handleVercel(mockRequest)).rejects.toThrow(
        UnauthorizedException,
      );

      expect(vercelWebhookService.validateSignature).toHaveBeenCalledWith(
        rawBody,
        signature,
      );
      expect(vercelWebhookService.handleWebhook).not.toHaveBeenCalled();
    });

    it('should throw error when webhook handling fails', async () => {
      const payload = { data: 'test', type: 'deployment.failed' };
      const signature = 'valid-signature';
      const rawBody = Buffer.from(JSON.stringify(payload));
      const error = new Error('Webhook processing failed');

      const mockRequest = {
        body: rawBody,
        headers: {
          'x-vercel-signature': signature,
        },
      } as unknown as Request;

      vercelWebhookService.validateSignature.mockReturnValue(true);
      vercelWebhookService.handleWebhook.mockRejectedValue(error);

      await expect(controller.handleVercel(mockRequest)).rejects.toThrow(error);

      expect(loggerService.log).toHaveBeenCalledWith(
        'VercelWebhookController handleVercel received',
        payload,
      );
      expect(loggerService.error).toHaveBeenCalledWith(
        'VercelWebhookController handleVercel failed',
        error,
      );
    });
  });
});
