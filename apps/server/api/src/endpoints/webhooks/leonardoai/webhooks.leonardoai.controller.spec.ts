import { LeonardoaiWebhookController } from '@api/endpoints/webhooks/leonardoai/webhooks.leonardoai.controller';
import { LeonardoaiWebhookService } from '@api/endpoints/webhooks/leonardoai/webhooks.leonardoai.service';
import { WebhooksService } from '@api/endpoints/webhooks/webhooks.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

vi.mock('@libs/utils/caller/caller.util', () => ({
  CallerUtil: {
    getCallerName: vi.fn().mockReturnValue('leonardoai callback'),
  },
}));

const WEBHOOK_SECRET = 'leonardo-webhook-secret';

describe('LeonardoaiWebhookController', () => {
  let controller: LeonardoaiWebhookController;
  let leonardoaiWebhookService: vi.Mocked<LeonardoaiWebhookService>;
  let loggerService: vi.Mocked<LoggerService>;
  let webhooksService: vi.Mocked<WebhooksService>;
  let configValues: Record<string, string | undefined>;

  function requestFrom(options: {
    authorization?: string;
    ip?: string;
  }): Request {
    return {
      headers: options.authorization
        ? { authorization: options.authorization }
        : {},
      ip: options.ip ?? '203.0.113.10',
      query: {},
    } as unknown as Request;
  }

  // Leonardo presents the shared secret as `Authorization: Bearer`; the source
  // IP is only a gate when a deployment opts into the allowlist.
  const authenticatedRequest = requestFrom({
    authorization: `Bearer ${WEBHOOK_SECRET}`,
  });

  beforeEach(async () => {
    configValues = { LEONARDO_WEBHOOK_SECRET: WEBHOOK_SECRET };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LeonardoaiWebhookController],
      providers: [
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string) => configValues[key]),
          },
        },
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
    webhooksService = module.get(WebhooksService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('handleCallback', () => {
    it('should handle callback successfully with a valid webhook token', async () => {
      const body = {
        customId: undefined,
        data: { object: { id: 'gen_123', images: [] } },
        type: 'image-generation.complete',
      };
      leonardoaiWebhookService.handleCallback.mockResolvedValue(undefined);

      const result = await controller.handleCallback(
        authenticatedRequest,
        body,
      );

      expect(loggerService.log).toHaveBeenCalledWith(
        'LeonardoaiWebhookController leonardoai callback received',
        body,
      );
      expect(result).toEqual({
        message: 'Webhook processed successfully',
        success: true,
      });
    });

    it('should reject a request with no webhook token', async () => {
      const body = {
        data: { object: { id: 'gen_123', images: [] } },
        type: 'image-generation.complete',
      };

      await expect(
        controller.handleCallback(requestFrom({}), body),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject a request with a wrong webhook token', async () => {
      const body = {
        data: { object: { id: 'gen_123', images: [] } },
        type: 'image-generation.complete',
      };

      await expect(
        controller.handleCallback(
          requestFrom({ authorization: 'Bearer not-the-secret' }),
          body,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should invoke leonardoaiWebhookService when customId is present', async () => {
      const body = {
        customId: 'custom_123',
        data: { object: { id: 'gen_456', images: [] } },
        type: 'image-generation.complete',
      };
      leonardoaiWebhookService.handleCallback.mockResolvedValue(undefined);

      await controller.handleCallback(authenticatedRequest, body);

      expect(leonardoaiWebhookService.handleCallback).toHaveBeenCalledWith(
        body,
      );
    });

    it('should dispatch the matching generated image for download', async () => {
      const body = {
        data: {
          object: {
            id: 'gen_789',
            images: [
              {
                generationId: 'other',
                url: 'https://cdn.leonardo.ai/other.png',
              },
              {
                generationId: 'gen_789',
                url: 'https://cdn.leonardo.ai/hit.png',
              },
            ],
          },
        },
        type: 'image-generation.complete',
      };

      await controller.handleCallback(authenticatedRequest, body);

      expect(webhooksService.processMediaFromWebhook).toHaveBeenCalledWith(
        'leonardoai',
        expect.anything(),
        'gen_789',
        'https://cdn.leonardo.ai/hit.png',
      );
    });

    it('should acknowledge a malformed payload without throwing', async () => {
      const body = {
        data: undefined,
        type: 'image-generation.complete',
      };

      const result = await controller.handleCallback(
        authenticatedRequest,
        body,
      );

      expect(result).toEqual({
        message: 'Webhook payload ignored',
        success: false,
      });
      expect(loggerService.warn).toHaveBeenCalledWith(
        'LeonardoaiWebhookController leonardoai callback payload missing data.object',
        { type: 'image-generation.complete' },
      );
      expect(webhooksService.processMediaFromWebhook).not.toHaveBeenCalled();
    });

    it('should acknowledge a payload whose data envelope has no object', async () => {
      const body = { data: {}, type: 'image-generation.complete' };

      await expect(
        controller.handleCallback(authenticatedRequest, body),
      ).resolves.toEqual({
        message: 'Webhook payload ignored',
        success: false,
      });
    });

    it('should enforce the configured IP allowlist as defence in depth', async () => {
      configValues.LEONARDO_WEBHOOK_ALLOWED_IPS = '198.51.100.4, 198.51.100.5';

      const body = {
        data: { object: { id: 'gen_ip', images: [] } },
        type: 'image-generation.complete',
      };

      await expect(
        controller.handleCallback(authenticatedRequest, body),
      ).rejects.toThrow('Unauthorized webhook request');

      expect(loggerService.warn).toHaveBeenCalledWith(
        'Unauthorized webhook request from IP: 203.0.113.10',
      );

      await expect(
        controller.handleCallback(
          requestFrom({
            authorization: `Bearer ${WEBHOOK_SECRET}`,
            ip: '198.51.100.5',
          }),
          body,
        ),
      ).resolves.toEqual({
        message: 'Webhook processed successfully',
        success: true,
      });
    });

    it('should reject every caller when no secret is configured', async () => {
      configValues.LEONARDO_WEBHOOK_SECRET = undefined;

      const body = {
        data: { object: { id: 'gen_789', images: [] } },
        type: 'image-generation.complete',
      };

      // No IP is trusted in place of the secret: an unconfigured deployment
      // rejects the callback outright rather than falling back to a vendor
      // egress list that Leonardo rotates without notice.
      await expect(
        controller.handleCallback(requestFrom({ ip: '35.173.108.170' }), body),
      ).rejects.toThrow(UnauthorizedException);

      await expect(
        controller.handleCallback(authenticatedRequest, body),
      ).rejects.toThrow(UnauthorizedException);

      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('LEONARDO_WEBHOOK_SECRET'),
      );
      expect(webhooksService.processMediaFromWebhook).not.toHaveBeenCalled();
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
        controller.handleCallback(authenticatedRequest, body),
      ).rejects.toThrow('Generation processing failed');

      expect(loggerService.error).toHaveBeenCalledWith(
        'LeonardoaiWebhookController leonardoai callback failed',
        error,
      );
    });
  });
});
