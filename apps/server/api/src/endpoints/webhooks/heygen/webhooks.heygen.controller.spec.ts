import { HeygenWebhookController } from '@api/endpoints/webhooks/heygen/webhooks.heygen.controller';
import { HeygenWebhookService } from '@api/endpoints/webhooks/heygen/webhooks.heygen.service';
import { HeygenWebhookVerificationService } from '@api/endpoints/webhooks/heygen/webhooks.heygen.verification.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

vi.mock('@libs/utils/caller/caller.util', () => ({
  CallerUtil: {
    getCallerName: vi.fn().mockReturnValue('heygen callback'),
  },
}));

describe('HeygenWebhookController', () => {
  let controller: HeygenWebhookController;
  let heygenWebhookService: vi.Mocked<HeygenWebhookService>;
  let loggerService: vi.Mocked<LoggerService>;
  let verificationService: {
    assertSignature: vi.Mock;
    isReplay: vi.Mock;
  };

  /** A delivery as express hands it over once `express.raw` has run. */
  function signedRequest(body: unknown): Request {
    return {
      body: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)),
      headers: {
        'heygen-event-id': 'evt_1',
        'heygen-signature': 'deadbeef',
        'heygen-timestamp': '1770000000',
      },
    } as unknown as Request;
  }

  beforeEach(async () => {
    verificationService = {
      assertSignature: vi.fn(),
      isReplay: vi.fn().mockResolvedValue(false),
    };

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
          provide: HeygenWebhookVerificationService,
          useValue: verificationService,
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
    it('verifies the signature against the untouched request bytes', async () => {
      const body = {
        callback_id: 'cb_123',
        event_type: 'avatar_video.success',
      };

      await controller.handleCallback(signedRequest(body));

      expect(verificationService.assertSignature).toHaveBeenCalledWith(
        Buffer.from(JSON.stringify(body)),
        'deadbeef',
        '1770000000',
      );
    });

    it('handles callback successfully and returns webhook received', async () => {
      const body = { callback_id: 'cb_123', video_id: 'vid_123' };
      heygenWebhookService.handleCallback.mockResolvedValue(undefined);

      const result = await controller.handleCallback(signedRequest(body));

      expect(loggerService.log).toHaveBeenCalledWith(
        'HeygenWebhookController heygen callback received',
        body,
      );
      expect(result).toEqual({ detail: 'Webhook received' });
      expect(heygenWebhookService.handleCallback).toHaveBeenCalledWith(body);
    });

    it('refuses a body that was parsed before it could be verified', async () => {
      // `express.raw` not reaching this route would silently disarm the only
      // proof of origin the endpoint has.
      const request = {
        body: { video_id: 'vid_1' },
        headers: {},
      } as unknown as Request;

      await expect(controller.handleCallback(request)).rejects.toThrow(
        BadRequestException,
      );

      expect(verificationService.assertSignature).not.toHaveBeenCalled();
      expect(heygenWebhookService.handleCallback).not.toHaveBeenCalled();
    });

    it('does not process a delivery whose signature fails', async () => {
      verificationService.assertSignature.mockImplementation(() => {
        throw new UnauthorizedException('Invalid signature');
      });

      await expect(
        controller.handleCallback(signedRequest({ video_id: 'vid_1' })),
      ).rejects.toThrow(UnauthorizedException);

      expect(verificationService.isReplay).not.toHaveBeenCalled();
      expect(heygenWebhookService.handleCallback).not.toHaveBeenCalled();
    });

    it('suppresses a replayed delivery without processing it', async () => {
      verificationService.isReplay.mockResolvedValue(true);

      const result = await controller.handleCallback(
        signedRequest({ video_id: 'vid_1' }),
      );

      expect(verificationService.isReplay).toHaveBeenCalledWith('evt_1');
      expect(result).toEqual({ detail: 'Webhook already processed' });
      expect(heygenWebhookService.handleCallback).not.toHaveBeenCalled();
    });

    it('rejects a signed body that is not valid JSON', async () => {
      await expect(
        controller.handleCallback(signedRequest('{not json')),
      ).rejects.toThrow(BadRequestException);

      expect(heygenWebhookService.handleCallback).not.toHaveBeenCalled();
    });

    it.each([
      ['array', '[]'],
      ['null', 'null'],
      ['string', '"invalid"'],
      ['number', '42'],
      ['boolean', 'false'],
    ])('rejects a signed %s body', async (_type, body) => {
      await expect(
        controller.handleCallback(signedRequest(body)),
      ).rejects.toThrow(BadRequestException);

      expect(heygenWebhookService.handleCallback).not.toHaveBeenCalled();
    });

    it('rethrows error when callback handling fails', async () => {
      const error = new Error('Video processing failed');
      heygenWebhookService.handleCallback.mockRejectedValue(error);

      await expect(
        controller.handleCallback(signedRequest({ callback_id: 'cb_789' })),
      ).rejects.toThrow('Video processing failed');

      expect(loggerService.error).toHaveBeenCalledWith(
        'HeygenWebhookController heygen callback failed',
        error,
      );
    });
  });
});
