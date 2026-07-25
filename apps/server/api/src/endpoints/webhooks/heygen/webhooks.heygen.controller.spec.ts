import { HeygenWebhookController } from '@api/endpoints/webhooks/heygen/webhooks.heygen.controller';
import { HeygenWebhookService } from '@api/endpoints/webhooks/heygen/webhooks.heygen.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

vi.mock('@libs/utils/caller/caller.util', () => ({
  CallerUtil: {
    getCallerName: vi.fn().mockReturnValue('heygen callback'),
  },
}));

const WEBHOOK_SECRET = 'hooksecret';

describe('HeygenWebhookController', () => {
  let controller: HeygenWebhookController;
  let heygenWebhookService: vi.Mocked<HeygenWebhookService>;
  let loggerService: vi.Mocked<LoggerService>;
  let configService: { get: ReturnType<typeof vi.fn> };

  function requestWith(token?: string): Request {
    return {
      headers: {},
      query: token ? { token } : {},
    } as unknown as Request;
  }

  const authenticatedRequest = requestWith(WEBHOOK_SECRET);

  beforeEach(async () => {
    configService = { get: vi.fn().mockReturnValue(WEBHOOK_SECRET) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HeygenWebhookController],
      providers: [
        {
          provide: ConfigService,
          useValue: configService,
        },
        {
          provide: HeygenWebhookService,
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
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<HeygenWebhookController>(HeygenWebhookController);
    heygenWebhookService = module.get(HeygenWebhookService);
    loggerService = module.get(LoggerService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('handleCallback', () => {
    it('should handle callback successfully and return webhook received', async () => {
      const body = { status: 'completed', video_id: 'vid_123' };
      heygenWebhookService.handleCallback.mockResolvedValue(undefined);

      const result = await controller.handleCallback(
        authenticatedRequest,
        body,
      );

      expect(loggerService.log).toHaveBeenCalledWith(
        'HeygenWebhookController heygen callback received',
        body,
      );
      expect(result).toEqual({ detail: 'Webhook received' });
      expect(heygenWebhookService.handleCallback).toHaveBeenCalledWith(body);
    });

    it('should invoke heygenWebhookService when callback_id is present', async () => {
      const body = {
        callback_id: 'cb_123',
        status: 'completed',
        video_id: 'vid_123',
      };
      heygenWebhookService.handleCallback.mockResolvedValue(undefined);

      await controller.handleCallback(authenticatedRequest, body);

      expect(heygenWebhookService.handleCallback).toHaveBeenCalledWith(body);
    });

    it('should rethrow error when callback handling fails', async () => {
      const body = {
        callback_id: 'cb_789',
        status: 'failed',
        video_id: 'vid_789',
      };
      const error = new Error('Video processing failed');
      heygenWebhookService.handleCallback.mockRejectedValue(error);

      await expect(
        controller.handleCallback(authenticatedRequest, body),
      ).rejects.toThrow('Video processing failed');

      expect(loggerService.error).toHaveBeenCalledWith(
        'HeygenWebhookController heygen callback failed',
        error,
      );
    });

    it('rejects callbacks without the shared token when a secret is configured', async () => {
      await expect(
        controller.handleCallback(requestWith(), { video_id: 'vid_1' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(heygenWebhookService.handleCallback).not.toHaveBeenCalled();
    });

    it('processes callbacks carrying the correct token', async () => {
      heygenWebhookService.handleCallback.mockResolvedValue(undefined);

      const result = await controller.handleCallback(authenticatedRequest, {
        video_id: 'vid_1',
      });

      expect(result).toEqual({ detail: 'Webhook received' });
    });

    it('rejects every caller when no secret is configured', async () => {
      configService.get.mockReturnValue(undefined);

      // Fail closed: an unconfigured deployment must not hand an anonymous
      // caller a job-completion handler that writes media records.
      await expect(
        controller.handleCallback(authenticatedRequest, { video_id: 'vid_1' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('HEYGEN_WEBHOOK_SECRET'),
      );
      expect(heygenWebhookService.handleCallback).not.toHaveBeenCalled();
    });
  });
});
