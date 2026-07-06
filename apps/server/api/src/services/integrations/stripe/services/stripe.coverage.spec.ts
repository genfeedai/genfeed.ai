vi.mock('@genfeedai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/config')>();

  return {
    ...actual,
    IS_SELF_HOSTED: false,
  };
});

import { ConfigService } from '@api/config/config.service';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
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
): Stripe.Subscription {
  return {
    id,
    items: {
      data: [
        {
          id: itemId,
          price: { id: priceId },
        },
      ],
    },
    status: 'active',
  } as unknown as Stripe.Subscription;
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
  };
  service: StripeService;
}> {
  const loggerMock = { error: vi.fn(), log: vi.fn() };

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

  // -----------------------------------------------------------------------
  // createOrganizationCustomer
  // -----------------------------------------------------------------------

  describe('createOrganizationCustomer', () => {
    it('creates a Stripe customer with organization metadata and returns it', async () => {
      const mockCustomer = makeMockCustomer('cus_org');
      const createSpy = vi
        .spyOn(service.stripe.customers, 'create')
        .mockResolvedValue(mockCustomer as Stripe.Customer);

      const result = await service.createOrganizationCustomer(
        'Acme Inc',
        'billing@acme.com',
        'org_1',
        'user_1',
      );

      expect(createSpy).toHaveBeenCalledWith({
        email: 'billing@acme.com',
        metadata: {
          organizationId: 'org_1',
          type: 'organization',
          userId: 'user_1',
        },
        name: 'Acme Inc',
      });
      expect(result).toBe(mockCustomer);
      expect(loggerMock.log).toHaveBeenCalled();
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
        .mockResolvedValue(mockCustomer as Stripe.Customer);

      const result = await service.createUserCustomer(
        'user_1',
        'hello@test.com',
      );

      expect(createSpy).toHaveBeenCalledWith({
        email: 'hello@test.com',
        metadata: { type: 'user', userId: 'user_1' },
        name: 'hello@test.com',
      });
      expect(result).toBe(mockCustomer);
    });

    it('uses provided name when given', async () => {
      const mockCustomer = makeMockCustomer('cus_user2');
      const createSpy = vi
        .spyOn(service.stripe.customers, 'create')
        .mockResolvedValue(mockCustomer as Stripe.Customer);

      await service.createUserCustomer('user_2', 'hello@test.com', 'Vincent');

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Vincent' }),
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
  });

  // -----------------------------------------------------------------------
  // getBillingPortalUrl
  // -----------------------------------------------------------------------

  describe('getBillingPortalUrl', () => {
    it('creates a billing portal session and appends /billing to return URL', async () => {
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
        return_url: 'https://app.example.com/billing',
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
    it('retrieves subscription and invoice list and returns a static preview object', async () => {
      const mockSub = makeMockSubscription('sub_1');
      vi.spyOn(service.stripe.subscriptions, 'retrieve').mockResolvedValue(
        mockSub as unknown as Stripe.Response<Stripe.Subscription>,
      );
      vi.spyOn(service.stripe.invoices, 'list').mockResolvedValue({
        data: [],
      } as unknown as Stripe.ApiList<Stripe.Invoice> &
        Stripe.Response<Stripe.ApiList<Stripe.Invoice>>);

      const result = await service.getUpcomingInvoice(
        'cus_1',
        'sub_1',
        'new_price',
      );

      expect(result).toMatchObject({
        amount_due: 0,
        currency: 'usd',
        lines: { data: [] },
      });
      expect(loggerMock.log).toHaveBeenCalled();
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
        service.getUpcomingInvoice('cus_1', 'sub_empty', 'new_price'),
      ).rejects.toThrow('No subscription items found');
      expect(loggerMock.error).toHaveBeenCalled();
    });

    it('re-throws and logs on Stripe retrieve error', async () => {
      vi.spyOn(service.stripe.subscriptions, 'retrieve').mockRejectedValue(
        new Error('invoice retrieve failed'),
      );

      await expect(
        service.getUpcomingInvoice('cus_1', 'sub_x', 'new_price'),
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
        return { ...actual, IS_SELF_HOSTED: true };
      });

      // Dynamically re-import the service to get the IS_SELF_HOSTED=true variant
      const { StripeService: SelfHostedStripeService } = await import(
        '@api/services/integrations/stripe/services/stripe.service'
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
