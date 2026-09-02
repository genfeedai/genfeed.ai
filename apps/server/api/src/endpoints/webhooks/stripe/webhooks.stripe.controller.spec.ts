vi.mock('@genfeedai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/config')>();
  return {
    ...actual,
    isSelfHostedDeployment: () => false,
  };
});

import { StripeWebhookErrorKind } from '@api/endpoints/webhooks/stripe/stripe-webhook-error.util';
import { StripeWebhookController } from '@api/endpoints/webhooks/stripe/webhooks.stripe.controller';
import { StripeWebhookService } from '@api/endpoints/webhooks/stripe/webhooks.stripe.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('StripeWebhookController', () => {
  let controller: StripeWebhookController;
  let stripeWebhookService: vi.Mocked<StripeWebhookService>;
  let stripeService: { constructWebhookEvent: ReturnType<typeof vi.fn> };
  let loggerService: vi.Mocked<LoggerService>;

  const mockPublisher = {
    del: vi.fn().mockResolvedValue(1),
    set: vi.fn().mockResolvedValue('OK'),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPublisher.del.mockResolvedValue(1);
    mockPublisher.set.mockResolvedValue('OK');

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
            constructWebhookEvent: vi.fn(),
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
      }) as unknown as Request;

    it('should handle webhook successfully', async () => {
      const rawBody = Buffer.from('{"type":"payment_intent.succeeded"}');
      const mockEvent = {
        data: { object: { id: 'pi_123' } },
        id: 'evt_123',
        type: 'payment_intent.succeeded',
      };
      const request = mockRequest(rawBody, 'valid-signature');

      stripeService.constructWebhookEvent.mockResolvedValue(mockEvent);
      stripeWebhookService.handleWebhookEvent.mockResolvedValue(undefined);

      const result = await controller.handleStripe(request);

      expect(stripeService.constructWebhookEvent).toHaveBeenCalledWith(
        rawBody,
        'valid-signature',
      );
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

    it('acquires the idempotency key atomically (SET NX) before processing', async () => {
      const rawBody = Buffer.from('{"type":"invoice.paid"}');
      const mockEvent = {
        data: { object: { id: 'in_1' } },
        id: 'evt_nx',
        type: 'invoice.paid',
      };
      const request = mockRequest(rawBody, 'valid-signature');

      stripeService.constructWebhookEvent.mockResolvedValue(mockEvent);
      mockPublisher.set.mockResolvedValueOnce('OK');

      await controller.handleStripe(request);

      expect(mockPublisher.set).toHaveBeenCalledWith(
        'stripe:webhook:evt_nx',
        expect.any(String),
        'EX',
        expect.any(Number),
        'NX',
      );
      expect(stripeWebhookService.handleWebhookEvent).toHaveBeenCalledTimes(1);
    });

    it('skips processing when another delivery already holds the idempotency key', async () => {
      const rawBody = Buffer.from('{"type":"invoice.paid"}');
      const mockEvent = {
        data: { object: { id: 'in_1' } },
        id: 'evt_dup',
        type: 'invoice.paid',
      };
      const request = mockRequest(rawBody, 'valid-signature');

      stripeService.constructWebhookEvent.mockResolvedValue(mockEvent);
      // SET NX returns null when the key already exists — concurrent duplicate
      mockPublisher.set.mockResolvedValueOnce(null);

      const result = await controller.handleStripe(request);

      expect(stripeWebhookService.handleWebhookEvent).not.toHaveBeenCalled();
      expect(result).toEqual({ success: true });
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('duplicate event skipped'),
        {
          id: 'evt_dup',
          kind: StripeWebhookErrorKind.IDEMPOTENT,
          type: 'invoice.paid',
        },
      );
    });

    it('rejects an invalid signature as 400 without remapping to 500', async () => {
      const rawBody = Buffer.from('{"type":"invalid"}');
      const request = mockRequest(rawBody, 'invalid-signature');
      const signatureError = new BadRequestException(
        'Invalid Stripe signature',
      );

      stripeService.constructWebhookEvent.mockRejectedValue(signatureError);

      const thrown = await controller
        .handleStripe(request)
        .catch((error: unknown) => error);

      expect(thrown).toBe(signatureError);
      expect((thrown as HttpException).getStatus()).toBe(
        HttpStatus.BAD_REQUEST,
      );

      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('webhook signature rejected'),
        {
          errorName: 'BadRequestException',
          kind: StripeWebhookErrorKind.SIGNATURE,
        },
      );
      expect(loggerService.error).not.toHaveBeenCalledWith(
        expect.stringContaining('processing failed'),
        expect.anything(),
        expect.anything(),
      );
      expect(mockPublisher.del).not.toHaveBeenCalled();
    });

    it('does not wrap a real handler fault in Webhook processing failed', async () => {
      const rawBody = Buffer.from('{"type":"customer.created"}');
      const mockEvent = {
        data: { object: { id: 'cus_123' } },
        id: 'evt_456',
        type: 'customer.created',
      };
      const request = mockRequest(rawBody);
      const serviceError = new Error('Processing failed');

      stripeService.constructWebhookEvent.mockResolvedValue(mockEvent);
      stripeWebhookService.handleWebhookEvent.mockRejectedValue(serviceError);

      await expect(controller.handleStripe(request)).rejects.toBe(serviceError);

      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('processing failed'),
        serviceError,
        {
          errorName: 'Error',
          eventId: 'evt_456',
          eventType: 'customer.created',
          kind: StripeWebhookErrorKind.FAULT,
        },
      );
      expect(mockPublisher.del).toHaveBeenCalledWith('stripe:webhook:evt_456');
    });

    it('rejects a missing stripe signature as 400', async () => {
      const rawBody = Buffer.from('{"type":"test"}');
      const request = mockRequest(rawBody, undefined);
      const signatureError = new BadRequestException(
        'Invalid Stripe signature',
      );

      stripeService.constructWebhookEvent.mockRejectedValue(signatureError);

      const thrown = await controller
        .handleStripe(request)
        .catch((error) => error);

      expect(thrown).toBeInstanceOf(BadRequestException);
      expect((thrown as HttpException).getStatus()).toBe(
        HttpStatus.BAD_REQUEST,
      );
      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('webhook signature rejected'),
        expect.objectContaining({ kind: StripeWebhookErrorKind.SIGNATURE }),
      );
    });

    it('passes through expected handler 4xx without a generic 500', async () => {
      const mockEvent = {
        data: { object: { id: 'cs_1' } },
        id: 'evt_expected',
        type: 'checkout.session.completed',
      };
      const expected = new BadRequestException(
        'Managed checkout is not configured',
      );

      stripeService.constructWebhookEvent.mockResolvedValue(mockEvent);
      stripeWebhookService.handleWebhookEvent.mockRejectedValue(expected);

      await expect(
        controller.handleStripe(mockRequest(Buffer.from('{}'))),
      ).rejects.toBe(expected);

      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('webhook expected rejected'),
        expect.objectContaining({
          eventId: 'evt_expected',
          kind: StripeWebhookErrorKind.EXPECTED,
        }),
      );
      expect(mockPublisher.del).not.toHaveBeenCalled();
    });

    it('acknowledges a Prisma unique-constraint replay instead of 500', async () => {
      const mockEvent = {
        data: { object: { id: 'in_1' } },
        id: 'evt_replay',
        type: 'invoice.paid',
      };

      stripeService.constructWebhookEvent.mockResolvedValue(mockEvent);
      stripeWebhookService.handleWebhookEvent.mockRejectedValue({
        code: 'P2002',
      });

      const result = await controller.handleStripe(
        mockRequest(Buffer.from('{}')),
      );

      expect(result).toEqual({ success: true });
      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('webhook replay acknowledged'),
        expect.objectContaining({
          eventId: 'evt_replay',
          kind: StripeWebhookErrorKind.REPLAY,
        }),
      );
      expect(mockPublisher.del).not.toHaveBeenCalled();
    });
  });
});
