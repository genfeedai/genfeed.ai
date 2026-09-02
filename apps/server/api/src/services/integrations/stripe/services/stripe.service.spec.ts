vi.mock('@genfeedai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/config')>();

  return {
    ...actual,
    isSelfHostedDeployment: () => false,
  };
});

import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import Stripe from 'stripe';

function stripeResponse<T extends object>(resource: T): Stripe.Response<T> {
  return {
    ...resource,
    lastResponse: {
      headers: {},
      requestId: 'req_test',
      statusCode: 200,
    },
  };
}

function checkoutSessionResponse(
  id: string,
  url: string | null = null,
): Stripe.Response<Stripe.Checkout.Session> {
  const session = {
    id,
    object: 'checkout.session',
    url,
  } as Stripe.Checkout.Session;
  return stripeResponse(session);
}

describe('StripeService', () => {
  let service: StripeService;
  let loggerService: LoggerService;

  beforeEach(async () => {
    const configGetMock = vi.fn((key: string) => {
      const map: Record<string, string> = {
        GENFEEDAI_APP_URL: 'http://localhost:3000',
        STRIPE_API_VERSION: '2026-01-28.clover',
        STRIPE_PRICE_PAYG: 'payg_id',
        STRIPE_PRICE_SUBSCRIPTION_ENTERPRISE_MONTHLY: 'enterprise_id',
        STRIPE_PRICE_SUBSCRIPTION_PRO_MONTHLY: 'pro_id',
        STRIPE_PRICE_SUBSCRIPTION_SCALE_MONTHLY: 'scale_id',
        STRIPE_SECRET_KEY: 'sk_test',
        STRIPE_WEBHOOK_SIGNING_SECRET: 'whsec_test_secret',
      };
      return map[key];
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeService,
        { provide: ConfigService, useValue: { get: configGetMock } },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
      ],
    }).compile();

    service = module.get<StripeService>(StripeService);
    loggerService = module.get<LoggerService>(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createPaymentSession', () => {
    it('should pass quantity to stripe checkout', async () => {
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue(checkoutSessionResponse('sess'));

      await service.createPaymentSession(
        'cust',
        'payg_id',
        'http://origin',
        2_000,
      );

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [expect.objectContaining({ quantity: 2_000 })],
        }),
      );
    });

    it('stamps trusted organization identity on the session and subscription', async () => {
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue(checkoutSessionResponse('sess'));

      await service.createPaymentSession(
        'cust',
        'pro_id',
        'http://origin',
        1,
        undefined,
        { organizationId: 'org_1' },
      );

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            billing_account_type: 'organization',
            billing_organization_id: 'org_1',
          }),
          subscription_data: expect.objectContaining({
            metadata: expect.objectContaining({
              billing_account_type: 'organization',
              billing_organization_id: 'org_1',
            }),
          }),
        }),
      );
    });
  });

  describe('PAYG metadata.credits (flat top-up, no bonus)', () => {
    it('sets metadata.credits to the preset amount for the $1,000 pack (100,000)', async () => {
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue(checkoutSessionResponse('sess'));

      await service.createPaymentSession(
        'cust',
        'payg_id',
        'http://origin',
        100_000,
      );

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            credits: '100000',
            plan_type: 'payg',
          }),
        }),
      );
    });

    it('sets metadata.credits to the preset amount for the $50 pack (5,000)', async () => {
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue(checkoutSessionResponse('sess'));

      await service.createPaymentSession(
        'cust',
        'payg_id',
        'http://origin',
        5_000,
      );

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            credits: '5000',
            plan_type: 'payg',
          }),
        }),
      );
    });

    it('sets metadata.credits equal to quantity for a custom (non-preset) amount', async () => {
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue(checkoutSessionResponse('sess'));

      await service.createPaymentSession(
        'cust',
        'payg_id',
        'http://origin',
        12_345,
      );

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            credits: '12345',
            plan_type: 'payg',
          }),
        }),
      );
    });

    it('does not apply discounts/coupons, uses allow_promotion_codes', async () => {
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue(checkoutSessionResponse('sess'));

      await service.createPaymentSession(
        'cust',
        'payg_id',
        'http://origin',
        250_000,
      );

      const callArg = createSpy.mock.calls[0][0];
      expect(callArg.allow_promotion_codes).toBe(true);
      expect(callArg).not.toHaveProperty('discounts');
    });
  });

  describe('PAYG min/max enforcement', () => {
    // 1 credit = $0.01 → min $10 = 1,000 credits, max $10,000 = 1,000,000 credits
    it('rejects a below-minimum quantity (999 credits) without calling Stripe', async () => {
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue(checkoutSessionResponse('sess'));

      await expect(
        service.createPaymentSession('cust', 'payg_id', 'http://origin', 999),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(createSpy).not.toHaveBeenCalled();
    });

    it('accepts the minimum quantity (1,000 credits = $10)', async () => {
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue(checkoutSessionResponse('sess'));

      await service.createPaymentSession(
        'cust',
        'payg_id',
        'http://origin',
        1_000,
      );

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [expect.objectContaining({ quantity: 1_000 })],
        }),
      );
    });

    it('accepts the maximum quantity (1,000,000 credits = $10,000)', async () => {
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue(checkoutSessionResponse('sess'));

      await service.createPaymentSession(
        'cust',
        'payg_id',
        'http://origin',
        1_000_000,
      );

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [expect.objectContaining({ quantity: 1_000_000 })],
        }),
      );
    });

    it('rejects an above-maximum quantity (1,000,001 credits) without calling Stripe', async () => {
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue(checkoutSessionResponse('sess'));

      await expect(
        service.createPaymentSession(
          'cust',
          'payg_id',
          'http://origin',
          1_000_001,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(createSpy).not.toHaveBeenCalled();
    });

    it('enforces the same bounds on the managed PAYG checkout (below min)', async () => {
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue(checkoutSessionResponse('sess_managed'));

      await expect(
        service.createManagedPaymentSession({
          email: 'managed@example.com',
          quantity: 999,
          stripePriceId: 'payg_id',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(createSpy).not.toHaveBeenCalled();
    });

    it('enforces the same bounds on the managed PAYG checkout (above max)', async () => {
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue(checkoutSessionResponse('sess_managed'));

      await expect(
        service.createManagedPaymentSession({
          email: 'managed@example.com',
          quantity: 1_000_001,
          stripePriceId: 'payg_id',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(createSpy).not.toHaveBeenCalled();
    });
  });

  describe('promotion codes on subscription checkout', () => {
    it('always opens allow_promotion_codes and never force-applies discounts', async () => {
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue(checkoutSessionResponse('sess'));

      await service.createPaymentSession('cust', 'pro_id', 'http://origin');

      const callArg = createSpy.mock.calls[0][0];
      expect(callArg.allow_promotion_codes).toBe(true);
      expect(callArg).not.toHaveProperty('discounts');
    });

    it('still opens the promo field when STRIPE_PROMOTION_CODE_LAUNCH is set', async () => {
      const configGetMock = vi.fn((key: string) => {
        const map: Record<string, string> = {
          GENFEEDAI_APP_URL: 'http://localhost:3000',
          STRIPE_API_VERSION: '2026-01-28.clover',
          STRIPE_PRICE_PAYG: 'payg_id',
          STRIPE_PRICE_SUBSCRIPTION_ENTERPRISE_MONTHLY: 'enterprise_id',
          STRIPE_PRICE_SUBSCRIPTION_PRO_MONTHLY: 'pro_id',
          STRIPE_PRICE_SUBSCRIPTION_SCALE_MONTHLY: 'scale_id',
          STRIPE_PROMOTION_CODE_LAUNCH: 'promo_launch123',
          STRIPE_SECRET_KEY: 'sk_test',
        };
        return map[key];
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          StripeService,
          { provide: ConfigService, useValue: { get: configGetMock } },
          {
            provide: LoggerService,
            useValue: { error: vi.fn(), log: vi.fn() },
          },
        ],
      }).compile();

      const scopedService = module.get<StripeService>(StripeService);

      const createSpy = vi
        .spyOn(scopedService.stripe.checkout.sessions, 'create')
        .mockResolvedValue(checkoutSessionResponse('sess'));

      await scopedService.createPaymentSession(
        'cust',
        'pro_id',
        'http://origin',
      );

      const callArg = createSpy.mock.calls[0][0];
      expect(callArg.allow_promotion_codes).toBe(true);
      expect(callArg).not.toHaveProperty('discounts');
    });

    it('opens the promo field for non-Pro subscription tiers', async () => {
      const configGetMock = vi.fn((key: string) => {
        const map: Record<string, string> = {
          GENFEEDAI_APP_URL: 'http://localhost:3000',
          STRIPE_API_VERSION: '2026-01-28.clover',
          STRIPE_PRICE_PAYG: 'payg_id',
          STRIPE_PRICE_SUBSCRIPTION_ENTERPRISE_MONTHLY: 'enterprise_id',
          STRIPE_PRICE_SUBSCRIPTION_PRO_MONTHLY: 'pro_id',
          STRIPE_PRICE_SUBSCRIPTION_SCALE_MONTHLY: 'scale_id',
          STRIPE_PROMOTION_CODE_LAUNCH: 'promo_launch123',
          STRIPE_SECRET_KEY: 'sk_test',
        };
        return map[key];
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          StripeService,
          { provide: ConfigService, useValue: { get: configGetMock } },
          {
            provide: LoggerService,
            useValue: { error: vi.fn(), log: vi.fn() },
          },
        ],
      }).compile();

      const scopedService = module.get<StripeService>(StripeService);

      const createSpy = vi
        .spyOn(scopedService.stripe.checkout.sessions, 'create')
        .mockResolvedValue(checkoutSessionResponse('sess'));

      await scopedService.createPaymentSession(
        'cust',
        'enterprise_id',
        'http://origin',
      );

      const callArg = createSpy.mock.calls[0][0];
      expect(callArg.allow_promotion_codes).toBe(true);
      expect(callArg).not.toHaveProperty('discounts');
    });

    it('treats the yearly Pro price as a subscription with an open promo field', async () => {
      const configGetMock = vi.fn((key: string) => {
        const map: Record<string, string> = {
          GENFEEDAI_APP_URL: 'http://localhost:3000',
          STRIPE_API_VERSION: '2026-01-28.clover',
          STRIPE_PRICE_PAYG: 'payg_id',
          STRIPE_PRICE_SUBSCRIPTION_ENTERPRISE_MONTHLY: 'enterprise_id',
          STRIPE_PRICE_SUBSCRIPTION_PRO_MONTHLY: 'pro_id',
          STRIPE_PRICE_SUBSCRIPTION_PRO_YEARLY: 'pro_yearly_id',
          STRIPE_PRICE_SUBSCRIPTION_SCALE_MONTHLY: 'scale_id',
          STRIPE_PROMOTION_CODE_LAUNCH: 'promo_launch123',
          STRIPE_SECRET_KEY: 'sk_test',
        };
        return map[key];
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          StripeService,
          { provide: ConfigService, useValue: { get: configGetMock } },
          {
            provide: LoggerService,
            useValue: { error: vi.fn(), log: vi.fn() },
          },
        ],
      }).compile();

      const scopedService = module.get<StripeService>(StripeService);

      const createSpy = vi
        .spyOn(scopedService.stripe.checkout.sessions, 'create')
        .mockResolvedValue(checkoutSessionResponse('sess'));

      await scopedService.createPaymentSession(
        'cust',
        'pro_yearly_id',
        'http://origin',
      );

      const callArg = createSpy.mock.calls[0][0];
      expect(callArg.mode).toBe('subscription');
      expect(callArg.allow_promotion_codes).toBe(true);
      expect(callArg).not.toHaveProperty('discounts');
    });
  });

  describe('createManagedPaymentSession', () => {
    it('creates a public managed checkout with customer_email and managed metadata', async () => {
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue({
          ...checkoutSessionResponse(
            'sess_managed',
            'https://checkout.stripe.com/pay/managed',
          ),
        });

      await service.createManagedPaymentSession({
        email: 'managed@example.com',
        firstName: 'Vincent',
        quantity: 100_000,
        stripePriceId: 'payg_id',
      });

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          customer_creation: 'always',
          customer_email: 'managed@example.com',
          line_items: [expect.objectContaining({ quantity: 100_000 })],
          metadata: expect.objectContaining({
            credits: '100000',
            email: 'managed@example.com',
            firstName: 'Vincent',
            plan_type: 'payg',
            type: 'managed_inference',
          }),
          mode: 'payment',
        }),
      );
    });
  });

  describe('constructWebhookEvent', () => {
    const webhookSecret = 'whsec_test_secret';
    const payload = JSON.stringify({
      api_version: '2026-03-25.dahlia',
      created: 1_700_000_000,
      data: { object: { id: 'in_test', object: 'invoice' } },
      id: 'evt_test_signed',
      livemode: false,
      object: 'event',
      pending_webhooks: 1,
      request: { id: null, idempotency_key: null },
      type: 'invoice.paid',
    });

    it('accepts a representative Stripe-signed payload', async () => {
      const signature = Stripe.webhooks.generateTestHeaderString({
        payload,
        secret: webhookSecret,
      });

      const event = await service.constructWebhookEvent(payload, signature);

      expect(event.id).toBe('evt_test_signed');
      expect(event.type).toBe('invoice.paid');
    });

    it('rejects an invalid signature as BadRequestException', async () => {
      await expect(
        service.constructWebhookEvent(payload, 't=1,v1=deadbeef'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a missing signature as BadRequestException', async () => {
      await expect(
        service.constructWebhookEvent(payload, undefined),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('treats a missing signing secret as a retryable fault', async () => {
      const configGetMock = vi.fn((key: string) => {
        if (key === 'STRIPE_WEBHOOK_SIGNING_SECRET') {
          return undefined;
        }

        const map: Record<string, string> = {
          STRIPE_API_VERSION: '2026-01-28.clover',
          STRIPE_SECRET_KEY: 'sk_test',
        };
        return map[key];
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          StripeService,
          { provide: ConfigService, useValue: { get: configGetMock } },
          {
            provide: LoggerService,
            useValue: { error: vi.fn(), log: vi.fn() },
          },
        ],
      }).compile();

      const unconfigured = module.get<StripeService>(StripeService);

      await expect(
        unconfigured.constructWebhookEvent(payload, 't=1,v1=deadbeef'),
      ).rejects.toThrow('Stripe webhook signing secret is not configured');
    });

    it('re-throws unexpected construction errors', async () => {
      const unexpected = new Error('sdk exploded');
      vi.spyOn(
        service.stripe.webhooks,
        'constructEventAsync',
      ).mockRejectedValue(unexpected);

      await expect(
        service.constructWebhookEvent(payload, 't=1,v1=deadbeef'),
      ).rejects.toBe(unexpected);
    });
  });

  describe('getUpcomingInvoice', () => {
    const customerId = 'cus_test';
    const subscriptionId = 'sub_test';
    const currentPriceId = 'price_current';
    const newPriceId = 'price_new';
    const previewInvoiceId = 'upcoming_in_test';

    function stripeLineItem(id: string): Stripe.InvoiceLineItem {
      return { id } as Stripe.InvoiceLineItem;
    }

    function upcomingInvoiceResponse(
      lineIds: string[],
      hasMore: boolean,
    ): Stripe.Response<Stripe.Invoice> {
      const invoice = {
        amount_due: 4_200,
        currency: 'usd',
        id: previewInvoiceId,
        lines: {
          data: lineIds.map(stripeLineItem),
          has_more: hasMore,
          object: 'list',
          url: `/v1/invoices/${previewInvoiceId}/lines`,
        },
      } as Stripe.Invoice;
      return stripeResponse(invoice);
    }

    function lineItemsPage(
      lineIds: string[],
      hasMore: boolean,
    ): Stripe.Response<Stripe.ApiList<Stripe.InvoiceLineItem>> {
      const page = {
        data: lineIds.map(stripeLineItem),
        has_more: hasMore,
        object: 'list',
        url: `/v1/invoices/${previewInvoiceId}/lines`,
      } as Stripe.ApiList<Stripe.InvoiceLineItem>;
      return stripeResponse(page);
    }

    beforeEach(() => {
      vi.spyOn(service.stripe.subscriptions, 'retrieve').mockResolvedValue(
        stripeResponse({
          customer: customerId,
          items: {
            data: [
              {
                id: 'si_test',
                price: { id: currentPriceId },
                quantity: 1,
              },
            ],
          },
        } as unknown as Stripe.Subscription),
      );
      vi.spyOn(service.stripe.prices, 'retrieve').mockResolvedValue(
        stripeResponse({
          id: newPriceId,
          recurring: { usage_type: 'licensed' },
        } as unknown as Stripe.Price),
      );
    });

    it('returns a single-page preview unchanged when has_more is false', async () => {
      vi.spyOn(service.stripe.invoices, 'createPreview').mockResolvedValue(
        upcomingInvoiceResponse(['il_1', 'il_2'], false),
      );
      const listLineItemsSpy = vi.spyOn(
        service.stripe.invoices,
        'listLineItems',
      );

      const preview = await service.getUpcomingInvoice(
        customerId,
        subscriptionId,
        currentPriceId,
        newPriceId,
      );

      expect(listLineItemsSpy).not.toHaveBeenCalled();
      expect(preview.lines.data.map((line) => line.id)).toEqual([
        'il_1',
        'il_2',
      ]);
      expect(preview.lines.has_more).toBe(false);
    });

    it('pages through invoices.listLineItems and sums every proration line when the preview is truncated', async () => {
      vi.spyOn(service.stripe.invoices, 'createPreview').mockResolvedValue(
        upcomingInvoiceResponse(['il_1', 'il_2'], true),
      );
      const listLineItemsSpy = vi
        .spyOn(service.stripe.invoices, 'listLineItems')
        .mockResolvedValueOnce(lineItemsPage(['il_3', 'il_4'], true))
        .mockResolvedValueOnce(lineItemsPage(['il_5'], false));

      const preview = await service.getUpcomingInvoice(
        customerId,
        subscriptionId,
        currentPriceId,
        newPriceId,
      );

      expect(listLineItemsSpy).toHaveBeenCalledTimes(2);
      expect(listLineItemsSpy).toHaveBeenNthCalledWith(
        1,
        previewInvoiceId,
        expect.objectContaining({ limit: 100, starting_after: 'il_2' }),
      );
      expect(listLineItemsSpy).toHaveBeenNthCalledWith(
        2,
        previewInvoiceId,
        expect.objectContaining({ limit: 100, starting_after: 'il_4' }),
      );
      expect(preview.lines.data.map((line) => line.id)).toEqual([
        'il_1',
        'il_2',
        'il_3',
        'il_4',
        'il_5',
      ]);
      expect(preview.lines.has_more).toBe(false);
    });

    it('stops paginating and logs a warning if has_more never resolves to false', async () => {
      vi.spyOn(service.stripe.invoices, 'createPreview').mockResolvedValue(
        upcomingInvoiceResponse(['il_1'], true),
      );
      const warnSpy = vi.spyOn(loggerService, 'warn');
      vi.spyOn(service.stripe.invoices, 'listLineItems').mockResolvedValue(
        lineItemsPage(['il_runaway'], true),
      );

      const preview = await service.getUpcomingInvoice(
        customerId,
        subscriptionId,
        currentPriceId,
        newPriceId,
      );

      expect(preview.lines.has_more).toBe(true);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('has more proration lines'),
        expect.objectContaining({ customerId, subscriptionId }),
      );
    });
  });
});
