import { ConfigService } from '@api/config/config.service';
import { StripeWebhookController } from '@api/endpoints/webhooks/stripe/webhooks.stripe.controller';
import { StripeWebhookService } from '@api/endpoints/webhooks/stripe/webhooks.stripe.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('StripeWebhookController', () => {
  let controller: StripeWebhookController;
  let stripeWebhookService: vi.Mocked<StripeWebhookService>;
  let stripeService: vi.Mocked<StripeService>;
  let loggerService: vi.Mocked<LoggerService>;
  let configService: vi.Mocked<ConfigService>;

  const mockPublisher = {
    get: vi.fn().mockResolvedValue(null),
    setEx: vi.fn().mockResolvedValue('OK'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StripeWebhookController],
      providers: [
        {
          provide: StripeWebhookService,
          useValue: {
            handleWebhookEvent: vi.fn(),
          },
        },
        {
          provide: StripeService,
          useValue: {
            stripe: {
              webhooks: {
                constructEventAsync: vi.fn(),
              },
            },
          },
        },
        {
          provide: LoggerService,
          useValue: {
            error: vi.fn(),
            log: vi.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn().mockReturnValue('test-webhook-secret'),
          },
        },
        {
          provide: RedisService,
          useValue: {
            getPublisher: vi.fn().mockReturnValue(mockPublisher),
          },
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<StripeWebhookController>(StripeWebhookController);
    stripeWebhookService = module.get(StripeWebhookService);
    stripeService = module.get(StripeService);
    loggerService = module.get(LoggerService);
    configService = module.get(ConfigService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('handleStripe', () => {
    const mockRequest = (body: unknown, signature?: string) =>
      ({
        body,
        headers: {
          'stripe-signature': signature || 'test-signature',
        },
      }) as Request;

    it('should handle webhook successfully', async () => {
      const rawBody = Buffer.from('{"type":"payment_intent.succeeded"}');
      const mockEvent = {
        data: { object: { id: 'pi_123' } },
        id: 'evt_123',
        type: 'payment_intent.succeeded',
      };
      const request = mockRequest(rawBody, 'valid-signature');

      stripeService.stripe.webhooks.constructEventAsync.mockResolvedValue(
        mockEvent,
      );
      stripeWebhookService.handleWebhookEvent.mockResolvedValue(undefined);

      const result = await controller.handleStripe(request);

      expect(
        stripeService.stripe.webhooks.constructEventAsync,
      ).toHaveBeenCalledWith(rawBody, 'valid-signature', 'test-webhook-secret');
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('webhook validated'),
        { id: 'evt_123', type: 'payment_intent.succeeded' },
      );
      expect(stripeWebhookService.handleWebhookEvent).toHaveBeenCalledWith(
        mockEvent,
        expect.stringContaining('StripeWebhookController'),
      );
      expect(result).toEqual({ success: true });
    });

    it('should throw BadRequestException for invalid signature', async () => {
      const rawBody = Buffer.from('{"type":"invalid"}');
      const request = mockRequest(rawBody, 'invalid-signature');
      const signatureError = new Error('Invalid signature');

      stripeService.stripe.webhooks.constructEventAsync.mockRejectedValue(
        signatureError,
      );

      await expect(controller.handleStripe(request)).rejects.toThrow(
        HttpException,
      );

      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('invalid signature'),
        signatureError,
      );
    });

    it('should throw HttpException when webhook service fails', async () => {
      const rawBody = Buffer.from('{"type":"customer.created"}');
      const mockEvent = {
        data: { object: { id: 'cus_123' } },
        id: 'evt_456',
        type: 'customer.created',
      };
      const request = mockRequest(rawBody);
      const serviceError = new Error('Processing failed');

      stripeService.stripe.webhooks.constructEventAsync.mockResolvedValue(
        mockEvent,
      );
      stripeWebhookService.handleWebhookEvent.mockRejectedValue(serviceError);

      await expect(controller.handleStripe(request)).rejects.toThrow(
        HttpException,
      );

      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('processing failed'),
        serviceError,
      );
    });

    it('should handle missing stripe signature', async () => {
      const rawBody = Buffer.from('{"type":"test"}');
      const request = mockRequest(rawBody, undefined);
      const signatureError = new Error('No signature provided');

      stripeService.stripe.webhooks.constructEventAsync.mockRejectedValue(
        signatureError,
      );

      await expect(controller.handleStripe(request)).rejects.toThrow(
        HttpException,
      );

      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('invalid signature'),
        signatureError,
      );
    });
  });
});
