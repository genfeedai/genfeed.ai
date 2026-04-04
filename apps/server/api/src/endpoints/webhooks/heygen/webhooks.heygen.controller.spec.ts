import { HeygenWebhookController } from '@api/endpoints/webhooks/heygen/webhooks.heygen.controller';
import { HeygenWebhookService } from '@api/endpoints/webhooks/heygen/webhooks.heygen.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

vi.mock('@libs/utils/caller/caller.util', () => ({
  CallerUtil: {
    getCallerName: vi.fn().mockReturnValue('heygen callback'),
  },
}));

describe('HeygenWebhookController', () => {
  let controller: HeygenWebhookController;
  let heygenWebhookService: vi.Mocked<HeygenWebhookService>;
  let loggerService: vi.Mocked<LoggerService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HeygenWebhookController],
      providers: [
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

      const result = await controller.handleCallback(body);

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

      await controller.handleCallback(body);

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

      await expect(controller.handleCallback(body)).rejects.toThrow(
        'Video processing failed',
      );

      expect(loggerService.error).toHaveBeenCalledWith(
        'HeygenWebhookController heygen callback failed',
        error,
      );
    });
  });
});
