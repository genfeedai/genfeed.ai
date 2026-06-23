import { StripeWebhookService } from '@api/endpoints/webhooks/stripe/webhooks.stripe.service';
import type Stripe from 'stripe';

type InvoiceHandlerAccessor = {
  handleInvoicePaid(invoice: Stripe.Invoice, url: string): Promise<void>;
  handleInvoicePaymentFailed(
    invoice: Stripe.Invoice,
    url: string,
  ): Promise<void>;
};

describe('StripeWebhookService invoice handlers', () => {
  const configService = { get: vi.fn().mockReturnValue(undefined) };
  const loggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const subscriptionsService = {
    findOne: vi.fn(),
    patch: vi.fn(),
    syncSubscriptionState: vi.fn(),
  };
  const creditsUtilsService = {
    addOrganizationCreditsWithExpiration: vi.fn(),
    getOrganizationCreditsBalance: vi.fn().mockResolvedValue(35_000),
    resetOrganizationCredits: vi.fn(),
  };
  const activitiesService = { create: vi.fn() };

  function buildService(): InvoiceHandlerAccessor {
    return new StripeWebhookService(
      configService as never,
      loggerService as never,
      {} as never, // apiKeysService
      {} as never, // brandsService
      subscriptionsService as never,
      creditsUtilsService as never,
      activitiesService as never,
      {} as never, // usersService
      {} as never, // clerkService
      {} as never, // stripeService
      {} as never, // managedStripeCheckoutService
      {} as never, // organizationsService
      {} as never, // subscriptionAttributionsService
      {} as never, // userSubscriptionsService
      {} as never, // organizationSettingsService
      {} as never, // prisma
      {} as never, // requestContextCacheService
      {} as never, // accessBootstrapCacheService
      {} as never, // userSetupService
    ) as unknown as InvoiceHandlerAccessor;
  }

  function invoiceWith(overrides: Record<string, unknown>): Stripe.Invoice {
    return {
      billing_reason: 'subscription_cycle',
      id: 'in_123',
      metadata: {},
      ...overrides,
    } as unknown as Stripe.Invoice;
  }

  const monthlySubscription = {
    _id: 'sub_db_1',
    organization: 'org_1',
    status: 'active',
    stripeSubscriptionId: 'sub_stripe_1',
    type: 'monthly',
    user: 'user_1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    configService.get.mockReturnValue(undefined);
    creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(35_000);
    subscriptionsService.findOne.mockResolvedValue(monthlySubscription);
    subscriptionsService.patch.mockResolvedValue(monthlySubscription);
  });

  describe('handleInvoicePaid', () => {
    it('allocates monthly credits on a subscription_cycle invoice', async () => {
      const service = buildService();

      await service.handleInvoicePaid(
        invoiceWith({
          parent: {
            subscription_details: { subscription: 'sub_stripe_1' },
          },
        }),
        'test',
      );

      expect(subscriptionsService.findOne).toHaveBeenCalledWith({
        stripeSubscriptionId: 'sub_stripe_1',
      });
      expect(
        creditsUtilsService.addOrganizationCreditsWithExpiration,
      ).toHaveBeenCalledWith(
        'org_1',
        35_000,
        'monthly',
        expect.stringContaining('monthly'),
        expect.any(Date),
      );
    });

    it('resets credits for yearly subscriptions', async () => {
      subscriptionsService.findOne.mockResolvedValue({
        ...monthlySubscription,
        type: 'yearly',
      });
      subscriptionsService.patch.mockResolvedValue({
        ...monthlySubscription,
        type: 'yearly',
      });
      const service = buildService();

      await service.handleInvoicePaid(
        invoiceWith({
          parent: {
            subscription_details: { subscription: 'sub_stripe_1' },
          },
        }),
        'test',
      );

      expect(creditsUtilsService.resetOrganizationCredits).toHaveBeenCalledWith(
        'org_1',
        500_000,
        'yearly',
        expect.stringContaining('yearly'),
      );
    });

    it('does not query subscriptions when the invoice carries no subscription id', async () => {
      const service = buildService();

      await service.handleInvoicePaid(invoiceWith({}), 'test');

      expect(subscriptionsService.findOne).not.toHaveBeenCalled();
      expect(loggerService.warn).toHaveBeenCalled();
    });
  });

  describe('handleInvoicePaymentFailed', () => {
    it('reads the subscription id from the v22 parent path and marks past_due', async () => {
      const service = buildService();

      await service.handleInvoicePaymentFailed(
        invoiceWith({
          billing_reason: 'subscription_cycle',
          parent: {
            subscription_details: { subscription: 'sub_stripe_1' },
          },
        }),
        'test',
      );

      expect(subscriptionsService.findOne).toHaveBeenCalledWith({
        stripeSubscriptionId: 'sub_stripe_1',
      });
      expect(subscriptionsService.patch).toHaveBeenCalledWith('sub_db_1', {
        status: 'past_due',
      });
    });

    it('does not query subscriptions when the invoice carries no subscription id', async () => {
      const service = buildService();

      await service.handleInvoicePaymentFailed(invoiceWith({}), 'test');

      expect(subscriptionsService.findOne).not.toHaveBeenCalled();
    });
  });
});
