import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { StripeSubscriptionWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-subscription-webhook.handler';
import { StripeWebhookSupportService } from '@api/endpoints/webhooks/stripe/handlers/stripe-webhook-support.service';
import type { StripeSubscription } from '@api/services/integrations/stripe/services/stripe.service';
import { LifecycleEmailService } from '@api/services/lifecycle-emails/lifecycle-email.service';
import { SubscriptionPlan, SubscriptionTier } from '@genfeedai/enums';
import { SUBSCRIPTIONS_SERVICE } from '@genfeedai/interfaces/billing';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('StripeSubscriptionWebhookHandler', () => {
  let handler: StripeSubscriptionWebhookHandler;

  const loggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const subscriptionsService = {
    findByStripeCustomerId: vi.fn(),
    findOne: vi.fn(),
    patch: vi.fn(),
    syncSubscriptionState: vi.fn(),
  };
  const creditsUtilsService = { removeAllOrganizationCredits: vi.fn() };
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
    id: 'sub_db_1',
    organization: 'org_1',
    user: 'user_1',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    supportService.resolveSubscriptionPlan.mockReturnValue(
      SubscriptionPlan.MONTHLY,
    );
    supportService.resolveTierFromPriceId.mockReturnValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeSubscriptionWebhookHandler,
        { provide: LoggerService, useValue: loggerService },
        { provide: SUBSCRIPTIONS_SERVICE, useValue: subscriptionsService },
        { provide: CreditsUtilsService, useValue: creditsUtilsService },
        { provide: UsersService, useValue: usersService },
        { provide: StripeWebhookSupportService, useValue: supportService },
        { provide: LifecycleEmailService, useValue: lifecycleEmailService },
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

      expect(subscriptionsService.patch).toHaveBeenCalledWith(
        'sub_db_1',
        expect.objectContaining({
          status: 'active',
          stripePriceId: 'price_1',
          stripeSubscriptionId: 'sub_stripe_1',
          type: SubscriptionPlan.MONTHLY,
        }),
      );
      expect(subscriptionsService.syncSubscriptionState).toHaveBeenCalledWith(
        dbSubscription,
        'sub_stripe_1',
        'price_1',
        'active',
      );
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

    it('warns and patches nothing when no subscription matches the customer', async () => {
      subscriptionsService.findByStripeCustomerId.mockResolvedValue(null);

      await handler.handleSubscriptionCreated(stripeSubscription(), 'test');

      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('subscription not found for customer'),
        expect.objectContaining({ customerId: 'cus_123' }),
      );
      expect(subscriptionsService.patch).not.toHaveBeenCalled();
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
        expect.objectContaining({ status: 'active' }),
      );
      expect(usersService.findOne).toHaveBeenCalledWith({
        id: 'user_1',
        isDeleted: false,
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
    it('soft-deletes, removes credits on immediate cancellation, and resets the tier to BYOK', async () => {
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
        status: 'canceled',
      });
      expect(
        creditsUtilsService.removeAllOrganizationCredits,
      ).toHaveBeenCalledWith(
        'org_1',
        'subscription_canceled',
        expect.any(String),
      );
      expect(
        supportService.updateOrganizationTierAndModels,
      ).toHaveBeenCalledWith('org_1', SubscriptionTier.BYOK, 'test');
      expect(usersService.findOne).toHaveBeenCalledWith({
        id: 'user_1',
        isDeleted: false,
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

    it('keeps credits when the subscription cancels at period end', async () => {
      subscriptionsService.findOne.mockResolvedValue(dbSubscription);
      subscriptionsService.patch.mockResolvedValue(dbSubscription);
      usersService.findOne.mockResolvedValue({ id: 'user_1' });

      await handler.handleSubscriptionDeleted(
        stripeSubscription({ cancel_at_period_end: true }),
        'test',
      );

      expect(
        creditsUtilsService.removeAllOrganizationCredits,
      ).not.toHaveBeenCalled();
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
