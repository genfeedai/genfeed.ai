import { UsersService } from '@api/collections/users/services/users.service';
import { StripeSubscriptionCreditReconcilerService } from '@api/endpoints/webhooks/stripe/handlers/stripe-subscription-credit-reconciler.service';
import { StripeSubscriptionWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-subscription-webhook.handler';
import { StripeWebhookSupportService } from '@api/endpoints/webhooks/stripe/handlers/stripe-webhook-support.service';
import { StripeWebhookBillingError } from '@api/endpoints/webhooks/stripe/stripe-webhook-billing.error';
import { StripeWebhookBillingService } from '@api/endpoints/webhooks/stripe/stripe-webhook-billing.service';
import type { StripeSubscription } from '@api/services/integrations/stripe/services/stripe.service';
import { LifecycleEmailService } from '@api/services/lifecycle-emails/lifecycle-email.service';
import {
  SubscriptionPlan,
  SubscriptionStatus,
  SubscriptionTier,
} from '@genfeedai/contracts';
import {
  type ISubscriptionOssReadModel,
  SUBSCRIPTIONS_SERVICE,
} from '@genfeedai/contracts/interfaces/billing';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('StripeSubscriptionWebhookHandler', () => {
  let handler: StripeSubscriptionWebhookHandler;

  const loggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const subscriptionsService = {
    findByStripeCustomerId: vi.fn(),
    findByOrganizationId: vi.fn(),
    findOne: vi.fn(),
    patch: vi.fn(),
    syncSubscriptionState: vi.fn(),
  };
  const usersService = { findOne: vi.fn() };
  const supportService = {
    invalidateUserCaches: vi.fn(),
    resolveSubscriptionPlan: vi.fn().mockReturnValue(SubscriptionPlan.MONTHLY),
    resolveTierFromPriceId: vi.fn().mockReturnValue(null),
    updateOrganizationTierAndModels: vi.fn(),
  };
  const lifecycleEmailService = {
    recordSubscriptionLapsed: vi.fn(),
  };
  const creditReconciler = { reconcile: vi.fn() };
  const billingService = { resolve: vi.fn(), persist: vi.fn() };

  function stripeSubscription(
    overrides: Record<string, unknown> = {},
  ): StripeSubscription {
    return {
      cancel_at_period_end: false,
      customer: 'cus_123',
      id: 'sub_stripe_1',
      items: {
        data: [
          {
            current_period_start: 1_747_321_600,
            current_period_end: 1_750_000_000,
            price: { id: 'price_1', recurring: { interval: 'month' } },
          },
        ],
      },
      status: 'active',
      ...overrides,
    } as unknown as StripeSubscription;
  }

  const dbSubscription = {
    cancelAtPeriodEnd: false,
    id: 'sub_db_1',
    isDeleted: false,
    organizationId: 'org_1',
    plan: SubscriptionPlan.MONTHLY,
    status: 'active',
    stripePriceId: 'price_1',
    userId: 'user_1',
  } satisfies ISubscriptionOssReadModel;

  beforeEach(async () => {
    vi.clearAllMocks();
    supportService.resolveSubscriptionPlan.mockReturnValue(
      SubscriptionPlan.MONTHLY,
    );
    supportService.resolveTierFromPriceId.mockReturnValue(null);
    billingService.resolve.mockResolvedValue({
      billingAccountId: 'ba_1',
      subscription: dbSubscription,
    });
    billingService.persist.mockResolvedValue(dbSubscription);
    subscriptionsService.findByOrganizationId.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeSubscriptionWebhookHandler,
        { provide: LoggerService, useValue: loggerService },
        { provide: SUBSCRIPTIONS_SERVICE, useValue: subscriptionsService },
        { provide: UsersService, useValue: usersService },
        { provide: StripeWebhookSupportService, useValue: supportService },
        { provide: LifecycleEmailService, useValue: lifecycleEmailService },
        {
          provide: StripeSubscriptionCreditReconcilerService,
          useValue: creditReconciler,
        },
        {
          provide: StripeWebhookBillingService,
          useValue: billingService,
        },
      ],
    }).compile();

    handler = module.get(StripeSubscriptionWebhookHandler);
  });

  describe('handleSubscriptionCreated', () => {
    it('patches the matching subscription and syncs its state', async () => {
      subscriptionsService.findByStripeCustomerId.mockResolvedValue(
        dbSubscription,
      );
      subscriptionsService.patch.mockResolvedValue(dbSubscription);

      await handler.handleSubscriptionCreated(stripeSubscription(), 'test');

      expect(billingService.persist).toHaveBeenCalledWith(
        { billingAccountId: 'ba_1', subscription: dbSubscription },
        expect.objectContaining({
          status: SubscriptionStatus.ACTIVE,
          stripePriceId: 'price_1',
          stripeSubscriptionId: 'sub_stripe_1',
          plan: SubscriptionPlan.MONTHLY,
        }),
      );
      expect(subscriptionsService.syncSubscriptionState).toHaveBeenCalledWith(
        dbSubscription,
        'sub_stripe_1',
        'price_1',
        'active',
      );
      expect(creditReconciler.reconcile).toHaveBeenCalledWith({
        billingAccountId: 'ba_1',
        billingReason: 'subscription_create',
        periodEnd: new Date(1_750_000_000 * 1000),
        periodStart: new Date(1_747_321_600 * 1000),
        stripeSubscriptionId: 'sub_stripe_1',
        subscription: expect.objectContaining({
          organizationId: 'org_1',
          plan: SubscriptionPlan.MONTHLY,
          stripePriceId: 'price_1',
        }),
        subscriptionStatus: 'active',
        trigger: 'customer.subscription.created',
        url: 'test',
      });
    });

    it('updates the org tier when the price maps to one', async () => {
      subscriptionsService.findByStripeCustomerId.mockResolvedValue(
        dbSubscription,
      );
      subscriptionsService.patch.mockResolvedValue(dbSubscription);
      supportService.resolveTierFromPriceId.mockReturnValue(
        SubscriptionTier.PRO,
      );

      await handler.handleSubscriptionCreated(stripeSubscription(), 'test');

      expect(
        supportService.updateOrganizationTierAndModels,
      ).toHaveBeenCalledWith('org_1', SubscriptionTier.PRO, 'test');
    });

    it('propagates classified identity errors without nested logs or side effects', async () => {
      billingService.resolve.mockRejectedValueOnce(
        new StripeWebhookBillingError('identity_missing'),
      );
      await expect(
        handler.handleSubscriptionCreated(stripeSubscription(), 'test'),
      ).rejects.toMatchObject({ code: 'identity_missing' });
      expect(billingService.persist).not.toHaveBeenCalled();
      expect(creditReconciler.reconcile).not.toHaveBeenCalled();
      expect(loggerService.warn).not.toHaveBeenCalled();
      expect(loggerService.error).not.toHaveBeenCalled();
    });

    it.each([
      { items: { data: [] } },
      { items: { data: [{ price: { id: '' } }] } },
      { status: 'future_status' },
      {
        items: {
          data: [{ price: { id: 'price_1' }, current_period_end: Infinity }],
        },
      },
      {
        items: {
          data: [{ price: { id: 'price_1' }, current_period_start: 1e30 }],
        },
      },
    ])(
      'rejects invalid subscription payload before writes: %j',
      async (payload) => {
        await expect(
          handler.handleSubscriptionCreated(
            stripeSubscription(payload),
            'test',
          ),
        ).rejects.toMatchObject({ code: 'invalid_payload' });
        expect(billingService.persist).not.toHaveBeenCalled();
        expect(
          subscriptionsService.syncSubscriptionState,
        ).not.toHaveBeenCalled();
        expect(creditReconciler.reconcile).not.toHaveBeenCalled();
        expect(
          supportService.updateOrganizationTierAndModels,
        ).not.toHaveBeenCalled();
      },
    );

    it('treats a null period boundary as absent instead of rejecting the payload', async () => {
      await handler.handleSubscriptionCreated(
        stripeSubscription({
          items: {
            data: [
              {
                price: { id: 'price_1' },
                current_period_start: null,
                current_period_end: 1_750_000_000,
              },
            ],
          },
        }),
        'test',
      );

      expect(billingService.persist).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          currentPeriodStart: undefined,
          currentPeriodEnd: new Date(1_750_000_000 * 1000),
        }),
      );
      const input = creditReconciler.reconcile.mock.calls[0][0];
      expect(input).toMatchObject({
        billingAccountId: 'ba_1',
        periodEnd: new Date(1_750_000_000 * 1000),
      });
      expect(input).not.toHaveProperty('periodStart');
    });

    it('persists timestamp zero as the Unix epoch', async () => {
      await handler.handleSubscriptionCreated(
        stripeSubscription({
          items: {
            data: [
              {
                price: { id: 'price_1' },
                current_period_start: 0,
                current_period_end: 0,
              },
            ],
          },
        }),
        'test',
      );
      expect(billingService.persist).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          currentPeriodStart: new Date(0),
          currentPeriodEnd: new Date(0),
        }),
      );
      expect(creditReconciler.reconcile).toHaveBeenCalledWith(
        expect.objectContaining({
          periodStart: new Date(0),
          periodEnd: new Date(0),
        }),
      );
    });

    it('propagates reconciliation failures so Stripe can retry the event', async () => {
      const reconciliationError = new Error('credit ledger unavailable');
      subscriptionsService.findByStripeCustomerId.mockResolvedValue(
        dbSubscription,
      );
      subscriptionsService.patch.mockResolvedValue(dbSubscription);
      creditReconciler.reconcile.mockRejectedValueOnce(reconciliationError);

      await expect(
        handler.handleSubscriptionCreated(stripeSubscription(), 'test'),
      ).rejects.toBe(reconciliationError);

      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('failed to handle subscription created'),
        { category: 'reconciliation_failed' },
      );
    });
  });

  describe('handleSubscriptionUpdated', () => {
    it('patches the subscription and invalidates the user caches', async () => {
      subscriptionsService.findOne.mockResolvedValue(dbSubscription);
      subscriptionsService.patch.mockResolvedValue(dbSubscription);
      usersService.findOne.mockResolvedValue({ id: 'user_1' });
      supportService.resolveTierFromPriceId.mockReturnValue(
        SubscriptionTier.PRO,
      );

      await handler.handleSubscriptionUpdated(stripeSubscription(), 'test');

      expect(subscriptionsService.patch).toHaveBeenCalledWith(
        'sub_db_1',
        expect.objectContaining({ status: SubscriptionStatus.ACTIVE }),
      );
      expect(usersService.findOne).toHaveBeenCalledWith({
        id: 'user_1',
      });
      expect(
        supportService.updateOrganizationTierAndModels,
      ).toHaveBeenCalledWith('org_1', SubscriptionTier.PRO, 'test');
      expect(supportService.invalidateUserCaches).toHaveBeenCalledWith(
        'user_1',
      );
      expect(
        supportService.updateOrganizationTierAndModels.mock
          .invocationCallOrder[0],
      ).toBeLessThan(
        supportService.invalidateUserCaches.mock.invocationCallOrder[0],
      );
    });

    it('warns when the subscription is unknown', async () => {
      subscriptionsService.findOne.mockResolvedValue(null);

      await handler.handleSubscriptionUpdated(stripeSubscription(), 'test');

      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('subscription not found for update'),
        { stripeSubscriptionId: 'sub_stripe_1' },
      );
      expect(subscriptionsService.patch).not.toHaveBeenCalled();
    });
  });

  describe('handleSubscriptionDeleted', () => {
    it('soft-deletes, keeps the credit balance, and resets the tier to BYOK', async () => {
      subscriptionsService.findOne.mockResolvedValue(dbSubscription);
      subscriptionsService.patch.mockResolvedValue(dbSubscription);
      usersService.findOne.mockResolvedValue({ id: 'user_1' });

      await handler.handleSubscriptionDeleted(
        stripeSubscription({ cancel_at_period_end: false }),
        'test',
      );

      expect(subscriptionsService.patch).toHaveBeenCalledWith('sub_db_1', {
        cancelAtPeriodEnd: false,
        isDeleted: true,
        status: SubscriptionStatus.CANCELLED,
      });
      expect(
        supportService.updateOrganizationTierAndModels,
      ).toHaveBeenCalledWith('org_1', SubscriptionTier.BYOK, 'test');
      expect(usersService.findOne).toHaveBeenCalledWith({
        id: 'user_1',
      });
      expect(supportService.invalidateUserCaches).toHaveBeenCalledWith(
        'user_1',
      );
      expect(
        lifecycleEmailService.recordSubscriptionLapsed,
      ).toHaveBeenCalledWith({
        organizationId: 'org_1',
        subscriptionId: 'sub_stripe_1',
        userId: 'user_1',
      });
      expect(
        supportService.updateOrganizationTierAndModels.mock
          .invocationCallOrder[0],
      ).toBeLessThan(
        supportService.invalidateUserCaches.mock.invocationCallOrder[0],
      );
    });

    it('keeps deletion successful when lifecycle recording fails', async () => {
      subscriptionsService.findOne.mockResolvedValue(dbSubscription);
      subscriptionsService.patch.mockResolvedValue(dbSubscription);
      usersService.findOne.mockResolvedValue({ id: 'user_1' });
      lifecycleEmailService.recordSubscriptionLapsed.mockRejectedValueOnce(
        new Error('lifecycle unavailable'),
      );

      await handler.handleSubscriptionDeleted(stripeSubscription(), 'test');

      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'lifecycle email subscription-lapsed recording skipped',
        ),
        {
          error: 'lifecycle unavailable',
          subscriptionId: 'sub_stripe_1',
        },
      );
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('subscription deleted successfully'),
        {
          organizationId: 'org_1',
          stripeSubscriptionId: 'sub_stripe_1',
        },
      );
      expect(loggerService.error).not.toHaveBeenCalledWith(
        expect.stringContaining('failed to handle subscription deleted'),
        expect.anything(),
      );
    });

    it('warns when the subscription is unknown', async () => {
      subscriptionsService.findOne.mockResolvedValue(null);

      await handler.handleSubscriptionDeleted(stripeSubscription(), 'test');

      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('subscription not found for deletion'),
        { stripeSubscriptionId: 'sub_stripe_1' },
      );
      expect(subscriptionsService.patch).not.toHaveBeenCalled();
    });
  });
});
