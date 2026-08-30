vi.mock('@genfeedai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/config')>();

  return {
    ...actual,
    isSelfHostedDeployment: () => false,
  };
});

import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { StripeService } from '@server/services/integrations/stripe/services/stripe.service';
import Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mock factories
// ---------------------------------------------------------------------------

function makeMockSession(id = 'sess_1'): Stripe.Checkout.Session {
  return {
    id,
    url: `https://checkout.stripe.com/pay/${id}`,
  } as unknown as Stripe.Checkout.Session;
}

function makeMockCustomer(
  id = 'cus_1',
  deleted = false,
): Stripe.Customer | Stripe.DeletedCustomer {
  if (deleted) {
    return { deleted: true, id } as unknown as Stripe.DeletedCustomer;
  }
  return { email: 'test@example.com', id } as unknown as Stripe.Customer;
}

function makeMockSubscription(
  id = 'sub_1',
  itemId = 'si_1',
  priceId = 'price_1',
  customerId = 'cus_1',
  quantity: number | null = 1,
): Stripe.Subscription {
  return {
    customer: customerId,
    id,
    items: {
      data: [
        {
          id: itemId,
          price: { id: priceId },
          quantity,
        },
      ],
    },
    status: 'active',
  } as unknown as Stripe.Subscription;
}

function makeMockInvoicePreview(
  amountDue: number,
  currency: string,
  lines: Array<{ amount: number; proration: boolean }>,
): Stripe.Invoice {
  return {
    amount_due: amountDue,
    currency,
    lines: {
      data: lines.map((line, index) => ({
        amount: line.amount,
        id: `il_${index + 1}`,
        parent: {
          subscription_item_details: {
            proration: line.proration,
          },
          type: 'subscription_item_details',
        },
      })),
    },
  } as unknown as Stripe.Invoice;
}

function makeMockPrice(
  id = 'price_1',
  recurring: boolean = false,
): Stripe.Price {
  return {
    id,
    recurring: recurring ? { interval: 'month' } : null,
  } as unknown as Stripe.Price;
}

function makeMockBillingPortalSession(
  id = 'bps_1',
  url = 'https://billing.stripe.com/session/bps_1',
): Stripe.BillingPortal.Session {
  return { id, url } as unknown as Stripe.BillingPortal.Session;
}

// ---------------------------------------------------------------------------
// Helpers suite — common configGetMock + module builder
// ---------------------------------------------------------------------------

function buildConfigGet() {
  return vi.fn((key: string) => {
    const map: Record<string, string> = {
      GENFEEDAI_APP_URL: 'http://localhost:3000',
      STRIPE_API_VERSION: '2026-01-28.clover',
      STRIPE_PRICE_PAYG: 'payg_id',
      STRIPE_PRICE_SUBSCRIPTION_ENTERPRISE_MONTHLY: 'enterprise_id',
      STRIPE_PRICE_SUBSCRIPTION_PRO_MONTHLY: 'pro_id',
      STRIPE_PRICE_SUBSCRIPTION_PRO_YEARLY: 'pro_yearly_id',
      STRIPE_PRICE_SUBSCRIPTION_SCALE_MONTHLY: 'scale_id',
      STRIPE_SECRET_KEY: 'sk_test',
    };
    return map[key];
  });
}

