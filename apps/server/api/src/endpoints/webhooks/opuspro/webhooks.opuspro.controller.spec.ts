import { OpusProWebhookController } from '@api/endpoints/webhooks/opuspro/webhooks.opuspro.controller';
import { OpusProWebhookService } from '@api/endpoints/webhooks/opuspro/webhooks.opuspro.service';
import { WebhooksService } from '@api/endpoints/webhooks/webhooks.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { IngredientCategory } from '@genfeedai/enums';
import type { OpusProWebhookPayload } from '@libs/interfaces/webhook-payload.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('OpusProWebhookController', () => {
  let controller: OpusProWebhookController;
  let opusProWebhookService: vi.Mocked<OpusProWebhookService>;
  let webhooksService: vi.Mocked<WebhooksService>;
  let loggerService: vi.Mocked<LoggerService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OpusProWebhookController],
      providers: [
        {
          provide: OpusProWebhookService,
          useValue: {
            extractVideoUrl: vi.fn(),
            handleCallback: vi.fn(),
          },
        },
        {
          provide: WebhooksService,
          useValue: {
            handleFailedGeneration: vi.fn(),
            processMediaFromWebhook: vi.fn(),
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

    controller = module.get<OpusProWebhookController>(OpusProWebhookController);
    opusProWebhookService = module.get(OpusProWebhookService);
    webhooksService = module.get(WebhooksService);
    loggerService = module.get(LoggerService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('handleCallback', () => {
    it('should handle completed webhook successfully', async () => {
      const payload: OpusProWebhookPayload = {
        callback_id: 'callback_123',
        status: 'completed',
        videoUrl: 'https://cdn.opuspro.ai/video123.mp4',
      } as OpusProWebhookPayload;

      opusProWebhookService.extractVideoUrl.mockReturnValue(
        'https://cdn.opuspro.ai/video123.mp4',
      );
      opusProWebhookService.handleCallback.mockResolvedValue(undefined);
      webhooksService.processMediaFromWebhook.mockResolvedValue(
        undefined as never,
      );

      const result = await controller.handleCallback(payload);

      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('OpusProWebhookController'),
        payload,
      );

      expect(opusProWebhookService.handleCallback).toHaveBeenCalledWith(
        payload,
      );

      expect(opusProWebhookService.extractVideoUrl).toHaveBeenCalledWith(
        payload,
      );

      expect(webhooksService.processMediaFromWebhook).toHaveBeenCalledWith(
        'opuspro',
        IngredientCategory.VIDEO,
        'callback_123',
        'https://cdn.opuspro.ai/video123.mp4',
      );

      expect(result).toEqual({ detail: 'Webhook received' });
    });

    it('should handle failed webhook', async () => {
      const payload: OpusProWebhookPayload = {
        callback_id: 'callback_456',
        error: 'Video generation timeout',
        status: 'failed',
      } as OpusProWebhookPayload;

      opusProWebhookService.extractVideoUrl.mockReturnValue(null);
      opusProWebhookService.handleCallback.mockResolvedValue(undefined);
      webhooksService.handleFailedGeneration.mockResolvedValue(undefined);

      const result = await controller.handleCallback(payload);

      expect(opusProWebhookService.handleCallback).toHaveBeenCalledWith(
        payload,
      );

      expect(webhooksService.handleFailedGeneration).toHaveBeenCalledWith(
        'callback_456',
        'Video generation timeout',
      );

      expect(webhooksService.processMediaFromWebhook).not.toHaveBeenCalled();

      expect(result).toEqual({ detail: 'Webhook received' });
    });

    it('should handle failed webhook without error message', async () => {
      const payload: OpusProWebhookPayload = {
        callback_id: 'callback_789',
        status: 'failed',
      } as OpusProWebhookPayload;

      opusProWebhookService.extractVideoUrl.mockReturnValue(null);
      opusProWebhookService.handleCallback.mockResolvedValue(undefined);
      webhooksService.handleFailedGeneration.mockResolvedValue(undefined);

      await controller.handleCallback(payload);

      expect(webhooksService.handleFailedGeneration).toHaveBeenCalledWith(
        'callback_789',
        'Opus Pro generation failed',
      );
    });

    it('should handle webhook without callback_id', async () => {
      const payload: OpusProWebhookPayload = {
        status: 'processing',
      } as OpusProWebhookPayload;

      opusProWebhookService.extractVideoUrl.mockReturnValue(null);

      const result = await controller.handleCallback(payload);

      expect(opusProWebhookService.handleCallback).not.toHaveBeenCalled();
      expect(webhooksService.processMediaFromWebhook).not.toHaveBeenCalled();
      expect(webhooksService.handleFailedGeneration).not.toHaveBeenCalled();

      expect(result).toEqual({ detail: 'Webhook received' });
    });

    it('should handle completed webhook without video URL', async () => {
      const payload: OpusProWebhookPayload = {
        callback_id: 'callback_999',
        status: 'completed',
      } as OpusProWebhookPayload;

      opusProWebhookService.extractVideoUrl.mockReturnValue(null);
      opusProWebhookService.handleCallback.mockResolvedValue(undefined);

      const result = await controller.handleCallback(payload);

      expect(opusProWebhookService.handleCallback).toHaveBeenCalledWith(
        payload,
      );
      expect(webhooksService.processMediaFromWebhook).not.toHaveBeenCalled();

      expect(result).toEqual({ detail: 'Webhook received' });
    });

    it('should handle processing status', async () => {
      const payload: OpusProWebhookPayload = {
        callback_id: 'callback_proc',
        status: 'processing',
      } as OpusProWebhookPayload;

      opusProWebhookService.extractVideoUrl.mockReturnValue(null);
      opusProWebhookService.handleCallback.mockResolvedValue(undefined);

      const result = await controller.handleCallback(payload);

      expect(opusProWebhookService.handleCallback).toHaveBeenCalledWith(
        payload,
      );
      expect(webhooksService.processMediaFromWebhook).not.toHaveBeenCalled();
      expect(webhooksService.handleFailedGeneration).not.toHaveBeenCalled();

      expect(result).toEqual({ detail: 'Webhook received' });
    });

    it('should log and rethrow errors', async () => {
      const payload: OpusProWebhookPayload = {
        callback_id: 'callback_error',
        status: 'completed',
        videoUrl: 'https://cdn.opuspro.ai/video.mp4',
      } as OpusProWebhookPayload;

      const error = new Error('Database connection failed');

      opusProWebhookService.extractVideoUrl.mockReturnValue(
        'https://cdn.opuspro.ai/video.mp4',
      );
      opusProWebhookService.handleCallback.mockRejectedValue(error);

      await expect(controller.handleCallback(payload)).rejects.toThrow(
        'Database connection failed',
      );

      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('OpusProWebhookController'),
        error,
      );
    });

    it('should handle webhook service error', async () => {
      const payload: OpusProWebhookPayload = {
        callback_id: 'callback_ws_error',
        status: 'completed',
        videoUrl: 'https://cdn.opuspro.ai/video.mp4',
      } as OpusProWebhookPayload;

      const error = new Error('Webhook service failed');

      opusProWebhookService.extractVideoUrl.mockReturnValue(
        'https://cdn.opuspro.ai/video.mp4',
      );
      opusProWebhookService.handleCallback.mockResolvedValue(undefined);
      webhooksService.processMediaFromWebhook.mockRejectedValue(error);

      await expect(controller.handleCallback(payload)).rejects.toThrow(
        'Webhook service failed',
      );

      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        error,
      );
    });
  });
});
