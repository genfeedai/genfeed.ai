import { BETTER_AUTH_USER_CREATED_EVENT } from '@api/auth/better-auth/better-auth.constants';
import { StripeWebhookService } from '@api/endpoints/webhooks/stripe/webhooks.stripe.service';
import type { ManagedCheckoutResult } from '@api/services/integrations/stripe/services/managed-stripe-checkout.service';
import type Stripe from 'stripe';

type InvoiceHandlerAccessor = {
  handleInvoicePaid(invoice: Stripe.Invoice, url: string): Promise<void>;
  handleInvoicePaymentFailed(
    invoice: Stripe.Invoice,
    url: string,
  ): Promise<void>;
};

type ProvisionAccessor = {
  provisionManagedCheckoutAccount(
    session: unknown,
    email: string,
    url: string,
  ): Promise<ManagedCheckoutResult>;
};

describe('StripeWebhookService', () => {
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
  const apiKeysService = {
    createWithKey: vi.fn(),
    findOne: vi.fn(),
    patch: vi.fn(),
  };
  const brandsService = { findOne: vi.fn() };
  const usersService = { create: vi.fn(), findOne: vi.fn(), patch: vi.fn() };
  const organizationsService = { findOne: vi.fn() };
  const organizationSettingsService = { findOne: vi.fn(), patch: vi.fn() };
  const accessBootstrapCacheService = { invalidateForUser: vi.fn() };
  const userSetupService = { initializeUserResources: vi.fn() };
  const eventEmitter = { emitAsync: vi.fn() };

  function buildService(): InvoiceHandlerAccessor & ProvisionAccessor {
    return new StripeWebhookService(
      configService as never,
      loggerService as never,
      apiKeysService as never,
      brandsService as never,
      subscriptionsService as never,
      creditsUtilsService as never,
      activitiesService as never,
      usersService as never,
      {} as never, // stripeService
      {} as never, // managedStripeCheckoutService
      organizationsService as never,
      {} as never, // subscriptionAttributionsService
      {} as never, // userSubscriptionsService
      organizationSettingsService as never,
      {} as never, // prisma
      {} as never, // requestContextCacheService
      accessBootstrapCacheService as never,
      userSetupService as never,
      eventEmitter as never,
    ) as unknown as InvoiceHandlerAccessor & ProvisionAccessor;
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

  describe('provisionManagedCheckoutAccount', () => {
    const email = 'ada@example.com';
    const session = {
      customer: 'cus_123',
      id: 'cs_test_1',
      metadata: { credits: '100', firstName: 'Ada', lastName: 'Lovelace' },
    };

    beforeEach(() => {
      organizationsService.findOne.mockResolvedValue({ _id: 'org_1' });
      brandsService.findOne.mockResolvedValue({ _id: 'brand_1' });
      organizationSettingsService.findOne.mockResolvedValue({ _id: 'os_1' });
      organizationSettingsService.patch.mockResolvedValue({});
      creditsUtilsService.addOrganizationCreditsWithExpiration.mockResolvedValue(
        undefined,
      );
      apiKeysService.findOne.mockResolvedValue({ id: 'key_1', scopes: [] });
      apiKeysService.patch.mockResolvedValue({});
      usersService.patch.mockResolvedValue({});
      activitiesService.create.mockResolvedValue({});
      accessBootstrapCacheService.invalidateForUser.mockResolvedValue(
        undefined,
      );
      eventEmitter.emitAsync.mockResolvedValue([]);
    });

    it('creates a clerkId-free user, mints a managed key, and emits better-auth.user.created for a net-new buyer', async () => {
      usersService.findOne.mockResolvedValue(null);
      usersService.create.mockResolvedValue({
        _id: 'user_new_1',
        isOnboardingCompleted: false,
        onboardingStepsCompleted: [],
      });
      // A net-new buyer has no managed key yet → the createWithKey path runs.
      apiKeysService.findOne.mockResolvedValue(null);
      apiKeysService.createWithKey.mockResolvedValue({
        plainKey: 'gf_managed',
      });
      const service = buildService();

      await service.provisionManagedCheckoutAccount(
        session as never,
        email,
        'test',
      );

      expect(usersService.findOne).toHaveBeenCalledWith({
        email,
        isDeleted: false,
      });
      expect(usersService.create).toHaveBeenCalledTimes(1);
      const createArg = usersService.create.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(createArg.email).toBe(email);
      expect(createArg.clerkId).toBeUndefined();
      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
        BETTER_AUTH_USER_CREATED_EVENT,
        { email, userId: 'user_new_1' },
      );
      expect(apiKeysService.createWithKey).toHaveBeenCalledTimes(1);
    });

    it('reactivates a soft-deleted user when email creation hits a unique constraint race', async () => {
      usersService.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
        _id: 'user_deleted_1',
        isDeleted: true,
        isOnboardingCompleted: false,
        onboardingStepsCompleted: [],
      });
      usersService.create.mockRejectedValueOnce({ code: 'P2002' });
      usersService.patch
        .mockResolvedValueOnce({
          _id: 'user_deleted_1',
          isDeleted: false,
          isOnboardingCompleted: false,
          onboardingStepsCompleted: [],
        })
        .mockResolvedValueOnce({});
      const service = buildService();

      await service.provisionManagedCheckoutAccount(
        session as never,
        email,
        'test',
      );

      expect(usersService.findOne).toHaveBeenNthCalledWith(1, {
        email,
        isDeleted: false,
      });
      expect(usersService.findOne).toHaveBeenNthCalledWith(2, { email }, []);
      expect(usersService.patch).toHaveBeenNthCalledWith(1, 'user_deleted_1', {
        isDeleted: false,
      });
      expect(eventEmitter.emitAsync).not.toHaveBeenCalled();
      expect(
        creditsUtilsService.addOrganizationCreditsWithExpiration,
      ).toHaveBeenCalled();
    });

    it('reuses an existing user by email, skips provisioning, but still tops up credits for a returning buyer', async () => {
      usersService.findOne.mockResolvedValue({
        _id: 'user_existing_1',
        isOnboardingCompleted: true,
        onboardingStepsCompleted: ['brand', 'plan'],
      });
      const service = buildService();

      await service.provisionManagedCheckoutAccount(
        session as never,
        email,
        'test',
      );

      expect(usersService.findOne).toHaveBeenCalledWith({
        email,
        isDeleted: false,
      });
      expect(usersService.create).not.toHaveBeenCalled();
      expect(eventEmitter.emitAsync).not.toHaveBeenCalled();
      // Resources already exist, so the defensive setup fallback never fires …
      expect(userSetupService.initializeUserResources).not.toHaveBeenCalled();
      // … but the purchased credits are still granted.
      expect(
        creditsUtilsService.addOrganizationCreditsWithExpiration,
      ).toHaveBeenCalled();
    });
  });
});