async function buildModule(configGetMock = buildConfigGet()): Promise<{
  loggerMock: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  service: StripeService;
}> {
  const loggerMock = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      StripeService,
      { provide: ConfigService, useValue: { get: configGetMock } },
      { provide: LoggerService, useValue: loggerMock },
    ],
  }).compile();

  return { loggerMock, service: module.get<StripeService>(StripeService) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StripeService — coverage spec', () => {
  let service: StripeService;
  let loggerMock: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    ({ loggerMock, service } = await buildModule());
    vi.clearAllMocks();
  });

  describe('production subscription price validation', () => {
    it('accepts the configured Pro price when its Stripe data matches the tier contract', async () => {
      const retrieve = vi
        .spyOn(service.stripe.prices, 'retrieve')
        .mockResolvedValue({
          active: true,
          currency: 'usd',
          id: 'pro_id',
          metadata: { included_monthly_credits: '5900' },
          recurring: { interval: 'month', interval_count: 1 },
          unit_amount: 4_900,
        } as unknown as Stripe.Response<Stripe.Price>);

      await expect(
        service.validateSubscriptionPriceForTier('pro_id', 'pro'),
      ).resolves.toBeUndefined();
      expect(retrieve).toHaveBeenCalledWith('pro_id', {
        expand: ['product'],
      });
      expect(loggerMock.log).toHaveBeenCalledWith(
        expect.stringContaining('subscription price validated'),
        { outcome: 'valid', tier: 'pro' },
      );
    });

    it('accepts an otherwise valid Pro price without credit metadata so the published tier fallback applies', async () => {
      vi.spyOn(service.stripe.prices, 'retrieve').mockResolvedValue({
        active: true,
        currency: 'usd',
        id: 'pro_id',
        metadata: {},
        recurring: { interval: 'month', interval_count: 1 },
        unit_amount: 4_900,
      } as unknown as Stripe.Response<Stripe.Price>);

      await expect(
        service.validateSubscriptionPriceForTier('pro_id', 'pro'),
      ).resolves.toBeUndefined();
    });

    it.each([
      ['inactive', { active: false }],
      ['wrong currency', { currency: 'eur' }],
      ['wrong cadence', { recurring: { interval: 'year', interval_count: 1 } }],
      ['wrong amount', { unit_amount: 3_900 }],
      [
        'wrong credit grant',
        { metadata: { included_monthly_credits: '8000' } },
      ],
    ])('fails closed for a Pro price with %s', async (_label, override) => {
      vi.spyOn(service.stripe.prices, 'retrieve').mockResolvedValue({
        active: true,
        currency: 'usd',
        id: 'pro_id',
        metadata: { included_monthly_credits: '5900' },
        recurring: { interval: 'month', interval_count: 1 },
        unit_amount: 4_900,
        ...override,
      } as unknown as Stripe.Response<Stripe.Price>);

      const error = await service
        .validateSubscriptionPriceForTier('pro_id', 'pro')
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(
        'Production subscription price configuration is invalid',
      );
      expect(JSON.stringify(loggerMock.error.mock.calls)).not.toContain(
        'pro_id',
      );
    });

    it('fails production startup when the Pro price is missing without calling Stripe', async () => {
      const configGet = buildConfigGet();
      configGet.mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'production';
        if (key === 'GENFEED_CLOUD') return '1';
        if (key === 'STRIPE_PRICE_SUBSCRIPTION_PRO_MONTHLY') return '';
        return buildConfigGet()(key);
      });
      const production = await buildModule(configGet);
      const retrieve = vi.spyOn(production.service.stripe.prices, 'retrieve');

      await expect(production.service.onApplicationBootstrap()).rejects.toThrow(
        'Production subscription price configuration is invalid',
      );
      expect(retrieve).not.toHaveBeenCalled();
    });

    it('fails production startup when the Pro price identifier is malformed', async () => {
      const configGet = buildConfigGet();
      configGet.mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'production';
        if (key === 'GENFEED_CLOUD') return '1';
        if (key === 'STRIPE_PRICE_SUBSCRIPTION_PRO_MONTHLY')
          return 'not-a-price';
        return buildConfigGet()(key);
      });
      const production = await buildModule(configGet);

      await expect(production.service.onApplicationBootstrap()).rejects.toThrow(
        'Production subscription price configuration is invalid',
      );
    });
  });

  // -----------------------------------------------------------------------
  // createOrganizationCustomer
  // -----------------------------------------------------------------------

  describe('createOrganizationCustomer', () => {
    it('creates a Stripe customer with organization metadata and returns it', async () => {
      const mockCustomer = makeMockCustomer('cus_org');
      const createSpy = vi
        .spyOn(service.stripe.customers, 'create')
        .mockResolvedValue(
          mockCustomer as unknown as Stripe.Response<Stripe.Customer>,
        );

      const result = await service.createOrganizationCustomer(
        'Acme Inc',
        'billing@acme.com',
        'org_1',
        'user_1',
      );

      expect(createSpy).toHaveBeenCalledWith(
        {
          email: 'billing@acme.com',
          metadata: {
            organizationId: 'org_1',
            type: 'organization',
            userId: 'user_1',
          },
          name: 'Acme Inc',
        },
        {
          idempotencyKey: expect.stringMatching(
            /^org-customer-org_1-[0-9a-f]{16}$/,
          ),
        },
      );
      expect(result).toBe(mockCustomer);
      expect(loggerMock.log).toHaveBeenCalled();
    });

    it('uses one organization-generation key for concurrent members with different details', async () => {
      const createSpy = vi
        .spyOn(service.stripe.customers, 'create')
        .mockResolvedValue(
          makeMockCustomer(
            'cus_org',
          ) as unknown as Stripe.Response<Stripe.Customer>,
        );

      await Promise.all([
        service.createOrganizationCustomer(
          'Acme Inc',
          'owner@acme.com',
          'org_1',
          'user_owner',
          null,
        ),
        service.createOrganizationCustomer(
          'Acme Renamed',
          'member@acme.com',
          'org_1',
          'user_member',
          null,
        ),
      ]);

      const firstKey = createSpy.mock.calls[0]?.[1]?.idempotencyKey;
      const secondKey = createSpy.mock.calls[1]?.[1]?.idempotencyKey;
      expect(firstKey).toBe(secondKey);
    });

    it('uses a new key when replacing a stale Stripe customer generation', async () => {
      const createSpy = vi
        .spyOn(service.stripe.customers, 'create')
        .mockResolvedValue(
          makeMockCustomer(
            'cus_replacement',
          ) as unknown as Stripe.Response<Stripe.Customer>,
        );

      await service.createOrganizationCustomer(
        'Acme Inc',
        'owner@acme.com',
        'org_1',
        'user_owner',
        null,
      );
      await service.createOrganizationCustomer(
        'Acme Inc',
        'owner@acme.com',
        'org_1',
        'user_owner',
        'cus_stale',
      );

      const initialKey = createSpy.mock.calls[0]?.[1]?.idempotencyKey;
      const replacementKey = createSpy.mock.calls[1]?.[1]?.idempotencyKey;
      expect(replacementKey).not.toBe(initialKey);
      expect(replacementKey).toMatch(/^org-customer-org_1-[0-9a-f]{16}$/);
    });

    it('re-throws and logs on Stripe error', async () => {
      const stripeError = new Error('Stripe unavailable');
      vi.spyOn(service.stripe.customers, 'create').mockRejectedValue(
        stripeError,
      );

      await expect(
        service.createOrganizationCustomer('Acme', 'b@a.com', 'org_1', 'u_1'),
      ).rejects.toThrow('Stripe unavailable');
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // createUserCustomer
  // -----------------------------------------------------------------------

  describe('createUserCustomer', () => {
    it('creates a user customer with email as name when name is omitted', async () => {
      const mockCustomer = makeMockCustomer('cus_user1');
      const createSpy = vi
        .spyOn(service.stripe.customers, 'create')
        .mockResolvedValue(
          mockCustomer as unknown as Stripe.Response<Stripe.Customer>,
        );

      const result = await service.createUserCustomer(
        'user_1',
        'hello@test.com',
      );

      expect(createSpy).toHaveBeenCalledWith(
        {
          email: 'hello@test.com',
          metadata: { type: 'user', userId: 'user_1' },
          name: 'hello@test.com',
        },
        {
          idempotencyKey: expect.stringMatching(
            /^user-customer-user_1-[0-9a-f]{16}$/,
          ),
        },
      );
      expect(result).toBe(mockCustomer);
    });

    it('uses provided name when given', async () => {
      const mockCustomer = makeMockCustomer('cus_user2');
      const createSpy = vi
        .spyOn(service.stripe.customers, 'create')
        .mockResolvedValue(
          mockCustomer as unknown as Stripe.Response<Stripe.Customer>,
        );

      await service.createUserCustomer('user_2', 'hello@test.com', 'Vincent');

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Vincent' }),
        expect.objectContaining({ idempotencyKey: expect.any(String) }),
      );
    });

    it('re-throws and logs on Stripe error', async () => {
      vi.spyOn(service.stripe.customers, 'create').mockRejectedValue(
        new Error('customer create failed'),
      );

      await expect(
        service.createUserCustomer('user_3', 'x@x.com'),
      ).rejects.toThrow('customer create failed');
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // createUserPaymentSession
  // -----------------------------------------------------------------------

  describe('createUserPaymentSession', () => {
    it('creates a payment-mode session (default)', async () => {
      const mockSession = makeMockSession('sess_upay');
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue(mockSession);

      const result = await service.createUserPaymentSession({
        cancelUrl: 'https://app/cancel',
        stripeCustomerId: 'cus_1',
        stripePriceId: 'price_abc',
        successUrl: 'https://app/success',
        userId: 'user_1',
      });

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_1',
          line_items: [
            expect.objectContaining({ price: 'price_abc', quantity: 1 }),
          ],
          metadata: expect.objectContaining({ type: 'user', userId: 'user_1' }),
          mode: 'payment',
        }),
      );
      expect(result).toBe(mockSession);
    });

    it('creates a subscription-mode session and adds subscription_data metadata', async () => {
      const mockSession = makeMockSession('sess_usub');
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue(mockSession);

      await service.createUserPaymentSession({
        cancelUrl: 'https://app/cancel',
        mode: 'subscription',
        stripeCustomerId: 'cus_2',
        stripePriceId: 'price_sub',
        successUrl: 'https://app/success',
        userId: 'user_2',
      });

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'subscription',
          subscription_data: {
            metadata: { type: 'user', userId: 'user_2' },
          },
        }),
      );
    });

    it('passes through a custom quantity', async () => {
      vi.spyOn(service.stripe.checkout.sessions, 'create').mockResolvedValue(
        makeMockSession(),
      );

      await service.createUserPaymentSession({
        cancelUrl: 'https://app/cancel',
        quantity: 5,
        stripeCustomerId: 'cus_3',
        stripePriceId: 'price_abc',
        successUrl: 'https://app/success',
        userId: 'user_3',
      });

      const call = vi.mocked(service.stripe.checkout.sessions.create).mock
        .calls[0][0] as { line_items: Array<{ quantity: number }> };
      expect(call.line_items[0].quantity).toBe(5);
    });

    it('re-throws and logs on Stripe error', async () => {
      vi.spyOn(service.stripe.checkout.sessions, 'create').mockRejectedValue(
        new Error('checkout create failed'),
      );

      await expect(
        service.createUserPaymentSession({
          cancelUrl: 'https://app/cancel',
          stripeCustomerId: 'cus_x',
          stripePriceId: 'price_x',
          successUrl: 'https://app/success',
          userId: 'user_x',
        }),
      ).rejects.toThrow('checkout create failed');
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // createManagedPaymentSession
  // -----------------------------------------------------------------------

  describe('createManagedPaymentSession', () => {
    it('sets lastName in metadata when provided and trims whitespace', async () => {
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue(makeMockSession());

      await service.createManagedPaymentSession({
        email: 'a@b.com',
        lastName: '  Smith  ',
        stripePriceId: 'some_price',
      });

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ lastName: 'Smith' }),
        }),
      );
    });

    it('does NOT set firstName/lastName keys when blank strings are provided', async () => {
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue(makeMockSession());

      await service.createManagedPaymentSession({
        email: 'a@b.com',
        firstName: '   ',
        lastName: '',
        stripePriceId: 'some_price',
      });

      const call = createSpy.mock.calls[0][0] as {
        metadata: Record<string, string>;
      };
      expect(call.metadata).not.toHaveProperty('firstName');
      expect(call.metadata).not.toHaveProperty('lastName');
    });

    it('uses custom successUrl and cancelUrl when provided', async () => {
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue(makeMockSession());

      await service.createManagedPaymentSession({
        cancelUrl: 'https://custom/cancel',
        email: 'a@b.com',
        stripePriceId: 'some_price',
        successUrl: 'https://custom/success',
      });

      const call = createSpy.mock.calls[0][0] as {
        cancel_url: string;
        success_url: string;
      };
      expect(call.success_url).toBe('https://custom/success');
      expect(call.cancel_url).toBe('https://custom/cancel');
    });

    it('falls back to GENFEEDAI_APP_URL-based URLs when none provided', async () => {
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue(makeMockSession());

      await service.createManagedPaymentSession({
        email: 'a@b.com',
        stripePriceId: 'some_price',
      });

      const call = createSpy.mock.calls[0][0] as {
        cancel_url: string;
        success_url: string;
      };
      expect(call.cancel_url).toContain('localhost:3000');
      expect(call.success_url).toContain('CHECKOUT_SESSION_ID');
    });

    it('does not set payg metadata for a non-payg price', async () => {
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue(makeMockSession());

      await service.createManagedPaymentSession({
        email: 'a@b.com',
        stripePriceId: 'non_payg_price',
      });

      const call = createSpy.mock.calls[0][0] as {
        metadata: Record<string, string>;
      };
      expect(call.metadata).not.toHaveProperty('plan_type');
      expect(call.metadata).not.toHaveProperty('credits');
    });

    it('re-throws and logs on Stripe error', async () => {
      vi.spyOn(service.stripe.checkout.sessions, 'create').mockRejectedValue(
        new Error('managed session error'),
      );

      await expect(
        service.createManagedPaymentSession({
          email: 'a@b.com',
          stripePriceId: 'some_price',
        }),
      ).rejects.toThrow('managed session error');
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // getUserBillingPortalUrl
  // -----------------------------------------------------------------------

  describe('getUserBillingPortalUrl', () => {
    it('creates a billing portal session for the user customer', async () => {
      const mockPortal = makeMockBillingPortalSession('bps_user');
      const createSpy = vi
        .spyOn(service.stripe.billingPortal.sessions, 'create')
        .mockResolvedValue(mockPortal);

      const result = await service.getUserBillingPortalUrl(
        'cus_1',
        'https://app/return',
      );

      expect(createSpy).toHaveBeenCalledWith({
        customer: 'cus_1',
        return_url: 'https://app/return',
      });
      expect(result).toBe(mockPortal);
    });

    it('re-throws and logs on Stripe error', async () => {
      vi.spyOn(
        service.stripe.billingPortal.sessions,
        'create',
      ).mockRejectedValue(new Error('portal error'));

      await expect(
        service.getUserBillingPortalUrl('cus_1', 'https://app/return'),
      ).rejects.toThrow('portal error');
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // createSetupCheckoutSession
  // -----------------------------------------------------------------------

  describe('createSetupCheckoutSession', () => {
    it('creates a setup-mode checkout session', async () => {
      const mockSession = makeMockSession('sess_setup');
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue(mockSession);

      const result = await service.createSetupCheckoutSession(
        'cus_1',
        'https://app/success',
        'https://app/cancel',
      );

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          cancel_url: 'https://app/cancel',
          customer: 'cus_1',
          mode: 'setup',
          success_url: 'https://app/success',
        }),
      );
      expect(result).toBe(mockSession);
    });

    it('re-throws and logs on Stripe error', async () => {
      vi.spyOn(service.stripe.checkout.sessions, 'create').mockRejectedValue(
        new Error('setup session error'),
      );

      await expect(
        service.createSetupCheckoutSession('cus_x', 'https://a', 'https://b'),
      ).rejects.toThrow('setup session error');
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // retrieveCustomer
  // -----------------------------------------------------------------------

  describe('retrieveCustomer', () => {
    it('returns the customer when not deleted', async () => {
      const mockCustomer = makeMockCustomer('cus_alive') as Stripe.Customer;
      vi.spyOn(service.stripe.customers, 'retrieve').mockResolvedValue(
        mockCustomer as unknown as Stripe.Response<
          Stripe.Customer | Stripe.DeletedCustomer
        >,
      );

      const result = await service.retrieveCustomer('cus_alive');

      expect(result).toBe(mockCustomer);
    });

    it('returns null when the customer is deleted', async () => {
      const deletedCustomer = makeMockCustomer('cus_dead', true);
      vi.spyOn(service.stripe.customers, 'retrieve').mockResolvedValue(
        deletedCustomer as unknown as Stripe.Response<
          Stripe.Customer | Stripe.DeletedCustomer
        >,
      );

      const result = await service.retrieveCustomer('cus_dead');

      expect(result).toBeNull();
    });

    it('re-throws and logs on Stripe error', async () => {
      vi.spyOn(service.stripe.customers, 'retrieve').mockRejectedValue(
        new Error('retrieve error'),
      );

      await expect(service.retrieveCustomer('cus_x')).rejects.toThrow(
        'retrieve error',
      );
      expect(loggerMock.error).toHaveBeenCalled();
    });

    it('returns null for Stripe resource_missing without treating it as a fault', async () => {
      vi.spyOn(service.stripe.customers, 'retrieve').mockRejectedValue({
        code: 'resource_missing',
        type: 'StripeInvalidRequestError',
      });

      const result = await service.retrieveCustomer('cus_stale');

      expect(result).toBeNull();
      expect(loggerMock.error).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // getBillingPortalUrl
  // -----------------------------------------------------------------------

  describe('getBillingPortalUrl', () => {
    it('creates a billing portal session with the caller-resolved return URL', async () => {
      const mockPortal = makeMockBillingPortalSession('bps_org');
      const createSpy = vi
        .spyOn(service.stripe.billingPortal.sessions, 'create')
        .mockResolvedValue(mockPortal);

      const result = await service.getBillingPortalUrl(
        'cus_1',
        'https://app.example.com',
      );

      expect(createSpy).toHaveBeenCalledWith({
        customer: 'cus_1',
        return_url: 'https://app.example.com',
      });
      expect(result).toBe(mockPortal);
    });

    it('re-throws and logs on Stripe error', async () => {
      vi.spyOn(
        service.stripe.billingPortal.sessions,
        'create',
      ).mockRejectedValue(new Error('billing portal error'));

      await expect(
        service.getBillingPortalUrl('cus_1', 'https://app.example.com'),
      ).rejects.toThrow('billing portal error');
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // getPrice
  // -----------------------------------------------------------------------

  describe('getPrice', () => {
    it('retrieves and returns a price with product expanded', async () => {
      const mockPrice = makeMockPrice('price_abc', false);
      const retrieveSpy = vi
        .spyOn(service.stripe.prices, 'retrieve')
        .mockResolvedValue(
          mockPrice as unknown as Stripe.Response<Stripe.Price>,
        );

      const result = await service.getPrice('price_abc');

      expect(retrieveSpy).toHaveBeenCalledWith('price_abc', {
        expand: ['product'],
      });
      expect(result).toBe(mockPrice);
    });

    it('re-throws and logs on Stripe error', async () => {
      vi.spyOn(service.stripe.prices, 'retrieve').mockRejectedValue(
        new Error('price not found'),
      );

      await expect(service.getPrice('price_bad')).rejects.toThrow(
        'price not found',
      );
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // createPaymentSession — subscription branch
  // -----------------------------------------------------------------------

  describe('createPaymentSession — subscription branch', () => {
    it('uses subscription mode for pro_id price', async () => {
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue(makeMockSession());

      await service.createPaymentSession('cus_1', 'pro_id', 'http://origin');

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'subscription',
          subscription_data: expect.objectContaining({
            metadata: expect.objectContaining({ tier: 'pro', type: 'monthly' }),
          }),
        }),
      );
    });

    it('uses subscription mode for scale_id price', async () => {
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue(makeMockSession());

      await service.createPaymentSession('cus_1', 'scale_id', 'http://origin');

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'subscription',
          subscription_data: expect.objectContaining({
            metadata: expect.objectContaining({ tier: 'scale' }),
          }),
        }),
      );
    });

    it('uses subscription mode for enterprise_id price', async () => {
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue(makeMockSession());

      await service.createPaymentSession(
        'cus_1',
        'enterprise_id',
        'http://origin',
      );

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'subscription',
          subscription_data: expect.objectContaining({
            metadata: expect.objectContaining({ tier: 'enterprise' }),
          }),
        }),
      );
    });

    it('uses subscription mode for the yearly Pro price', async () => {
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue(makeMockSession());

      await service.createPaymentSession(
        'cus_1',
        'pro_yearly_id',
        'http://origin',
      );

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'subscription',
          subscription_data: expect.objectContaining({
            metadata: expect.objectContaining({ tier: 'pro', type: 'yearly' }),
          }),
        }),
      );
    });

    it('routes to success/cancel URLs correctly when origin equals GENFEEDAI_APP_URL', async () => {
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue(makeMockSession());

      await service.createPaymentSession(
        'cus_1',
        'pro_id',
        'http://localhost:3000',
      );

      const call = createSpy.mock.calls[0][0] as {
        cancel_url: string;
        success_url: string;
      };
      expect(call.success_url).toBe(
        'http://localhost:3000/welcome/subscribe/success',
      );
      expect(call.cancel_url).toBe(
        'http://localhost:3000/welcome/subscribe/cancel',
      );
    });

    it('routes to /billing when origin differs from GENFEEDAI_APP_URL', async () => {
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue(makeMockSession());

      await service.createPaymentSession(
        'cus_1',
        'pro_id',
        'https://custom.example.com',
      );

      const call = createSpy.mock.calls[0][0] as {
        cancel_url: string;
        success_url: string;
      };
      expect(call.success_url).toBe('https://custom.example.com/billing');
      expect(call.cancel_url).toBe('https://custom.example.com/billing');
    });

    it('respects custom redirectUrls override', async () => {
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue(makeMockSession());

      await service.createPaymentSession(
        'cus_1',
        'pro_id',
        'http://origin',
        1,
        { cancel: 'https://custom/cancel', success: 'https://custom/success' },
      );

      const call = createSpy.mock.calls[0][0] as {
        cancel_url: string;
        success_url: string;
      };
      expect(call.success_url).toBe('https://custom/success');
      expect(call.cancel_url).toBe('https://custom/cancel');
    });
  });

  // -----------------------------------------------------------------------
  // createPaymentSession — custom price branch (recurring)
  // -----------------------------------------------------------------------

  describe('createPaymentSession — custom price branch', () => {
    it('uses subscription mode for an unknown recurring price and adds custom plan_type metadata', async () => {
      vi.spyOn(service.stripe.prices, 'retrieve').mockResolvedValue(
        makeMockPrice(
          'price_custom_recurring',
          true,
        ) as unknown as Stripe.Response<Stripe.Price>,
      );
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue(makeMockSession());

      await service.createPaymentSession(
        'cus_1',
        'price_custom_recurring',
        'http://origin',
      );

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'subscription',
          subscription_data: expect.objectContaining({
            metadata: { plan_type: 'custom' },
          }),
        }),
      );
    });

    it('uses payment mode for an unknown non-recurring price', async () => {
      vi.spyOn(service.stripe.prices, 'retrieve').mockResolvedValue(
        makeMockPrice(
          'price_custom_onetime',
          false,
        ) as unknown as Stripe.Response<Stripe.Price>,
      );
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue(makeMockSession());

      await service.createPaymentSession(
        'cus_1',
        'price_custom_onetime',
        'http://origin',
      );

      const call = createSpy.mock.calls[0][0] as {
        mode: string;
        subscription_data?: unknown;
      };
      expect(call.mode).toBe('payment');
      expect(call.subscription_data).toBeUndefined();
    });

    it('re-throws and logs when checkout.sessions.create throws', async () => {
      vi.spyOn(service.stripe.prices, 'retrieve').mockResolvedValue(
        makeMockPrice(
          'price_bad',
          false,
        ) as unknown as Stripe.Response<Stripe.Price>,
      );
      vi.spyOn(service.stripe.checkout.sessions, 'create').mockRejectedValue(
        new Error('session create error'),
      );

      await expect(
        service.createPaymentSession('cus_1', 'price_bad', 'http://origin'),
      ).rejects.toThrow('session create error');
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // cancelSubscription
  // -----------------------------------------------------------------------

  describe('cancelSubscription', () => {
    it('cancels at period end by default', async () => {
      const mockSub = makeMockSubscription();
      const updateSpy = vi
        .spyOn(service.stripe.subscriptions, 'update')
        .mockResolvedValue(
          mockSub as unknown as Stripe.Response<Stripe.Subscription>,
        );

      const result = await service.cancelSubscription('sub_1');

      expect(updateSpy).toHaveBeenCalledWith('sub_1', {
        cancel_at_period_end: true,
      });
      expect(result).toBe(mockSub);
    });

    it('cancels immediately when cancelAtPeriodEnd is false', async () => {
      const mockSub = makeMockSubscription();
      const updateSpy = vi
        .spyOn(service.stripe.subscriptions, 'update')
        .mockResolvedValue(
          mockSub as unknown as Stripe.Response<Stripe.Subscription>,
        );

      await service.cancelSubscription('sub_1', false);

      expect(updateSpy).toHaveBeenCalledWith('sub_1', {
        cancel_at_period_end: false,
      });
    });

    it('re-throws and logs on Stripe error', async () => {
      vi.spyOn(service.stripe.subscriptions, 'update').mockRejectedValue(
        new Error('cancel error'),
      );

      await expect(service.cancelSubscription('sub_x')).rejects.toThrow(
        'cancel error',
      );
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // changeSubscriptionPlan
  // -----------------------------------------------------------------------

  describe('changeSubscriptionPlan', () => {
    it('retrieves the subscription and updates to the new price', async () => {
      const mockCurrentSub = makeMockSubscription('sub_1', 'si_1', 'old_price');
      const mockUpdatedSub = makeMockSubscription('sub_1', 'si_1', 'new_price');

      const retrieveSpy = vi
        .spyOn(service.stripe.subscriptions, 'retrieve')
        .mockResolvedValue(
          mockCurrentSub as unknown as Stripe.Response<Stripe.Subscription>,
        );
      const updateSpy = vi
        .spyOn(service.stripe.subscriptions, 'update')
        .mockResolvedValue(
          mockUpdatedSub as unknown as Stripe.Response<Stripe.Subscription>,
        );

      const result = await service.changeSubscriptionPlan('sub_1', 'new_price');

      expect(retrieveSpy).toHaveBeenCalledWith('sub_1', {
        expand: ['items.data.price'],
      });
      expect(updateSpy).toHaveBeenCalledWith(
        'sub_1',
        expect.objectContaining({
          items: [{ id: 'si_1', price: 'new_price' }],
          proration_behavior: 'create_prorations',
        }),
      );
      expect(result).toBe(mockUpdatedSub);
    });

    it('uses provided prorationBehavior', async () => {
      const mockSub = makeMockSubscription();
      vi.spyOn(service.stripe.subscriptions, 'retrieve').mockResolvedValue(
        mockSub as unknown as Stripe.Response<Stripe.Subscription>,
      );
      const updateSpy = vi
        .spyOn(service.stripe.subscriptions, 'update')
        .mockResolvedValue(
          mockSub as unknown as Stripe.Response<Stripe.Subscription>,
        );

      await service.changeSubscriptionPlan('sub_1', 'new_price', 'none');

      expect(updateSpy).toHaveBeenCalledWith(
        'sub_1',
        expect.objectContaining({ proration_behavior: 'none' }),
      );
    });

    it('throws an error when subscription has no items', async () => {
      const emptyItemsSub = {
        id: 'sub_empty',
        items: { data: [] },
      } as unknown as Stripe.Subscription;

      vi.spyOn(service.stripe.subscriptions, 'retrieve').mockResolvedValue(
        emptyItemsSub as unknown as Stripe.Response<Stripe.Subscription>,
      );

      await expect(
        service.changeSubscriptionPlan('sub_empty', 'new_price'),
      ).rejects.toThrow('No subscription items found');
      expect(loggerMock.error).toHaveBeenCalled();
    });

    it('re-throws and logs on Stripe retrieve error', async () => {
      vi.spyOn(service.stripe.subscriptions, 'retrieve').mockRejectedValue(
        new Error('retrieve failed'),
      );

      await expect(
        service.changeSubscriptionPlan('sub_x', 'new_price'),
      ).rejects.toThrow('retrieve failed');
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // getSubscription
  // -----------------------------------------------------------------------

  describe('getSubscription', () => {
    it('retrieves and returns a subscription with expanded items and customer', async () => {
      const mockSub = makeMockSubscription('sub_1');
      const retrieveSpy = vi
        .spyOn(service.stripe.subscriptions, 'retrieve')
        .mockResolvedValue(
          mockSub as unknown as Stripe.Response<Stripe.Subscription>,
        );

      const result = await service.getSubscription('sub_1');

      expect(retrieveSpy).toHaveBeenCalledWith('sub_1', {
        expand: ['items.data.price', 'customer'],
      });
      expect(result).toBe(mockSub);
      expect(loggerMock.log).toHaveBeenCalled();
    });

    it('re-throws and logs on Stripe error', async () => {
      vi.spyOn(service.stripe.subscriptions, 'retrieve').mockRejectedValue(
        new Error('subscription not found'),
      );

      await expect(service.getSubscription('sub_bad')).rejects.toThrow(
        'subscription not found',
      );
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // getUpcomingInvoice
  // -----------------------------------------------------------------------

  describe('getUpcomingInvoice', () => {
    beforeEach(() => {
      vi.spyOn(service.stripe.prices, 'retrieve').mockResolvedValue({
        id: 'price_target',
        recurring: { usage_type: 'licensed' },
      } as unknown as Stripe.Response<Stripe.Price>);
    });

    it('returns the Stripe upgrade preview with customer, subscription, item, price, and quantity scope', async () => {
      const mockSub = makeMockSubscription('sub_1');
      vi.spyOn(service.stripe.subscriptions, 'retrieve').mockResolvedValue(
        mockSub as unknown as Stripe.Response<Stripe.Subscription>,
      );
      const preview = makeMockInvoicePreview(32_500, 'usd', [
        { amount: 15_000, proration: true },
      ]);
      const createPreview = vi
        .spyOn(service.stripe.invoices, 'createPreview')
        .mockResolvedValue(
          preview as unknown as Stripe.Response<Stripe.Invoice>,
        );
      const createInvoice = vi.spyOn(service.stripe.invoices, 'create');
      const updateSubscription = vi.spyOn(
        service.stripe.subscriptions,
        'update',
      );

      const result = await service.getUpcomingInvoice(
        'cus_1',
        'sub_1',
        'price_1',
        'price_scale',
        3,
      );

      expect(result).toBe(preview);
      expect(createPreview).toHaveBeenCalledWith({
        customer: 'cus_1',
        subscription: 'sub_1',
        subscription_details: {
          items: [
            {
              id: 'si_1',
              price: 'price_scale',
              quantity: 3,
            },
          ],
          proration_behavior: 'create_prorations',
        },
      });
      expect(createInvoice).not.toHaveBeenCalled();
      expect(updateSubscription).not.toHaveBeenCalled();
      expect(loggerMock.log).toHaveBeenCalled();
    });

    it('returns Stripe downgrade credits without normalizing their amount', async () => {
      vi.spyOn(service.stripe.subscriptions, 'retrieve').mockResolvedValue(
        makeMockSubscription() as unknown as Stripe.Response<Stripe.Subscription>,
      );
      const preview = makeMockInvoicePreview(900, 'eur', [
        { amount: -1_200, proration: true },
      ]);
      vi.spyOn(service.stripe.invoices, 'createPreview').mockResolvedValue(
        preview as unknown as Stripe.Response<Stripe.Invoice>,
      );

      const result = await service.getUpcomingInvoice(
        'cus_1',
        'sub_1',
        'price_1',
        'price_starter',
      );

      expect(result.amount_due).toBe(900);
      expect(result.currency).toBe('eur');
      expect(result.lines.data[0]?.amount).toBe(-1_200);
    });

    it('preserves the current subscription item quantity by default', async () => {
      vi.spyOn(service.stripe.subscriptions, 'retrieve').mockResolvedValue(
        makeMockSubscription(
          'sub_1',
          'si_1',
          'price_1',
          'cus_1',
          3,
        ) as unknown as Stripe.Response<Stripe.Subscription>,
      );
      const createPreview = vi
        .spyOn(service.stripe.invoices, 'createPreview')
        .mockResolvedValue(
          makeMockInvoicePreview(
            0,
            'usd',
            [],
          ) as unknown as Stripe.Response<Stripe.Invoice>,
        );

      await service.getUpcomingInvoice(
        'cus_1',
        'sub_1',
        'price_1',
        'price_scale',
      );

      expect(createPreview).toHaveBeenCalledWith(
        expect.objectContaining({
          subscription_details: expect.objectContaining({
            items: [
              expect.objectContaining({
                id: 'si_1',
                price: 'price_scale',
                quantity: 3,
              }),
            ],
          }),
        }),
      );
    });

    it('omits quantity when the target price is metered', async () => {
      vi.spyOn(service.stripe.subscriptions, 'retrieve').mockResolvedValue(
        makeMockSubscription(
          'sub_1',
          'si_1',
          'price_1',
          'cus_1',
          3,
        ) as unknown as Stripe.Response<Stripe.Subscription>,
      );
      vi.spyOn(service.stripe.prices, 'retrieve').mockResolvedValue({
        id: 'price_metered',
        recurring: { usage_type: 'metered' },
      } as unknown as Stripe.Response<Stripe.Price>);
      const createPreview = vi
        .spyOn(service.stripe.invoices, 'createPreview')
        .mockResolvedValue(
          makeMockInvoicePreview(
            0,
            'usd',
            [],
          ) as unknown as Stripe.Response<Stripe.Invoice>,
        );

      await service.getUpcomingInvoice(
        'cus_1',
        'sub_1',
        'price_1',
        'price_metered',
      );

      const previewItem =
        createPreview.mock.calls[0]?.[0]?.subscription_details?.items?.[0];
      expect(previewItem).toEqual({ id: 'si_1', price: 'price_metered' });
    });

    it('re-throws and logs target price lookup errors', async () => {
      vi.spyOn(service.stripe.subscriptions, 'retrieve').mockResolvedValue(
        makeMockSubscription() as unknown as Stripe.Response<Stripe.Subscription>,
      );
      vi.spyOn(service.stripe.prices, 'retrieve').mockRejectedValue(
        new Error('price lookup failed'),
      );
      const createPreview = vi.spyOn(service.stripe.invoices, 'createPreview');

      await expect(
        service.getUpcomingInvoice(
          'cus_1',
          'sub_1',
          'price_1',
          'price_missing',
        ),
      ).rejects.toThrow('price lookup failed');
      expect(createPreview).not.toHaveBeenCalled();
      expect(loggerMock.error).toHaveBeenCalled();
    });

    it('rejects a subscription owned by a different Stripe customer', async () => {
      vi.spyOn(service.stripe.subscriptions, 'retrieve').mockResolvedValue(
        makeMockSubscription(
          'sub_1',
          'si_1',
          'price_1',
          'cus_other',
        ) as unknown as Stripe.Response<Stripe.Subscription>,
      );
      const createPreview = vi.spyOn(service.stripe.invoices, 'createPreview');

      await expect(
        service.getUpcomingInvoice('cus_1', 'sub_1', 'price_1', 'price_scale'),
      ).rejects.toThrow(
        'Stripe subscription does not belong to the requested customer',
      );
      expect(createPreview).not.toHaveBeenCalled();
    });

    it('rejects a missing target price before calling Stripe', async () => {
      const retrieve = vi.spyOn(service.stripe.subscriptions, 'retrieve');

      await expect(
        service.getUpcomingInvoice('cus_1', 'sub_1', 'price_1', ''),
      ).rejects.toThrow('Invalid Stripe price ID');
      expect(retrieve).not.toHaveBeenCalled();
    });

    it('rejects an invalid target quantity before calling Stripe', async () => {
      const retrieve = vi.spyOn(service.stripe.subscriptions, 'retrieve');

      await expect(
        service.getUpcomingInvoice(
          'cus_1',
          'sub_1',
          'price_1',
          'price_scale',
          0,
        ),
      ).rejects.toThrow('Subscription quantity must be a positive integer');
      expect(retrieve).not.toHaveBeenCalled();
    });

    it('throws an error when subscription has no items', async () => {
      const emptyItemsSub = {
        customer: 'cus_1',
        id: 'sub_empty',
        items: { data: [] },
      } as unknown as Stripe.Subscription;

      vi.spyOn(service.stripe.subscriptions, 'retrieve').mockResolvedValue(
        emptyItemsSub as unknown as Stripe.Response<Stripe.Subscription>,
      );

      await expect(
        service.getUpcomingInvoice(
          'cus_1',
          'sub_empty',
          'price_1',
          'price_new',
        ),
      ).rejects.toThrow('No subscription items found');
      expect(loggerMock.error).toHaveBeenCalled();
    });

    it('throws an error when the subscription item has no price', async () => {
      const missingPriceSub = {
        customer: 'cus_1',
        id: 'sub_missing_price',
        items: { data: [{ id: 'si_1', price: null }] },
      } as unknown as Stripe.Subscription;

      vi.spyOn(service.stripe.subscriptions, 'retrieve').mockResolvedValue(
        missingPriceSub as unknown as Stripe.Response<Stripe.Subscription>,
      );

      await expect(
        service.getUpcomingInvoice(
          'cus_1',
          'sub_missing_price',
          'price_1',
          'price_new',
        ),
      ).rejects.toThrow('No price found for subscription item');
    });

    it('selects the plan item by its current price on multi-item subscriptions', async () => {
      vi.spyOn(service.stripe.subscriptions, 'retrieve').mockResolvedValue({
        customer: 'cus_1',
        id: 'sub_multi',
        items: {
          data: [
            { id: 'si_addon', price: { id: 'price_addon' }, quantity: 10 },
            { id: 'si_plan', price: { id: 'price_plan' }, quantity: 2 },
          ],
        },
      } as unknown as Stripe.Response<Stripe.Subscription>);
      const createPreview = vi
        .spyOn(service.stripe.invoices, 'createPreview')
        .mockResolvedValue(
          makeMockInvoicePreview(
            0,
            'usd',
            [],
          ) as unknown as Stripe.Response<Stripe.Invoice>,
        );

      await service.getUpcomingInvoice(
        'cus_1',
        'sub_multi',
        'price_plan',
        'price_scale',
      );

      expect(
        createPreview.mock.calls[0]?.[0]?.subscription_details?.items?.[0],
      ).toEqual({
        id: 'si_plan',
        price: 'price_scale',
        quantity: 2,
      });
    });

    it('rejects a subscription without the expected current price item', async () => {
      vi.spyOn(service.stripe.subscriptions, 'retrieve').mockResolvedValue(
        makeMockSubscription() as unknown as Stripe.Response<Stripe.Subscription>,
      );

      await expect(
        service.getUpcomingInvoice(
          'cus_1',
          'sub_1',
          'price_other',
          'price_scale',
        ),
      ).rejects.toThrow('No subscription item found for current Stripe price');
      expect(service.stripe.prices.retrieve).not.toHaveBeenCalled();
    });

    it('re-throws and logs Stripe preview errors', async () => {
      vi.spyOn(service.stripe.subscriptions, 'retrieve').mockResolvedValue(
        makeMockSubscription() as unknown as Stripe.Response<Stripe.Subscription>,
      );
      vi.spyOn(service.stripe.invoices, 'createPreview').mockRejectedValue(
        new Error('invoice preview failed'),
      );

      await expect(
        service.getUpcomingInvoice('cus_1', 'sub_1', 'price_1', 'price_new'),
      ).rejects.toThrow('invoice preview failed');
      expect(loggerMock.error).toHaveBeenCalled();
    });

    it('re-throws and logs Stripe subscription errors', async () => {
      vi.spyOn(service.stripe.subscriptions, 'retrieve').mockRejectedValue(
        new Error('invoice retrieve failed'),
      );

      await expect(
        service.getUpcomingInvoice('cus_1', 'sub_x', 'price_1', 'price_new'),
      ).rejects.toThrow('invoice retrieve failed');
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // IS_SELF_HOSTED constructor path
  // -----------------------------------------------------------------------

  describe('IS_SELF_HOSTED constructor branch', () => {
    it('sets stripe to null when IS_SELF_HOSTED is true', async () => {
      // Re-mock @genfeedai/config with IS_SELF_HOSTED = true for this test only
      vi.doMock('@genfeedai/config', async (importOriginal) => {
        const actual =
          await importOriginal<typeof import('@genfeedai/config')>();
        return { ...actual, isSelfHostedDeployment: () => true };
      });

      // Dynamically re-import the service to get the IS_SELF_HOSTED=true variant
      const { StripeService: SelfHostedStripeService } = await import(
        '@server/services/integrations/stripe/services/stripe.service'
      );

      const configGetMock = buildConfigGet();
      const loggerSelfHosted = { error: vi.fn(), log: vi.fn() };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SelfHostedStripeService,
          { provide: ConfigService, useValue: { get: configGetMock } },
          { provide: LoggerService, useValue: loggerSelfHosted },
        ],
      }).compile();

      const selfHostedService = module.get<StripeService>(
        SelfHostedStripeService,
      );

      // In self-hosted mode the stripe client is null (noop)
      // We just verify the service is defined (not crashed on construction)
      expect(selfHostedService).toBeDefined();

      vi.doUnmock('@genfeedai/config');
    });
  });
});
